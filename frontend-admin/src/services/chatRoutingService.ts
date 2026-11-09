import { supabase } from '../lib/supabase';
import type { ChatRoutingGroup, ChatAccessUser, User, ChatConversation } from '../types';

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
export function hasChatAccess(currentUser: User | null, accessUsers: ChatAccessUser[]): boolean {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true; // Super admins always have access
  const entry = accessUsers.find((u) => u.user_id === currentUser.id);
  return Boolean(entry && entry.is_enabled);
}

// 3. Assign a single conversation
export async function assignConversation(
  conversationId: string,
  agent: { id: string | null; name?: string; avatar?: string }
): Promise<boolean> {
  try {
    const updateData: any = {
      assigned_to: agent.id,
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

// 4. Randomize or pick next agent from routing group
export function pickAgentFromGroup(
  group: ChatRoutingGroup,
  availableUsers: User[]
): { agentId: string; updatedGroup: ChatRoutingGroup } | null {
  if (!group || !group.agent_ids || group.agent_ids.length === 0) return null;

  // Filter to valid active users
  const validIds = group.agent_ids.filter((id) => availableUsers.some((u) => u.id === id));
  if (validIds.length === 0) return null;

  let selectedId = '';
  const updatedGroup = { ...group };

  if (group.mode === 'random') {
    const randomIndex = Math.floor(Math.random() * validIds.length);
    selectedId = validIds[randomIndex];
  } else {
    // Round-robin
    const lastIdx = group.last_assigned_index ?? -1;
    const nextIdx = (lastIdx + 1) % validIds.length;
    selectedId = validIds[nextIdx];
    updatedGroup.last_assigned_index = nextIdx;
  }

  return { agentId: selectedId, updatedGroup };
}

// 5. Bulk Auto-assign / Randomize all unassigned conversations
export async function autoAssignConversations(
  conversations: ChatConversation[],
  groups: ChatRoutingGroup[],
  users: User[]
): Promise<{ assignedCount: number; updatedGroups: ChatRoutingGroup[] }> {
  const activeGroups = groups.filter((g) => g.is_active && g.agent_ids.length > 0);
  if (activeGroups.length === 0) return { assignedCount: 0, updatedGroups: groups };

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
    if (!group) continue;

    const pick = pickAgentFromGroup(group, users);
    if (!pick) continue;

    // Update group state in our local tracking
    currentGroups = currentGroups.map((g) => (g.id === pick.updatedGroup.id ? pick.updatedGroup : g));

    const userObj = users.find((u) => u.id === pick.agentId);
    const agentName = userObj ? userObj.nickname || userObj.first_name : 'แอดมิน';

    const success = await assignConversation(conv.id, {
      id: pick.agentId,
      name: agentName,
      avatar: userObj?.avatar_url,
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
