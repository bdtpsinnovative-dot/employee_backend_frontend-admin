import { supabase } from '../lib/supabase';
import { normalizeBrandSlug, sortSalesFirst } from './chatRoutingService';
import type {
  ChatAgentAnalytics,
  ChatAnalyticsDailyPoint,
  ChatAnalyticsSummary,
  ChatConversationAnalyticsItem,
  ChatDealOrder,
  ChatDealStatus,
  ChatQAReview,
  ChatResponseAnalytics,
  ChatTeamAnalytics,
} from '../types';

export type AnalyticsDatePreset = '7d' | '30d' | 'month' | 'all';

export type PerformanceQuadrant =
  | 'all_star'
  | 'closer_needs_qa'
  | 'helpful_needs_close'
  | 'needs_coaching'
  | 'pending_qa';

export interface AgentPerformanceEvaluation {
  speedScore: number | null;
  qaScore100: number | null;
  qualityScore: number | null;
  salesScore: number | null;
  hasQaReview: boolean;
  quadrant: PerformanceQuadrant;
  quadrantLabel: string;
  quadrantHint: string;
  quadrantBadgeClass: string;
}

const EMPTY_SUMMARY: ChatAnalyticsSummary = {
  total_conversations: 0,
  resolved_conversations: 0,
  won_conversations: 0,
  lost_conversations: 0,
  open_conversations: 0,
  total_won_orders: 0,
  new_won_orders: 0,
  repeat_won_orders: 0,
  repeat_customer_count: 0,
  new_won_amount: 0,
  repeat_won_amount: 0,
  total_won_amount: 0,
  total_agent_messages: 0,
  median_reply_minutes: null,
  avg_reply_minutes: null,
  sla_15m_pct: null,
  qa_reviewed_count: 0,
};

const toNumOrNull = (val: unknown): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

const toNum = (val: unknown, fallback = 0): number => {
  const n = toNumOrNull(val);
  return n === null ? fallback : n;
};

/** Compute UTC ISO bounds for UI date presets without mutating caller dates. */
export function buildDateRangePreset(preset: AnalyticsDatePreset): { from: string | null; to: string | null } {
  if (preset === 'all') return { from: null, to: null };
  const now = new Date();
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from: start.toISOString(), to: null };
  }
  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: null };
}

/** Fetch aggregated chat response analytics (median speed, reply share, deal outcomes, QA reviews). */
export async function fetchChatResponseAnalytics(params?: {
  from?: string | null;
  to?: string | null;
  brand?: string | null;
}): Promise<ChatResponseAnalytics> {
  const normalizedBrand =
    params?.brand && params.brand !== 'all' ? normalizeBrandSlug(params.brand) || 'all' : 'all';

  const { data, error } = await supabase.rpc('get_chat_response_analytics', {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_brand: normalizedBrand,
  });

  if (error) throw error;

  const raw = (data || {}) as Partial<ChatResponseAnalytics>;
  const rawSummary = (raw.summary || {}) as Partial<ChatAnalyticsSummary>;

  const summary: ChatAnalyticsSummary = {
    total_conversations: toNum(rawSummary.total_conversations),
    resolved_conversations: toNum(rawSummary.resolved_conversations),
    won_conversations: toNum(rawSummary.won_conversations),
    lost_conversations: toNum(rawSummary.lost_conversations),
    open_conversations: toNum(rawSummary.open_conversations),
    total_won_orders: toNum(rawSummary.total_won_orders),
    new_won_orders: toNum(rawSummary.new_won_orders),
    repeat_won_orders: toNum(rawSummary.repeat_won_orders),
    repeat_customer_count: toNum(rawSummary.repeat_customer_count),
    new_won_amount: toNum(rawSummary.new_won_amount),
    repeat_won_amount: toNum(rawSummary.repeat_won_amount),
    total_won_amount: toNum(rawSummary.total_won_amount),
    total_agent_messages: toNum(rawSummary.total_agent_messages),
    median_reply_minutes: toNumOrNull(rawSummary.median_reply_minutes),
    avg_reply_minutes: toNumOrNull(rawSummary.avg_reply_minutes),
    sla_15m_pct: toNumOrNull(rawSummary.sla_15m_pct),
    qa_reviewed_count: toNum(rawSummary.qa_reviewed_count),
  };

  const agents: ChatAgentAnalytics[] = sortSalesFirst(
    (Array.isArray(raw.agents) ? raw.agents : []).map((a) => ({
      agent_id: a.agent_id,
      first_name: a.first_name || '',
      last_name: a.last_name || '',
      nickname: a.nickname || null,
      avatar_url: a.avatar_url || null,
      role: a.role || 'user',
      status: a.status || 'active',
      msg_count: toNum(a.msg_count),
      reply_share_pct: toNum(a.reply_share_pct),
      replied_conv_count: toNum(a.replied_conv_count),
      assigned_conv_count: toNum(a.assigned_conv_count),
      reply_turns: toNum(a.reply_turns),
      avg_reply_minutes: toNumOrNull(a.avg_reply_minutes),
      median_reply_minutes: toNumOrNull(a.median_reply_minutes),
      sla_15m_pct: toNumOrNull(a.sla_15m_pct),
      won_count: toNum(a.won_count),
      new_won_count: toNum(a.new_won_count),
      repeat_won_count: toNum(a.repeat_won_count),
      repeat_won_amount: toNum(a.repeat_won_amount),
      lost_count: toNum(a.lost_count),
      resolved_count: toNum(a.resolved_count),
      won_amount: toNum(a.won_amount),
      win_rate_pct: toNumOrNull(a.win_rate_pct),
      qa_count: toNum(a.qa_count),
      avg_politeness: toNumOrNull(a.avg_politeness),
      avg_accuracy: toNumOrNull(a.avg_accuracy),
      avg_overall_qa: toNumOrNull(a.avg_overall_qa),
    }))
  );

  const conversations: ChatConversationAnalyticsItem[] = (
    Array.isArray(raw.conversations) ? raw.conversations : []
  ).map((c) => ({
    id: c.id,
    platform: c.platform || 'line',
    brand: c.brand || '',
    customer_name: c.customer_name || null,
    customer_avatar: c.customer_avatar || null,
    last_message: c.last_message || null,
    last_message_at: c.last_message_at,
    status: c.status || 'active',
    deal_status: (c.deal_status as ChatDealStatus) || 'open',
    deal_amount: toNumOrNull(c.deal_amount),
    deal_pi_no: c.deal_pi_no || '',
    deal_note: c.deal_note || '',
    assigned_to: c.assigned_to || null,
    closed_by: c.closed_by || null,
    closed_at: c.closed_at || null,
    team_id: c.team_id || null,
    team_name: c.team_name || null,
    won_order_count: toNum(c.won_order_count),
    repeat_won_count: toNum(c.repeat_won_count),
    deal_orders: Array.isArray(c.deal_orders)
      ? c.deal_orders.map((o) => ({
          id: o.id,
          conversation_id: o.conversation_id || c.id,
          is_repeat: Boolean(o.is_repeat),
          amount: toNumOrNull(o.amount),
          pi_no: o.pi_no || '',
          notes: o.notes || '',
          closed_by: o.closed_by || null,
          closed_at: o.closed_at,
        }))
      : [],
    msg_count: toNum(c.msg_count),
    responder_ids: Array.isArray(c.responder_ids) ? c.responder_ids : [],
    median_reply_minutes: toNumOrNull(c.median_reply_minutes),
    qa_reviews: Array.isArray(c.qa_reviews) ? c.qa_reviews : [],
  }));

  const daily_trend: ChatAnalyticsDailyPoint[] = (
    Array.isArray(raw.daily_trend) ? raw.daily_trend : []
  ).map((d) => ({
    day: String(d.day || ''),
    conv_count: toNum(d.conv_count),
    won_count: toNum(d.won_count),
    repeat_won_count: toNum(d.repeat_won_count),
    lost_count: toNum(d.lost_count),
    msg_count: toNum(d.msg_count),
  }));

  const teams: ChatTeamAnalytics[] = (
    Array.isArray(raw.teams) ? raw.teams : []
  ).map((t) => ({
    team_id: String(t.team_id || ''),
    team_name: String(t.team_name || 'ไม่ระบุทีม'),
    team_type: t.team_type || 'care_group',
    member_ids: Array.isArray(t.member_ids) ? t.member_ids.map(String) : [],
    conv_count: toNum(t.conv_count),
    resolved_count: toNum(t.resolved_count),
    won_count: toNum(t.won_count),
    new_won_count: toNum(t.new_won_count),
    repeat_won_count: toNum(t.repeat_won_count),
    repeat_won_amount: toNum(t.repeat_won_amount),
    lost_count: toNum(t.lost_count),
    won_amount: toNum(t.won_amount),
    win_rate_pct: toNumOrNull(t.win_rate_pct),
    msg_count: toNum(t.msg_count),
    replied_conv_count: toNum(t.replied_conv_count),
    reply_share_pct: toNum(t.reply_share_pct),
    reply_turns: toNum(t.reply_turns),
    avg_reply_minutes: toNumOrNull(t.avg_reply_minutes),
    median_reply_minutes: toNumOrNull(t.median_reply_minutes),
    sla_15m_pct: toNumOrNull(t.sla_15m_pct),
    qa_count: toNum(t.qa_count),
    avg_politeness: toNumOrNull(t.avg_politeness),
    avg_accuracy: toNumOrNull(t.avg_accuracy),
    avg_overall_qa: toNumOrNull(t.avg_overall_qa),
  }));

  return {
    summary: { ...EMPTY_SUMMARY, ...summary },
    agents,
    conversations,
    daily_trend,
    teams,
  };
}

/** Update deal outcome & resolved/active status on a conversation. */
export async function updateConversationDealOutcome(input: {
  conversationId: string;
  dealStatus: ChatDealStatus;
  status?: 'active' | 'resolved';
  dealAmount?: number | null;
  dealPiNo?: string | null;
  dealNote?: string | null;
  closedBy?: string | null;
}): Promise<{
  status: 'active' | 'resolved';
  deal_status: ChatDealStatus;
  deal_amount: number | null;
  deal_pi_no: string;
  deal_note: string;
  closed_by: string | null;
  closed_at: string | null;
}> {
  const nextStatus: 'active' | 'resolved' =
    input.status ?? (input.dealStatus === 'open' ? 'active' : 'resolved');
  const nowIso = new Date().toISOString();
  const parsedAmount =
    input.dealStatus === 'won' &&
    input.dealAmount !== null &&
    input.dealAmount !== undefined &&
    Number.isFinite(Number(input.dealAmount)) &&
    Number(input.dealAmount) >= 0
      ? Number(input.dealAmount)
      : null;

  const payload = {
    status: nextStatus,
    deal_status: input.dealStatus,
    deal_amount: parsedAmount,
    deal_pi_no: input.dealStatus === 'won' ? (input.dealPiNo || '').trim() : '',
    deal_note: (input.dealNote || '').trim(),
    closed_by: input.dealStatus === 'open' ? null : input.closedBy || null,
    closed_at: input.dealStatus === 'open' ? null : nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from('chat_conversations')
    .update(payload)
    .eq('id', input.conversationId);

  if (error) throw error;

  return {
    status: payload.status,
    deal_status: payload.deal_status,
    deal_amount: payload.deal_amount,
    deal_pi_no: payload.deal_pi_no,
    deal_note: payload.deal_note,
    closed_by: payload.closed_by,
    closed_at: payload.closed_at,
  };
}

/** Load chronological deal orders (first-time + repeat purchases) for one conversation. */
export async function fetchConversationDealOrders(conversationId: string): Promise<ChatDealOrder[]> {
  const { data, error } = await supabase
    .from('chat_deal_orders')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('closed_at', { ascending: true });

  if (error) throw error;
  return (data || []).map((o: any) => ({
    id: o.id,
    conversation_id: o.conversation_id,
    is_repeat: Boolean(o.is_repeat),
    amount: toNumOrNull(o.amount),
    pi_no: o.pi_no || '',
    notes: o.notes || '',
    closed_by: o.closed_by || null,
    closed_at: o.closed_at,
  }));
}

/** Recalculate summary deal fields on chat_conversations from its chat_deal_orders ledger. */
async function syncConversationDealSummary(conversationId: string) {
  const orders = await fetchConversationDealOrders(conversationId);
  const nowIso = new Date().toISOString();

  if (orders.length === 0) {
    const payload = {
      status: 'active' as const,
      deal_status: 'open' as const,
      deal_amount: null,
      deal_pi_no: '',
      deal_note: '',
      closed_by: null,
      closed_at: null,
      updated_at: nowIso,
    };
    const { error } = await supabase.from('chat_conversations').update(payload).eq('id', conversationId);
    if (error) throw error;
    return { orders, outcome: payload };
  }

  const totalAmount = orders.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const latest = orders[orders.length - 1];
  const payload = {
    status: 'resolved' as const,
    deal_status: 'won' as const,
    deal_amount: totalAmount > 0 ? totalAmount : null,
    deal_pi_no: latest.pi_no || '',
    deal_note: latest.notes || '',
    closed_by: latest.closed_by || null,
    closed_at: latest.closed_at || nowIso,
    updated_at: nowIso,
  };
  const { error } = await supabase.from('chat_conversations').update(payload).eq('id', conversationId);
  if (error) throw error;
  return { orders, outcome: payload };
}

/** Record a new Won order (either first purchase or Repeat Purchase / ซื้อซ้ำ) and sync summary. */
export async function recordWonDealOrder(input: {
  conversationId: string;
  isRepeat: boolean;
  amount?: number | null;
  piNo?: string | null;
  notes?: string | null;
  closedBy?: string | null;
}) {
  const parsedAmount =
    input.amount !== null &&
    input.amount !== undefined &&
    Number.isFinite(Number(input.amount)) &&
    Number(input.amount) >= 0
      ? Number(input.amount)
      : null;

  const { error } = await supabase.from('chat_deal_orders').insert({
    conversation_id: input.conversationId,
    is_repeat: Boolean(input.isRepeat),
    amount: parsedAmount,
    pi_no: (input.piNo || '').trim(),
    notes: (input.notes || '').trim(),
    closed_by: input.closedBy || null,
    closed_at: new Date().toISOString(),
  });
  if (error) throw error;

  return await syncConversationDealSummary(input.conversationId);
}

/** Delete one recorded deal order and resync conversation totals cleanly. */
export async function deleteChatDealOrder(orderId: string, conversationId: string) {
  const { error } = await supabase.from('chat_deal_orders').delete().eq('id', orderId);
  if (error) throw error;
  return await syncConversationDealSummary(conversationId);
}

const clampScore = (score: number): number => {
  if (!Number.isFinite(score)) return 5;
  return Math.max(1, Math.min(10, Math.round(score)));
};

/** Upsert a manual (or AI-overridden) QA score row for one responder in one conversation. */
export async function upsertChatQAReview(input: {
  conversationId: string;
  agentId: string;
  reviewerId?: string | null;
  politenessScore: number;
  accuracyScore: number;
  overallScore?: number | null;
  notes?: string | null;
  source?: 'manual' | 'ai' | 'ai_overridden';
}): Promise<ChatQAReview> {
  const politeness = clampScore(input.politenessScore);
  const accuracy = clampScore(input.accuracyScore);
  const overall =
    input.overallScore !== null && input.overallScore !== undefined
      ? clampScore(input.overallScore)
      : clampScore((politeness + accuracy) / 2);

  const row = {
    conversation_id: input.conversationId,
    agent_id: input.agentId,
    reviewer_id: input.reviewerId || null,
    source: input.source || 'manual',
    politeness_score: politeness,
    accuracy_score: accuracy,
    overall_score: overall,
    notes: (input.notes || '').trim(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('chat_qa_reviews')
    .upsert(row, { onConflict: 'conversation_id,agent_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data as ChatQAReview;
}

const computeSpeedCurve = (medianMinutes: number): number => {
  if (medianMinutes <= 5) return 100;
  if (medianMinutes <= 15) return 90;
  if (medianMinutes <= 30) return 78;
  if (medianMinutes <= 60) return 62;
  if (medianMinutes <= 120) return 45;
  return Math.max(20, Math.round(45 - (medianMinutes - 120) / 10));
};

interface DualAxisMetricInput {
  qa_count: number;
  avg_overall_qa: number | null;
  avg_politeness: number | null;
  avg_accuracy: number | null;
  median_reply_minutes: number | null;
  sla_15m_pct: number | null;
  resolved_count: number;
  win_rate_pct: number | null;
  won_count: number;
  hasActivity: boolean;
}

/**
 * Shared Dual-Axis evaluator used identically for individual agents and teams:
 * - Axis 1 (qualityScore): Reply speed + QA Politeness/Accuracy/Overall
 * - Axis 2 (salesScore): Deal conversion rate + won deals
 */
function evaluateDualAxis(m: DualAxisMetricInput): AgentPerformanceEvaluation {
  const hasQaReview =
    m.qa_count > 0 &&
    (m.avg_overall_qa !== null || (m.avg_politeness !== null && m.avg_accuracy !== null));

  const speedScore =
    m.median_reply_minutes !== null
      ? Math.round(
          0.6 * computeSpeedCurve(m.median_reply_minutes) +
            0.4 * (m.sla_15m_pct ?? computeSpeedCurve(m.median_reply_minutes))
        )
      : null;

  const qa10 = hasQaReview
    ? (m.avg_overall_qa ?? ((m.avg_politeness ?? 0) + (m.avg_accuracy ?? 0)) / 2)
    : null;
  const qaScore100 = qa10 !== null ? Math.round(qa10 * 10) : null;

  const qualityScore =
    qaScore100 !== null && speedScore !== null
      ? Math.round(0.7 * qaScore100 + 0.3 * speedScore)
      : qaScore100 ?? speedScore;

  const salesScore =
    m.resolved_count > 0
      ? Math.min(100, Math.round((m.win_rate_pct ?? 0) * 1.4 + Math.min(30, m.won_count * 6)))
      : m.won_count > 0
        ? Math.min(100, 60 + m.won_count * 8)
        : m.hasActivity
          ? 0
          : null;

  if (!hasQaReview) {
    return {
      speedScore,
      qaScore100: null,
      qualityScore,
      salesScore,
      hasQaReview: false,
      quadrant: 'pending_qa',
      quadrantLabel: 'รอประเมิน QA',
      quadrantHint:
        m.won_count > 0
          ? `ปิดการขายได้ ${m.won_count} ดีลแล้ว · รอหัวหน้าตรวจคุณภาพการคุย`
          : 'ยังไม่มีผลประเมินคุณภาพการตอบจากหัวหน้างาน',
      quadrantBadgeClass:
        'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    };
  }

  const qualityGood = (qualityScore ?? 0) >= 70;
  const salesGood = m.won_count > 0 && (m.win_rate_pct === null || m.win_rate_pct >= 20);

  if (qualityGood && salesGood) {
    return {
      speedScore,
      qaScore100,
      qualityScore,
      salesScore,
      hasQaReview: true,
      quadrant: 'all_star',
      quadrantLabel: 'เก่งรอบด้าน',
      quadrantHint: 'ตอบดี สุภาพ ไว และปิดการขายได้ต่อเนื่อง',
      quadrantBadgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    };
  }

  if (!qualityGood && salesGood) {
    return {
      speedScore,
      qaScore100,
      qualityScore,
      salesScore,
      hasQaReview: true,
      quadrant: 'closer_needs_qa',
      quadrantLabel: 'ปิดเก่ง · ปรับการคุย',
      quadrantHint: 'ปิดการขายได้จริง แต่คะแนนความไว/คุณภาพการตอบยังต่ำกว่าเกณฑ์',
      quadrantBadgeClass:
        'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    };
  }

  if (qualityGood && !salesGood) {
    return {
      speedScore,
      qaScore100,
      qualityScore,
      salesScore,
      hasQaReview: true,
      quadrant: 'helpful_needs_close',
      quadrantLabel: 'ตอบดี · เสริมปิดดีล',
      quadrantHint: 'คุณภาพการตอบและความไวดีมาก ควรเสริมทักษะปิดการขาย/ติดตามดีล',
      quadrantBadgeClass:
        'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
    };
  }

  return {
    speedScore,
    qaScore100,
    qualityScore,
    salesScore,
    hasQaReview: true,
    quadrant: 'needs_coaching',
    quadrantLabel: 'ควรเร่งดูแล',
    quadrantHint: 'ทั้งความเร็ว/คุณภาพการตอบและการปิดการขายยังต่ำกว่าเป้าหมาย',
    quadrantBadgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
  };
}

export function classifyAgentPerformance(agent: ChatAgentAnalytics): AgentPerformanceEvaluation {
  return evaluateDualAxis({
    ...agent,
    hasActivity: agent.replied_conv_count > 0 || agent.assigned_conv_count > 0,
  });
}

export function classifyTeamPerformance(team: ChatTeamAnalytics): AgentPerformanceEvaluation {
  return evaluateDualAxis({
    ...team,
    hasActivity: team.conv_count > 0 || team.msg_count > 0,
  });
}

export interface RoleTeamRollup {
  roleKey: 'sales' | 'admin';
  label: string;
  memberCount: number;
  msgCount: number;
  replySharePct: number;
  repliedConvCount: number;
  wonCount: number;
  lostCount: number;
  wonAmount: number;
  winRatePct: number | null;
  medianReplyMinutes: number | null;
  qaCount: number;
  avgOverallQa: number | null;
}

/** Roll up team-level comparison between Sales staff and Admin team. */
export function buildRoleTeamSummaries(agents: ChatAgentAnalytics[]): [RoleTeamRollup, RoleTeamRollup] {
  const aggregate = (roleKey: 'sales' | 'admin', label: string): RoleTeamRollup => {
    const members = agents.filter((a) =>
      roleKey === 'admin' ? a.role === 'admin' : a.role !== 'admin'
    );
    const totalMsgsAll = agents.reduce((sum, a) => sum + a.msg_count, 0);
    const msgCount = members.reduce((sum, a) => sum + a.msg_count, 0);
    const wonCount = members.reduce((sum, a) => sum + a.won_count, 0);
    const lostCount = members.reduce((sum, a) => sum + a.lost_count, 0);
    const wonAmount = members.reduce((sum, a) => sum + a.won_amount, 0);
    const repliedConvCount = members.reduce((sum, a) => sum + a.replied_conv_count, 0);

    let speedWeightSum = 0;
    let totalTurns = 0;
    let qaWeightedSum = 0;
    let qaCount = 0;

    members.forEach((a) => {
      if (a.median_reply_minutes !== null && a.reply_turns > 0) {
        speedWeightSum += a.median_reply_minutes * a.reply_turns;
        totalTurns += a.reply_turns;
      }
      if (a.avg_overall_qa !== null && a.qa_count > 0) {
        qaWeightedSum += a.avg_overall_qa * a.qa_count;
        qaCount += a.qa_count;
      }
    });

    return {
      roleKey,
      label,
      memberCount: members.length,
      msgCount,
      replySharePct: totalMsgsAll > 0 ? Math.round((msgCount / totalMsgsAll) * 1000) / 10 : 0,
      repliedConvCount,
      wonCount,
      lostCount,
      wonAmount,
      winRatePct:
        wonCount + lostCount > 0
          ? Math.round((wonCount / (wonCount + lostCount)) * 1000) / 10
          : null,
      medianReplyMinutes: totalTurns > 0 ? Math.round((speedWeightSum / totalTurns) * 10) / 10 : null,
      qaCount,
      avgOverallQa: qaCount > 0 ? Math.round((qaWeightedSum / qaCount) * 10) / 10 : null,
    };
  };

  return [
    aggregate('sales', 'ทีมเซลล์ (Sales)'),
    aggregate('admin', 'ทีมแอดมิน (Admin)'),
  ];
}

/** Resolve friendly team name (turns auto_team placeholder into member nicknames when available). */
export function resolveTeamDisplayName(
  team: Pick<ChatTeamAnalytics, 'team_name' | 'team_type' | 'member_ids'>,
  memberLookup: Map<string, { nickname?: string | null; first_name?: string | null }>
): string {
  if (team.team_type === 'auto_team' && team.team_name.startsWith('ทีมดูแลร่วม')) {
    const names = team.member_ids
      .map((id) => memberLookup.get(id))
      .filter(Boolean)
      .map((u) => (u?.nickname || u?.first_name || '').trim())
      .filter(Boolean);
    if (names.length > 0) {
      return `ทีม ${names.slice(0, 3).join(' + ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
    }
  }
  return team.team_name;
}

export function formatResponseDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return '< 1 นาที';
  if (minutes < 60) return `${Math.round(minutes)} นาที`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs} ชม. ${mins} น.` : `${hrs} ชม.`;
}

export function formatCurrencyTHB(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return '฿0';
  }
  return `฿${Math.round(amount).toLocaleString('th-TH')}`;
}

export function getAgentDisplayName(agent: {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}): string {
  const nick = (agent.nickname || '').trim();
  const full = `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
  if (nick && full) return `${nick} (${agent.first_name || full})`;
  return nick || full || 'ไม่ระบุชื่อ';
}
