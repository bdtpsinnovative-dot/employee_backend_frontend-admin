import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, 
  RefreshCw, 
  Search, 
  MessageSquare, 
  LayoutList, 
  FileText, 
  User as UserIcon, 
  Clock, 
  CheckCircle2, 
  SlidersHorizontal,
  ExternalLink,
  X
} from 'lucide-react';
import { fetchAllTaskEvents } from '../services/adminApi';
import type { TaskEvent } from '../types';

export default function TaskLogs() {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'system' | 'comment'>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      setLoading(true);
      const data = await fetchAllTaskEvents();
      setEvents(data ?? []);
    } catch (error) {
      console.error('Failed to load task events:', error);
    } finally {
      setLoading(false);
    }
  }

  // List of unique operators for filtering
  const uniqueUsers = useMemo(() => {
    const userMap = new Map<string, string>();
    events.forEach((ev) => {
      const name = `${ev.user_first_name || ''} ${ev.user_last_name || ''}`.trim() || 'System User';
      if (ev.user_id && !userMap.has(ev.user_id)) {
        userMap.set(ev.user_id, name);
      }
    });
    return Array.from(userMap.entries()).map(([id, name]) => ({ id, name }));
  }, [events]);

  // Statistics KPI calculations
  const stats = useMemo(() => {
    const total = events.length;
    const systemEvents = events.filter((e) => e.event_type === 'system').length;
    const commentEvents = events.filter((e) => e.event_type === 'comment').length;
    const uniqueOperatorsCount = new Set(events.map((e) => e.user_id)).size;

    return { total, systemEvents, commentEvents, uniqueOperatorsCount };
  }, [events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Filter by Event Type
      if (selectedType !== 'all' && ev.event_type !== selectedType) {
        return false;
      }
      // Filter by Operator
      if (selectedUser !== 'all' && ev.user_id !== selectedUser) {
        return false;
      }
      // Filter by Search Query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const userName = `${ev.user_first_name || ''} ${ev.user_last_name || ''}`.toLowerCase();
        const taskTitle = (ev.task_title || '').toLowerCase();
        const content = (ev.content || '').toLowerCase();
        const action = (ev.action || '').toLowerCase();

        return (
          userName.includes(query) ||
          taskTitle.includes(query) ||
          content.includes(query) ||
          action.includes(query)
        );
      }
      return true;
    });
  }, [events, selectedType, selectedUser, searchTerm]);

  // Group events by Date for Timeline view
  const groupedEvents = useMemo(() => {
    const groups: { [dateKey: string]: TaskEvent[] } = {};
    filteredEvents.forEach((event) => {
      const dateObj = new Date(event.created_at);
      const dateKey = isNaN(dateObj.getTime())
        ? 'Unknown Date'
        : dateObj.toISOString().split('T')[0];
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });
    return groups;
  }, [filteredEvents]);

  // Date Label Formatter
  function formatDateHeader(dateStr: string) {
    if (dateStr === 'Unknown Date') return 'ไม่ระบุวันที่';
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'วันนี้ (Today)';
    if (dateStr === yesterdayStr) return 'เมื่อวานนี้ (Yesterday)';

    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // Exact Time Formatter
  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Relative Time Formatter
  function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'เมื่อครู่นี้';
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
    if (diffDays === 1) return '1 วันที่แล้ว';
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
    return date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
  }

  // Format Status Badge Color
  function renderStatusBadge(content?: string) {
    if (!content) return null;
    const status = content.toLowerCase().trim();

    let cls = 'status-badge-pill todo';
    let label = content;

    if (status.includes('done') || status.includes('completed') || status.includes('เสร็จ')) {
      cls = 'status-badge-pill done';
      label = 'Done / เสร็จสิ้น';
    } else if (status.includes('in_progress') || status.includes('doing') || status.includes('กำลังทำ')) {
      cls = 'status-badge-pill in_progress';
      label = 'In Progress / กำลังดำเนินการ';
    } else if (status.includes('todo') || status.includes('pending') || status.includes('รอดำเนินการ')) {
      cls = 'status-badge-pill todo';
      label = 'To Do / รอดำเนินการ';
    } else if (status.includes('review') || status.includes('ตรวจ')) {
      cls = 'status-badge-pill review';
      label = 'Pending Review / รอตรวจสอบ';
    } else if (status.includes('cancel') || status.includes('ยกเลิก')) {
      cls = 'status-badge-pill cancel';
      label = 'Cancelled / ยกเลิก';
    }

    return <span className={cls}>{label}</span>;
  }

  const hasActiveFilters = searchTerm !== '' || selectedType !== 'all' || selectedUser !== 'all';

  function resetFilters() {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedUser('all');
  }

  return (
    <div className="task-logs-container">
      {/* Top Header Banner */}
      <div className="task-logs-header">
        <div>
          <h1>
            <Activity style={{ color: 'var(--blue)' }} />
            System Activity & Audit Log
          </h1>
          <p>บันทึกประวัติการเปลี่ยนสถานะงาน ความคิดเห็น และกิจกรรมการทำงานของระบบแบบ Real-time</p>
        </div>

        <button
          onClick={loadEvents}
          disabled={loading}
          className="btn-signin"
          style={{ width: 'auto', padding: '10px 20px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: 0 }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Metric Overview Cards */}
      <div className="task-logs-metrics">
        {/* Card 1: Total Events */}
        <div className="task-metric-card">
          <div className="task-metric-icon blue">
            <Activity size={22} />
          </div>
          <div>
            <div className="task-metric-val">{stats.total}</div>
            <div className="task-metric-label">กิจกรรมทั้งหมด</div>
          </div>
        </div>

        {/* Card 2: System Status Updates */}
        <div className="task-metric-card">
          <div className="task-metric-icon green">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="task-metric-val">{stats.systemEvents}</div>
            <div className="task-metric-label">อัปเดตสถานะระบบ</div>
          </div>
        </div>

        {/* Card 3: Comments & Notes */}
        <div className="task-metric-card">
          <div className="task-metric-icon purple">
            <MessageSquare size={22} />
          </div>
          <div>
            <div className="task-metric-val">{stats.commentEvents}</div>
            <div className="task-metric-label">ความคิดเห็น & โน้ต</div>
          </div>
        </div>

        {/* Card 4: Active Operators */}
        <div className="task-metric-card">
          <div className="task-metric-icon amber">
            <UserIcon size={22} />
          </div>
          <div>
            <div className="task-metric-val">{stats.uniqueOperatorsCount}</div>
            <div className="task-metric-label">ผู้ดำเนินการทั้งหมด</div>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="task-logs-control-bar">
        <div className="task-logs-control-top">
          {/* Search Box */}
          <div className="task-search-box">
            <Search className="task-search-icon" size={16} />
            <input
              type="text"
              placeholder="ค้นหาชื่อผู้ดำเนินการ, ชื่องาน, ข้อความความคิดเห็น..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-gray)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Event Type Filter Tabs */}
          <div className="task-btn-group">
            <button
              onClick={() => setSelectedType('all')}
              className={`task-tab-btn ${selectedType === 'all' ? 'active' : ''}`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setSelectedType('system')}
              className={`task-tab-btn ${selectedType === 'system' ? 'active' : ''}`}
            >
              อัปเดตระบบ
            </button>
            <button
              onClick={() => setSelectedType('comment')}
              className={`task-tab-btn ${selectedType === 'comment' ? 'active' : ''}`}
            >
              ความคิดเห็น
            </button>
          </div>

          {/* Operator Dropdown Filter */}
          {uniqueUsers.length > 0 && (
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.12)',
                background: 'rgba(255,255,255,0.8)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">ผู้ดำเนินการทั้งหมด</option>
              {uniqueUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          )}

          {/* View Mode Switcher */}
          <div className="task-btn-group">
            <button
              onClick={() => setViewMode('timeline')}
              title="Timeline View"
              className={`task-tab-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              style={{ padding: '6px 10px' }}
            >
              <LayoutList size={16} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`task-tab-btn ${viewMode === 'table' ? 'active' : ''}`}
              style={{ padding: '6px 10px' }}
            >
              <FileText size={16} />
            </button>
          </div>
        </div>

        {/* Filter Info & Clear */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-gray)', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <span>พบลัพธ์ <strong style={{ color: 'var(--text-main)' }}>{filteredEvents.length}</strong> รายการ</span>
            <button
              onClick={resetFilters}
              style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <X size={14} /> ล้างตัวกรองทั้งหมด
            </button>
          </div>
        )}
      </div>

      {/* Main Glass Card */}
      <div className="task-logs-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-gray)', fontSize: '14px' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--blue)' }} />
            <div>กำลังโหลดข้อมูลกิจกรรมระบบ...</div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center' }}>
            <SlidersHorizontal size={40} style={{ color: 'var(--text-gray)', margin: '0 auto 12px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>ไม่พบประวัติกิจกรรม</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-gray)', marginBottom: '16px' }}>
              {hasActiveFilters ? 'ไม่พบข้อมูลที่ตรงตามเงื่อนไข ลองล้างตัวกรองเพื่อดูทั้งหมด' : 'ยังไม่มีประวัติกิจกรรมในระบบขณะนี้'}
            </p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="btn-secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }}>
                ล้างตัวกรอง
              </button>
            )}
          </div>
        ) : viewMode === 'timeline' ? (
          /* Timeline Feed View */
          <div className="task-timeline-feed">
            {Object.entries(groupedEvents).map(([dateKey, groupEvents]) => (
              <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Date Header */}
                <div className="task-date-group-header">
                  <div className="task-date-pill">{formatDateHeader(dateKey)}</div>
                  <div className="task-date-line" />
                  <span style={{ fontSize: '11px', color: 'var(--text-gray)', fontFamily: 'monospace' }}>
                    {groupEvents.length} รายการ
                  </span>
                </div>

                {/* Timeline Items */}
                <div className="task-timeline-list">
                  {groupEvents.map((event) => {
                    const operatorName = `${event.user_first_name || ''} ${event.user_last_name || ''}`.trim() || 'System';
                    const isSystem = event.event_type === 'system';

                    return (
                      <div key={event.id} className="task-timeline-item">
                        {/* Circle Node */}
                        <div className={`task-timeline-node ${isSystem ? 'system' : 'comment'}`}>
                          {isSystem ? <CheckCircle2 size={13} /> : <MessageSquare size={11} />}
                        </div>

                        {/* Event Card */}
                        <div className="task-event-card">
                          <div className="task-event-meta">
                            <div className="task-operator-info">
                              {event.user_avatar_url ? (
                                <img src={event.user_avatar_url} alt="" className="task-operator-avatar" />
                              ) : (
                                <div className="task-operator-avatar-fallback">
                                  {operatorName.charAt(0)}
                                </div>
                              )}

                              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                                {operatorName}
                              </span>

                              <span style={{ fontSize: '11px', color: 'var(--text-gray)' }}>•</span>

                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: isSystem ? 'rgba(34, 197, 94, 0.1)' : 'rgba(109, 40, 217, 0.1)',
                                  color: isSystem ? 'var(--green-text)' : 'var(--purple)'
                                }}
                              >
                                {isSystem ? 'อัปเดตระบบ' : 'ความคิดเห็น'}
                              </span>
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--text-gray)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              <span>{formatTime(event.created_at)}</span>
                              <span>({formatRelativeTime(event.created_at)})</span>
                            </div>
                          </div>

                          {/* Task Context Link Tag */}
                          {event.task_title && (
                            <div style={{ marginBottom: '8px' }}>
                              <Link to={`/tasks?id=${event.task_id}`} className="task-tag-link">
                                <span>งาน: {event.task_title}</span>
                                <ExternalLink size={12} />
                              </Link>
                            </div>
                          )}

                          {/* Activity Content */}
                          <div>
                            {isSystem ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-gray)' }}>เปลี่ยนสถานะเป็น</span>
                                {renderStatusBadge(event.content)}
                              </div>
                            ) : (
                              <div className="task-comment-quote">
                                {event.content}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.03)', borderBottom: '1px solid rgba(0, 0, 0, 0.08)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-gray)' }}>
                  <th style={{ padding: '14px 20px', textAlign: 'left' }}>เวลา</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left' }}>ผู้ดำเนินการ</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left' }}>ชื่องาน</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left' }}>กิจกรรม</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center' }}>ประเภท</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => {
                  const operatorName = `${event.user_first_name || ''} ${event.user_last_name || ''}`.trim() || 'System';
                  const isSystem = event.event_type === 'system';

                  return (
                    <tr key={event.id} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.04)' }}>
                      <td style={{ padding: '14px 20px', fontSize: '12px', color: 'var(--text-gray)', whiteSpace: 'nowrap' }}>
                        <div>{new Date(event.created_at).toLocaleString('th-TH')}</div>
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>{formatRelativeTime(event.created_at)}</div>
                      </td>

                      <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {event.user_avatar_url ? (
                            <img src={event.user_avatar_url} alt="" className="task-operator-avatar" />
                          ) : (
                            <div className="task-operator-avatar-fallback">{operatorName.charAt(0)}</div>
                          )}
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{operatorName}</span>
                        </div>
                      </td>

                      <td style={{ padding: '14px 20px', fontSize: '12px' }}>
                        {event.task_title ? (
                          <Link to={`/tasks?id=${event.task_id}`} className="task-tag-link">
                            <span>{event.task_title}</span>
                            <ExternalLink size={12} />
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--text-gray)' }}>-</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 20px', fontSize: '13px' }}>
                        {isSystem ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--text-gray)', fontSize: '12px' }}>อัปเดตเป็น:</span>
                            {renderStatusBadge(event.content)}
                          </div>
                        ) : (
                          <div style={{ background: 'rgba(255, 255, 255, 0.7)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)' }}>
                            {event.content}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 20px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: '12px',
                            background: isSystem ? 'rgba(34, 197, 94, 0.12)' : 'rgba(109, 40, 217, 0.12)',
                            color: isSystem ? 'var(--green-text)' : 'var(--purple)'
                          }}
                        >
                          {isSystem ? 'System' : 'Comment'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
