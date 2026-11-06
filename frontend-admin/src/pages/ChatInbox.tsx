import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  Settings,
  X,
  Volume2,
  VolumeX,
  Plus,
  Radio,
  Copy,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ChatConversation, ChatMessage, ChatChannel } from '../types';

const QUICK_REPLIES = [
  'สวัสดีครับ ยินดีให้บริการครับ มีอะไรให้เราช่วยดูแลวันนี้ครับ?',
  'ขออภัยที่ตอบกลับล่าช้าครับ ทางเรากำลังตรวจสอบข้อมูลให้อยู่นะครับ',
  'ขออนุญาตสอบถามข้อมูลเพิ่มเติม เพื่อประสานงานให้ฝ่ายที่เกี่ยวข้องครับ',
  'ขอบคุณที่ติดต่อสอบถามเข้ามาครับ หากมีข้อสงสัยเพิ่มเติมสอบถามได้ตลอดเวลานะครับ',
  'สินค้าชิ้นนี้มีพร้อมส่งครับ จัดส่งได้ภายใน 1-2 วันทำการครับ',
];

export default function ChatInbox() {
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved'>('active');

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
    return localStorage.getItem('n8n_outbound_webhook_url') || import.meta.env.VITE_N8N_OUTBOUND_WEBHOOK_URL || '';
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempWebhookUrl, setTempWebhookUrl] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

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
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesBrand = brandFilter === 'all' || (c.brand || 'terrahome') === brandFilter;

    return matchesSearch && matchesPlatform && matchesStatus && matchesBrand;
  });

  const activeUnreadTotal = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  return (
    <div style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Top Bar / Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '4px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06C755 0%, #0084FF 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <MessageSquare size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              ศูนย์รวมแชท (Omnichannel Chat)
            </h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              รวมข้อความจาก Facebook Messenger และ LINE OA ตอบที่เดียว ไม่ต้องสลับแอป
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeUnreadTotal > 0 && (
            <span
              style={{
                background: '#EF4444',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              ยังไม่อ่าน {activeUnreadTotal} ข้อความ
            </span>
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: soundEnabled ? 'var(--blue)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? 'เสียงเปิดอยู่' : 'ปิดเสียง'}</span>
          </button>

          <Link
            to="/chat-settings"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #10B981',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10B981',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            <Radio size={16} />
            <span>⚙️ หลังบ้านรวมแชท ({channels.length} ช่องทาง)</span>
          </Link>

          <button
            onClick={() => {
              setTempWebhookUrl(outboundWebhookUrl);
              setShowSettingsModal(true);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
            }}
          >
            <Settings size={16} />
            <span>ตั้งค่า n8n Webhook</span>
          </button>
        </div>
      </div>

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
            <div
              style={{
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
              {channels.map((ch) => {
                const isActive = brandFilter === ch.brand_slug;
                const isZenslab = ch.brand_slug === 'zenslab';
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
                      background: isActive
                        ? isZenslab
                          ? '#059669'
                          : '#D97706'
                        : 'var(--surface)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                    title={ch.brand_name}
                  >
                    {ch.brand_logo && (
                      <img
                        src={ch.brand_logo}
                        alt=""
                        style={{ width: '13px', height: '13px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    )}
                    <span>{ch.brand_slug.toUpperCase().slice(0, 8)}</span>
                  </button>
                );
              })}
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem' }}>
              {(['active', 'resolved', 'all'] as const).map((s) => (
                <span
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    cursor: 'pointer',
                    color: statusFilter === s ? 'var(--blue)' : 'var(--text-secondary)',
                    fontWeight: statusFilter === s ? 700 : 500,
                    textDecoration: statusFilter === s ? 'underline' : 'none',
                  }}
                >
                  {s === 'active' ? 'เปิดอยู่' : s === 'resolved' ? 'ปิดเคสแล้ว' : 'แสดงทุกสถานะ'}
                </span>
              ))}
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
                const badgeBg = isLine ? '#06C755' : isIg ? '#E1306C' : '#0084FF';
                const badgeLabel = isLine ? 'L' : isIg ? 'IG' : 'F';
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
                          minWidth: '16px',
                          height: '16px',
                          padding: '0 3px',
                          borderRadius: '8px',
                          background: badgeBg,
                          color: '#fff',
                          fontSize: '8px',
                          fontWeight: 900,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px solid var(--surface)',
                        }}
                        title={badgeTitle}
                      >
                        {badgeLabel}
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
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: (conv.brand || 'terrahome').toLowerCase() === 'zenslab' ? '#065F46' : '#B45309',
                              color: '#ffffff',
                              flexShrink: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {(() => {
                              const ch = channels.find(c => c.brand_slug.toLowerCase() === (conv.brand || 'terrahome').toLowerCase());
                              return ch?.brand_logo ? (
                                <img
                                  src={ch.brand_logo}
                                  alt=""
                                  style={{ width: '11px', height: '11px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : null;
                            })()}
                            {(conv.brand || 'terrahome').toLowerCase() === 'zenslab' ? 'ZENSLAB' : 'TERRA'}
                          </span>
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
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    selectedConv.customer_name.charAt(0)
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {selectedConv.customer_name}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: selectedConv.platform === 'line' ? '#06C755' : '#0084FF',
                        color: '#fff',
                      }}
                    >
                      {selectedConv.platform === 'line' ? 'LINE OA' : 'Facebook Page'}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        background: (selectedConv.brand || 'terrahome').toLowerCase() === 'zenslab' ? '#065F46' : '#B45309',
                        color: '#fff',
                      }}
                    >
                      {(selectedConv.brand || 'terrahome').toLowerCase() === 'zenslab' ? 'ZENSLAB' : 'TERRA HOME'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ID: {selectedConv.platform_user_id.slice(0, 16)}...
                  </span>
                </div>
              </div>

              {/* Status / Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

                        {/* Bubble */}
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
    </div>
  );
}
