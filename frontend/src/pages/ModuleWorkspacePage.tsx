import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';

import { DataTable } from '../components/DataTable';
import { ErrorState } from '../components/ErrorState';
import { LazyBarChart } from '../components/LazyCharts';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { getModuleDefinition } from '../data/phase1';
import { queryKeys } from '../lib/queryKeys';
import {
  canViewFinancialData,
  canWriteOperationalData,
  filterFinancialTableRows,
  getUserDataScope,
  isFinancialField,
  type PermissionContext,
} from '../lib/rbac';
import { usePlatform } from '../platform/PlatformContext';
import { backend } from '../services/api';
import type { ModuleRecord, RuntimeUser } from '../types';

function statusIsOpen(status: string) {
  return !['closed', 'approved', 'published', 'released', 'completed', 'signed'].includes(status.toLowerCase());
}

function clientSlug(value?: string | null) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeRecord(moduleKey: string, row: { code: string; name: string; status: string; owner: string; quantity: number }, context: PermissionContext): Omit<ModuleRecord, 'id' | 'created_at'> {
  const scope = getUserDataScope(context.user, context.platformUser ?? undefined);
  return {
    tenant_id: 'tenant-demo-001',
    company_id: context.selectedClient?.clientId ?? context.user.company_id ?? undefined,
    plant_id: context.user.plant_id ?? scope.plant ?? undefined,
    module_key: moduleKey,
    record_type: 'phase1_record',
    record_code: row.code,
    name: row.name,
    status: row.status,
    quantity: Number(row.quantity),
    payload: {
      clientId: context.selectedClient?.clientId,
      clientName: context.selectedClient?.clientName,
      plant: scope.plant,
      warehouse: scope.warehouse,
      department: scope.department,
      owner: row.owner,
      source: 'phase1_frontend',
    },
  };
}

function generatedRecordCode(moduleKey: string, name: string) {
  const suffix = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${moduleKey.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${suffix || 'NEW'}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
}

export function ModuleWorkspacePage({ moduleKey, user }: { moduleKey: string; user: RuntimeUser }) {
  const queryClient = useQueryClient();
  const { selectedClientId, selectedClient, platformUser, isPlatformContext } = usePlatform();
  const accessContext = useMemo(() => ({ user, selectedClient, platformUser, isPlatformContext }), [user, selectedClient, platformUser, isPlatformContext]);
  const definition = getModuleDefinition(moduleKey);
  const Icon = definition.icon;
  const canWrite = canWriteOperationalData(user);
  const canViewFinancial = canViewFinancialData(accessContext);
  const visibleFeatures = useMemo(
    () => canViewFinancial ? definition.features : definition.features.filter((feature) => !isFinancialField(feature)),
    [canViewFinancial, definition.features],
  );
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    status: 'Open',
    owner: user.role.replace('_', ' '),
    quantity: 0,
  });

  const records = useQuery({
    queryKey: queryKeys.module.records(selectedClientId, moduleKey),
    queryFn: () => backend.records(moduleKey),
  });

  const createRecord = useMutation({
    mutationFn: backend.createRecord,
    onSuccess: () => {
      setDraft({ code: '', name: '', status: 'Open', owner: user.role.replace('_', ' '), quantity: 0 });
      queryClient.invalidateQueries({ queryKey: queryKeys.module.records(selectedClientId, moduleKey) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.analytics(selectedClientId) });
    },
  });

  const updateRecord = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Omit<ModuleRecord, 'id' | 'created_at'>> }) => backend.updateRecord(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module.records(selectedClientId, moduleKey) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.analytics(selectedClientId) });
    },
  });

  const deleteRecord = useMutation({
    mutationFn: backend.deleteRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module.records(selectedClientId, moduleKey) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.analytics(selectedClientId) });
    },
  });

  const backendRows = useMemo(
    () => (records.data ?? []).filter((record) => recordBelongsToClient(record, selectedClient)),
    [records.data, selectedClient],
  );
  const fallbackRows = definition.sampleRows.map((row, index) => ({
    id: `sample-${moduleKey}-${index}`,
    module_key: moduleKey,
    record_type: 'sample_record',
    record_code: row.code,
    name: row.name,
    status: row.status,
    quantity: row.quantity,
    company_id: selectedClient?.clientId ?? null,
    plant_id: user.scope_plant_name ?? platformUser?.plant ?? null,
    payload: { owner: row.owner, clientId: selectedClient?.clientId, clientName: selectedClient?.clientName, plant: user.scope_plant_name ?? platformUser?.plant, warehouse: user.scope_warehouse_name ?? platformUser?.warehouse, source: 'fallback_sample' },
  })) satisfies ModuleRecord[];
  const rows = backendRows.length ? backendRows : fallbackRows;
  const usingBackendRows = backendRows.length > 0;
  const scopedRows = useMemo(() => filterScopedModuleRecords(rows, accessContext), [rows, accessContext]);
  const visibleRows = useMemo(
    () => filterFinancialTableRows(scopedRows as Array<ModuleRecord & Record<string, unknown>>, accessContext),
    [accessContext, scopedRows],
  );

  const chartRows = useMemo(
    () => visibleRows.map((row) => ({ name: row.record_code, quantity: Number(row.quantity ?? 0) })),
    [visibleRows],
  );

  if (records.isLoading) {
    return <LoadingState label={`Loading ${definition.title} backend records`} />;
  }

  if (records.isError) {
    return <ErrorState title={`${definition.title} backend data failed`} error={records.error} />;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    createRecord.mutate(normalizeRecord(moduleKey, { ...draft, code: generatedRecordCode(moduleKey, draft.name) }, accessContext));
  }

  return (
    <>
      <PageHeader eyebrow="Backend Module Workspace" title={definition.title} description={`${definition.description} Records are loaded from /runtime/records?module_key=${moduleKey}.`} />

      {!usingBackendRows ? (
        <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          No scoped backend records were returned for this module yet, so sample rows are shown only as a visual fallback.{canWrite ? ' Add a record to start testing backend write/read flow.' : ''}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Visible Records" value={visibleRows.length} helper="Current role and scope" icon={<Icon className="h-5 w-5" />} accent="blue" />
        <StatCard label="Open Items" value={visibleRows.filter((row) => statusIsOpen(row.status)).length} helper="Need follow-up" accent="amber" />
        <StatCard label="Visible Features" value={visibleFeatures.length} helper="Permission filtered" accent="emerald" />
      </div>

      <div className={`mt-6 grid gap-4 ${canWrite ? 'xl:grid-cols-[0.95fr_1.05fr]' : ''}`}>
        {canWrite ? <Panel title="Create Backend Record" description="Writes to the shared backend database through the runtime records API.">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
            <input className="form-input disabled:cursor-not-allowed disabled:opacity-70" placeholder="System ID" value={generatedRecordCode(moduleKey, draft.name)} readOnly disabled />
            <input className="form-input" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required disabled={!canWrite} />
            <select className="form-input" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} disabled={!canWrite}>
              <option value="Open">Open</option>
              <option value="Draft">Draft</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Approved">Approved</option>
              <option value="Closed">Closed</option>
            </select>
            <input className="form-input" placeholder="Owner" value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} required disabled={!canWrite} />
            <input className="form-input" type="number" placeholder="Quantity / Score" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} disabled={!canWrite} />
            <button className="form-button-primary md:col-span-2" disabled={!canWrite || createRecord.isPending}>
              {canWrite ? (createRecord.isPending ? 'Saving...' : 'Add Backend Record') : 'Read-only role'}
            </button>
          </form>
        </Panel> : null}

        <Panel title="Feature Areas" description="Phase 1 screens users expect inside this module.">
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleFeatures.map((feature) => (
              <div key={feature} className="rounded-xl border border-white/10 bg-slate-950/25 px-3 py-2 text-sm text-slate-200">
                {feature}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title={`${definition.title} Backend Records`} description="Read, edit status/quantity, and delete records from the backend runtime database.">
          <DataTable
            rows={visibleRows}
            emptyTitle="No backend records"
            columns={[
              { key: 'record_code', label: 'Code' },
              { key: 'name', label: 'Name' },
              {
                key: 'status',
                label: 'Status',
                render: (value, row) => usingBackendRows && canWrite ? (
                  <select className="form-input min-w-36 py-1 text-xs" value={String(value)} onChange={(event) => updateRecord.mutate({ id: String(row.id), payload: { status: event.target.value } })}>
                    <option value="Open">Open</option>
                    <option value="Draft">Draft</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Pending Approval">Pending Approval</option>
                    <option value="Approved">Approved</option>
                    <option value="Closed">Closed</option>
                  </select>
                ) : <StatusBadge status={String(value)} />,
              },
              { key: 'record_type', label: 'Type' },
              {
                key: 'quantity',
                label: 'Qty / Score',
                render: (value, row) => usingBackendRows && canWrite ? (
                  <input className="form-input w-24 py-1 text-xs" type="number" value={Number(value ?? 0)} onChange={(event) => updateRecord.mutate({ id: String(row.id), payload: { quantity: Number(event.target.value) } })} />
                ) : String(value ?? 0),
              },
              ...(usingBackendRows && canWrite ? [{
                key: 'id',
                label: 'Action',
                render: (value: unknown) => (
                  <button
                    className="rounded-xl border border-red-300/20 bg-red-400/10 px-2 py-1 text-xs text-red-100 hover:bg-red-400/20"
                    onClick={() => {
                      if (window.confirm('Delete this backend record? This will refresh the table immediately.')) {
                        deleteRecord.mutate(String(value));
                      }
                    }}
                  >
                    <Trash2 className="mr-1 inline h-3 w-3" />
                    Delete
                  </button>
                ),
              }] : []),
            ]}
          />
        </Panel>

        <Panel title="Backend Record Volume" description="Chart generated from the loaded module records.">
          <LazyBarChart data={chartRows} bars={['quantity']} showGrid={false} />
        </Panel>
      </div>
    </>
  );
}

function recordBelongsToClient(record: ModuleRecord, selectedClient?: PermissionContext['selectedClient']) {
  if (!selectedClient) return true;
  const companyId = String(record.company_id ?? record.payload?.clientId ?? '').toLowerCase();
  if (!companyId) return true;
  const selectedId = selectedClient.clientId.toLowerCase();
  const selectedNameSlug = clientSlug(selectedClient.clientName);
  return companyId === selectedId || companyId.includes(selectedNameSlug) || String(record.payload?.clientName ?? '').toLowerCase() === selectedClient.clientName.toLowerCase();
}

function filterScopedModuleRecords(records: ModuleRecord[], context: PermissionContext) {
  const scope = getUserDataScope(context.user, context.platformUser ?? undefined);
  return records.filter((record) => {
    const plant = String(record.plant_id ?? record.payload?.plant ?? record.payload?.Plant ?? '');
    const warehouse = String(record.payload?.warehouse ?? record.payload?.Warehouse ?? '');
    if (scope.plant && plant && !plant.toLowerCase().includes(scope.plant.toLowerCase())) return false;
    if (scope.warehouse && warehouse && !warehouse.toLowerCase().includes(scope.warehouse.toLowerCase())) return false;
    return true;
  });
}
