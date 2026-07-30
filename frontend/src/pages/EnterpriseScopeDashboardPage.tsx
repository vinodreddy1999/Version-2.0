import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, Layers3, Scale } from 'lucide-react';

import { LoadingState } from '../components/LoadingState';
import { useEnterpriseAccess } from '../enterprise/EnterpriseAccessContext';
import { enterpriseQueryKeys } from '../lib/queryKeys';
import { backend } from '../services/api';

export function EnterpriseScopeDashboardPage({ dashboardKey, title }: { dashboardKey: string; title: string }) {
  const {
    activeEnterprise,
    activeScope,
    compareScopeIds,
  } = useEnterpriseAccess();
  const dashboard = useQuery({
    queryKey: enterpriseQueryKeys.dashboard({
      enterpriseId: activeEnterprise?.id,
      scopeType: activeScope?.type,
      scopeId: activeScope?.id,
      dashboardKey,
      currency: activeEnterprise?.default_currency,
      timezone: activeEnterprise?.default_timezone,
      compareScopeIds,
    }),
    queryFn: () => backend.enterpriseDashboard(
      activeEnterprise!.id,
      activeScope!.type,
      activeScope!.id,
      compareScopeIds,
    ),
    enabled: Boolean(activeEnterprise && activeScope),
    retry: false,
  });

  if (dashboard.isLoading) return <LoadingState label={`Loading ${title}`} />;
  if (dashboard.isError) {
    return (
      <section className="rounded-lg border border-rose-300/25 bg-rose-400/[0.06] p-5 text-sm text-rose-100">
        This dashboard is unavailable in the active enterprise scope. Choose a permitted scope or contact an enterprise administrator.
      </section>
    );
  }
  if (!dashboard.data) return null;

  const { primary, comparisons, normalization_warning: warning } = dashboard.data;
  const maxRecords = Math.max(primary.total_records, ...comparisons.map((row) => row.total_records), 1);
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Boxes} label="Scoped records" value={primary.total_records.toLocaleString()} />
        <Metric icon={Activity} label="Open attention" value={primary.open_records.toLocaleString()} />
        <Metric icon={Layers3} label="Active data domains" value={primary.module_count.toLocaleString()} />
        <Metric icon={Scale} label="Recorded quantity" value={primary.total_quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
      </section>

      <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">{primary.scope_label}</h2>
            <p className="mt-1 text-sm text-slate-400">Module activity authorized for the active {primary.scope_type.replace('_', ' ')} scope.</p>
          </div>
          <p className="text-xs text-slate-500">Data through {primary.data_through ? new Date(primary.data_through).toLocaleString() : 'no records yet'}</p>
        </div>
        {primary.modules.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {primary.modules.map((module) => (
              <div key={module.module_key} className="rounded-lg border border-slate-700/45 bg-slate-950/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold capitalize text-white">{module.module_key.replace(/[-_]/g, ' ')}</span>
                  <span className="text-sm text-cyan-200">{module.record_count.toLocaleString()}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-400" style={{ width: `${Math.max(3, module.record_count / Math.max(primary.total_records, 1) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : <div className="mt-5 rounded-lg border border-dashed border-slate-700/60 p-6 text-sm text-slate-400">No module records are available in this authorized scope.</div>}
      </section>

      {comparisons.length ? (
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
          <h2 className="font-semibold text-white">Authorized comparison</h2>
          <p className="mt-1 text-sm text-slate-400">{warning}</p>
          <div className="mt-5 space-y-3">
            {[primary, ...comparisons].map((scope) => (
              <div key={scope.scope_id} className="grid items-center gap-3 sm:grid-cols-[220px_1fr_100px]">
                <span className="truncate text-sm font-medium text-slate-200">{scope.scope_label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${scope.total_records / maxRecords * 100}%` }} />
                </div>
                <span className="text-right text-sm text-cyan-200">{scope.total_records.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-cyan-200" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
