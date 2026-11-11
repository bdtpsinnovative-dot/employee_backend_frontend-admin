import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Clock,
  ExternalLink,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  Trophy,
  CheckCircle2,
  Eye,
  X,
  Users,
  User as UserIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchMe, fetchUsers } from '../../services/adminApi';
import {
  assignConversation,
  autoAssignConversations,
  fetchChatCareGroups,
  fetchChatRoutingGroups,
  getChannelBrandOptions,
  normalizeBrandSlug,
  sortSalesFirst,
} from '../../services/chatRoutingService';
import {
  buildDateRangePreset,
  buildRoleTeamSummaries,
  classifyAgentPerformance,
  classifyTeamPerformance,
  fetchChatResponseAnalytics,
  formatCurrencyTHB,
  formatResponseDuration,
  getAgentDisplayName,
  resolveTeamDisplayName,
  type AnalyticsDatePreset,
  type AgentPerformanceEvaluation,
} from '../../services/chatAnalyticsService';
import { avatarUrl } from '../tasks/taskUtils';
import ChatQAReviewModal, { type QAModalAgentInfo } from './ChatQAReviewModal';
import ChatAnalyticsCharts from './ChatAnalyticsCharts';
import type {
  ChatAgentAnalytics,
  ChatCareGroup,
  ChatChannel,
  ChatConversationAnalyticsItem,
  ChatResponseAnalytics,
  ChatRoutingGroup,
  ChatTeamAnalytics,
  User,
} from '../../types';

type CaseQueueFilter =
  | 'all'
  | 'unassigned'
  | 'solo'
  | 'team_group'
  | 'pending_qa'
  | 'won'
  | 'repeat'
  | 'lost'
  | 'open';

const PLATFORM_LABELS: Record<string, string> = {
  line: 'LINE',
  facebook: 'Facebook',
  instagram: 'IG',
  web: 'Web',
};

export default function ChatAnalyticsTab() {
  const [viewMode, setViewMode] = useState<'individual' | 'team'>('individual');
  const [preset, setPreset] = useState<AnalyticsDatePreset>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [caseFilter, setCaseFilter] = useState<CaseQueueFilter>('all');
  const [agentFilterId, setAgentFilterId] = useState<string | null>(null);
  const [teamFilterId, setTeamFilterId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideIdleAgents, setHideIdleAgents] = useState(true);

  const [analytics, setAnalytics] = useState<ChatResponseAnalytics | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [allUsers, setAllUsers] = useState<QAModalAgentInfo[]>([]);
  const [fullUsers, setFullUsers] = useState<User[]>([]);
  const [careGroups, setCareGroups] = useState<ChatCareGroup[]>([]);
  const [routingGroups, setRoutingGroups] = useState<ChatRoutingGroup[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [assigningConvId, setAssigningConvId] = useState<string | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);

  const [selectedConv, setSelectedConv] = useState<ChatConversationAnalyticsItem | null>(null);
  const queueSectionRef = useRef<HTMLDivElement | null>(null);

  // Load static reference lists once (current user, channels, staff roster, care groups)
  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      try {
        const [meRes, usersRes, channelsRes, careRes, routingRes] = await Promise.all([
          fetchMe().catch(() => null),
          fetchUsers().catch(() => []),
          supabase.from('chat_channels').select('*').order('created_at', { ascending: false }),
          fetchChatCareGroups().catch(() => []),
          fetchChatRoutingGroups().catch(() => []),
        ]);
        if (cancelled) return;
        if (meRes) setCurrentUser(meRes);
        if (Array.isArray(usersRes)) {
          setFullUsers(usersRes);
          setAllUsers(
            usersRes.map((u: any) => ({
              id: u.id,
              first_name: u.first_name || '',
              last_name: u.last_name || '',
              nickname: u.nickname || null,
              avatar_url: u.avatar_url || null,
              role: u.role || 'user',
            }))
          );
        }
        if (channelsRes?.data) {
          setChannels(channelsRes.data as ChatChannel[]);
        }
        if (Array.isArray(careRes)) setCareGroups(careRes);
        if (Array.isArray(routingRes)) setRoutingGroups(routingRes);
      } catch {
        // Non-fatal metadata fallback
      }
    };
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { from, to } = buildDateRangePreset(preset);
      const result = await fetchChatResponseAnalytics({ from, to, brand: brandFilter });
      setAnalytics(result);
    } catch (err: any) {
      setErrorMsg(err?.message || 'ไม่สามารถโหลดข้อมูลวิเคราะห์แชทได้');
    } finally {
      setLoading(false);
    }
  }, [preset, brandFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const brandOptions = useMemo(() => getChannelBrandOptions(channels), [channels]);

  const agentLookup = useMemo(() => {
    const map = new Map<string, QAModalAgentInfo>();
    allUsers.forEach((u) => map.set(u.id, u));
    analytics?.agents.forEach((a) => {
      if (!map.has(a.agent_id)) {
        map.set(a.agent_id, {
          id: a.agent_id,
          first_name: a.first_name,
          last_name: a.last_name,
          nickname: a.nickname,
          avatar_url: a.avatar_url,
          role: a.role,
        });
      }
    });
    return map;
  }, [allUsers, analytics?.agents]);

  const modalAgents = useMemo(() => Array.from(agentLookup.values()), [agentLookup]);

  // Keep Sales above Admins cleanly while optionally hiding completely idle rows
  const displayedAgents = useMemo(() => {
    if (!analytics) return [];
    const anyActive = analytics.agents.some(
      (a) => a.msg_count > 0 || a.assigned_conv_count > 0 || a.won_count > 0 || a.qa_count > 0
    );
    const list =
      hideIdleAgents && anyActive
        ? analytics.agents.filter(
            (a) =>
              a.msg_count > 0 || a.assigned_conv_count > 0 || a.won_count > 0 || a.qa_count > 0
          )
        : analytics.agents;
    return list;
  }, [analytics, hideIdleAgents]);

  const salesAgents = useMemo(
    () => displayedAgents.filter((a) => a.role !== 'admin'),
    [displayedAgents]
  );
  const adminAgents = useMemo(
    () => displayedAgents.filter((a) => a.role === 'admin'),
    [displayedAgents]
  );

  const filteredConversations = useMemo(() => {
    if (!analytics) return [];
    const q = searchQuery.trim().toLowerCase();

    return analytics.conversations.filter((conv) => {
      if (teamFilterId && conv.team_id !== teamFilterId) {
        return false;
      }

      if (agentFilterId) {
        const involved =
          conv.assigned_to === agentFilterId ||
          conv.closed_by === agentFilterId ||
          conv.responder_ids.includes(agentFilterId);
        if (!involved) return false;
      }

      if (caseFilter === 'unassigned') {
        if (conv.team_id !== 'unassigned_pool') return false;
      } else if (caseFilter === 'solo') {
        if (conv.team_id !== 'solo_care') return false;
      } else if (caseFilter === 'team_group') {
        if (!conv.team_id || conv.team_id === 'unassigned_pool' || conv.team_id === 'solo_care') {
          return false;
        }
      } else if (caseFilter === 'pending_qa') {
        if (conv.qa_reviews.length > 0 || conv.responder_ids.length === 0) return false;
      } else if (caseFilter === 'won') {
        if (conv.deal_status !== 'won' && (conv.won_order_count || 0) === 0) return false;
      } else if (caseFilter === 'repeat') {
        if ((conv.repeat_won_count || 0) === 0) return false;
      } else if (caseFilter === 'lost') {
        if (conv.deal_status !== 'lost') return false;
      } else if (caseFilter === 'open') {
        if (conv.deal_status !== 'open') return false;
      }

      if (q) {
        const hay = `${conv.customer_name || ''} ${conv.last_message || ''} ${
          conv.deal_pi_no || ''
        } ${conv.brand || ''} ${conv.team_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [analytics, teamFilterId, agentFilterId, caseFilter, searchQuery]);

  const roleTeamSummaries = useMemo(
    () => buildRoleTeamSummaries(analytics?.agents || []),
    [analytics?.agents]
  );

  const displayedTeams = useMemo(() => {
    const raw = analytics?.teams || [];
    return hideIdleAgents
      ? raw.filter((t) => t.conv_count > 0 || t.msg_count > 0 || t.team_type === 'care_group')
      : raw;
  }, [analytics?.teams, hideIdleAgents]);

  const summary = analytics?.summary;
  const teamWinRate =
    summary && summary.resolved_conversations > 0
      ? Math.round((summary.won_conversations / summary.resolved_conversations) * 1000) / 10
      : null;

  const handleSelectAgentForCases = (agentId: string) => {
    setTeamFilterId(null);
    setAgentFilterId((prev) => (prev === agentId ? null : agentId));
    setTimeout(() => {
      queueSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSelectTeamForCases = (teamId: string) => {
    setAgentFilterId(null);
    setTeamFilterId((prev) => (prev === teamId ? null : teamId));
    setTimeout(() => {
      queueSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const unassignedCount = useMemo(() => {
    const teamRow = analytics?.teams.find((t) => t.team_type === 'unassigned');
    return teamRow?.conv_count ?? 0;
  }, [analytics?.teams]);

  const unassignedInQueue = useMemo(
    () => (analytics?.conversations || []).filter((c) => c.team_id === 'unassigned_pool').length,
    [analytics?.conversations]
  );

  const repeatInQueue = useMemo(
    () => (analytics?.conversations || []).filter((c) => (c.repeat_won_count || 0) > 0).length,
    [analytics?.conversations]
  );

  const sortedAssignableUsers = useMemo(
    () => sortSalesFirst(fullUsers.filter((u) => !u.status || u.status === 'active')),
    [fullUsers]
  );

  const handleSelectCoverageCategory = (category: 'team_group' | 'solo' | 'unassigned') => {
    setAgentFilterId(null);
    setTeamFilterId(null);
    setCaseFilter((prev) => (prev === category ? 'all' : category));
    setTimeout(() => {
      queueSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleQuickAssignConversation = async (convId: string, selection: string) => {
    if (!selection) return;
    setAssigningConvId(convId);
    setErrorMsg(null);
    setAssignNotice(null);
    try {
      let ok = false;
      if (selection.startsWith('group:')) {
        const gid = selection.slice(6);
        const grp = careGroups.find((g) => g.id === gid);
        if (grp) {
          ok = await assignConversation(convId, {
            id: grp.agent_ids?.[0] || null,
            name: grp.name,
            groupId: grp.id,
            groupName: grp.name,
            assignedAgentIds: grp.agent_ids || [],
          });
        }
      } else if (selection.startsWith('agent:')) {
        const uid = selection.slice(6);
        const usr = fullUsers.find((u) => u.id === uid);
        if (usr) {
          ok = await assignConversation(convId, {
            id: usr.id,
            name: usr.nickname || usr.first_name || 'แอดมิน',
            avatar: usr.avatar_url || null,
            assignedAgentIds: [usr.id],
          });
        }
      }
      if (!ok) throw new Error('มอบหมายเคสไม่สำเร็จ');
      setAssignNotice('มอบหมายผู้ดูแลเรียบร้อยแล้ว');
      await loadAnalytics();
    } catch (err: any) {
      setErrorMsg(err?.message || 'ไม่สามารถมอบหมายผู้ดูแลได้');
    } finally {
      setAssigningConvId(null);
    }
  };

  const handleBulkAutoAssign = async () => {
    if (unassignedCount === 0) return;
    const confirmed = window.confirm(
      `ยืนยันสุ่มจ่ายลูกค้าที่ยังไม่มีทีม/เซลล์ดูแล (สูงสุด ${unassignedCount} เคส Active) ตามกติกาแบรนด์และสัดส่วน % ปัจจุบันหรือไม่?\n(ระบบจะไม่แตะต้องลูกค้าที่มีผู้ดูแลอยู่แล้ว)`
    );
    if (!confirmed) return;

    setBulkAssigning(true);
    setErrorMsg(null);
    setAssignNotice(null);
    try {
      const { data: rawUnassigned, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .is('assigned_to', null)
        .eq('status', 'active')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const { assignedCount } = await autoAssignConversations(
        (rawUnassigned || []) as any[],
        routingGroups,
        fullUsers
      );

      if (assignedCount > 0) {
        setAssignNotice(`สุ่มจ่ายเคสที่ยังไม่มีผู้ดูแลสำเร็จ ${assignedCount} เคส`);
        await loadAnalytics();
      } else {
        setAssignNotice(
          'ยังไม่มีเคสที่จ่ายอัตโนมัติได้ (ตรวจสอบว่าเปิดระบบสุ่มอัตโนมัติ, อยู่ในเวลาทำงาน และมีพนักงาน/กลุ่มดูแลเปิดรับแบรนด์นั้น)'
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'สุ่มจ่ายงานไม่สำเร็จ');
    } finally {
      setBulkAssigning(false);
    }
  };

  const renderDualAxisMetricCells = (opts: {
    perf: AgentPerformanceEvaluation;
    medianReplyMinutes: number | null;
    sla15mPct: number | null;
    replyTurns: number;
    avgOverallQa: number | null;
    avgPoliteness: number | null;
    avgAccuracy: number | null;
    qaCount: number;
    wonCount: number;
    repeatWonCount: number;
    repeatWonAmount: number;
    lostCount: number;
    wonAmount: number;
    winRatePct: number | null;
    isFiltered: boolean;
    onSelectCases: () => void;
  }) => (
    <>
      {/* Response Speed */}
      <td className="py-3 px-3">
        <div className="min-w-[105px]">
          <div className="text-xs font-bold text-slate-900 dark:text-white">
            {formatResponseDuration(opts.medianReplyMinutes)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
            {opts.replyTurns > 0
              ? `ทัน 15น.: ${opts.sla15mPct ?? 0}% (${opts.replyTurns} รอบ)`
              : 'ยังไม่มีรอบตอบกลับ'}
          </div>
        </div>
      </td>

      {/* Axis 1: Reply Quality (QA + Speed) */}
      <td className="py-3 px-3">
        <div className="min-w-[140px]">
          {opts.perf.hasQaReview ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {opts.perf.qualityScore}/100
                </span>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  (QA {opts.avgOverallQa ?? '—'}/10)
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                สุภาพ {opts.avgPoliteness ?? '—'} · ตรง {opts.avgAccuracy ?? '—'} ({opts.qaCount} เคส)
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                รอประเมิน QA
              </span>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                {opts.perf.speedScore !== null
                  ? `คะแนนความไว ${opts.perf.speedScore}/100`
                  : 'ยังไม่มีข้อมูลตอบ'}
              </div>
            </div>
          )}
        </div>
      </td>

      {/* Axis 2: Sales Conversion */}
      <td className="py-3 px-3">
        <div className="min-w-[130px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-extrabold ${
                opts.wonCount > 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-zinc-300'
              }`}
            >
              ปิดได้ {opts.wonCount} บิล
            </span>
            {opts.repeatWonCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-teal-50 border border-teal-200 text-teal-700 text-[9.5px] font-bold">
                ซื้อซ้ำ {opts.repeatWonCount}
              </span>
            )}
            {opts.winRatePct !== null && (
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                ({opts.winRatePct}%)
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
            {opts.wonAmount > 0 ? formatCurrencyTHB(opts.wonAmount) : 'ยอด ฿0'}
            {opts.repeatWonAmount > 0 ? ` (ซ้ำ ${formatCurrencyTHB(opts.repeatWonAmount)})` : ''} · ไม่ซื้อ{' '}
            {opts.lostCount}
          </div>
        </div>
      </td>

      {/* Dual-Axis Quadrant Matrix Label */}
      <td className="py-3 px-3">
        <span
          title={opts.perf.quadrantHint}
          className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${opts.perf.quadrantBadgeClass}`}
        >
          {opts.perf.quadrantLabel}
        </span>
      </td>

      {/* Action */}
      <td className="py-3 px-3 text-right">
        <button
          type="button"
          onClick={opts.onSelectCases}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
            opts.isFiltered
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-slate-400'
          }`}
        >
          <Eye size={12} />
          {opts.isFiltered ? 'กำลังกรอง' : 'ดูเคส'}
        </button>
      </td>
    </>
  );

  const renderAgentRow = (agent: ChatAgentAnalytics) => {
    const perf = classifyAgentPerformance(agent);
    const av = avatarUrl(agent.avatar_url);
    const isFiltered = agentFilterId === agent.agent_id;

    return (
      <tr
        key={agent.agent_id}
        className={`border-b border-slate-100 dark:border-zinc-800/80 transition-colors ${
          isFiltered
            ? 'bg-blue-50/60 dark:bg-blue-950/20'
            : 'hover:bg-slate-50/80 dark:hover:bg-zinc-900/60'
        }`}
      >
        <td className="py-3 px-3.5">
          <div className="flex items-center gap-2.5 min-w-[165px]">
            {av ? (
              <img
                src={av}
                alt={agent.first_name}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-zinc-700 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-zinc-200 shrink-0">
                {(agent.nickname || agent.first_name || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {getAgentDisplayName(agent)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    agent.role === 'admin'
                      ? 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                      : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  }`}
                >
                  {agent.role === 'admin' ? 'Admin' : 'Sales'}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                รับมอบ {agent.assigned_conv_count} เคส · ร่วมตอบ {agent.replied_conv_count} เคส
              </span>
            </div>
          </div>
        </td>

        <td className="py-3 px-3">
          <div className="min-w-[115px] space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                {agent.reply_share_pct.toFixed(1)}%
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                {agent.msg_count} ข้อความ
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{
                  width: `${Math.min(100, Math.max(agent.reply_share_pct, agent.msg_count > 0 ? 4 : 0))}%`,
                }}
              />
            </div>
          </div>
        </td>

        {renderDualAxisMetricCells({
          perf,
          medianReplyMinutes: agent.median_reply_minutes,
          sla15mPct: agent.sla_15m_pct,
          replyTurns: agent.reply_turns,
          avgOverallQa: agent.avg_overall_qa,
          avgPoliteness: agent.avg_politeness,
          avgAccuracy: agent.avg_accuracy,
          qaCount: agent.qa_count,
          wonCount: agent.won_count,
          repeatWonCount: agent.repeat_won_count,
          repeatWonAmount: agent.repeat_won_amount,
          lostCount: agent.lost_count,
          wonAmount: agent.won_amount,
          winRatePct: agent.win_rate_pct,
          isFiltered,
          onSelectCases: () => handleSelectAgentForCases(agent.agent_id),
        })}
      </tr>
    );
  };

  const renderTeamRow = (team: ChatTeamAnalytics) => {
    const perf = classifyTeamPerformance(team);
    const isFiltered = teamFilterId === team.team_id;
    const displayName = resolveTeamDisplayName(team, agentLookup);
    const members = team.member_ids
      .map((id) => agentLookup.get(id))
      .filter((a): a is QAModalAgentInfo => Boolean(a));
    const typeLabel =
      team.team_type === 'care_group'
        ? 'กลุ่มดูแล'
        : team.team_type === 'auto_team'
          ? 'ทีมร่วม'
          : team.team_type === 'solo'
            ? 'ดูแลเดี่ยว'
            : 'รอจัดทีม';

    return (
      <tr
        key={team.team_id}
        className={`border-b border-slate-100 dark:border-zinc-800/80 transition-colors ${
          isFiltered
            ? 'bg-blue-50/60 dark:bg-blue-950/20'
            : 'hover:bg-slate-50/80 dark:hover:bg-zinc-900/60'
        }`}
      >
        <td className="py-3 px-3.5">
          <div className="min-w-[185px] space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {displayName}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  team.team_type === 'care_group'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : team.team_type === 'auto_team'
                      ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {typeLabel}
              </span>
            </div>

            {members.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1.5">
                  {members.slice(0, 5).map((m) => {
                    const av = avatarUrl(m.avatar_url);
                    return av ? (
                      <img
                        key={m.id}
                        src={av}
                        alt={m.first_name}
                        title={getAgentDisplayName(m)}
                        className="w-5 h-5 rounded-full object-cover ring-2 ring-white dark:ring-zinc-900"
                      />
                    ) : (
                      <div
                        key={m.id}
                        title={getAgentDisplayName(m)}
                        className="w-5 h-5 rounded-full bg-slate-200 dark:bg-zinc-800 ring-2 ring-white dark:ring-zinc-900 flex items-center justify-center text-[9px] font-bold text-slate-700 dark:text-zinc-200"
                      >
                        {(m.nickname || m.first_name || '?').slice(0, 1).toUpperCase()}
                      </div>
                    );
                  })}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {members.length} สมาชิก
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">ยังไม่มีผู้รับผิดชอบ</span>
            )}
          </div>
        </td>

        <td className="py-3 px-3">
          <div className="min-w-[125px] space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                {team.conv_count} เคส
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                ตอบ {team.msg_count} ({team.reply_share_pct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{
                  width: `${Math.min(100, Math.max(team.reply_share_pct, team.conv_count > 0 ? 5 : 0))}%`,
                }}
              />
            </div>
          </div>
        </td>

        {renderDualAxisMetricCells({
          perf,
          medianReplyMinutes: team.median_reply_minutes,
          sla15mPct: team.sla_15m_pct,
          replyTurns: team.reply_turns,
          avgOverallQa: team.avg_overall_qa,
          avgPoliteness: team.avg_politeness,
          avgAccuracy: team.avg_accuracy,
          qaCount: team.qa_count,
          wonCount: team.won_count,
          repeatWonCount: team.repeat_won_count,
          repeatWonAmount: team.repeat_won_amount,
          lostCount: team.lost_count,
          wonAmount: team.won_amount,
          winRatePct: team.win_rate_pct,
          isFiltered,
          onSelectCases: () => handleSelectTeamForCases(team.team_id),
        })}
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Controls Bar */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-blue-600" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              สรุปผลการตอบแชท & ปิดการขาย (Dual-Axis Analytics)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            วัดแยก <span className="font-semibold text-slate-700 dark:text-zinc-200">คุณภาพการคุย + ความไว</span> ออกจาก{' '}
            <span className="font-semibold text-slate-700 dark:text-zinc-200">ยอดปิดการขาย</span> เพื่อไม่ให้ดีลที่ปิดได้กลบปัญหาการบริการ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Individual vs Team View Switcher */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setViewMode('individual')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'individual'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserIcon size={12} />
              รายบุคคล
            </button>
            <button
              type="button"
              onClick={() => setViewMode('team')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'team'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users size={12} />
              แบบทีม
            </button>
          </div>

          {/* Date presets */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
            {(
              [
                { id: '7d', label: '7 วัน' },
                { id: '30d', label: '30 วัน' },
                { id: 'month', label: 'เดือนนี้' },
                { id: 'all', label: 'ทั้งหมด' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  preset === opt.id
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Brand selector */}
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">ทุกแบรนด์ (All Brands)</option>
            {brandOptions.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400">
            <span>เคสสนทนาทั้งหมด</span>
            <MessageSquare size={15} className="text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {summary?.total_conversations ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
            ปิดเคสแล้ว {summary?.resolved_conversations ?? 0} · กำลังคุย{' '}
            {summary?.open_conversations ?? 0}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400">
            <span>ปิดการขายได้ (Won)</span>
            <Trophy size={15} className="text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
              {summary?.total_won_orders ?? summary?.won_conversations ?? 0} บิล
            </span>
            {teamWinRate !== null && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                ({teamWinRate}%)
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
            ยอดรวม {formatCurrencyTHB(summary?.total_won_amount)} · ซื้อซ้ำ{' '}
            <strong className="text-teal-700 dark:text-teal-400">
              {summary?.repeat_won_orders ?? 0} บิล
            </strong>{' '}
            · ไม่ซื้อ {summary?.lost_conversations ?? 0}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400">
            <span>ความไวการตอบกลาง (Median)</span>
            <Clock size={15} className="text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {formatResponseDuration(summary?.median_reply_minutes)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
            ตอบใน 15 นาที: {summary?.sla_15m_pct !== null && summary?.sla_15m_pct !== undefined ? `${summary.sla_15m_pct}%` : '—'} ·{' '}
            {summary?.total_agent_messages ?? 0} ข้อความทีม
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400">
            <span>ประเมินคุณภาพแล้ว (QA)</span>
            <Star size={15} className="text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {summary?.qa_reviewed_count ?? 0}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              / {summary?.total_conversations ?? 0} เคส
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
            คลิก “ตรวจแชท / ประเมิน QA” ในตารางด้านล่าง
          </div>
        </div>
      </div>

      {/* Action Feedback Notice */}
      {assignNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
          <span>{assignNotice}</span>
          <button
            type="button"
            onClick={() => setAssignNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Interactive Donut Proportion & Bar Charts */}
      <ChatAnalyticsCharts
        viewMode={viewMode}
        summary={analytics?.summary}
        agents={analytics?.agents || []}
        teams={analytics?.teams || []}
        conversations={analytics?.conversations || []}
        dailyTrend={analytics?.daily_trend || []}
        brandOptions={brandOptions}
        agentLookup={agentLookup}
        selectedAgentId={agentFilterId}
        selectedTeamId={teamFilterId}
        activeCoverageKey={
          caseFilter === 'unassigned' || caseFilter === 'solo' || caseFilter === 'team_group'
            ? caseFilter
            : null
        }
        canAutoAssign={currentUser?.role === 'admin'}
        bulkAssigning={bulkAssigning}
        onSelectAgent={handleSelectAgentForCases}
        onSelectTeam={handleSelectTeamForCases}
        onSelectCoverageCategory={handleSelectCoverageCategory}
        onBulkAutoAssign={handleBulkAutoAssign}
      />

      {/* Team View: Role Team Comparison (Sales Team vs Admin Team) + Care Group Leaderboard */}
      {viewMode === 'team' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {roleTeamSummaries.map((rt) => (
              <div
                key={rt.roleKey}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        rt.roleKey === 'sales'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {rt.label}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {rt.memberCount} คนที่มีความเคลื่อนไหว
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-3 pt-1">
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {rt.replySharePct}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      ({rt.msgCount} ข้อความ · ร่วมตอบ {rt.repliedConvCount} เคส)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    ความไวกลาง {formatResponseDuration(rt.medianReplyMinutes)} ·{' '}
                    {rt.avgOverallQa !== null ? `QA เฉลี่ย ${rt.avgOverallQa}/10` : 'รอประเมิน QA'}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                    ปิดได้ {rt.wonCount} ดีล
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
                    {formatCurrencyTHB(rt.wonAmount)}
                  </div>
                  {rt.winRatePct !== null && (
                    <div className="text-[10px] text-slate-400">Win Rate {rt.winRatePct}%</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  ตารางสรุปรายทีม & กลุ่มดูแลลูกค้า ({displayedTeams.length})
                </h3>
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideIdleAgents}
                  onChange={(e) => setHideIdleAgents(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
                ซ่อนกลุ่มที่ไม่มีเคสในช่วงนี้
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-200 dark:border-zinc-800 text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
                    <th className="py-2.5 px-3.5">ทีม / กลุ่มดูแล</th>
                    <th className="py-2.5 px-3">จำนวนเคส & ตอบ</th>
                    <th className="py-2.5 px-3">ความไว (Median)</th>
                    <th className="py-2.5 px-3">แกน 1: คุณภาพการตอบ</th>
                    <th className="py-2.5 px-3">แกน 2: ปิดการขาย</th>
                    <th className="py-2.5 px-3">กลุ่มผลงาน</th>
                    <th className="py-2.5 px-3 text-right">เคส</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTeams.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                        ไม่พบข้อมูลกลุ่มดูแลหรือทีมในช่วงที่เลือก
                      </td>
                    </tr>
                  ) : (
                    displayedTeams.map(renderTeamRow)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Dual-Axis Individual Agent Leaderboard Table */
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-slate-600 dark:text-zinc-300" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                ตารางสรุปรายบุคคล (เซลล์ด้านบน · แอดมินด้านล่าง)
              </h3>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideIdleAgents}
                onChange={(e) => setHideIdleAgents(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              แสดงเฉพาะคนที่มีเคส/ตอบแชทในช่วงนี้
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-200 dark:border-zinc-800 text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
                  <th className="py-2.5 px-3.5">พนักงาน</th>
                  <th className="py-2.5 px-3">สัดส่วนตอบ</th>
                  <th className="py-2.5 px-3">ความไว (Median)</th>
                  <th className="py-2.5 px-3">แกน 1: คุณภาพการตอบ</th>
                  <th className="py-2.5 px-3">แกน 2: ปิดการขาย</th>
                  <th className="py-2.5 px-3">กลุ่มผลงาน</th>
                  <th className="py-2.5 px-3 text-right">เคส</th>
                </tr>
              </thead>
              <tbody>
                {displayedAgents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      ไม่พบข้อมูลพนักงานในช่วงที่เลือก
                    </td>
                  </tr>
                ) : (
                  <>
                    {salesAgents.map(renderAgentRow)}
                    {adminAgents.length > 0 && (
                      <tr className="bg-slate-50 dark:bg-zinc-950 border-y border-slate-200 dark:border-zinc-800">
                        <td
                          colSpan={7}
                          className="py-1.5 px-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400"
                        >
                          Admin Team ({adminAgents.length})
                        </td>
                      </tr>
                    )}
                    {adminAgents.map(renderAgentRow)}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Case Review Queue */}
      <div
        ref={queueSectionRef}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-600" />
              รายการแชทสำหรับตรวจคุณภาพ (QA) & ยืนยันผลขาย ({filteredConversations.length})
            </h3>
            {caseFilter === 'solo' && (
              <button
                type="button"
                onClick={() => setCaseFilter('all')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold cursor-pointer"
              >
                <Filter size={11} />
                เฉพาะมีเซลล์ดูแลเดี่ยว
                <X size={12} />
              </button>
            )}
            {caseFilter === 'team_group' && (
              <button
                type="button"
                onClick={() => setCaseFilter('all')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold cursor-pointer"
              >
                <Filter size={11} />
                เฉพาะมีทีมดูแลแล้ว
                <X size={12} />
              </button>
            )}
            {teamFilterId && (
              <button
                type="button"
                onClick={() => setTeamFilterId(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold cursor-pointer"
              >
                <Filter size={11} />
                เฉพาะทีม{' '}
                {(() => {
                  const matched = analytics?.teams.find((t) => t.team_id === teamFilterId);
                  return matched ? resolveTeamDisplayName(matched, agentLookup) : teamFilterId;
                })()}
                <X size={12} />
              </button>
            )}
            {agentFilterId && (
              <button
                type="button"
                onClick={() => setAgentFilterId(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold cursor-pointer"
              >
                <Filter size={11} />
                เฉพาะ{' '}
                {agentLookup.get(agentFilterId)
                  ? getAgentDisplayName(agentLookup.get(agentFilterId)!)
                  : 'พนักงาน'}
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
              {(
                [
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'unassigned', label: `ยังไม่มีคนดูแล (${unassignedInQueue})` },
                  { id: 'pending_qa', label: 'รอประเมิน QA' },
                  { id: 'won', label: 'ปิดการขาย' },
                  { id: 'repeat', label: `ซื้อซ้ำ (${repeatInQueue})` },
                  { id: 'lost', label: 'ไม่ซื้อ' },
                  { id: 'open', label: 'กำลังคุย' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCaseFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    caseFilter === tab.id
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า / เลข PI / ข้อความ..."
                className="pl-7 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-52"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 max-h-[540px] overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              ไม่พบเคสสนทนาที่ตรงกับตัวกรอง
            </div>
          ) : (
            filteredConversations.slice(0, 100).map((conv) => {
              const avgQa =
                conv.qa_reviews.length > 0
                  ? Math.round(
                      (conv.qa_reviews.reduce((sum, r) => sum + (r.overall_score ?? 0), 0) /
                        conv.qa_reviews.length) *
                        10
                    ) / 10
                  : null;

              const responderNames = conv.responder_ids
                .map((id) => agentLookup.get(id))
                .filter((a): a is QAModalAgentInfo => Boolean(a))
                .map((a) => a.nickname || a.first_name);

              const normalizedBrand = normalizeBrandSlug(conv.brand);

              return (
                <div
                  key={conv.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-zinc-950/40 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                        {conv.customer_name || 'ลูกค้าไม่ระบุชื่อ'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-zinc-300">
                        {PLATFORM_LABELS[conv.platform] || conv.platform}
                      </span>
                      {normalizedBrand && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                          {normalizedBrand}
                        </span>
                      )}
                      {conv.team_id === 'unassigned_pool' ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                          ยังไม่มีทีม / เซลล์
                        </span>
                      ) : (
                        conv.team_name && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-semibold">
                            {(() => {
                              const matched = analytics?.teams.find((t) => t.team_id === conv.team_id);
                              return matched
                                ? resolveTeamDisplayName(matched, agentLookup)
                                : conv.team_name;
                            })()}
                          </span>
                        )
                      )}
                      {(conv.deal_status === 'won' || (conv.won_order_count || 0) > 0) && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                          ปิดการขายได้{conv.deal_amount ? ` · ${formatCurrencyTHB(conv.deal_amount)}` : ''}
                          {conv.deal_pi_no ? ` · ${conv.deal_pi_no}` : ''}
                        </span>
                      )}
                      {(conv.repeat_won_count || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-bold">
                          ซื้อซ้ำ · รวม {conv.won_order_count} บิล
                        </span>
                      )}
                      {conv.deal_status === 'lost' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold">
                          ปิดเคส · ไม่ซื้อ
                        </span>
                      )}
                      {conv.deal_status === 'open' && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50/70 text-blue-600 text-[10px] font-semibold">
                          กำลังดูแล
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                      {conv.last_message || '—'}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 dark:text-zinc-500">
                      <span>{conv.msg_count} ข้อความ</span>
                      <span>
                        ความไวกลาง:{' '}
                        <strong className="text-slate-600 dark:text-zinc-300">
                          {formatResponseDuration(conv.median_reply_minutes)}
                        </strong>
                      </span>
                      <span>
                        ผู้ตอบ:{' '}
                        <strong className="text-slate-600 dark:text-zinc-300">
                          {responderNames.length > 0 ? responderNames.join(', ') : 'ยังไม่มีผู้ตอบ'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {currentUser?.role === 'admin' && conv.team_id === 'unassigned_pool' && (
                      <select
                        value=""
                        disabled={assigningConvId === conv.id}
                        onChange={(e) => void handleQuickAssignConversation(conv.id, e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50/60 dark:bg-zinc-950 dark:border-amber-800 text-[11px] font-bold text-amber-900 dark:text-amber-200 cursor-pointer focus:outline-none focus:border-amber-500"
                      >
                        <option value="">
                          {assigningConvId === conv.id ? 'กำลังจ่าย...' : '+ จ่ายงานให้ทีม / เซลล์'}
                        </option>
                        {careGroups.length > 0 && (
                          <optgroup label="กลุ่มดูแลลูกค้า (ทีม)">
                            {careGroups.map((grp) => (
                              <option key={grp.id} value={`group:${grp.id}`}>
                                👥 {grp.name} ({grp.agent_ids?.length || 0} คน)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="พนักงาน (เซลล์ / แอดมิน)">
                          {sortedAssignableUsers.map((u) => (
                            <option key={u.id} value={`agent:${u.id}`}>
                              {u.nickname || u.first_name}
                              {u.role === 'admin' ? ' [Admin]' : ' [Sales]'}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    )}

                    <Link
                      to={`/chat-inbox?convId=${conv.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 hover:text-blue-600 text-[11px] font-bold text-slate-700 dark:text-zinc-200 transition-colors"
                    >
                      <ExternalLink size={12} />
                      เปิดแชท
                    </Link>

                    {avgQa !== null ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                        <Star size={12} className="fill-amber-400 text-amber-500" />
                        QA {avgQa}/10
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-[11px] font-semibold">
                        รอประเมิน QA
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedConv(conv)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Star size={12} />
                      ตรวจแชท / ประเมิน QA
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Shared Conversation Transcript + Outcome + Manual QA Modal */}
      <ChatQAReviewModal
        isOpen={Boolean(selectedConv)}
        onClose={() => setSelectedConv(null)}
        conversation={selectedConv}
        agents={modalAgents}
        currentUserId={currentUser?.id || null}
        isAdmin={currentUser?.role === 'admin'}
        initialFocus="qa"
        onSaved={async () => {
          await loadAnalytics();
        }}
      />
    </div>
  );
}
