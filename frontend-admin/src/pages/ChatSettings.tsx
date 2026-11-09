import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Radio,
  X,
  Users,
  Shield,
} from 'lucide-react';
import ChatRoutingTab from '../components/chat/ChatRoutingTab';
import ChatAccessTab from '../components/chat/ChatAccessTab';
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
    <rect width={24} height={24} rx="6" fill="url(#ig-gradient)" />
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
  const [activeTab, setActiveTab] = useState<'channels' | 'routing' | 'access'>('channels');

  // Modal State
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

  // Fetch Channels
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
      if (!group.brand_logo && ch.brand_logo) {
        group.brand_logo = ch.brand_logo;
      }
      group.channels[ch.platform] = ch;
    });

    return Array.from(map.values());
  }, [channels]);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Open modal to Connect or Edit a specific platform of a brand
  const handleOpenPlatformModal = (
    group: BrandGroup,
    platform: 'line' | 'facebook' | 'instagram'
  ) => {
    const existing = group.channels[platform];
    setFormError('');

    if (existing) {
      // Edit mode
      setModalMode('edit');
      setEditingChannel(existing);
      setFormBrandSlug(existing.brand_slug);
      setFormBrandName(existing.brand_name);
      setFormBrandLogo(existing.brand_logo || group.brand_logo || '');
      setFormPlatform(existing.platform);
      setFormAccountHandle(existing.account_handle || '');
      setFormChannelId(existing.channel_id || '');
      setFormChannelSecret(existing.channel_secret || '');
      setFormChannelToken(existing.channel_access_token || '');
      setFormIsActive(existing.is_active);
    } else {
      // Create mode for this brand & platform
      setModalMode('create');
      setEditingChannel(null);
      setFormBrandSlug(group.brand_slug);
      setFormBrandName(group.brand_name);
      setFormBrandLogo(group.brand_logo || '');
      setFormPlatform(platform);
      setFormAccountHandle('');
      setFormChannelId('');
      setFormChannelSecret('');
      setFormChannelToken('');
      setFormIsActive(true);
    }

    setShowChannelModal(true);
  };

  // Open modal to add a brand from scratch
  const handleOpenNewBrand = () => {
    setModalMode('create');
    setEditingChannel(null);
    setFormBrandSlug('');
    setFormBrandName('');
    setFormBrandLogo('');
    setFormPlatform('line');
    setFormAccountHandle('');
    setFormChannelId('');
    setFormChannelSecret('');
    setFormChannelToken('');
    setFormIsActive(true);
    setFormError('');
    setShowChannelModal(true);
  };

  // Save Channel
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

  // Delete channel
  const handleDeleteChannel = async () => {
    if (!editingChannel) return;
    const confirmText = `ต้องการตัดการเชื่อมต่อ ${editingChannel.platform.toUpperCase()} ของแบรนด์ "${editingChannel.brand_name}" หรือไม่?`;
    if (!window.confirm(confirmText)) return;

    setFormSaving(true);
    try {
      const { error } = await supabase.from('chat_channels').delete().eq('id', editingChannel.id);
      if (error) throw error;
      setShowChannelModal(false);
      await fetchChannels();
    } catch (err: any) {
      setFormError('ไม่สามารถลบช่องทางได้: ' + err.message);
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 20px 60px' }}>
      {/* ================= ULTRA CLEAN TOP BAR ================= */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ตั้งค่าช่องทางแชท (Omnichannel Settings)
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            คลิกที่ไอคอนแบรนด์ด้านล่างเพื่อเปิดตั้งค่า Webhook, Token หรือจัดการการเชื่อมต่อ
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            to="/chat-inbox"
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <MessageSquare size={15} />
            <span>ไปที่ห้องแชท</span>
          </Link>

          {activeTab === 'channels' && (
            <button
              onClick={handleOpenNewBrand}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--blue)',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Plus size={16} />
              <span>+ เพิ่มแบรนด์ใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= TAB NAVIGATION ================= */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setActiveTab('channels')}
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'channels' ? 'var(--blue)' : 'var(--surface)',
            color: activeTab === 'channels' ? '#fff' : 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeTab === 'channels' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Radio size={16} />
          <span>📱 ช่องทางแชท (LINE / FB / IG)</span>
        </button>

        <button
          onClick={() => setActiveTab('routing')}
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'routing' ? 'var(--blue)' : 'var(--surface)',
            color: activeTab === 'routing' ? '#fff' : 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeTab === 'routing' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={16} />
          <span>👥 จัดกลุ่มแอดมิน & สุ่มคนดูแลลูกค้า</span>
        </button>

        <button
          onClick={() => setActiveTab('access')}
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'access' ? 'var(--blue)' : 'var(--surface)',
            color: activeTab === 'access' ? '#fff' : 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeTab === 'access' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Shield size={16} />
          <span>🔒 สิทธิ์เข้าใช้งานหน้ารวมแชท</span>
        </button>
      </div>

      {/* ================= TAB 1: CHANNELS ================= */}
      {activeTab === 'channels' && (
        loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ margin: 0, fontSize: '0.85rem' }}>กำลังโหลดข้อมูล...</p>
        </div>
      ) : brandGroups.length === 0 ? (
        <div
          style={{
            padding: '48px 20px',
            background: 'var(--surface)',
            borderRadius: '14px',
            border: '1px dashed var(--border)',
            textAlign: 'center',
          }}
        >
          <Radio size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>ยังไม่มีแบรนด์ที่เชื่อมต่อ</h3>
          <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            เริ่มเชื่อมต่อ LINE OA, Facebook หรือ Instagram แรกของนาย
          </p>
          <button
            onClick={handleOpenNewBrand}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            + เพิ่มแบรนด์แรก
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {brandGroups.map((group) => {
            const hasLine = !!group.channels.line;
            const hasFb = !!group.channels.facebook;
            const hasIg = !!group.channels.instagram;

            return (
              <div
                key={group.brand_slug}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Left: Brand Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {group.brand_logo ? (
                    <img
                      src={group.brand_logo}
                      alt={group.brand_name}
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        objectFit: 'cover',
                        border: '1px solid var(--border)',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
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
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {group.brand_name}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {group.brand_slug}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                      คลิกไอคอนช่องทางด้านขวาเพื่อเปิดตั้งค่า
                    </span>
                  </div>
                </div>

                {/* Right: The 3 Platform Buttons (Click opens Modal!) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* 🟢 LINE Icon Button */}
                  <button
                    onClick={() => handleOpenPlatformModal(group, 'line')}
                    title={hasLine ? `LINE: ${group.channels.line?.account_handle || 'เชื่อมต่อแล้ว'} (คลิกเพื่อแก้ไข)` : 'คลิกเพื่อเชื่อมต่อ LINE OA'}
                    style={{
                      height: '40px',
                      padding: hasLine ? '0 14px' : '0 12px',
                      borderRadius: '10px',
                      border: hasLine ? '1px solid rgba(6, 199, 85, 0.4)' : '1px dashed var(--border)',
                      background: hasLine ? 'rgba(6, 199, 85, 0.1)' : 'var(--surface-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ opacity: hasLine ? 1 : 0.4, display: 'flex' }}>
                      <LineIcon size={20} />
                    </div>
                    {hasLine ? (
                      <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#06C755', display: 'block' }}>
                          LINE OA
                        </span>
                        {group.channels.line?.account_handle && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {group.channels.line.account_handle}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        + LINE
                      </span>
                    )}
                  </button>

                  {/* 🔵 Facebook Icon Button */}
                  <button
                    onClick={() => handleOpenPlatformModal(group, 'facebook')}
                    title={hasFb ? `Facebook: ${group.channels.facebook?.account_handle || 'เชื่อมต่อแล้ว'} (คลิกเพื่อแก้ไข)` : 'คลิกเพื่อเชื่อมต่อ Facebook เพจ'}
                    style={{
                      height: '40px',
                      padding: hasFb ? '0 14px' : '0 12px',
                      borderRadius: '10px',
                      border: hasFb ? '1px solid rgba(0, 132, 255, 0.4)' : '1px dashed var(--border)',
                      background: hasFb ? 'rgba(0, 132, 255, 0.1)' : 'var(--surface-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ opacity: hasFb ? 1 : 0.4, display: 'flex' }}>
                      <FacebookIcon size={20} />
                    </div>
                    {hasFb ? (
                      <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0084FF', display: 'block' }}>
                          Facebook
                        </span>
                        {group.channels.facebook?.account_handle && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            {group.channels.facebook.account_handle}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        + FB เพจ
                      </span>
                    )}
                  </button>

                  {/* 🟣 Instagram Icon Button */}
                  <button
                    onClick={() => handleOpenPlatformModal(group, 'instagram')}
                    title={hasIg ? `Instagram: ${group.channels.instagram?.account_handle || 'เชื่อมต่อแล้ว'} (คลิกเพื่อแก้ไข)` : 'คลิกเพื่อเชื่อมต่อ Instagram (IG)'}
                    style={{
                      height: '40px',
                      padding: hasIg ? '0 14px' : '0 12px',
                      borderRadius: '10px',
                      border: hasIg ? '1px solid rgba(225, 48, 108, 0.4)' : '1px dashed var(--border)',
                      background: hasIg ? 'rgba(225, 48, 108, 0.1)' : 'var(--surface-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ opacity: hasIg ? 1 : 0.4, display: 'flex' }}>
                      <InstagramIcon size={20} />
                    </div>
                    {hasIg ? (
                      <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#E1306C', display: 'block' }}>
                          Instagram
                        </span>
                        {group.channels.instagram?.account_handle && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            {group.channels.instagram.account_handle}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        + IG
                      </span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* ================= TAB 2: ROUTING & RANDOM ASSIGNMENT ================= */}
      {activeTab === 'routing' && <ChatRoutingTab />}

      {/* ================= TAB 3: ACCESS PERMISSIONS ================= */}
      {activeTab === 'access' && <ChatAccessTab />}

      {/* ================= MODAL: CHANNEL DETAILS & SETTINGS ================= */}
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
              maxWidth: '560px',
              maxHeight: '90vh',
              background: 'var(--surface)',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
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
                    {modalMode === 'edit' ? 'ตั้งค่าช่องทาง' : 'เชื่อมต่อช่องทางใหม่'} (
                    {formPlatform === 'line' ? 'LINE OA' : formPlatform === 'facebook' ? 'Facebook Page' : 'Instagram Direct'})
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    แบรนด์: <strong>{formBrandName || formBrandSlug || 'แบรนด์ใหม่'}</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowChannelModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveChannel} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {formError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    marginBottom: '14px',
                  }}
                >
                  ⚠️ {formError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 1. WEBHOOK URL BOX (MOVED INSIDE MODAL AS USER REQUESTED!) */}
                {formBrandSlug && (
                  <div
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      🔗 ลิงก์ Webhook สำหรับนำไปใส่ในคอนโซล ({formPlatform === 'line' ? 'LINE Developers' : 'Meta Developer'}):
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        readOnly
                        value={
                          formPlatform === 'line'
                            ? `https://bddevelopment.app.n8n.cloud/webhook/line-inbound?brand=${formBrandSlug}`
                            : `https://bddevelopment.app.n8n.cloud/webhook/meta-inbound?brand=${formBrandSlug}`
                        }
                        style={{
                          flex: 1,
                          padding: '6px 9px',
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
                        type="button"
                        onClick={() =>
                          handleCopy(
                            formPlatform === 'line'
                              ? `https://bddevelopment.app.n8n.cloud/webhook/line-inbound?brand=${formBrandSlug}`
                              : `https://bddevelopment.app.n8n.cloud/webhook/meta-inbound?brand=${formBrandSlug}`,
                            'modal-webhook'
                          )
                        }
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: copiedKey === 'modal-webhook' ? '#10B981' : 'var(--blue)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {copiedKey === 'modal-webhook' ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedKey === 'modal-webhook' ? 'คัดลอกแล้ว!' : 'คัดลอก'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Platform Selector (only in create mode when adding a brand) */}
                {modalMode === 'create' && !editingChannel && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                      เลือกแพลตฟอร์ม:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {(['line', 'facebook', 'instagram'] as const).map((p) => {
                        const isSelected = formPlatform === p;
                        return (
                          <div
                            key={p}
                            onClick={() => setFormPlatform(p)}
                            style={{
                              padding: '8px',
                              borderRadius: '7px',
                              border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
                              background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--surface-muted)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {p === 'line' ? <LineIcon size={18} /> : p === 'facebook' ? <FacebookIcon size={18} /> : <InstagramIcon size={18} />}
                            <span style={{ fontSize: '0.78rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text-primary)' }}>
                              {p === 'line' ? 'LINE OA' : p === 'facebook' ? 'Facebook' : 'Instagram'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Brand Name & Slug */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                      ชื่อแบรนด์: *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น Terra Home, Zenslab"
                      value={formBrandName}
                      onChange={(e) => setFormBrandName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '7px 9px',
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
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                      รหัสแบรนด์ (Slug อังกฤษ): *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น terrahome, zenslab"
                      value={formBrandSlug}
                      onChange={(e) => setFormBrandSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      required
                      disabled={modalMode === 'edit'}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: modalMode === 'edit' ? 'var(--border)' : 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* 4. Handle & Logo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                      {formPlatform === 'line' ? 'LINE Basic ID / Handle:' : formPlatform === 'facebook' ? 'ชื่อหน้าเพจ / เพจ ID:' : 'IG Username:'}
                    </label>
                    <input
                      type="text"
                      placeholder={formPlatform === 'line' ? 'เช่น @019iisag' : formPlatform === 'facebook' ? 'เช่น Terra Home เพจหลัก' : 'เช่น @zenslab.th'}
                      value={formAccountHandle}
                      onChange={(e) => setFormAccountHandle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
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
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                      ลิงก์รูปโลโก้แบรนด์ (Logo URL):
                    </label>
                    <input
                      type="url"
                      placeholder="https://... ลิงก์รูปโลโก้"
                      value={formBrandLogo}
                      onChange={(e) => setFormBrandLogo(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* 5. Channel ID & Secret */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                      {formPlatform === 'line' ? 'Channel ID (ตัวเลข LINE Developers):' : 'Page ID / App ID:'}
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 2012401276"
                      value={formChannelId}
                      onChange={(e) => setFormChannelId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
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
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                      {formPlatform === 'line' ? 'Channel Secret:' : 'App Secret:'}
                    </label>
                    <input
                      type="text"
                      placeholder="ความลับแชนแนล..."
                      value={formChannelSecret}
                      onChange={(e) => setFormChannelSecret(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* 6. Channel Access Token */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '3px', color: 'var(--text-primary)' }}>
                    {formPlatform === 'line'
                      ? 'Channel Access Token (Long-lived จาก LINE Developers): *'
                      : 'Page Access Token (จาก Meta Developer / Graph API): *'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder="วาง Token ยาวๆ ตรงนี้..."
                    value={formChannelToken}
                    onChange={(e) => setFormChannelToken(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '7px 9px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                      fontSize: '0.76rem',
                      outline: 'none',
                      fontFamily: 'monospace',
                      resize: 'none',
                    }}
                  />
                </div>

                {/* 7. Active Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="is_active_toggle"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                  />
                  <label htmlFor="is_active_toggle" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    เปิดใช้งานช่องทางนี้ (Active)
                  </label>
                </div>
              </div>

              {/* Action Buttons: Delete (Left) & Save (Right) */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: modalMode === 'edit' && editingChannel ? 'space-between' : 'flex-end',
                  alignItems: 'center',
                  marginTop: '22px',
                  paddingTop: '14px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {modalMode === 'edit' && editingChannel && (
                  <button
                    type="button"
                    onClick={handleDeleteChannel}
                    disabled={formSaving}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      background: 'rgba(239, 68, 68, 0.08)',
                      color: '#EF4444',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Trash2 size={13} />
                    <span>ตัดการเชื่อมต่อ</span>
                  </button>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowChannelModal(false)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    style={{
                      padding: '7px 18px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--blue)',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: formSaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem',
                      opacity: formSaving ? 0.7 : 1,
                    }}
                  >
                    {formSaving ? 'กำลังบันทึก...' : modalMode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกและเชื่อมต่อ'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
