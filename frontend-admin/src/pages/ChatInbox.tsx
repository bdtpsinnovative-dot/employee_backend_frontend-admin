import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  X,
  Volume2,
  VolumeX,
  Plus,
  Radio,
  Copy,
  Check,
  Edit2,
  FileText,
  ExternalLink,
  Shuffle,
  ShieldAlert,
  ChevronDown,
  Settings as SettingsIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ChatConversation, ChatMessage, ChatChannel, User, ChatRoutingGroup, ChatAccessUser } from '../types';
import { fetchUsers, fetchMe } from '../services/adminApi';
import { avatarUrl } from '../components/tasks/taskUtils';
import {
  fetchChatRoutingGroups,
  fetchChatAccessUsers,
  hasChatAccess,
  assignConversation,
  pickAgentFromGroup,
  saveChatRoutingGroups,
} from '../services/chatRoutingService';
import { LineIcon, FacebookIcon, InstagramIcon } from './ChatSettings';

const QUICK_REPLIES = [
  'สวัสดีครับ ยินดีให้บริการครับ มีอะไรให้เราช่วยดูแลวันนี้ครับ?',
  'ขออภัยที่ตอบกลับล่าช้าครับ ทางเรากำลังตรวจสอบข้อมูลให้อยู่นะครับ',
  'ขออนุญาตสอบถามข้อมูลเพิ่มเติม เพื่อประสานงานให้ฝ่ายที่เกี่ยวข้องครับ',
  'ขอบคุณที่ติดต่อสอบถามเข้ามาครับ หากมีข้อสงสัยเพิ่มเติมสอบถามได้ตลอดเวลานะครับ',
  'สินค้าชิ้นนี้มีพร้อมส่งครับ จัดส่งได้ภายใน 1-2 วันทำการครับ',
];

// 🎨 Multi-Brand Presets & Styling
const BRAND_PRESETS: Record<string, { label: string; shortLabel: string; bg: string; color: string }> = {
  terrahome: { label: 'Terra Home Studio', shortLabel: 'TERRA', bg: '#B45309', color: '#FFFFFF' },
  zenslab: { label: 'Zenslab by Woodden', shortLabel: 'ZENSLAB', bg: '#065F46', color: '#FFFFFF' },
  emberandash: { label: 'Ember and Ash', shortLabel: 'EMBER & ASH', bg: '#9A3412', color: '#FFFFFF' },
  wallcraft: { label: 'Wallcraft Thailand', shortLabel: 'WALLCRAFT', bg: '#1E3A8A', color: '#FFFFFF' },
};

function getBrandDisplay(brandSlug?: string, channelsList?: ChatChannel[]) {
  const slug = (brandSlug || 'terrahome').toLowerCase().trim();
  const matchedChannel = channelsList?.find(c => c.brand_slug.toLowerCase() === slug);
  const preset = BRAND_PRESETS[slug];

  return {
    label: matchedChannel?.brand_name || preset?.label || slug.toUpperCase(),
    shortLabel: preset?.shortLabel || matchedChannel?.brand_name?.slice(0, 10) || slug.toUpperCase(),
    bg: preset?.bg || '#374151',
    color: preset?.color || '#FFFFFF',
    logo: matchedChannel?.brand_logo || null,
  };
}

export default function ChatInbox() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [routingGroups, setRoutingGroups] = useState<ChatRoutingGroup[]>([]);
  const [, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAllowed, setIsAllowed] = useState(true);

  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [isAssigning, setIsAssigning] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'line' | 'facebook' | 'instagram'>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unread' | 'resolved'>('active');

  // Multi-Channel (Multi-Brand LINE OA, FB & IG)
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [showChannelsModal, setShowChannelsModal] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandSlug, setNewBrandSlug] = useState('');
  const [newChannelToken, setNewChannelToken] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');
  const [newChannelPlatform, setNewChannelPlatform] = useState<'line' | 'facebook' | 'instagram'>('line');
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelError, setChannelError] = useState('');

  // Webhook & sound settings
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState(() => {
    return (
      localStorage.getItem('n8n_outbound_webhook_url') ||
      import.meta.env.VITE_N8N_OUTBOUND_WEBHOOK_URL ||
      'https://bddevelopment.app.n8n.cloud/webhook/send-chat'
    );
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempWebhookUrl, setTempWebhookUrl] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentConvIdRef = useRef<string | null>(null);

  currentConvIdRef.current = selectedConv?.id || null;

  // Auto scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [messages]);

  // Play notification sound
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch {
      // AudioContext might be blocked until user interacts
    }
  };

  // 1. Fetch Conversations
  const fetchConversations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) {
        console.error('Error fetching chat_conversations:', error);
      } else {
        setConversations(data || []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  // 2. Fetch Messages for Selected Conversation
  const fetchMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
      }

      // Mark unread as read in this conversation
      await supabase
        .from('chat_conversations')
        .update({ unread_count: 0 })
        .eq('id', convId);

      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Load channels
  const fetchChannels = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chat_channels')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data) {
        setChannels(data);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }, []);

  // Load initial system data (current user, all users, routing groups, whitelist)
  useEffect(() => {
    let isMounted = true;
    async function initSystemData() {
      try {
        const [meRes, usersRes, groupsRes, accessRes] = await Promise.all([
          fetchMe().catch(() => null),
          fetchUsers().catch(() => []),
          fetchChatRoutingGroups().catch(() => []),
          fetchChatAccessUsers().catch(() => []),
        ]);

        if (!isMounted) return;
        if (meRes) setCurrentUser(meRes);
        if (usersRes) setUsers(usersRes);
        if (groupsRes) setRoutingGroups(groupsRes);
        if (accessRes) setAccessUsers(accessRes);

        const allowed = hasChatAccess(meRes, accessRes || []);
        setIsAllowed(allowed);
        setAccessChecked(true);
      } catch (e) {
        console.error('Failed to init system data for chat:', e);
        if (isMounted) setAccessChecked(true);
      }
    }
    void initSystemData();
    return () => { isMounted = false; };
  }, []);

  // Load conversations and channels on mount
  useEffect(() => {
    void fetchConversations();
    void fetchChannels();
  }, [fetchConversations, fetchChannels]);

  const handleCopyWebhook = (brandSlug: string) => {
    const url = `https://bddevelopment.app.n8n.cloud/webhook/line-inbound?brand=${brandSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(brandSlug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setChannelError('');
    const slug = newBrandSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const name = newBrandName.trim();
    const token = newChannelToken.trim();

    if (!name || !slug || !token) {
      setChannelError('กรุณากรอกข้อมูลให้ครบทุกช่อง (ชื่อ, รหัสแบรนด์, Access Token)');
      return;
    }

    setChannelSaving(true);
    try {
      const { error } = await supabase.from('chat_channels').insert({
        brand_slug: slug,
        brand_name: name,
        brand_logo: newBrandLogo.trim() || null,
        platform: newChannelPlatform,
        channel_id: newChannelId.trim() || null,
        channel_access_token: token,
        is_active: true,
      });

      if (error) {
        if (error.code === '23505') {
          setChannelError(`รหัสแบรนด์ '${slug}' มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`);
        } else {
          setChannelError(error.message);
        }
        return;
      }

      setNewBrandName('');
      setNewBrandSlug('');
      setNewChannelToken('');
      setNewChannelId('');
      setNewBrandLogo('');
      await fetchChannels();
    } catch (err: any) {
      setChannelError(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setChannelSaving(false);
    }
  };

  // Load messages when selectedConv changes
  useEffect(() => {
    if (selectedConv) {
      void fetchMessages(selectedConv.id);
    } else {
      setMessages([]);
    }
  }, [selectedConv?.id, fetchMessages]);

  // 3. Setup Supabase Realtime for Conversations and Messages
  useEffect(() => {
    const channel = supabase
      .channel('realtime_omnichannel_chat')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as ChatConversation;
            setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
            playNotificationSound();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ChatConversation;
            setConversations((prev) => {
              const filtered = prev.filter((c) => c.id !== updated.id);
              return [updated, ...filtered].sort(
                (a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              );
            });
            if (updated.id === currentConvIdRef.current) {
              setSelectedConv(updated);
            }
          } else if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old.id));
            if (payload.old.id === currentConvIdRef.current) {
              setSelectedConv(null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          if (newMsg.conversation_id === currentConvIdRef.current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            if (newMsg.sender_type === 'customer') {
              playNotificationSound();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  // 4. Send Message Handler
  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || inputMessage).trim();
    if (!content || !selectedConv || sending) return;

    setSending(true);
    setInputMessage('');

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      conversation_id: selectedConv.id,
      sender_type: 'agent',
      sender_name: 'แอดมิน',
      message_type: 'text',
      content,
      created_at: new Date().toISOString(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // 1) Save to Supabase
      const { data: savedMsg, error: dbError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: selectedConv.id,
          sender_type: 'agent',
          sender_name: 'แอดมิน',
          message_type: 'text',
          content,
          status: 'sent',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Update local state with real message ID
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? (savedMsg as ChatMessage) : m))
      );

      // Update conversation last_message
      await supabase
        .from('chat_conversations')
        .update({
          last_message: content,
          last_message_at: new Date().toISOString(),
          status: 'active',
        })
        .eq('id', selectedConv.id);

      // 2) Trigger Outbound Webhook to n8n (so n8n pushes to LINE/Facebook API)
      if (outboundWebhookUrl) {
        try {
          await fetch(outboundWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: selectedConv.id,
              platform: selectedConv.platform,
              platform_user_id: selectedConv.platform_user_id,
              brand: selectedConv.brand || 'terrahome',
              content,
              message_id: savedMsg.id,
              metadata: selectedConv.metadata,
            }),
          });
        } catch (webhookErr) {
          console.warn('n8n outbound webhook call failed or was unreachable:', webhookErr);
        }
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      alert('เกิดข้อผิดพลาดในการส่งข้อความ: ' + (err.message || 'Unknown error'));
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  const handleSaveCustomerName = async () => {
    if (!selectedConv || !editNameValue.trim()) {
      setIsEditingName(false);
      return;
    }
    const newName = editNameValue.trim();
    setIsEditingName(false);
    setSelectedConv((prev) => (prev ? { ...prev, customer_name: newName } : null));
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedConv.id ? { ...c, customer_name: newName } : c))
    );
    try {
      await supabase
        .from('chat_conversations')
        .update({ customer_name: newName })
        .eq('id', selectedConv.id);
    } catch (e) {
      console.error('Failed to update customer name:', e);
    }
  };

  // Random assign handler
  const handleRandomAssign = async () => {
    if (!selectedConv) return;
    setIsAssigning(true);
    try {
      const convBrand = (selectedConv.brand || '').toLowerCase().trim();
      let group = routingGroups.find(
        (g) => g.is_active && g.brand.toLowerCase() === convBrand && g.agent_ids.length > 0
      );
      if (!group) {
        group = routingGroups.find((g) => g.is_active && g.brand === 'all' && g.agent_ids.length > 0);
      }

      if (!group) {
        alert(
          `ยังไม่ได้ตั้งกลุ่มแอดมินสำหรับแบรนด์ "${selectedConv.brand || 'ทั่วไป'}"\nกรุณาไปที่เมนู "ตั้งค่าช่องทางแชท" เพื่อสร้างกลุ่มและเลือกสมาชิกครับ`
        );
        return;
      }

      const pick = pickAgentFromGroup(group, users);
      if (!pick) {
        alert('ไม่พบรายชื่อแอดมินที่พร้อมทำงานในกลุ่มนี้ กรุณาตรวจสอบรายชื่อสมาชิก');
        return;
      }

      const assignedUser = users.find((u) => u.id === pick.agentId);
      const agentName = assignedUser ? (assignedUser.nickname || assignedUser.first_name) : 'แอดมิน';

      const ok = await assignConversation(selectedConv.id, {
        id: pick.agentId,
        name: agentName,
        avatar: assignedUser?.avatar_url,
      });

      if (ok) {
        const updated = {
          ...selectedConv,
          assigned_to: pick.agentId,
          assigned_name: agentName,
        };
        setSelectedConv(updated);
        setConversations((prev) => prev.map((c) => (c.id === selectedConv.id ? updated : c)));

        // Save round-robin index pointer if updated
        if (pick.updatedGroup.last_assigned_index !== group.last_assigned_index) {
          const updatedGroups = routingGroups.map((g) =>
            g.id === pick.updatedGroup.id ? pick.updatedGroup : g
          );
          setRoutingGroups(updatedGroups);
          void saveChatRoutingGroups(updatedGroups);
        }
      } else {
        alert('มอบหมายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการสุ่มผู้ดูแล: ' + err.message);
    } finally {
      setIsAssigning(false);
    }
  };

  // Manual assign handler
  const handleManualAssign = async (targetUser: User | null) => {
    if (!selectedConv) return;
    setShowAssignDropdown(false);
    try {
      const agentName = targetUser ? (targetUser.nickname || targetUser.first_name) : null;
      const ok = await assignConversation(selectedConv.id, {
        id: targetUser ? targetUser.id : null,
        name: agentName || undefined,
        avatar: targetUser?.avatar_url,
      });
      if (ok) {
        const updated = {
          ...selectedConv,
          assigned_to: targetUser ? targetUser.id : null,
          assigned_name: agentName,
        };
        setSelectedConv(updated);
        setConversations((prev) => prev.map((c) => (c.id === selectedConv.id ? updated : c)));
      } else {
        alert('อัปเดตผู้ดูแลไม่สำเร็จ');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // Toggle resolve / active status
  const handleToggleStatus = async () => {
    if (!selectedConv) return;
    const newStatus = selectedConv.status === 'active' ? 'resolved' : 'active';
    try {
      const { error } = await supabase
        .from('chat_conversations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedConv.id);

      if (error) throw error;
      setSelectedConv((prev) => (prev ? { ...prev, status: newStatus } : null));
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConv.id ? { ...c, status: newStatus } : c))
      );
    } catch (err: any) {
      alert('ไม่สามารถเปลี่ยนสถานะได้: ' + err.message);
    }
  };

  // Save Settings Modal
  const handleSaveSettings = () => {
    setOutboundWebhookUrl(tempWebhookUrl.trim());
    localStorage.setItem('n8n_outbound_webhook_url', tempWebhookUrl.trim());
    setShowSettingsModal(false);
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const matchesSearch =
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.last_message && c.last_message.toLowerCase().includes(search.toLowerCase()));

    const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'unread'
        ? (c.unread_count || 0) > 0
        : c.status === statusFilter;
    const matchesBrand =
      brandFilter === 'all' ||
      (c.brand || 'terrahome').toLowerCase() === brandFilter.toLowerCase();

    const matchesAssign =
      assignFilter === 'all'
        ? true
        : assignFilter === 'mine'
        ? c.assigned_to === currentUser?.id
        : !c.assigned_to;

    return matchesSearch && matchesPlatform && matchesStatus && matchesBrand && matchesAssign;
  });

  const activeUnreadTotal = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const myChatsCount = conversations.filter((c) => c.assigned_to === currentUser?.id).length;
  const unassignedChatsCount = conversations.filter((c) => !c.assigned_to).length;

  if (accessChecked && !isAllowed) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '70vh',
          padding: '24px',
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '36px 32px',
            maxWidth: '460px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <ShieldAlert size={34} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
            ไม่มีสิทธิ์เข้าถึงหน้ารวมแชท
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
            หน้ารวมแชทนี้จำกัดสิทธิ์เฉพาะแอดมินหรือพนักงานที่ได้รับอนุญาตเท่านั้น หากท่านต้องการเข้าใช้งาน กรุณาแจ้งผู้ดูแลระบบเพื่อเปิดสิทธิ์ในหน้า <b>ตั้งค่าช่องทางแชท &gt; สิทธิ์เข้าใช้งาน</b>
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              background: 'var(--blue)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
            }}
          >
            กลับสู่หน้าภาพรวมระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 30px)', display: 'flex', flexDirection: 'column' }}>
      {/* Main Chat Box Container */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* ================= LEFT PANEL: CONVERSATION LIST ================= */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--surface-muted)',
            minHeight: 0,
          }}
        >
          {/* Search & Filters */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                }}
              >
                <Search size={16} style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อลูกค้าหรือข้อความ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    width: '100%',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Settings Shortcut for Admin */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => navigate('/chat-settings')}
                  title="ตั้งค่าระบบแชท, จัดกลุ่มสุ่มแอดมิน & สิทธิ์เข้าใช้งาน"
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <SettingsIcon size={16} />
                </button>
              )}

              {/* Sound Toggle Icon Button */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'เสียงแจ้งเตือน: เปิดอยู่ (คลิกเพื่อปิด)' : 'เสียงแจ้งเตือน: ปิดอยู่ (คลิกเพื่อเปิด)'}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: soundEnabled ? 'var(--blue)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>

            {/* Platform Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'line', 'facebook', 'instagram'] as const).map((p) => {
                const isActive = platformFilter === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive
                        ? p === 'instagram'
                          ? '#E1306C'
                          : 'var(--blue)'
                        : 'var(--surface)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {p === 'all'
                      ? 'ทั้งหมด'
                      : p === 'line'
                      ? '🟢 LINE'
                      : p === 'facebook'
                      ? '🔵 FB'
                      : '🟣 IG'}
                  </button>
                );
              })}
            </div>

            {/* Brand Filter Tabs (Dynamic from channels) */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setBrandFilter('all')}
                style={{
                  flex: 1,
                  minWidth: '50px',
                  padding: '4px 6px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: brandFilter === 'all' ? 'var(--border-strong)' : 'var(--surface)',
                  color: brandFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                ทุกแบรนด์
              </button>
              {Array.from(new Map(channels.map((ch) => [ch.brand_slug.toLowerCase(), ch])).values()).map((ch) => {
                const isActive = brandFilter.toLowerCase() === ch.brand_slug.toLowerCase();
                const bInfo = getBrandDisplay(ch.brand_slug, channels);
                return (
                  <button
                    key={ch.id}
                    onClick={() => setBrandFilter(ch.brand_slug)}
                    style={{
                      flex: 1,
                      minWidth: '60px',
                      padding: '4px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? bInfo.bg : 'var(--surface)',
                      color: isActive ? bInfo.color : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                    title={ch.brand_name}
                  >
                    {bInfo.logo && (
                      <img
                        src={bInfo.logo}
                        alt=""
                        style={{ width: '13px', height: '13px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    )}
                    <span>{bInfo.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {(['unread', 'active', 'resolved', 'all'] as const).map((s) => {
                const isSelected = statusFilter === s;
                return (
                  <span
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      cursor: 'pointer',
                      color:
                        s === 'unread' && activeUnreadTotal > 0
                          ? '#EF4444'
                          : isSelected
                          ? 'var(--blue)'
                          : 'var(--text-secondary)',
                      fontWeight: isSelected || (s === 'unread' && activeUnreadTotal > 0) ? 700 : 500,
                      textDecoration: isSelected ? 'underline' : 'none',
                    }}
                  >
                    {s === 'unread'
                      ? `🔴 ยังไม่อ่าน${activeUnreadTotal > 0 ? ` (${activeUnreadTotal})` : ''}`
                      : s === 'active'
                      ? 'เปิดอยู่'
                      : s === 'resolved'
                      ? 'ปิดเคสแล้ว'
                      : 'ทั้งหมด'}
                  </span>
                );
              })}
            </div>

            {/* Assignment Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px', paddingTop: '4px', borderTop: '1px dashed var(--border)' }}>
              {[
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'mine', label: '👤 ของฉัน', count: myChatsCount },
                { key: 'unassigned', label: '⚠️ ยังไม่มีผู้ดูแล', count: unassignedChatsCount },
              ].map((af) => {
                const isActive = assignFilter === af.key;
                return (
                  <button
                    key={af.key}
                    onClick={() => setAssignFilter(af.key as any)}
                    style={{
                      flex: 1,
                      padding: '4px 2px',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      borderRadius: '5px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'var(--blue)' : 'var(--surface)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{af.label}</span>
                    {af.count !== undefined && af.count > 0 && (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '0 4px',
                          borderRadius: '8px',
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--surface-muted)',
                          color: isActive ? '#fff' : 'var(--text-primary)',
                          fontWeight: 700,
                        }}
                      >
                        {af.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* List Items */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loadingConvs ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                กำลังโหลดการสนทนา...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <MessageSquare size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>ไม่พบประวัติการแชท</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', opacity: 0.7 }}>
                  เมื่อมีลูกค้าทัก LINE หรือ Facebook จะปรากฏขึ้นที่นี่
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedConv?.id === conv.id;
                const isLine = conv.platform === 'line';
                const isIg = conv.platform === 'instagram';
                const avatarBg = isLine ? '#D1FAE5' : isIg ? '#FCE7F3' : '#DBEAFE';
                const avatarColor = isLine ? '#065F46' : isIg ? '#9D174D' : '#1E40AF';
                const badgeTitle = isLine
                  ? 'LINE Official Account'
                  : isIg
                  ? 'Instagram Direct'
                  : 'Facebook Messenger';
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    style={{
                      padding: '12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--surface)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--blue)' : '3px solid transparent',
                      transition: 'background 0.15s ease',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    {/* Avatar with Platform Badge */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: avatarBg,
                          color: avatarColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          overflow: 'hidden',
                        }}
                      >
                        {conv.customer_avatar ? (
                          <img
                            src={conv.customer_avatar}
                            alt=""
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          conv.customer_name.charAt(0).toUpperCase() || 'C'
                        )}
                      </div>

                      {/* Mini Platform Badge */}
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-2px',
                          right: '-2px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px solid var(--surface)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          overflow: 'hidden',
                        }}
                        title={badgeTitle}
                      >
                        {isLine ? (
                          <LineIcon size={14} />
                        ) : isIg ? (
                          <InstagramIcon size={14} />
                        ) : (
                          <FacebookIcon size={14} />
                        )}
                      </span>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {conv.customer_name}
                          </span>
                          {(() => {
                            const bInfo = getBrandDisplay(conv.brand, channels);
                            return (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: bInfo.bg,
                                  color: bInfo.color,
                                  flexShrink: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {bInfo.logo && (
                                  <img
                                    src={bInfo.logo}
                                    alt=""
                                    style={{ width: '11px', height: '11px', borderRadius: '50%', objectFit: 'cover' }}
                                  />
                                )}
                                <span>{bInfo.shortLabel}</span>
                              </span>
                            );
                          })()}

                          {/* Assigned Agent Badge */}
                          {conv.assigned_to ? (() => {
                            const ag = users.find((u) => u.id === conv.assigned_to);
                            const isMe = conv.assigned_to === currentUser?.id;
                            const agName = ag ? (ag.nickname || ag.first_name) : (conv.assigned_name || 'มีผู้ดูแล');
                            return (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 600,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: isMe ? '#DBEAFE' : 'var(--surface)',
                                  color: isMe ? '#1D4ED8' : 'var(--text-secondary)',
                                  border: '1px solid var(--border)',
                                  flexShrink: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                                title={`ผู้ดูแล: ${ag?.first_name || ''} ${ag?.last_name || ''}`}
                              >
                                👤 {agName}
                              </span>
                            );
                          })() : (
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 600,
                                padding: '1px 4px',
                                borderRadius: '4px',
                                background: '#FEF3C7',
                                color: '#B45309',
                                border: '1px solid #FDE68A',
                                flexShrink: 0,
                              }}
                            >
                              ว่าง
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          {conv.last_message_at
                            ? new Date(conv.last_message_at).toLocaleTimeString('th-TH', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            color: conv.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: conv.unread_count > 0 ? 600 : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '180px',
                          }}
                        >
                          {conv.last_message || 'เริ่มการสนทนา'}
                        </span>

                        {conv.unread_count > 0 && (
                          <span
                            style={{
                              background: '#EF4444',
                              color: '#fff',
                              borderRadius: '10px',
                              padding: '1px 6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT PANEL: CHAT ROOM ================= */}
        {selectedConv ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Chat Room Header */}
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: selectedConv.platform === 'line' ? '#D1FAE5' : '#DBEAFE',
                    color: selectedConv.platform === 'line' ? '#065F46' : '#1E40AF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                  }}
                >
                  {selectedConv.customer_avatar ? (
                    <img
                      src={selectedConv.customer_avatar}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    selectedConv.customer_name.charAt(0)
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isEditingName ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') await handleSaveCustomerName();
                            if (e.key === 'Escape') setIsEditingName(false);
                          }}
                          autoFocus
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--blue)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                          }}
                        />
                        <button
                          onClick={handleSaveCustomerName}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'var(--blue)',
                            color: '#fff',
                            border: 'none',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          บันทึก
                        </button>
                        <button
                          onClick={() => setIsEditingName(false)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                          }}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {selectedConv.customer_name}
                        </span>
                        <button
                          onClick={() => {
                            setIsEditingName(true);
                            setEditNameValue(selectedConv.customer_name);
                          }}
                          title="แก้ไขชื่อลูกค้า"
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                      </>
                    )}
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background:
                          selectedConv.platform === 'line'
                            ? '#06C755'
                            : selectedConv.platform === 'instagram'
                            ? '#E1306C'
                            : '#0084FF',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {selectedConv.platform === 'line' ? (
                        <>
                          <LineIcon size={12} />
                          <span>LINE OA</span>
                        </>
                      ) : selectedConv.platform === 'instagram' ? (
                        <>
                          <InstagramIcon size={12} />
                          <span>Instagram</span>
                        </>
                      ) : (
                        <>
                          <FacebookIcon size={12} />
                          <span>Facebook Page</span>
                        </>
                      )}
                    </span>
                    {(() => {
                      const bInfo = getBrandDisplay(selectedConv.brand, channels);
                      return (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            background: bInfo.bg,
                            color: bInfo.color,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          {bInfo.logo && (
                            <img
                              src={bInfo.logo}
                              alt=""
                              style={{ width: '13px', height: '13px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          )}
                          <span>{bInfo.label}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ID: {selectedConv.platform_user_id.slice(0, 16)}...
                  </span>
                </div>
              </div>

              {/* Status / Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Agent Assignment Widget */}
                {(() => {
                  const assignedAgent = users.find((u) => u.id === selectedConv.assigned_to);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Assigned Agent Badge & Dropdown Trigger */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            border: '1px solid var(--border)',
                            cursor: 'pointer',
                            background: assignedAgent ? 'var(--surface-muted)' : '#FEF3C7',
                            color: assignedAgent ? 'var(--text-primary)' : '#92400E',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                          title="คลิกเพื่อเลือกหรือเปลี่ยนผู้ดูแลลูกค้าคนนี้"
                        >
                          {assignedAgent ? (
                            <>
                              {assignedAgent.avatar_url ? (
                                <img
                                  src={avatarUrl(assignedAgent.avatar_url) || ''}
                                  alt=""
                                  style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#3B82F6',
                                    color: '#fff',
                                    fontSize: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {(assignedAgent.nickname || assignedAgent.first_name).charAt(0)}
                                </div>
                              )}
                              <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                👤 {assignedAgent.nickname || assignedAgent.first_name}
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: '13px' }}>⚠️</span>
                              <span>ยังไม่มีผู้ดูแล</span>
                            </>
                          )}
                          <ChevronDown size={13} style={{ opacity: 0.6 }} />
                        </button>

                        {/* Dropdown Menu */}
                        {showAssignDropdown && (
                          <>
                            <div
                              style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                              onClick={() => setShowAssignDropdown(false)}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '4px',
                                width: '250px',
                                maxHeight: '300px',
                                overflowY: 'auto',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '10px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
                                zIndex: 999,
                                padding: '4px',
                              }}
                            >
                              <div
                                style={{
                                  padding: '6px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: 'var(--text-secondary)',
                                  borderBottom: '1px solid var(--border)',
                                }}
                              >
                                มอบหมายผู้ดูแลลูกค้า
                              </div>

                              {/* Clear assignment option */}
                              <div
                                onClick={() => void handleManualAssign(null)}
                                style={{
                                  padding: '7px 10px',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  color: '#DC2626',
                                  background: !selectedConv.assigned_to ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                }}
                              >
                                <span>✕ ยกเลิกผู้ดูแล (ไม่มีผู้ดูแล)</span>
                                {!selectedConv.assigned_to && <Check size={14} />}
                              </div>

                              {/* Users list */}
                              {users.map((u) => {
                                const isSelected = selectedConv.assigned_to === u.id;
                                return (
                                  <div
                                    key={u.id}
                                    onClick={() => void handleManualAssign(u)}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <div
                                        style={{
                                          width: '24px',
                                          height: '24px',
                                          borderRadius: '50%',
                                          background: '#64748B',
                                          color: '#fff',
                                          fontSize: '10px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          flexShrink: 0,
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {u.avatar_url ? (
                                          <img
                                            src={avatarUrl(u.avatar_url) || ''}
                                            alt=""
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                          />
                                        ) : (
                                          (u.nickname || u.first_name).charAt(0)
                                        )}
                                      </div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {u.first_name} {u.last_name} {u.nickname ? `(${u.nickname})` : ''}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                                          {u.position || u.role}
                                        </div>
                                      </div>
                                    </div>
                                    {isSelected && <Check size={14} style={{ color: 'var(--blue)', flexShrink: 0 }} />}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Button: 🎲 สุ่มคนดูแล */}
                      <button
                        onClick={() => void handleRandomAssign()}
                        disabled={isAssigning}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: 'none',
                          background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
                          color: '#fff',
                          cursor: isAssigning ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                          opacity: isAssigning ? 0.7 : 1,
                          transition: 'all 0.15s ease',
                        }}
                        title="สุ่มผู้ดูแลตามกลุ่มแอดมินที่ตั้งค่าไว้"
                      >
                        <Shuffle size={13} />
                        <span>{isAssigning ? 'กำลังสุ่ม...' : '🎲 สุ่มคนดูแล'}</span>
                      </button>
                    </div>
                  );
                })()}

                <button
                  onClick={handleToggleStatus}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedConv.status === 'resolved' ? '#DEF7EC' : 'var(--surface-muted)',
                    color: selectedConv.status === 'resolved' ? '#03543F' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {selectedConv.status === 'resolved' ? (
                    <>
                      <RotateCcw size={14} />
                      <span>เปิดเคสใหม่</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} style={{ color: '#059669' }} />
                      <span>ปิดเคส (Resolved)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Message Thread Area */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: 'var(--page-bg)',
                minHeight: 0,
              }}
            >
              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  กำลังโหลดข้อความ...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                  <Clock size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>ยังไม่มีข้อความในการสนทนานี้</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'bot';
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '70%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isAgent ? 'flex-end' : 'flex-start',
                        }}
                      >
                        {/* Sender Label */}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          {isAgent ? (msg.sender_type === 'bot' ? '🤖 AI Bot' : '🧑‍💼 แอดมิน') : selectedConv.customer_name}
                        </span>

                        {/* Message Content (Sticker / Image / Text Bubble) */}
                        {msg.message_type === 'sticker' && msg.media_url ? (
                          <div style={{ padding: '4px' }}>
                            <img
                              src={msg.media_url}
                              alt="LINE Sticker"
                              style={{
                                width: '130px',
                                height: '130px',
                                objectFit: 'contain',
                                display: 'block',
                              }}
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (msg.message_type === 'image' || msg.content?.startsWith('📷')) && msg.media_url ? (
                          <div style={{ padding: '4px' }}>
                            <div
                              onClick={() => setPreviewImage(msg.media_url || null)}
                              style={{ cursor: 'pointer', display: 'inline-block' }}
                              title="คลิกเพื่อดูรูปภาพขนาดใหญ่"
                            >
                              <img
                                src={msg.media_url}
                                alt="รูปภาพจากแชท"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                style={{
                                  maxWidth: '260px',
                                  maxHeight: '300px',
                                  borderRadius: '12px',
                                  border: '1px solid var(--border)',
                                  objectFit: 'cover',
                                  display: 'block',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                  transition: 'transform 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                              />
                            </div>
                            {msg.content && msg.content !== '📷 [รูปภาพ]' && !msg.content.startsWith('📷') && (
                              <div
                                style={{
                                  marginTop: '6px',
                                  padding: '8px 12px',
                                  borderRadius: '10px',
                                  background: isAgent ? 'var(--blue)' : 'var(--surface)',
                                  color: isAgent ? '#ffffff' : 'var(--text-primary)',
                                  fontSize: '0.88rem',
                                  lineHeight: 1.4,
                                  border: isAgent ? 'none' : '1px solid var(--border)',
                                }}
                              >
                                {msg.content}
                              </div>
                            )}
                          </div>
                        ) : msg.message_type === 'file' && msg.media_url ? (
                          <div style={{ padding: '4px' }}>
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                background: isAgent ? 'var(--blue)' : 'var(--surface)',
                                color: isAgent ? '#fff' : 'var(--blue)',
                                border: isAgent ? 'none' : '1px solid var(--border)',
                                textDecoration: 'none',
                                fontSize: '0.88rem',
                                fontWeight: 500,
                              }}
                            >
                              <FileText size={18} />
                              <span>{msg.content || 'เปิดไฟล์แนบ'}</span>
                              <ExternalLink size={14} style={{ opacity: 0.7 }} />
                            </a>
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: '10px 14px',
                              borderRadius: '14px',
                              borderBottomRightRadius: isAgent ? '3px' : '14px',
                              borderBottomLeftRadius: !isAgent ? '3px' : '14px',
                              background: isAgent ? 'var(--blue)' : 'var(--surface)',
                              color: isAgent ? '#ffffff' : 'var(--text-primary)',
                              fontSize: '0.88rem',
                              lineHeight: 1.45,
                              border: isAgent ? 'none' : '1px solid var(--border)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {msg.content}
                          </div>
                        )}

                        {/* Timestamp */}
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {new Date(msg.created_at).toLocaleTimeString('th-TH', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {msg.status === 'sending' && ' (กำลังส่ง...)'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies Tray */}
            <div
              style={{
                padding: '6px 16px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={13} style={{ color: '#F59E0B' }} />
                <span>คำตอบด่วน:</span>
              </span>
              {QUICK_REPLIES.map((reply, idx) => (
                <button
                  key={idx}
                  onClick={() => setInputMessage(reply)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '14px',
                    fontSize: '0.72rem',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {reply.slice(0, 24)}...
                </button>
              ))}
            </div>

            {/* Bottom Input Area */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-end',
              }}
            >
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                placeholder="พิมพ์ข้อความตอบกลับลูกค้า (กด Enter เพื่อส่ง)..."
                rows={2}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-muted)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  resize: 'none',
                  outline: 'none',
                }}
              />

              <button
                onClick={() => void handleSendMessage()}
                disabled={!inputMessage.trim() || sending}
                style={{
                  height: '46px',
                  padding: '0 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: inputMessage.trim() && !sending ? 'var(--blue)' : 'var(--border-strong)',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: inputMessage.trim() && !sending ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.88rem',
                }}
              >
                <Send size={16} />
                <span>ส่ง</span>
              </button>
            </div>
          </div>
        ) : (
          /* Empty state when no conversation is selected */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px',
              color: 'var(--text-secondary)',
              background: 'var(--surface)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--surface-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <MessageSquare size={32} style={{ opacity: 0.5 }} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              เลือกลูกค้าทางด้านซ้ายเพื่อเริ่มคุย
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', maxWidth: '340px', textAlign: 'center' }}>
              ข้อความจากลูกค้าทั้ง Facebook Page และ LINE OA จะถูกรวมไว้ที่นี่ แอดมินสามารถพิมพ์ตอบกลับได้ทันที
            </p>
          </div>
        )}
      </div>

      {/* ================= MODAL: SETTINGS (n8n Webhook URL) ================= */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: '90%',
              maxWidth: '520px',
              background: 'var(--surface)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid var(--border)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                ตั้งค่า n8n Outbound Webhook URL
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 0 }}>
              ใส่ Webhook URL จาก n8n Cloud ของนาย เพื่อให้เวลากดส่งข้อความในหน้านี้ n8n จะยิงข้อความกลับไปที่ LINE / Facebook
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                n8n Webhook URL (Production / Test):
              </label>
              <input
                type="text"
                placeholder="https://bddevelopment.app.n8n.cloud/webhook/send-chat"
                value={tempWebhookUrl}
                onChange={(e) => setTempWebhookUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-muted)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveSettings}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--blue)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                บันทึกการตั้งค่า
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CHANNELS MANAGEMENT (Multi-Brand LINE OA) ================= */}
      {showChannelsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              background: 'var(--surface)',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  <Radio size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    จัดการเชื่อมต่อ LINE Official Account
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    เพิ่มกี่สิบ LINE ก็ได้ ไม่ต้องเข้าไปแก้ใน n8n อีกต่อไป
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowChannelsModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Existing Channels List */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>LINE OA ที่เชื่อมต่ออยู่ ({channels.length} ช่องทาง)</span>
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {channels.map((ch) => {
                    const webhookUrl = `https://bddevelopment.app.n8n.cloud/webhook/line-inbound?brand=${ch.brand_slug}`;
                    const isCopied = copiedSlug === ch.brand_slug;
                    return (
                      <div
                        key={ch.id}
                        style={{
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {ch.brand_logo ? (
                              <img
                                src={ch.brand_logo}
                                alt={ch.brand_name}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: '2px solid rgba(16, 185, 129, 0.4)',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  background: '#10B981',
                                }}
                              />
                            )}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                  {ch.brand_name}
                                </strong>
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'var(--border)',
                                    color: 'var(--text-secondary)',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  slug: {ch.brand_slug}
                                </span>
                                {ch.channel_id && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                    ID: {ch.channel_id}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Webhook Copy Box */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            ลิงก์ Webhook สำหรับนำไปใส่ใน LINE Developers:
                          </label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              readOnly
                              value={webhookUrl}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => handleCopyWebhook(ch.brand_slug)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: isCopied ? '#10B981' : 'var(--blue)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: 600,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {isCopied ? <Check size={14} /> : <Copy size={14} />}
                              <span>{isCopied ? 'คัดลอกแล้ว!' : 'คัดลอก'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Channel Section */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={16} color="var(--blue)" />
                  <span>เพิ่ม LINE Official Account ใหม่ (+ ต่ออีกกี่แบรนด์ก็ได้)</span>
                </h4>

                {channelError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#EF4444',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      marginBottom: '12px',
                    }}
                  >
                    ⚠️ {channelError}
                  </div>
                )}

                <form onSubmit={handleAddChannel} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                        แพลตฟอร์ม:
                      </label>
                      <select
                        value={newChannelPlatform}
                        onChange={(e) => setNewChannelPlatform(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '8px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface-muted)',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          outline: 'none',
                        }}
                      >
                        <option value="line">🟢 LINE OA</option>
                        <option value="facebook">🔵 Facebook</option>
                        <option value="instagram">🟣 Instagram</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                        ชื่อแบรนด์ / ร้านค้า: *
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น Woodden Official"
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface-muted)',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                        รหัสแบรนด์ (Slug อังกฤษ): *
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น woodden"
                        value={newBrandSlug}
                        onChange={(e) => setNewBrandSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        required
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface-muted)',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          outline: 'none',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      Channel ID (ตัวเลขจาก LINE Developers):
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 201240xxxx"
                      value={newChannelId}
                      onChange={(e) => setNewChannelId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      ลิงก์รูปโลโก้แบรนด์ (Logo URL - ไม่บังคับ):
                    </label>
                    <input
                      type="url"
                      placeholder="https://... วางลิงก์รูปภาพโลโก้แบรนด์"
                      value={newBrandLogo}
                      onChange={(e) => setNewBrandLogo(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      Channel Access Token (Long-lived จาก LINE Developers): *
                    </label>
                    <textarea
                      rows={2}
                      placeholder="วาง Channel access token ยาวๆ ตรงนี้..."
                      value={newChannelToken}
                      onChange={(e) => setNewChannelToken(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        outline: 'none',
                        fontFamily: 'monospace',
                        resize: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      type="submit"
                      disabled={channelSaving}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#10B981',
                        color: '#fff',
                        cursor: channelSaving ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: channelSaving ? 0.7 : 1,
                      }}
                    >
                      <Plus size={16} />
                      <span>{channelSaving ? 'กำลังบันทึก...' : 'บันทึกและเชื่อมต่อ LINE นี้'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(5px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <button
              onClick={() => setPreviewImage(null)}
              title="ปิด (Esc)"
              style={{
                position: 'absolute',
                top: '-42px',
                right: '0',
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.4)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            >
              <X size={20} />
            </button>
            <img
              src={previewImage}
              alt="ภาพขยายขนาดใหญ่"
              referrerPolicy="no-referrer"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                borderRadius: '12px',
                objectFit: 'contain',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
