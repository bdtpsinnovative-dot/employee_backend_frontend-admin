import { supabase } from '../lib/supabase';
import type { ChatRoutingGroup, ChatCareGroup, ChatAccessUser, ChatChannel, User, ChatConversation, ChatSystemConfig, AgentWeightConfig } from '../types';

export const BRAND_OPTIONS = [
  { slug: 'all', label: '🌐 ทุกแบรนด์ (กลุ่มรวม / ค่าเริ่มต้น)' },
  { slug: 'wallcraft', label: 'Wallcraft Thailand' },
  { slug: 'terra', label: 'Terra Home Studio' },
  { slug: 'zenslab', label: 'ZenSlab Official' },
  { slug: 'ember_and_ash', label: 'Ember & Ash Living' },
];

export interface ChatBrandOption {
  slug: string;
  label: string;
  shortLabel: string;
  bg: string;
  logo: string | null;
}

const DEFAULT_BRAND_STYLES: Record<string, { label: string; shortLabel: string; bg: string }> = {
  terrahome: { label: 'Terra Home Studio', shortLabel: 'TERRA', bg: '#B45309' },
  zenslab: { label: 'Zenslab by Woodden', shortLabel: 'ZENSLAB', bg: '#065F46' },
  emberandash: { label: 'Ember and Ash', shortLabel: 'EMBER', bg: '#9A3412' },
  wallcraft: { label: 'Wallcraft Thailand', shortLabel: 'WALLCRAFT', bg: '#1E3A8A' },
};

// Build distinct normalized brand options dynamically from chat_channels (plus defaults when empty)
export function getChannelBrandOptions(channels: ChatChannel[]): ChatBrandOption[] {
  const map = new Map<string, ChatBrandOption>();

  channels.forEach((ch) => {
    const slug = normalizeBrandSlug(ch.brand_slug);
    if (!slug || map.has(slug)) return;
    const preset = DEFAULT_BRAND_STYLES[slug];
    map.set(slug, {
      slug,
      label: ch.brand_name || preset?.label || slug.toUpperCase(),
      shortLabel: preset?.shortLabel || ch.brand_name?.slice(0, 10) || slug.toUpperCase(),
      bg: preset?.bg || '#374151',
      logo: ch.brand_logo || null,
    });
  });

  if (map.size === 0) {
    Object.entries(DEFAULT_BRAND_STYLES).forEach(([slug, style]) => {
      map.set(slug, { slug, label: style.label, shortLabel: style.shortLabel, bg: style.bg, logo: null });
    });
  }

  return Array.from(map.values());
}

// Check whether an agent or care group is permitted to handle a conversation's brand
export function isBrandAllowed(allowedBrands: string[] | undefined | null, brand?: string | null): boolean {
  if (!allowedBrands || allowedBrands.length === 0) return true;
  if (allowedBrands.some((b) => b.toLowerCase().trim() === 'all')) return true;
  const target = normalizeBrandSlug(brand);
  if (!target) return false;
  return allowedBrands.some((b) => normalizeBrandSlug(b) === target);
}

// Helper: Normalize brand slug consistently across groups, channels, and conversations
export function normalizeBrandSlug(brand?: string | null): string {
  const cleaned = (brand || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (cleaned === 'terra' || cleaned === 'terrahome') return 'terrahome';
  if (cleaned === 'ember' || cleaned === 'emberandash' || cleaned === 'emberandashliving') return 'emberandash';
  return cleaned;
}

// Helper: Check whether a conversation is already assigned to any caretaker
export function isConversationAssigned(conv?: Partial<ChatConversation> | null): boolean {
  if (!conv) return false;
  if (conv.assigned_to) return true;
  const meta = conv.metadata || {};
  if (Array.isArray(meta.assigned_agent_ids) && meta.assigned_agent_ids.filter(Boolean).length > 0) return true;
  if (Array.isArray(meta.assigned_agents) && meta.assigned_agents.filter(Boolean).length > 0) return true;
  return false;
}

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
      .upsert(
        {
          key: 'chat_routing_groups',
          value: JSON.stringify(groups),
        },
        { onConflict: 'key' }
      );

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('saveChatRoutingGroups error:', err);
    return false;
  }
}

// 1B. Chat Care Groups (Customer + Multiple Caretakers Team Groups)
export async function fetchChatCareGroups(): Promise<ChatCareGroup[]> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'chat_care_groups')
      .maybeSingle();

    if (error) throw error;
    if (!data?.value) return [];
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch (err) {
    console.error('fetchChatCareGroups error:', err);
    return [];
  }
}

export async function saveChatCareGroups(groups: ChatCareGroup[]): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          key: 'chat_care_groups',
          value: JSON.stringify(groups),
        },
        { onConflict: 'key' }
      );

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('saveChatCareGroups error:', err);
    return false;
  }
}

export function haveSameAgentSet(a: string[], b: string[]): boolean {
  const sa = Array.from(new Set(a.filter(Boolean))).sort();
  const sb = Array.from(new Set(b.filter(Boolean))).sort();
  return sa.length === sb.length && sa.every((id, idx) => id === sb[idx]);
}

export interface DetectedAutoCareGroup {
  id: string;
  defaultName: string;
  agentIds: string[];
  customerIds: string[];
}

export function getConversationAgentIds(
  conv?: { assigned_to?: string | null; metadata?: Record<string, any> } | null
): string[] {
  if (!conv) return [];
  const ids = new Set<string>();
  if (Array.isArray(conv.metadata?.assigned_agent_ids)) {
    conv.metadata.assigned_agent_ids.forEach((id: string) => {
      if (id) ids.add(id);
    });
  }
  if (conv.assigned_to) {
    ids.add(conv.assigned_to);
  }
  return Array.from(ids);
}

export function buildAutoCareGroupId(agentIds: string[]): string {
  const sorted = Array.from(new Set(agentIds.filter(Boolean))).sort();
  return `cgrp_auto_${sorted.join('__')}`;
}

export function buildAutoGroupDefaultName(agentIds: string[], users: User[]): string {
  const names = agentIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u)
    .map((u) => u.first_name || u.nickname || 'เซลล์');
  return names.length > 0 ? `กลุ่มออโต้ (${names.join(', ')})` : 'กลุ่มออโต้';
}

type AutoGroupConvInput = { id: string; assigned_to?: string | null; metadata?: Record<string, any> };

// Detect multi-caretaker teams (>1 agent) from conversations not already saved as care groups
export function detectAutoCareGroups(
  conversations: AutoGroupConvInput[],
  existingCareGroups: ChatCareGroup[],
  users: User[]
): {
  unsavedAutoGroups: DetectedAutoCareGroup[];
  extraCustomersBySavedAutoGroupId: Record<string, string[]>;
  adhocGroups: Array<{ id: string; name: string; customerIds: string[]; agentIds: string[] }>;
} {
  const coveredConvIds = new Set<string>();

  existingCareGroups.forEach((grp) => {
    conversations.forEach((c) => {
      const liveGid = c.metadata?.assigned_group_id;
      if (liveGid ? liveGid === grp.id : grp.customer_ids.includes(c.id)) {
        coveredConvIds.add(c.id);
      }
    });
  });

  const adhocGroupMap = new Map<string, { name: string; convs: AutoGroupConvInput[] }>();
  conversations.forEach((c) => {
    if (coveredConvIds.has(c.id)) return;
    const gId = c.metadata?.assigned_group_id;
    const gName = c.metadata?.assigned_group_name;
    if (gId && gName) {
      const entry = adhocGroupMap.get(gId) || { name: gName, convs: [] as AutoGroupConvInput[] };
      entry.convs.push(c);
      adhocGroupMap.set(gId, entry);
      coveredConvIds.add(c.id);
    }
  });

  const adhocGroups: Array<{ id: string; name: string; customerIds: string[]; agentIds: string[] }> = [];
  adhocGroupMap.forEach((val, gId) => {
    const agentSet = new Set<string>();
    val.convs.forEach((c) => getConversationAgentIds(c).forEach((aid) => agentSet.add(aid)));
    adhocGroups.push({
      id: gId,
      name: val.name,
      customerIds: val.convs.map((c) => c.id),
      agentIds: Array.from(agentSet),
    });
  });

  const savedAutoGroups = existingCareGroups.filter((g) => g.is_auto);
  const extraCustomersBySavedAutoGroupId: Record<string, string[]> = {};
  const autoTeamMap = new Map<string, { agentIds: string[]; customerIds: string[] }>();

  conversations.forEach((c) => {
    if (coveredConvIds.has(c.id)) return;
    const agentIds = getConversationAgentIds(c);
    if (agentIds.length <= 1) return;

    const matchingSavedAuto = savedAutoGroups.find((g) => haveSameAgentSet(g.agent_ids || [], agentIds));
    if (matchingSavedAuto) {
      if (!extraCustomersBySavedAutoGroupId[matchingSavedAuto.id]) {
        extraCustomersBySavedAutoGroupId[matchingSavedAuto.id] = [];
      }
      extraCustomersBySavedAutoGroupId[matchingSavedAuto.id].push(c.id);
      return;
    }

    const sortedIds = Array.from(new Set(agentIds)).sort();
    const teamKey = sortedIds.join('__');
    const entry = autoTeamMap.get(teamKey) || { agentIds: sortedIds, customerIds: [] };
    entry.customerIds.push(c.id);
    autoTeamMap.set(teamKey, entry);
  });

  const unsavedAutoGroups: DetectedAutoCareGroup[] = [];
  autoTeamMap.forEach((val) => {
    unsavedAutoGroups.push({
      id: buildAutoCareGroupId(val.agentIds),
      defaultName: buildAutoGroupDefaultName(val.agentIds, users),
      agentIds: val.agentIds,
      customerIds: val.customerIds,
    });
  });

  return { unsavedAutoGroups, extraCustomersBySavedAutoGroupId, adhocGroups };
}

export function toggleBrandSelection(current: string[] | undefined | null, slug: string): string[] {
  if (slug === 'all') return [];
  const target = normalizeBrandSlug(slug);
  if (!target) return [];
  const existing = (current || []).map((b) => normalizeBrandSlug(b)).filter(Boolean);
  if (existing.includes(target)) {
    return existing.filter((b) => b !== target);
  }
  return [...existing, target];
}

// Keep 1 customer exclusively in 1 named care group by removing moved customer IDs from other groups
export function upsertExclusiveCareGroup(
  groups: ChatCareGroup[],
  target: {
    id: string;
    name: string;
    customerIds: string[];
    agentIds: string[];
    allowedBrands?: string[];
    isAuto?: boolean;
    mergeCustomers?: boolean;
    mergeAgents?: boolean;
  }
): ChatCareGroup[] {
  const nowIso = new Date().toISOString();
  const targetCustomerSet = new Set(target.customerIds);

  const cleaned = groups.map((g) => {
    if (g.id === target.id) return g;
    const filtered = (g.customer_ids || []).filter((cid) => !targetCustomerSet.has(cid));
    return filtered.length === (g.customer_ids || []).length
      ? g
      : { ...g, customer_ids: filtered, updated_at: nowIso };
  });

  const exists = cleaned.some((g) => g.id === target.id);
  if (exists) {
    return cleaned.map((g) => {
      if (g.id !== target.id) return g;
      return {
        ...g,
        name: target.name,
        customer_ids: target.mergeCustomers
          ? Array.from(new Set([...(g.customer_ids || []), ...target.customerIds]))
          : target.customerIds,
        agent_ids: target.mergeAgents
          ? Array.from(new Set([...(g.agent_ids || []), ...target.agentIds]))
          : target.agentIds,
        allowed_brands: target.allowedBrands !== undefined ? target.allowedBrands : g.allowed_brands,
        ...(target.isAuto !== undefined ? { is_auto: target.isAuto } : {}),
        updated_at: nowIso,
      };
    });
  }

  return [
    ...cleaned,
    {
      id: target.id,
      name: target.name,
      customer_ids: target.customerIds,
      agent_ids: target.agentIds,
      allowed_brands: target.allowedBrands || [],
      ...(target.isAuto !== undefined ? { is_auto: target.isAuto } : {}),
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
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
      .upsert(
        {
          key: 'chat_access_users',
          value: JSON.stringify(accessUsers),
        },
        { onConflict: 'key' }
      );

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
  if (currentUser.role === 'admin') return true;

  const entry = accessUsers.find(
    (u) => u.user_id === currentUser.id || (currentUser.auth_id && u.user_id === currentUser.auth_id)
  );
  if (entry && entry.is_enabled) return true;

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

/**
 * Sort users cleanly so regular staff/sales appear first and admins are grouped at the bottom.
 */
export function sortSalesFirst<T extends { role?: string | null }>(users: T[]): T[] {
  return [...users].sort((a, b) => (a.role === 'admin' ? 1 : 0) - (b.role === 'admin' ? 1 : 0));
}

/**
 * Return active users permitted for chat (admins or whitelisted users), ordered with sales first and admins last.
 */
export function getSortedChatStaff(users: User[], accessUsers: ChatAccessUser[]): User[] {
  return sortSalesFirst(
    users.filter((u) => {
      if (u.status && u.status !== 'active') return false;
      if (u.role === 'admin') return true;
      return accessUsers.some(
        (a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled !== false
      );
    })
  );
}

// Return all active users allowed into the chat routing pool and NOT paused in systemConfig
export function getEligibleActiveAgents(
  users: User[],
  accessUsers: ChatAccessUser[],
  systemConfig?: ChatSystemConfig,
  routingGroups?: ChatRoutingGroup[]
): User[] {
  return users.filter((u) => {
    if (u.status && u.status !== 'active') return false;
    if (!hasChatAccess(u, accessUsers, routingGroups)) return false;
    if (systemConfig?.agent_weights?.[u.id]?.is_paused) return false;
    return true;
  });
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
    autoRouted?: boolean;
    skipIfAssigned?: boolean;
  }
): Promise<boolean> {
  try {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('assigned_to, metadata')
      .eq('id', conversationId)
      .maybeSingle();

    // Never overwrite or merge into a customer who already has a caretaker when auto-routing
    if (agent.skipIfAssigned && conv && isConversationAssigned(conv as Partial<ChatConversation>)) {
      return false;
    }

    const nextAgentIds =
      agent.assignedAgentIds !== undefined
        ? agent.assignedAgentIds
        : agent.id
        ? [agent.id]
        : [];

    const nowIso = new Date().toISOString();

    const resolvedGroupId =
      agent.groupId !== undefined
        ? agent.groupId
        : nextAgentIds.length > 1
        ? conv?.metadata?.assigned_group_id ?? null
        : null;

    const resolvedGroupName =
      agent.groupName !== undefined
        ? agent.groupName
        : nextAgentIds.length > 1
        ? conv?.metadata?.assigned_group_name ?? null
        : null;

    const nextMetadata: Record<string, any> = {
      ...(conv?.metadata || {}),
      assigned_name: resolvedGroupName || (agent.name ?? null),
      assigned_group_id: resolvedGroupId,
      assigned_group_name: resolvedGroupName,
      assigned_agent_ids: nextAgentIds,
    };

    if (nextAgentIds.length > 0) {
      nextMetadata.assigned_at = nowIso;
      if (agent.autoRouted !== undefined) {
        nextMetadata.auto_routed = agent.autoRouted;
      }
    } else {
      delete nextMetadata.assigned_at;
      delete nextMetadata.auto_routed;
    }

    const primaryAgentId = agent.id || (nextAgentIds.length > 0 ? nextAgentIds[0] : null);

    const updateData: Record<string, any> = {
      assigned_to: primaryAgentId,
      metadata: nextMetadata,
      updated_at: nowIso,
    };

    let query = supabase
      .from('chat_conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (agent.skipIfAssigned) {
      query = query.is('assigned_to', null);
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('assignConversation error:', err);
    return false;
  }
}

// Fetch active workload & current-epoch auto-routed counts per agent AND per care group for % deficit balancing
export async function fetchRoutingWorkloadCounts(
  epochAt?: string | null
): Promise<{
  activeCounts: Record<string, number>;
  epochCounts: Record<string, number>;
  activeGroupCounts: Record<string, number>;
  epochGroupCounts: Record<string, number>;
}> {
  const activeCounts: Record<string, number> = {};
  const epochCounts: Record<string, number> = {};
  const activeGroupCounts: Record<string, number> = {};
  const epochGroupCounts: Record<string, number> = {};

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('assigned_to, status, metadata, updated_at')
      .not('assigned_to', 'is', null);

    if (error || !data) return { activeCounts, epochCounts, activeGroupCounts, epochGroupCounts };

    const epochMs = epochAt ? new Date(epochAt).getTime() : null;

    for (const row of data as Array<{
      assigned_to: string | null;
      status: string;
      metadata: Record<string, any> | null;
      updated_at: string;
    }>) {
      const groupId = row.metadata?.assigned_group_id as string | undefined;

      // Track active workload across all assigned agents and groups
      if (row.status === 'active') {
        const ids = new Set<string>();
        if (row.assigned_to) ids.add(row.assigned_to);
        if (Array.isArray(row.metadata?.assigned_agent_ids)) {
          row.metadata.assigned_agent_ids.forEach((id: string) => {
            if (id) ids.add(id);
          });
        }
        ids.forEach((id) => {
          activeCounts[id] = (activeCounts[id] || 0) + 1;
        });

        if (groupId) {
          activeGroupCounts[groupId] = (activeGroupCounts[groupId] || 0) + 1;
        }
      }

      // Track current-epoch auto-routed count (never mixes old manual/pre-epoch assignments)
      if (row.assigned_to && row.metadata?.auto_routed === true) {
        const assignedAtStr = row.metadata?.assigned_at || row.updated_at;
        const assignedMs = assignedAtStr ? new Date(assignedAtStr).getTime() : 0;
        if (epochMs === null || assignedMs >= epochMs) {
          epochCounts[row.assigned_to] = (epochCounts[row.assigned_to] || 0) + 1;
          if (groupId) {
            epochGroupCounts[groupId] = (epochGroupCounts[groupId] || 0) + 1;
          }
        }
      }
    }
  } catch (err) {
    console.error('fetchRoutingWorkloadCounts error:', err);
  }

  return { activeCounts, epochCounts, activeGroupCounts, epochGroupCounts };
}

// Generic deficit-based weighted percentage selector shared by both agent & care-group routing
export function pickByDeficit<T extends { id: string }>(
  eligible: T[],
  weightsMap: Record<string, AgentWeightConfig>,
  epochCounts: Record<string, number> = {},
  activeCounts: Record<string, number> = {}
): T | null {
  const underCap = eligible.filter((item) => {
    const cfg = weightsMap[item.id];
    if (cfg?.is_paused) return false;
    const maxActive = cfg?.max_active_chats ?? 0;
    if (maxActive > 0 && (activeCounts[item.id] || 0) >= maxActive) return false;
    return true;
  });

  if (underCap.length === 0) return null;

  const totalWeight = underCap.reduce(
    (sum, item) => sum + Math.max(1, weightsMap[item.id]?.weight ?? 1),
    0
  );
  const totalEpochAssigned = underCap.reduce(
    (sum, item) => sum + (epochCounts[item.id] || 0),
    0
  );

  let bestItem = underCap[0];
  let bestDeficit = -Infinity;

  for (const item of underCap) {
    const w = Math.max(1, weightsMap[item.id]?.weight ?? 1);
    const count = epochCounts[item.id] || 0;
    const targetShare = w / totalWeight;
    const deficit = targetShare * (totalEpochAssigned + 1) - count;

    const bestW = Math.max(1, weightsMap[bestItem.id]?.weight ?? 1);
    const bestCount = epochCounts[bestItem.id] || 0;

    const isBetter =
      deficit > bestDeficit + 1e-9 ||
      (Math.abs(deficit - bestDeficit) <= 1e-9 &&
        (count / w < bestCount / bestW - 1e-9 ||
          (Math.abs(count / w - bestCount / bestW) <= 1e-9 &&
            (activeCounts[item.id] || 0) < (activeCounts[bestItem.id] || 0))));

    if (isBetter) {
      bestDeficit = deficit;
      bestItem = item;
    }
  }

  return bestItem;
}

// Deficit-based weighted percentage selection for individual agents
export function pickDeficitAgent(
  candidateUsers: User[],
  systemConfig?: ChatSystemConfig,
  epochCounts: Record<string, number> = {},
  activeCounts: Record<string, number> = {},
  brand?: string | null
): User | null {
  const weightsMap = systemConfig?.agent_weights || {};
  const activeUsers = candidateUsers.filter((u) => {
    if (u.status && u.status !== 'active') return false;
    if (brand !== undefined && !isBrandAllowed(weightsMap[u.id]?.allowed_brands, brand)) return false;
    return true;
  });
  return pickByDeficit(activeUsers, weightsMap, epochCounts, activeCounts);
}

// Deficit-based weighted percentage selection for named care groups
export function pickDeficitCareGroup(
  candidateGroups: ChatCareGroup[],
  availableUsers: User[],
  systemConfig?: ChatSystemConfig,
  epochGroupCounts: Record<string, number> = {},
  activeGroupCounts: Record<string, number> = {},
  brand?: string | null
): ChatCareGroup | null {
  const activeUserIds = new Set(
    availableUsers.filter((u) => !u.status || u.status === 'active').map((u) => u.id)
  );
  const groupWeightsMap = systemConfig?.group_weights || {};
  const validGroups = candidateGroups.filter((g) => {
    if (!(g.agent_ids || []).some((id) => activeUserIds.has(id))) return false;
    const allowedBrands =
      g.allowed_brands && g.allowed_brands.length > 0
        ? g.allowed_brands
        : groupWeightsMap[g.id]?.allowed_brands;
    if (brand !== undefined && !isBrandAllowed(allowedBrands, brand)) return false;
    return true;
  });
  return pickByDeficit(validGroups, groupWeightsMap, epochGroupCounts, activeGroupCounts);
}

// Check working hours in Asia/Bangkok timezone
export function isWithinWorkingHours(systemConfig: ChatSystemConfig): boolean {
  if (!systemConfig.routing_working_hours_only) return true;
  const nowBkk = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const start = systemConfig.working_hours_start || '08:30';
  const end = systemConfig.working_hours_end || '18:00';
  if (start <= end) {
    return nowBkk >= start && nowBkk <= end;
  }
  // Overnight shift support
  return nowBkk >= start || nowBkk <= end;
}

// 4. Randomize (by target % deficit), round-robin, or shared team assignment from routing group
export function pickAgentFromGroup(
  group: ChatRoutingGroup,
  availableUsers: User[],
  systemConfig?: ChatSystemConfig,
  workload?: {
    epochCounts?: Record<string, number>;
    activeCounts?: Record<string, number>;
  }
): {
  agentId: string;
  updatedGroup: ChatRoutingGroup;
  assignedAgentIds: string[];
  isShared: boolean;
} | null {
  if (!group || !group.agent_ids || group.agent_ids.length === 0) return null;

  const weightsMap = systemConfig?.agent_weights || {};
  const activeCounts = workload?.activeCounts || {};
  const epochCounts = workload?.epochCounts || {};

  // Strictly exclude paused or inactive users (NO fallback to paused users!)
  const eligibleUsers = group.agent_ids
    .map((id) => availableUsers.find((u) => u.id === id))
    .filter((u): u is User => {
      if (!u) return false;
      if (u.status && u.status !== 'active') return false;
      const cfg = weightsMap[u.id];
      if (cfg?.is_paused) return false;
      const maxActive = cfg?.max_active_chats ?? 0;
      if (maxActive > 0 && (activeCounts[u.id] || 0) >= maxActive) return false;
      return true;
    });

  if (eligibleUsers.length === 0) return null;

  const updatedGroup = { ...group };
  let selectedId = eligibleUsers[0].id;
  let assignedAgentIds: string[] = eligibleUsers.map((u) => u.id);
  const isShared = group.mode === 'shared';

  if (group.mode === 'shared') {
    if (group.agents_per_customer && typeof group.agents_per_customer === 'number' && group.agents_per_customer > 0) {
      assignedAgentIds = assignedAgentIds.slice(0, group.agents_per_customer);
    }
    selectedId = assignedAgentIds[0];
  } else if (group.mode === 'random') {
    const picked = pickDeficitAgent(eligibleUsers, systemConfig, epochCounts, activeCounts);
    if (!picked) return null;
    selectedId = picked.id;
    assignedAgentIds = [selectedId];
  } else {
    // Round-robin through eligible non-paused, under-capacity users
    const lastIdx = group.last_assigned_index ?? -1;
    const nextIdx = (lastIdx + 1) % eligibleUsers.length;
    selectedId = eligibleUsers[nextIdx].id;
    updatedGroup.last_assigned_index = nextIdx;
    assignedAgentIds = [selectedId];
  }

  return { agentId: selectedId, updatedGroup, assignedAgentIds, isShared };
}

// 5. Bulk Auto-assign unassigned conversations (respects % deficit, max_active_chats, working hours, never touches already-assigned chats)
export async function autoAssignConversations(
  conversations: ChatConversation[],
  groups: ChatRoutingGroup[],
  users: User[]
): Promise<{ assignedCount: number; updatedGroups: ChatRoutingGroup[] }> {
  const systemConfig = await fetchChatSystemConfig();
  if (!systemConfig.auto_routing_enabled) {
    return { assignedCount: 0, updatedGroups: groups };
  }

  if (!isWithinWorkingHours(systemConfig)) {
    console.log('Outside working hours for auto-routing, skipping.');
    return { assignedCount: 0, updatedGroups: groups };
  }

  const [accessUsers, careGroups, workload] = await Promise.all([
    fetchChatAccessUsers(),
    fetchChatCareGroups(),
    fetchRoutingWorkloadCounts(systemConfig.routing_epoch_at),
  ]);

  const activeCounts = { ...workload.activeCounts };
  const epochCounts = { ...workload.epochCounts };
  const activeGroupCounts = { ...workload.activeGroupCounts };
  const epochGroupCounts = { ...workload.epochGroupCounts };
  let currentGroups = [...groups];
  let assignedCount = 0;

  for (const conv of conversations) {
    // CRITICAL RULE: Never touch or merge customers who already have a caretaker!
    if (isConversationAssigned(conv)) continue;

    const brandSlug = normalizeBrandSlug(conv.brand);
    let group = currentGroups.find(
      (g) => g.is_active && normalizeBrandSlug(g.brand) === brandSlug && g.agent_ids.length > 0
    );
    if (!group) {
      group = currentGroups.find((g) => g.is_active && g.brand === 'all' && g.agent_ids.length > 0);
    }

    let pickedAgentId: string | null = null;
    let displayName = 'แอดมิน';
    let assignedAgentIds: string[] = [];
    let groupId: string | null = null;
    let groupName: string | null = null;
    let avatarUrlVal: string | null | undefined = null;

    if (group) {
      const pick = pickAgentFromGroup(group, users, systemConfig, { epochCounts, activeCounts });
      if (!pick) continue;

      currentGroups = currentGroups.map((g) => (g.id === pick.updatedGroup.id ? pick.updatedGroup : g));
      const userObj = users.find((u) => u.id === pick.agentId);
      const agentName = userObj ? userObj.nickname || userObj.first_name : 'แอดมิน';

      pickedAgentId = pick.agentId;
      displayName = pick.isShared ? `กลุ่ม: ${group.name}` : agentName;
      assignedAgentIds = pick.assignedAgentIds;
      groupId = group.id;
      groupName = group.name;
      avatarUrlVal = userObj?.avatar_url;
    } else if (systemConfig.routing_target_mode === 'groups') {
      const pickedGrp = pickDeficitCareGroup(careGroups, users, systemConfig, epochGroupCounts, activeGroupCounts, conv.brand);
      if (!pickedGrp) continue;

      const activeMemberIds = (pickedGrp.agent_ids || []).filter((id) => {
        const u = users.find((usr) => usr.id === id);
        return u && (!u.status || u.status === 'active');
      });
      if (activeMemberIds.length === 0) continue;

      const primaryUser = users.find((u) => u.id === activeMemberIds[0]);
      pickedAgentId = activeMemberIds[0];
      displayName = pickedGrp.name;
      assignedAgentIds = activeMemberIds;
      groupId = pickedGrp.id;
      groupName = pickedGrp.name;
      avatarUrlVal = primaryUser?.avatar_url;
    } else {
      // No routing group configured: route directly using active Section 3 staff in /chat-settings by % deficit & brand lock!
      const defaultPool = getEligibleActiveAgents(users, accessUsers, systemConfig, currentGroups);
      const picked = pickDeficitAgent(defaultPool, systemConfig, epochCounts, activeCounts, conv.brand);
      if (!picked) continue;

      pickedAgentId = picked.id;
      displayName = picked.nickname || picked.first_name || 'แอดมิน';
      assignedAgentIds = [picked.id];
      avatarUrlVal = picked.avatar_url;
    }

    if (!pickedAgentId) continue;

    const success = await assignConversation(conv.id, {
      id: pickedAgentId,
      name: displayName,
      avatar: avatarUrlVal,
      groupId,
      groupName,
      assignedAgentIds,
      autoRouted: true,
      skipIfAssigned: true,
    });

    if (success) {
      assignedCount++;
      epochCounts[pickedAgentId] = (epochCounts[pickedAgentId] || 0) + 1;
      assignedAgentIds.forEach((id) => {
        activeCounts[id] = (activeCounts[id] || 0) + 1;
      });
      if (groupId) {
        epochGroupCounts[groupId] = (epochGroupCounts[groupId] || 0) + 1;
        activeGroupCounts[groupId] = (activeGroupCounts[groupId] || 0) + 1;
      }
    }
  }

  if (assignedCount > 0 && currentGroups.length > 0) {
    await saveChatRoutingGroups(currentGroups);
  }

  return { assignedCount, updatedGroups: currentGroups };
}

// 6. Chat System Configuration & Policy
export const DEFAULT_CHAT_SYSTEM_CONFIG: ChatSystemConfig = {
  reply_policy: 'everyone',
  auto_assign_first_responder: true,
  auto_routing_enabled: true,
  routing_target_mode: 'agents',
  routing_working_hours_only: false,
  working_hours_start: '08:30',
  working_hours_end: '18:00',
  default_fallback_agent_id: null,
  routing_epoch_at: null,
  agent_weights: {},
  group_weights: {},
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
