import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dices,
  X,
  Check,
  RefreshCw,
  Search,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  LayoutList,
  Scale,
  Minus,
  Plus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatAccessUsers,
  fetchChatSystemConfig,
  saveChatSystemConfig,
  fetchChatCareGroups,
  saveChatCareGroups,
  upsertExclusiveCareGroup,
  assignConversation,
  isConversationAssigned,
  isBrandAllowed,
  normalizeBrandSlug,
  detectAutoCareGroups,
  getSortedChatStaff,
  sortSalesFirst,
} from '../../services/chatRoutingService';
import type { DetectedAutoCareGroup } from '../../services/chatRoutingService';
import type { User, ChatAccessUser, ChatChannel, ChatCareGroup } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';
import { LineIcon, FacebookIcon, InstagramIcon } from '../../pages/ChatSettings';

interface UnassignedCustomer {
  id: string;
  brand: string;
  customer_name: string;
  customer_avatar?: string | null;
  platform: 'line' | 'facebook' | 'instagram';
  last_message?: string | null;
  last_message_at?: string | null;
  metadata?: Record<string, any>;
}

interface DistributionRecipient {
  id: string;
  name: string;
  subtitle?: string;
  badge?: string;
  agents: User[];
  careGroup?: ChatCareGroup;
  allowedBrands?: string[];
  isAuto?: boolean;
  isUnsavedAuto?: boolean;
}

interface SimulatedAssignment {
  conversation: UnassignedCustomer;
  recipientId: string;
}

interface ChatDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialBrand?: string;
  initialMode?: 'agents' | 'groups';
  channels?: ChatChannel[];
}

function StaffAvatarImg({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const [error, setError] = useState(false);
  const src = avatarUrl(url);

  if (src && !error) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setError(true)}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#3B82F6',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size <= 24 ? '0.7rem' : size <= 32 ? '0.85rem' : '1rem',
        flexShrink: 0,
      }}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

function RecipientAvatar({ agents, name, size = 32 }: { agents: User[]; name: string; size?: number }) {
  if (agents.length <= 1) {
    return <StaffAvatarImg url={agents[0]?.avatar_url} name={agents[0]?.first_name || name} size={size} />;
  }
  const circleSize = Math.max(20, Math.round(size * 0.78));
  return (
    <div className="flex -space-x-2 shrink-0 items-center">
      {agents.slice(0, 3).map((ag) => (
        <div key={ag.id} className="rounded-full ring-2 ring-white dark:ring-zinc-900">
          <StaffAvatarImg url={ag.avatar_url} name={ag.first_name} size={circleSize} />
        </div>
      ))}
      {agents.length > 3 && (
        <div
          style={{ width: `${circleSize}px`, height: `${circleSize}px` }}
          className="rounded-full ring-2 ring-white dark:ring-zinc-900 bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center"
        >
          +{agents.length - 3}
        </div>
      )}
    </div>
  );
}

// Multi-Brand Presets & Styling (แนวเดียวกับ ChatInbox 100%)
const BRAND_PRESETS: Record<string, { label: string; shortLabel: string; bg: string; color: string }> = {
  terrahome: { label: 'Terra Home Studio', shortLabel: 'TERRA', bg: '#B45309', color: '#FFFFFF' },
  zenslab: { label: 'Zenslab by Woodden', shortLabel: 'ZENSLAB', bg: '#065F46', color: '#FFFFFF' },
  emberandash: { label: 'Ember and Ash', shortLabel: 'EMBER', bg: '#9A3412', color: '#FFFFFF' },
  wallcraft: { label: 'Wallcraft Thailand', shortLabel: 'WALLCRAFT', bg: '#1E3A8A', color: '#FFFFFF' },
};

function getBrandDisplay(brandSlug?: string, channelsList?: ChatChannel[]) {
  const raw = (brandSlug || 'terrahome').toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9]/g, '');
  const matchedChannel = channelsList?.find((c) => c.brand_slug.toLowerCase().replace(/[^a-z0-9]/g, '') === slug);
  const preset = BRAND_PRESETS[slug] || Object.entries(BRAND_PRESETS).find(([k]) => slug.includes(k) || k.includes(slug))?.[1];

  return {
    label: matchedChannel?.brand_name || preset?.label || brandSlug?.toUpperCase() || 'ทั่วไป',
    shortLabel: preset?.shortLabel || matchedChannel?.brand_name?.slice(0, 10) || brandSlug?.toUpperCase() || 'ทั่วไป',
    bg: preset?.bg || '#374151',
    color: preset?.color || '#FFFFFF',
    logo: matchedChannel?.brand_logo || null,
  };
}

export default function ChatDistributionModal({
  isOpen,
  onClose,
  onSuccess,
  initialBrand = 'all',
  initialMode = 'agents',
  channels: propChannels,
}: ChatDistributionModalProps) {
  const [loading, setLoading] = useState(true);
  const [distMode, setDistMode] = useState<'agents' | 'groups'>(initialMode);
  const [channels, setChannels] = useState<ChatChannel[]>(propChannels || []);
  const [customers, setCustomers] = useState<UnassignedCustomer[]>([]);
  const [eligibleStaff, setEligibleStaff] = useState<User[]>([]);
  const [allActiveUsers, setAllActiveUsers] = useState<User[]>([]);
  const [careGroups, setCareGroups] = useState<ChatCareGroup[]>([]);
  const [detectedAutoGroups, setDetectedAutoGroups] = useState<DetectedAutoCareGroup[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  // สัดส่วนน้ำหนัก/เปอร์เซ็นต์ (Custom Weights) & Brand Locks
  const [agentWeights, setAgentWeights] = useState<Record<string, number>>({});
  const [groupWeights, setGroupWeights] = useState<Record<string, number>>({});
  const [agentBrandLocks, setAgentBrandLocks] = useState<Record<string, string[]>>({});
  const [groupBrandLocks, setGroupBrandLocks] = useState<Record<string, string[]>>({});
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  // Filter & View Mode state
  const [brandFilter, setBrandFilter] = useState<string>(initialBrand);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewAgentFilter, setPreviewAgentFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped'); // 'grouped' by default
  const [collapsedAgentIds, setCollapsedAgentIds] = useState<Record<string, boolean>>({});

  // Simulation state
  const [simulatedAssignments, setSimulatedAssignments] = useState<SimulatedAssignment[]>([]);
  const [isRolling, setIsRolling] = useState(false);

  // Approval execution state
  const [isApproving, setIsApproving] = useState(false);
  const [approvedCount, setApprovedCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [syncToSettings, setSyncToSettings] = useState(false);

  const buildRecipients = useCallback(
    (
      mode: 'agents' | 'groups',
      staffList: User[],
      groupList: ChatCareGroup[],
      autoGroupList: DetectedAutoCareGroup[],
      aLocks: Record<string, string[]>,
      gLocks: Record<string, string[]>
    ): DistributionRecipient[] => {
      if (mode === 'groups') {
        const savedRecs = groupList
          .map((grp) => {
            const members = (grp.agent_ids || [])
              .map((id) => staffList.find((u) => u.id === id) || null)
              .filter((u): u is User => !!u);
            if (members.length === 0) return null;
            const grpBrands =
              grp.allowed_brands && grp.allowed_brands.length > 0
                ? grp.allowed_brands
                : gLocks[grp.id] || [];
            const isAuto = Boolean(grp.is_auto);
            const rec: DistributionRecipient = {
              id: grp.id,
              name: isAuto ? members.map((m) => m.first_name).join(', ') : grp.name,
              subtitle: isAuto ? `พบดูแลร่วมกัน ${grp.customer_ids?.length || 0} ลค.` : members.map((m) => m.first_name).join(', '),
              badge: `${members.length} คน`,
              agents: members,
              careGroup: grp,
              allowedBrands: grpBrands,
              isAuto,
              isUnsavedAuto: false,
            };
            return rec;
          })
          .filter((r): r is DistributionRecipient => r !== null);

        const autoRecs = autoGroupList
          .map((ag) => {
            const members = (ag.agentIds || [])
              .map((id) => staffList.find((u) => u.id === id) || null)
              .filter((u): u is User => !!u);
            if (members.length === 0) return null;
            const rec: DistributionRecipient = {
              id: ag.id,
              name: members.map((m) => m.first_name).join(', '),
              subtitle: `พบดูแลร่วมกัน ${ag.customerIds.length} ลค.`,
              badge: `${members.length} คน`,
              agents: members,
              careGroup: {
                id: ag.id,
                name: ag.defaultName,
                customer_ids: ag.customerIds,
                agent_ids: ag.agentIds,
                allowed_brands: gLocks[ag.id] || [],
                is_auto: true,
              },
              allowedBrands: gLocks[ag.id] || [],
              isAuto: true,
              isUnsavedAuto: true,
            };
            return rec;
          })
          .filter((r): r is DistributionRecipient => r !== null);

        return [...savedRecs, ...autoRecs];
      }

      return staffList.map((u) => ({
        id: u.id,
        name: u.first_name,
        subtitle: u.nickname ? `(${u.nickname})` : undefined,
        badge: u.role === 'admin' ? 'Admin' : undefined,
        agents: [u],
        allowedBrands: aLocks[u.id] || [],
      }));
    },
    []
  );

  // Core distribution engine ตามสัดส่วน % และบังคับล็อคแบรนด์ของแต่ละคน/กลุ่ม
  const executeSimulation = useCallback((
    targetCustomers: UnassignedCustomer[],
    targetIds: string[],
    allRecipients: DistributionRecipient[],
    weights: Record<string, number>
  ) => {
    if (targetCustomers.length === 0 || targetIds.length === 0) {
      setSimulatedAssignments([]);
      setUnmatchedCount(0);
      return;
    }

    const activeRecipients = allRecipients.filter((r) => targetIds.includes(r.id));
    if (activeRecipients.length === 0) {
      setSimulatedAssignments([]);
      setUnmatchedCount(targetCustomers.length);
      return;
    }

    const shuffle = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const shuffledCustomers = shuffle(targetCustomers);
    const simCounts: Record<string, number> = {};
    activeRecipients.forEach((r) => {
      simCounts[r.id] = 0;
    });

    const assignments: SimulatedAssignment[] = [];
    let skipped = 0;

    for (const cust of shuffledCustomers) {
      // Only recipients permitted for this customer's brand may receive this customer
      const eligible = shuffle(
        activeRecipients.filter((r) => isBrandAllowed(r.allowedBrands, cust.brand))
      );
      if (eligible.length === 0) {
        skipped++;
        continue;
      }

      const sumWeight = eligible.reduce((s, r) => s + Math.max(1, weights[r.id] ?? 1), 0);
      const sumAssigned = eligible.reduce((s, r) => s + (simCounts[r.id] || 0), 0);

      let bestRec = eligible[0];
      let bestDeficit = -Infinity;

      for (const r of eligible) {
        const w = Math.max(1, weights[r.id] ?? 1);
        const cnt = simCounts[r.id] || 0;
        const deficit = (w / sumWeight) * (sumAssigned + 1) - cnt;
        if (deficit > bestDeficit + 1e-9) {
          bestDeficit = deficit;
          bestRec = r;
        }
      }

      simCounts[bestRec.id] = (simCounts[bestRec.id] || 0) + 1;
      assignments.push({
        conversation: cust,
        recipientId: bestRec.id,
      });
    }

    setUnmatchedCount(skipped);
    setSimulatedAssignments(assignments);
  }, []);

  // โหลดข้อมูลเริ่มต้น
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const startMode = initialMode;
      setDistMode(startMode);
      setPreviewAgentFilter('all');
      setCollapsedAgentIds({});

      const [usersRes, accessList, sysCfg, careGroupList, convsRes, chRes] = await Promise.all([
        fetchUsers(),
        fetchChatAccessUsers(),
        fetchChatSystemConfig(),
        fetchChatCareGroups(),
        supabase
          .from('chat_conversations')
          .select('id, brand, customer_name, customer_avatar, platform, last_message, last_message_at, metadata, assigned_to')
          .order('last_message_at', { ascending: false })
          .limit(300),
        supabase
          .from('chat_channels')
          .select('*')
          .order('created_at', { ascending: true }),
      ]);

      if (chRes.data && (!propChannels || propChannels.length === 0)) {
        setChannels(chRes.data as ChatChannel[]);
      }

      const allConvs = convsRes.data || [];
      const unassignedList: UnassignedCustomer[] = allConvs
        .filter((c: any) => !isConversationAssigned(c))
        .map((c: any) => ({
          id: c.id,
          brand: c.brand || 'terrahome',
          customer_name: c.customer_name || 'ลูกค้า',
          customer_avatar: c.customer_avatar,
          platform: c.platform || 'facebook',
          last_message: c.last_message,
          last_message_at: c.last_message_at,
          metadata: c.metadata,
        }));

      setCustomers(unassignedList);

      const allActiveUsers = sortSalesFirst(
        (usersRes as User[]).filter((u) => !u.status || u.status === 'active')
      );
      const staffList = getSortedChatStaff(allActiveUsers, accessList as ChatAccessUser[]);

      setEligibleStaff(staffList);
      setAllActiveUsers(allActiveUsers);
      setCareGroups(careGroupList);

      // Default agent weights, brand locks & selections
      const initialWeights: Record<string, number> = {};
      const aLocks: Record<string, string[]> = {};
      staffList.forEach((s) => {
        initialWeights[s.id] = Math.max(1, sysCfg?.agent_weights?.[s.id]?.weight ?? 1);
        aLocks[s.id] = sysCfg?.agent_weights?.[s.id]?.allowed_brands || [];
      });
      setAgentWeights(initialWeights);
      setAgentBrandLocks(aLocks);

      const hasExplicitWeightCfg = Object.keys(sysCfg?.agent_weights || {}).length > 0;
      const unpausedAgentIds = staffList
        .filter((u) => !sysCfg?.agent_weights?.[u.id]?.is_paused)
        .map((u) => u.id);
      const defaultSelectedAgentIds = hasExplicitWeightCfg ? unpausedAgentIds : staffList.map((u) => u.id);
      setSelectedAgentIds(defaultSelectedAgentIds);

      // Default group weights, brand locks & selections (include detected Auto-Groups unticked by default)
      const { unsavedAutoGroups } = detectAutoCareGroups(allConvs, careGroupList, allActiveUsers);
      const validAutoGroups = unsavedAutoGroups.filter((ag) =>
        (ag.agentIds || []).some((id) => allActiveUsers.some((u) => u.id === id))
      );
      setDetectedAutoGroups(validAutoGroups);

      const validCareGroups = careGroupList.filter((grp) =>
        (grp.agent_ids || []).some((id) => allActiveUsers.some((u) => u.id === id))
      );
      const initialGrpWeights: Record<string, number> = {};
      const gLocks: Record<string, string[]> = {};
      validCareGroups.forEach((g) => {
        initialGrpWeights[g.id] = Math.max(1, sysCfg?.group_weights?.[g.id]?.weight ?? 1);
        gLocks[g.id] =
          g.allowed_brands && g.allowed_brands.length > 0
            ? g.allowed_brands
            : sysCfg?.group_weights?.[g.id]?.allowed_brands || [];
      });
      validAutoGroups.forEach((ag) => {
        initialGrpWeights[ag.id] = 1;
        gLocks[ag.id] = [];
      });
      setGroupWeights(initialGrpWeights);
      setGroupBrandLocks(gLocks);

      const hasExplicitGroupCfg = Object.keys(sysCfg?.group_weights || {}).length > 0;
      const unpausedGroupIds = validCareGroups
        .filter((g) => !sysCfg?.group_weights?.[g.id]?.is_paused)
        .map((g) => g.id);
      const defaultSelectedGroupIds = hasExplicitGroupCfg
        ? unpausedGroupIds
        : validCareGroups.filter((g) => !g.is_auto).map((g) => g.id);
      setSelectedGroupIds(defaultSelectedGroupIds);

      const initialFiltered = brandFilter === 'all'
        ? unassignedList
        : unassignedList.filter((c) => normalizeBrandSlug(c.brand) === normalizeBrandSlug(brandFilter));

      const initialRecipients = buildRecipients(
        startMode,
        startMode === 'groups' ? allActiveUsers : staffList,
        validCareGroups,
        validAutoGroups,
        aLocks,
        gLocks
      );
      executeSimulation(
        initialFiltered,
        startMode === 'groups' ? defaultSelectedGroupIds : defaultSelectedAgentIds,
        initialRecipients,
        startMode === 'groups' ? initialGrpWeights : initialWeights
      );
    } catch (err: any) {
      console.error('Failed to load distribution data:', err);
    } finally {
      setLoading(false);
    }
  }, [brandFilter, initialMode, buildRecipients, executeSimulation, propChannels]);

  useEffect(() => {
    if (isOpen) {
      void loadInitialData();
    }
  }, [isOpen, loadInitialData]);

  // กรองลูกค้าตามแบรนด์
  const filteredCustomers = useMemo(() => {
    if (brandFilter === 'all') return customers;
    const targetSlug = normalizeBrandSlug(brandFilter);
    return customers.filter((c) => normalizeBrandSlug(c.brand) === targetSlug);
  }, [customers, brandFilter]);

  // นับจำนวนลูกค้าแต่ละแบรนด์
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = { all: customers.length };
    customers.forEach((c) => {
      const b = normalizeBrandSlug(c.brand) || 'unknown';
      counts[b] = (counts[b] || 0) + 1;
    });
    return counts;
  }, [customers]);

  const activeRecipients = useMemo(
    () =>
      buildRecipients(
        distMode,
        distMode === 'groups' ? allActiveUsers : eligibleStaff,
        careGroups,
        detectedAutoGroups,
        agentBrandLocks,
        groupBrandLocks
      ),
    [buildRecipients, distMode, allActiveUsers, eligibleStaff, careGroups, detectedAutoGroups, agentBrandLocks, groupBrandLocks]
  );

  const activeSelectedIds = distMode === 'groups' ? selectedGroupIds : selectedAgentIds;
  const activeWeights = distMode === 'groups' ? groupWeights : agentWeights;

  // สลับโหมดระหว่างสุ่มลงเซลล์ vs สุ่มลงกลุ่มแชท
  const handleModeChange = (nextMode: 'agents' | 'groups') => {
    if (nextMode === distMode) return;
    setDistMode(nextMode);
    setPreviewAgentFilter('all');
    setCollapsedAgentIds({});
    const nextRecipients = buildRecipients(
      nextMode,
      nextMode === 'groups' ? allActiveUsers : eligibleStaff,
      careGroups,
      detectedAutoGroups,
      agentBrandLocks,
      groupBrandLocks
    );
    const nextIds = nextMode === 'groups' ? selectedGroupIds : selectedAgentIds;
    const nextWeights = nextMode === 'groups' ? groupWeights : agentWeights;
    executeSimulation(filteredCustomers, nextIds, nextRecipients, nextWeights);
  };

  // สลับแบรนด์
  const handleBrandChange = (newBrand: string) => {
    setBrandFilter(newBrand);
    const targetSlug = normalizeBrandSlug(newBrand);
    const targetCusts = newBrand === 'all'
      ? customers
      : customers.filter((c) => normalizeBrandSlug(c.brand) === targetSlug);
    executeSimulation(targetCusts, activeSelectedIds, activeRecipients, activeWeights);
  };

  // ปรับเปลี่ยนสัดส่วนน้ำหนัก/เปอร์เซ็นต์ของผู้รับงาน (เซลล์ หรือ กลุ่ม)
  const setWeightsForCurrentMode = (updater: (prev: Record<string, number>) => Record<string, number>) => {
    if (distMode === 'groups') {
      setGroupWeights((prev) => {
        const updated = updater(prev);
        executeSimulation(filteredCustomers, selectedGroupIds, activeRecipients, updated);
        return updated;
      });
    } else {
      setAgentWeights((prev) => {
        const updated = updater(prev);
        executeSimulation(filteredCustomers, selectedAgentIds, activeRecipients, updated);
        return updated;
      });
    }
  };

  const handleWeightChange = (recipientId: string, delta: number) => {
    setWeightsForCurrentMode((prev) => {
      const current = prev[recipientId] ?? 1;
      return { ...prev, [recipientId]: Math.max(1, Math.min(20, current + delta)) };
    });
  };

  const handleSetExactWeight = (recipientId: string, exactWeight: number) => {
    const val = Math.max(1, Math.min(20, exactWeight));
    setWeightsForCurrentMode((prev) => ({ ...prev, [recipientId]: val }));
  };

  // เฉลี่ยสัดส่วนเปอร์เซ็นต์เท่ากัน (Reset all to 1x)
  const handleEqualizeWeights = () => {
    const resetWeights: Record<string, number> = {};
    activeRecipients.forEach((r) => {
      resetWeights[r.id] = 1;
    });
    if (distMode === 'groups') {
      setGroupWeights(resetWeights);
    } else {
      setAgentWeights(resetWeights);
    }
    executeSimulation(filteredCustomers, activeSelectedIds, activeRecipients, resetWeights);
  };

  // เลือก/ยกเลิกผู้รับงาน (เซลล์ หรือ กลุ่ม)
  const toggleRecipient = (recipientId: string) => {
    const nextIds = activeSelectedIds.includes(recipientId)
      ? activeSelectedIds.filter((id) => id !== recipientId)
      : [...activeSelectedIds, recipientId];
    if (distMode === 'groups') {
      setSelectedGroupIds(nextIds);
    } else {
      setSelectedAgentIds(nextIds);
    }
    executeSimulation(filteredCustomers, nextIds, activeRecipients, activeWeights);
  };

  const selectAllRecipients = () => {
    const allIds = activeRecipients.map((r) => r.id);
    if (distMode === 'groups') {
      setSelectedGroupIds(allIds);
    } else {
      setSelectedAgentIds(allIds);
    }
    executeSimulation(filteredCustomers, allIds, activeRecipients, activeWeights);
  };

  const deselectAllRecipients = () => {
    if (distMode === 'groups') {
      setSelectedGroupIds([]);
    } else {
      setSelectedAgentIds([]);
    }
    setSimulatedAssignments([]);
  };

  // Re-roll simulation (สุ่มใหม่โดยคงสัดส่วนเดิม)
  const handleReRoll = () => {
    setIsRolling(true);
    executeSimulation(filteredCustomers, activeSelectedIds, activeRecipients, activeWeights);
    setTimeout(() => {
      setIsRolling(false);
    }, 250);
  };

  // Manual override ย้ายลูกค้ารายคนไปให้ผู้รับงานอื่น (เซลล์ หรือ กลุ่ม)
  const handleOverrideRecipient = (convId: string, newRecipientId: string) => {
    const targetRecipient = activeRecipients.find((r) => r.id === newRecipientId);
    if (!targetRecipient) return;

    setSimulatedAssignments((prev) =>
      prev.map((item) =>
        item.conversation.id === convId ? { ...item, recipientId: targetRecipient.id } : item
      )
    );
  };

  // สถิติการกระจายของแต่ละคน/แต่ละกลุ่ม
  const recipientBreakdown = useMemo(() => {
    const stats: Record<string, { recipient: DistributionRecipient; count: number; percent: number; weight: number }> = {};
    const selected = activeRecipients.filter((r) => activeSelectedIds.includes(r.id));

    selected.forEach((r) => {
      stats[r.id] = { recipient: r, count: 0, percent: 0, weight: activeWeights[r.id] ?? 1 };
    });

    simulatedAssignments.forEach((item) => {
      if (stats[item.recipientId]) {
        stats[item.recipientId].count++;
      }
    });

    const total = simulatedAssignments.length;
    if (total > 0) {
      Object.values(stats).forEach((s) => {
        s.percent = Math.round((s.count / total) * 100);
      });
    }

    return Object.values(stats);
  }, [simulatedAssignments, activeRecipients, activeSelectedIds, activeWeights]);

  // คำนวณผลรวมน้ำหนักที่เลือกทั้งหมด
  const totalActiveWeight = useMemo(() => {
    return activeRecipients
      .filter((r) => activeSelectedIds.includes(r.id))
      .reduce((sum, r) => sum + Math.max(1, activeWeights[r.id] ?? 1), 0);
  }, [activeRecipients, activeSelectedIds, activeWeights]);

  // Filter preview list by search query & recipient filter
  const displayedAssignments = useMemo(() => {
    let list = simulatedAssignments;

    if (previewAgentFilter !== 'all') {
      list = list.filter((item) => item.recipientId === previewAgentFilter);
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;

    return list.filter((item) => {
      const rec = activeRecipients.find((r) => r.id === item.recipientId);
      const cName = (item.conversation.customer_name || '').toLowerCase();
      const bName = (item.conversation.brand || '').toLowerCase();
      const rName = `${rec?.name || ''} ${rec?.subtitle || ''}`.toLowerCase();
      const lastMsg = (item.conversation.last_message || '').toLowerCase();
      return cName.includes(q) || bName.includes(q) || rName.includes(q) || lastMsg.includes(q);
    });
  }, [simulatedAssignments, searchQuery, previewAgentFilter, activeRecipients]);

  // Grouped by Recipient: แสดงแบบว่า เซลล์หรือกลุ่ม 1 รายการ ได้ลูกค้าคนไหนบ้าง อยู่ในรายการย่อย
  const groupedAssignments = useMemo(() => {
    const map = new Map<string, { recipient: DistributionRecipient; items: SimulatedAssignment[] }>();

    const selected = activeRecipients.filter((r) => activeSelectedIds.includes(r.id));
    selected.forEach((r) => {
      map.set(r.id, { recipient: r, items: [] });
    });

    displayedAssignments.forEach((item) => {
      const rec = activeRecipients.find((r) => r.id === item.recipientId);
      if (!rec) return;
      const existing = map.get(item.recipientId);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.recipientId, { recipient: rec, items: [item] });
      }
    });

    const total = simulatedAssignments.length;
    const groups: { recipient: DistributionRecipient; count: number; percent: number; weight: number; items: SimulatedAssignment[] }[] = [];

    map.forEach(({ recipient, items }) => {
      if (previewAgentFilter !== 'all' && recipient.id !== previewAgentFilter) {
        return;
      }
      if (searchQuery.trim() && items.length === 0) {
        return;
      }
      groups.push({
        recipient,
        count: items.length,
        percent: total > 0 ? Math.round((items.length / total) * 100) : 0,
        weight: activeWeights[recipient.id] ?? 1,
        items,
      });
    });

    return groups.sort((a, b) => b.count - a.count || a.recipient.name.localeCompare(b.recipient.name));
  }, [displayedAssignments, activeRecipients, activeSelectedIds, simulatedAssignments.length, previewAgentFilter, searchQuery, activeWeights]);

  // Collapse / Expand helpers
  const toggleCollapse = (recipientId: string) => {
    setCollapsedAgentIds((prev) => ({
      ...prev,
      [recipientId]: !prev[recipientId],
    }));
  };

  const isAllCollapsed = useMemo(() => {
    if (groupedAssignments.length === 0) return false;
    return groupedAssignments.every((g) => collapsedAgentIds[g.recipient.id]);
  }, [groupedAssignments, collapsedAgentIds]);

  const toggleAllCollapse = () => {
    if (isAllCollapsed) {
      setCollapsedAgentIds({});
    } else {
      const allC: Record<string, boolean> = {};
      groupedAssignments.forEach((g) => {
        allC[g.recipient.id] = true;
      });
      setCollapsedAgentIds(allC);
    }
  };

  // Approve & Execute Batch Assignment in Database
  const handleApprove = async () => {
    if (simulatedAssignments.length === 0) return;

    const total = simulatedAssignments.length;
    const targetWord = distMode === 'groups' ? 'กลุ่มแชท' : 'ผู้ดูแล';
    const confirmMsg = `ยืนยันการอนุมัติและกระจายลูกค้าจำนวน ${total} คน ให้กับ${targetWord}ที่เลือกใช่หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsApproving(true);
      setApprovedCount(0);

      const batchSize = 10;
      let count = 0;

      for (let i = 0; i < simulatedAssignments.length; i += batchSize) {
        const batch = simulatedAssignments.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (item) => {
            const rec = activeRecipients.find((r) => r.id === item.recipientId);
            if (!rec) return;

            if (distMode === 'groups' && rec.careGroup) {
              const memberIds = rec.agents.map((a) => a.id);
              const persistAsSavedGroup = !rec.isUnsavedAuto || syncToSettings;
              await assignConversation(item.conversation.id, {
                id: memberIds[0] || null,
                name: persistAsSavedGroup ? rec.careGroup.name : rec.name,
                avatar: rec.agents[0]?.avatar_url,
                groupId: persistAsSavedGroup ? rec.careGroup.id : null,
                groupName: persistAsSavedGroup ? rec.careGroup.name : null,
                assignedAgentIds: memberIds,
                autoRouted: true,
                skipIfAssigned: true,
              });
            } else if (rec.agents[0]) {
              const ag = rec.agents[0];
              await assignConversation(item.conversation.id, {
                id: ag.id,
                name: ag.first_name,
                avatar: ag.avatar_url,
                groupId: null,
                groupName: null,
                assignedAgentIds: [ag.id],
                autoRouted: true,
                skipIfAssigned: true,
              });
            }
            count++;
            setApprovedCount(count);
          })
        );
      }

      // If distributed into saved (or newly promoted) care groups, sync customer_ids cleanly in chat_care_groups
      if (distMode === 'groups') {
        let updatedCareGroups = [...careGroups];
        const byGroup = new Map<string, string[]>();
        simulatedAssignments.forEach((item) => {
          const arr = byGroup.get(item.recipientId) || [];
          arr.push(item.conversation.id);
          byGroup.set(item.recipientId, arr);
        });
        let changedCareGroups = false;
        byGroup.forEach((custIds, grpId) => {
          const rec = activeRecipients.find((r) => r.id === grpId);
          if (!rec?.careGroup) return;
          if (rec.isUnsavedAuto && !syncToSettings) return;
          changedCareGroups = true;
          updatedCareGroups = upsertExclusiveCareGroup(updatedCareGroups, {
            id: rec.careGroup.id,
            name: rec.careGroup.name,
            customerIds: custIds,
            agentIds: rec.careGroup.agent_ids,
            isAuto: rec.careGroup.is_auto,
            mergeCustomers: true,
            mergeAgents: true,
          });
        });
        if (changedCareGroups) {
          await saveChatCareGroups(updatedCareGroups);
        }
      }

      if (syncToSettings) {
        const latestCfg = await fetchChatSystemConfig();
        if (distMode === 'groups') {
          const nextGrpWeights = { ...(latestCfg.group_weights || {}) };
          activeRecipients.forEach((rec) => {
            if (rec.isUnsavedAuto && !selectedGroupIds.includes(rec.id)) return;
            const prev = nextGrpWeights[rec.id] || { weight: 1, max_active_chats: 0, is_paused: false };
            nextGrpWeights[rec.id] = {
              weight: Math.max(1, groupWeights[rec.id] ?? prev.weight ?? 1),
              max_active_chats: prev.max_active_chats ?? 0,
              is_paused: !selectedGroupIds.includes(rec.id),
              allowed_brands: prev.allowed_brands ?? rec.allowedBrands ?? [],
            };
          });
          await saveChatSystemConfig({
            ...latestCfg,
            routing_target_mode: 'groups',
            default_fallback_agent_id: null,
            routing_epoch_at: new Date().toISOString(),
            group_weights: nextGrpWeights,
          });
        } else {
          const nextWeights = { ...(latestCfg.agent_weights || {}) };
          eligibleStaff.forEach((u) => {
            const prev = nextWeights[u.id] || { weight: 1, max_active_chats: 0, is_paused: false };
            nextWeights[u.id] = {
              weight: Math.max(1, agentWeights[u.id] ?? prev.weight ?? 1),
              max_active_chats: prev.max_active_chats ?? 0,
              is_paused: !selectedAgentIds.includes(u.id),
              allowed_brands: prev.allowed_brands ?? agentBrandLocks[u.id] ?? [],
            };
          });
          await saveChatSystemConfig({
            ...latestCfg,
            routing_target_mode: 'agents',
            default_fallback_agent_id: null,
            routing_epoch_at: new Date().toISOString(),
            agent_weights: nextWeights,
          });
        }
      }

      setSuccessMessage(
        syncToSettings
          ? `✅ อนุมัติจ่ายงาน ${total} เคส และบันทึกสัดส่วน % (${distMode === 'groups' ? 'โหมดกลุ่ม' : 'โหมดรายเซลล์'}) เป็นค่าหลักเรียบร้อยแล้ว`
          : `✅ อนุมัติและกระจายลูกค้าสำเร็จเรียบร้อยแล้ว ทั้งหมด ${total} เคส`
      );

      setTimeout(() => {
        setSuccessMessage(null);
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to approve assignments:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกจ่ายงาน: ' + (err.message || 'Unknown error'));
    } finally {
      setIsApproving(false);
    }
  };

  if (!isOpen) return null;

  const brandTabs = [
    { slug: 'all', label: 'ทั้งหมด', count: brandCounts.all || 0 },
    { slug: 'wallcraft', label: 'Wallcraft', count: brandCounts['wallcraft'] || 0 },
    { slug: 'terrahome', label: 'Terra', count: (brandCounts['terra'] || 0) + (brandCounts['terrahome'] || 0) },
    { slug: 'zenslab', label: 'ZenSlab', count: brandCounts['zenslab'] || 0 },
    { slug: 'emberandash', label: 'Ember', count: (brandCounts['ember'] || 0) + (brandCounts['emberandash'] || 0) },
  ];

  const renderCustomerPreviewRow = (
    c: UnassignedCustomer,
    assignedRec: DistributionRecipient,
    inGroupedView: boolean
  ) => {
    const bInfo = getBrandDisplay(c.brand, channels);
    const isLine = c.platform === 'line';
    const isIg = c.platform === 'instagram';
    const avatarBg = isLine ? '#D1FAE5' : isIg ? '#FCE7F3' : '#DBEAFE';
    const avatarColor = isLine ? '#065F46' : isIg ? '#9D174D' : '#1E40AF';
    const badgeTitle = isLine ? 'LINE Official Account' : isIg ? 'Instagram Direct' : 'Facebook Messenger';

    return (
      <div
        key={c.id}
        className="py-2.5 px-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: avatarBg,
                color: avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.78rem',
                overflow: 'hidden',
              }}
            >
              {c.customer_avatar ? (
                <img
                  src={avatarUrl(c.customer_avatar) || c.customer_avatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                c.customer_name.charAt(0).toUpperCase() || 'C'
              )}
            </div>

            <span
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #ffffff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                overflow: 'hidden',
                zIndex: 2,
              }}
              title={badgeTitle}
            >
              {isLine ? <LineIcon size={10} /> : isIg ? <InstagramIcon size={10} /> : <FacebookIcon size={10} />}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-xs text-slate-900 dark:text-zinc-100 truncate" title={c.customer_name}>
                {c.customer_name}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: bInfo.bg,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3.5px',
                  whiteSpace: 'nowrap',
                }}
                title={bInfo.label}
              >
                {bInfo.logo ? (
                  <img
                    src={bInfo.logo}
                    alt=""
                    style={{ width: '11px', height: '11px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: bInfo.bg,
                      display: 'inline-block',
                    }}
                  />
                )}
                <span>{bInfo.shortLabel}</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-400 truncate mt-0.5">
              {c.last_message || 'ไม่มีข้อความล่าสุด'}
            </p>
          </div>
        </div>

        {/* Recipient override selector */}
        <div className="shrink-0">
          <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50/70 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200/90 dark:border-zinc-700 hover:border-blue-300 text-[11px] transition-colors cursor-pointer group">
            {inGroupedView ? (
              <span className="font-bold text-slate-500 group-hover:text-blue-600 dark:text-zinc-300">
                ย้าย ▾
              </span>
            ) : (
              <>
                <RecipientAvatar agents={assignedRec.agents} name={assignedRec.name} size={18} />
                <span className="font-bold text-slate-800 dark:text-zinc-200 max-w-[110px] truncate">
                  {assignedRec.name}
                </span>
                <span className="text-slate-400 group-hover:text-blue-600 text-[10px]">▾</span>
              </>
            )}

            <select
              value={assignedRec.id}
              onChange={(e) => handleOverrideRecipient(c.id, e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-xs"
              title={`ย้าย ${c.customer_name} ไปยังผู้รับอื่น`}
            >
              {activeRecipients
                .filter((r) => activeSelectedIds.includes(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
    >
      <div className="w-full max-w-7xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[92vh] max-h-[940px] overflow-hidden animate-fadeIn">
        {/* Compact Clean Header */}
        <div className="px-5 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-zinc-900">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Dices size={17} className={isRolling ? 'animate-spin' : ''} />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
              {distMode === 'groups' ? 'สุ่มกระจายแชทเข้ากลุ่ม' : 'สุ่มกระจายแชทให้เซลล์'}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100/90 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              รอแจก {filteredCustomers.length} เคส
            </span>
            {unmatchedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                ข้าม {unmatchedCount} เคส (คนละแบรนด์)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Segmented Mode Switcher */}
            <div className="p-0.5 rounded-lg bg-slate-200/70 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleModeChange('agents')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all ${
                  distMode === 'agents'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400'
                }`}
              >
                รายเซลล์
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('groups')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all ${
                  distMode === 'groups'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400'
                }`}
              >
                รายกลุ่ม ({careGroups.length}
                {detectedAutoGroups.length > 0 ? ` + ${detectedAutoGroups.length} ออโต้` : ''})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isApproving}
              className="w-8 h-8 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-all disabled:opacity-40"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Success Toast Banner */}
        {successMessage && (
          <div className="p-2.5 bg-emerald-600 text-white flex items-center justify-center gap-2 text-xs font-bold animate-fadeIn shrink-0">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Main 2-Column Body */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2.5">
            <RefreshCw size={26} className="animate-spin text-blue-600" />
            <p className="text-xs font-bold">กำลังโหลดข้อมูล...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* LEFT COLUMN: Brand Filter + Recipient Weight List */}
            <div className="w-full md:w-[390px] lg:w-[410px] border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 flex flex-col shrink-0 overflow-hidden">
              {/* Brand Filter Bar */}
              <div className="px-4 py-3 border-b border-slate-200/70 dark:border-zinc-800 space-y-2 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {brandTabs.map((tab) => {
                    const isActive = brandFilter.toLowerCase() === tab.slug.toLowerCase();
                    const bInfo = tab.slug === 'all' ? null : getBrandDisplay(tab.slug, channels);
                    return (
                      <button
                        key={tab.slug}
                        type="button"
                        onClick={() => handleBrandChange(tab.slug)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 border border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        {bInfo &&
                          (bInfo.logo ? (
                            <img src={bInfo.logo} alt="" className="w-3 h-3 rounded-full object-cover" />
                          ) : (
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ background: isActive ? '#ffffff' : bInfo.bg }}
                            />
                          ))}
                        <span>{tab.label}</span>
                        <span
                          className={`text-[10px] font-extrabold ${
                            isActive ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipient Header Toolbar */}
              <div className="px-4 py-2 border-b border-slate-200/70 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 bg-white/60 dark:bg-zinc-900">
                <span className="text-xs font-black text-slate-800 dark:text-zinc-200">
                  {distMode === 'groups'
                    ? `เลือกกลุ่ม (${activeSelectedIds.length}/${activeRecipients.length})`
                    : `เลือกเซลล์ (${activeSelectedIds.length}/${activeRecipients.length})`}
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllRecipients}
                    className="text-blue-600 hover:underline font-bold cursor-pointer"
                  >
                    ทั้งหมด
                  </button>
                  <span className="text-slate-300 dark:text-zinc-700">·</span>
                  <button
                    type="button"
                    onClick={deselectAllRecipients}
                    className="text-slate-400 hover:text-red-500 font-semibold cursor-pointer"
                  >
                    ล้าง
                  </button>
                  <span className="text-slate-300 dark:text-zinc-700">·</span>
                  <button
                    type="button"
                    onClick={handleEqualizeWeights}
                    className="text-emerald-600 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                    title="ปรับน้ำหนักทุกคนเป็น 1x เท่ากัน"
                  >
                    <Scale size={11} />
                    <span>1:1</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Clean Recipient List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                {activeRecipients.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-slate-400">
                    {distMode === 'groups'
                      ? 'ยังไม่มีกลุ่มแชท'
                      : 'ไม่มีรายชื่อเซลล์ที่พร้อมสุ่ม'}
                  </div>
                ) : (
                  activeRecipients.map((rec) => {
                    const isSelected = activeSelectedIds.includes(rec.id);
                    const breakdownItem = recipientBreakdown.find((b) => b.recipient.id === rec.id);
                    const assignedCount = breakdownItem?.count ?? 0;
                    const weight = activeWeights[rec.id] ?? 1;
                    const targetSharePercent =
                      totalActiveWeight > 0 && isSelected ? Math.round((weight / totalActiveWeight) * 100) : 0;

                    return (
                      <div
                        key={rec.id}
                        className={`px-4 py-2.5 transition-colors ${
                          isSelected
                            ? 'bg-white dark:bg-zinc-900'
                            : 'bg-slate-50/50 dark:bg-zinc-900/50 opacity-50 hover:opacity-80'
                        }`}
                      >
                        <div
                          onClick={() => toggleRecipient(rec.id)}
                          className="flex items-center justify-between gap-2.5 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                              }`}
                            >
                              {isSelected && <Check size={11} strokeWidth={3} />}
                            </div>

                            <RecipientAvatar agents={rec.agents} name={rec.name} size={28} />

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                {rec.isAuto && (
                                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100/80 text-amber-800 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                                    กลุ่มออโต้
                                  </span>
                                )}
                                <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                                  {rec.name}
                                </span>
                                {rec.badge && (
                                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 shrink-0">
                                    {rec.badge}
                                  </span>
                                )}
                              </div>
                              {(rec.subtitle || (rec.isAuto && !isSelected) || (rec.allowedBrands && rec.allowedBrands.length > 0)) && (
                                <div className="flex items-center gap-1.5 flex-wrap text-[10.5px] text-slate-400 truncate">
                                  {rec.subtitle && <span>{rec.subtitle}</span>}
                                  {rec.isAuto && !isSelected && <span>· ยังไม่นับ (ติ๊กเลือกได้)</span>}
                                  {rec.allowedBrands &&
                                    rec.allowedBrands.map((bSlug) => {
                                      const bInfo = getBrandDisplay(bSlug, channels);
                                      return (
                                        <span
                                          key={bSlug}
                                          style={{ color: bInfo.bg }}
                                          className="inline-flex items-center gap-0.5 font-bold"
                                        >
                                          · {bInfo.shortLabel}
                                        </span>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {isSelected ? (
                              <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                                {assignedCount} เคส
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">ไม่สุ่ม</span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-2 pl-6 flex items-center gap-2">
                            <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-md p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleWeightChange(rec.id, -1);
                                }}
                                disabled={weight <= 1}
                                className="w-5 h-5 rounded flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer"
                              >
                                <Minus size={10} strokeWidth={3} />
                              </button>
                              <span className="w-6 text-center text-[11px] font-black text-slate-800 dark:text-zinc-100">
                                {weight}x
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleWeightChange(rec.id, 1);
                                }}
                                className="w-5 h-5 rounded flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 cursor-pointer"
                              >
                                <Plus size={10} strokeWidth={3} />
                              </button>
                            </div>

                            <input
                              type="range"
                              min={1}
                              max={10}
                              step={1}
                              value={weight}
                              onChange={(e) => handleSetExactWeight(rec.id, Number(e.target.value))}
                              className="flex-1 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />

                            <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 shrink-0 min-w-[32px] text-right">
                              {targetSharePercent}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Left Footer: Clean Re-roll Button */}
              <div className="p-3 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
                <button
                  type="button"
                  onClick={handleReRoll}
                  disabled={isRolling || filteredCustomers.length === 0 || activeSelectedIds.length === 0}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} className={isRolling ? 'animate-spin' : ''} />
                  <span>{isRolling ? 'กำลังสุ่ม...' : 'สุ่มใหม่อีกรอบ'}</span>
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: Distribution Result Preview */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">
              {/* Header Bar */}
              <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-2.5 shrink-0 flex-wrap bg-slate-50/40 dark:bg-zinc-900">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-black text-slate-800 dark:text-zinc-100">
                    ผลลัพธ์ ({displayedAssignments.length})
                  </span>

                  <div className="p-0.5 bg-slate-100 dark:bg-zinc-800 rounded-lg flex items-center gap-0.5 border border-slate-200/80 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => setViewMode('grouped')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        viewMode === 'grouped'
                          ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400'
                      }`}
                    >
                      <Layers size={12} />
                      <span>แยกตามผู้รับ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewMode('flat')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        viewMode === 'flat'
                          ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400'
                      }`}
                    >
                      <LayoutList size={12} />
                      <span>ตารางรวม</span>
                    </button>
                  </div>

                  {viewMode === 'grouped' && groupedAssignments.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllCollapse}
                      className="text-[11px] font-bold text-slate-500 hover:text-blue-600 cursor-pointer"
                    >
                      {isAllCollapsed ? 'ขยายทั้งหมด' : 'ยุบทั้งหมด'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={previewAgentFilter}
                    onChange={(e) => setPreviewAgentFilter(e.target.value)}
                    className="px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg font-bold text-slate-700 dark:text-zinc-200 cursor-pointer focus:outline-none"
                  >
                    <option value="all">ทั้งหมด ({simulatedAssignments.length})</option>
                    {recipientBreakdown.map((item) => (
                      <option key={item.recipient.id} value={item.recipient.id}>
                        {item.recipient.name} ({item.count})
                      </option>
                    ))}
                  </select>

                  <div className="relative w-40 sm:w-48 shrink-0">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาลูกค้า, แบรนด์..."
                      className="w-full pl-7 pr-2.5 py-1 text-[11px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Scrollable Results Body */}
              <div className="flex-1 overflow-y-auto p-4">
                {displayedAssignments.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-16">
                    {filteredCustomers.length === 0
                      ? 'ไม่มีลูกค้าค้างในแบรนด์นี้'
                      : activeSelectedIds.length === 0
                      ? 'กรุณาเลือกผู้รับงานทางด้านซ้ายเพื่อจำลองผล'
                      : 'ไม่พบรายการตามคำค้นหา'}
                  </div>
                ) : viewMode === 'grouped' ? (
                  <div className="space-y-3">
                    {groupedAssignments.map((group) => {
                      const isCollapsed = Boolean(collapsedAgentIds[group.recipient.id]);
                      return (
                        <div
                          key={group.recipient.id}
                          className="border border-slate-200/90 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900"
                        >
                          <div
                            onClick={() => toggleCollapse(group.recipient.id)}
                            className="px-3.5 py-2.5 bg-slate-50/90 hover:bg-slate-100/80 dark:bg-zinc-800/70 border-b border-slate-200/70 dark:border-zinc-800 flex items-center justify-between gap-2.5 cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-slate-500">
                                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                              </span>
                              <RecipientAvatar
                                agents={group.recipient.agents}
                                name={group.recipient.name}
                                size={28}
                              />
                              <span className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate">
                                {group.recipient.name}
                              </span>
                              {group.recipient.badge && (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-200/80 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300 shrink-0">
                                  {group.recipient.badge}
                                </span>
                              )}
                            </div>

                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/70 shrink-0">
                              {group.count} เคส · {group.percent}%
                            </span>
                          </div>

                          {!isCollapsed && (
                            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                              {group.items.length === 0 ? (
                                <div className="py-4 text-center text-xs text-slate-400">
                                  ไม่มีรายการที่ตรงเงื่อนไข
                                </div>
                              ) : (
                                group.items.map(({ conversation: c }) =>
                                  renderCustomerPreviewRow(c, group.recipient, true)
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="border border-slate-200/90 dark:border-zinc-800 rounded-xl divide-y divide-slate-100 dark:divide-zinc-800 overflow-hidden">
                    {displayedAssignments.map(({ conversation: c, recipientId }) => {
                      const assignedRec = activeRecipients.find((r) => r.id === recipientId) || activeRecipients[0];
                      if (!assignedRec) return null;
                      return renderCustomerPreviewRow(c, assignedRec, false);
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Clean Footer Bar */}
        <div className="px-5 py-3 border-t border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-bold text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
              <span>
                {simulatedAssignments.length > 0
                  ? `จ่าย ${simulatedAssignments.length} เคส → ${recipientBreakdown.length} ${
                      distMode === 'groups' ? 'กลุ่ม' : 'คน'
                    }`
                  : `รอจ่าย ${filteredCustomers.length} เคส`}
              </span>
            </div>

            <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-300 cursor-pointer select-none px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-blue-300">
              <input
                type="checkbox"
                checked={syncToSettings}
                onChange={(e) => setSyncToSettings(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
              />
              <span>บันทึกสัดส่วนนี้เป็นค่าเริ่มต้นด้วย</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isApproving}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
            >
              ยกเลิก
            </button>

            {simulatedAssignments.length > 0 && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving || simulatedAssignments.length === 0}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isApproving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>กำลังจ่ายงาน ({approvedCount}/{simulatedAssignments.length})...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>ยืนยันจ่ายงาน ({simulatedAssignments.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
