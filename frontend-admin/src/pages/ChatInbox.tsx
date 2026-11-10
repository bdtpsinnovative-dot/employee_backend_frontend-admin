import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  Lock,

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
  UserCheck,
  AlertCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ChatConversation, ChatMessage, ChatChannel, User, ChatRoutingGroup, ChatAccessUser, ChatSystemConfig } from '../types';
import { fetchUsers, fetchMe } from '../services/adminApi';
import { avatarUrl } from '../components/tasks/taskUtils';
import ChatDistributionModal from '../components/chat/ChatDistributionModal';
import {
  fetchChatRoutingGroups,
  fetchChatAccessUsers,
  hasChatAccess,
  assignConversation,
  pickAgentFromGroup,
  saveChatRoutingGroups,
  fetchChatSystemConfig,
  DEFAULT_CHAT_SYSTEM_CONFIG,
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

// Helper: Extract all assigned agents for a conversation (supports multiple caretakers)
function getConversationAgents(conv?: ChatConversation | null, allUsers: User[] = []): User[] {
  if (!conv) return [];
  const ids = new Set<string>();
  if (Array.isArray(conv.metadata?.assigned_agent_ids)) {
    conv.metadata.assigned_agent_ids.forEach((id: string) => {
      if (id) ids.add(id);
    });
  }
  if (conv.assigned_to) {
    ids.add(conv.assigned_to);
  }
  return Array.from(ids)
    .map((id) => allUsers.find((u) => u.id === id))
    .filter((u): u is User => !!u);
}

export default function ChatInbox() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [routingGroups, setRoutingGroups] = useState<ChatRoutingGroup[]>([]);
  const [accessUsers, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [accessChecked, setAccessChecked] = useState(false);
  const [systemConfig, setSystemConfig] = useState<ChatSystemConfig>(DEFAULT_CHAT_SYSTEM_CONFIG);
  const [isAllowed, setIsAllowed] = useState(true);

  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [isAssigning, setIsAssigning] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [assignModalConv, setAssignModalConv] = useState<ChatConversation | null>(null);
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');

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

  // Mouse drag-to-scroll for Brands bar
  const brandScrollRef = useRef<HTMLDivElement>(null);
  const [isBrandDragging, setIsBrandDragging] = useState(false);
  const brandStartX = useRef(0);
  const brandScrollStart = useRef(0);
  const brandHasDragged = useRef(false);

  const handleBrandMouseDown = (e: React.MouseEvent) => {
    if (!brandScrollRef.current) return;
    setIsBrandDragging(true);
    brandHasDragged.current = false;
    brandStartX.current = e.pageX - brandScrollRef.current.offsetLeft;
    brandScrollStart.current = brandScrollRef.current.scrollLeft;
  };

  const handleBrandMouseMove = (e: React.MouseEvent) => {
    if (!isBrandDragging || !brandScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - brandScrollRef.current.offsetLeft;
    const walk = (x - brandStartX.current) * 1.5;
    if (Math.abs(walk) > 4) {
      brandHasDragged.current = true;
    }
    brandScrollRef.current.scrollLeft = brandScrollStart.current - walk;
  };

  const handleBrandMouseUp = () => {
    setIsBrandDragging(false);
  };

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
        const [meRes, usersRes, groupsRes, accessRes, configRes] = await Promise.all([
          fetchMe().catch(() => null),
          fetchUsers().catch(() => []),
          fetchChatRoutingGroups().catch(() => []),
          fetchChatAccessUsers().catch(() => []),
          fetchChatSystemConfig().catch(() => DEFAULT_CHAT_SYSTEM_CONFIG),
        ]);

        if (!isMounted) return;
        let resolvedMe = meRes;
        if (!resolvedMe) {
          try {
            const { data } = await supabase.auth.getUser();
            if (data?.user && usersRes) {
              resolvedMe = usersRes.find((u) => u.auth_id === data.user.id || u.id === data.user.id || (data.user.email && u.email?.toLowerCase() === data.user.email.toLowerCase())) || null;
            }
          } catch {}
        }
        if (resolvedMe) setCurrentUser(resolvedMe);
        if (usersRes) setUsers(usersRes);
        if (groupsRes) setRoutingGroups(groupsRes);
        if (accessRes) setAccessUsers(accessRes);
        if (configRes) setSystemConfig(configRes);

        const allowed = hasChatAccess(resolvedMe, accessRes || [], groupsRes || []);
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

    // Determine sender UID (id/auth_id), display name and avatar from currentUser
    const senderId = currentUser?.id || null;
    const senderName = currentUser
      ? (currentUser.nickname || currentUser.first_name || `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'แอดมิน')
      : 'แอดมิน';
    const senderAvatar = currentUser?.avatar_url || null;

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      conversation_id: selectedConv.id,
      sender_type: 'agent',
      sender_id: senderId,
      sender_name: senderName,
      sender_avatar: senderAvatar,
      message_type: 'text',
      content,
      created_at: new Date().toISOString(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // 1) Save to Supabase (stores sender_id UID column and metadata)
      const { data: savedMsg, error: dbError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: selectedConv.id,
          sender_type: 'agent',
          sender_id: senderId,
          sender_name: senderName,
          sender_avatar: senderAvatar,
          message_type: 'text',
          content,
          status: 'sent',
          metadata: {
            sender_id: senderId,
            sender_auth_id: currentUser?.auth_id || null,
          },
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Update local state with real message ID
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? (savedMsg as ChatMessage) : m))
      );

      // Update conversation last_message (and auto-assign to responding agent if unassigned)
      const convUpdate: Record<string, any> = {
        last_message: content,
        last_message_at: new Date().toISOString(),
        status: 'active',
      };
      if (systemConfig.auto_assign_first_responder && !selectedConv.assigned_to && currentUser) {
        convUpdate.assigned_to = currentUser.id;
        convUpdate.assigned_name = senderName;
      }

      await supabase
        .from('chat_conversations')
        .update(convUpdate)
        .eq('id', selectedConv.id);

      if (convUpdate.assigned_to) {
        setSelectedConv((prev) => (prev ? { ...prev, ...convUpdate } : null));
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConv.id ? { ...c, ...convUpdate } : c))
        );
      }

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
              sender_id: senderId,
              sender_name: senderName,
              sender_avatar: senderAvatar,
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

  // Toggle an agent on/off for a conversation (supports adding multiple agents)
  const handleToggleAgent = async (conv: ChatConversation, userId: string) => {
    setIsAssigning(true);
    try {
      const currentAgents = getConversationAgents(conv, users);
      const isCurrentlyAssigned = currentAgents.some((a) => a.id === userId);

      let nextAgentIds: string[];
      if (isCurrentlyAssigned) {
        nextAgentIds = currentAgents.filter((a) => a.id !== userId).map((a) => a.id);
      } else {
        nextAgentIds = [...currentAgents.map((a) => a.id), userId];
      }

      const nextAgents = nextAgentIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is User => !!u);
      const nextNames = nextAgents.map((u) => u.nickname || u.first_name);

      const ok = await assignConversation(conv.id, {
        id: nextAgentIds[0] || null,
        name: nextNames.join(', ') || null,
        assignedAgentIds: nextAgentIds,
      });

      if (ok) {
        const updated: ChatConversation = {
          ...conv,
          assigned_to: nextAgentIds[0] || null,
          assigned_name: nextNames.join(', ') || null,
          metadata: {
            ...(conv.metadata || {}),
            assigned_agent_ids: nextAgentIds,
            assigned_name: nextNames.join(', ') || null,
          },
        };
        setConversations((prev) => prev.map((c) => (c.id === conv.id ? updated : c)));
        if (selectedConv?.id === conv.id) {
          setSelectedConv(updated);
        }
        if (assignModalConv?.id === conv.id) {
          setAssignModalConv(updated);
        }
        return true;
      } else {
        alert('อัปเดตคนดูแลไม่สำเร็จ');
        return false;
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    } finally {
      setIsAssigning(false);
    }
  };

  // Clear all agents from a conversation
  const handleClearAllAgents = async (conv: ChatConversation) => {
    setIsAssigning(true);
    try {
      const ok = await assignConversation(conv.id, {
        id: null,
        name: null,
        assignedAgentIds: [],
      });
      if (ok) {
        const updated: ChatConversation = {
          ...conv,
          assigned_to: null,
          assigned_name: null,
          metadata: {
            ...(conv.metadata || {}),
            assigned_agent_ids: [],
            assigned_name: null,
            assigned_group_id: null,
            assigned_group_name: null,
          },
        };
        setConversations((prev) => prev.map((c) => (c.id === conv.id ? updated : c)));
        if (selectedConv?.id === conv.id) {
          setSelectedConv(updated);
        }
        if (assignModalConv?.id === conv.id) {
          setAssignModalConv(updated);
        }
        return true;
      }
      return false;
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    } finally {
      setIsAssigning(false);
    }
  };

  // General assign handler for any conversation (from list cell or detail header)
  const handleAssignConversation = async (conv: ChatConversation, targetUser: User | null) => {
    setIsAssigning(true);
    try {
      const agentName = targetUser ? (targetUser.nickname || targetUser.first_name) : null;
      const ok = await assignConversation(conv.id, {
        id: targetUser ? targetUser.id : null,
        name: agentName || undefined,
        avatar: targetUser?.avatar_url,
      });
      if (ok) {
        const updated: ChatConversation = {
          ...conv,
          assigned_to: targetUser ? targetUser.id : null,
          assigned_name: agentName,
          metadata: {
            ...(conv.metadata || {}),
            assigned_group_id: null,
            assigned_group_name: null,
            assigned_agent_ids: targetUser ? [targetUser.id] : [],
          },
        };
        setConversations((prev) => prev.map((c) => (c.id === conv.id ? updated : c)));
        if (selectedConv?.id === conv.id) {
          setSelectedConv(updated);
        }
        if (assignModalConv?.id === conv.id) {
          setAssignModalConv(updated);
        }
        return true;
      } else {
        alert('อัปเดตผู้ดูแลไม่สำเร็จ');
        return false;
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    } finally {
      setIsAssigning(false);
    }
  };

  // General random assign handler for any conversation (with fallback to authorized chat agents)
  const handleRandomAssignConversation = async (conv: ChatConversation) => {
    setIsAssigning(true);
    try {
      const convBrand = (conv.brand || '').toLowerCase().trim();
      let group = routingGroups.find(
        (g) => g.is_active && g.brand.toLowerCase() === convBrand && g.agent_ids.length > 0
      );
      if (!group) {
        group = routingGroups.find((g) => g.is_active && g.brand === 'all' && g.agent_ids.length > 0);
      }

      let pickAgentId: string | null = null;
      let pickAgentName: string = 'แอดมิน';
      let pickAvatarUrl: string | undefined = undefined;
      let updatedGroupToSave: ChatRoutingGroup | null = null;

      if (group) {
        const pick = pickAgentFromGroup(group, users);
        if (pick) {
          pickAgentId = pick.agentId;
          const assignedUser = users.find((u) => u.id === pick.agentId);
          pickAgentName = assignedUser ? (assignedUser.nickname || assignedUser.first_name) : 'แอดมิน';
          pickAvatarUrl = assignedUser?.avatar_url;
          if (pick.updatedGroup.last_assigned_index !== group.last_assigned_index) {
            updatedGroupToSave = pick.updatedGroup;
          }
        }
      }

      // If no routing group is configured yet for this brand, fallback to randomly picking from authorized users
      if (!pickAgentId) {
        const authorized = users.filter((u) => hasChatAccess(u, accessUsers, routingGroups));
        if (authorized.length > 0) {
          const randomAgent = authorized[Math.floor(Math.random() * authorized.length)];
          pickAgentId = randomAgent.id;
          pickAgentName = randomAgent.nickname || randomAgent.first_name;
          pickAvatarUrl = randomAgent.avatar_url;
        }
      }

      if (!pickAgentId) {
        alert(
          `ยังไม่มีรายชื่อผู้ได้รับอนุญาตใช้งานระบบแชทสำหรับแบรนด์ "${conv.brand || 'ทั่วไป'}"\nกรุณาไปที่เมนู "ตั้งค่าช่องทางแชท" เพื่อกำหนดสิทธิ์หรือสร้างกลุ่มแอดมินครับ`
        );
        return false;
      }

      const ok = await assignConversation(conv.id, {
        id: pickAgentId,
        name: pickAgentName,
        avatar: pickAvatarUrl,
        groupId: group?.id || null,
        groupName: group?.name || null,
        assignedAgentIds: group?.agent_ids || (pickAgentId ? [pickAgentId] : []),
      });

      if (ok) {
        const updated: ChatConversation = {
          ...conv,
          assigned_to: pickAgentId,
          assigned_name: pickAgentName,
          metadata: {
            ...(conv.metadata || {}),
            assigned_group_id: group?.id || null,
            assigned_group_name: group?.name || null,
            assigned_agent_ids: group?.agent_ids || (pickAgentId ? [pickAgentId] : []),
          },
        };
        setConversations((prev) => prev.map((c) => (c.id === conv.id ? updated : c)));
        if (selectedConv?.id === conv.id) {
          setSelectedConv(updated);
        }
        if (assignModalConv?.id === conv.id) {
          setAssignModalConv(updated);
        }

        // Save round-robin index pointer if updated
        if (updatedGroupToSave) {
          const updatedGroups = routingGroups.map((g) =>
            g.id === updatedGroupToSave!.id ? updatedGroupToSave! : g
          );
          setRoutingGroups(updatedGroups);
          void saveChatRoutingGroups(updatedGroups);
        }
        return true;
      } else {
        alert('มอบหมายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return false;
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการสุ่มผู้ดูแล: ' + err.message);
      return false;
    } finally {
      setIsAssigning(false);
    }
  };

  // General group assign handler for any conversation
  const handleAssignConversationGroup = async (conv: ChatConversation, targetGroup: ChatRoutingGroup | null) => {
    if (!targetGroup) {
      return await handleAssignConversation(conv, null);
    }
    setIsAssigning(true);
    try {
      const ok = await assignConversation(conv.id, {
        id: targetGroup.agent_ids[0] || null,
        name: `กลุ่ม: ${targetGroup.name}`,
        groupId: targetGroup.id,
        groupName: targetGroup.name,
        assignedAgentIds: targetGroup.agent_ids,
      });

      if (ok) {
        const updated: ChatConversation = {
          ...conv,
          assigned_to: targetGroup.agent_ids[0] || null,
          assigned_name: `กลุ่ม: ${targetGroup.name}`,
          metadata: {
            ...(conv.metadata || {}),
            assigned_group_id: targetGroup.id,
            assigned_group_name: targetGroup.name,
            assigned_agent_ids: targetGroup.agent_ids,
          },
        };
        setConversations((prev) => prev.map((c) => (c.id === conv.id ? updated : c)));
        if (selectedConv?.id === conv.id) {
          setSelectedConv(updated);
        }
        if (assignModalConv?.id === conv.id) {
          setAssignModalConv(updated);
        }
        return true;
      } else {
        alert('มอบหมายกลุ่มไม่สำเร็จ');
        return false;
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    } finally {
      setIsAssigning(false);
    }
  };

  // Random assign handler
  const handleRandomAssign = async () => {
    if (!selectedConv) return;
    await handleRandomAssignConversation(selectedConv);
  };

  // Manual assign handler
  const handleManualAssign = async (targetUser: User | null) => {
    if (!selectedConv) return;
    setShowAssignDropdown(false);
    await handleAssignConversation(selectedConv, targetUser);
  };

  // Assign to an entire care group (1 customer cared for by multiple sales agents)
  const handleAssignGroup = async (targetGroup: ChatRoutingGroup | null) => {
    if (!selectedConv) return;
    setShowAssignDropdown(false);
    await handleAssignConversationGroup(selectedConv, targetGroup);
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

    const isMine =
      c.assigned_to === currentUser?.id ||
      (Array.isArray(c.metadata?.assigned_agent_ids) && c.metadata.assigned_agent_ids.includes(currentUser?.id)) ||
      (c.metadata?.assigned_group_id && routingGroups.some((g) => g.id === c.metadata?.assigned_group_id && g.agent_ids.includes(currentUser?.id || '')));

    const matchesAssign =
      assignFilter === 'all'
        ? true
        : assignFilter === 'mine'
        ? isMine
        : !c.assigned_to && !c.metadata?.assigned_group_id;

    return matchesSearch && matchesPlatform && matchesStatus && matchesBrand && matchesAssign;
  });

  const activeUnreadTotal = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const myChatsCount = conversations.filter((c) =>
    c.assigned_to === currentUser?.id ||
    (Array.isArray(c.metadata?.assigned_agent_ids) && c.metadata.assigned_agent_ids.includes(currentUser?.id)) ||
    (c.metadata?.assigned_group_id && routingGroups.some((g) => g.id === c.metadata?.assigned_group_id && g.agent_ids.includes(currentUser?.id || '')))
  ).length;
  const unassignedChatsCount = conversations.filter((c) => !c.assigned_to && !c.metadata?.assigned_group_id).length;

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
          {/* Search & Filters (Clean, Ultra-Compact & Modern) */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Row 1: Compact Search & Quick Tools */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  height: '32px',
                  boxSizing: 'border-box',
                }}
              >
                <Search size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
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
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Settings Shortcut for Admin */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => navigate('/chat-settings')}
                  title="ตั้งค่าระบบแชท, จัดกลุ่มสุ่มแอดมิน & สิทธิ์เข้าใช้งาน"
                  style={{
                    width: '32px',
                    height: '32px',
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
                  <SettingsIcon size={15} />
                </button>
              )}

              {/* Sound Toggle Icon Button */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'เสียงแจ้งเตือน: เปิดอยู่ (คลิกเพื่อปิด)' : 'เสียงแจ้งเตือน: ปิดอยู่ (คลิกเพื่อเปิด)'}
                style={{
                  width: '32px',
                  height: '32px',
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
                {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>

            {/* Row 2: Assignment Segmented Control (ทั้งหมด / ของฉัน / รอจ่ายงาน) - สวย ไม่ตกบรรทัด! */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--surface-muted, #F1F5F9)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '2.5px',
                gap: '2px',
              }}
            >
              {[
                { key: 'all', label: 'ทั้งหมด', count: conversations.length, icon: null },
                { key: 'mine', label: 'ของฉัน', count: myChatsCount, icon: <UserCheck size={12} /> },
                { key: 'unassigned', label: 'รอจ่ายงาน', count: unassignedChatsCount, icon: <AlertCircle size={12} /> },
              ].map((tab) => {
                const isActive = assignFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setAssignFilter(tab.key as any)}
                    style={{
                      flex: 1,
                      padding: '4px 4px',
                      fontSize: '0.72rem',
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface, #FFFFFF)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      minHeight: '26px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.icon && (
                      <span style={{ color: isActive ? 'var(--blue)' : 'inherit', display: 'flex' }}>
                        {tab.icon}
                      </span>
                    )}
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '0.5px 5px',
                          borderRadius: '10px',
                          background:
                            tab.key === 'unassigned'
                              ? isActive
                                ? '#F59E0B'
                                : '#FEF3C7'
                              : tab.key === 'mine'
                              ? isActive
                                ? 'var(--blue)'
                                : '#DBEAFE'
                              : isActive
                              ? 'var(--border)'
                              : 'rgba(0,0,0,0.06)',
                          color:
                            tab.key === 'unassigned'
                              ? isActive
                                ? '#FFFFFF'
                                : '#B45309'
                              : tab.key === 'mine'
                              ? isActive
                                ? '#FFFFFF'
                                : '#1D4ED8'
                              : 'var(--text-secondary)',
                          lineHeight: '13px',
                          minWidth: '14px',
                          textAlign: 'center',
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row 3: Status Quick Filter Chips (ยังไม่อ่าน / เปิดอยู่ / ปิดเคสแล้ว / ทั้งหมด) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.68rem',
              }}
            >
              {[
                {
                  key: 'unread',
                  label: 'ยังไม่อ่าน',
                  count: activeUnreadTotal,
                  dot: '#EF4444',
                },
                { key: 'active', label: 'เปิดอยู่' },
                { key: 'resolved', label: 'ปิดเคสแล้ว' },
                { key: 'all', label: 'ทั้งหมด' },
              ].map((st) => {
                const isSelected = statusFilter === st.key;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStatusFilter(st.key as any)}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '12px',
                      fontSize: '0.67rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      border: isSelected
                        ? st.key === 'unread'
                          ? '1px solid #FDA4AF'
                          : '1px solid var(--border)'
                        : '1px solid transparent',
                      background: isSelected
                        ? st.key === 'unread'
                          ? '#FFE4E6'
                          : 'var(--surface)'
                        : 'transparent',
                      color:
                        st.key === 'unread' && (isSelected || (st.count && st.count > 0))
                          ? '#E11D48'
                          : isSelected
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
                      boxShadow: isSelected ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                      transition: 'all 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {st.dot && (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: st.dot,
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span>{st.label}</span>
                    {st.count !== undefined && st.count > 0 && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '0 4px',
                          borderRadius: '8px',
                          background: isSelected ? '#E11D48' : '#FECDD3',
                          color: isSelected ? '#FFFFFF' : '#9F1239',
                          lineHeight: '12px',
                        }}
                      >
                        {st.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Batch Random Distribution Action Button */}
            {unassignedChatsCount > 0 && (
              <button
                type="button"
                onClick={() => setShowDistributionModal(true)}
                style={{
                  width: '100%',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                  marginTop: '2px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Shuffle size={12} />
                <span>🎲 สุ่มกระจายลูกค้าให้เซลล์ ({unassignedChatsCount})</span>
              </button>
            )}

            {/* Row 4: Channels (LINE / FB / IG) - ชั้นที่ 1 พอดีจอ สบายตา */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '1px 0',
              }}
            >
              <button
                type="button"
                onClick={() => setPlatformFilter('all')}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.66rem',
                  fontWeight: platformFilter === 'all' ? 700 : 500,
                  borderRadius: '12px',
                  border: platformFilter === 'all' ? '1px solid var(--blue)' : '1px solid var(--border)',
                  background: platformFilter === 'all' ? 'var(--blue)' : 'var(--surface)',
                  color: platformFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                title="ทุกช่องทาง (All Channels)"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPlatformFilter(platformFilter === 'line' ? 'all' : 'line')}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.66rem',
                  fontWeight: platformFilter === 'line' ? 700 : 500,
                  borderRadius: '12px',
                  border: platformFilter === 'line' ? '1px solid #06C755' : '1px solid var(--border)',
                  background: platformFilter === 'line' ? '#ECFDF5' : 'var(--surface)',
                  color: platformFilter === 'line' ? '#047857' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  transition: 'all 0.15s ease',
                }}
              >
                <LineIcon size={11} />
                <span>LINE</span>
              </button>
              <button
                type="button"
                onClick={() => setPlatformFilter(platformFilter === 'facebook' ? 'all' : 'facebook')}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.66rem',
                  fontWeight: platformFilter === 'facebook' ? 700 : 500,
                  borderRadius: '12px',
                  border: platformFilter === 'facebook' ? '1px solid #0084FF' : '1px solid var(--border)',
                  background: platformFilter === 'facebook' ? '#EFF6FF' : 'var(--surface)',
                  color: platformFilter === 'facebook' ? '#1D4ED8' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  transition: 'all 0.15s ease',
                }}
              >
                <FacebookIcon size={11} />
                <span>FB</span>
              </button>
              <button
                type="button"
                onClick={() => setPlatformFilter(platformFilter === 'instagram' ? 'all' : 'instagram')}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.66rem',
                  fontWeight: platformFilter === 'instagram' ? 700 : 500,
                  borderRadius: '12px',
                  border: platformFilter === 'instagram' ? '1px solid #E1306C' : '1px solid var(--border)',
                  background: platformFilter === 'instagram' ? '#FDF2F8' : 'var(--surface)',
                  color: platformFilter === 'instagram' ? '#BE185D' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  transition: 'all 0.15s ease',
                }}
              >
                <InstagramIcon size={11} />
                <span>IG</span>
              </button>
            </div>

            {/* Row 5: Brands - ชั้นที่ 2 คลิกลากเมาส์ได้ (Drag to Scroll) และหมุนล้อเมาส์ได้ */}
            <div
              ref={brandScrollRef}
              onMouseDown={handleBrandMouseDown}
              onMouseMove={handleBrandMouseMove}
              onMouseUp={handleBrandMouseUp}
              onMouseLeave={handleBrandMouseUp}
              onWheel={(e) => {
                if (e.deltaY !== 0 && brandScrollRef.current) {
                  brandScrollRef.current.scrollLeft += e.deltaY * 0.9;
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                cursor: isBrandDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                paddingBottom: '2px',
              }}
              title="คลิกแล้วลากเมาส์ซ้าย-ขวา หรือหมุนล้อเมาส์เพื่อดูแบรนด์ทั้งหมด"
            >
              <button
                type="button"
                onClick={(e) => {
                  if (brandHasDragged.current) {
                    e.preventDefault();
                    return;
                  }
                  setBrandFilter('all');
                }}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.66rem',
                  fontWeight: brandFilter === 'all' ? 700 : 500,
                  borderRadius: '12px',
                  border: brandFilter === 'all' ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                  background: brandFilter === 'all' ? 'var(--border-strong)' : 'var(--surface)',
                  color: brandFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                  cursor: isBrandDragging ? 'grabbing' : 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                title="ทุกแบรนด์ (All Brands)"
              >
                All
              </button>

              {Array.from(new Map(channels.map((ch) => [ch.brand_slug.toLowerCase(), ch])).values()).map((ch) => {
                const isActive = brandFilter.toLowerCase() === ch.brand_slug.toLowerCase();
                const bInfo = getBrandDisplay(ch.brand_slug, channels);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={(e) => {
                      if (brandHasDragged.current) {
                        e.preventDefault();
                        return;
                      }
                      setBrandFilter(isActive ? 'all' : ch.brand_slug);
                    }}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      borderRadius: '12px',
                      border: isActive ? `1.5px solid ${bInfo.bg}` : '1px solid var(--border)',
                      background: isActive ? `${bInfo.bg}15` : 'var(--surface)',
                      color: bInfo.bg,
                      cursor: isBrandDragging ? 'grabbing' : 'pointer',
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      transition: 'all 0.15s ease',
                    }}
                    title={ch.brand_name}
                  >
                    {bInfo.logo && (
                      <img
                        src={bInfo.logo}
                        alt=""
                        style={{ width: '11px', height: '11px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    )}
                    <span>{bInfo.shortLabel}</span>
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
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  color: bInfo.bg,
                                  flexShrink: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                {bInfo.logo && (
                                  <img
                                    src={bInfo.logo}
                                    alt=""
                                    style={{ width: '12px', height: '12px', borderRadius: '50%', objectFit: 'cover' }}
                                  />
                                )}
                                <span>{bInfo.shortLabel}</span>
                              </span>
                            );
                          })()}

                          {/* Assigned Agent or Care Group Badge (Supports multiple caretakers) */}
                          {(() => {
                            const cellAgents = getConversationAgents(conv, users);
                            const isMine = cellAgents.some((a) => a.id === currentUser?.id);
                            if (cellAgents.length > 0) {
                              return (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignModalConv(conv);
                                  }}
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: isMine ? '#DBEAFE' : 'var(--surface)',
                                    color: isMine ? '#1D4ED8' : 'var(--text-secondary)',
                                    border: '1px solid var(--border)',
                                    flexShrink: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    cursor: 'pointer',
                                  }}
                                  title={`ผู้ดูแล (${cellAgents.length} คน): ${cellAgents.map((a) => a.nickname || a.first_name).join(', ')} (คลิกเพื่อจัดการ)`}
                                >
                                  {cellAgents.length > 1 ? (
                                    <>👥 {cellAgents.map((a) => a.nickname || a.first_name).join(', ')}</>
                                  ) : (
                                    <>👤 {cellAgents[0].nickname || cellAgents[0].first_name}</>
                                  )}
                                </span>
                              );
                            }
                            return (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignModalConv(conv);
                                }}
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 600,
                                  padding: '1px 4px',
                                  borderRadius: '4px',
                                  background: '#FEF3C7',
                                  color: '#B45309',
                                  border: '1px solid #FDE68A',
                                  flexShrink: 0,
                                  cursor: 'pointer',
                                }}
                                title="ยังไม่มีผู้ดูแล (คลิกเพื่อเพิ่มคนดูแล)"
                              >
                                ว่าง
                              </span>
                            );
                          })()}
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
                            maxWidth: '170px',
                            flex: 1,
                            marginRight: '6px',
                          }}
                        >
                          {conv.last_message || 'เริ่มการสนทนา'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
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

                          {/* วงกลมคนดูแล อยู่ใต้สุดของแต่ละเซลล์ (Bottom Right) รองรับหลายคน (Avatar Stack) */}
                          {(() => {
                            const cellAgents = getConversationAgents(conv, users);
                            if (cellAgents.length === 0) {
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignModalConv(conv);
                                  }}
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: '1.5px dashed #94A3B8',
                                    background: 'rgba(148, 163, 184, 0.08)',
                                    color: '#64748B',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0,
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#3B82F6';
                                    e.currentTarget.style.color = '#2563EB';
                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                    e.currentTarget.style.transform = 'scale(1.12)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#94A3B8';
                                    e.currentTarget.style.color = '#64748B';
                                    e.currentTarget.style.background = 'rgba(148, 163, 184, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  title="ยังไม่มีคนดูแล (คลิกเพื่อเพิ่มคนดูแลลูกค้า)"
                                >
                                  <Plus size={12} strokeWidth={2.4} />
                                </button>
                              );
                            }

                            if (cellAgents.length === 1) {
                              const ag = cellAgents[0];
                              const agName = ag.nickname || ag.first_name;
                              const agAvatar = ag.avatar_url ? avatarUrl(ag.avatar_url) : null;
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignModalConv(conv);
                                  }}
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: '2px solid var(--surface, #ffffff)',
                                    outline: '1.5px solid var(--border, #E2E8F0)',
                                    background: '#3B82F6',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0,
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                    flexShrink: 0,
                                    transition: 'transform 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.12)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                  title={`ผู้ดูแล: ${agName} (คลิกเพื่อเพิ่ม/จัดการคนดูแล)`}
                                >
                                  {agAvatar ? (
                                    <img src={agAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <span style={{ fontSize: '10px', fontWeight: 800 }}>
                                      {agName.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </button>
                              );
                            }

                            // Multiple caretakers: Avatar Stack
                            const STACK_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'];
                            return (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignModalConv(conv);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  padding: '1px',
                                  borderRadius: '16px',
                                  transition: 'transform 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                title={`ผู้ดูแล (${cellAgents.length} คน): ${cellAgents.map((a) => a.nickname || a.first_name).join(', ')} (คลิกเพื่อเพิ่ม/จัดการคนดูแล)`}
                              >
                                {cellAgents.slice(0, 3).map((ag, idx) => {
                                  const agAvatar = ag.avatar_url ? avatarUrl(ag.avatar_url) : null;
                                  const agName = ag.nickname || ag.first_name;
                                  return (
                                    <div
                                      key={ag.id}
                                      style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        border: '2px solid var(--surface, #ffffff)',
                                        outline: '1.5px solid var(--border, #E2E8F0)',
                                        background: STACK_COLORS[idx % STACK_COLORS.length],
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        marginLeft: idx > 0 ? '-8px' : 0,
                                        zIndex: 3 - idx,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {agAvatar ? (
                                        <img src={agAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        <span style={{ fontSize: '9px', fontWeight: 800 }}>
                                          {agName.charAt(0).toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                                {cellAgents.length > 3 && (
                                  <div
                                    style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      border: '2px solid var(--surface, #ffffff)',
                                      background: '#475569',
                                      color: '#ffffff',
                                      fontSize: '9px',
                                      fontWeight: 800,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginLeft: '-8px',
                                      zIndex: 0,
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                      flexShrink: 0,
                                    }}
                                  >
                                    +{cellAgents.length - 3}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
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
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: bInfo.bg,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {bInfo.logo && (
                            <img
                              src={bInfo.logo}
                              alt=""
                              style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }}
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

                              {/* Active Care Groups Section */}
                              {routingGroups.filter((g) => g.is_active && g.agent_ids.length > 0).length > 0 && (
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '4px', marginBottom: '4px' }}>
                                  <div
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      color: '#4F46E5',
                                    }}
                                  >
                                    👥 มอบหมายกลุ่มดูแลลูกค้า
                                  </div>
                                  {routingGroups.filter((g) => g.is_active && g.agent_ids.length > 0).map((grp) => {
                                    const isGrpSelected = selectedConv.metadata?.assigned_group_id === grp.id;
                                    return (
                                      <div
                                        key={grp.id}
                                        onClick={() => void handleAssignGroup(grp)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: '6px',
                                          fontSize: '0.8rem',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          background: isGrpSelected ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                                          color: isGrpSelected ? '#4F46E5' : 'var(--text-primary)',
                                          fontWeight: isGrpSelected ? 700 : 500,
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <Users size={14} color="#4F46E5" />
                                          <span>{grp.name} ({grp.agent_ids.length} คนดูแล)</span>
                                        </div>
                                        {isGrpSelected && <Check size={14} />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Individual Staff list */}
                              <div
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                👤 มอบหมายรายบุคคล (เซลล์/ผู้ดูแล)
                              </div>
                              {users.filter(u => u.role !== 'admin' && hasChatAccess(u, accessUsers, routingGroups)).map((u) => {
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

                  let agentDisplayName = 'แอดมิน';
                  let agentAvatarUrl: string | null = null;
                  
                  if (isAgent) {
                    if (msg.sender_type === 'bot') {
                      agentDisplayName = 'AI Bot';
                    } else {
                      // 1. PRIMARY: Match by sender_id (UID) directly from users!
                      const effectiveSenderId = msg.sender_id || (msg.metadata && msg.metadata.sender_id);
                      let senderUser: User | undefined;

                      if (effectiveSenderId) {
                        senderUser = users.find((u) => u.id === effectiveSenderId || u.auth_id === effectiveSenderId);
                      }

                      if (senderUser) {
                        // Dynamically use live user details from UID (nickname / first name / avatar)
                        agentDisplayName = senderUser.nickname || senderUser.first_name || `${senderUser.first_name || ''} ${senderUser.last_name || ''}`.trim() || 'แอดมิน';
                        agentAvatarUrl = senderUser.avatar_url || null;
                        
                      } else {
                        // 2. FALLBACK for legacy messages without UID:
                        if (msg.sender_name && msg.sender_name.trim() !== '' && msg.sender_name !== 'แอดมิน') {
                          agentDisplayName = msg.sender_name;
                          senderUser = users.find(
                            (u) =>
                              (u.nickname && u.nickname === msg.sender_name) ||
                              u.first_name === msg.sender_name ||
                              `${u.first_name} ${u.last_name}`.trim() === msg.sender_name
                          );
                          if (senderUser) agentAvatarUrl = senderUser.avatar_url || null;
                        } else if (selectedConv.assigned_to) {
                          senderUser = users.find((u) => u.id === selectedConv.assigned_to);
                          if (senderUser) {
                            agentDisplayName = senderUser.nickname || senderUser.first_name || 'แอดมิน';
                            agentAvatarUrl = senderUser.avatar_url || null;
                          }
                        } else if (selectedConv.assigned_name) {
                          agentDisplayName = selectedConv.assigned_name;
                        }

                        if (msg.sender_avatar && !agentAvatarUrl) {
                          agentAvatarUrl = msg.sender_avatar;
                        }


                      }
                    }
                  }

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end',
                        gap: '6px',
                        marginBottom: '8px',
                      }}
                    >
                      {/* Customer Avatar & Platform on the Left (for incoming messages) */}
                      {!isAgent && (
                        <div
                          title={`ลูกค้า: ${selectedConv.customer_name} (ช่องทาง: ${
                            selectedConv.platform === 'line' ? 'LINE OA' : selectedConv.platform === 'facebook' ? 'Facebook' : 'Instagram'
                          })`}
                          style={{
                            position: 'relative',
                            width: '28px',
                            height: '28px',
                            flexShrink: 0,
                            marginBottom: '16px',
                            cursor: 'pointer',
                          }}
                        >
                          {selectedConv.customer_avatar ? (
                            <img
                              src={selectedConv.customer_avatar}
                              alt={selectedConv.customer_name}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '1.5px solid var(--border)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background:
                                  selectedConv.platform === 'line'
                                    ? '#D1FAE5'
                                    : selectedConv.platform === 'facebook'
                                    ? '#DBEAFE'
                                    : '#FCE7F3',
                                color:
                                  selectedConv.platform === 'line'
                                    ? '#065F46'
                                    : selectedConv.platform === 'facebook'
                                    ? '#1E40AF'
                                    : '#9D174D',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                border: '1.5px solid var(--border)',
                              }}
                            >
                              {(selectedConv.customer_name || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}

                          {/* Platform Mini Badge on Avatar corner */}
                          <div
                            title={`ช่องทาง: ${
                              selectedConv.platform === 'line' ? 'LINE OA' : selectedConv.platform === 'facebook' ? 'Facebook' : 'Instagram'
                            }`}
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              right: '-3px',
                              width: '14px',
                              height: '14px',
                              borderRadius: '50%',
                              background: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                            }}
                          >
                            {selectedConv.platform === 'line' && <LineIcon size={11} />}
                            {selectedConv.platform === 'facebook' && <FacebookIcon size={11} />}
                            {selectedConv.platform === 'instagram' && <InstagramIcon size={11} />}
                          </div>
                        </div>
                      )}

                      {/* Message Bubble Column */}
                      <div
                        style={{
                          maxWidth: '70%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isAgent ? 'flex-end' : 'flex-start',
                        }}
                      >
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

                        {/* Timestamp & Platform Tag */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '2px',
                            fontSize: '0.65rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {msg.status === 'sending' && ' (กำลังส่ง...)'}
                          </span>

                          {!isAgent && (
                            <span
                              title={`ข้อความจาก ${
                                selectedConv.platform === 'line' ? 'LINE OA' : selectedConv.platform === 'facebook' ? 'Facebook' : 'Instagram'
                              }`}
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                padding: '0 4px',
                                borderRadius: '3px',
                                background:
                                  selectedConv.platform === 'line'
                                    ? '#ECFDF5'
                                    : selectedConv.platform === 'facebook'
                                    ? '#EFF6FF'
                                    : '#FDF2F8',
                                color:
                                  selectedConv.platform === 'line'
                                    ? '#047857'
                                    : selectedConv.platform === 'facebook'
                                    ? '#1D4ED8'
                                    : '#BE185D',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                              }}
                            >
                              {selectedConv.platform === 'line' && <LineIcon size={9} />}
                              {selectedConv.platform === 'facebook' && <FacebookIcon size={9} />}
                              {selectedConv.platform === 'instagram' && <InstagramIcon size={9} />}
                              <span>{selectedConv.platform === 'line' ? 'LINE' : selectedConv.platform === 'facebook' ? 'FB' : 'IG'}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Outgoing Agent Avatar (ต่อหลังกล่องข้อความ พร้อม hover แสดงชื่อผู้ตอบ) */}
                      {isAgent && (
                        <div
                          title={agentDisplayName}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            flexShrink: 0,
                            marginBottom: '16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {agentAvatarUrl ? (
                            <img
                              src={avatarUrl(agentAvatarUrl) || ''}
                              alt={agentDisplayName}
                              title={agentDisplayName}
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '1.5px solid #fff',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                              }}
                            />
                          ) : (
                            <div
                              title={agentDisplayName}
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                boxShadow: '0 1px 3px rgba(59, 130, 246, 0.35)',
                                border: '1.5px solid #fff',
                              }}
                            >
                              {msg.sender_type === 'bot' ? '🤖' : (agentDisplayName || 'A').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}
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

            {/* Bottom Input Area or Locked Notice based on Reply Policy */}
            {(() => {
              const canReply = (() => {
                if (!selectedConv) return false;
                if (currentUser?.role === 'admin') return true;
                if (systemConfig.reply_policy === 'everyone') return true;

                if (selectedConv.assigned_to === currentUser?.id) return true;
                if (Array.isArray(selectedConv.metadata?.assigned_agent_ids) && selectedConv.metadata.assigned_agent_ids.includes(currentUser?.id)) return true;
                if (selectedConv.metadata?.assigned_group_id && routingGroups.some((g) => g.id === selectedConv.metadata?.assigned_group_id && g.agent_ids.includes(currentUser?.id || ''))) return true;

                if (!selectedConv.assigned_to && !selectedConv.metadata?.assigned_group_id) return true;

                return false;
              })();

              if (!canReply) {
                return (
                  <div
                    style={{
                      padding: '14px 18px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--surface-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      <Lock size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
                      <span>
                        🔒 แชทนี้อยู่ในความดูแลของ <b>{selectedConv.assigned_name || 'เซลล์ท่านอื่น'}</b> (ระบบล็อกเฉพาะผู้ดูแลพิมพ์ตอบ)
                      </span>
                    </div>
                    <button
                      onClick={() => void handleManualAssign(currentUser)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--blue)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      ✋ ขอรับเคสนี้เป็นคนดูแล
                    </button>
                  </div>
                );
              }

              return (
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
              );
            })()}
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

      {/* ================= MODAL: มอบหมาย / เพิ่มคนดูแลลูกค้า (รองรับหลายคน) ================= */}
      {assignModalConv && (() => {
        const modalAgents = getConversationAgents(assignModalConv, users);
        const modalAgentIds = new Set(modalAgents.map((a) => a.id));
        const isMeAssigned = currentUser ? modalAgentIds.has(currentUser.id) : false;

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(3px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => {
              setAssignModalConv(null);
              setAssignSearch('');
            }}
          >
            <div
              style={{
                background: 'var(--surface, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '480px',
                maxHeight: '88vh',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border, #E2E8F0)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border, #E2E8F0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-muted, #F8FAFC)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#3B82F6',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {assignModalConv.customer_avatar ? (
                      <img
                        src={assignModalConv.customer_avatar}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      assignModalConv.customer_name.charAt(0).toUpperCase() || 'C'
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {assignModalConv.customer_name}
                      </h3>
                      {(() => {
                        const bInfo = getBrandDisplay(assignModalConv.brand, channels);
                        return (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: bInfo.bg,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(0,0,0,0.05)',
                              flexShrink: 0,
                            }}
                          >
                            {bInfo.shortLabel}
                          </span>
                        );
                      })()}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #64748B)' }}>
                      จัดการคนดูแลลูกค้ารายนี้ (เลือกเพิ่มได้หลายคน)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAssignModalConv(null);
                    setAssignSearch('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary, #64748B)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Current Caretakers Pills Section */}
              <div
                style={{
                  padding: '12px 20px',
                  background: modalAgents.length > 0 ? '#EFF6FF' : '#FEF3C7',
                  borderBottom: '1px solid var(--border, #E2E8F0)',
                }}
              >
                {modalAgents.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1D4ED8' }}>
                        👥 ผู้ดูแลที่เลือกแล้ว ({modalAgents.length} คน):
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleClearAllAgents(assignModalConv)}
                        disabled={isAssigning}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '5px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          cursor: isAssigning ? 'not-allowed' : 'pointer',
                        }}
                        title="นำคนดูแลทั้งหมดออก"
                      >
                        ✕ นำออกทั้งหมด
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {modalAgents.map((ag) => (
                        <span
                          key={ag.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 10px',
                            borderRadius: '16px',
                            background: '#DBEAFE',
                            color: '#1D4ED8',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            border: '1px solid #BFDBFE',
                            boxShadow: '0 1px 2px rgba(29, 78, 216, 0.08)',
                          }}
                        >
                          {ag.avatar_url ? (
                            <img src={avatarUrl(ag.avatar_url)!} alt="" style={{ width: '15px', height: '15px', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <span>👤</span>
                          )}
                          <span>{ag.nickname || ag.first_name}</span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await handleToggleAgent(assignModalConv, ag.id);
                            }}
                            disabled={isAssigning}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '1px',
                              color: '#1D4ED8',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '50%',
                            }}
                            title="นำคนนี้ออก"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.82rem', color: '#B45309', fontWeight: 600 }}>
                    ⚠️ สถานะ: ยังไม่มีคนดูแลลูกค้าคนนี้ (สามารถคลิกเลือกเพิ่มด้านล่างได้มากกว่า 1 คน)
                  </div>
                )}
              </div>

              {/* Quick Action Shortcuts */}
              <div style={{ padding: '10px 20px 6px', display: 'flex', gap: '8px' }}>
                {/* Assign / Toggle Me Button */}
                {currentUser && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleToggleAgent(assignModalConv, currentUser.id);
                    }}
                    disabled={isAssigning}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: '1px solid #3B82F6',
                      background: isMeAssigned ? '#EFF6FF' : '#3B82F6',
                      color: isMeAssigned ? '#1D4ED8' : '#ffffff',
                      cursor: isAssigning ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>👤</span>
                    <span>{isMeAssigned ? '✓ ฉันดูแลอยู่ (คลิกนำออก)' : '+ ฉันดูแลด้วย'}</span>
                  </button>
                )}

                {/* Auto Random Round-Robin or Add 1 Agent Button */}
                <button
                  type="button"
                  onClick={async () => {
                    const authorized = users.filter((u) => u.role !== 'admin' && hasChatAccess(u, accessUsers, routingGroups));
                    const remaining = authorized.filter((u) => !modalAgentIds.has(u.id));
                    if (remaining.length === 0) {
                      alert('เซลล์/ทีมงานที่ได้รับอนุญาตทุกคนกำลังดูแลลูกค้ารายนี้อยู่แล้วครับ');
                      return;
                    }
                    const pick = remaining[Math.floor(Math.random() * remaining.length)];
                    await handleToggleAgent(assignModalConv, pick.id);
                  }}
                  disabled={isAssigning}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
                    color: '#fff',
                    cursor: isAssigning ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                  }}
                >
                  <Shuffle size={13} />
                  <span>{isAssigning ? 'กำลังสุ่ม...' : '🎲 สุ่มเพิ่ม 1 คน'}</span>
                </button>
              </div>

              {/* Active Care Groups Section (if available) */}
              {routingGroups.filter((g) => g.is_active && g.agent_ids.length > 0).length > 0 && (
                <div style={{ padding: '4px 20px 6px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4F46E5', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={12} />
                    <span>มอบหมายทั้งทีม (แอดมิน / เซลล์ประจำแบรนด์):</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {routingGroups
                      .filter((g) => g.is_active && g.agent_ids.length > 0)
                      .map((grp) => {
                        const isAllGroupMembersAssigned = grp.agent_ids.every((id) => modalAgentIds.has(id));
                        return (
                          <button
                            key={grp.id}
                            type="button"
                            onClick={async () => {
                              await handleAssignConversationGroup(assignModalConv, grp);
                            }}
                            disabled={isAssigning}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: isAssigning ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: isAllGroupMembersAssigned ? '#4F46E5' : 'rgba(79, 70, 229, 0.08)',
                              color: isAllGroupMembersAssigned ? '#ffffff' : '#4F46E5',
                              border: '1px solid rgba(79, 70, 229, 0.25)',
                            }}
                          >
                            <span>+ ทีม {grp.name} ({grp.agent_ids.length} คน)</span>
                            {isAllGroupMembersAssigned && <Check size={12} />}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Search Input */}
              <div style={{ padding: '6px 20px 8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--surface-muted, #F1F5F9)',
                    border: '1px solid var(--border, #E2E8F0)',
                    borderRadius: '8px',
                    padding: '7px 12px',
                  }}
                >
                  <Search size={14} style={{ color: 'var(--text-secondary, #64748B)' }} />
                  <input
                    type="text"
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder="ค้นหาชื่อเซลล์/ผู้ดูแล, ชื่อเล่น, แผนก หรือตำแหน่ง..."
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '0.82rem',
                      color: 'var(--text-primary, #0f172a)',
                      width: '100%',
                    }}
                  />
                  {assignSearch && (
                    <button
                      type="button"
                      onClick={() => setAssignSearch('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8' }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Staff List (Only Authorized Users, Multi-select toggle) */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '4px 16px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  maxHeight: '300px',
                }}
              >
                {(() => {
                  const q = assignSearch.trim().toLowerCase();
                  const authorizedUsers = users.filter((u) => {
                    const isAssigned = modalAgentIds.has(u.id);
                    const isPermitted = hasChatAccess(u, accessUsers, routingGroups);
                    return isAssigned || isPermitted;
                  });

                  const filtered = authorizedUsers.filter((u) => {
                    if (!q) return true;
                    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
                    const nickname = (u.nickname || '').toLowerCase();
                    const position = (u.position || '').toLowerCase();
                    const department = (u.department || '').toLowerCase();
                    const role = (u.role || '').toLowerCase();
                    return (
                      fullName.includes(q) ||
                      nickname.includes(q) ||
                      position.includes(q) ||
                      department.includes(q) ||
                      role.includes(q)
                    );
                  });

                  if (authorizedUsers.length === 0) {
                    return (
                      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary, #64748B)', fontSize: '0.82rem' }}>
                        <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>🔒</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          ยังไม่มีรายชื่อที่ได้รับอนุญาตใช้งานแชท
                        </div>
                        <p style={{ fontSize: '0.74rem', margin: '0 0 12px', color: 'var(--text-secondary)' }}>
                          กรุณากำหนดสิทธิ์ให้พนักงานในหน้าตั้งค่าช่องทางแชท &gt; สิทธิ์ใช้งาน
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setAssignModalConv(null);
                            navigate('/chat-settings');
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            background: '#3B82F6',
                            color: '#fff',
                            border: 'none',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          ⚙️ ไปหน้าตั้งค่าสิทธิ์ (Chat Access)
                        </button>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary, #64748B)', fontSize: '0.82rem' }}>
                        ไม่พบรายชื่อผู้ได้รับอนุญาตที่ตรงกับ "{assignSearch}"
                      </div>
                    );
                  }

                  return (
                    <>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)', padding: '2px 8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>รายชื่อทีมงาน/เซลล์ที่ได้รับอนุญาต ({filtered.length} คน)</span>
                        <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 600 }}>✓ คลิกเพื่อเพิ่มหรือนำออก</span>
                      </div>
                      {filtered.map((u) => {
                        const isAssigned = modalAgentIds.has(u.id);
                        const uAvatar = u.avatar_url ? avatarUrl(u.avatar_url) : null;
                        const isAdmin = u.role === 'admin';
                        const isBrandMember = routingGroups.some(
                          (g) =>
                            g.is_active &&
                            g.brand.toLowerCase() === (assignModalConv.brand || '').toLowerCase() &&
                            (g.agent_ids || []).includes(u.id)
                        );

                        return (
                          <div
                            key={u.id}
                            onClick={async () => {
                              await handleToggleAgent(assignModalConv, u.id);
                            }}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '10px',
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isAssigned ? '#EFF6FF' : 'transparent',
                              border: isAssigned ? '1px solid #BFDBFE' : '1px solid transparent',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (!isAssigned) e.currentTarget.style.background = 'var(--surface-muted, #F8FAFC)';
                            }}
                            onMouseLeave={(e) => {
                              if (!isAssigned) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: isAssigned ? '#3B82F6' : '#94A3B8',
                                  color: '#fff',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  overflow: 'hidden',
                                }}
                              >
                                {uAvatar ? (
                                  <img src={uAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  (u.nickname || u.first_name).charAt(0).toUpperCase()
                                )}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {u.first_name} {u.last_name} {u.nickname ? `(${u.nickname})` : ''}
                                  </span>
                                  {isAdmin && (
                                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#F3E8FF', color: '#7E22CE', flexShrink: 0 }}>
                                      Admin
                                    </span>
                                  )}
                                  {isBrandMember && (
                                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#ECFDF5', color: '#047857', flexShrink: 0 }}>
                                      ตรงแบรนด์
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)' }}>
                                  {u.position || u.department || u.role}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isAssigned ? (
                                <span
                                  style={{
                                    padding: '3px 10px',
                                    borderRadius: '12px',
                                    background: '#DBEAFE',
                                    color: '#1D4ED8',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <Check size={13} strokeWidth={2.5} />
                                  <span>ดูแลอยู่</span>
                                </span>
                              ) : (
                                <span
                                  style={{
                                    padding: '3px 10px',
                                    borderRadius: '12px',
                                    background: '#F1F5F9',
                                    color: '#2563EB',
                                    fontSize: '0.74rem',
                                    fontWeight: 600,
                                    border: '1px solid #CBD5E1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <Plus size={12} strokeWidth={2.4} />
                                  <span>เพิ่มคนดูแล</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>

              {/* Footer / Done Button */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border, #E2E8F0)',
                  background: 'var(--surface-muted, #F8FAFC)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAssignModalConv(null);
                    navigate('/chat-settings');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#3B82F6',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <SettingsIcon size={13} />
                  <span>ตั้งค่ากลุ่มคนดูแลและสิทธิ์</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignModalConv(null);
                    setAssignSearch('');
                  }}
                  style={{
                    padding: '7px 20px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    background: '#10B981',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>เสร็จสิ้น ({modalAgents.length} คนดูแล)</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

{/* Modal: Batch Customer Distribution & Approval */}
      {showDistributionModal && (
        <ChatDistributionModal
          isOpen={showDistributionModal}
          onClose={() => setShowDistributionModal(false)}
          onSuccess={() => {
            void fetchConversations();
          }}
        />
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
