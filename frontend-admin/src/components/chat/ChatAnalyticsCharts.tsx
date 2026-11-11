import { useMemo, useState } from 'react';
import { BarChart3, PieChart, TrendingUp, Activity, Eye, Shuffle } from 'lucide-react';
import {
  buildRoleTeamSummaries,
  classifyAgentPerformance,
  classifyTeamPerformance,
  formatResponseDuration,
  resolveTeamDisplayName,
} from '../../services/chatAnalyticsService';
import { normalizeBrandSlug, sortSalesFirst, type ChatBrandOption } from '../../services/chatRoutingService';
import type {
  ChatAgentAnalytics,
  ChatAnalyticsDailyPoint,
  ChatAnalyticsSummary,
  ChatConversationAnalyticsItem,
  ChatTeamAnalytics,
} from '../../types';

export const ANALYTICS_SERIES_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#64748b',
];

interface DonutSlice {
  key: string;
  label: string;
  value: number;
  subText?: string;
  color: string;
  badge?: string;
}

interface DonutCardProps {
  title: string;
  subtitle: string;
  slices: DonutSlice[];
  centerTotalLabel: string;
  centerTotalValue: string | number;
  emptyText: string;
  selectedKey?: string | null;
  onSliceClick?: (key: string) => void;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
}

/** Shared interactive SVG Donut chart card. */
function DonutChartCard({
  title,
  subtitle,
  slices,
  centerTotalLabel,
  centerTotalValue,
  emptyText,
  selectedKey,
  onSliceClick,
  headerRight,
  footer,
}: DonutCardProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const total = useMemo(
    () => slices.reduce((sum, s) => sum + (s.value > 0 ? s.value : 0), 0),
    [slices]
  );

  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const computedArcs = useMemo(() => {
    let cumulative = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const fraction = total > 0 ? s.value / total : 0;
        const arcLen = fraction * circumference;
        const offset = -cumulative * circumference;
        cumulative += fraction;
        return {
          ...s,
          pct: Math.round(fraction * 1000) / 10,
          arcLen,
          offset,
        };
      });
  }, [slices, total, circumference]);

  const activeSlice = useMemo(() => {
    const targetKey = hoveredKey || selectedKey;
    return targetKey ? computedArcs.find((a) => a.key === targetKey) || null : null;
  }, [computedArcs, hoveredKey, selectedKey]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col justify-between gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <PieChart size={14} className="text-blue-600" />
            {title}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
        {headerRight}
      </div>

      {total <= 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3">
          {/* Donut SVG */}
          <div className="sm:col-span-5 flex items-center justify-center">
            <div className="relative w-32 h-32 xl:w-36 xl:h-36">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90 overflow-visible">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="18"
                  className="text-slate-100 dark:text-zinc-800"
                />
                {computedArcs.map((arc) => {
                  const isActive =
                    hoveredKey === arc.key || (hoveredKey === null && selectedKey === arc.key);
                  return (
                    <circle
                      key={arc.key}
                      cx="70"
                      cy="70"
                      r={radius}
                      fill="none"
                      stroke={arc.color}
                      strokeWidth={isActive ? 22 : 18}
                      strokeDasharray={`${arc.arcLen} ${circumference}`}
                      strokeDashoffset={arc.offset}
                      strokeLinecap="butt"
                      className={`transition-all duration-150 ${onSliceClick ? 'cursor-pointer' : ''}`}
                      onMouseEnter={() => setHoveredKey(arc.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onClick={() => onSliceClick?.(arc.key)}
                    />
                  );
                })}
              </svg>

              {/* Center readout */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-400 truncate max-w-[90px]">
                  {activeSlice ? activeSlice.label : centerTotalLabel}
                </span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
                  {activeSlice ? `${activeSlice.pct}%` : centerTotalValue}
                </span>
                {activeSlice && (
                  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                    {activeSlice.subText || `${activeSlice.value}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Legend */}
          <div className="sm:col-span-7 space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {computedArcs.map((arc) => {
              const isActive = hoveredKey === arc.key || selectedKey === arc.key;
              return (
                <button
                  key={arc.key}
                  type="button"
                  onMouseEnter={() => setHoveredKey(arc.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSliceClick?.(arc.key)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors ${
                    onSliceClick ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isActive
                      ? 'bg-slate-100/90 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700'
                      : 'bg-slate-50/50 dark:bg-zinc-950/40 border-slate-200/60 dark:border-zinc-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: arc.color }}
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                      {arc.label}
                    </span>
                    {arc.badge && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200/80 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
                        {arc.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="font-extrabold text-slate-900 dark:text-white">{arc.pct}%</span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      ({arc.value})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {footer}
    </div>
  );
}

interface ChatAnalyticsChartsProps {
  viewMode: 'individual' | 'team';
  summary: ChatAnalyticsSummary | undefined;
  agents: ChatAgentAnalytics[];
  teams: ChatTeamAnalytics[];
  conversations: ChatConversationAnalyticsItem[];
  dailyTrend: ChatAnalyticsDailyPoint[];
  brandOptions: ChatBrandOption[];
  agentLookup: Map<string, { nickname?: string | null; first_name?: string | null }>;
  selectedAgentId: string | null;
  selectedTeamId: string | null;
  activeCoverageKey: string | null;
  canAutoAssign: boolean;
  bulkAssigning: boolean;
  onSelectAgent: (agentId: string) => void;
  onSelectTeam: (teamId: string) => void;
  onSelectCoverageCategory: (category: 'team_group' | 'solo' | 'unassigned') => void;
  onBulkAutoAssign: () => void;
}

const TEAM_TYPE_SHORT: Record<ChatTeamAnalytics['team_type'], string> = {
  care_group: 'กลุ่มดูแล',
  auto_team: 'ทีมร่วม',
  solo: 'ดูแลเดี่ยว',
  unassigned: 'รอจัดกลุ่ม',
};

interface ComparisonBarItem {
  key: string;
  label: string;
  badge: string;
  primaryValue: number;
  primaryText: string;
  medianReplyMinutes: number | null;
  qualityScore: number | null;
  salesScore: number | null;
}

export default function ChatAnalyticsCharts({
  viewMode,
  summary,
  agents,
  teams,
  conversations,
  dailyTrend,
  brandOptions,
  agentLookup,
  selectedAgentId,
  selectedTeamId,
  activeCoverageKey,
  canAutoAssign,
  bulkAssigning,
  onSelectAgent,
  onSelectTeam,
  onSelectCoverageCategory,
  onBulkAutoAssign,
}: ChatAnalyticsChartsProps) {
  const [teamDonutMetric, setTeamDonutMetric] = useState<'convs' | 'msgs'>('convs');
  const [splitMode, setSplitMode] = useState<'deals' | 'roles' | 'platform' | 'brand'>('deals');
  const [barMetric, setBarMetric] = useState<'replies' | 'speed' | 'dual'>('replies');
  const [trendMode, setTrendMode] = useState<'convs' | 'msgs'>('convs');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  // 1A. Individual Reply Share Donut Slices
  const replySlices: DonutSlice[] = useMemo(() => {
    return [...agents]
      .filter((a) => a.msg_count > 0)
      .sort((a, b) => b.msg_count - a.msg_count)
      .map((a, idx) => ({
        key: a.agent_id,
        label: a.nickname || a.first_name || 'ไม่ระบุ',
        value: a.msg_count,
        subText: `${a.msg_count} ข้อความ`,
        color: ANALYTICS_SERIES_COLORS[idx % ANALYTICS_SERIES_COLORS.length],
        badge: a.role === 'admin' ? 'Admin' : 'Sales',
      }));
  }, [agents]);

  // 1B. Team / Care Group Donut Slices
  const teamDonutConfig = useMemo(() => {
    const activeTeams = teams.filter((t) =>
      teamDonutMetric === 'msgs' ? t.msg_count > 0 : t.conv_count > 0
    );
    const total = activeTeams.reduce(
      (sum, t) => sum + (teamDonutMetric === 'msgs' ? t.msg_count : t.conv_count),
      0
    );
    return {
      total,
      label: teamDonutMetric === 'msgs' ? 'ข้อความรวม' : 'เคสทั้งหมด',
      slices: [...activeTeams]
        .sort((a, b) =>
          teamDonutMetric === 'msgs' ? b.msg_count - a.msg_count : b.conv_count - a.conv_count
        )
        .map((t, idx) => {
          const val = teamDonutMetric === 'msgs' ? t.msg_count : t.conv_count;
          const teamColor =
            t.team_type === 'unassigned'
              ? '#94a3b8'
              : t.team_type === 'solo'
                ? '#0891b2'
                : ANALYTICS_SERIES_COLORS[idx % ANALYTICS_SERIES_COLORS.length];
          return {
            key: t.team_id,
            label: resolveTeamDisplayName(t, agentLookup),
            value: val,
            subText: teamDonutMetric === 'msgs' ? `${t.msg_count} ข้อความ` : `${t.conv_count} เคส`,
            color: teamColor,
            badge: TEAM_TYPE_SHORT[t.team_type],
          };
        }) as DonutSlice[],
    };
  }, [teams, teamDonutMetric, agentLookup]);

  // 2. Second Donut Slices (Deal Status / Role Teams / Platform / Brand)
  const secondDonutConfig = useMemo(() => {
    if (splitMode === 'roles') {
      const [salesRollup, adminRollup] = buildRoleTeamSummaries(agents);
      const total = salesRollup.msgCount + adminRollup.msgCount;
      return {
        label: 'รวมทีมตอบ',
        total,
        slices: [
          {
            key: 'sales',
            label: `${salesRollup.label}`,
            value: salesRollup.msgCount,
            subText: `${salesRollup.msgCount} ข้อความ · ปิดได้ ${salesRollup.wonCount}`,
            color: '#2563eb',
          },
          {
            key: 'admin',
            label: `${adminRollup.label}`,
            value: adminRollup.msgCount,
            subText: `${adminRollup.msgCount} ข้อความ · ปิดได้ ${adminRollup.wonCount}`,
            color: '#64748b',
          },
        ] as DonutSlice[],
      };
    }

    if (splitMode === 'deals') {
      const won = summary?.won_conversations ?? 0;
      const repeatCust = Math.min(won, summary?.repeat_customer_count ?? 0);
      const firstTimeWon = Math.max(0, won - repeatCust);
      const lost = summary?.lost_conversations ?? 0;
      const open = summary?.open_conversations ?? 0;
      return {
        label: 'รวมเคส',
        total: summary?.total_conversations ?? won + lost + open,
        slices: [
          {
            key: 'won_new',
            label: 'ซื้อครั้งแรก (New)',
            value: firstTimeWon,
            subText: `${firstTimeWon} ลค.`,
            color: '#059669',
          },
          {
            key: 'won_repeat',
            label: 'ลูกค้าซื้อซ้ำ (Repeat)',
            value: repeatCust,
            subText: `${summary?.repeat_won_orders ?? repeatCust} บิล`,
            color: '#0d9488',
          },
          { key: 'open', label: 'กำลังดูแล (Open)', value: open, subText: `${open} เคส`, color: '#2563eb' },
          { key: 'lost', label: 'ปิดเคส · ไม่ซื้อ (Lost)', value: lost, subText: `${lost} เคส`, color: '#64748b' },
        ] as DonutSlice[],
      };
    }

    if (splitMode === 'platform') {
      const counts = new Map<string, number>();
      conversations.forEach((c) => {
        const p = (c.platform || 'other').toLowerCase();
        counts.set(p, (counts.get(p) || 0) + 1);
      });
      const meta: Record<string, { label: string; color: string }> = {
        line: { label: 'LINE OA', color: '#06C755' },
        facebook: { label: 'Facebook Page', color: '#1877F2' },
        instagram: { label: 'Instagram DM', color: '#E1306C' },
        web: { label: 'Web Chat', color: '#6366F1' },
      };
      return {
        label: 'รวมเคส',
        total: conversations.length,
        slices: Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([k, v], i) => ({
            key: k,
            label: meta[k]?.label || k.toUpperCase(),
            value: v,
            subText: `${v} เคส`,
            color: meta[k]?.color || ANALYTICS_SERIES_COLORS[i % ANALYTICS_SERIES_COLORS.length],
          })) as DonutSlice[],
      };
    }

    // Brand breakdown
    const brandMap = new Map<string, number>();
    conversations.forEach((c) => {
      const slug = normalizeBrandSlug(c.brand) || 'other';
      brandMap.set(slug, (brandMap.get(slug) || 0) + 1);
    });
    return {
      label: 'รวมเคส',
      total: conversations.length,
      slices: Array.from(brandMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([slug, count], idx) => {
          const opt = brandOptions.find((b) => b.slug === slug);
          return {
            key: slug,
            label: opt?.shortLabel || opt?.label || slug.toUpperCase(),
            value: count,
            subText: `${count} เคส`,
            color: opt?.bg || ANALYTICS_SERIES_COLORS[idx % ANALYTICS_SERIES_COLORS.length],
          };
        }) as DonutSlice[],
    };
  }, [splitMode, summary, conversations, brandOptions, agents]);

  // 2B. Caretaker Coverage Donut Slices (Have Team vs Solo Agent vs NO Team & NO Agent)
  const coverageDonutConfig = useMemo(() => {
    const teamGroupCount = teams
      .filter((t) => t.team_type === 'care_group' || t.team_type === 'auto_team')
      .reduce((sum, t) => sum + t.conv_count, 0);
    const soloCount = teams
      .filter((t) => t.team_type === 'solo')
      .reduce((sum, t) => sum + t.conv_count, 0);
    const unassignedCount = teams
      .filter((t) => t.team_type === 'unassigned')
      .reduce((sum, t) => sum + t.conv_count, 0);

    return {
      unassignedCount,
      total: teamGroupCount + soloCount + unassignedCount,
      slices: [
        {
          key: 'unassigned',
          label: 'ยังไม่มีทีม & เซลล์',
          value: unassignedCount,
          subText: `${unassignedCount} เคส`,
          color: '#f59e0b',
        },
        {
          key: 'solo',
          label: 'มีเซลล์ดูแลเดี่ยวแล้ว',
          value: soloCount,
          subText: `${soloCount} เคส`,
          color: '#2563eb',
        },
        {
          key: 'team_group',
          label: 'มีทีม / กลุ่มดูแลแล้ว',
          value: teamGroupCount,
          subText: `${teamGroupCount} เคส`,
          color: '#059669',
        },
      ] as DonutSlice[],
    };
  }, [teams]);

  // 3. Unified Comparison Horizontal Bar Data (individual OR team)
  const barItems: ComparisonBarItem[] = useMemo(() => {
    if (viewMode === 'team') {
      const totalConvs = Math.max(
        1,
        teams.reduce((s, t) => s + t.conv_count, 0)
      );
      return teams
        .filter((t) => t.conv_count > 0 || t.msg_count > 0)
        .map((t) => {
          const perf = classifyTeamPerformance(t);
          const convPct = Math.round((t.conv_count / totalConvs) * 1000) / 10;
          return {
            key: t.team_id,
            label: resolveTeamDisplayName(t, agentLookup),
            badge: TEAM_TYPE_SHORT[t.team_type],
            primaryValue: t.conv_count,
            primaryText: `${t.conv_count} เคส (${convPct}%) · ตอบ ${t.msg_count}`,
            medianReplyMinutes: t.median_reply_minutes,
            qualityScore: perf.qualityScore,
            salesScore: perf.salesScore,
          };
        });
    }

    return sortSalesFirst(
      agents.filter(
        (a) => a.msg_count > 0 || a.assigned_conv_count > 0 || a.won_count > 0 || a.qa_count > 0
      )
    ).map((a) => {
      const perf = classifyAgentPerformance(a);
      return {
        key: a.agent_id,
        label: a.nickname || a.first_name || 'ไม่ระบุ',
        badge: a.role === 'admin' ? 'Admin' : 'Sales',
        primaryValue: a.msg_count,
        primaryText: `${a.msg_count} ข้อความ (${a.reply_share_pct.toFixed(1)}%)`,
        medianReplyMinutes: a.median_reply_minutes,
        qualityScore: perf.qualityScore,
        salesScore: perf.salesScore,
      };
    });
  }, [viewMode, teams, agents, agentLookup]);

  const maxPrimaryBar = useMemo(
    () => Math.max(1, ...barItems.map((i) => i.primaryValue)),
    [barItems]
  );
  const maxMedianSpeed = useMemo(
    () =>
      Math.max(
        30,
        ...barItems.map((i) => (i.medianReplyMinutes !== null ? i.medianReplyMinutes : 0))
      ),
    [barItems]
  );

  // 4. Daily Trend SVG Chart Bounds
  const trendBars = useMemo(() => dailyTrend.slice(-20), [dailyTrend]);
  const maxTrendVal = useMemo(() => {
    if (trendBars.length === 0) return 1;
    if (trendMode === 'msgs') {
      return Math.max(1, ...trendBars.map((d) => d.msg_count));
    }
    return Math.max(1, ...trendBars.map((d) => d.conv_count));
  }, [trendBars, trendMode]);

  const hoveredTrendPoint = useMemo(
    () => (hoveredDay ? trendBars.find((d) => d.day === hoveredDay) || null : null),
    [trendBars, hoveredDay]
  );

  return (
    <div className="space-y-4">
      {/* Row 1: Three Interactive Proportion Donut Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {viewMode === 'team' ? (
          <DonutChartCard
            title="วงกลมสัดส่วนตามทีม / กลุ่มดูแลลูกค้า"
            subtitle="คลิกที่ชิ้นส่วนหรือรายชื่อทีมเพื่อกรองดูเคสในทีมนั้นด้านล่าง"
            slices={teamDonutConfig.slices}
            centerTotalLabel={teamDonutConfig.label}
            centerTotalValue={teamDonutConfig.total}
            emptyText="ยังไม่มีข้อมูลเคสตามทีมในช่วงเวลานี้"
            selectedKey={selectedTeamId}
            onSliceClick={onSelectTeam}
            headerRight={
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
                {(
                  [
                    { id: 'convs', label: 'จำนวนเคส' },
                    { id: 'msgs', label: 'ข้อความตอบ' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTeamDonutMetric(m.id)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                      teamDonutMetric === m.id
                        ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            }
          />
        ) : (
          <DonutChartCard
            title="วงกลมสัดส่วนการช่วยตอบแชท (Reply Share)"
            subtitle="คลิกที่ชิ้นส่วนหรือรายชื่อเพื่อกรองดูเคสของพนักงานคนนั้นด้านล่าง"
            slices={replySlices}
            centerTotalLabel="รวมทั้งหมด"
            centerTotalValue={summary?.total_agent_messages ?? 0}
            emptyText="ยังไม่มีข้อความตอบกลับในช่วงเวลานี้"
            selectedKey={selectedAgentId}
            onSliceClick={onSelectAgent}
          />
        )}

        <DonutChartCard
          title="วงกลมสัดส่วนสถานะเคส, ฝ่าย & ช่องทาง"
          subtitle="สลับมุมมองระหว่าง ฝ่าย Sales vs Admin, ผลปิดเคส, แพลตฟอร์ม และแบรนด์"
          slices={secondDonutConfig.slices}
          centerTotalLabel={secondDonutConfig.label}
          centerTotalValue={secondDonutConfig.total}
          emptyText="ยังไม่มีข้อมูลในช่วงเวลานี้"
          headerRight={
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
              {(
                [
                  { id: 'deals', label: 'ผลปิดเคส' },
                  { id: 'roles', label: 'ฝ่าย Sales/Admin' },
                  { id: 'platform', label: 'แพลตฟอร์ม' },
                  { id: 'brand', label: 'แบรนด์' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSplitMode(tab.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                    splitMode === tab.id
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          }
        />

        <DonutChartCard
          title="วงกลมสัดส่วนการมีผู้ดูแลเคส"
          subtitle="คลิกชิ้นส่วนสีส้มเพื่อดูลูกค้าที่ยังไม่มีทีมและเซลล์ดูแล"
          slices={coverageDonutConfig.slices}
          centerTotalLabel="เคสทั้งหมด"
          centerTotalValue={coverageDonutConfig.total}
          emptyText="ยังไม่มีข้อมูลเคสในช่วงเวลานี้"
          selectedKey={activeCoverageKey || 'unassigned'}
          onSliceClick={(k) => onSelectCoverageCategory(k as 'team_group' | 'solo' | 'unassigned')}
          footer={
            coverageDonutConfig.unassignedCount > 0 ? (
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectCoverageCategory('unassigned')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <Eye size={12} />
                  ดูยังไม่มีคนดูแล ({coverageDonutConfig.unassignedCount})
                </button>
                {canAutoAssign && (
                  <button
                    type="button"
                    disabled={bulkAssigning}
                    onClick={onBulkAutoAssign}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 text-amber-900 dark:text-amber-200 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Shuffle size={12} />
                    {bulkAssigning ? 'กำลังสุ่ม...' : 'สุ่มจ่ายงานออโต้'}
                  </button>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      {/* Row 2: Horizontal Comparison Bar Chart + Daily Trend SVG Column Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Horizontal Bar Chart (Individual OR Team) */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <BarChart3 size={14} className="text-blue-600" />
                {viewMode === 'team'
                  ? 'กราฟเปรียบเทียบรายทีม & กลุ่มดูแล'
                  : 'กราฟเปรียบเทียบรายบุคคล (เซลล์บน · แอดมินล่าง)'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {barMetric === 'replies' &&
                  (viewMode === 'team'
                    ? 'จำนวนเคสและข้อความที่ตอบจริงของแต่ละกลุ่ม/ทีม'
                    : 'จำนวนข้อความที่ตอบจริงเทียบสัดส่วนทีม')}
                {barMetric === 'speed' && 'เวลาตอบกลับกลาง (Median) · เส้นประคือเกณฑ์ SLA 15 นาที'}
                {barMetric === 'dual' && 'เทียบ 2 แกนแบบแยกสี: คุณภาพ/ความไว (น้ำเงิน) vs ปิดการขาย (เขียว)'}
              </p>
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
              {(
                [
                  { id: 'replies', label: viewMode === 'team' ? 'ปริมาณเคส' : 'ปริมาณตอบ' },
                  { id: 'speed', label: 'ความไว' },
                  { id: 'dual', label: '2 แกน' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBarMetric(m.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                    barMetric === m.id
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {barItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {viewMode === 'team' ? 'ยังไม่มีข้อมูลทีมในช่วงนี้' : 'ยังไม่มีข้อมูลพนักงานในช่วงนี้'}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 relative">
              {barItems.map((item) => {
                const isSelected =
                  viewMode === 'team' ? selectedTeamId === item.key : selectedAgentId === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      viewMode === 'team' ? onSelectTeam(item.key) : onSelectAgent(item.key)
                    }
                    className={`w-full text-left rounded-xl px-2.5 py-2 border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800'
                        : 'bg-slate-50/50 dark:bg-zinc-950/40 border-slate-200/60 dark:border-zinc-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                          {item.label}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                          {item.badge}
                        </span>
                      </div>

                      {barMetric === 'replies' && (
                        <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                          {item.primaryText}
                        </span>
                      )}
                      {barMetric === 'speed' && (
                        <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                          {formatResponseDuration(item.medianReplyMinutes)}
                        </span>
                      )}
                      {barMetric === 'dual' && (
                        <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">
                          คุณภาพ {item.qualityScore ?? '—'} · ขาย {item.salesScore ?? '—'}
                        </span>
                      )}
                    </div>

                    {barMetric === 'replies' && (
                      <div className="h-2.5 w-full rounded-full bg-slate-200/70 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{
                            width: `${Math.max(
                              item.primaryValue > 0 ? 4 : 0,
                              Math.round((item.primaryValue / maxPrimaryBar) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    )}

                    {barMetric === 'speed' && (
                      <div className="relative h-2.5 w-full rounded-full bg-slate-200/70 dark:bg-zinc-800 overflow-hidden">
                        {/* 15m SLA benchmark marker */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-500/70 z-10"
                          style={{ left: `${Math.min(98, Math.round((15 / maxMedianSpeed) * 100))}%` }}
                          title="เกณฑ์ 15 นาที"
                        />
                        {item.medianReplyMinutes !== null && (
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.medianReplyMinutes <= 15
                                ? 'bg-emerald-500'
                                : item.medianReplyMinutes <= 60
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{
                              width: `${Math.max(
                                4,
                                Math.min(100, Math.round((item.medianReplyMinutes / maxMedianSpeed) * 100))
                              )}%`,
                            }}
                          />
                        )}
                      </div>
                    )}

                    {barMetric === 'dual' && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] w-10 font-bold text-blue-600">คุณภาพ</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-200/70 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all"
                              style={{ width: `${item.qualityScore ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] w-10 font-bold text-emerald-600">ปิดขาย</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-200/70 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${item.salesScore ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily Volume & Outcomes Column Bar Chart */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <TrendingUp size={14} className="text-emerald-600" />
                กราฟแท่งแนวโน้มรายวัน (เวลาไทย)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {hoveredTrendPoint
                  ? `วันที่ ${hoveredTrendPoint.day} · ${hoveredTrendPoint.conv_count} เคส (ชนะ ${hoveredTrendPoint.won_count}) · ทีมตอบ ${hoveredTrendPoint.msg_count} ข้อความ`
                  : 'ชี้ที่แท่งกราฟเพื่อดูรายละเอียดรายวัน'}
              </p>
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
              {(
                [
                  { id: 'convs', label: 'เคส & ปิดการขาย' },
                  { id: 'msgs', label: 'ข้อความที่ตอบ' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrendMode(t.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                    trendMode === t.id
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {trendBars.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <Activity size={14} /> ยังไม่มีแนวโน้มรายวันในช่วงเวลานี้
            </div>
          ) : (
            <div className="pt-2 overflow-x-auto pb-2">
              <div className="min-w-[340px]">
                {/* Columns resting flush on baseline */}
                <div className="h-36 flex items-end gap-1.5 px-1 border-b border-slate-200 dark:border-zinc-800">
                  {trendBars.map((point) => {
                    const val = trendMode === 'msgs' ? point.msg_count : point.conv_count;
                    const heightPct = val > 0 ? Math.max(8, Math.round((val / maxTrendVal) * 100)) : 2;
                    const wonPct =
                      trendMode === 'convs' && val > 0 && point.won_count > 0
                        ? Math.min(heightPct, Math.max(6, Math.round((point.won_count / maxTrendVal) * 100)))
                        : 0;
                    const isHover = hoveredDay === point.day;

                    return (
                      <div
                        key={point.day}
                        onMouseEnter={() => setHoveredDay(point.day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        className="flex-1 min-w-[16px] h-full flex flex-col justify-end items-center cursor-pointer"
                      >
                        <span
                          className={`text-[9px] font-bold mb-1 transition-opacity ${
                            isHover ? 'opacity-100 text-slate-900 dark:text-white' : 'opacity-0'
                          }`}
                        >
                          {val}
                        </span>
                        <div className="w-full max-w-[26px] flex flex-col justify-end items-center flex-1">
                          <div
                            className={`w-full rounded-t-md relative overflow-hidden transition-all ${
                              trendMode === 'msgs'
                                ? isHover
                                  ? 'bg-blue-700'
                                  : 'bg-blue-500/85'
                                : isHover
                                  ? 'bg-slate-600 dark:bg-zinc-500'
                                  : 'bg-slate-300 dark:bg-zinc-700'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          >
                            {wonPct > 0 && (
                              <div
                                className="absolute bottom-0 left-0 right-0 bg-emerald-500 transition-all"
                                style={{ height: `${Math.round((wonPct / heightPct) * 100)}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* X-axis dates cleanly beneath baseline */}
                <div className="flex items-start gap-1.5 px-1 pt-2 h-8">
                  {trendBars.map((point) => {
                    const isHover = hoveredDay === point.day;
                    const shortDate = point.day.slice(5).replace('-', '/');
                    return (
                      <div
                        key={`lbl-${point.day}`}
                        className="flex-1 min-w-[16px] flex justify-center"
                      >
                        <span
                          className={`text-[9px] -rotate-45 origin-top whitespace-nowrap ${
                            isHover
                              ? 'font-bold text-slate-800 dark:text-white'
                              : 'text-slate-400 dark:text-zinc-500'
                          }`}
                        >
                          {shortDate}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-zinc-400">
                {trendMode === 'convs' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-zinc-700" />
                      เคสทั้งหมดรายวัน
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                      เคสปิดการขายได้ (Won)
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" />
                    ข้อความที่ทีมส่งตอบต่อวัน
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
