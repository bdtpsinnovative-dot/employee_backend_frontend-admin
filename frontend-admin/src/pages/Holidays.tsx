import React, { useState, useEffect, useMemo } from 'react';
import { fetchHolidays, createHoliday, deleteHoliday } from '../services/adminApi';
import type { Holiday } from '../types';

export default function Holidays() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [formDays, setFormDays] = useState(1);
  const [formLoading, setFormLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadHolidays();
  }, [year]);

  async function loadHolidays() {
    setLoading(true);
    try {
      const data = await fetchHolidays(year);
      // เรียงตามวันที่
      (data ?? []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setHolidays(data ?? []);
    } catch (err) {
      console.error('โหลดวันหยุดล้มเหลว:', err);
    }
    setLoading(false);
  }

  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const groupedHolidays = useMemo(() => {
    const groups: Record<number, Holiday[]> = {};
    holidays.forEach(h => {
      const m = new Date(h.date).getMonth();
      if (!groups[m]) groups[m] = [];
      groups[m].push(h);
    });
    return groups;
  }, [holidays]);

  function isLongWeekend(iso: string, numDays: number) {
    try {
      const d = new Date(iso);
      for (let i = 0; i < numDays; i++) {
        const day = new Date(d.getTime() + i * 24 * 60 * 60 * 1000).getDay();
        if (day === 1 || day === 5) return true; // วันจันทร์ (1) หรือ ศุกร์ (5)
      }
      return false;
    } catch {
      return false;
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formDate || !formName) return;

    setFormLoading(true);
    try {
      await createHoliday({
        date: formDate,
        name: formName,
        num_days: formDays,
      });
      setFormDate('');
      setFormName('');
      setFormDays(1);
      setShowForm(false);
      await loadHolidays();
    } catch (err) {
      console.error('เพิ่มวันหยุดล้มเหลว:', err);
      alert('เพิ่มวันหยุดล้มเหลว');
    }
    setFormLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบวันหยุดนี้หรือไม่?')) return;

    setActionLoading(id);
    try {
      await deleteHoliday(id);
      await loadHolidays();
    } catch (err) {
      console.error('ลบวันหยุดล้มเหลว:', err);
      alert('ลบวันหยุดล้มเหลว');
    }
    setActionLoading(null);
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  function getDayName(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('th-TH', { weekday: 'long' });
    } catch {
      return '-';
    }
  }

  return (
    <div id="holidays" className="page-section active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2>ตารางวันหยุดบริษัท</h2>
          <select
            className="form-control"
            style={{ width: '120px', margin: 0 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map(y => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <i className={`fa-solid ${showForm ? 'fa-xmark' : 'fa-plus'}`}></i>
          {showForm ? ' ปิดฟอร์ม' : ' เพิ่มวันหยุด'}
        </button>
      </div>

      {showForm && (
        <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', borderRadius: '12px' }}>
          <h4 style={{ marginBottom: '15px', color: 'var(--text-main)' }}>เพิ่มวันหยุดใหม่</h4>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-gray)', marginBottom: '4px' }}>วันที่</label>
              <input
                type="date"
                className="form-control"
                style={{ margin: 0 }}
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-gray)', marginBottom: '4px' }}>ชื่อวันหยุด</label>
              <input
                type="text"
                className="form-control"
                style={{ margin: 0, width: '250px' }}
                placeholder="เช่น วันสงกรานต์"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-gray)', marginBottom: '4px' }}>จำนวนวัน</label>
              <input
                type="number"
                className="form-control"
                style={{ margin: 0, width: '80px' }}
                min={1}
                value={formDays}
                onChange={(e) => setFormDays(Number(e.target.value))}
              />
            </div>
            <button type="submit" className="btn-save" disabled={formLoading}>
              <i className="fa-solid fa-save"></i> {formLoading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </form>
        </div>
      )}

      <div className="table-card glass-panel">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>วัน</th>
              <th>ชื่อวันหยุด</th>
              <th style={{ textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'center' }}>หน่วย</th>
              <th style={{ textAlign: 'right' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody id="holiday-settings-table">
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : holidays.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                  ไม่พบข้อมูลวันหยุดในปี {year + 543}
                </td>
              </tr>
            ) : (
              Object.keys(groupedHolidays).map((monthStr) => {
                const m = Number(monthStr);
                const items = groupedHolidays[m];
                return (
                  <React.Fragment key={m}>
                    <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <td colSpan={6} style={{ fontWeight: 'bold', color: 'var(--blue)', borderBottom: '1px solid var(--border-color)', paddingTop: '15px', paddingBottom: '10px' }}>
                        เดือน{monthNames[m]} 
                        <span style={{ fontSize: '13px', color: 'var(--text-gray)', fontWeight: 'normal', marginLeft: '8px' }}>
                          (มี {items.length} วัน)
                        </span>
                      </td>
                    </tr>
                    {items.map((h) => {
                      const isLW = isLongWeekend(h.date, h.num_days);
                      return (
                        <tr key={h.id}>
                          <td data-label="วันที่">{formatDate(h.date)}</td>
                          <td data-label="วัน">
                            {getDayName(h.date)}
                            {isLW && (
                              <span style={{ display: 'inline-block', marginLeft: '8px', fontSize: '10px', background: 'var(--gold-bg)', color: 'var(--gold)', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1px solid var(--gold-border)' }}>
                                <i className="fa-solid fa-plane"></i> Long Weekend
                              </span>
                            )}
                          </td>
                          <td data-label="ชื่อวันหยุด" style={{ fontWeight: 600 }}>{h.name}</td>
                          <td data-label="จำนวน" style={{ textAlign: 'center' }}>{h.num_days}</td>
                          <td data-label="หน่วย" style={{ textAlign: 'center' }}>วัน</td>
                          <td data-label="จัดการ" style={{ textAlign: 'right' }}>
                            <button
                              className="btn-reject"
                              style={{ fontSize: '12px', padding: '4px 10px' }}
                              disabled={actionLoading === h.id}
                              onClick={() => handleDelete(h.id)}
                            >
                              <i className="fa-solid fa-trash"></i> ลบ
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
