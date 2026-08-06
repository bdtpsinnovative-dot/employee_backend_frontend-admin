import type { ReactNode } from 'react';
import { ArrowLeft, Network, UsersRound } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

type OrganizationSettingsNavProps = {
  activeTab: 'teams' | 'brands';
  action?: ReactNode;
};

export default function OrganizationSettingsNav({ activeTab, action }: OrganizationSettingsNavProps) {
  const navigate = useNavigate();

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="mt-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-2xs transition hover:border-blue-300 hover:text-blue-600"
            aria-label="กลับไปจัดการงาน"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Organization settings</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">ทีมและแบรนด์</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">จัดการโครงสร้างทีม ตำแหน่ง แบรนด์ และผู้รับผิดชอบจากพื้นที่เดียว</p>
          </div>
        </div>
        {action}
      </div>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs" aria-label="เมนูตั้งค่าทีมและแบรนด์">
        <NavLink
          to="/teams"
          role="tab"
          aria-selected={activeTab === 'teams'}
          className={({ isActive }) => `inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition md:flex-none ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`}
        >
          <UsersRound className="h-4 w-4" />
          ทีมและตำแหน่ง
        </NavLink>
        <NavLink
          to="/brand-responsibilities"
          role="tab"
          aria-selected={activeTab === 'brands'}
          className={({ isActive }) => `inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition md:flex-none ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`}
        >
          <Network className="h-4 w-4" />
          แบรนด์และผู้รับผิดชอบ
        </NavLink>
      </nav>
    </>
  );
}
