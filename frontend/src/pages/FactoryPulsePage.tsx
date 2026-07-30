import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, BadgeIndianRupee, CheckCircle2, Factory, Gauge, TimerReset } from 'lucide-react';

import { backend } from '../services/api';
import type { RuntimeUser } from '../types';

type Row = Record<string, unknown>;

function text(value: unknown, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }).format(number);
}

function numberValue(value: unknown) {
  return Number(value ?? 0).toLocaleString('en-IN');
}

export function FactoryPulsePage({ user }: { user: RuntimeUser }) {
  const dashboard = useQuery({ queryKey: ['factorypulse', 'dashboard'], queryFn: backend.factoryPulseDashboard });
  const orders = useQuery({ queryKey: ['factorypulse', 'orders'], queryFn: backend.factoryPulseOrders });
  const downtime = useQuery({ queryKey: ['factorypulse', 'downtime'], queryFn: backend.factoryPulseDowntime });
  const scrap = useQuery({ queryKey: ['factorypulse', 'scrap'], queryFn: backend.factoryPulseScrap });
  const actions = useQuery({ queryKey: ['factorypulse', 'actions'], queryFn: backend.factoryPulseActions });
  const programme = useQuery({ queryKey: ['factorypulse', 'programme'], queryFn: backend.factoryPulseProgramme });
  const kpis = useQuery({ queryKey: ['factorypulse', 'kpis'], queryFn: backend.factoryPulseKpis });
  const loading = dashboard.isLoading || orders.isLoading || downtime.isLoading || scrap.isLoading || actions.isLoading || programme.isLoading || kpis.isLoading;
  const hasError = dashboard.isError || orders.isError || downtime.isError || scrap.isError || actions.isError || programme.isError || kpis.isError;
  const topLosses = (dashboard.data?.top_losses as Row[] | undefined) ?? [];
  const phases = (programme.data?.phases as Row[] | undefined) ?? [];
  const visibleActions = useMemo(() => (actions.data ?? []).slice(0, 4), [actions.data]);

  if (loading) {
    return <div className="panel-card p-6 text-slate-300">Loading FactoryPulse improvement workspace...</div>;
  }

  if (hasError) {
    return <div className="panel-card border-red-300/25 bg-red-400/10 p-6 text-red-100">FactoryPulse API failed to load. Check the backend container and refresh.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="panel-card overflow-hidden p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">FactoryPulse MVP</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Find losses. Engage teams. Prove improvement.</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              Lightweight 90-day manufacturing improvement cockpit for production output, downtime, scrap, issues, corrective actions, OEE and verified financial benefit.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            {text(dashboard.data?.company)} · Acting as {user.name}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Gauge} label="OEE" value={`${text(dashboard.data?.oee_percent, '0')}%`} detail={text(dashboard.data?.oee_definition)} />
        <Metric icon={Factory} label="Production Attainment" value={`${text(dashboard.data?.production_attainment_percent, '0')}%`} detail="Planned output versus actual good output" />
        <Metric icon={TimerReset} label="Downtime" value={`${numberValue(dashboard.data?.downtime_minutes)} min`} detail={`Loss ${money(dashboard.data?.downtime_loss)}`} />
        <Metric icon={BadgeIndianRupee} label="Estimated Savings" value={money(dashboard.data?.estimated_savings)} detail={`${numberValue(dashboard.data?.open_actions)} open actions`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel-card p-6">
          <SectionTitle title="Loss Control Board" subtitle="Top financial losses, current owner and required follow-up." />
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Loss</th>
                  <th className="px-4 py-3">Impact</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {topLosses.map((row) => (
                  <tr key={text(row.loss)} className="text-slate-200">
                    <td className="px-4 py-4 font-semibold text-white">{text(row.loss)}</td>
                    <td className="px-4 py-4 text-amber-100">{money(row.amount)}</td>
                    <td className="px-4 py-4">{text(row.owner)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-card p-6">
          <SectionTitle title="90-Day Programme" subtitle={`Day ${text(programme.data?.day)} · ${text(programme.data?.health)}`} />
          <div className="mt-4 space-y-3">
            {phases.map((phase) => {
              const completed = Number(phase.completed ?? 0);
              const total = Number(phase.total ?? 1);
              const percent = Math.round((completed / total) * 100);
              return (
                <div key={text(phase.phase)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-white">{text(phase.phase)}</span>
                    <span className="text-cyan-100">{completed}/{total}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/[0.04]">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 shadow-[0_0_12px_rgba(34,211,238,0.45)]" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{text(phase.status)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <DataPanel title="Production Orders" rows={orders.data ?? []} columns={['order_number', 'product', 'status', 'target_attainment_percent']} />
        <DataPanel title="Downtime Events" rows={downtime.data ?? []} columns={['machine_id', 'downtime_reason', 'duration_minutes', 'status']} tone="warning" />
        <DataPanel title="Scrap & Quality Events" rows={scrap.data ?? []} columns={['product', 'defect_reason', 'quantity_affected', 'cost_of_poor_quality']} tone="danger" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="panel-card p-6">
          <SectionTitle title="Corrective Actions" subtitle="Actions remain human-owned. AI can recommend drafts later, but cannot close or approve benefits." />
          <div className="mt-4 grid gap-3">
            {visibleActions.map((action) => (
              <div key={text(action.id)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-white">{text(action.action_title)}</p>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">{text(action.status)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">Owner: {text(action.owner)} · Benefit: {money(action.estimated_benefit)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="panel-card p-6">
          <SectionTitle title="KPI Dictionary" subtitle="Visible definitions prevent formula confusion in daily meetings." />
          <div className="mt-4 space-y-3">
            {(kpis.data ?? []).map((kpi) => (
              <div key={text(kpi.kpi)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <p className="font-semibold text-white">{text(kpi.kpi)}</p>
                <p className="mt-1 text-sm text-slate-400">{text(kpi.definition)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return (
    <div className="panel-card flex min-h-40 flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <Icon className="h-5 w-5 text-cyan-200" />
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
        <p className="mt-2 text-sm text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

function DataPanel({ title, rows, columns, tone = 'default' }: { title: string; rows: Row[]; columns: string[]; tone?: 'default' | 'warning' | 'danger' }) {
  const Icon = tone === 'default' ? CheckCircle2 : AlertTriangle;
  return (
    <div className="panel-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-white">{title}</h2>
        <Icon className={`h-5 w-5 ${tone === 'danger' ? 'text-red-200' : tone === 'warning' ? 'text-amber-200' : 'text-cyan-200'}`} />
      </div>
      <div className="mt-4 max-h-80 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.55)_rgba(255,255,255,0.05)]">
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={text(row.id, String(index))} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              {columns.map((column) => (
                <div key={column} className="flex justify-between gap-4 py-1 text-sm">
                  <span className="text-slate-500">{column.replaceAll('_', ' ')}</span>
                  <span className="text-right font-medium text-slate-100">{column.includes('cost') ? money(row[column]) : text(row[column])}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
