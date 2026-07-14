import { useQuery } from '@tanstack/react-query';
import { Activity, DatabaseZap, FileUp, ShieldCheck } from 'lucide-react';

import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { Panel } from '../components/Panel';
import { StatCard } from '../components/StatCard';
import { queryKeys } from '../lib/queryKeys';
import { usePlatform } from '../platform/PlatformContext';
import { backend } from '../services/api';

export function IntegrationDashboard() {
  const { selectedClientId } = usePlatform();
  const systems = useQuery({ queryKey: queryKeys.integration.systems(selectedClientId), queryFn: backend.connectedSystems });
  const quality = useQuery({ queryKey: queryKeys.integration.quality(selectedClientId), queryFn: backend.dataQuality });
  const readiness = useQuery({ queryKey: queryKeys.integration.readiness(selectedClientId), queryFn: backend.aiReadiness });
  const uploads = useQuery({ queryKey: queryKeys.integration.uploads(selectedClientId), queryFn: backend.uploads });
  const queries = [systems, quality, readiness, uploads];

  if (queries.some((query) => query.isLoading)) return <LoadingState label="Loading integration dashboard" />;
  const error = queries.map((query) => query.error).find(Boolean);
  if (error) return <ErrorState title="Integration dashboard unavailable" error={error} />;

  const connected = systems.data ?? [];
  const healthy = connected.filter((system) => system.connection_status.toLowerCase() === 'healthy').length;
  const qualityRows = quality.data?.scores ?? [];
  const readinessRows = readiness.data?.readiness ?? [];
  const qualityScore = Math.round(quality.data?.overall_score ?? 0);
  const readinessScore = Math.round(readiness.data?.overall_ai_readiness ?? 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected Systems" value={connected.length} helper={`${healthy} healthy`} icon={<DatabaseZap className="h-5 w-5" />} />
        <StatCard label="Data Quality" value={`${qualityScore}%`} helper={`${qualityRows.length} measured domains`} icon={<ShieldCheck className="h-5 w-5" />} accent="amber" />
        <StatCard label="Data Readiness" value={`${readinessScore}%`} helper={`${readinessRows.length} assessed domains`} icon={<Activity className="h-5 w-5" />} accent="violet" />
        <StatCard label="Uploads" value={(uploads.data ?? []).length} helper="Persisted import files" icon={<FileUp className="h-5 w-5" />} accent="emerald" />
      </div>
      <Panel title="Connection health" description="Current source connections for the selected client scope.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {connected.map((system) => (
            <div key={system.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold text-white">{system.system_name}</p><p className="mt-1 text-xs text-slate-400">{system.system_type}</p></div>
                <span className="text-sm text-cyan-200">{system.health_score}%</span>
              </div>
              <p className="mt-3 text-xs text-slate-500">Last sync: {system.last_sync}</p>
            </div>
          ))}
          {!connected.length ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-400">No source connections are configured for this scope.</div> : null}
        </div>
      </Panel>
    </div>
  );
}
