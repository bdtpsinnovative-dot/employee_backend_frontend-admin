import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dices,
  X,
  Check,
  RefreshCw,
  Search,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatAccessUsers,
  fetchChatSystemConfig,
  assignConversation,
  BRAND_OPTIONS,
} from '../../services/chatRoutingService';
import type { User, ChatAccessUser, ChatSystemConfig } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';

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

interface SimulatedAssignment {
  conversation: UnassignedCustomer;
  assignedAgent: User;
}

interface ChatDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialBrand?: string;
}

function StaffAvatarImg({ url, name, size = 26 }: { url?: string | null; name: string; size?: number }) {
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
        fontSize: size <= 22 ? '0.65rem' : '0.75rem',
        flexShrink: 0,
      }}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

// Brand pill color helper
function getBrandBadge(brand: string) {
  const b = (brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (b.includes('wallcraft')) {
    return { bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800', label: 'WALLCRAFT' };
  }
  if (b.includes('terra')) {
    return { bg: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800', label: 'TERRA' };
  }
  if (b.includes('zenslab')) {
    return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800', label: 'ZENSLAB' };
  }
  if (b.includes('ember')) {
    return { bg: 'bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700', label: 'EMBER & ASH' };
  }
  return { bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300', label: brand || 'ทั่วไป' };
}

export default function ChatDistributionModal({
  isOpen,
  onClose,
  onSuccess,
  initialBrand = 'all',
}: ChatDistributionModalProps) {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<UnassignedCustomer[]>([]);
  const [eligibleStaff, setEligibleStaff] = useState<User[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [systemConfig, setSystemConfig] = useState<ChatSystemConfig | null>(null);

  // Filter state
  const [brandFilter, setBrandFilter] = useState<string>(initialBrand);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewAgentFilter, setPreviewAgentFilter] = useState<string>('all'); // Filter table by assigned agent

  // Simulation state
  const [hasSimulated, setHasSimulated] = useState(false);
  const [simulatedAssignments, setSimulatedAssignments] = useState<SimulatedAssignment[]>([]);
  const [isRolling, setIsRolling] = useState(false);

  // Approval execution state
  const [isApproving, setIsApproving] = useState(false);
  const [approvedCount, setApprovedCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 1. Load data
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setSuccessMessage(null);
      setHasSimulated(false);
      setSimulatedAssignments([]);
      setPreviewAgentFilter('all');

      const [customersRes, usersRes, accessList, sysCfg] = await Promise.all([
        supabase
          .from('chat_conversations')
          .select('id, brand, customer_name, customer_avatar, platform, last_message, last_message_at, metadata')
          .is('assigned_to', null)
          .order('last_message_at', { ascending: false }),
        fetchUsers().catch(() => []),
        fetchChatAccessUsers().catch(() => []),
        fetchChatSystemConfig().catch(() => null),
      ]);

      const unassignedList = (customersRes.data || []) as UnassignedCustomer[];
      setCustomers(unassignedList);
      setSystemConfig(sysCfg);

      // Filter staff: Users with chat access AND Super Admins (Admin can be caretaker too)
      const staffList = (usersRes as User[]).filter((u) => {
        if (u.role === 'admin') return true;
        return (accessList as ChatAccessUser[]).some(
          (a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled !== false
        );
      });

      setEligibleStaff(staffList);

      // Default: select non-paused agents
      const unpausedIds = staffList
        .filter((u) => !sysCfg?.agent_weights?.[u.id]?.is_paused)
        .map((u) => u.id);

      setSelectedAgentIds(unpausedIds.length > 0 ? unpausedIds : staffList.map((u) => u.id));
    } catch (err: any) {
      console.error('Failed to load distribution data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadInitialData();
    }
  }, [isOpen, loadInitialData]);

  // Filter customers by brand
  const filteredCustomers = useMemo(() => {
    if (brandFilter === 'all') return customers;
    return customers.filter(
      (c) => (c.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '') === brandFilter.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
  }, [customers, brandFilter]);

  // Brand count stats
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = { all: customers.length };
    customers.forEach((c) => {
      const b = (c.brand || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
      counts[b] = (counts[b] || 0) + 1;
    });
    return counts;
  }, [customers]);

  // Toggle agent selection
  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
    setHasSimulated(false);
    setSimulatedAssignments([]);
    setPreviewAgentFilter('all');
  };

  const selectAllAgents = () => {
    setSelectedAgentIds(eligibleStaff.map((u) => u.id));
    setHasSimulated(false);
    setPreviewAgentFilter('all');
  };

  const deselectAllAgents = () => {
    setSelectedAgentIds([]);
    setHasSimulated(false);
    setPreviewAgentFilter('all');
  };

  // 2. Simulate Random Distribution
  const handleSimulate = () => {
    if (filteredCustomers.length === 0) {
      alert('ไม่มีลูกค้าที่รอการสุ่มตามแบรนด์ที่เลือกครับ');
      return;
    }
    if (selectedAgentIds.length === 0) {
      alert('กรุณาเลือกเซลล์/ผู้ดูแลอย่างน้อย 1 คน เพื่อร่วมรับลูกค้าครับ');
      return;
    }

    setIsRolling(true);

    const activeStaff = eligibleStaff.filter((u) => selectedAgentIds.includes(u.id));

    // Build weighted pool
    const agentPool: User[] = [];
    activeStaff.forEach((staff) => {
      const weight = Math.max(1, systemConfig?.agent_weights?.[staff.id]?.weight ?? 1);
      for (let i = 0; i < weight; i++) {
        agentPool.push(staff);
      }
    });

    // Fisher-Yates shuffle
    const shuffledPool = [...agentPool];
    for (let i = shuffledPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
    }

    // Distribute customers
    const results: SimulatedAssignment[] = filteredCustomers.map((cust, idx) => {
      const agent = shuffledPool[idx % shuffledPool.length];
      return {
        conversation: cust,
        assignedAgent: agent,
      };
    });

    setTimeout(() => {
      setSimulatedAssignments(results);
      setHasSimulated(true);
      setIsRolling(false);
      setPreviewAgentFilter('all');
    }, 350);
  };

  // Manual override for a customer in preview
  const handleOverrideAgent = (convId: string, newAgentId: string) => {
    const targetAgent = eligibleStaff.find((u) => u.id === newAgentId);
    if (!targetAgent) return;

    setSimulatedAssignments((prev) =>
      prev.map((item) =>
        item.conversation.id === convId ? { ...item, assignedAgent: targetAgent } : item
      )
    );
  };

  // Per-Agent breakdown stats
  const agentBreakdown = useMemo(() => {
    const stats: Record<string, { user: User; count: number; percent: number }> = {};
    const activeStaff = eligibleStaff.filter((u) => selectedAgentIds.includes(u.id));

    activeStaff.forEach((u) => {
      stats[u.id] = { user: u, count: 0, percent: 0 };
    });

    simulatedAssignments.forEach((item) => {
      if (stats[item.assignedAgent.id]) {
        stats[item.assignedAgent.id].count++;
      }
    });

    const total = simulatedAssignments.length;
    if (total > 0) {
      Object.values(stats).forEach((s) => {
        s.percent = Math.round((s.count / total) * 100);
      });
    }

    return Object.values(stats);
  }, [simulatedAssignments, eligibleStaff, selectedAgentIds]);

  // Filter preview list by search query & agent filter
  const displayedAssignments = useMemo(() => {
    let list = simulatedAssignments;

    if (previewAgentFilter !== 'all') {
      list = list.filter((item) => item.assignedAgent.id === previewAgentFilter);
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;

    return list.filter((item) => {
      const cName = (item.conversation.customer_name || '').toLowerCase();
      const bName = (item.conversation.brand || '').toLowerCase();
      const aName = `${item.assignedAgent.first_name} ${item.assignedAgent.last_name} ${item.assignedAgent.nickname || ''}`.toLowerCase();
      const lastMsg = (item.conversation.last_message || '').toLowerCase();
      return cName.includes(q) || bName.includes(q) || aName.includes(q) || lastMsg.includes(q);
    });
  }, [simulatedAssignments, searchQuery, previewAgentFilter]);

  // 3. Approve & Execute Batch Assignment in Database
  const handleApprove = async () => {
    if (simulatedAssignments.length === 0) return;

    const total = simulatedAssignments.length;
    const confirmMsg = `ยืนยันการอนุมัติและกระจายลูกค้าจำนวน ${total} คน ให้กับผู้ดูแลที่เลือกใช่หรือไม่?`;
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
            const agentName = item.assignedAgent.nickname
              ? `${item.assignedAgent.first_name} (${item.assignedAgent.nickname})`
              : item.assignedAgent.first_name;

            await assignConversation(item.conversation.id, {
              id: item.assignedAgent.id,
              name: agentName,
              avatar: item.assignedAgent.avatar_url,
              assignedAgentIds: [item.assignedAgent.id],
            });
          })
        );
        count += batch.length;
        setApprovedCount(count);
      }

      setSuccessMessage(`🎉 อนุมัติกระจายลูกค้า ${total} เคสให้ผู้ดูแลสำเร็จเรียบร้อยแล้ว!`);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div className="w-full max-w-6xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col h-[88vh] max-h-[820px] overflow-hidden animate-fadeIn">
        {/* ================= COMPACT HEADER ================= */}
        <div className="px-5 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-zinc-850/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Dices size={18} className={isRolling ? 'animate-spin' : ''} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <span>สุ่มกระจายลูกค้าให้เซลล์ & อนุมัติจ่ายงาน</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  รอจ่ายงาน {filteredCustomers.length} เคส
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                สุ่มเฉพาะลูกค้าที่ยังไม่มีคนดูแล ตรวจผลลัพธ์จำลองก่อนกดยืนยันจ่ายงานจริง
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isApproving}
            className="w-8 h-8 rounded-xl hover:bg-slate-200/60 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-all disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* ================= SUCCESS BANNER ================= */}
        {successMessage && (
          <div className="p-3 bg-emerald-600 text-white flex items-center justify-center gap-2 text-xs font-bold animate-fadeIn shrink-0">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* ================= MAIN 2-COLUMN SPLIT LAYOUT ================= */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
            <p className="text-xs font-bold">กำลังโหลดข้อมูลลูกค้าและเซลล์...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* ⬅️ LEFT COLUMN: Settings & Agents Selection (Width: 320px) */}
            <div className="w-full md:w-[320px] p-4 border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/30 flex flex-col justify-between shrink-0 overflow-y-auto">
              <div className="space-y-4">
                {/* 1. Brand Selection */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
                    แบรนด์ลูกค้า
                  </label>
                  <select
                    value={brandFilter}
                    onChange={(e) => {
                      setBrandFilter(e.target.value);
                      setHasSimulated(false);
                      setSimulatedAssignments([]);
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-zinc-200 cursor-pointer focus:outline-none focus:border-blue-500 shadow-2xs"
                  >
                    <option value="all">🌐 ทุกแบรนด์ ({brandCounts.all || 0} เคส)</option>
                    {BRAND_OPTIONS.filter((b) => b.slug !== 'all').map((b) => {
                      const count = brandCounts[b.slug.toLowerCase().replace(/[^a-z0-9]/g, '')] || 0;
                      return (
                        <option key={b.slug} value={b.slug}>
                          {b.label.split(' ')[0]} ({count} เคส)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Select Caretakers (Admins + Staff with Chat Access) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      เลือกผู้รับลูกค้า ({selectedAgentIds.length}/{eligibleStaff.length})
                    </label>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={selectAllAgents}
                        className="text-blue-600 hover:underline font-bold cursor-pointer"
                      >
                        ทั้งหมด
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllAgents}
                        className="text-slate-400 hover:text-red-500 font-semibold cursor-pointer"
                      >
                        ล้าง
                      </button>
                    </div>
                  </div>

                  {/* Agent Cards with Live Quota Badges */}
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {eligibleStaff.map((staff) => {
                      const isSelected = selectedAgentIds.includes(staff.id);
                      const breakdownItem = agentBreakdown.find((b) => b.user.id === staff.id);
                      const assignedCount = breakdownItem?.count ?? 0;
                      const percent = breakdownItem?.percent ?? 0;
                      const isAdmin = staff.role === 'admin';

                      return (
                        <div
                          key={staff.id}
                          onClick={() => toggleAgent(staff.id)}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-white dark:bg-zinc-800 border-blue-400 dark:border-blue-600 shadow-2xs ring-1 ring-blue-400/20'
                              : 'bg-slate-100/60 dark:bg-zinc-850/60 border-slate-200/60 dark:border-zinc-800 opacity-50 hover:opacity-80'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleAgent(staff.id)}
                              className="accent-blue-600 rounded cursor-pointer shrink-0"
                            />
                            <StaffAvatarImg
                              url={staff.avatar_url}
                              name={staff.nickname || staff.first_name}
                              size={26}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                                  {staff.first_name} {staff.nickname ? `(${staff.nickname})` : ''}
                                </span>
                                {isAdmin && (
                                  <span className="px-1 py-0.2 rounded text-[8px] font-black bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 shrink-0">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 truncate block">
                                {staff.department || 'ทีมงาน'}
                              </span>
                            </div>
                          </div>

                          {/* Live Simulation Result Pill */}
                          <div className="shrink-0 text-right">
                            {hasSimulated && isSelected ? (
                              <div className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-center">
                                <span className="text-xs font-black block leading-none">
                                  {assignedCount} เคส
                                </span>
                                <span className="text-[8px] opacity-80 block leading-none mt-0.5">
                                  {percent}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-700">
                                พร้อมรับ
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Action inside Left Sidebar */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-zinc-800 mt-3 space-y-2">
                <button
                  type="button"
                  onClick={handleSimulate}
                  disabled={isRolling || filteredCustomers.length === 0 || selectedAgentIds.length === 0}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Dices size={15} className={isRolling ? 'animate-spin' : ''} />
                  <span>
                    {isRolling
                      ? 'กำลังสุ่ม...'
                      : hasSimulated
                      ? '🔄 สุ่มใหม่อีกรอบ (Re-roll)'
                      : `🎲 สุ่มจำลอง (${filteredCustomers.length} เคส)`}
                  </span>
                </button>
                <span className="text-[10px] text-slate-400 text-center block">
                  💡 สุ่มจำลองให้ดูก่อน ยังไม่บันทึกลงระบบจริง
                </span>
              </div>
            </div>

            {/* ➡️ RIGHT COLUMN: Customer Assignment Queue & Preview (Flex-1) */}
            <div className="flex-1 p-4 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">
              {/* Filter Tabs Bar (All vs Per Agent) */}
              {hasSimulated && (
                <div className="pb-3 border-b border-slate-100 dark:border-zinc-800 shrink-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {/* Quick Agent Filter Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewAgentFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          previewAgentFilter === 'all'
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                        }`}
                      >
                        ทั้งหมด ({simulatedAssignments.length})
                      </button>

                      {agentBreakdown.map((item) => (
                        <button
                          key={item.user.id}
                          type="button"
                          onClick={() => setPreviewAgentFilter(item.user.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            previewAgentFilter === item.user.id
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 hover:bg-blue-100'
                          }`}
                        >
                          <StaffAvatarImg url={item.user.avatar_url} name={item.user.nickname || item.user.first_name} size={16} />
                          <span>{item.user.nickname || item.user.first_name}: {item.count}</span>
                        </button>
                      ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-48 shrink-0">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหาลูกค้า, แบรนด์..."
                        className="w-full pl-7 pr-2.5 py-1 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Table / Customer List */}
              <div className="flex-1 overflow-y-auto py-2">
                {!hasSimulated ? (
                  /* Initial State: Waiting for simulation */
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200/80 dark:border-zinc-800 rounded-2xl bg-slate-50/30">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-3 shadow-inner">
                      <Dices size={28} />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-zinc-200">
                      พร้อมสุ่มกระจายลูกค้า {filteredCustomers.length} คน
                    </h4>
                    <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                      เลือกเซลล์และแอดมินที่ต้องการในแถบซ้าย แล้วกดปุ่ม <b>"สุ่มจำลอง"</b> ด้านล่างซ้ายได้เลยครับ
                    </p>
                    <button
                      type="button"
                      onClick={handleSimulate}
                      disabled={filteredCustomers.length === 0 || selectedAgentIds.length === 0}
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-40"
                    >
                      🎲 กดสุ่มจำลองผลลัพธ์เดี๋ยวนี้
                    </button>
                  </div>
                ) : displayedAssignments.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 text-xs">
                    ไม่พบรายการลูกค้าตามคำค้นหา
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {displayedAssignments.map(({ conversation: c, assignedAgent }) => {
                      const brandBadge = getBrandBadge(c.brand);
                      return (
                        <div
                          key={c.id}
                          className="py-2.5 px-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-zinc-850/50 rounded-xl transition-colors"
                        >
                          {/* Left: Customer & Message Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <StaffAvatarImg url={c.customer_avatar} name={c.customer_name} size={32} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-slate-900 dark:text-zinc-100 truncate">
                                  {c.customer_name}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black tracking-wider border ${brandBadge.bg}`}>
                                  {brandBadge.label}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {c.platform === 'line' ? '🟢 LINE' : c.platform === 'facebook' ? '🔵 FB' : '🟣 IG'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 truncate max-w-md mt-0.5">
                                {c.last_message || 'ไม่มีข้อความล่าสุด'}
                              </p>
                            </div>
                          </div>

                          {/* Right: Assigned Caretaker Dropdown Selector */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] text-slate-400">ผู้ดูแล:</span>
                            <div className="relative">
                              <select
                                value={assignedAgent.id}
                                onChange={(e) => handleOverrideAgent(c.id, e.target.value)}
                                className="pl-2.5 pr-7 py-1 text-xs bg-blue-50/90 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-700 rounded-xl font-bold text-blue-900 dark:text-blue-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-2xs"
                              >
                                {eligibleStaff
                                  .filter((u) => selectedAgentIds.includes(u.id))
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.nickname ? `${u.first_name} (${u.nickname})` : u.first_name} {u.role === 'admin' ? '👑' : ''}
                                    </option>
                                  ))}
                              </select>
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-[10px]">
                                ▾
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= STICKY FOOTER / ACTIONS ================= */}
        <div className="px-5 py-3 border-t border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>
              {hasSimulated
                ? `พร้อมอนุมัติจ่ายงานลูกค้า ${simulatedAssignments.length} เคส ให้กับผู้ดูแล ${agentBreakdown.length} คน`
                : `เลือกลูกค้าค้าง ${filteredCustomers.length} คน`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isApproving}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
            >
              ปิด
            </button>

            {hasSimulated && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving || simulatedAssignments.length === 0}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isApproving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>กำลังบันทึกจ่ายงาน ({approvedCount}/{simulatedAssignments.length})...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>อนุมัติและบันทึกจ่ายงานจริง ({simulatedAssignments.length} เคส)</span>
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
