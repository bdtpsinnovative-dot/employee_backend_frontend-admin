import { useEffect, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { createPosition, createTeam, fetchPositions, fetchTeams } from '../services/adminApi';
import type { Position, Team, User } from '../types';
import OrganizationSettingsNav from '../components/OrganizationSettingsNav';

type LayoutContext = { currentUser?: User | null };

export default function TeamManagement() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<LayoutContext>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [positionName, setPositionName] = useState('');
  const [positionTeamId, setPositionTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [teamData, positionData] = await Promise.all([fetchTeams(), fetchPositions()]);
      setTeams(teamData);
      setPositions(positionData);
      setPositionTeamId(current => current || teamData[0]?.id || '');
    } catch (err: any) {
      setError(err.message || 'โหลดข้อมูลทีมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  async function handleAddTeam() {
    const name = teamName.trim();
    const shortName = teamShortName.trim();
    if (!name || !shortName) return;
    setSaving(true);
    setError(null);
    try {
      const team = await createTeam(name, shortName);
      setTeams(current => [...current, team]);
      setPositionTeamId(current => current || team.id);
      setTeamName('');
      setTeamShortName('');
      setSuccess(`เพิ่มทีม ${team.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'เพิ่มทีมไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPosition() {
    const name = positionName.trim();
    if (!name || !positionTeamId) return;
    setSaving(true);
    setError(null);
    try {
      const position = await createPosition(positionTeamId, name);
      setPositions(current => [...current, position]);
      setPositionName('');
      setSuccess(`เพิ่มตำแหน่ง ${position.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'เพิ่มตำแหน่งไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  if (currentUser && currentUser.role !== 'admin') return null;

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <OrganizationSettingsNav
          activeTab="teams"
          action={<button type="button" onClick={() => navigate('/employees')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"><UsersRound className="h-3.5 w-3.5" />จัดการพนักงาน</button>}
        />

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{success}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs md:p-6">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><UsersRound className="h-5 w-5 text-blue-600" />ทีม</h2><p className="mt-1 text-xs text-slate-500">ชื่อทีมและชื่อย่อที่ใช้ในระบบ</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">{teams.length} ทีม</span></div>
          <div className="grid gap-2 md:grid-cols-[1fr_220px_auto]"><input value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="ชื่อทีม เช่น Marketing" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><input value={teamShortName} onChange={event => setTeamShortName(event.target.value)} placeholder="ชื่อย่อ เช่น MKT" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => void handleAddTeam()} disabled={saving || !teamName.trim() || !teamShortName.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />เพิ่มทีมใหม่</button></div>
          <div className="mt-4 flex flex-wrap gap-2">{teams.map(team => <span key={team.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{team.name}<span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-blue-700 ring-1 ring-slate-200">{team.short_name}</span></span>)}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs md:p-6">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><UsersRound className="h-5 w-5 text-blue-600" />ตำแหน่ง</h2><p className="mt-1 text-xs text-slate-500">เพิ่มได้หลายตำแหน่งภายใต้ทีมเดียวกัน</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">{positions.length} ตำแหน่ง</span></div>
          <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]"><select value={positionTeamId} onChange={event => setPositionTeamId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="">เลือกทีม</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.short_name})</option>)}</select><input value={positionName} onChange={event => setPositionName(event.target.value)} placeholder="ชื่อตำแหน่ง เช่น Content Creator" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => void handleAddPosition()} disabled={saving || !positionTeamId || !positionName.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />เพิ่มตำแหน่ง</button></div>
          {loading ? <div className="py-10 text-center text-xs text-slate-400">กำลังโหลดข้อมูล...</div> : <div className="mt-5 grid gap-3 md:grid-cols-2">{teams.map(team => { const teamPositions = positions.filter(position => position.team_id === team.id); return <div key={team.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-extrabold text-slate-800">{team.name}</span><span className="text-[10px] font-bold text-blue-700">{team.short_name}</span></div><div className="flex flex-wrap gap-1.5">{teamPositions.map(position => <span key={position.id} className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{position.name}</span>)}{teamPositions.length === 0 && <span className="text-[11px] text-slate-400">ยังไม่มีตำแหน่ง</span>}</div></div>; })}</div>}
        </section>
      </div>
    </main>
  );
}
