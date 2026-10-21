import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { ContactInquiry } from '../types';

const BRAND_MAP: Record<string, { name: string; className: string; icon: string }> = {
  zenslab: { name: 'ZENSLAB', className: 'st-pending', icon: 'fa-tree' },
  zenslab_web: { name: 'ZENSLAB', className: 'st-pending', icon: 'fa-tree' },
  terrahome: { name: 'TERRA HOME', className: 'st-ontime', icon: 'fa-house' },
  nexteak: { name: 'NEXTEAK', className: 'st-offsite', icon: 'fa-ship' },
  furniture: { name: 'FURNITURE', className: 'st-leave', icon: 'fa-couch' },
  wallcraft: { name: 'WALLCRAFT', className: 'st-disabled', icon: 'fa-layer-group' },
};

function getBrandBadge(source?: string) {
  const key = (source || 'zenslab').toLowerCase();
  const info = BRAND_MAP[key] || { name: source || 'ZENSLAB', className: 'st-unknown', icon: 'fa-globe' };
  return (
    <span
      className={`status-badge ${info.className}`}
      style={{
        width: 'auto',
        minWidth: '85px',
        padding: '3px 9px',
        fontSize: '11px',
        fontWeight: 600,
        gap: '5px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <i className={`fa-solid ${info.icon}`}></i>
      <span>{info.name}</span>
    </span>
  );
}

export default function ContactInquiries() {
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContactInquiry['status']>('all');
  const [brandFilter, setBrandFilter] = useState<'all' | 'zenslab' | 'terrahome' | 'nexteak' | 'furniture' | 'wallcraft'>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<ContactInquiry | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Fetch inquiries from Supabase
  const fetchInquiries = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching contact inquiries:', error);
      } else {
        setInquiries(data || []);
      }
    } catch (err) {
      console.error('Unexpected error loading inquiries:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchInquiries();

    // Supabase Realtime subscription
    const channel = supabase
      .channel('realtime_contact_inquiries_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_inquiries' },
        () => {
          void fetchInquiries(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInquiries]);

  // Status Change Handler
  const handleStatusChange = async (id: string, newStatus: ContactInquiry['status']) => {
    setActionLoadingId(id);
    try {
      const { error } = await supabase
        .from('contact_inquiries')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ' + error.message);
      } else {
        setInquiries((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
        );
        if (selectedInquiry?.id === id) {
          setSelectedInquiry((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Note Save Handler
  const handleSaveNote = async () => {
    if (!selectedInquiry) return;
    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('contact_inquiries')
        .update({ admin_notes: noteDraft, updated_at: new Date().toISOString() })
        .eq('id', selectedInquiry.id);

      if (error) {
        alert('เกิดข้อผิดพลาดในการบันทึกโน้ต: ' + error.message);
      } else {
        const updated = { ...selectedInquiry, admin_notes: noteDraft };
        setSelectedInquiry(updated);
        setInquiries((prev) =>
          prev.map((item) => (item.id === selectedInquiry.id ? updated : item))
        );
        alert('บันทึกโน้ตสำเร็จ');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  // Delete Handler
  const handleDelete = async (id: string) => {
    if (!confirm('คุณต้องการลบข้อความลูกค้ารายการนี้ใช่หรือไม่?')) return;
    setActionLoadingId(id);
    try {
      const { error } = await supabase.from('contact_inquiries').delete().eq('id', id);
      if (error) {
        alert('เกิดข้อผิดพลาดในการลบ: ' + error.message);
      } else {
        setInquiries((prev) => prev.filter((item) => item.id !== id));
        if (selectedInquiry?.id === id) {
          setSelectedInquiry(null);
        }
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Detail Modal
  const openDetail = (inquiry: ContactInquiry) => {
    setSelectedInquiry(inquiry);
    setNoteDraft(inquiry.admin_notes || '');
  };

  // Filtered inquiries
  const filteredInquiries = useMemo(() => {
    return inquiries.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      const itemBrand = (item.source || 'zenslab').toLowerCase();
      const matchesBrand =
        brandFilter === 'all' ||
        (brandFilter === 'zenslab' && (itemBrand === 'zenslab' || itemBrand === 'zenslab_web')) ||
        itemBrand === brandFilter;

      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.first_name.toLowerCase().includes(query) ||
        item.last_name.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        (item.source && item.source.toLowerCase().includes(query)) ||
        (item.message && item.message.toLowerCase().includes(query)) ||
        (item.admin_notes && item.admin_notes.toLowerCase().includes(query));

      return matchesStatus && matchesBrand && matchesSearch;
    });
  }, [inquiries, statusFilter, brandFilter, search]);

  // Counts
  const counts = useMemo(() => {
    const res = { all: inquiries.length, new: 0, in_progress: 0, contacted: 0, closed: 0 };
    inquiries.forEach((item) => {
      if (item.status in res) {
        res[item.status as keyof typeof res]++;
      }
    });
    return res;
  }, [inquiries]);

  // Brand Counts
  const brandCounts = useMemo(() => {
    const res = { all: inquiries.length, zenslab: 0, terrahome: 0, nexteak: 0, furniture: 0, wallcraft: 0 };
    inquiries.forEach((item) => {
      const b = (item.source || 'zenslab').toLowerCase();
      if (b === 'zenslab' || b === 'zenslab_web') res.zenslab++;
      else if (b === 'terrahome') res.terrahome++;
      else if (b === 'nexteak') res.nexteak++;
      else if (b === 'furniture') res.furniture++;
      else if (b === 'wallcraft') res.wallcraft++;
    });
    return res;
  }, [inquiries]);

  // Date Formatter (Thai)
  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div id="contact-inquiries" className="page-section active">
      {/* 1. Header Toolbar (System Style) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '15px',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 5px 0' }}>ลูกค้าติดต่อหน้าเว็บ (Website Inquiries)</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-gray)' }}>
            ข้อความติดต่อจากทุกเว็บไซต์ในเครือ (ZENSLAB, Terra Home, NexTeak, Furniture, Wallcraft)
            {counts.new > 0 && (
              <span style={{ marginLeft: '10px', fontWeight: 700, color: 'var(--red)' }}>
                ({counts.new} ข้อความใหม่)
              </span>
            )}
          </span>
        </div>

        {/* Search & Filter Controls */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Box */}
          <div className="search-input-wrapper" style={{ position: 'relative', minWidth: '200px' }}>
            <i
              className="fa-solid fa-search"
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-gray)',
              }}
            ></i>
            <input
              type="text"
              placeholder="ค้นหาชื่อ, เบอร์, อีเมล, แบรนด์..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ width: '100%', paddingLeft: '38px', margin: 0, height: '40px', borderRadius: '10px' }}
            />
          </div>

          {/* Brand Filter */}
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value as any)}
            className="form-control"
            style={{ height: '40px', borderRadius: '10px', fontSize: '13px', padding: '0 12px' }}
          >
            <option value="all">ทุกเว็บไซต์ ({brandCounts.all})</option>
            <option value="zenslab">ZENSLAB ({brandCounts.zenslab})</option>
            <option value="terrahome">TERRA HOME ({brandCounts.terrahome})</option>
            <option value="nexteak">NEXTEAK ({brandCounts.nexteak})</option>
            <option value="furniture">FURNITURE ({brandCounts.furniture})</option>
            <option value="wallcraft">WALLCRAFT ({brandCounts.wallcraft})</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="form-control"
            style={{ height: '40px', borderRadius: '10px', fontSize: '13px', padding: '0 12px' }}
          >
            <option value="all">สถานะทั้งหมด ({counts.all})</option>
            <option value="new">ข้อความใหม่ ({counts.new})</option>
            <option value="in_progress">กำลังประสานงาน ({counts.in_progress})</option>
            <option value="contacted">ติดต่อแล้ว ({counts.contacted})</option>
            <option value="closed">ปิดเคสแล้ว ({counts.closed})</option>
          </select>

          {/* Refresh Button */}
          <button
            className="btn-secondary"
            onClick={() => void fetchInquiries(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px' }}
          >
            <i className={`fa-solid fa-rotate-right ${refreshing ? 'fa-spin' : ''}`}></i>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 2. System Table Card */}
      <div className="table-card glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '120px' }}>วันที่</th>
              <th style={{ width: '130px' }}>เว็บไซต์ / แบรนด์</th>
              <th>ลูกค้า</th>
              <th>เบอร์โทรศัพท์</th>
              <th>อีเมล</th>
              <th>ข้อความ</th>
              <th style={{ width: '140px' }}>สถานะ</th>
              <th>โน้ตแอดมิน</th>
              <th style={{ textAlign: 'right', width: '130px' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-gray)' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : filteredInquiries.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-gray)' }}>
                  {search || statusFilter !== 'all' || brandFilter !== 'all'
                    ? 'ไม่พบข้อความที่ตรงกับเงื่อนไขค้นหา'
                    : 'ยังไม่มีข้อความติดต่อจากลูกค้า'}
                </td>
              </tr>
            ) : (
              filteredInquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  {/* วันที่ */}
                  <td data-label="วันที่" style={{ fontSize: '12px', color: 'var(--text-gray)' }}>
                    {formatDate(inquiry.created_at)}
                  </td>

                  {/* เว็บไซต์ / แบรนด์ */}
                  <td data-label="เว็บไซต์">{getBrandBadge(inquiry.source)}</td>

                  {/* ชื่อลูกค้า */}
                  <td data-label="ลูกค้า" style={{ fontWeight: 600 }}>
                    {inquiry.first_name} {inquiry.last_name}
                  </td>

                  {/* เบอร์โทร */}
                  <td data-label="เบอร์โทรศัพท์">
                    {inquiry.phone ? (
                      <a
                        href={`tel:${inquiry.phone}`}
                        style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        <i className="fa-solid fa-phone" style={{ marginRight: '6px', fontSize: '11px' }}></i>
                        {inquiry.phone}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-gray)' }}>-</span>
                    )}
                  </td>

                  {/* อีเมล */}
                  <td data-label="อีเมล">
                    {inquiry.email ? (
                      <a
                        href={`mailto:${inquiry.email}`}
                        style={{ color: 'var(--text-main)', textDecoration: 'none' }}
                      >
                        <i
                          className="fa-solid fa-envelope"
                          style={{ marginRight: '6px', fontSize: '11px', color: 'var(--text-gray)' }}
                        ></i>
                        {inquiry.email}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-gray)' }}>-</span>
                    )}
                  </td>

                  {/* ข้อความ */}
                  <td data-label="ข้อความ">
                    <div
                      style={{
                        maxHeight: '44px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        fontSize: '13px',
                        lineHeight: 1.4,
                      }}
                    >
                      {inquiry.message || <span style={{ color: 'var(--text-gray)', fontStyle: 'italic' }}>-</span>}
                    </div>
                  </td>

                  {/* สถานะ */}
                  <td data-label="สถานะ">
                    <select
                      value={inquiry.status}
                      disabled={actionLoadingId === inquiry.id}
                      onChange={(e) =>
                        void handleStatusChange(inquiry.id, e.target.value as ContactInquiry['status'])
                      }
                      style={{
                        padding: '4px 8px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="new">🔴 ข้อความใหม่</option>
                      <option value="in_progress">🟡 กำลังประสาน</option>
                      <option value="contacted">🔵 ติดต่อแล้ว</option>
                      <option value="closed">🟢 ปิดเคสแล้ว</option>
                    </select>
                  </td>

                  {/* โน้ตแอดมิน */}
                  <td data-label="โน้ตแอดมิน">
                    {inquiry.admin_notes ? (
                      <span style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: 500 }}>
                        {inquiry.admin_notes}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-gray)' }}>-</span>
                    )}
                  </td>

                  {/* จัดการ */}
                  <td data-label="จัดการ" style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => openDetail(inquiry)}
                        title="ดูรายละเอียดและบันทึกโน้ต"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      >
                        <i className="fa-solid fa-file-lines" style={{ marginRight: '4px' }}></i> ดู
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => void handleDelete(inquiry.id)}
                        disabled={actionLoadingId === inquiry.id}
                        title="ลบรายการนี้"
                        style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--red)' }}
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Simple Modal: View Customer Message & Edit Admin Notes */}
      {selectedInquiry && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedInquiry(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="modal-content glass-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              borderRadius: '20px',
              padding: '24px',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                    {selectedInquiry.first_name} {selectedInquiry.last_name}
                  </h3>
                  {getBrandBadge(selectedInquiry.source)}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-gray)' }}>
                  ส่งเมื่อ: {formatDate(selectedInquiry.created_at)}
                </span>
              </div>
              <button
                onClick={() => setSelectedInquiry(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '18px',
                  color: 'var(--text-gray)',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Contact Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  background: 'var(--surface-muted)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-gray)', marginBottom: '2px' }}>
                  เบอร์โทรศัพท์
                </div>
                {selectedInquiry.phone ? (
                  <a
                    href={`tel:${selectedInquiry.phone}`}
                    style={{ fontSize: '14px', fontWeight: 700, color: 'var(--blue)', textDecoration: 'none' }}
                  >
                    <i className="fa-solid fa-phone" style={{ marginRight: '6px' }}></i>
                    {selectedInquiry.phone}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-gray)', fontSize: '13px' }}>-</span>
                )}
              </div>
              <div
                style={{
                  background: 'var(--surface-muted)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-gray)', marginBottom: '2px' }}>อีเมล</div>
                {selectedInquiry.email ? (
                  <a
                    href={`mailto:${selectedInquiry.email}`}
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <i className="fa-solid fa-envelope" style={{ marginRight: '6px', color: 'var(--text-gray)' }}></i>
                    {selectedInquiry.email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-gray)', fontSize: '13px' }}>-</span>
                )}
              </div>
            </div>

            {/* Customer Message */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-gray)',
                  marginBottom: '6px',
                }}
              >
                ข้อความจากลูกค้า:
              </label>
              <div
                style={{
                  background: 'var(--surface-muted)',
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedInquiry.message || 'ลูกค้าไม่ได้พิมพ์ข้อความเพิ่มเติม'}
              </div>
            </div>

            {/* Status Select */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-gray)',
                  marginBottom: '6px',
                }}
              >
                สถานะ:
              </label>
              <select
                value={selectedInquiry.status}
                onChange={(e) =>
                  void handleStatusChange(selectedInquiry.id, e.target.value as ContactInquiry['status'])
                }
                className="form-control"
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '13px', padding: '0 12px' }}
              >
                <option value="new">🔴 ข้อความใหม่</option>
                <option value="in_progress">🟡 กำลังประสานงาน</option>
                <option value="contacted">🔵 ติดต่อแล้ว</option>
                <option value="closed">🟢 ปิดเคสเรียบร้อย</option>
              </select>
            </div>

            {/* Admin Notes Textarea */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-gray)',
                  marginBottom: '6px',
                }}
              >
                โน้ตแอดมิน (บันทึกภายใน):
              </label>
              <textarea
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="พิมพ์บันทึกการติดตามลูกค้า..."
                className="form-control"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setSelectedInquiry(null)}
              >
                ปิด
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={handleSaveNote}
                disabled={savingNote}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="fa-solid fa-check"></i>
                <span>{savingNote ? 'กำลังบันทึก...' : 'บันทึกโน้ต'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
