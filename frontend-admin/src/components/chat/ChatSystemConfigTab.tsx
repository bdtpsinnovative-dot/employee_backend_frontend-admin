import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  ShieldCheck,
  Lock,
  Globe,
  Clock,
  Sliders,
  Check,
  RefreshCw,
  Save,
  Pause,
  Play,
  RotateCcw,
  UserPlus,
  Users,
  Dices,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatSystemConfig,
  saveChatSystemConfig,
  fetchChatAccessUsers,
  fetchChatCareGroups,
  saveChatCareGroups,
  upsertExclusiveCareGroup,
  detectAutoCareGroups,
  getSortedChatStaff,
  fetchRoutingWorkloadCounts,
  getChannelBrandOptions,
  isBrandAllowed,
  normalizeBrandSlug,
  DEFAULT_CHAT_SYSTEM_CONFIG,
} from '../../services/chatRoutingService';
import type { DetectedAutoCareGroup } from '../../services/chatRoutingService';
import type { ChatSystemConfig, User, ChatAccessUser, ChatCareGroup, ChatChannel, AgentWeightConfig } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';
import ChatDistributionModal from './ChatDistributionModal';
import BrandLockSelector from './BrandLockSelector';

function StaffAvatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
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
        fontSize: size <= 24 ? '0.65rem' : '0.8rem',
        flexShrink: 0,
      }}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

interface ChatSystemConfigTabProps {
  onNavigateToAccess?: () => void;
  onNavigateToGroups?: () => void;
}

export default function ChatSystemConfigTab({ onNavigateToAccess, onNavigateToGroups }: ChatSystemConfigTabProps) {
  const [config, setConfig] = useState<ChatSystemConfig>(DEFAULT_CHAT_SYSTEM_CONFIG);
  const [initialWeightsKey, setInitialWeightsKey] = useState<string>('');
  const [initialGroupWeightsKey, setInitialGroupWeightsKey] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [accessUsers, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [careGroups, setCareGroups] = useState<ChatCareGroup[]>([]);
  const [detectedAutoGroups, setDetectedAutoGroups] = useState<DetectedAutoCareGroup[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [workload, setWorkload] = useState<{
    activeCounts: Record<string, number>;
    epochCounts: Record<string, number>;
    activeGroupCounts: Record<string, number>;
    epochGroupCounts: Record<string, number>;
  }>({
    activeCounts: {},
    epochCounts: {},
    activeGroupCounts: {},
    epochGroupCounts: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [ratioSubTab, setRatioSubTab] = useState<'agents' | 'groups'>('agents');
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [distributionLaunchMode, setDistributionLaunchMode] = useState<'agents' | 'groups'>('agents');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, userList, accessList, careGroupList, chRes, convsRes] = await Promise.all([
        fetchChatSystemConfig(),
        fetchUsers().catch(() => []),
        fetchChatAccessUsers().catch(() => []),
        fetchChatCareGroups().catch(() => []),
        supabase.from('chat_channels').select('*').order('created_at', { ascending: true }),
        supabase
          .from('chat_conversations')
          .select('id, assigned_to, metadata')
          .order('last_message_at', { ascending: false })
          .limit(300),
      ]);
      const counts = await fetchRoutingWorkloadCounts(cfg.routing_epoch_at);
      const { unsavedAutoGroups } = detectAutoCareGroups(
        (convsRes.data || []) as Array<{ id: string; assigned_to?: string | null; metadata?: Record<string, any> }>,
        careGroupList,
        userList
      );
      setConfig(cfg);
      setInitialWeightsKey(JSON.stringify(cfg.agent_weights || {}));
      setInitialGroupWeightsKey(JSON.stringify(cfg.group_weights || {}));
      setRatioSubTab(cfg.routing_target_mode === 'groups' ? 'groups' : 'agents');
      setUsers(userList);
      setAccessUsers(accessList);
      setCareGroups(careGroupList);
      setDetectedAutoGroups(unsavedAutoGroups);
      setChannels((chRes.data || []) as ChatChannel[]);
      setWorkload(counts);
    } catch (err: any) {
      console.error('Failed to load chat system config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Sales/staff first, Super Admins at the bottom
  const staffWithChatAccess = getSortedChatStaff(users, accessUsers);

  const hasActiveMember = (agentIds: string[]) =>
    (agentIds || []).some((id) => users.some((u) => u.id === id && (!u.status || u.status === 'active')));

  // Saved care groups (named + promoted auto-groups) + unsaved auto-groups
  const eligibleCareGroups = careGroups.filter((g) => hasActiveMember(g.agent_ids));
  const eligibleAutoGroups = detectedAutoGroups.filter((a) => hasActiveMember(a.agentIds));

  interface CombinedGroupItem {
    id: string;
    name: string;
    agentIds: string[];
    customerIds: string[];
    allowedBrands: string[];
    isAuto: boolean;
    isUnsavedAuto: boolean;
  }

  const combinedGroupItems: CombinedGroupItem[] = [
    ...eligibleCareGroups.map((g) => ({
      id: g.id,
      name: g.name,
      agentIds: g.agent_ids || [],
      customerIds: g.customer_ids || [],
      allowedBrands: g.allowed_brands || [],
      isAuto: Boolean(g.is_auto),
      isUnsavedAuto: false,
    })),
    ...eligibleAutoGroups.map((a) => ({
      id: a.id,
      name: a.defaultName,
      agentIds: a.agentIds,
      customerIds: a.customerIds,
      allowedBrands: config.group_weights?.[a.id]?.allowed_brands || [],
      isAuto: true,
      isUnsavedAuto: true,
    })),
  ];

  const isGroupPausedInDraft = (item: Pick<CombinedGroupItem, 'id' | 'isUnsavedAuto'>) =>
    item.isUnsavedAuto
      ? config.group_weights?.[item.id]?.is_paused ?? true
      : config.group_weights?.[item.id]?.is_paused ?? false;

  const brandOptions = getChannelBrandOptions(channels);

  // Shared weight map normalizer covering every eligible agent or group ID explicitly
  const buildNormalizedWeights = (
    ids: string[],
    source: Record<string, AgentWeightConfig> | undefined
  ): Record<string, AgentWeightConfig> => {
    const normalized: Record<string, AgentWeightConfig> = { ...(source || {}) };
    ids.forEach((id) => {
      const existing = normalized[id];
      normalized[id] = {
        weight: Math.max(1, existing?.weight ?? 1),
        max_active_chats: Math.max(0, existing?.max_active_chats ?? 0),
        is_paused: Boolean(existing?.is_paused ?? false),
        allowed_brands: Array.isArray(existing?.allowed_brands) ? existing.allowed_brands : [],
      };
    });
    return normalized;
  };

  // Promote any ticked unsaved auto-groups & sync allowed_brands cleanly before persisting
  const resolvePersistedGroupsAndWeights = () => {
    const promotedAutoGroups = eligibleAutoGroups.filter(
      (a) => config.group_weights?.[a.id]?.is_paused === false
    );
    const untickedUnsavedIds = new Set(
      eligibleAutoGroups
        .filter((a) => config.group_weights?.[a.id]?.is_paused !== false)
        .map((a) => a.id)
    );

    let nextCareGroups = [...careGroups];
    promotedAutoGroups.forEach((a) => {
      nextCareGroups = upsertExclusiveCareGroup(nextCareGroups, {
        id: a.id,
        name: a.defaultName,
        customerIds: a.customerIds,
        agentIds: a.agentIds,
        allowedBrands: config.group_weights?.[a.id]?.allowed_brands || [],
        isAuto: true,
      });
    });

    const filteredSourceWeights: Record<string, AgentWeightConfig> = {};
    Object.entries(config.group_weights || {}).forEach(([k, v]) => {
      if (!untickedUnsavedIds.has(k)) filteredSourceWeights[k] = v;
    });

    const allPersistedGroupIds = [
      ...eligibleCareGroups.map((g) => g.id),
      ...promotedAutoGroups.map((a) => a.id),
    ];
    const normalizedGroupWeights = buildNormalizedWeights(allPersistedGroupIds, filteredSourceWeights);

    const syncedCareGroups = nextCareGroups.map((grp) => {
      const weightBrands = normalizedGroupWeights[grp.id]?.allowed_brands;
      const resolvedBrands = weightBrands !== undefined ? weightBrands : grp.allowed_brands || [];
      if (normalizedGroupWeights[grp.id]) {
        normalizedGroupWeights[grp.id].allowed_brands = resolvedBrands;
      }
      return { ...grp, allowed_brands: resolvedBrands };
    });

    return { syncedCareGroups, normalizedGroupWeights, promotedAutoGroups, allPersistedGroupIds };
  };

  // Handle Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const normalizedAgentWeights = buildNormalizedWeights(
        staffWithChatAccess.map((u) => u.id),
        config.agent_weights
      );
      const { syncedCareGroups, normalizedGroupWeights, promotedAutoGroups, allPersistedGroupIds } =
        resolvePersistedGroupsAndWeights();

      const weightsChanged =
        JSON.stringify(normalizedAgentWeights) !== initialWeightsKey ||
        JSON.stringify(normalizedGroupWeights) !== initialGroupWeightsKey;
      const nextEpochAt =
        weightsChanged || !config.routing_epoch_at
          ? new Date().toISOString()
          : config.routing_epoch_at;

      const configToSave: ChatSystemConfig = {
        ...config,
        routing_target_mode: config.routing_target_mode || 'agents',
        routing_working_hours_only: false,
        default_fallback_agent_id: null,
        routing_epoch_at: nextEpochAt,
        agent_weights: normalizedAgentWeights,
        group_weights: normalizedGroupWeights,
      };

      const [ok] = await Promise.all([
        saveChatSystemConfig(configToSave),
        syncedCareGroups.length > 0 ? saveChatCareGroups(syncedCareGroups) : Promise.resolve(true),
      ]);
      if (ok) {
        const promotedIds = new Set(promotedAutoGroups.map((a) => a.id));
        setConfig(configToSave);
        setCareGroups(syncedCareGroups);
        setDetectedAutoGroups((prev) => prev.filter((a) => !promotedIds.has(a.id)));
        setInitialWeightsKey(JSON.stringify(normalizedAgentWeights));
        setInitialGroupWeightsKey(JSON.stringify(normalizedGroupWeights));
        const counts = await fetchRoutingWorkloadCounts(nextEpochAt);
        setWorkload(counts);
        if (configToSave.routing_target_mode === 'groups') {
          const activeGrpCount = allPersistedGroupIds.filter(
            (id) => !normalizedGroupWeights[id]?.is_paused
          ).length;
          showNotification(
            `บันทึกการตั้งค่าเรียบร้อยแล้ว! ระบบพร้อมจ่ายแชทใหม่ให้กลุ่มแชท ${activeGrpCount} กลุ่ม ตามสัดส่วน % และแบรนด์ที่ล็อคไว้อัตโนมัติ`
          );
        } else {
          const activeCount = staffWithChatAccess.filter((u) => !normalizedAgentWeights[u.id]?.is_paused).length;
          showNotification(
            `บันทึกการตั้งค่าเรียบร้อยแล้ว! ระบบพร้อมจ่ายแชทใหม่ให้ทีมงาน ${activeCount} คน ตามสัดส่วน % และแบรนด์ที่ล็อคไว้อัตโนมัติ`
          );
        }
      } else {
        alert('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset % balancing epoch counter cleanly
  const handleResetEpoch = async () => {
    const nextEpoch = new Date().toISOString();
    const normalizedAgentWeights = buildNormalizedWeights(
      staffWithChatAccess.map((u) => u.id),
      config.agent_weights
    );
    const { syncedCareGroups, normalizedGroupWeights, promotedAutoGroups } =
      resolvePersistedGroupsAndWeights();
    const updatedCfg: ChatSystemConfig = {
      ...config,
      routing_target_mode: config.routing_target_mode || 'agents',
      default_fallback_agent_id: null,
      routing_epoch_at: nextEpoch,
      agent_weights: normalizedAgentWeights,
      group_weights: normalizedGroupWeights,
    };
    setSaving(true);
    const [ok] = await Promise.all([
      saveChatSystemConfig(updatedCfg),
      promotedAutoGroups.length > 0 ? saveChatCareGroups(syncedCareGroups) : Promise.resolve(true),
    ]);
    setSaving(false);
    if (ok) {
      const promotedIds = new Set(promotedAutoGroups.map((a) => a.id));
      setConfig(updatedCfg);
      setCareGroups(syncedCareGroups);
      setDetectedAutoGroups((prev) => prev.filter((a) => !promotedIds.has(a.id)));
      setInitialWeightsKey(JSON.stringify(normalizedAgentWeights));
      setInitialGroupWeightsKey(JSON.stringify(normalizedGroupWeights));
      setWorkload((prev) => ({ ...prev, epochCounts: {}, epochGroupCounts: {} }));
      showNotification('เริ่มนับรอบสัดส่วน % ใหม่เรียบร้อยแล้ว (เคสใหม่จะนับ 0 ใหม่ทั้งหมด)');
    }
  };

  // Equalize weights (applies to whichever sub-tab is active: agents or groups)
  const handleEqualizeWeights = () => {
    if (ratioSubTab === 'groups') {
      const updated = { ...(config.group_weights || {}) };
      combinedGroupItems.forEach((g) => {
        const paused = isGroupPausedInDraft(g);
        const current = updated[g.id] || { weight: 1, max_active_chats: 0, is_paused: paused };
        updated[g.id] = { ...current, weight: 1 };
      });
      setConfig((prev) => ({ ...prev, group_weights: updated }));
      showNotification('ปรับสัดส่วนการสุ่มกลุ่มเป็น 1:1 เท่ากันทุกกลุ่มเรียบร้อย');
      return;
    }
    const updated = { ...(config.agent_weights || {}) };
    staffWithChatAccess.forEach((u) => {
      const current = updated[u.id] || { weight: 1, max_active_chats: 0, is_paused: false };
      updated[u.id] = { ...current, weight: 1 };
    });
    setConfig((prev) => ({ ...prev, agent_weights: updated }));
    showNotification('ปรับสัดส่วนการสุ่มเป็น 1:1 เท่ากันทุกคนเรียบร้อย');
  };

  // Active agents & total weight
  const activeReadyAgents = staffWithChatAccess.filter(
    (u) => !(config.agent_weights?.[u.id]?.is_paused ?? false)
  );
  const totalWeight = activeReadyAgents.reduce((sum, u) => {
    return sum + Math.max(1, config.agent_weights?.[u.id]?.weight ?? 1);
  }, 0);

  // Active groups & total weight (unticked/paused groups do NOT count)
  const activeReadyGroups = combinedGroupItems.filter((g) => !isGroupPausedInDraft(g));
  const totalGroupWeight = activeReadyGroups.reduce((sum, g) => {
    return sum + Math.max(1, config.group_weights?.[g.id]?.weight ?? 1);
  }, 0);

  interface BrandShareItem {
    slug: string;
    shortLabel: string;
    bg: string;
    pct: number;
  }

  // Compute exact brand-aware routing share (%) so locked brands never display misleading global %
  const computePoolBrandMetrics = (
    activeItems: Array<{ id: string; weight: number; allowedBrands?: string[] }>
  ) => {
    const byBrand: Record<string, { totalWeight: number; activeCount: number }> = {};
    brandOptions.forEach((b) => {
      const eligible = activeItems.filter((it) => isBrandAllowed(it.allowedBrands, b.slug));
      byBrand[b.slug] = {
        totalWeight: eligible.reduce((s, it) => s + Math.max(1, it.weight), 0),
        activeCount: eligible.length,
      };
    });

    const getEntityShares = (
      weight: number,
      allowedBrands: string[] | undefined,
      isPaused: boolean,
      globalPct: number
    ): { hasCustomBrandPct: boolean; shares: BrandShareItem[]; globalPct: number } => {
      if (isPaused) return { hasCustomBrandPct: false, shares: [], globalPct: 0 };

      const accepted = brandOptions.filter((b) => isBrandAllowed(allowedBrands, b.slug));
      const shares: BrandShareItem[] = accepted.map((b) => {
        const bw = byBrand[b.slug]?.totalWeight || 0;
        const pct = bw > 0 ? Math.round((Math.max(1, weight) / bw) * 100) : 0;
        return { slug: b.slug, shortLabel: b.shortLabel, bg: b.bg, pct };
      });

      const isExplicitLock =
        Boolean(allowedBrands && allowedBrands.length > 0 && !allowedBrands.some((b) => normalizeBrandSlug(b) === 'all'));
      const differsFromGlobal = shares.some((s) => s.pct !== globalPct);
      return {
        hasCustomBrandPct: isExplicitLock || differsFromGlobal,
        shares,
        globalPct,
      };
    };

    return { byBrand, getEntityShares };
  };

  const agentPoolMetrics = computePoolBrandMetrics(
    activeReadyAgents.map((u) => ({
      id: u.id,
      weight: config.agent_weights?.[u.id]?.weight ?? 1,
      allowedBrands: config.agent_weights?.[u.id]?.allowed_brands,
    }))
  );

  const groupPoolMetrics = computePoolBrandMetrics(
    activeReadyGroups.map((g) => ({
      id: g.id,
      weight: config.group_weights?.[g.id]?.weight ?? 1,
      allowedBrands:
        config.group_weights?.[g.id]?.allowed_brands !== undefined
          ? config.group_weights[g.id].allowed_brands
          : g.allowedBrands,
    }))
  );

  const activePoolMetrics = ratioSubTab === 'groups' ? groupPoolMetrics : agentPoolMetrics;

  const renderRatioRow = (opts: {
    key: string;
    isPaused: boolean;
    isFaintAuto?: boolean;
    isAutoGroup?: boolean;
    hideControlsWhenFaint?: boolean;
    weight: number;
    percent: number;
    brandShares: BrandShareItem[];
    hasCustomBrandPct: boolean;
    maxActive: number;
    allowedBrands?: string[];
    avatar: ReactNode;
    title: string;
    badges?: ReactNode;
    subtitle: string;
    onWeightChange: (val: number) => void;
    onMaxActiveChange: (val: number) => void;
    onTogglePause: () => void;
    onBrandsChange: (brands: string[]) => void;
  }) => {
    const {
      key,
      isPaused,
      isFaintAuto = false,
      isAutoGroup = false,
      hideControlsWhenFaint = false,
      weight,
      percent,
      brandShares,
      hasCustomBrandPct,
      maxActive,
      allowedBrands,
      avatar,
      title,
      badges,
      subtitle,
      onWeightChange,
      onMaxActiveChange,
      onTogglePause,
      onBrandsChange,
    } = opts;

    return (
      <div
        key={key}
        className={`px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center transition-colors ${
          isFaintAuto
            ? 'bg-slate-50/70 dark:bg-zinc-900/50 opacity-65 hover:opacity-100'
            : isPaused
            ? 'bg-slate-50/60 dark:bg-zinc-900/40 opacity-60'
            : 'hover:bg-slate-50/40 dark:hover:bg-zinc-800/30'
        }`}
      >
        {/* Col 1: Avatar + Name + Subtitle */}
        <div className="lg:col-span-3 flex items-center gap-2.5 min-w-0">
          {avatar}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate">
                {title}
              </span>
              {badges}
            </div>
            <span className="text-[11px] text-slate-400 block truncate">{subtitle}</span>
          </div>
        </div>

        {/* Col 2: Brand Lock Selector */}
        <div className="lg:col-span-4 min-w-0">
          {hideControlsWhenFaint ? (
            <span className="text-[11px] text-slate-400">
              ยังไม่นับเข้าสุ่ม (ติ๊กปุ่มด้านขวาเพื่อเปิดใช้)
            </span>
          ) : (
            <BrandLockSelector
              brands={brandOptions}
              selected={allowedBrands}
              disabled={isPaused}
              label=""
              onChange={onBrandsChange}
            />
          )}
        </div>

        {/* Col 3: Weight Slider & True Effective Brand % */}
        <div className="lg:col-span-2 space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              disabled={isPaused}
              value={weight}
              onChange={(e) => onWeightChange(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer disabled:opacity-30"
            />
            <span className="text-[11px] font-black text-blue-600 shrink-0 text-right">
              {weight}x
              {!hasCustomBrandPct && (
                <span className="text-slate-400 font-bold ml-1">({percent}%)</span>
              )}
            </span>
          </div>
          {!isPaused && hasCustomBrandPct && brandShares.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end">
              {brandShares.map((bs) => (
                <span
                  key={bs.slug}
                  className="px-1.5 py-0.2 rounded border border-slate-200 dark:border-zinc-700 bg-slate-100/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[9.5px] font-bold leading-tight"
                  title={`โอกาสได้รับแชทแบรนด์ ${bs.shortLabel}: ${bs.pct}%`}
                >
                  {bs.shortLabel} {bs.pct}%
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Col 4: Max Active Quota + Pause/Include Button */}
        <div className="lg:col-span-3 flex items-center justify-between lg:justify-end gap-2.5 shrink-0">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={200}
              disabled={isPaused}
              value={maxActive === 0 ? '' : maxActive}
              placeholder="∞"
              title="จำกัดแชทสูงสุดที่ถือพร้อมกัน (เว้นว่าง = ไม่จำกัด)"
              onChange={(e) => onMaxActiveChange(e.target.value ? Number(e.target.value) : 0)}
              className="w-12 px-1.5 py-1 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-center font-bold disabled:opacity-40"
            />
            <span className="text-[10.5px] text-slate-400">แชท</span>
          </div>

          {isAutoGroup ? (
            <button
              type="button"
              onClick={onTogglePause}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all border shrink-0 ${
                isPaused
                  ? 'bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
              }`}
              title={isPaused ? 'ติ๊กเพื่อเปิดนับเข้าสุ่ม' : 'กำลังนับเข้าสุ่ม — คลิกเพื่อนำออก'}
            >
              <span
                className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                  isPaused
                    ? 'bg-white border-slate-300 dark:bg-zinc-900 dark:border-zinc-600'
                    : 'bg-emerald-600 border-emerald-600 text-white'
                }`}
              >
                {!isPaused && <Check size={10} strokeWidth={3.5} />}
              </span>
              <span>นับเข้าสุ่ม</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onTogglePause}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 ${
                isPaused
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60'
              }`}
              title={isPaused ? 'คลิกเพื่อเปิดรับแชท' : 'คลิกเพื่อพักรับแชท'}
            >
              {isPaused ? <Play size={11} /> : <Pause size={11} />}
              <span>{isPaused ? 'พัก' : 'พร้อมรับ'}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
        <p style={{ margin: 0, fontSize: '0.85rem' }}>กำลังโหลดการตั้งค่าระบบแชท...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-3.5 pb-8">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-[9999] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <Check size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Compact Top Toolbar (Clean 1-row bar matching /chat-settings/groups) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100">
            ตั้งค่าระบบ & สัดส่วนการสุ่ม
          </h2>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              config.auto_routing_enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
            }`}
          >
            {config.auto_routing_enabled
              ? `สุ่มอัตโนมัติ: ${
                  config.routing_target_mode === 'groups'
                    ? `รายกลุ่ม (${activeReadyGroups.length})`
                    : `รายเซลล์ (${activeReadyAgents.length})`
                }`
              : 'ปิดสุ่มอัตโนมัติ'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setDistributionLaunchMode(ratioSubTab);
              setShowDistributionModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:border-blue-400 hover:text-blue-600 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-all cursor-pointer"
          >
            <Dices size={14} className="text-blue-600" />
            <span>สุ่มกระจายแชทค้าง</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
          </button>
        </div>
      </div>

      {/* 2-Column Clean Settings Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: Reply Policy */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50/75 dark:bg-zinc-800/40 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-2">
            <ShieldCheck size={15} className="text-blue-600" />
            <span className="text-xs font-black text-slate-800 dark:text-zinc-100">
              สิทธิ์การตอบแชท
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                  สิทธิ์พิมพ์ตอบลูกค้า
                </div>
                <div className="text-[11px] text-slate-400">
                  {config.reply_policy === 'everyone'
                    ? 'พนักงานที่มีสิทธิ์เข้าแชทช่วยตอบได้ทุกห้อง'
                    : 'ตอบได้เฉพาะผู้ดูแลที่รับผิดชอบ / คนในกลุ่ม / Admin'}
                </div>
              </div>

              <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, reply_policy: 'everyone' }))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    config.reply_policy === 'everyone'
                      ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                  }`}
                >
                  <Globe size={12} />
                  <span>ทุกคนตอบได้</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, reply_policy: 'assigned_only' }))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    config.reply_policy === 'assigned_only'
                      ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                  }`}
                >
                  <Lock size={12} />
                  <span>เฉพาะผู้ดูแล</span>
                </button>
              </div>
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                  คนตอบคนแรกเป็นผู้ดูแลทันที
                </div>
                <div className="text-[11px] text-slate-400">
                  เมื่อแชทยังว่าง เซลล์ที่พิมพ์ตอบคนแรกจะถูกตั้งเป็นผู้ดูแลอัตโนมัติ
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={config.auto_assign_first_responder}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, auto_assign_first_responder: e.target.checked }))
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
          </div>
        </div>

        {/* Right: Auto Routing */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50/75 dark:bg-zinc-800/40 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-blue-600" />
              <span className="text-xs font-black text-slate-800 dark:text-zinc-100">
                สุ่มรับแชทใหม่อัตโนมัติ
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.auto_routing_enabled}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, auto_routing_enabled: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          <div
            className={`divide-y divide-slate-100 dark:divide-zinc-800 transition-opacity ${
              !config.auto_routing_enabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                  รูปแบบการสุ่มจ่ายแชทใหม่
                </div>
                <div className="text-[11px] text-slate-400">
                  {config.routing_target_mode === 'groups'
                    ? 'จ่ายเข้ากลุ่มแชทตามสัดส่วน % และแบรนด์ที่ล็อก'
                    : 'จ่ายให้เซลล์รายคนตามสัดส่วน % และแบรนด์ที่ล็อก'}
                </div>
              </div>

              <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, routing_target_mode: 'agents' }));
                    setRatioSubTab('agents');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    (config.routing_target_mode || 'agents') === 'agents'
                      ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                  }`}
                >
                  <UserPlus size={12} />
                  <span>รายเซลล์ ({activeReadyAgents.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, routing_target_mode: 'groups' }));
                    setRatioSubTab('groups');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    config.routing_target_mode === 'groups'
                      ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                  }`}
                >
                  <Users size={12} />
                  <span>รายกลุ่ม ({activeReadyGroups.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: CLEAN UNIFIED RATIO, BRAND LOCK & QUOTA TABLE */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50/75 dark:bg-zinc-800/40 border-b border-slate-100 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Sliders size={15} className="text-blue-600 shrink-0" />
            <span className="text-xs font-black text-slate-900 dark:text-zinc-100">
              สัดส่วนการสุ่ม & แบรนด์ที่ดูแล
            </span>

            {/* Sub-tab Switcher: Agents vs Groups */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setRatioSubTab('agents')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                  ratioSubTab === 'agents'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                }`}
              >
                รายเซลล์ ({staffWithChatAccess.length})
              </button>
              <button
                type="button"
                onClick={() => setRatioSubTab('groups')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                  ratioSubTab === 'groups'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                }`}
              >
                รายกลุ่ม ({eligibleCareGroups.length}
                {eligibleAutoGroups.length > 0 ? ` + ${eligibleAutoGroups.length} ออโต้` : ''})
              </button>
            </div>

            <span className="text-[11px] font-bold text-slate-400">
              • พร้อมรับ{' '}
              {ratioSubTab === 'groups'
                ? `${activeReadyGroups.length}/${combinedGroupItems.length} กลุ่ม`
                : `${activeReadyAgents.length}/${staffWithChatAccess.length} คน`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {((ratioSubTab === 'agents' && staffWithChatAccess.length > 0) ||
              (ratioSubTab === 'groups' && combinedGroupItems.length > 0)) && (
              <>
                <button
                  type="button"
                  onClick={handleResetEpoch}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="รีเซ็ตตัวนับ % รอบใหม่ให้เริ่มต้นนับจาก 0"
                >
                  <RefreshCw size={11} />
                  <span>นับรอบ % ใหม่</span>
                </button>

                <button
                  type="button"
                  onClick={handleEqualizeWeights}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 text-[11px] font-bold transition-all cursor-pointer"
                >
                  <RotateCcw size={11} />
                  <span>1:1 เท่ากัน</span>
                </button>
              </>
            )}

            {ratioSubTab === 'groups' && onNavigateToGroups ? (
              <button
                type="button"
                onClick={onNavigateToGroups}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-[11px] font-bold cursor-pointer transition-all"
              >
                <Users size={11} />
                <span>จัดการกลุ่ม</span>
              </button>
            ) : (
              onNavigateToAccess && (
                <button
                  type="button"
                  onClick={onNavigateToAccess}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-[11px] font-bold cursor-pointer transition-all"
                >
                  <UserPlus size={11} />
                  <span>สิทธิ์เข้าใช้งาน</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Brand Coverage Health Bar (shows real eligible count per brand & warns if 0) */}
        {brandOptions.length > 0 && (
          <div className="px-4 py-2 bg-slate-50/50 dark:bg-zinc-900/60 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-slate-500 dark:text-zinc-400 shrink-0">
              สถานะรับแชทแต่ละแบรนด์:
            </span>
            {brandOptions.map((b) => {
              const cnt = activePoolMetrics.byBrand[b.slug]?.activeCount ?? 0;
              return (
                <span
                  key={b.slug}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${
                    cnt === 0
                      ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      cnt === 0 ? 'bg-rose-600' : 'bg-slate-400 dark:bg-zinc-500'
                    }`}
                  />
                  <span>{b.shortLabel}</span>
                  <span>
                    {cnt === 0 ? '· ยังไม่มีคนรับ (0)' : `· ${cnt} ${ratioSubTab === 'groups' ? 'กลุ่ม' : 'คน'}`}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Table Column Headers (Desktop) */}
        {((ratioSubTab === 'groups' && combinedGroupItems.length > 0) ||
          (ratioSubTab === 'agents' && staffWithChatAccess.length > 0)) && (
          <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-1.5 text-[10.5px] font-bold text-slate-400 bg-slate-50/40 dark:bg-zinc-800/20 border-b border-slate-100 dark:border-zinc-800">
            <div className="lg:col-span-3">{ratioSubTab === 'groups' ? 'กลุ่มแชท' : 'พนักงาน / เซลล์'}</div>
            <div className="lg:col-span-4">แบรนด์ที่ดูแล</div>
            <div className="lg:col-span-2">สัดส่วน (%)</div>
            <div className="lg:col-span-3 text-right">สูงสุด / สถานะ</div>
          </div>
        )}

        {/* Sub-tab Content */}
        {ratioSubTab === 'groups' ? (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {combinedGroupItems.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2.5">
                <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  ยังไม่มีกลุ่มแชทสำหรับนำมาสุ่ม
                </p>
                {onNavigateToGroups && (
                  <button
                    type="button"
                    onClick={onNavigateToGroups}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-all"
                  >
                    <Users size={13} />
                    <span>ไปหน้าจัดการกลุ่มแชท</span>
                  </button>
                )}
              </div>
            ) : (
              combinedGroupItems.map((grp) => {
                const isPaused = isGroupPausedInDraft(grp);
                const gWeightConfig = config.group_weights?.[grp.id] || {
                  weight: 1,
                  max_active_chats: 0,
                  is_paused: isPaused,
                };
                const currentWeight = gWeightConfig.weight ?? 1;
                const maxActive = gWeightConfig.max_active_chats ?? 0;
                const percent =
                  isPaused || totalGroupWeight === 0
                    ? 0
                    : Math.round((currentWeight / totalGroupWeight) * 100);
                const memberUsers = (grp.agentIds || [])
                  .map((id) => users.find((u) => u.id === id))
                  .filter((u): u is User => !!u && (!u.status || u.status === 'active'));

                const updateGroupWeightConfig = (partial: Partial<AgentWeightConfig>) => {
                  setConfig((prev) => ({
                    ...prev,
                    group_weights: {
                      ...(prev.group_weights || {}),
                      [grp.id]: {
                        ...(prev.group_weights?.[grp.id] || {
                          weight: 1,
                          max_active_chats: 0,
                          is_paused: isPaused,
                          allowed_brands: grp.allowedBrands || [],
                        }),
                        ...partial,
                      },
                    },
                  }));
                };

                const resolvedGroupBrands =
                  config.group_weights?.[grp.id]?.allowed_brands !== undefined
                    ? config.group_weights?.[grp.id]?.allowed_brands
                    : grp.allowedBrands;

                const gBrandShare = groupPoolMetrics.getEntityShares(
                  currentWeight,
                  resolvedGroupBrands,
                  isPaused,
                  percent
                );

                const isFaintAuto = grp.isAuto && isPaused;

                return renderRatioRow({
                  key: grp.id,
                  isPaused,
                  isFaintAuto,
                  isAutoGroup: grp.isAuto,
                  hideControlsWhenFaint: grp.isUnsavedAuto && isPaused,
                  weight: currentWeight,
                  percent,
                  brandShares: gBrandShare.shares,
                  hasCustomBrandPct: gBrandShare.hasCustomBrandPct,
                  maxActive,
                  allowedBrands: resolvedGroupBrands,
                  avatar: (
                    <div className="flex -space-x-1.5 shrink-0">
                      {memberUsers.slice(0, 3).map((m) => (
                        <div key={m.id} className="rounded-full ring-2 ring-white dark:ring-zinc-900">
                          <StaffAvatar url={m.avatar_url} name={m.nickname || m.first_name} size={26} />
                        </div>
                      ))}
                      {memberUsers.length > 3 && (
                        <div className="w-[26px] h-[26px] rounded-full ring-2 ring-white dark:ring-zinc-900 bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center">
                          +{memberUsers.length - 3}
                        </div>
                      )}
                    </div>
                  ),
                  title: grp.isAuto
                    ? memberUsers.map((m) => m.first_name).join(', ') || grp.name
                    : grp.name,
                  badges: (
                    <>
                      {grp.isAuto && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100/80 text-amber-800 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                          กลุ่มออโต้
                        </span>
                      )}
                      <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300 shrink-0">
                        {memberUsers.length} คน
                      </span>
                    </>
                  ),
                  subtitle: isFaintAuto
                    ? `ดูแลร่วมกัน ${grp.customerIds.length} ลค.`
                    : `ถือ ${workload.activeGroupCounts[grp.id] || 0} แชท${
                        !isPaused ? ` · รอบนี้ ${workload.epochGroupCounts[grp.id] || 0}` : ''
                      }`,
                  onWeightChange: (val) => updateGroupWeightConfig({ weight: val }),
                  onMaxActiveChange: (val) => updateGroupWeightConfig({ max_active_chats: val }),
                  onTogglePause: () => updateGroupWeightConfig({ is_paused: !isPaused }),
                  onBrandsChange: (nextBrands) => {
                    updateGroupWeightConfig({ allowed_brands: nextBrands });
                    setCareGroups((prev) =>
                      prev.map((item) =>
                        item.id === grp.id ? { ...item, allowed_brands: nextBrands } : item
                      )
                    );
                  },
                });
              })
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {staffWithChatAccess.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2.5">
                <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  ยังไม่มีพนักงานที่ได้รับสิทธิ์เข้าใช้งานแชท (มีเฉพาะ Admin)
                </p>
                {onNavigateToAccess && (
                  <button
                    type="button"
                    onClick={onNavigateToAccess}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-all"
                  >
                    <UserPlus size={13} />
                    <span>ไปหน้าสิทธิ์เข้าใช้งาน</span>
                  </button>
                )}
              </div>
            ) : (
              staffWithChatAccess.map((u) => {
                const uWeightConfig = config.agent_weights?.[u.id] || {
                  weight: 1,
                  max_active_chats: 0,
                  is_paused: false,
                };
                const currentWeight = uWeightConfig.weight ?? 1;
                const isPaused = uWeightConfig.is_paused ?? false;
                const maxActive = uWeightConfig.max_active_chats ?? 0;
                const percent =
                  isPaused || totalWeight === 0
                    ? 0
                    : Math.round((currentWeight / totalWeight) * 100);

                const updateAgentConfig = (partial: Partial<typeof uWeightConfig>) => {
                  setConfig((prev) => ({
                    ...prev,
                    agent_weights: {
                      ...(prev.agent_weights || {}),
                      [u.id]: {
                        ...(prev.agent_weights?.[u.id] || { weight: 1, max_active_chats: 0, is_paused: false }),
                        ...partial,
                      },
                    },
                  }));
                };

                const uBrandShare = agentPoolMetrics.getEntityShares(
                  currentWeight,
                  uWeightConfig.allowed_brands,
                  isPaused,
                  percent
                );

                return renderRatioRow({
                  key: u.id,
                  isPaused,
                  weight: currentWeight,
                  percent,
                  brandShares: uBrandShare.shares,
                  hasCustomBrandPct: uBrandShare.hasCustomBrandPct,
                  maxActive,
                  allowedBrands: uWeightConfig.allowed_brands,
                  avatar: <StaffAvatar url={u.avatar_url} name={u.nickname || u.first_name} size={30} />,
                  title: `${u.first_name}${u.nickname ? ` (${u.nickname})` : ''}`,
                  badges:
                    u.role === 'admin' ? (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60">
                        Admin
                      </span>
                    ) : null,
                  subtitle: `ถือ ${workload.activeCounts[u.id] || 0} แชท${
                    !isPaused ? ` · รอบนี้ ${workload.epochCounts[u.id] || 0}` : ''
                  }`,
                  onWeightChange: (val) => updateAgentConfig({ weight: val }),
                  onMaxActiveChange: (val) => updateAgentConfig({ max_active_chats: val }),
                  onTogglePause: () => updateAgentConfig({ is_paused: !isPaused }),
                  onBrandsChange: (nextBrands) => updateAgentConfig({ allowed_brands: nextBrands }),
                });
              })
            )}
          </div>
        )}
      </div>

      {showDistributionModal && (
        <ChatDistributionModal
          isOpen={showDistributionModal}
          onClose={() => setShowDistributionModal(false)}
          onSuccess={() => {
            void loadData();
          }}
          initialMode={distributionLaunchMode}
        />
      )}
    </form>
  );
}
