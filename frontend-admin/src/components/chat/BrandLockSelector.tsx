import { Lock, Globe } from 'lucide-react';
import {
  normalizeBrandSlug,
  toggleBrandSelection,
  type ChatBrandOption,
} from '../../services/chatRoutingService';

interface BrandLockSelectorProps {
  brands: ChatBrandOption[];
  selected?: string[] | null;
  onChange: (nextBrands: string[]) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Clean clickable pill selector to lock an agent or care group to specific brands (empty = all brands).
 */
export default function BrandLockSelector({
  brands,
  selected,
  onChange,
  disabled = false,
  label = 'แบรนด์ที่ดูแล:',
}: BrandLockSelectorProps) {
  const normalizedSelected = (selected || []).map((b) => normalizeBrandSlug(b)).filter(Boolean);
  const isAll = normalizedSelected.length === 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-500 dark:text-zinc-400 shrink-0"
        title={isAll ? 'ดูแลได้ทุกแบรนด์' : 'จำกัดเฉพาะแบรนด์ที่เลือก'}
      >
        {isAll ? <Globe size={12} className="text-slate-400" /> : <Lock size={12} className="text-slate-600 dark:text-zinc-300" />}
        {label && <span>{label}</span>}
      </span>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([])}
        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors cursor-pointer disabled:opacity-45 ${
          isAll
            ? 'bg-slate-800 text-white border-slate-800 dark:bg-zinc-200 dark:text-zinc-900 dark:border-zinc-200'
            : 'bg-white dark:bg-zinc-900 text-slate-400 dark:text-zinc-500 border-slate-200 dark:border-zinc-700 hover:text-slate-700 hover:border-slate-300'
        }`}
      >
        ทุกแบรนด์
      </button>

      {brands.map((b) => {
        const active = normalizedSelected.includes(b.slug);
        return (
          <button
            key={b.slug}
            type="button"
            disabled={disabled}
            onClick={() => onChange(toggleBrandSelection(normalizedSelected, b.slug))}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1 disabled:opacity-45 ${
              active
                ? 'bg-slate-800 text-white border-slate-800 dark:bg-zinc-200 dark:text-zinc-900 dark:border-zinc-200'
                : 'bg-white/70 dark:bg-zinc-900/60 text-slate-400 dark:text-zinc-500 border-slate-200/80 dark:border-zinc-800 hover:text-slate-700 hover:border-slate-300'
            }`}
            title={active ? `กำลังล็อคแบรนด์ ${b.label} (คลิกเพื่อนำออก)` : `คลิกเพื่อล็อคเฉพาะแบรนด์ ${b.label}`}
          >
            {b.logo ? (
              <img
                src={b.logo}
                alt=""
                className={`w-3 h-3 rounded-full object-cover shrink-0 transition-opacity ${
                  active ? 'opacity-100' : 'grayscale opacity-45'
                }`}
              />
            ) : (
              <span
                className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${
                  active ? 'bg-white dark:bg-zinc-900' : 'bg-slate-300 dark:bg-zinc-600'
                }`}
              />
            )}
            <span>{b.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
