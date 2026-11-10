import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  ShieldCheck,
  Lock,
  Globe,
  Zap,
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
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatSystemConfig,
  saveChatSystemConfig,
  fetchChatAccessUsers,
  DEFAULT_CHAT_SYSTEM_CONFIG,
} from '../../services/chatRoutingService';
import type { ChatSystemConfig, User, ChatAccessUser } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';
import ChatDistributionModal from './ChatDistributionModal';

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
}

export default function ChatSystemConfigTab({ onNavigateToAccess }: ChatSystemConfigTabProps) {
  const [config, setConfig] = useState<ChatSystemConfig>(DEFAULT_CHAT_SYSTEM_CONFIG);
  const [users, setUsers] = useState<User[]>([]);
  const [accessUsers, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [showDistributionModal, setShowDistributionModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, userList, accessList] = await Promise.all([
        fetchChatSystemConfig(),
        fetchUsers().catch(() => []),
        fetchChatAccessUsers().catch(() => []),
      ]);
      setConfig(cfg);
      setUsers(userList);
      setAccessUsers(accessList);
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
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // 🔒 Strict rule: Only staff who:
  // 1. Are Super Admins (role === 'admin')
  // 2. Or have been explicitly granted chat access in chat_access_users (is_enabled !== false)
  // Staff who have not been granted chat access are strictly excluded.
  const staffWithChatAccess = users.filter((u) => {
    if (u.role === 'admin') return true;
    return accessUsers.some(
      (a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled !== false
    );
  });

  // Handle Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const ok = await saveChatSystemConfig(config);
      if (ok) {
        showNotification('บันทึกการตั้งค่าระบบแชทเรียบร้อยแล้วครับ');
      } else {
        alert('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Equalize weights
  const handleEqualizeWeights = () => {
    const updated = { ...(config.agent_weights || {}) };
    staffWithChatAccess.forEach((u) => {
      const current = updated[u.id] || { weight: 1, max_active_chats: 0, is_paused: false };
      updated[u.id] = { ...current, weight: 1 };
    });
    setConfig((prev) => ({ ...prev, agent_weights: updated }));
    showNotification('ปรับสัดส่วนการสุ่มเป็น 1:1 เท่ากันทุกคนเรียบร้อย');
  };

  // Calculate total weights and percentages
  const totalWeight = staffWithChatAccess.reduce((sum, u) => {
    const w = config.agent_weights?.[u.id]?.weight ?? 1;
    const isPaused = config.agent_weights?.[u.id]?.is_paused ?? false;
    return isPaused ? sum : sum + w;
  }, 0);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
        <p style={{ margin: 0, fontSize: '0.85rem' }}>กำลังโหลดการตั้งค่าระบบแชท...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-5xl mx-auto pb-10">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-[9999] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <Check size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center font-bold">
              <Settings size={18} />
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-zinc-100">
              ตั้งค่าระบบแชท & นโยบายการดูแลลูกค้า
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            กำหนดสิทธิ์การพิมพ์ตอบ กฎการสุ่มจ่ายงาน และสัดส่วนการกระจายลูกค้าให้เซลล์รายบุคคล
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
        </button>
      </div>

      {/* SECTION 1: REPLY POLICY & PERMISSIONS */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800">
          <ShieldCheck size={18} className="text-blue-600" />
          <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
            1. สิทธิ์การพิมพ์ตอบข้อความ (Reply Policy)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Option A: Everyone */}
          <label
            onClick={() => setConfig((prev) => ({ ...prev, reply_policy: 'everyone' }))}
            className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
              config.reply_policy === 'everyone'
                ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 shadow-2xs'
                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 hover:bg-slate-50 text-slate-700 dark:text-zinc-300'
            }`}
          >
            <input
              type="radio"
              name="reply_policy"
              checked={config.reply_policy === 'everyone'}
              onChange={() => setConfig((prev) => ({ ...prev, reply_policy: 'everyone' }))}
              className="mt-0.5 text-blue-600 cursor-pointer"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <Globe size={15} className="text-blue-600" />
                <span className="text-xs font-black block text-slate-900 dark:text-white">
                  เปิดให้ทุกคนตอบได้ (Open Reply)
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-600 text-white">
                  แนะนำ
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                พนักงานและเซลล์ทุกคนที่มีสิทธิ์เข้าหน้ารวมแชท สามารถเข้ามาช่วยพิมพ์ตอบลูกค้าได้ทุกห้องทันที เพื่อความรวดเร็วในการบริการ
              </p>
            </div>
          </label>

          {/* Option B: Assigned Only */}
          <label
            onClick={() => setConfig((prev) => ({ ...prev, reply_policy: 'assigned_only' }))}
            className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
              config.reply_policy === 'assigned_only'
                ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 shadow-2xs'
                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 hover:bg-slate-50 text-slate-700 dark:text-zinc-300'
            }`}
          >
            <input
              type="radio"
              name="reply_policy"
              checked={config.reply_policy === 'assigned_only'}
              onChange={() => setConfig((prev) => ({ ...prev, reply_policy: 'assigned_only' }))}
              className="mt-0.5 text-indigo-600 cursor-pointer"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <Lock size={15} className="text-indigo-600" />
                <span className="text-xs font-black block text-slate-900 dark:text-white">
                  เฉพาะคนดูแลที่ได้รับมอบหมาย (Assigned Only)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                ล็อกให้เฉพาะเซลล์ที่เป็นผู้ดูแลลูกค้ารายนี้ (หรือคนในกลุ่มดูแล) และ Super Admin เท่านั้นที่ตอบได้ คนอื่นจะดูได้อย่างเดียวเพื่อป้องกันการตอบชนกัน
              </p>
            </div>
          </label>
        </div>

        {/* Sub-toggle: Auto-assign on first reply */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-850 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Zap size={16} className="text-amber-500 shrink-0" />
            <div>
              <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200 block">
                มอบหมายเป็นคนดูแลอัตโนมัติเมื่อพิมพ์ตอบครั้งแรก (Auto-assign on First Response)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">
                หากแชทยังว่างอยู่ เมื่อเซลล์คนใดพิมพ์ตอบข้อความแรก ระบบจะตั้งคนนั้นเป็นผู้ดูแลเคสทันที
              </span>
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
            <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {/* SECTION 2: AUTOMATIC ROUTING & WORKING HOURS */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800">
          <Clock size={18} className="text-blue-600" />
          <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
            2. การสุ่มผู้ดูแลลูกค้าอัตโนมัติ & เวลาทำการ (Auto Routing & Working Hours)
          </h3>
        </div>

        <div className="space-y-3">
          {/* Master Routing Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-850 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200 block">
                เปิดระบบสุ่มผู้ดูแลลูกค้าอัตโนมัติ (Auto-assign on Inbound Chat)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">
                เมื่อมีลูกค้าใหม่ทัก LINE OA, Facebook หรือ IG เข้ามา ให้ระบบกระจายให้เซลล์ในกลุ่มทันที
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
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Working Hours Restriction */}
          <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200 block">
                  กระจายงานเฉพาะเวลาทำการ (Working Hours Only)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">
                  หากลูกค้านอกเวลาทำการทักมา แชทจะรออยู่ในสถานะ "รอผู้ดูแล" เพื่อไม่รบกวนเซลล์ตอนกลางคืน
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={config.routing_working_hours_only}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, routing_working_hours_only: e.target.checked }))
                  }
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {config.routing_working_hours_only && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">เวลาทำการ:</span>
                <input
                  type="time"
                  value={config.working_hours_start || '08:30'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, working_hours_start: e.target.value }))}
                  className="px-2.5 py-1 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 font-medium"
                />
                <span className="text-xs text-slate-400">ถึง</span>
                <input
                  type="time"
                  value={config.working_hours_end || '18:00'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, working_hours_end: e.target.value }))}
                  className="px-2.5 py-1 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 font-medium"
                />
              </div>
            )}
          </div>

          {/* Default Fallback Agent */}
          <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200 block">
                ผู้ดูแลเริ่มต้น / แผนกสำรอง (Default Fallback Agent)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">
                กรณีที่ลูกค้ารายนั้นไม่ตรงกับกลุ่มแบรนด์ใด หรือไม่มีเซลล์ว่างในกลุ่ม
              </span>
            </div>

            <select
              value={config.default_fallback_agent_id || ''}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  default_fallback_agent_id: e.target.value ? e.target.value : null,
                }))
              }
              className="px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-medium text-slate-900 dark:text-zinc-100 cursor-pointer min-w-[200px]"
            >
              <option value="">-- ไม่ระบุ (ปล่อยเป็นสถานะว่าง) --</option>
              {staffWithChatAccess.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname ? `${u.first_name} (${u.nickname})` : u.first_name} - {u.department || 'ทีมงาน'}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Manual Batch Distribution Button */}
          <div className="p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/40 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-blue-50/60 dark:from-blue-950/30 dark:to-indigo-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-blue-950 dark:text-blue-100 block">
                🎲 สุ่มกระจายลูกค้าค้างให้เซลล์ (ดูผลลัพธ์ก่อนอนุมัติ)
              </span>
              <span className="text-[11px] text-blue-700/80 dark:text-blue-300/80 block mt-0.5">
                เปิดหน้าต่างจำลองการสุ่ม เลือกเซลล์ที่ต้องการ และตรวจดูว่าใครได้ลูกค้าคนไหนบ้าง ก่อนกดอนุมัติจ่ายงานจริง
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDistributionModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0"
            >
              <Dices size={14} />
              <span>เปิดหน้าต่างสุ่ม & อนุมัติ</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: AGENT RATIOS, WEIGHTS & QUOTAS */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-blue-600" />
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                3. สัดส่วนการสุ่มผู้ดูแลลูกค้ารายคน & โควต้า (Agent Ratios & Quotas)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                กำหนดค่าน้ำหนักสัดส่วน (Weight) และจำนวนลูกค้าสูงสุดที่ดูแลพร้อมกันของเซลล์แต่ละคน
              </p>
            </div>
          </div>

          {staffWithChatAccess.length > 0 && (
            <button
              type="button"
              onClick={handleEqualizeWeights}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw size={12} />
              <span>ปรับสัดส่วนเท่ากันทุกคน (1:1)</span>
            </button>
          )}
        </div>

        {/* Info Banner: Explaining Chat Access Filter and link to Permissions */}
        <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 flex items-center justify-center shrink-0 font-bold">
              <ShieldCheck size={16} />
            </div>
            <div>
              <span className="text-xs font-black text-blue-950 dark:text-blue-100 block">
                แสดงเฉพาะทีมงานที่มีสิทธิ์ดูแลและเข้าใช้งานแชท ({staffWithChatAccess.length} คน)
              </span>
              <span className="text-[11px] text-blue-700/80 dark:text-blue-300/80 block mt-0.5">
                ระบบคัดเฉพาะแอดมินและเซลล์ที่ได้รับสิทธิ์จากหน้า "สิทธิ์เข้าใช้งาน" เท่านั้น พนักงานอื่นที่ไม่มีสิทธิ์จะไม่ถูกนำมาสุ่ม
              </span>
            </div>
          </div>

          {onNavigateToAccess && (
            <button
              type="button"
              onClick={onNavigateToAccess}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer shrink-0 transition-all"
            >
              <UserPlus size={13} />
              <span>+ ไปหน้าสิทธิ์เข้าใช้งาน</span>
            </button>
          )}
        </div>

        {/* Staff Table / Cards */}
        <div className="space-y-2">
          {staffWithChatAccess.length === 0 ? (
            <div className="py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 text-center space-y-3 bg-slate-50/50 dark:bg-zinc-850/30">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 mx-auto flex items-center justify-center">
                <Users size={22} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200">
                  ยังไม่มีพนักงานทั่วไปที่ได้รับสิทธิ์เข้าใช้งานแชท
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  ขณะนี้ในระบบมีเฉพาะ Super Admin ซึ่งดูแลได้ทุกแชทอยู่แล้ว หากต้องการกระจายงานให้เซลล์หรือทีมงานท่านอื่น กรุณาไปเปิดสิทธิ์ที่แท็บ <b>"สิทธิ์เข้าใช้งาน"</b> ก่อนครับ
                </p>
              </div>
              {onNavigateToAccess && (
                <button
                  type="button"
                  onClick={onNavigateToAccess}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all mx-auto"
                >
                  <UserPlus size={14} />
                  <span>ไปที่หน้า "สิทธิ์เข้าใช้งาน" เพื่อเพิ่มพนักงาน</span>
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

              // Percentage calculation
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

              return (
                <div
                  key={u.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isPaused
                      ? 'bg-slate-50/70 dark:bg-zinc-850/50 border-slate-200/60 opacity-60'
                      : 'bg-white dark:bg-zinc-850 border-slate-200 dark:border-zinc-800 shadow-2xs'
                  }`}
                >
                  {/* Left: User Info */}
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <StaffAvatar url={u.avatar_url} name={u.nickname || u.first_name} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate">
                          {u.first_name} {u.last_name}
                        </span>
                        {u.nickname && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            ({u.nickname})
                          </span>
                        )}
                        {u.role === 'admin' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800">
                            👑 Admin
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 block truncate">
                        {u.department || u.position || 'ทีมงาน'}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Weight & Percentage Slider */}
                  <div className="flex-1 max-w-xs flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 shrink-0">
                      สัดส่วน:
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      disabled={isPaused}
                      value={currentWeight}
                      onChange={(e) => updateAgentConfig({ weight: Number(e.target.value) })}
                      className="w-full accent-blue-600 cursor-pointer disabled:opacity-30"
                    />
                    <div className="text-right shrink-0 min-w-[50px]">
                      <span className="text-xs font-black text-blue-600 block">
                        {currentWeight}x
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 block">
                        ({percent}%)
                      </span>
                    </div>
                  </div>

                  {/* Right: Max Capacity & Pause Toggle */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                        รับสูงสุด:
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        disabled={isPaused}
                        value={maxActive === 0 ? '' : maxActive}
                        placeholder="ไม่จำกัด"
                        onChange={(e) =>
                          updateAgentConfig({
                            max_active_chats: e.target.value ? Number(e.target.value) : 0,
                          })
                        }
                        className="w-16 px-2 py-1 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-center font-bold"
                      />
                      <span className="text-[10px] text-slate-400">แชท</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => updateAgentConfig({ is_paused: !isPaused })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                        isPaused
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/50'
                      }`}
                      title={isPaused ? 'คลิกเพื่อเปิดรับลูกค้า' : 'คลิกเพื่อพักรับลูกค้า'}
                    >
                      {isPaused ? <Play size={12} /> : <Pause size={12} />}
                      <span>{isPaused ? 'พักรับงาน' : 'พร้อมรับงาน'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div className="sticky bottom-4 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4">
        <span className="text-xs text-slate-500 dark:text-zinc-400">
          💡 การตั้งค่าทั้งหมดจะถูกนำไปใช้กับระบบแชทและการกระจายงานทันทีที่บันทึก
        </span>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{saving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกการตั้งค่าทั้งหมด'}</span>
        </button>
      </div>
    {showDistributionModal && (
        <ChatDistributionModal
          isOpen={showDistributionModal}
          onClose={() => setShowDistributionModal(false)}
          onSuccess={() => {
            void loadData();
          }}
        />
      )}
    </form>
  );
}
