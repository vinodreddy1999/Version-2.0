import { CheckCircle2, CircleAlert, CircleDashed, XCircle } from 'lucide-react';

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const state = normalized.includes('healthy') || normalized.includes('ok') || normalized.includes('visible') || normalized.includes('active') || normalized.includes('enabled')
    ? 'good'
    : normalized.includes('warning') || normalized.includes('pending') || normalized.includes('attention') || normalized.includes('trial')
      ? 'warn'
      : normalized.includes('failed') || normalized.includes('error') || normalized.includes('hidden') || normalized.includes('critical') || normalized.includes('suspended') || normalized.includes('disabled')
        ? 'bad'
        : 'neutral';

  const classes = {
    good: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    warn: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
    bad: 'border-red-300/25 bg-red-400/10 text-red-100',
    neutral: 'border-white/15 bg-white/8 text-slate-200',
  }[state];

  const Icon = {
    good: CheckCircle2,
    warn: CircleAlert,
    bad: XCircle,
    neutral: CircleDashed,
  }[state];

  return (
    <span className={`inline-flex min-h-7 items-center gap-1 rounded-md border px-2 py-1 text-caption font-medium ${classes}`}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}
