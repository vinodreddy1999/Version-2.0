import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  icon?: ReactNode;
  onClick?: () => void;
  accent?: 'blue' | 'violet' | 'emerald' | 'amber';
};

export function StatCard({ label, value, helper, icon, onClick, accent = 'blue' }: StatCardProps) {
  const accentClasses = {
    blue: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20',
    violet: 'text-violet-300 bg-violet-500/10 border-violet-400/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-400/20',
  }[accent];

  const indicatorClass = {
    blue: 'bg-cyan-400',
    violet: 'bg-violet-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
  }[accent];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
          <p className="enterprise-kpi mt-2 text-white">{value}</p>
        </div>
        <div className="flex items-center gap-2">
          {icon ? <div className={`rounded-lg border p-2 ${accentClasses}`}>{icon}</div> : <span className={`mt-1 h-1.5 w-7 rounded-sm ${indicatorClass}`} aria-hidden="true" />}
          {onClick ? <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-white" /> : null}
        </div>
      </div>
      {helper ? <p className="mt-3 text-body-sm text-slate-400">{helper}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="enterprise-card group min-h-[132px] w-full p-token-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-[#101e30]"
      >
        {content}
      </button>
    );
  }

  return (
    <article className="enterprise-card min-h-[132px] w-full p-token-4 text-left">
      {content}
    </article>
  );
}
