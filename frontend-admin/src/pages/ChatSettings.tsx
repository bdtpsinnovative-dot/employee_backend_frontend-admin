import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Copy,
  Check,
  Trash2,
  Edit2,
  RefreshCw,
  Radio,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ChatChannel } from '../types';

// ==========================================
// 🎨 OFFICIAL PLATFORM ICONS (SVG)
// ==========================================
export const LineIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M24 10.304C24 4.613 18.627 0 12 0S0 4.613 0 10.304C0 15.394 4.298 19.645 10.106 20.457c.394.085.93.26 1.066.598.122.304.08.78.039 1.087l-.173 1.042c-.053.318-.246 1.242 1.088.677 1.334-.565 7.195-4.237 9.816-7.253C23.23 15.158 24 12.87 24 10.304z"
      fill="#06C755"
    />
    <path
      d="M7.747 12.874h-.85a.434.434 0 01-.434-.434V8.586a.434.434 0 01.434-.434h.85a.434.434 0 01.434.434v3.854a.434.434 0 01-.434.434zm3.018 0h-2.11a.434.434 0 01-.434-.434V8.586a.434.434 0 01.434-.434h.85a.434.434 0 01.434.434v3.019h1.26a.434.434 0 01.434.434v.401a.434.434 0 01-.434.434zm3.93 0h-.85a.434.434 0 01-.434-.434V9.658l-1.57 2.14a.434.434 0 01-.35.176h-.226a.434.434 0 01-.434-.434V8.586a.434.434 0 01.434-.434h.85a.434.434 0 01.434.434v1.867l1.57-2.14a.434.434 0 01.35-.176h.226a.434.434 0 01.434.434v3.854a.434.434 0 01-.434.434zm4.33-2.584h-1.26v.85h1.26a.434.434 0 01.434.434v.401a.434.434 0 01-.434.434h-2.11a.434.434 0 01-.434-.434V8.586a.434.434 0 01.434-.434h2.11a.434.434 0 01.434.434v.401a.434.434 0 01-.434.434h-1.26v.735h1.26a.434.434 0 01.434.434v.401a.434.434 0 01-.434.434z"
      fill="#fff"
    />
  </svg>
);

export const FacebookIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="12" fill="url(#fb-gradient)" />
    <path
      d="M12 4.5c-4.42 0-8 3.32-8 7.42 0 2.34 1.16 4.43 2.98 5.78v2.8l2.69-1.48c.74.2 1.52.32 2.33.32 4.42 0 8-3.32 8-7.42s-3.58-7.42-8-7.42zm.8 9.94l-2.04-2.18-3.98 2.18 4.38-4.65 2.09 2.18 3.93-2.18-4.38 4.65z"
      fill="#fff"
    />
    <defs>
      <linearGradient id="fb-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00B2FF" />
        <stop offset="1" stopColor="#006AFF" />
      </linearGradient>
    </defs>
  </svg>
);

export const InstagramIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="url(#ig-gradient)" />
    <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" stroke="#fff" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="3.2" stroke="#fff" strokeWidth="1.8" />
    <circle cx="15.8" cy="8.2" r="0.9" fill="#fff" />
    <defs>
      <linearGradient id="ig-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FED373" />
        <stop offset="0.25" stopColor="#F15245" />
        <stop offset="0.6" stopColor="#D92E7F" />
        <stop offset="1" stopColor="#9B36B7" />
      </linearGradient>
    </defs>
  </svg>
);

// Types for Brand Grouping
interface BrandGroup {
  brand_slug: string;
  brand_name: string;
  brand_logo: string;
  channels: {
    line?: ChatChannel;
    facebook?: ChatChannel;
    instagram?: ChatChannel;
  };
}

export default function ChatSettings() {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal State: Connect / Edit Channel
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingChannel, setEditingChannel] = useState<ChatChannel | null>(null);

  // Form State
  const [formBrandSlug, setFormBrandSlug] = useState('');
  const [formBrandName, setFormBrandName] = useState('');
  const [formBrandLogo, setFormBrandLogo] = useState('');
  const [formAccountHandle, setFormAccountHandle] = useState('');
  const [formPlatform, setFormPlatform] = useState<'line' | 'facebook' | 'instagram'>('line');
  const [formChannelId, setFormChannelId] = useState('');
  const [formChannelSecret, setFormChannelSecret] = useState('');
  const [formChannelToken, setFormChannelToken] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // 1. Fetch All Channels
  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('chat_channels')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setChannels(data || []);
    } catch (err: any) {
      console.error('Error fetching chat_channels:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  // Group channels by brand_slug
  const brandGroups: BrandGroup[] = React.useMemo(() => {
    const map = new Map<string, BrandGroup>();

    channels.forEach((ch) => {
      const slug = ch.brand_slug.toLowerCase();
      if (!map.has(slug)) {
        map.set(slug, {
          brand_slug: ch.brand_slug,
          brand_name: ch.brand_name,
          brand_logo: ch.brand_logo || '',
          channels: {},
        });
      }
      const group = map.get(slug)!;
      // prioritize any available logo
      if (!group.brand_logo && ch.brand_logo) {
        group.brand_logo = ch.brand_logo;
      }
      group.channels[ch.platform] = ch;
    });

    return Array.from(map.values());
  }, [channels]);

  // Stats
  const lineCount = channels.filter((c) => c.platform === 'line' && c.is_active).length;
  const fbCount = channels.filter((c) => c.platform === 'facebook' && c.is_active).length;
  const igCount = channels.filter((c) => c.platform === 'instagram' && c.is_active).length;

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Open modal to add a channel to a brand
  const handleOpenAddChannel = (brandSlug?: string, brandName?: string, brandLogo?: string, platform?: 'line' | 'facebook' | 'instagram') => {
    setModalMode('create');
    setEditingChannel(null);
    setFormBrandSlug(brandSlug || '');
    setFormBrandName(brandName || '');
    setFormBrandLogo(brandLogo || '');
    setFormPlatform(platform || 'line');
    setFormAccountHandle('');
    setFormChannelId('');
    setFormChannelSecret('');
    setFormChannelToken('');
    setFormIsActive(true);
    setFormError('');
    setShowChannelModal(true);
  };

  // Open modal to edit existing channel
  const handleOpenEditChannel = (channel: ChatChannel) => {
    setModalMode('edit');
    setEditingChannel(channel);
    setFormBrandSlug(channel.brand_slug);
    setFormBrandName(channel.brand_name);
    setFormBrandLogo(channel.brand_logo || '');
    setFormPlatform(channel.platform);
    setFormAccountHandle(channel.account_handle || '');
    setFormChannelId(channel.channel_id || '');
    setFormChannelSecret(channel.channel_secret || '');
    setFormChannelToken(channel.channel_access_token || '');
    setFormIsActive(channel.is_active);
    setFormError('');
    setShowChannelModal(true);
  };

  // Save Channel (Insert or Update)
  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const slug = formBrandSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const name = formBrandName.trim();
    const token = formChannelToken.trim();

    if (!slug || !name || !token) {
      setFormError('กรุณากรอกข้อมูลให้ครบถ้วน: รหัสแบรนด์, ชื่อแบรนด์ และ Access Token');
      return;
    }

    setFormSaving(true);
    try {
      if (modalMode === 'edit' && editingChannel) {
        const { error } = await supabase
          .from('chat_channels')
          .update({
            brand_slug: slug,
            brand_name: name,
            brand_logo: formBrandLogo.trim() || null,
            account_handle: formAccountHandle.trim() || null,
            channel_id: formChannelId.trim() || null,
            channel_secret: formChannelSecret.trim() || null,
            channel_access_token: token,
            is_active: formIsActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingChannel.id);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('chat_channels').insert({
          brand_slug: slug,
          brand_name: name,
          brand_logo: formBrandLogo.trim() || null,
          platform: formPlatform,
          account_handle: formAccountHandle.trim() || null,
          channel_id: formChannelId.trim() || null,
          channel_secret: formChannelSecret.trim() || null,
          channel_access_token: token,
          is_active: formIsActive,
        });

        if (error) {
          if (error.code === '23505') {
            throw new Error(`แบรนด์ '${name}' มีการเชื่อมต่อ ${formPlatform.toUpperCase()} อยู่แล้ว`);
          }
          throw error;
        }
      }

      setShowChannelModal(false);
      await fetchChannels();
    } catch (err: any) {
      setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setFormSaving(false);
    }
  };

  // Toggle channel active status
  const handleToggleActive = async (channel: ChatChannel) => {
    try {
      const nextActive = !channel.is_active;
      const { error } = await supabase
        .from('chat_channels')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', channel.id);

      if (error) throw error;
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, is_active: nextActive } : c))
      );
    } catch (err: any) {
      alert('ไม่สามารถเปลี่ยนสถานะได้: ' + err.message);
    }
  };

  // Delete / Disconnect channel
  const handleDeleteChannel = async (channel: ChatChannel) => {
    const confirmText = `ต้องการตัดการเชื่อมต่อ ${channel.platform.toUpperCase()} ของแบรนด์ "${channel.brand_name}" หรือไม่?`;
    if (!window.confirm(confirmText)) return;

    try {
      const { error } = await supabase.from('chat_channels').delete().eq('id', channel.id);
      if (error) throw error;
      await fetchChannels();
    } catch (err: any) {
      alert('ไม่สามารถลบช่องทางได้: ' + err.message);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 20px 48px' }}>
      {/* ================= TOP HEADER ================= */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #06C755 0%, #0084FF 50%, #E1306C 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(6, 199, 85, 0.25)',
            }}
          >
            <Radio size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              ศูนย์ตั้งค่าช่องทางแชท (Omnichannel Hub)
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              จัดการเชื่อมต่อ LINE Official Account, Facebook Messenger และ Instagram Direct ทุกแบรนด์ในที่เดียว
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link
            to="/chat-inbox"
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <MessageSquare size={16} />
            <span>เข้าสู่ห้องแชท</span>
          </Link>

          <button
            onClick={() => handleOpenAddChannel()}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            <Plus size={18} />
            <span>+ เพิ่มแบรนด์ / ช่องทางใหม่</span>
          </button>
        </div>
      </div>

      {/* ================= PLATFORM STATS CARDS ================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        {/* LINE OA Card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(6, 199, 85, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <LineIcon size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              LINE Official Account
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#06C755', marginTop: '2px' }}>
              {lineCount} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>บัญชีเชื่อมต่อแล้ว</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              ช่องทางหลัก Webhook อัตโนมัติ รองรับข้อความ/รูปภาพ
            </span>
          </div>
        </div>

        {/* Facebook Messenger Card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(0, 132, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FacebookIcon size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Facebook Messenger
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0084FF', marginTop: '2px' }}>
              {fbCount} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>เพจเชื่อมต่อแล้ว</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Meta Graph API สำหรับเพจร้านค้าและยิงแอด
            </span>
          </div>
        </div>

        {/* Instagram Direct Card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(225, 48, 108, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <InstagramIcon size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Instagram Direct (IG)
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#E1306C', marginTop: '2px' }}>
              {igCount} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>บัญชีเชื่อมต่อแล้ว</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              ตอบกลับลูกค้าที่ทัก DM และ Story ของ Instagram
            </span>
          </div>
        </div>
      </div>

      {/* ================= BRAND HUB LIST ================= */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          แบรนด์และช่องทางที่เชื่อมต่อ ({brandGroups.length} แบรนด์)
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          ระบบใช้ Universal Engine ตัวเดียว รองรับได้ไม่จำกัดแบรนด์
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ margin: 0 }}>กำลังโหลดการตั้งค่าช่องทาง...</p>
        </div>
      ) : brandGroups.length === 0 ? (
        <div
          style={{
            padding: '48px 20px',
            background: 'var(--surface)',
            borderRadius: '16px',
            border: '1px dashed var(--border)',
            textAlign: 'center',
          }}
        >
          <Radio size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>ยังไม่มีแบรนด์ที่เชื่อมต่อ</h3>
          <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            เริ่มเชื่อมต่อ LINE OA, Facebook เพจ หรือ Instagram บัญชีแรกของนายได้เลย
          </p>
          <button
            onClick={() => handleOpenAddChannel()}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + เพิ่มแบรนด์แรก
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {brandGroups.map((group) => {
            const connectedCount = Object.keys(group.channels).length;

            return (
              <div
                key={group.brand_slug}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                }}
              >
                {/* Brand Header */}
                <div
                  style={{
                    padding: '16px 20px',
                    background: 'var(--surface-muted)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {group.brand_logo ? (
                      <img
                        src={group.brand_logo}
                        alt={group.brand_name}
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          objectFit: 'cover',
                          border: '2px solid rgba(255,255,255,0.2)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.2rem',
                        }}
                      >
                        {group.brand_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {group.brand_name}
                        </h3>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: 'var(--border)',
                            color: 'var(--text-secondary)',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                          }}
                        >
                          slug: {group.brand_slug}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        เชื่อมต่อแล้ว {connectedCount} จาก 3 แพลตฟอร์ม
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenAddChannel(group.brand_slug, group.brand_name, group.brand_logo)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Plus size={14} />
                      <span>เพิ่มช่องทางให้แบรนด์นี้</span>
                    </button>
                  </div>
                </div>

                {/* 3 Platforms Grid */}
                <div
                  style={{
                    padding: '20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {/* ================= 1. LINE OA SLOT ================= */}
                  <ChannelSlotCard
                    platform="line"
                    channel={group.channels.line}
                    brandGroup={group}
                    onConnect={() => handleOpenAddChannel(group.brand_slug, group.brand_name, group.brand_logo, 'line')}
                    onEdit={handleOpenEditChannel}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDeleteChannel}
                    onCopy={handleCopy}
                    copiedKey={copiedKey}
                  />

                  {/* ================= 2. FACEBOOK SLOT ================= */}
                  <ChannelSlotCard
                    platform="facebook"
                    channel={group.channels.facebook}
                    brandGroup={group}
                    onConnect={() => handleOpenAddChannel(group.brand_slug, group.brand_name, group.brand_logo, 'facebook')}
                    onEdit={handleOpenEditChannel}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDeleteChannel}
                    onCopy={handleCopy}
                    copiedKey={copiedKey}
                  />

                  {/* ================= 3. INSTAGRAM SLOT ================= */}
                  <ChannelSlotCard
                    platform="instagram"
                    channel={group.channels.instagram}
                    brandGroup={group}
                    onConnect={() => handleOpenAddChannel(group.brand_slug, group.brand_name, group.brand_logo, 'instagram')}
                    onEdit={handleOpenEditChannel}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDeleteChannel}
                    onCopy={handleCopy}
                    copiedKey={copiedKey}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODAL: CONNECT / EDIT CHANNEL ================= */}
      {showChannelModal && (
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
              maxWidth: '620px',
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
                {formPlatform === 'line' ? (
                  <LineIcon size={24} />
                ) : formPlatform === 'facebook' ? (
                  <FacebookIcon size={24} />
                ) : (
                  <InstagramIcon size={24} />
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    {modalMode === 'edit' ? 'แก้ไขช่องทางเชื่อมต่อ' : 'เชื่อมต่อช่องทางใหม่'} (
                    {formPlatform === 'line' ? 'LINE OA' : formPlatform === 'facebook' ? 'Facebook Page' : 'Instagram Direct'})
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    ระบบจัดเก็บ Token ปลอดภัย และเชื่อมต่อไปยัง Omnichannel Hub อัตโนมัติ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowChannelModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveChannel} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {formError && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    marginBottom: '16px',
                  }}
                >
                  ⚠️ {formError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Platform Selector (only in create mode) */}
                {modalMode === 'create' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                      เลือกแพลตฟอร์ม: *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {(['line', 'facebook', 'instagram'] as const).map((p) => {
                        const isSelected = formPlatform === p;
                        return (
                          <div
                            key={p}
                            onClick={() => setFormPlatform(p)}
                            style={{
                              padding: '10px',
                              borderRadius: '8px',
                              border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
                              background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--surface-muted)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {p === 'line' ? <LineIcon size={20} /> : p === 'facebook' ? <FacebookIcon size={20} /> : <InstagramIcon size={20} />}
                            <span style={{ fontSize: '0.8rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text-primary)' }}>
                              {p === 'line' ? 'LINE OA' : p === 'facebook' ? 'Facebook' : 'Instagram'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Brand Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      ชื่อแบรนด์: *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น Terra Home, Zenslab, Woodden"
                      value={formBrandName}
                      onChange={(e) => setFormBrandName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      รหัสแบรนด์ (Slug อังกฤษตัวเล็ก): *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น terrahome, zenslab, woodden"
                      value={formBrandSlug}
                      onChange={(e) => setFormBrandSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      required
                      disabled={modalMode === 'edit'}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: modalMode === 'edit' ? 'var(--border)' : 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Brand Logo & Handle */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      ลิงก์รูปโลโก้แบรนด์ (Logo URL):
                    </label>
                    <input
                      type="url"
                      placeholder="https://... ลิงก์รูปโลโก้"
                      value={formBrandLogo}
                      onChange={(e) => setFormBrandLogo(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      {formPlatform === 'line' ? 'LINE Basic ID / Handle:' : formPlatform === 'facebook' ? 'ชื่อหน้าเพจ / เพจ ID:' : 'IG Username / Handle:'}
                    </label>
                    <input
                      type="text"
                      placeholder={formPlatform === 'line' ? 'เช่น @019iisag หรือ @zenslab' : formPlatform === 'facebook' ? 'เช่น Terra Home Thailand' : 'เช่น @woodden.th'}
                      value={formAccountHandle}
                      onChange={(e) => setFormAccountHandle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Channel ID & Secret */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      {formPlatform === 'line' ? 'Channel ID (ตัวเลข LINE Developers):' : 'Page ID / App ID:'}
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 2012401276"
                      value={formChannelId}
                      onChange={(e) => setFormChannelId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                      {formPlatform === 'line' ? 'Channel Secret:' : 'App Secret:'}
                    </label>
                    <input
                      type="text"
                      placeholder="ความลับแชนแนล..."
                      value={formChannelSecret}
                      onChange={(e) => setFormChannelSecret(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Channel Access Token */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                    {formPlatform === 'line'
                      ? 'Channel Access Token (Long-lived จาก LINE Developers): *'
                      : 'Page Access Token (จาก Meta Developer / Graph API): *'}
                  </label>
                  <textarea
                    rows={3}
                    placeholder="วาง Token ยาวๆ ตรงนี้..."
                    value={formChannelToken}
                    onChange={(e) => setFormChannelToken(e.target.value)}
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
                      resize: 'vertical',
                    }}
                  />
                </div>

                {/* Status Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="is_active_toggle"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <label htmlFor="is_active_toggle" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    เปิดใช้งานช่องทางนี้ทันที (Active)
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
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
                  type="submit"
                  disabled={formSaving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--blue)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: formSaving ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: formSaving ? 0.7 : 1,
                  }}
                >
                  {formSaving ? 'กำลังบันทึก...' : modalMode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกและเชื่อมต่อ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 🧩 SUB-COMPONENT: CHANNEL SLOT CARD
// ==========================================
interface ChannelSlotCardProps {
  platform: 'line' | 'facebook' | 'instagram';
  channel?: ChatChannel;
  brandGroup: BrandGroup;
  onConnect: () => void;
  onEdit: (ch: ChatChannel) => void;
  onToggleActive: (ch: ChatChannel) => void;
  onDelete: (ch: ChatChannel) => void;
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
}

function ChannelSlotCard({
  platform,
  channel,
  brandGroup,
  onConnect,
  onEdit,
  onToggleActive,
  onDelete,
  onCopy,
  copiedKey,
}: ChannelSlotCardProps) {
  const isConnected = !!channel;
  const isActive = isConnected && channel.is_active;

  const platformTitle =
    platform === 'line' ? 'LINE Official Account' : platform === 'facebook' ? 'Facebook Messenger' : 'Instagram Direct';

  const webhookUrl =
    platform === 'line'
      ? `https://bddevelopment.app.n8n.cloud/webhook/line-inbound?brand=${brandGroup.brand_slug}`
      : `https://bddevelopment.app.n8n.cloud/webhook/meta-inbound?brand=${brandGroup.brand_slug}`;

  const copyKey = `${brandGroup.brand_slug}-${platform}`;
  const isCopied = copiedKey === copyKey;

  return (
    <div
      style={{
        border: isConnected ? '1px solid var(--border)' : '1px dashed var(--border)',
        borderRadius: '12px',
        padding: '16px',
        background: isConnected ? 'var(--surface-muted)' : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '190px',
        transition: 'all 0.15s ease',
      }}
    >
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flexShrink: 0 }}>
              {platform === 'line' ? (
                <LineIcon size={26} />
              ) : platform === 'facebook' ? (
                <FacebookIcon size={26} />
              ) : (
                <InstagramIcon size={26} />
              )}
            </div>
            <div>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'block' }}>
                {platformTitle}
              </strong>
              {isConnected && channel.account_handle ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {channel.account_handle}
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {isConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
                </span>
              )}
            </div>
          </div>

          {/* Status Badge */}
          {isConnected ? (
            <span
              onClick={() => onToggleActive(channel)}
              title="คลิกเพื่อเปิด/ปิดใช้งาน"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '12px',
                cursor: 'pointer',
                background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isActive ? '#10B981' : '#EF4444',
                border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isActive ? '#10B981' : '#EF4444',
                }}
              />
              {isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
            </span>
          ) : (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              ยังไม่เชื่อมต่อ
            </span>
          )}
        </div>

        {/* Content Area */}
        {isConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Webhook URL Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                ลิงก์ Webhook สำหรับนำไปใส่ในคอนโซล:
              </label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => onCopy(webhookUrl, copyKey)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isCopied ? '#10B981' : 'var(--blue)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                  }}
                >
                  {isCopied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{isCopied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                </button>
              </div>
            </div>

            {channel.channel_id && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                ID: {channel.channel_id}
              </span>
            )}
          </div>
        ) : (
          <div style={{ padding: '8px 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            เชื่อมต่อช่องทางนี้เพื่อรับข้อความจากลูกค้าเข้าศูนย์รวมแชทอัตโนมัติ
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isConnected ? (
          <>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => onEdit(channel)}
                title="แก้ไขข้อมูลช่องทาง"
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Edit2 size={12} />
                <span>แก้ไข</span>
              </button>
              <button
                onClick={() => onDelete(channel)}
                title="ตัดการเชื่อมต่อ"
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: 'transparent',
                  color: '#EF4444',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              อัปเดตเมื่อ {new Date(channel.updated_at || channel.created_at).toLocaleDateString('th-TH')}
            </span>
          </>
        ) : (
          <button
            onClick={onConnect}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background:
                platform === 'line'
                  ? '#06C755'
                  : platform === 'facebook'
                  ? '#0084FF'
                  : 'linear-gradient(45deg, #f09433 0%, #dc2743 50%, #bc1888 100%)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Plus size={15} />
            <span>+ เชื่อมต่อ {platform === 'line' ? 'LINE OA' : platform === 'facebook' ? 'Facebook' : 'Instagram'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
