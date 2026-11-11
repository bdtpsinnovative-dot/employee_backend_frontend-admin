import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  RefreshCw,
  X,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatCareGroups,
  saveChatCareGroups,
  upsertExclusiveCareGroup,
  fetchChatAccessUsers,
  fetchChatSystemConfig,
  saveChatSystemConfig,
  getChannelBrandOptions,
  getConversationAgentIds,
  detectAutoCareGroups,
  buildAutoGroupDefaultName,
  getSortedChatStaff,
  assignConversation,
} from '../../services/chatRoutingService';
import type {
  ChatCareGroup,
  ChatSystemConfig,
  User,
  ChatConversation,
  ChatAccessUser,
  ChatChannel,
} from '../../types';
import { avatarUrl } from '../tasks/taskUtils';
import { LineIcon, FacebookIcon, InstagramIcon } from '../../pages/ChatSettings';
import BrandLockSelector from './BrandLockSelector';

const BRAND_PRESETS: Record<string, { label: string; shortLabel: string; bg: string }> = {
  terrahome: { label: 'Terra Home Studio', shortLabel: 'TERRA', bg: '#B45309' },
  zenslab: { label: 'Zenslab by Woodden', shortLabel: 'ZENSLAB', bg: '#065F46' },
  emberandash: { label: 'Ember and Ash', shortLabel: 'EMBER', bg: '#9A3412' },
  wallcraft: { label: 'Wallcraft Thailand', shortLabel: 'WALLCRAFT', bg: '#1E3A8A' },
};

function getBrandDisplay(brandSlug?: string, channelsList?: ChatChannel[]) {
  const raw = (brandSlug || 'terrahome').toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9]/g, '');
  const matchedChannel = channelsList?.find((c) => c.brand_slug.toLowerCase().replace(/[^a-z0-9]/g, '') === slug);
  const preset =
    BRAND_PRESETS[slug] ||
    Object.entries(BRAND_PRESETS).find(([k]) => slug.includes(k) || k.includes(slug))?.[1];

  return {
    label: matchedChannel?.brand_name || preset?.label || brandSlug?.toUpperCase() || 'ทั่วไป',
    shortLabel: preset?.shortLabel || matchedChannel?.brand_name?.slice(0, 10) || brandSlug?.toUpperCase() || 'ทั่วไป',
    bg: preset?.bg || '#374151',
    logo: matchedChannel?.brand_logo || null,
  };
}

function StaffAvatarImg({ url, name, size = 28 }: { url?: string | null; name: string; size?: number }) {
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
        fontSize: size <= 22 ? '0.65rem' : '0.78rem',
        flexShrink: 0,
      }}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

function CustomerAvatarWithBadge({
  conv,
  size = 34,
}: {
  conv: ChatConversation;
  size?: number;
}) {
  const isLine = conv.platform === 'line';
  const isIg = conv.platform === 'instagram';
  const avatarBg = isLine ? '#D1FAE5' : isIg ? '#FCE7F3' : '#DBEAFE';
  const avatarColor = isLine ? '#065F46' : isIg ? '#9D174D' : '#1E40AF';

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: avatarBg,
          color: avatarColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: size <= 24 ? '0.65rem' : size <= 30 ? '0.75rem' : '0.85rem',
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        {conv.customer_avatar ? (
          <img
            src={avatarUrl(conv.customer_avatar) || conv.customer_avatar}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          conv.customer_name.charAt(0).toUpperCase() || 'C'
        )}
      </div>

      <span
        style={{
          position: 'absolute',
          bottom: '-2px',
          right: '-2px',
          width: size <= 24 ? '12px' : '15px',
          height: size <= 24 ? '12px' : '15px',
          borderRadius: '50%',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1.5px solid #ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          zIndex: 2,
        }}
      >
        {isLine ? (
          <LineIcon size={size <= 24 ? 8 : 10} />
        ) : isIg ? (
          <InstagramIcon size={size <= 24 ? 8 : 10} />
        ) : (
          <FacebookIcon size={size <= 24 ? 8 : 10} />
        )}
      </span>
    </div>
  );
}

interface DisplayChatGroup {
  id: string;
  name: string; // Empty string if unnamed Auto-Group
  isAuto: boolean;
  isIncludedInRouting: boolean;
  customerIds: string[];
  agentIds: string[];
  allowedBrands?: string[];
}

interface ChatRoutingTabProps {
  onNavigateToAccess?: () => void;
}

export default function ChatRoutingTab(_props: ChatRoutingTabProps) {
  const [careGroups, setCareGroups] = useState<ChatCareGroup[]>([]);
  const [systemConfig, setSystemConfig] = useState<ChatSystemConfig | null>(null);
  const [togglingAutoId, setTogglingAutoId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accessUsers, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingIsAuto, setEditingIsAuto] = useState(false);
  const [prevCustomerIds, setPrevCustomerIds] = useState<string[]>([]);

  const [formName, setFormName] = useState('');
  const [formCustomerIds, setFormCustomerIds] = useState<string[]>([]);
  const [formAgentIds, setFormAgentIds] = useState<string[]>([]);
  const [formAllowedBrands, setFormAllowedBrands] = useState<string[]>([]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Modal Search Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'all' | 'selected'>('all');
  const [agentSearch, setAgentSearch] = useState('');

  // List Filter & Inline Rename State
  const [listSearch, setListSearch] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'named' | 'auto'>('all');
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [popoverGroupId, setPopoverGroupId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [savedCareGroups, sysCfg, userList, accessList, convsRes, chRes] = await Promise.all([
        fetchChatCareGroups(),
        fetchChatSystemConfig(),
        fetchUsers().catch(() => []),
        fetchChatAccessUsers().catch(() => []),
        supabase
          .from('chat_conversations')
          .select('*')
          .order('last_message_at', { ascending: false })
          .limit(300),
        supabase
          .from('chat_channels')
          .select('*')
          .order('created_at', { ascending: true }),
      ]);

      setCareGroups(savedCareGroups);
      setSystemConfig(sysCfg);
      setUsers(userList);
      setAccessUsers(accessList);
      setConversations((convsRes.data || []) as ChatConversation[]);
      setChannels((chRes.data || []) as ChatChannel[]);
    } catch (err: any) {
      console.error('Failed to load chat groups data:', err);
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

  // Permitted staff (sales first, Super Admins at the bottom)
  const chatStaffUsers = useMemo(() => getSortedChatStaff(users, accessUsers), [users, accessUsers]);

  // Combine saved care groups + ad-hoc groups + automatically detected multi-caretaker teams
  const displayGroups = useMemo<DisplayChatGroup[]>(() => {
    const result: DisplayChatGroup[] = [];
    const { unsavedAutoGroups, extraCustomersBySavedAutoGroupId, adhocGroups } = detectAutoCareGroups(
      conversations,
      careGroups,
      users
    );

    // 1. Saved care groups (named groups or promoted is_auto groups)
    careGroups.forEach((grp) => {
      const linkedConvs = conversations.filter((c) => {
        const liveGid = c.metadata?.assigned_group_id;
        if (liveGid) return liveGid === grp.id;
        return grp.customer_ids.includes(c.id);
      });
      const extraIds = extraCustomersBySavedAutoGroupId[grp.id] || [];
      const customerIds = Array.from(new Set([...linkedConvs.map((c) => c.id), ...extraIds]));
      const isAuto = Boolean(grp.is_auto);
      const isIncluded = !(systemConfig?.group_weights?.[grp.id]?.is_paused ?? false);

      result.push({
        id: grp.id,
        name: isAuto ? '' : grp.name,
        isAuto,
        isIncludedInRouting: isIncluded,
        customerIds,
        agentIds: grp.agent_ids || [],
        allowedBrands: grp.allowed_brands || [],
      });
    });

    // 2. Conversations with explicit assigned_group_id/name not yet in chat_care_groups
    adhocGroups.forEach((val) => {
      result.push({
        id: val.id,
        name: val.name,
        isAuto: false,
        isIncludedInRouting: false,
        customerIds: val.customerIds,
        agentIds: val.agentIds,
      });
    });

    // 3. Unsaved Auto-Groups (default: dimmed & NOT counted in random routing until ticked)
    unsavedAutoGroups.forEach((val) => {
      result.push({
        id: val.id,
        name: '',
        isAuto: true,
        isIncludedInRouting: false,
        customerIds: val.customerIds,
        agentIds: val.agentIds,
      });
    });

    return result;
  }, [careGroups, conversations, users, systemConfig]);

  const namedCount = displayGroups.filter((g) => !g.isAuto && g.name).length;
  const autoCount = displayGroups.filter((g) => g.isAuto || !g.name).length;

  // Open Create Modal
  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingGroupId(null);
    setEditingIsAuto(false);
    setPrevCustomerIds([]);
    setFormName('');
    setFormCustomerIds([]);
    setFormAgentIds([]);
    setFormAllowedBrands([]);
    setFormError('');
    setCustomerSearch('');
    setCustomerFilter('all');
    setAgentSearch('');
    setShowModal(true);
  };

  // Open Edit / Name Modal
  const handleOpenEdit = (grp: DisplayChatGroup) => {
    setModalMode('edit');
    setEditingGroupId(grp.id);
    setEditingIsAuto(grp.isAuto);
    setPrevCustomerIds(grp.customerIds);
    setFormName(grp.name);
    setFormCustomerIds(grp.customerIds);
    setFormAgentIds(grp.agentIds);
    setFormAllowedBrands(grp.allowedBrands || []);
    setFormError('');
    setCustomerSearch('');
    setCustomerFilter('all');
    setAgentSearch('');
    setShowModal(true);
  };

  const toggleCustomer = (convId: string) => {
    setFormCustomerIds((prev) =>
      prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId]
    );
  };

  const toggleAgent = (userId: string) => {
    setFormAgentIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Toggle whether an Auto-Group participates in automatic group routing
  const handleToggleAutoGroupRouting = async (grp: DisplayChatGroup) => {
    try {
      setTogglingAutoId(grp.id);
      const nextIncluded = !grp.isIncludedInRouting;
      const latestSysCfg = await fetchChatSystemConfig();
      const prevEntry = latestSysCfg.group_weights?.[grp.id] || {
        weight: 1,
        max_active_chats: 0,
        is_paused: false,
        allowed_brands: grp.allowedBrands || [],
      };
      const nextSysCfg: ChatSystemConfig = {
        ...latestSysCfg,
        group_weights: {
          ...(latestSysCfg.group_weights || {}),
          [grp.id]: {
            ...prevEntry,
            is_paused: !nextIncluded,
            allowed_brands: grp.allowedBrands || prevEntry.allowed_brands || [],
          },
        },
      };

      const existsInCare = careGroups.some((g) => g.id === grp.id);
      let nextCareGroups = careGroups;
      if (nextIncluded || existsInCare) {
        nextCareGroups = upsertExclusiveCareGroup(careGroups, {
          id: grp.id,
          name: buildAutoGroupDefaultName(grp.agentIds, users),
          customerIds: grp.customerIds,
          agentIds: grp.agentIds,
          allowedBrands: grp.allowedBrands || prevEntry.allowed_brands || [],
          isAuto: true,
        });
        await Promise.all([saveChatCareGroups(nextCareGroups), saveChatSystemConfig(nextSysCfg)]);
      } else {
        await saveChatSystemConfig(nextSysCfg);
      }

      setCareGroups(nextCareGroups);
      setSystemConfig(nextSysCfg);
      showNotification(
        nextIncluded
          ? 'เปิดนับกลุ่มออโต้เข้าสู่ระบบสุ่มเรียบร้อยแล้ว'
          : 'ปรับกลุ่มออโต้เป็น "ไม่นับเข้าสุ่ม" เรียบร้อยแล้ว'
      );
    } catch (err: any) {
      alert('ไม่สามารถสลับสถานะกลุ่มออโต้ได้: ' + (err.message || 'Unknown error'));
    } finally {
      setTogglingAutoId(null);
    }
  };

  // Shared persistence helper for both Modal Save and Inline Rename
  const persistGroup = async (opts: {
    mode: 'create' | 'edit';
    existingGroupId: string | null;
    isAuto: boolean;
    name: string;
    customerIds: string[];
    prevIds: string[];
    agentIds: string[];
    allowedBrands?: string[];
  }) => {
    const trimmedName = opts.name.trim();
    const isBecomingNamed = trimmedName.length > 0;
    const existsInCare = opts.existingGroupId ? careGroups.some((g) => g.id === opts.existingGroupId) : false;
    const newId = () => 'cgrp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const targetGroupId =
      opts.mode === 'create'
        ? newId()
        : opts.isAuto && isBecomingNamed && !existsInCare
        ? newId()
        : opts.existingGroupId!;

    const agentNames = opts.agentIds
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is User => !!u)
      .map((u) => u.first_name);

    await Promise.all(
      opts.customerIds.map(async (convId) => {
        const primaryUser = users.find((u) => u.id === opts.agentIds[0]);
        await assignConversation(convId, {
          id: opts.agentIds[0] || null,
          name: isBecomingNamed ? trimmedName : agentNames.join(', '),
          avatar: primaryUser?.avatar_url,
          groupId: isBecomingNamed ? targetGroupId : null,
          groupName: isBecomingNamed ? trimmedName : null,
          assignedAgentIds: opts.agentIds,
        });
      })
    );

    const removedCustomerIds = opts.prevIds.filter((id) => !opts.customerIds.includes(id));
    await Promise.all(
      removedCustomerIds.map(async (convId) => {
        const conv = conversations.find((c) => c.id === convId);
        const remainingIds = getConversationAgentIds(conv);
        const primaryUser = users.find((u) => u.id === remainingIds[0]);
        await assignConversation(convId, {
          id: remainingIds[0] || null,
          name: primaryUser ? primaryUser.first_name : null,
          groupId: null,
          groupName: null,
          assignedAgentIds: remainingIds,
        });
      })
    );

    if (isBecomingNamed || existsInCare) {
      const resolvedName = isBecomingNamed ? trimmedName : buildAutoGroupDefaultName(opts.agentIds, users);
      const updatedCareGroups = upsertExclusiveCareGroup(careGroups, {
        id: targetGroupId,
        name: resolvedName,
        customerIds: opts.customerIds,
        agentIds: opts.agentIds,
        allowedBrands: opts.allowedBrands,
        isAuto: isBecomingNamed ? false : true,
      });
      await saveChatCareGroups(updatedCareGroups);

      // Sync group's brand lock into chat_system_config.group_weights
      if (opts.allowedBrands !== undefined) {
        const sysCfg = await fetchChatSystemConfig();
        const prevEntry = sysCfg.group_weights?.[targetGroupId] || {
          weight: 1,
          max_active_chats: 0,
          is_paused: false,
        };
        await saveChatSystemConfig({
          ...sysCfg,
          group_weights: {
            ...(sysCfg.group_weights || {}),
            [targetGroupId]: {
              ...prevEntry,
              allowed_brands: opts.allowedBrands,
            },
          },
        });
      }
    } else {
      // Ensure customers saved into an unnamed Auto-Group do not linger in an old named group's customer_ids
      const movedSet = new Set(opts.customerIds);
      const nowIso = new Date().toISOString();
      let changed = false;
      const cleaned = careGroups.map((g) => {
        const filtered = (g.customer_ids || []).filter((cid) => !movedSet.has(cid));
        if (filtered.length !== (g.customer_ids || []).length) {
          changed = true;
          return { ...g, customer_ids: filtered, updated_at: nowIso };
        }
        return g;
      });
      if (changed) {
        await saveChatCareGroups(cleaned);
      }
    }

    await loadData();
    showNotification(
      isBecomingNamed
        ? `บันทึกกลุ่ม "${trimmedName}" เรียบร้อยแล้ว`
        : 'อัปเดตกลุ่มดูแลลูกค้าเรียบร้อยแล้ว'
    );
  };

  // Save Group from Modal
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();

    if (!editingIsAuto && !trimmedName) {
      setFormError('กรุณาตั้งชื่อกลุ่มแชทด้วยครับ');
      return;
    }
    if (!trimmedName && formCustomerIds.length === 0) {
      setFormError('กรุณาตั้งชื่อกลุ่มหรือเลือกลูกค้าเข้ากลุ่มอย่างน้อย 1 คนครับ');
      return;
    }
    if (formAgentIds.length === 0) {
      setFormError('กรุณาเลือกเซลล์ผู้ดูแลอย่างน้อย 1 คนครับ');
      return;
    }

    try {
      setFormSaving(true);
      setFormError('');
      await persistGroup({
        mode: modalMode,
        existingGroupId: editingGroupId,
        isAuto: editingIsAuto,
        name: trimmedName,
        customerIds: formCustomerIds,
        prevIds: prevCustomerIds,
        agentIds: formAgentIds,
        allowedBrands: formAllowedBrands,
      });
      setShowModal(false);
    } catch (err: any) {
      setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึกกลุ่ม');
    } finally {
      setFormSaving(false);
    }
  };

  // Quick Inline Rename from List Row
  const handleInlineSave = async (grp: DisplayChatGroup) => {
    const trimmed = inlineName.trim();
    if (!trimmed) {
      setInlineEditId(null);
      return;
    }
    try {
      setInlineSaving(true);
      await persistGroup({
        mode: 'edit',
        existingGroupId: grp.id,
        isAuto: grp.isAuto,
        name: trimmed,
        customerIds: grp.customerIds,
        prevIds: grp.customerIds,
        agentIds: grp.agentIds,
      });
      setInlineEditId(null);
    } catch (err: any) {
      alert('ไม่สามารถตั้งชื่อกลุ่มได้: ' + (err.message || 'Unknown error'));
    } finally {
      setInlineSaving(false);
    }
  };

  // Disband / Delete Group
  const handleDeleteGroup = async (grp: DisplayChatGroup) => {
    const label = grp.name || 'กลุ่มอัตโนมัติ (ยังไม่มีชื่อ)';
    if (!window.confirm(`ต้องการยุบ "${label}" และถอดการจัดกลุ่มออกจากลูกค้าในกลุ่มนี้ใช่หรือไม่?`)) return;

    try {
      await Promise.all(
        grp.customerIds.map(async (convId) => {
          await assignConversation(convId, {
            id: null,
            name: null,
            groupId: null,
            groupName: null,
            assignedAgentIds: [],
          });
        })
      );

      const existsInCare = careGroups.some((g) => g.id === grp.id);
      if (existsInCare) {
        const nextGroups = careGroups.filter((g) => g.id !== grp.id);
        await saveChatCareGroups(nextGroups);
      }
      if (systemConfig?.group_weights?.[grp.id]) {
        const nextGroupWeights = { ...(systemConfig.group_weights || {}) };
        delete nextGroupWeights[grp.id];
        await saveChatSystemConfig({ ...systemConfig, group_weights: nextGroupWeights });
      }

      await loadData();
      showNotification(`ยุบกลุ่ม "${label}" เรียบร้อยแล้ว`);
    } catch (err: any) {
      alert('ไม่สามารถลบกลุ่มได้: ' + (err.message || 'Unknown error'));
    }
  };

  // Filtered customers for modal picker
  const filteredCustomers = useMemo(() => {
    let list = conversations;
    if (customerFilter === 'selected') {
      list = list.filter((c) => formCustomerIds.includes(c.id));
    }
    const q = customerSearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter((c) => {
      const cName = (c.customer_name || '').toLowerCase();
      const bName = (c.brand || '').toLowerCase();
      const gName = (c.metadata?.assigned_group_name || '').toLowerCase();
      return cName.includes(q) || bName.includes(q) || gName.includes(q);
    });
  }, [conversations, customerFilter, formCustomerIds, customerSearch]);

  // Filtered sales staff for modal picker
  const filteredStaff = useMemo(() => {
    const q = agentSearch.toLowerCase().trim();
    if (!q) return chatStaffUsers;
    return chatStaffUsers.filter((u) => {
      const name = `${u.first_name} ${u.last_name} ${u.nickname || ''}`.toLowerCase();
      const dept = (u.department || u.position || '').toLowerCase();
      return name.includes(q) || dept.includes(q);
    });
  }, [chatStaffUsers, agentSearch]);

  // Filtered groups for compact list display
  const filteredDisplayGroups = useMemo(() => {
    let list = displayGroups;
    if (listFilter === 'named') {
      list = list.filter((g) => !g.isAuto && Boolean(g.name?.trim()));
    } else if (listFilter === 'auto') {
      list = list.filter((g) => g.isAuto || !g.name?.trim());
    }
    const q = listSearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter((grp) => {
      if (grp.name.toLowerCase().includes(q)) return true;
      const hasCust = conversations.some(
        (c) =>
          grp.customerIds.includes(c.id) &&
          ((c.customer_name || '').toLowerCase().includes(q) || (c.brand || '').toLowerCase().includes(q))
      );
      if (hasCust) return true;
      const hasAgent = users.some(
        (u) =>
          grp.agentIds.includes(u.id) &&
          `${u.first_name || ''} ${u.last_name || ''} ${u.nickname || ''}`.toLowerCase().includes(q)
      );
      return hasAgent;
    });
  }, [displayGroups, listFilter, listSearch, conversations, users]);

  return (
    <div className="space-y-3">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-[9999] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <Check size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Compact Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100">
            กลุ่มแชท
          </h2>

          {/* Segmented Filter */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setListFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                listFilter === 'all'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
              }`}
            >
              ทั้งหมด ({displayGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setListFilter('named')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                listFilter === 'named'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
              }`}
            >
              ตั้งชื่อแล้ว ({namedCount})
            </button>
            <button
              type="button"
              onClick={() => setListFilter('auto')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                listFilter === 'auto'
                  ? 'bg-white dark:bg-zinc-900 text-amber-700 dark:text-amber-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>กลุ่มออโต้ ({autoCount})</span>
            </button>
          </div>

          <span className="hidden xl:inline text-[11px] text-slate-400">
            • รวมกลุ่มตามทีมผู้ดูแล (&gt; 1 คน) และดึงลูกค้าที่ดูแลร่วมกันเข้ามาอยู่ในบล็อกเดียว
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-52">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="ค้นหากลุ่ม, ลูกค้า, เซลล์..."
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs outline-none focus:border-blue-500"
            />
            {listSearch && (
              <button
                type="button"
                onClick={() => setListSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus size={14} />
            <span>สร้างกลุ่ม</span>
          </button>
        </div>
      </div>

      {/* Block Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl">
          <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-xs font-medium">กำลังโหลดข้อมูลกลุ่มแชท...</p>
        </div>
      ) : displayGroups.length === 0 ? (
        <div className="py-12 px-4 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
            <Users size={20} />
          </div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
            ยังไม่มีกลุ่มแชท
          </h4>
          <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
            กด "สร้างกลุ่ม" เพื่อจับคู่ลูกค้ากับเซลล์ หรือเพิ่มผู้ดูแลคนที่ 2 ให้ลูกค้าในหน้ารวมแชท ระบบจะขึ้นกลุ่มออโต้ให้อัตโนมัติ
          </p>
        </div>
      ) : filteredDisplayGroups.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl">
          ไม่พบกลุ่มที่ตรงกับตัวกรองหรือคำค้นหา
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredDisplayGroups.map((grp) => {
            const groupCustomers = conversations.filter((c) => grp.customerIds.includes(c.id));
            const groupAgents = users.filter((u) => grp.agentIds.includes(u.id));
            const hasName = Boolean(grp.name && grp.name.trim());
            const isInlineEditing = inlineEditId === grp.id;
            const needsCollapse = groupCustomers.length > 3;
            const visibleCustomers = needsCollapse ? groupCustomers.slice(0, 2) : groupCustomers;
            const isPopoverOpen = popoverGroupId === grp.id;

            const renderCustomerRow = (c: ChatConversation) => {
              const bInfo = getBrandDisplay(c.brand, channels);
              return (
                <div key={c.id} className="flex items-center gap-2 min-w-0 py-0.5">
                  <CustomerAvatarWithBadge conv={c} size={20} />
                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <span className="text-[11.5px] font-semibold text-slate-800 dark:text-zinc-100 truncate">
                      {c.customer_name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        color: bInfo.bg,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        flexShrink: 0,
                      }}
                    >
                      {bInfo.logo ? (
                        <img
                          src={bInfo.logo}
                          alt=""
                          style={{ width: '9px', height: '9px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span
                          style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: bInfo.bg,
                            display: 'inline-block',
                          }}
                        />
                      )}
                      <span>{bInfo.shortLabel}</span>
                    </span>
                  </div>
                </div>
              );
            };

            const isDimmedAuto = grp.isAuto && !grp.isIncludedInRouting;
            return (
              <div key={grp.id} className="relative h-full">
                <div
                  className={`group h-full min-h-[154px] rounded-xl shadow-2xs hover:shadow-md transition-all flex flex-col overflow-hidden ${
                    isDimmedAuto
                      ? 'bg-slate-50/75 dark:bg-zinc-900/60 border border-dashed border-slate-300/90 dark:border-zinc-700 opacity-75 hover:opacity-100 hover:border-blue-300/80'
                      : 'bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 hover:border-blue-300/80 dark:hover:border-blue-700/70'
                  }`}
                >
                  {/* ================= BLOCK HEAD: Group Name + Team Caretakers ================= */}
                  <div className="px-3 py-2 bg-slate-50/85 dark:bg-zinc-800/50 border-b border-slate-100 dark:border-zinc-800 space-y-1.5">
                    {/* Top Bar: Group Name / Inline Rename + Manage & Delete */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isInlineEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              autoFocus
                              value={inlineName}
                              onChange={(e) => setInlineName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleInlineSave(grp);
                                } else if (e.key === 'Escape') {
                                  setInlineEditId(null);
                                }
                              }}
                              placeholder="พิมพ์ชื่อกลุ่ม..."
                              className="min-w-0 flex-1 px-2 py-0.5 text-xs rounded-lg border border-blue-500 bg-white dark:bg-zinc-800 outline-none"
                            />
                            <button
                              type="button"
                              disabled={inlineSaving}
                              onClick={() => void handleInlineSave(grp)}
                              className="p-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shrink-0"
                              title="บันทึกชื่อกลุ่ม"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineEditId(null)}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer shrink-0"
                              title="ยกเลิก"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : hasName ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[12.5px] font-black text-slate-900 dark:text-zinc-100 truncate">
                              {grp.name}
                            </h3>
                            {grp.allowedBrands && grp.allowedBrands.length > 0 && (
                              <span
                                className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold"
                                title={`ล็อคแบรนด์: ${grp.allowedBrands.map((b) => getBrandDisplay(b, channels).shortLabel).join(', ')}`}
                              >
                                {grp.allowedBrands.slice(0, 2).map((bSlug) => {
                                  const bInfo = getBrandDisplay(bSlug, channels);
                                  return (
                                    <span key={bSlug} style={{ color: bInfo.bg }} className="inline-flex items-center gap-0.5">
                                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: bInfo.bg, display: 'inline-block' }} />
                                      <span>{bInfo.shortLabel}</span>
                                    </span>
                                  );
                                })}
                                {grp.allowedBrands.length > 2 && (
                                  <span className="text-slate-400">+{grp.allowedBrands.length - 2}</span>
                                )}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setInlineEditId(grp.id);
                                setInlineName(grp.name);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-blue-600 cursor-pointer transition-opacity shrink-0"
                              title="เปลี่ยนชื่อกลุ่ม"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-nowrap min-w-0 overflow-hidden">
                            <button
                              type="button"
                              disabled={togglingAutoId === grp.id}
                              onClick={() => void handleToggleAutoGroupRouting(grp)}
                              title={
                                grp.isIncludedInRouting
                                  ? 'นับเข้ากลุ่มสุ่มแล้ว — คลิกเพื่อเอาติ๊กออก (ไม่นับเข้าสุ่ม)'
                                  : 'กลุ่มออโต้ยังไม่นับเข้าสุ่ม — คลิกเพื่อติ๊กเปิดนับเข้าสุ่ม'
                              }
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-50 ${
                                grp.isIncludedInRouting
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-amber-50/80 text-slate-600 border-dashed border-amber-300/90 hover:border-blue-400 hover:text-blue-700 dark:bg-amber-950/40 dark:text-zinc-300 dark:border-amber-800/70'
                              }`}
                            >
                              <span
                                className={`w-3 h-3 rounded-[3px] flex items-center justify-center border shrink-0 ${
                                  grp.isIncludedInRouting
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white border-slate-300 dark:bg-zinc-800 dark:border-zinc-600'
                                }`}
                              >
                                {grp.isIncludedInRouting && <Check size={9} strokeWidth={3.5} />}
                              </span>
                              <span>
                                {grp.isIncludedInRouting ? 'กลุ่มออโต้ · นับสุ่ม' : 'กลุ่มออโต้ · ไม่นับ'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInlineEditId(grp.id);
                                setInlineName('');
                              }}
                              className="text-[10.5px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer shrink-0 whitespace-nowrap"
                              title="คลิกเพื่อตั้งชื่อกลุ่มทันที"
                            >
                              + ตั้งชื่อ
                            </button>
                          </div>
                        )}
                      </div>

                      {!isInlineEditing && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(grp)}
                            className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white hover:bg-slate-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-200 text-[10.5px] font-semibold cursor-pointer transition-colors"
                            title="จัดการทีมผู้ดูแลและลูกค้าในกลุ่ม"
                          >
                            จัดการ
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteGroup(grp)}
                            className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                            title="ยุบกลุ่ม"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Caretaker Team Anchored as Compact Head */}
                    <div
                      className="flex items-center justify-between gap-2"
                      title={`ทีมดูแล (${groupAgents.length} คน): ${groupAgents.map((a) => a.first_name).join(', ')}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex -space-x-1.5 shrink-0">
                          {groupAgents.slice(0, 4).map((ag) => (
                            <div
                              key={ag.id}
                              className="rounded-full ring-2 ring-white dark:ring-zinc-900"
                            >
                              <StaffAvatarImg url={ag.avatar_url} name={ag.first_name} size={20} />
                            </div>
                          ))}
                          {groupAgents.length > 4 && (
                            <div className="w-[20px] h-[20px] rounded-full ring-2 ring-white dark:ring-zinc-900 bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center">
                              +{groupAgents.length - 4}
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-200 truncate">
                          {groupAgents.map((a) => a.first_name).join(', ')}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                        {groupAgents.length} เซลล์ · {groupCustomers.length} ลค.
                      </span>
                    </div>
                  </div>

                  {/* ================= BLOCK BODY: Uniform Height Customers List ================= */}
                  <div className="px-3 py-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      {visibleCustomers.length > 0 ? (
                        visibleCustomers.map(renderCustomerRow)
                      ) : (
                        <div className="py-3 text-[11px] text-slate-400 italic">
                          ยังไม่มีลูกค้าในกลุ่ม (พร้อมรับงานตามแบรนด์ที่ตั้งไว้)
                        </div>
                      )}
                    </div>

                    {needsCollapse && (
                      <button
                        type="button"
                        onClick={() => setPopoverGroupId(isPopoverOpen ? null : grp.id)}
                        className="mt-1.5 w-full py-1 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-[10.5px] font-bold text-blue-600 cursor-pointer transition-colors text-center"
                      >
                        {isPopoverOpen
                          ? 'ซ่อนรายชื่อ ▲'
                          : `ดูลูกค้าเพิ่มอีก ${groupCustomers.length - 2} คน (ทั้งหมด ${groupCustomers.length}) ▾`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Floating Popover Drawer for Overflow Customers (keeps all cards uniform height) */}
                {isPopoverOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setPopoverGroupId(null)}
                    />
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-zinc-700 rounded-xl shadow-xl p-2.5">
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-zinc-800">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-200 truncate">
                          ลูกค้าทั้งหมด ({groupCustomers.length} คน)
                        </span>
                        <button
                          type="button"
                          onClick={() => setPopoverGroupId(null)}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                        {groupCustomers.map(renderCustomerRow)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT CHAT GROUP (CLEAN, ZERO CLIPPING) ================= */}
      {showModal && (
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
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !formSaving) setShowModal(false);
          }}
        >
          <form
            onSubmit={handleSaveGroup}
            className="w-full max-w-6xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[88vh] max-h-[820px] overflow-hidden animate-fadeIn"
          >
            {/* Fixed Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-zinc-850/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-zinc-100">
                    {modalMode === 'create'
                      ? 'สร้างกลุ่มแชทใหม่'
                      : editingIsAuto
                      ? 'ตั้งชื่อและจัดการสมาชิกกลุ่มออโต้'
                      : 'แก้ไขกลุ่มแชท'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    ตั้งชื่อกลุ่ม เลือกลูกค้า และเลือกเซลล์ที่จะร่วมกันดูแล (ชื่อกลุ่มจะไปแสดงในหน้ารวมแชททันที)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={formSaving}
                className="w-8 h-8 rounded-xl hover:bg-slate-200/60 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Group Name Input Strip (Fixed Top inside form — Never clipped!) */}
            <div className="px-6 py-3.5 border-b border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 space-y-2">
              {formError && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="text-xs font-black text-slate-800 dark:text-zinc-200 shrink-0">
                  ชื่อกลุ่มแชท {!editingIsAuto && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="เช่น ทีมดูแล VIP, ลูกค้าโครงการบ้าน A, ทีมขายบิวท์อิน..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-semibold text-slate-900 dark:text-zinc-100"
                />
              </div>

              <div className="pt-1">
                <BrandLockSelector
                  brands={getChannelBrandOptions(channels)}
                  selected={formAllowedBrands}
                  onChange={setFormAllowedBrands}
                  label="แบรนด์ที่กลุ่มนี้รับดูแล (สำหรับระบบสุ่มกลุ่ม):"
                />
              </div>
            </div>

            {/* 2-Column Picker Body: Left = Customers, Right = Sales Agents */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-zinc-800">
              {/* LEFT PANE: Pick Customers */}
              <div className="flex-1 p-4 flex flex-col overflow-hidden bg-slate-50/40 dark:bg-zinc-900/40">
                <div className="pb-3 border-b border-slate-200/80 dark:border-zinc-800 space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 dark:text-zinc-200">
                      1. เลือกลูกค้าเข้ากลุ่ม (เลือกแล้ว {formCustomerIds.length} คน)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCustomerFilter('all')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                          customerFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        ทั้งหมด ({conversations.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomerFilter('selected')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                          customerFilter === 'selected'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        ที่เลือกไว้ ({formCustomerIds.length})
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="ค้นหาชื่อลูกค้า, แบรนด์..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80 pt-1">
                  {filteredCustomers.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      ไม่พบลูกค้าตามคำค้นหา
                    </div>
                  ) : (
                    filteredCustomers.map((c) => {
                      const isSelected = formCustomerIds.includes(c.id);
                      const bInfo = getBrandDisplay(c.brand, channels);
                      const existingAgentCount = getConversationAgentIds(c).length;
                      const existingGrp = c.metadata?.assigned_group_name;

                      return (
                        <div
                          key={c.id}
                          onClick={() => toggleCustomer(c.id)}
                          className={`py-2.5 px-3 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors rounded-xl ${
                            isSelected
                              ? 'bg-white dark:bg-zinc-850'
                              : 'hover:bg-white/70 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                              }`}
                            >
                              {isSelected && <Check size={11} strokeWidth={3} />}
                            </div>

                            <CustomerAvatarWithBadge conv={c} size={34} />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                                  {c.customer_name}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 700,
                                    color: bInfo.bg,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    flexShrink: 0,
                                  }}
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
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {existingGrp
                                  ? `กลุ่มเดิม: ${existingGrp}`
                                  : existingAgentCount > 0
                                  ? `มีผู้ดูแลอยู่ ${existingAgentCount} คน`
                                  : c.last_message || 'ยังไม่มีผู้ดูแล'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RIGHT PANE: Pick Sales Agents (Clean Design: Avatar + Real First Name, Zero AI clutter) */}
              <div className="flex-1 p-4 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">
                <div className="pb-3 border-b border-slate-200/80 dark:border-zinc-800 space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 dark:text-zinc-200">
                      2. เลือกเซลล์ผู้ดูแลในกลุ่ม (เลือกแล้ว {formAgentIds.length} คน)
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setFormAgentIds(chatStaffUsers.map((u) => u.id))}
                        className="text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
                      >
                        เลือกทั้งหมด
                      </button>
                      <span className="text-slate-300 dark:text-zinc-700">|</span>
                      <button
                        type="button"
                        onClick={() => setFormAgentIds([])}
                        className="text-slate-400 hover:text-red-500 font-medium cursor-pointer"
                      >
                        ล้าง
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="ค้นหาชื่อเซลล์, แผนก..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80 pt-1">
                  {filteredStaff.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      ไม่พบพนักงานตามคำค้นหา
                    </div>
                  ) : (
                    filteredStaff.map((u) => {
                      const isSelected = formAgentIds.includes(u.id);
                      const isAdmin = u.role === 'admin';
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleAgent(u.id)}
                          className={`py-2.5 px-3 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors rounded-xl ${
                            isSelected
                              ? 'bg-slate-50/70 dark:bg-zinc-850/60'
                              : 'hover:bg-slate-50/50 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                              }`}
                            >
                              {isSelected && <Check size={11} strokeWidth={3} />}
                            </div>

                            <StaffAvatarImg url={u.avatar_url} name={u.first_name} size={30} />

                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                                {u.first_name}
                              </span>
                              {isAdmin && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400 shrink-0">
                                  Admin
                                </span>
                              )}
                            </div>
                          </div>

                          <span className="text-[11px] text-slate-400 shrink-0">
                            {u.department || u.position || 'ทีมงาน'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                ลูกค้า <b className="text-slate-800 dark:text-zinc-200">{formCustomerIds.length}</b> คน • เซลล์ผู้ดูแล <b className="text-slate-800 dark:text-zinc-200">{formAgentIds.length}</b> คน
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={formSaving}
                  className="px-5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {formSaving
                    ? 'กำลังบันทึก...'
                    : modalMode === 'create'
                    ? 'สร้างกลุ่มแชท'
                    : 'บันทึกการเปลี่ยนแปลง'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
