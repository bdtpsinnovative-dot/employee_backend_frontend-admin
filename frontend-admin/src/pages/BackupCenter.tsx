import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleAlert,
  Clock3,
  DatabaseBackup,
  Equal,
  FileText,
  HardDrive,
  ImageOff,
  LoaderCircle,
  Rows3,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { createBackup, fetchBackupConfig, fetchBackupJobs, restoreBackup } from '../services/adminApi';
import type { BackupConfig, BackupJob } from '../types';

type ConfirmAction =
  | { type: 'backup' }
  | { type: 'restore'; job: BackupJob; tables: string[] }
  | null;

const ACTIVE_STATUSES: BackupJob['status'][] = ['queued', 'running'];

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return 'ยังไม่มีข้อมูล';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RowDelta({ snapshotRows, currentRows }: { snapshotRows: number; currentRows: number }) {
  const delta = currentRows - snapshotRows;
  if (delta === 0) {
    return <span className="backup-row-delta equal"><Equal size={12} /> ตรงกัน</span>;
  }
  if (delta > 0) {
    return <span className="backup-row-delta increased"><TrendingUp size={12} /> +{delta.toLocaleString('th-TH')} เพิ่มมา</span>;
  }
  return <span className="backup-row-delta decreased"><TrendingDown size={12} /> {Math.abs(delta).toLocaleString('th-TH')} น้อยกว่า</span>;
}

function StatusIcon({ status }: { status: BackupJob['status'] }) {
  if (status === 'succeeded') return <CheckCircle2 size={14} />;
  if (status === 'failed') return <CircleAlert size={14} />;
  return <Clock3 size={14} />;
}

function statusLabel(job: BackupJob) {
  if (job.operation === 'restore') {
    return {
      queued: 'รอเริ่มกู้คืน',
      running: 'กำลังกู้คืน',
      succeeded: 'กู้คืนสำเร็จ',
      failed: 'กู้คืนไม่สำเร็จ',
    }[job.status];
  }
  return {
    queued: 'รอเริ่มสำรอง',
    running: 'กำลังสำรอง',
    succeeded: 'สำรองสำเร็จ',
    failed: 'สำรองไม่สำเร็จ',
  }[job.status];
}

const TABLE_LABELS: Record<string, string> = {
  users: 'พนักงานและบัญชีผู้ใช้',
  work_locations: 'จุดทำงาน',
  brands: 'แบรนด์',
  brand_responsibilities: 'ผู้รับผิดชอบแบรนด์',
  task_categories: 'หมวดหมู่งาน',
  tasks: 'งานหลัก',
  leave_quotas: 'โควต้าวันลา',
  attendance: 'บันทึกเวลาเข้างาน',
  leave_requests: 'คำขอลา',
  offsite_requests: 'คำขอออกหน้างาน',
  holidays: 'วันหยุด',
  settings: 'การตั้งค่าระบบ',
  notifications: 'การแจ้งเตือน',
  task_assignees: 'ผู้รับผิดชอบงาน',
  task_lists: 'รายการงาน',
  task_cards: 'การ์ดงาน',
  task_sub_items: 'รายการย่อย',
  list_assignees: 'ผู้รับผิดชอบรายการ',
  card_attachments: 'ไฟล์แนบการ์ด',
  sub_item_verifications: 'ผลตรวจรายการย่อย',
  task_events: 'ประวัติกิจกรรมงาน',
};

export default function BackupCenter() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [backupNote, setBackupNote] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [backupConfig, setBackupConfig] = useState<BackupConfig>({
    restore_enabled: false,
    backup_enabled: false,
    tables: [],
  });

  const activeJob = useMemo(
    () => jobs.find((job) => ACTIVE_STATUSES.includes(job.status)),
    [jobs],
  );
  const completedBackups = useMemo(
    () => jobs.filter((job) => job.operation === 'backup' && job.status === 'succeeded'),
    [jobs],
  );
  const latestBackup = completedBackups[0];

  const loadJobs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      setError('');
      setJobs(await fetchBackupJobs());
    } catch (err: any) {
      setError(err?.response?.data?.error || 'โหลดรายการ backup ไม่สำเร็จ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void fetchBackupConfig()
      .then(setBackupConfig)
      .catch(() => setError('โหลดการตั้งค่า Backup ไม่สำเร็จ'));
  }, []);

  const activeJobId = activeJob?.id;
  useEffect(() => {
    if (!activeJobId) return;
    const timer = window.setInterval(() => void loadJobs(), 2500);
    return () => window.clearInterval(timer);
  }, [activeJobId, loadJobs]);

  async function runConfirmedAction() {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.type === 'backup') {
        await createBackup(backupNote.trim());
        setBackupNote('');
      } else {
        await restoreBackup(confirmAction.job.id, confirmAction.tables);
      }
      setConfirmAction(null);
      await loadJobs(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'ไม่สามารถดำเนินการ backup ได้');
    } finally {
      setActionLoading(false);
    }
  }

  const isRestoreConfirm = confirmAction?.type === 'restore';
  const restoreTableStats = new Map(
    (isRestoreConfirm ? confirmAction.job.table_stats ?? [] : []).map((stat) => [stat.name, stat]),
  );

  return (
    <section className="backup-page">
      <div className="backup-header">
        <div>
          <div className="backup-eyebrow"><DatabaseBackup size={15} /> DATA CONTROL CENTER</div>
          <h1>สำรองและกู้คืนข้อมูล</h1>
          <p>สร้างจุดเซฟของฐานข้อมูล HR โดยไม่สำรองหรือเปลี่ยนแปลงไฟล์รูป</p>
        </div>
        {backupConfig.backup_enabled && <div className="backup-create-controls">
          <label className="backup-note-field">
            <FileText size={16} />
            <input
              className="backup-note-input"
              value={backupNote}
              onChange={(event) => setBackupNote(event.target.value)}
              maxLength={200}
              placeholder="โน้ตจุดเซฟ เช่น ก่อนอัปเดตระบบ"
              aria-label="โน้ตจุดเซฟ"
            />
          </label>
          <button
            className="btn-primary backup-create-button"
            onClick={() => setConfirmAction({ type: 'backup' })}
            disabled={Boolean(activeJob) || actionLoading || !backupNote.trim()}
            title={!backupNote.trim() ? 'กรุณาใส่โน้ตก่อนสร้างจุดเซฟ' : 'สร้างจุดเซฟ'}
          >
            <DatabaseBackup size={18} />
            สร้างจุดสำรอง
          </button>
        </div>}
      </div>

      {activeJob && (
        <div className="backup-maintenance-banner">
          <LoaderCircle className="backup-spin" size={20} />
          <div>
            <strong>{activeJob.operation === 'restore' ? 'กำลังกู้คืนข้อมูลเข้า Local' : 'กำลังสร้างจุดสำรอง'}</strong>
            <span>{activeJob.operation === 'restore'
              ? 'ระบบจะปิดการบันทึกข้อมูลชั่วคราวจนกว่างานจะเสร็จ'
              : 'กำลังอ่านฐานข้อมูลเพื่อสร้างจุดเซฟ โดยไม่แตะรูปหรือไฟล์'}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="backup-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="ปิดข้อความผิดพลาด"><X size={16} /></button>
        </div>
      )}

      <div className="backup-stats-grid">
        <div className="backup-stat-card backup-stat-primary">
          <span className="backup-stat-icon"><ShieldCheck size={20} /></span>
          <div><strong>{latestBackup ? 'มีจุดเซฟแล้ว' : 'ยังไม่มีจุดเซฟ'}</strong><small>สถานะจุดสำรองล่าสุด</small></div>
        </div>
        <div className="backup-stat-card">
          <span className="backup-stat-icon blue"><HardDrive size={20} /></span>
          <div><strong>{completedBackups.length}</strong><small>จุดสำรองที่เก็บอยู่</small></div>
        </div>
        <div className="backup-stat-card">
          <span className="backup-stat-icon violet"><DatabaseBackup size={20} /></span>
          <div><strong>Database only</strong><small>ไม่รวมรูปและไฟล์แนบ</small></div>
        </div>
      </div>

      <div className="backup-info-strip">
        <div><ShieldCheck size={18} /><span><strong>โหมดจุดเซฟฐานข้อมูล</strong> รูปและไฟล์ใน R2 จะไม่ถูกสำรอง ลบ หรือกู้คืน</span></div>
        <span className="backup-retention">เก็บย้อนหลัง 30 วัน</span>
      </div>

      <div className="backup-table-card">
        <div className="backup-table-heading">
          <div><h2>ประวัติการทำงาน</h2><p>จุดเซฟที่สร้างสำเร็จจะแสดงในรายการนี้ และกู้คืนได้เมื่อเปิดสิทธิ์ Restore ไว้ใน Backend</p></div>
          <button className="backup-refresh-button" onClick={() => void loadJobs(true)} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'backup-spin' : ''} size={16} /> รีเฟรช
          </button>
        </div>

        {loading ? (
          <div className="backup-empty"><LoaderCircle className="backup-spin" size={28} /><span>กำลังโหลดรายการ...</span></div>
        ) : jobs.length === 0 ? (
          <div className="backup-empty"><DatabaseBackup size={30} /><strong>ยังไม่มีจุดสำรองข้อมูล</strong><span>{backupConfig.backup_enabled ? 'กด “สร้างจุดสำรอง” เพื่อบันทึกข้อมูลชุดแรก' : 'การสร้างจุดสำรองยังไม่เปิดใช้งานในสภาพแวดล้อมนี้'}</span></div>
        ) : (
          <div className="backup-table-wrap">
            <table className="backup-table">
              <thead><tr>
                <th><span className="backup-heading-label"><Archive size={14} />ประเภท</span></th>
                <th><span className="backup-heading-label"><Clock3 size={14} />วันเวลา</span></th>
                <th><span className="backup-heading-label"><FileText size={14} />โน้ต</span></th>
                <th><span className="backup-heading-label"><HardDrive size={14} />ขนาดฐานข้อมูล</span></th>
                <th><span className="backup-heading-label"><ImageOff size={14} />รูป/ไฟล์</span></th>
                <th><span className="backup-heading-label"><ShieldCheck size={14} />สถานะ</span></th>
                <th />
              </tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td data-label="ประเภท"><span className={`backup-operation ${job.operation}`}><span />{job.operation === 'restore' ? <RotateCcw size={14} /> : <Archive size={14} />}{job.operation === 'restore' ? 'กู้คืนข้อมูล' : job.description.includes('อัตโนมัติ') ? 'จุดย้อนกลับอัตโนมัติ' : 'สำรองข้อมูล'}</span></td>
                    <td data-label="วันเวลา"><span className="backup-value-with-icon"><Clock3 size={14} /><span className="backup-date">{formatDate(job.created_at)}</span></span></td>
                    <td data-label="โน้ต"><span className="backup-note-cell"><FileText size={14} />{job.note || 'ไม่มีโน้ต'}</span></td>
                    <td data-label="ขนาดฐานข้อมูล"><span className="backup-value-with-icon"><HardDrive size={14} />{formatBytes(job.database_size_bytes)}</span></td>
                    <td data-label="รูป/ไฟล์"><span className="backup-value-with-icon backup-muted-value"><ImageOff size={14} />ไม่รวม</span></td>
                    <td data-label="สถานะ"><span className={`backup-status ${job.status}`}><StatusIcon status={job.status} />{statusLabel(job)}</span></td>
                    <td data-label="การทำงาน">
                      {job.operation === 'backup' && job.status === 'succeeded' && (
                        <button
                          className="backup-restore-button"
                          onClick={() => setConfirmAction({ type: 'restore', job, tables: backupConfig.tables })}
                          disabled={!backupConfig.restore_enabled || Boolean(activeJob) || actionLoading}
                          title={backupConfig.restore_enabled ? 'กู้คืนฐานข้อมูลจากจุดเซฟนี้' : 'Restore ยังไม่เปิดใช้งานในสภาพแวดล้อมนี้'}
                        >
                          <RotateCcw size={15} /> {backupConfig.restore_enabled ? 'กู้คืน' : 'Restore ยังไม่เปิด'}
                        </button>
                      )}
                      {job.status === 'failed' && <span className="backup-failure" title={job.error_message}>ตรวจสอบข้อผิดพลาด</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmAction && (
        <div className="backup-modal-backdrop" role="presentation" onMouseDown={() => !actionLoading && setConfirmAction(null)}>
          <div className={`backup-modal ${isRestoreConfirm ? 'restore-modal' : ''}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className={`backup-modal-icon ${isRestoreConfirm ? 'restore' : 'create'}`}>
              {isRestoreConfirm ? <RotateCcw size={24} /> : <DatabaseBackup size={24} />}
            </div>
            <h2>{isRestoreConfirm ? 'ยืนยันการกู้คืนข้อมูล?' : 'สร้างจุดสำรองตอนนี้?'}</h2>
            <p>
              {isRestoreConfirm
                ? `ระบบจะสร้างจุดย้อนกลับก่อน แล้วกู้คืนฐานข้อมูลจากจุดเซฟ ณ ${formatDate(confirmAction.job.created_at)} อาจใช้เวลาหลายนาที`
                : 'ระบบจะสำรองเฉพาะฐานข้อมูลเป็นจุดเซฟใหม่ โดยไม่แตะรูปหรือไฟล์ใน R2 และเก็บไว้ 30 วัน'}
            </p>
            {!isRestoreConfirm && (
              <div className="backup-note-preview"><strong>โน้ตจุดเซฟ:</strong> {backupNote}</div>
            )}
            {isRestoreConfirm && (
              <div className="backup-table-selector">
                <div className="backup-table-selector-heading">
                  <strong><Rows3 size={15} /> เปรียบเทียบข้อมูลก่อนกู้คืน</strong>
                  <span>สีเขียว = จำนวนตรงกัน · สีส้ม = มีข้อมูลเพิ่ม · สีแดง = มีข้อมูลน้อยลง</span>
                </div>
                <div className="backup-table-options">
                  {backupConfig.tables.map((table) => {
                    const selected = confirmAction.tables.includes(table);
                    const stat = restoreTableStats.get(table);
                    return (
                      <label key={table} className="backup-table-option">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setConfirmAction((current) => current?.type === 'restore'
                            ? {
                              ...current,
                              tables: selected
                                ? current.tables.filter((item) => item !== table)
                                : [...current.tables, table],
                            }
                            : current)}
                        />
                        <span className="backup-table-option-content">
                          <span className="backup-table-option-title"><Rows3 size={14} />{TABLE_LABELS[table] || table}</span>
                          {stat && (
                            <span className="backup-row-comparison">
                              <span className="backup-row-chip snapshot"><Archive size={11} />เซฟ {stat.snapshot_rows.toLocaleString('th-TH')}</span>
                              <span className="backup-row-chip current"><DatabaseBackup size={11} />ปัจจุบัน {stat.current_rows.toLocaleString('th-TH')}</span>
                              <RowDelta snapshotRows={stat.snapshot_rows} currentRows={stat.current_rows} />
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="backup-modal-actions">
              <button className="backup-cancel-button" onClick={() => setConfirmAction(null)} disabled={actionLoading}>ยกเลิก</button>
              <button className={`backup-confirm-button ${isRestoreConfirm ? 'restore' : ''}`} onClick={() => void runConfirmedAction()} disabled={actionLoading || (isRestoreConfirm && confirmAction.tables.length === 0)}>
                {actionLoading ? <LoaderCircle className="backup-spin" size={16} /> : <CheckCircle2 size={16} />}
                {isRestoreConfirm ? 'ยืนยันกู้คืน' : 'เริ่มสำรองข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
