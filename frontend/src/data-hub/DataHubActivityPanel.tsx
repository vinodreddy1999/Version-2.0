import { useMemo, useState } from 'react';
import { Activity, Database, FileSearch, GitBranch, History, Trash2 } from 'lucide-react';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import type {
  ConnectedSystem,
  DataCatalogEntry,
  DataHubUpload,
  DataMappingRule,
  GetDataAuditEvent,
  GetDataErrorLog,
  GetDataModel,
  GetDataPreview,
  GetDataRefreshRun,
  GetDataSavedConnection,
} from '../types';

type DataHubActivityPanelProps = {
  canManage: boolean;
  savedConnections: GetDataSavedConnection[];
  selectedConnectionId?: string;
  preview?: GetDataPreview;
  model?: GetDataModel;
  refreshRuns: GetDataRefreshRun[];
  errorLogs: GetDataErrorLog[];
  auditEvents: GetDataAuditEvent[];
  catalogEntries: DataCatalogEntry[];
  mappingRules: DataMappingRule[];
  connectedSystems: ConnectedSystem[];
  uploads: DataHubUpload[];
  onSelectConnection: (connectionId: string) => void;
  onDeleteConnection: (connectionId: string) => void;
  onRunRefresh: () => void;
  onValidateMapping: () => void;
};

type ActivityTab = 'connections' | 'preview' | 'mapping' | 'history';

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  return value.replace('T', ' ').slice(0, 16);
}

function asRows(rows: Array<Record<string, unknown>> | undefined) {
  return rows?.slice(0, 50) ?? [];
}

export function DataHubActivityPanel({
  canManage,
  savedConnections,
  selectedConnectionId,
  preview,
  model,
  refreshRuns,
  errorLogs,
  auditEvents,
  catalogEntries,
  mappingRules,
  connectedSystems,
  uploads,
  onSelectConnection,
  onDeleteConnection,
  onRunRefresh,
  onValidateMapping,
}: DataHubActivityPanelProps) {
  const [activeTab, setActiveTab] = useState<ActivityTab>('connections');
  const selectedConnection = savedConnections.find((connection) => connection.id === selectedConnectionId);
  const previewRows = asRows(preview?.rows);
  const modelRows = useMemo(() => model?.tables.map((table) => ({
    table: table.table,
    source: table.source,
    columns: table.columns.length,
    primary_key: table.primary_key || 'Not set',
    measures: table.measures.length,
  })) ?? [], [model]);
  const latestErrors = errorLogs.slice(0, 8);
  const latestAudit = auditEvents.slice(0, 8);
  const tabs: Array<{ key: ActivityTab; label: string; count: number; icon: typeof Database }> = [
    { key: 'connections', label: 'Connections', count: savedConnections.length, icon: Database },
    { key: 'preview', label: 'Preview', count: previewRows.length, icon: FileSearch },
    { key: 'mapping', label: 'Mapping & Model', count: mappingRules.length + modelRows.length, icon: GitBranch },
    { key: 'history', label: 'Refresh & Audit', count: refreshRuns.length + errorLogs.length + auditEvents.length, icon: History },
  ];

  return (
    <Panel
      title="Data Hub Activity"
      description="Lazy-loaded operational detail. Select a connection to preview data, validate mappings, refresh, or inspect logs."
      action={selectedConnection ? <StatusBadge status={selectedConnection.connection_name} /> : <StatusBadge status="No source selected" />}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                active ? 'border-cyan-300/35 bg-cyan-400/12 text-white' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07] hover:text-white'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-semibold">{tab.label}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-xs">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'connections' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
          <DataTable
            rows={savedConnections.map((connection) => ({
              id: connection.id,
              name: connection.connection_name,
              connector: connection.connector_name,
              category: connection.connector_category,
              destination: connection.destination_module,
              refresh: connection.refresh_mode,
              status: connection.status,
              test: connection.last_test_status,
            }))}
            emptyTitle="No saved connections"
            columns={[
              { key: 'name', label: 'Connection' },
              { key: 'connector', label: 'Source' },
              { key: 'destination', label: 'Destination' },
              { key: 'refresh', label: 'Refresh' },
              { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
              {
                key: 'id',
                label: 'Action',
                render: (value) => (
                  <button type="button" className="text-cyan-200 hover:text-cyan-100" onClick={() => onSelectConnection(String(value))}>
                    Select
                  </button>
                ),
              },
            ]}
          />
          <aside className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-200" />
              <h3 className="font-semibold text-white">Selected source</h3>
            </div>
            {selectedConnection ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Name</p>
                  <p className="mt-1 text-sm font-semibold text-white">{selectedConnection.connection_name}</p>
                </div>
                <div className="grid gap-2">
                  <StatusBadge status={selectedConnection.status} />
                  <StatusBadge status={selectedConnection.last_test_status} />
                  <StatusBadge status={selectedConnection.refresh_mode} />
                </div>
                <div className="grid gap-2">
                  <button type="button" className="form-button-primary" disabled={!canManage} onClick={onRunRefresh}>Run refresh</button>
                  <button type="button" className="form-button-subtle" disabled={!canManage} onClick={onValidateMapping}>Validate mapping</button>
                  <button type="button" className="rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canManage} onClick={() => onDeleteConnection(selectedConnection.id)}>
                    <Trash2 className="mr-2 inline h-4 w-4" />
                    Delete source
                  </button>
                </div>
              </>
            ) : (
              <EmptyState title="Nothing selected" description="Choose a saved connection to inspect preview, refresh, mapping, and audit detail." />
            )}
          </aside>
        </div>
      ) : null}

      {activeTab === 'preview' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <DataTable
            rows={previewRows}
            emptyTitle="No preview rows"
            columns={(preview?.columns.slice(0, 6) ?? ['item_code', 'item_name', 'quantity', 'plant', 'status']).map((column) => ({
              key: column,
              label: column.replace(/_/g, ' '),
            }))}
          />
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-white">Detected data types</h3>
              <div className="mt-3 grid gap-2">
                {(preview?.detected_types ?? []).slice(0, 8).map((item) => (
                  <div key={item.column} className="flex justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm">
                    <span className="text-slate-300">{item.column}</span>
                    <span className="font-semibold text-cyan-100">{item.detected_type}</span>
                  </div>
                ))}
                {!preview?.detected_types.length ? <p className="text-sm text-slate-400">Select or save a connection to load type detection.</p> : null}
              </div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-white">Catalog rows in scope</h3>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Metric label="Catalog" value={catalogEntries.length} />
                <Metric label="Systems" value={connectedSystems.length} />
                <Metric label="Uploads" value={uploads.length} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'mapping' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <DataTable
            rows={mappingRules.map((rule) => ({
              id: rule.id,
              source: rule.source_system,
              source_field: rule.source_field,
              target: `${rule.target_entity}.${rule.target_field}`,
              transform: rule.transform_rule ?? 'Direct',
              confidence: `${rule.confidence}%`,
            }))}
            emptyTitle="No mapping rules"
            columns={[
              { key: 'source', label: 'Source' },
              { key: 'source_field', label: 'Source Field' },
              { key: 'target', label: 'Target' },
              { key: 'transform', label: 'Transform' },
              { key: 'confidence', label: 'Confidence' },
            ]}
          />
          <DataTable
            rows={modelRows}
            emptyTitle="No model metadata"
            columns={[
              { key: 'table', label: 'Table' },
              { key: 'source', label: 'Source' },
              { key: 'columns', label: 'Columns' },
              { key: 'primary_key', label: 'Primary Key' },
              { key: 'measures', label: 'Measures' },
            ]}
          />
        </div>
      ) : null}

      {activeTab === 'history' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <DataTable
            rows={refreshRuns.map((run) => ({
              id: run.id,
              mode: run.refresh_mode,
              status: run.status,
              rows: run.rows_processed,
              started: formatDate(run.started_at),
              failure: run.failure_reason ?? 'None',
            }))}
            emptyTitle="No refresh history"
            columns={[
              { key: 'mode', label: 'Mode' },
              { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
              { key: 'rows', label: 'Rows' },
              { key: 'started', label: 'Started' },
            ]}
          />
          <div className="space-y-3">
            <h3 className="font-semibold text-white">Latest issues</h3>
            {latestErrors.length ? latestErrors.map((error) => (
              <div key={error.id} className="rounded-2xl border border-red-300/15 bg-red-400/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-red-50">{error.error_code}</p>
                  <StatusBadge status={error.severity} />
                </div>
                <p className="mt-1 text-sm leading-5 text-red-100/80">{error.message}</p>
                {error.resolution_hint ? <p className="mt-2 text-xs text-red-100/70">{error.resolution_hint}</p> : null}
              </div>
            )) : <EmptyState title="No errors" description="No failed refreshes or connection issues are in scope." />}
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-white">Audit trail</h3>
            {latestAudit.length ? latestAudit.map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-sm font-semibold text-white">{event.action}</p>
                <p className="mt-1 text-xs text-slate-400">{event.actor_email} · {event.entity_type}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(event.created_at)}</p>
              </div>
            )) : <EmptyState title="No audit events" description="No Data Hub audit activity is in scope yet." />}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
