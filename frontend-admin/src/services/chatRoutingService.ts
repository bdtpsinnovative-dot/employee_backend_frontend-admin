import { supabase } from '../lib/supabase';
import type { ChatRoutingGroup, ChatAccessUser, User, ChatConversation, ChatSystemConfig } from '../types';

export const BRAND_OPTIONS = [
  { slug: 'all', label: '🌐 ทุกแบรนด์ (กลุ่มรวม / ค่าเริ่มต้น)' },
  { slug: 'wallcraft', label: 'Wallcraft Thailand' },
  { slug: 'terra', label: 'Terra Home Studio' },
  { slug: 'zenslab', label: 'ZenSlab Official' },
  { slug: 'ember_and_ash', label: 'Ember & Ash Living' },
];

// 1. Routing Groups
export async function fetchChatRoutingGroups(): Promise<ChatRoutingGroup[]> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'chat_routing_groups')
      .maybeSingle();

    if (error) throw error;
    if (!data?.value) return [];
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch (err) {
    console.error('fetchChatRoutingGroups error:', err);
    return [];
  }
}

export async function saveChatRoutingGroups(groups: ChatRoutingGroup[]): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'chat_routing_groups',
        value: JSON.stringify(groups),
      }, { onConflict: 'key' });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('saveChatRoutingGroups error:', err);
    return false;
  }
}

// 2. Chat Access Users (Whitelist)
export async function fetchChatAccessUsers(): Promise<ChatAccessUser[]> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'chat_access_users')
      .maybeSingle();

    if (error) throw error;
    if (!data?.value) return [];
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch (err) {
    console.error('fetchChatAccessUsers error:', err);
    return [];
  }
}

export async function saveChatAccessUsers(accessUsers: ChatAccessUser[]): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'chat_access_users',
        value: JSON.stringify(accessUsers),
      }, { onConflict: 'key' });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('saveChatAccessUsers error:', err);
    return false;
  }
}

// Check if a user has access to Chat Inbox
export function hasChatAccess(
  currentUser: User | null,
  accessUsers: ChatAccessUser[],
  routingGroups?: ChatRoutingGroup[]
): boolean {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true; // Super admins always have access

  // 1. Direct whitelist
  const entry = accessUsers.find(
    (u) => u.user_id === currentUser.id || (currentUser.auth_id && u.user_id === currentUser.auth_id)
  );
  if (entry && entry.is_enabled) return true;

  // 2. Member of any active routing group (Auto-granted)
  if (routingGroups && Array.isArray(routingGroups)) {
    const isGroupMember = routingGroups.some(
      (g) =>
        g.is_active &&
        (g.agent_ids || []).some((id) => id === currentUser.id || id === currentUser.auth_id)
    );
    if (isGroupMember) return true;
  }

  return false;
}

// 3. Assign a single conversation (supports single agent, multiple agents, or entire care group)
export async function assignConversation(
  conversationId: string,
  agent: {
    id: string | null;
    name?: string | null;
    avatar?: string | null;
    groupId?: string | null;
    groupName?: string | null;
    assignedAgentIds?: string[];
  }
): Promise<boolean> {
  try {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .maybeSingle();

    const nextAgentIds =
      agent.assignedAgentIds !== undefined
        ? agent.assignedAgentIds
        : agent.id
        ? [agent.id]
        : [];

    const nextMetadata = {
      ...(conv?.metadata || {}),
      assigned_name: agent.name ?? null,
      assigned_group_id: agent.groupId ?? (nextAgentIds.length > 0 ? null : conv?.metadata?.assigned_group_id ?? null),
      assigned_group_name: agent.groupName ?? (nextAgentIds.length > 0 ? null : conv?.metadata?.assigned_group_name ?? null),
      assigned_agent_ids: nextAgentIds,
    };

    const primaryAgentId = agent.id || (nextAgentIds.length > 0 ? nextAgentIds[0] : null);

    const updateData: any = {
      assigned_to: primaryAgentId,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('chat_conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('assignConversation error:', err);
    return false;
  }
}

// 4. Randomize, round-robin, or shared team assignment from routing group with weights & quotas
export function pickAgentFromGroup(
  group: ChatRoutingGroup,
  availableUsers: User[],
  systemConfig?: ChatSystemConfig
): {
  agentId: string;
  updatedGroup: ChatRoutingGroup;
  assignedAgentIds: string[];
  isShared: boolean;
} | null {
  if (!group || !group.agent_ids || group.agent_ids.length === 0) return null;

  // Filter to valid active users
  const validIds = group.agent_ids.filter((id) => availableUsers.some((u) => u.id === id));
  if (validIds.length === 0) return null;

  // Filter out agents who are paused in systemConfig
  const unpausedIds = validIds.filter(
    (id) => !(systemConfig?.agent_weights?.[id]?.is_paused)
  );
  const eligibleIds = unpausedIds.length > 0 ? unpausedIds : validIds;

  const updatedGroup = { ...group };
  let selectedId = eligibleIds[0];
  let assignedAgentIds: string[] = eligibleIds;
  const isShared = group.mode === 'shared';

  if (group.mode === 'shared') {
    // 👥 Shared Care: All or N agents in the group care for the customer together!
    if (group.agents_per_customer && typeof group.agents_per_customer === 'number' && group.agents_per_customer > 0) {
      assignedAgentIds = eligibleIds.slice(0, group.agents_per_customer);
    } else {
      assignedAgentIds = eligibleIds;
    }
    selectedId = assignedAgentIds[0];
  } else if (group.mode === 'random') {
    // ⚖️ Weighted random calculation based on agent_weights
    if (systemConfig?.agent_weights) {
      const weights = eligibleIds.map((id) => Math.max(1, systemConfig.agent_weights?.[id]?.weight ?? 1));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let rand = Math.random() * totalWeight;
      for (let i = 0; i < eligibleIds.length; i++) {
        if (rand < weights[i]) {
          selectedId = eligibleIds[i];
          break;
        }
        rand -= weights[i];
      }
    } else {
      const randomIndex = Math.floor(Math.random() * eligibleIds.length);
      selectedId = eligibleIds[randomIndex];
    }
    assignedAgentIds = [selectedId];
  } else {
    // Round-robin
    const lastIdx = group.last_assigned_index ?? -1;
    const nextIdx = (lastIdx + 1) % eligibleIds.length;
    selectedId = eligibleIds[nextIdx];
    updatedGroup.last_assigned_index = nextIdx;
    assignedAgentIds = [selectedId];
  }

  return { agentId: selectedId, updatedGroup, assignedAgentIds, isShared };
}

// 5. Bulk Auto-assign / Distribute all unassigned conversations (respects working hours & weights)
export async function autoAssignConversations(
  conversations: ChatConversation[],
  groups: ChatRoutingGroup[],
  users: User[]
): Promise<{ assignedCount: number; updatedGroups: ChatRoutingGroup[] }> {
  const activeGroups = groups.filter((g) => g.is_active && g.agent_ids.length > 0);
  if (activeGroups.length === 0) return { assignedCount: 0, updatedGroups: groups };

  const systemConfig = await fetchChatSystemConfig();

  // If auto-routing is disabled in system config, skip
  if (!systemConfig.auto_routing_enabled) {
    return { assignedCount: 0, updatedGroups: groups };
  }

  // Check working hours if restricted
  if (systemConfig.routing_working_hours_only) {
    const now = new Date();
    const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const start = systemConfig.working_hours_start || '08:30';
    const end = systemConfig.working_hours_end || '18:00';
    if (currentHourMin < start || currentHourMin > end) {
      console.log('Outside working hours for auto-routing, skipping.');
      return { assignedCount: 0, updatedGroups: groups };
    }
  }

  let currentGroups = [...groups];
  let assignedCount = 0;

  for (const conv of conversations) {
    if (conv.assigned_to) continue; // Already assigned

    // Find group for this conversation's brand
    const brand = (conv.brand || '').toLowerCase().trim();
    let group = currentGroups.find(
      (g) => g.is_active && g.brand.toLowerCase() === brand && g.agent_ids.length > 0
    );
    if (!group) {
      group = currentGroups.find((g) => g.is_active && g.brand === 'all' && g.agent_ids.length > 0);
    }

    if (!group) {
      // Fallback agent
      if (systemConfig.default_fallback_agent_id) {
        const fallbackUser = users.find((u) => u.id === systemConfig.default_fallback_agent_id);
        if (fallbackUser) {
          const success = await assignConversation(conv.id, {
            id: fallbackUser.id,
            name: fallbackUser.nickname || fallbackUser.first_name,
            avatar: fallbackUser.avatar_url,
          });
          if (success) assignedCount++;
        }
      }
      continue;
    }

    const pick = pickAgentFromGroup(group, users, systemConfig);
    if (!pick) continue;

    // Update group state in our local tracking
    currentGroups = currentGroups.map((g) => (g.id === pick.updatedGroup.id ? pick.updatedGroup : g));

    const userObj = users.find((u) => u.id === pick.agentId);
    const agentName = userObj ? userObj.nickname || userObj.first_name : 'แอดมิน';

    const displayName = pick.isShared ? `กลุ่ม: ${group.name}` : agentName;

    const success = await assignConversation(conv.id, {
      id: pick.agentId,
      name: displayName,
      avatar: userObj?.avatar_url,
      groupId: group.id,
      groupName: group.name,
      assignedAgentIds: pick.assignedAgentIds,
    });

    if (success) {
      assignedCount++;
    }
  }

  if (assignedCount > 0) {
    await saveChatRoutingGroups(currentGroups);
  }

  return { assignedCount, updatedGroups: currentGroups };
}

// 6. Chat System Configuration & Policy
export const DEFAULT_CHAT_SYSTEM_CONFIG: ChatSystemConfig = {
  reply_policy: 'everyone',
  auto_assign_first_responder: true,
  auto_routing_enabled: true,
  routing_working_hours_only: false,
  working_hours_start: '08:30',
  working_hours_end: '18:00',
  default_fallback_agent_id: null,
  agent_weights: {},
};

export async function fetchChatSystemConfig(): Promise<ChatSystemConfig> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'chat_system_config')
      .maybeSingle();

    if (error) throw error;
    if (!data?.value) return DEFAULT_CHAT_SYSTEM_CONFIG;
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return { ...DEFAULT_CHAT_SYSTEM_CONFIG, ...parsed };
  } catch (err) {
    console.error('fetchChatSystemConfig error:', err);
    return DEFAULT_CHAT_SYSTEM_CONFIG;
  }
}

export async function saveChatSystemConfig(config: ChatSystemConfig): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          key: 'chat_system_config',
          value: JSON.stringify(config),
        },
        { onConflict: 'key' }
      );

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('saveChatSystemConfig error:', err);
    return false;
  }
}
