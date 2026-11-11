import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Trophy,
  XCircle,
  RotateCcw,
  Star,
  MessageSquare,
  Check,
  Loader2,
  UserCheck,
  Receipt,
  Repeat,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { avatarUrl } from '../tasks/taskUtils';
import { sortSalesFirst } from '../../services/chatRoutingService';
import {
  deleteChatDealOrder,
  fetchConversationDealOrders,
  formatCurrencyTHB,
  getAgentDisplayName,
  recordWonDealOrder,
  updateConversationDealOutcome,
  upsertChatQAReview,
} from '../../services/chatAnalyticsService';
import type { ChatDealOrder, ChatDealStatus, ChatMessage, ChatQAReview } from '../../types';

export interface QAModalAgentInfo {
  id: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  avatar_url?: string | null;
  role: string;
}

export interface QAModalConversationInput {
  id: string;
  platform: 'line' | 'facebook' | 'instagram' | 'web';
  brand?: string | null;
  customer_name?: string | null;
  customer_avatar?: string | null;
  status: 'active' | 'resolved';
  deal_status?: ChatDealStatus;
  deal_amount?: number | null;
  deal_pi_no?: string | null;
  deal_note?: string | null;
  assigned_to?: string | null;
  closed_by?: string | null;
  responder_ids?: string[];
}

interface QAFormDraft {
  politeness: number;
  accuracy: number;
  overall: number;
  overallTouched: boolean;
  notes: string;
  saving: boolean;
  saved: boolean;
}

interface ChatQAReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: QAModalConversationInput | null;
  agents: QAModalAgentInfo[];
  currentUserId: string | null;
  isAdmin: boolean;
  initialMessages?: ChatMessage[];
  initialFocus?: 'outcome' | 'qa';
  onSaved?: (outcomeUpdate?: {
    conversationId: string;
    status: 'active' | 'resolved';
    deal_status: ChatDealStatus;
    deal_amount: number | null;
    deal_pi_no: string;
    deal_note: string;
    closed_by: string | null;
    closed_at: string | null;
  }) => void | Promise<void>;
}

const SCORE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const scoreToneClass = (score: number, active: boolean) => {
  if (!active) {
    return 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:border-slate-400';
  }
  if (score >= 8) return 'bg-emerald-600 text-white border-emerald-600 shadow-2xs';
  if (score >= 6) return 'bg-amber-500 text-white border-amber-500 shadow-2xs';
  return 'bg-rose-600 text-white border-rose-600 shadow-2xs';
};

export default function ChatQAReviewModal({
  isOpen,
  onClose,
  conversation,
  agents,
  currentUserId,
  isAdmin,
  initialMessages,
  initialFocus = 'qa',
  onSaved,
}: ChatQAReviewModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // Deal outcome & repeat-purchase orders state
  const [dealStatus, setDealStatus] = useState<ChatDealStatus>('open');
  const [isRepeatPurchase, setIsRepeatPurchase] = useState(false);
  const [dealOrders, setDealOrders] = useState<ChatDealOrder[]>([]);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [dealAmount, setDealAmount] = useState<string>('');
  const [dealPiNo, setDealPiNo] = useState<string>('');
  const [dealNote, setDealNote] = useState<string>('');
  const [closedBy, setClosedBy] = useState<string>('');
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeSavedTick, setOutcomeSavedTick] = useState(false);

  // Per-agent QA form state
  const [qaDrafts, setQaDrafts] = useState<Record<string, QAFormDraft>>({});
  const [existingReviews, setExistingReviews] = useState<Record<string, ChatQAReview>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const agentMap = useMemo(() => {
    const map = new Map<string, QAModalAgentInfo>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  const sortedAllAgents = useMemo(() => sortSalesFirst(agents), [agents]);

  // Initialize outcome fields & fetch thread/QA reviews whenever modal opens for a conversation
  useEffect(() => {
    if (!isOpen || !conversation) return;

    setErrorMsg(null);
    setOutcomeSavedTick(false);
    setDealStatus(conversation.deal_status || (conversation.status === 'resolved' ? 'lost' : 'open'));
    const alreadyWon = conversation.deal_status === 'won';
    setIsRepeatPurchase(alreadyWon);
    setDealAmount(alreadyWon ? '' : conversation.deal_amount !== null && conversation.deal_amount !== undefined ? String(conversation.deal_amount) : '');
    setDealPiNo(alreadyWon ? '' : conversation.deal_pi_no || '');
    setDealNote(alreadyWon ? '' : conversation.deal_note || '');
    setDealOrders([]);
    setClosedBy(conversation.closed_by || conversation.assigned_to || currentUserId || '');

    let cancelled = false;

    const loadContext = async () => {
      setLoadingThread(true);
      try {
        // 1. Load messages if caller didn't supply them
        if (initialMessages && initialMessages.length > 0) {
          if (!cancelled) setMessages(initialMessages);
        } else {
          const { data: msgRows } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: true })
            .limit(300);
          if (!cancelled) setMessages((msgRows || []) as ChatMessage[]);
        }

        // 2. Load existing QA reviews + historical deal orders in parallel
        const [reviewRes, orderRows] = await Promise.all([
          supabase.from('chat_qa_reviews').select('*').eq('conversation_id', conversation.id),
          fetchConversationDealOrders(conversation.id).catch(() => [] as ChatDealOrder[]),
        ]);

        if (!cancelled) {
          const map: Record<string, ChatQAReview> = {};
          (reviewRes.data || []).forEach((r) => {
            const rev = r as ChatQAReview;
            map[rev.agent_id] = rev;
          });
          setExistingReviews(map);
          setDealOrders(orderRows);
          if (orderRows.length > 0) {
            setIsRepeatPurchase(true);
          }
        }
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err?.message || 'โหลดข้อมูลแชทไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    };

    loadContext();
    return () => {
      cancelled = true;
    };
  }, [isOpen, conversation?.id]);

  // Derive distinct responders (from RPC responder_ids, messages, or assigned_to) ordered Sales first
  const responderAgents = useMemo(() => {
    if (!conversation) return [];
    const idSet = new Set<string>(conversation.responder_ids || []);

    messages.forEach((m) => {
      if (m.sender_type !== 'agent') return;
      const metaId =
        m.metadata && typeof m.metadata === 'object' ? (m.metadata.sender_id as string | undefined) : undefined;
      const sid = m.sender_id || metaId || conversation.assigned_to;
      if (sid) idSet.add(sid);
    });

    Object.keys(existingReviews).forEach((aid) => idSet.add(aid));

    if (idSet.size === 0 && conversation.assigned_to) {
      idSet.add(conversation.assigned_to);
    }

    const resolvedList = Array.from(idSet)
      .map((id) => agentMap.get(id))
      .filter((a): a is QAModalAgentInfo => Boolean(a));

    return sortSalesFirst(resolvedList);
  }, [conversation, messages, existingReviews, agentMap]);

  // Auto-prefer first non-admin responder as deal closer if closed_by wasn't explicitly recorded
  useEffect(() => {
    if (!isOpen || !conversation || conversation.closed_by) return;
    if (conversation.assigned_to) {
      setClosedBy(conversation.assigned_to);
      return;
    }
    const salesResponder = responderAgents.find((a) => a.role !== 'admin');
    if (salesResponder) {
      setClosedBy(salesResponder.id);
    } else if (responderAgents[0]) {
      setClosedBy(responderAgents[0].id);
    }
  }, [isOpen, conversation?.id, responderAgents]);

  // Synchronize draft QA state whenever responder list or loaded reviews change
  useEffect(() => {
    setQaDrafts((prev) => {
      const next: Record<string, QAFormDraft> = {};
      responderAgents.forEach((agent) => {
        const existing = existingReviews[agent.id];
        const prevDraft = prev[agent.id];
        if (prevDraft) {
          next[agent.id] = prevDraft;
        } else {
          const p = existing?.politeness_score ?? 8;
          const a = existing?.accuracy_score ?? 8;
          const o = existing?.overall_score ?? Math.round((p + a) / 2);
          next[agent.id] = {
            politeness: p,
            accuracy: a,
            overall: o,
            overallTouched: Boolean(existing?.overall_score),
            notes: existing?.notes || '',
            saving: false,
            saved: false,
          };
        }
      });
      return next;
    });
  }, [responderAgents, existingReviews]);

  if (!isOpen || !conversation) return null;

  const updateDraftScore = (
    agentId: string,
    field: 'politeness' | 'accuracy' | 'overall',
    value: number
  ) => {
    setQaDrafts((prev) => {
      const curr = prev[agentId] || {
        politeness: 8,
        accuracy: 8,
        overall: 8,
        overallTouched: false,
        notes: '',
        saving: false,
        saved: false,
      };
      const updated = { ...curr, [field]: value, saved: false };
      if (field === 'overall') {
        updated.overallTouched = true;
      } else if (!curr.overallTouched) {
        const nextP = field === 'politeness' ? value : curr.politeness;
        const nextA = field === 'accuracy' ? value : curr.accuracy;
        updated.overall = Math.round((nextP + nextA) / 2);
      }
      return { ...prev, [agentId]: updated };
    });
  };

  const handleSaveOutcome = async (overrideStatus?: ChatDealStatus) => {
    const targetDeal = overrideStatus ?? dealStatus;
    setSavingOutcome(true);
    setErrorMsg(null);
    try {
      const amountVal =
        targetDeal === 'won' && dealAmount.trim() !== '' ? Number(dealAmount) : null;

      let outcomePayload;
      if (targetDeal === 'won') {
        const res = await recordWonDealOrder({
          conversationId: conversation.id,
          isRepeat: isRepeatPurchase,
          amount: amountVal,
          piNo: dealPiNo,
          notes: dealNote,
          closedBy: closedBy || currentUserId,
        });
        setDealOrders(res.orders);
        setIsRepeatPurchase(true);
        setDealAmount('');
        setDealPiNo('');
        setDealNote('');
        outcomePayload = res.outcome;
      } else {
        outcomePayload = await updateConversationDealOutcome({
          conversationId: conversation.id,
          dealStatus: targetDeal,
          dealAmount: null,
          dealPiNo: '',
          dealNote,
          closedBy: targetDeal === 'open' ? null : closedBy || currentUserId,
        });
      }

      setDealStatus(outcomePayload.deal_status);
      setOutcomeSavedTick(true);
      await onSaved?.({
        conversationId: conversation.id,
        ...outcomePayload,
      });
      // Close immediately when triggered as quick Outcome modal from ChatInbox
      if (initialFocus === 'outcome' && !isAdmin) {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'บันทึกผลปิดเคสไม่สำเร็จ');
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('ยืนยันลบรายการออเดอร์นี้ออกจากประวัติ?')) return;
    setDeletingOrderId(orderId);
    setErrorMsg(null);
    try {
      const res = await deleteChatDealOrder(orderId, conversation.id);
      setDealOrders(res.orders);
      setDealStatus(res.outcome.deal_status);
      setIsRepeatPurchase(res.orders.length > 0);
      await onSaved?.({
        conversationId: conversation.id,
        ...res.outcome,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'ลบออเดอร์ไม่สำเร็จ');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleSaveQA = async (agentId: string) => {
    const draft = qaDrafts[agentId];
    if (!draft) return;

    setQaDrafts((prev) => ({ ...prev, [agentId]: { ...draft, saving: true } }));
    setErrorMsg(null);
    try {
      const savedRow = await upsertChatQAReview({
        conversationId: conversation.id,
        agentId,
        reviewerId: currentUserId,
        politenessScore: draft.politeness,
        accuracyScore: draft.accuracy,
        overallScore: draft.overall,
        notes: draft.notes,
        source: existingReviews[agentId]?.source === 'ai' ? 'ai_overridden' : 'manual',
      });
      setExistingReviews((prev) => ({ ...prev, [agentId]: savedRow }));
      setQaDrafts((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], saving: false, saved: true },
      }));
      await onSaved?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'บันทึกคะแนน QA ไม่สำเร็จ');
      setQaDrafts((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], saving: false },
      }));
    }
  };

  const renderScoreRow = (
    agentId: string,
    label: string,
    field: 'politeness' | 'accuracy' | 'overall',
    value: number
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600 dark:text-zinc-300">{label}</span>
        <span className="font-bold text-slate-900 dark:text-white">{value}/10</span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {SCORE_LEVELS.map((num) => (
          <button
            key={num}
            type="button"
            disabled={!isAdmin}
            onClick={() => updateDraftScore(agentId, field, num)}
            className={`h-7 rounded-md border text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed ${scoreToneClass(
              num,
              value === num
            )}`}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/50">
          <div className="flex items-center gap-3 min-w-0">
            {conversation.customer_avatar ? (
              <img
                src={conversation.customer_avatar}
                alt={conversation.customer_name || 'Customer'}
                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-zinc-700"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-zinc-300">
                {(conversation.customer_name || 'C').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {conversation.customer_name || 'ลูกค้าไม่ระบุชื่อ'}
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                  {conversation.platform}
                </span>
                {conversation.brand && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                    {conversation.brand}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {initialFocus === 'outcome'
                  ? 'บันทึกผลปิดเคส / ปิดการขาย และตรวจคุณภาพการตอบ'
                  : 'อ่านบทสนทนาจริง · อัปเดตผลปิดการขาย & ให้คะแนนคุณภาพ (QA)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-5 mt-3 px-3.5 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Main 2-Column Content */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Column: Conversation Transcript */}
          <div className="lg:col-span-6 flex flex-col min-h-[260px] max-h-[45vh] lg:max-h-full border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-950/30">
            <div className="px-4 py-2.5 border-b border-slate-200/70 dark:border-zinc-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
                <MessageSquare size={14} className="text-slate-500" />
                ประวัติบทสนทนา ({messages.length} ข้อความ)
              </span>
              {responderAgents.length > 0 && (
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  ผู้ตอบ {responderAgents.length} คน
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loadingThread ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
                  <Loader2 size={16} className="animate-spin" />
                  กำลังโหลดข้อความ...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">ไม่พบข้อความในห้องแชทนี้</div>
              ) : (
                messages.map((m) => {
                  const isAgent = m.sender_type === 'agent';
                  const isSystem = (m.sender_type as string) === 'system' || m.sender_type === 'bot';
                  if (isSystem) {
                    return (
                      <div key={m.id} className="text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-zinc-800 text-[10px] text-slate-500 dark:text-zinc-400">
                          {m.content}
                        </span>
                      </div>
                    );
                  }
                  const senderId =
                    m.sender_id ||
                    (m.metadata && typeof m.metadata === 'object'
                      ? (m.metadata.sender_id as string | undefined)
                      : undefined);
                  const senderAgent = senderId ? agentMap.get(senderId) : undefined;
                  const senderLabel = isAgent
                    ? senderAgent
                      ? getAgentDisplayName(senderAgent)
                      : m.sender_name || 'แอดมิน'
                    : conversation.customer_name || 'ลูกค้า';

                  return (
                    <div key={m.id} className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5 px-1">
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
                          {senderLabel}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(m.created_at).toLocaleString('th-TH', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                          isAgent
                            ? 'bg-slate-900 text-white dark:bg-blue-600'
                            : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        {m.content || (m.message_type !== 'text' ? `[${m.message_type}]` : '')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Deal Outcome + Manual QA Scoring */}
          <div className="lg:col-span-6 overflow-y-auto p-5 space-y-5">
            {/* Section 1: Sales Outcome Tagging */}
            <section className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Receipt size={14} className="text-emerald-600" />
                    สถานะเคส & ผลปิดการขาย (Sales Outcome)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    แยกผลปิดการขายออกจากคะแนนคุณภาพการพูดคุยอย่างชัดเจน
                  </p>
                </div>
                {outcomeSavedTick && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                    <Check size={13} /> บันทึกแล้ว
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDealStatus('won')}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    dealStatus === 'won'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-emerald-400'
                  }`}
                >
                  <Trophy size={14} />
                  <span>ปิดการขายได้</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDealStatus('lost')}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    dealStatus === 'lost'
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-zinc-700 shadow-xs'
                      : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-slate-400'
                  }`}
                >
                  <XCircle size={14} />
                  <span>ปิดเคส · ไม่ซื้อ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDealStatus('open')}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    dealStatus === 'open'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-blue-400'
                  }`}
                >
                  <RotateCcw size={14} />
                  <span>กำลังดูแล</span>
                </button>
              </div>

              {dealStatus === 'won' && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                      ประเภทออเดอร์:
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsRepeatPurchase(false)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                        !isRepeatPurchase
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                      }`}
                    >
                      ซื้อครั้งแรก (New)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRepeatPurchase(true)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                        isRepeatPurchase
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                      }`}
                    >
                      <Repeat size={12} />
                      ลูกค้าซื้อซ้ำ (Repeat)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        ยอดขายบิลนี้ (บาท · ไม่บังคับ)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={dealAmount}
                        onChange={(e) => setDealAmount(e.target.value)}
                        placeholder="เช่น 45000"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        เลขที่ PI / อ้างอิงบิล
                      </label>
                      <input
                        type="text"
                        value={dealPiNo}
                        onChange={(e) => setDealPiNo(e.target.value)}
                        placeholder="เช่น PI-2026-0042"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {dealStatus !== 'open' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                      ผู้ปิดเคส / ผู้ได้เครดิตดีล
                    </label>
                    <select
                      value={closedBy}
                      onChange={(e) => setClosedBy(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:outline-none focus:border-slate-500"
                    >
                      <option value="">-- เลือกผู้ปิดเคส --</option>
                      {sortedAllAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {getAgentDisplayName(a)} {a.role === 'admin' ? '[Admin]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                      หมายเหตุผลเคส
                    </label>
                    <input
                      type="text"
                      value={dealNote}
                      onChange={(e) => setDealNote(e.target.value)}
                      placeholder={
                        dealStatus === 'won' ? 'เช่น สั่งหินอ่อน + ติดตั้ง' : 'เช่น ลูกค้ารอเปรียบเทียบราคา'
                      }
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:outline-none focus:border-slate-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={savingOutcome}
                  onClick={() => handleSaveOutcome()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingOutcome ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {dealStatus === 'won'
                    ? isRepeatPurchase
                      ? '+ บันทึกออเดอร์ซื้อซ้ำ'
                      : 'บันทึกปิดการขาย'
                    : 'บันทึกผลเคส'}
                </button>
              </div>

              {dealOrders.length > 0 && (
                <div className="pt-2.5 border-t border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                    <span>ประวัติปิดการขายในห้องแชทนี้ ({dealOrders.length} บิล)</span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      รวม {formatCurrencyTHB(dealOrders.reduce((s, o) => s + (o.amount ?? 0), 0))}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dealOrders.map((ord, idx) => {
                      const closer = ord.closed_by ? agentMap.get(ord.closed_by) : null;
                      return (
                        <div
                          key={ord.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800 text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-500">#{idx + 1}</span>
                            {ord.is_repeat ? (
                              <span className="px-1.5 py-0.2 rounded bg-teal-50 border border-teal-200 text-teal-700 text-[9.5px] font-bold">
                                ซื้อซ้ำ
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9.5px] font-bold">
                                ครั้งแรก
                              </span>
                            )}
                            <span className="font-bold text-slate-900 dark:text-white">
                              {ord.amount ? formatCurrencyTHB(ord.amount) : 'ไม่ระบุยอด'}
                            </span>
                            {ord.pi_no && (
                              <span className="text-slate-500 truncate">{ord.pi_no}</span>
                            )}
                            {closer && (
                              <span className="text-slate-400 truncate">
                                · โดย {closer.nickname || closer.first_name}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={deletingOrderId === ord.id}
                            onClick={() => void handleDeleteOrder(ord.id)}
                            title="ลบรายการนี้"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Section 2: Manual QA Review per Responder (Editable by Admin, Read-only for Agent) */}
            {(isAdmin || Object.keys(existingReviews).length > 0) && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Star size={14} className="text-amber-500" />
                      คะแนนคุณภาพการตอบ (QA Review · 1–10)
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      {isAdmin
                        ? 'ประเมินแยกตามผู้ที่ตอบจริงในแชทนี้ (เซลล์อยู่ด้านบน แอดมินอยู่ด้านล่าง)'
                        : 'ผลประเมินจากหัวหน้างานสำหรับเคสนี้'}
                    </p>
                  </div>
                </div>

                {responderAgents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 p-4 text-center text-xs text-slate-500">
                    ยังไม่มีพนักงานตอบกลับในห้องแชทนี้ (จึงยังไม่มีรายชื่อผู้ตอบให้ประเมิน QA)
                  </div>
                ) : (
                  <div className="space-y-3">
                    {responderAgents.map((agent) => {
                      const draft = qaDrafts[agent.id];
                      const savedReview = existingReviews[agent.id];
                      if (!draft) return null;
                      if (!isAdmin && !savedReview) return null;

                      return (
                        <div
                          key={agent.id}
                          className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {avatarUrl(agent.avatar_url) ? (
                                <img
                                  src={avatarUrl(agent.avatar_url) || undefined}
                                  alt={agent.first_name}
                                  className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-zinc-700"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                                  {(agent.nickname || agent.first_name || '?').slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {getAgentDisplayName(agent)}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                      agent.role === 'admin'
                                        ? 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                    }`}
                                  >
                                    {agent.role === 'admin' ? 'Admin' : 'Sales'}
                                  </span>
                                </div>
                                {savedReview?.updated_at && (
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <UserCheck size={11} />
                                    ประเมินแล้วเมื่อ{' '}
                                    {new Date(savedReview.updated_at).toLocaleDateString('th-TH', {
                                      day: '2-digit',
                                      month: 'short',
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>

                            {draft.saved && (
                              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                                <Check size={13} /> บันทึก QA แล้ว
                              </span>
                            )}
                          </div>

                          <div className="space-y-2.5">
                            {renderScoreRow(agent.id, '1. ความสุภาพ / น้ำเสียง', 'politeness', draft.politeness)}
                            {renderScoreRow(agent.id, '2. ตอบตรงประเด็น / ข้อมูลถูกต้อง', 'accuracy', draft.accuracy)}
                            {renderScoreRow(agent.id, '3. ภาพรวมคุณภาพการสื่อสาร', 'overall', draft.overall)}
                          </div>

                          <div className="space-y-2 pt-1">
                            <textarea
                              rows={2}
                              readOnly={!isAdmin}
                              value={draft.notes}
                              onChange={(e) =>
                                setQaDrafts((prev) => ({
                                  ...prev,
                                  [agent.id]: { ...prev[agent.id], notes: e.target.value, saved: false },
                                }))
                              }
                              placeholder="ข้อเสนอแนะสำหรับพนักงาน (เช่น จุดที่ตอบดี หรือจุดที่ควรปรับปรุงการพูดคุย)..."
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 text-slate-900 dark:text-white focus:outline-none focus:border-slate-500"
                            />
                            {isAdmin && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  disabled={draft.saving}
                                  onClick={() => handleSaveQA(agent.id)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {draft.saving ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Check size={13} />
                                  )}
                                  {savedReview ? 'อัปเดตคะแนน QA' : 'บันทึกคะแนน QA'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
