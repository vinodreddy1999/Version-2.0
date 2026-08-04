import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Eye,
  FileText,
  Link2,
  Play,
  Save,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

import { ErrorState } from '../components/ErrorState';
import { LazyChunkBoundary } from '../components/LazyChunkBoundary';
import { LoadingState } from '../components/LoadingState';
import { StatusBadge } from '../components/StatusBadge';
import {
  connectorByKey,
  connectorCategories,
  dataHubConnectors,
  dataHubSteps,
  destinationModules,
  refreshModes,
  type DataHubConnector,
} from '../data-hub/catalog';
import { canAccessAppSection, canPerformAction, canUseDataHubUploads } from '../lib/rbac';
import { useDismissibleLayer } from '../lib/useDismissibleLayer';
import { usePlatform } from '../platform/PlatformContext';
import type { PlatformClient } from '../platform/types';
import { backend } from '../services/api';
import type {
  Company,
  ConnectedSystem,
  DataCatalogEntry,
  DataHubUpload,
  DataMappingRule,
  GetDataAuditEvent,
  GetDataErrorLog,
  GetDataRefreshRun,
  GetDataSavedConnection,
  RuntimeUser,
} from '../types';

const DataHubActivityPanel = lazy(() => import('../data-hub/DataHubActivityPanel').then((module) => ({ default: module.DataHubActivityPanel })));
const DataHubConnectionModal = lazy(() => import('../data-hub/DataHubConnectionModal').then((module) => ({ default: module.DataHubConnectionModal })));

const allPlantsValue = '__all_plants__';
const inputClass = 'min-h-11 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:shadow-[0_0_18px_rgba(34,211,238,0.2)]';

type SelectOption = {
  value: string;
  label: string;
  meta?: string;
};

type LazyPanel = 'current' | 'connections' | 'recent' | 'history' | 'errors' | 'advanced' | null;

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clientCode(client: PlatformClient) {
  return client.clientName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || client.clientId;
}

function companyForClient(client: PlatformClient, backendCompanies: Company[]): Company {
  const byName = backendCompanies.find((company) => normalize(company.name) === normalize(client.clientName));
  if (byName) return byName;
  const code = clientCode(client);
  const byCode = backendCompanies.find((company) => normalize(company.code) === normalize(code));
  if (byCode) return byCode;
  return {
    id: `company-${code.toLowerCase()}`,
    tenant_id: 'tenant-demo-001',
    name: client.clientName,
    code,
    is_active: client.status !== 'Suspended',
    created_at: client.createdDate,
  };
}

function mergedCompanies(backendCompanies: Company[], platformClients: PlatformClient[]) {
  const companiesById = new Map<string, Company>();
  backendCompanies.forEach((company) => companiesById.set(company.id, company));
  platformClients.forEach((client) => {
    const company = companyForClient(client, backendCompanies);
    companiesById.set(company.id, company);
  });
  return Array.from(companiesById.values()).sort((first, second) => first.name.localeCompare(second.name));
}

function platformClientForCompany(company: Company | undefined, clients: PlatformClient[]) {
  if (!company) return undefined;
  return clients.find((client) =>
    normalize(client.clientName) === normalize(company.name)
    || normalize(clientCode(client)) === normalize(company.code)
    || normalize(client.clientId) === normalize(company.id));
}

function canSelectCompany(user: RuntimeUser) {
  return ['super_admin', 'account_owner'].includes(user.role);
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function recordCompanyTokens(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata);
  const lineage = readRecord(row.lineage);
  const details = readRecord(row.connection_details);
  return [
    row.company_id,
    row.company_name,
    row.client_id,
    row.client_name,
    metadata.company_id,
    metadata.company_name,
    lineage.company_id,
    lineage.company_name,
    details.company_id,
    details.company_name,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalize);
}

function recordPlantTokens(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata);
  const lineage = readRecord(row.lineage);
  const details = readRecord(row.connection_details);
  return [
    row.plant_id,
    row.plant_name,
    row.plant,
    metadata.plant_id,
    metadata.plant_name,
    metadata.plant,
    lineage.plant_id,
    lineage.plant_name,
    lineage.plant,
    details.plant_id,
    details.plant_name,
    details.plant,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalize);
}

function matchesCompany(row: Record<string, unknown>, company: Company | undefined) {
  if (!company) return true;
  const tokens = recordCompanyTokens(row);
  if (!tokens.length) return false;
  const aliases = [company.id, company.name, company.code].map(normalize);
  return tokens.some((token) => aliases.includes(token));
}

function matchesPlant(row: Record<string, unknown>, plantId: string, plantName: string) {
  if (plantId === allPlantsValue) return true;
  const tokens = recordPlantTokens(row);
  if (!tokens.length) return false;
  return tokens.includes(normalize(plantId)) || tokens.includes(normalize(plantName));
}

function scopedRows<T extends Record<string, unknown>>(rows: T[], company: Company | undefined, plantId: string, plantName: string) {
  return rows.filter((row) => matchesCompany(row, company) && matchesPlant(row, plantId, plantName));
}

function defaultValuesFor(source: DataHubConnector, plantName: string): Record<string, string | boolean> {
  if (source.kind === 'database') {
    return { authMethod: source.authMethods[0], connectivityMode: 'Import', readOnly: true, host: '', port: '', database: '', schemaTable: '', username: '', password: '' };
  }
  if (source.kind === 'api') {
    return { authMethod: source.authMethods[0], method: 'GET', baseUrl: '', endpoint: '', token: '', pagination: 'Auto detect', headers: '' };
  }
  if (source.kind === 'cloud') {
    return { authMethod: source.authMethods[0], syncMode: 'Manual refresh', resourceUrl: '', resourceName: '', clientId: '', clientSecret: '' };
  }
  if (source.kind === 'manufacturing') {
    return { authMethod: source.authMethods[0], dataObject: 'Inventory balance', systemUrl: '', assetScope: plantName, objectPath: '', token: '' };
  }
  if (source.kind === 'manual') {
    return { tableName: '', entryMode: 'Manual form', owner: '', approvalReason: '', pastedRows: '' };
  }
  return { authMethod: source.authMethods[0], headerMode: 'First row as headers', encoding: 'UTF-8', resourceUrl: '', sheetName: '', delimiter: 'Auto detect', password: '', dateFormat: 'MM/DD/YYYY' };
}

function sensitiveCredentials(values: Record<string, string | boolean>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => ['password', 'token', 'clientSecret'].includes(key) && String(values[key] ?? '').trim().length > 0),
  );
}

function countLabel(isOpen: boolean, isLoading: boolean, count: number) {
  if (isLoading) return 'Loading';
  return isOpen ? String(count) : 'Click to load';
}

function uploadRowCount(upload: DataHubUpload) {
  return upload.metadata?.preview?.sample_rows?.length ?? 0;
}

function SearchSelect({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useDismissibleLayer<HTMLDivElement>({
    open,
    onDismiss: () => {
      setOpen(false);
      setSearch('');
    },
  });
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = normalize(search);
  const filtered = options.filter((option) => !normalizedSearch || normalize(`${option.label} ${option.meta ?? ''}`).includes(normalizedSearch));

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</label>
      <button
        type="button"
        className={`${inputClass} flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">
          <span className="block truncate font-semibold text-white">{selected?.label ?? placeholder}</span>
          {selected?.meta ? <span className="block truncate text-xs text-slate-500">{selected.meta}</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <input className={`${inputClass} w-full`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} autoFocus />
          <div className="mt-2 max-h-64 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.55)_rgba(255,255,255,0.05)]">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`w-full rounded-xl px-3 py-2 text-left transition ${option.value === value ? 'bg-cyan-400/16 text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="block font-semibold">{option.label}</span>
                {option.meta ? <span className="block text-xs text-slate-500">{option.meta}</span> : null}
              </button>
            ))}
            {!filtered.length ? <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">No results found.</div> : null}
          </div>
          <div className="mt-2 text-xs text-slate-500">{filtered.length} of {options.length}</div>
        </div>
      ) : null}
    </div>
  );
}

function CompactInput({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input className={`${inputClass} w-full`} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CompactSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select className={`${inputClass} w-full appearance-none`} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function StatusChip({ icon: Icon, label, tone = 'cyan' }: { icon: typeof CheckCircle2; label: string; tone?: 'cyan' | 'emerald' | 'amber' }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
    : tone === 'amber'
      ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
      : 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100';
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${toneClass}`}>
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

function Stepper({ activeStep }: { activeStep: number }) {
  return (
    <aside className="enterprise-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Flow</h2>
        <StatusBadge status={`Step ${activeStep}`} />
      </div>
      <div className="space-y-3">
        {dataHubSteps.map((step, index) => {
          const position = index + 1;
          const active = activeStep === position;
          const done = activeStep > position;
          return (
            <div key={step.key} className={`rounded-2xl border p-3 ${active ? 'border-cyan-300/40 bg-cyan-400/12' : done ? 'border-emerald-300/20 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-full border text-sm font-bold ${active ? 'border-cyan-200 bg-cyan-400/20 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.28)]' : done ? 'border-emerald-200/40 text-emerald-100' : 'border-white/15 text-slate-400'}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : position}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <p className="text-xs text-slate-500">{step.helper}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function RequiredSetupPanel({
  source,
  values,
  selectedFileName,
  canImport,
  testPending,
  savePending,
  onChange,
  onFileChange,
  onTest,
  onSave,
}: {
  source: DataHubConnector;
  values: Record<string, string | boolean>;
  selectedFileName?: string;
  canImport: boolean;
  testPending: boolean;
  savePending: boolean;
  onChange: (key: string, value: string | boolean) => void;
  onFileChange: (file: File | null) => void;
  onTest: () => void;
  onSave: () => void;
}) {
  const textValue = (key: string) => String(values[key] ?? '');
  const set = (key: string) => (value: string) => onChange(key, value);

  return (
    <section className="enterprise-card p-4 lg:p-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Required setup</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{source.name}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{source.description}</p>
        </div>
        <StatusBadge status={source.category} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          {source.kind === 'file' ? (
            <>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Upload file or cloud link</span>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-400/[0.06] p-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/10">
                    <UploadCloud className="h-5 w-5" />
                    <span>{selectedFileName ?? 'Choose local file'}</span>
                    <input className="sr-only" type="file" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
                  </label>
                  <CompactInput label="Cloud link" value={textValue('resourceUrl')} placeholder="https://drive/link/file.xlsx" onChange={set('resourceUrl')} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <CompactInput label="Sheet / table" value={textValue('sheetName')} placeholder="InventorySheet or Table1" onChange={set('sheetName')} />
                <CompactSelect label="Header row" value={textValue('headerMode') || 'First row as headers'} options={['First row as headers', 'No header row', 'Custom header row']} onChange={set('headerMode')} />
                <CompactInput label="Password if protected" type="password" value={textValue('password')} placeholder="Optional" onChange={set('password')} />
                <CompactSelect label="Date format" value={textValue('dateFormat') || 'MM/DD/YYYY'} options={['MM/DD/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'Auto detect']} onChange={set('dateFormat')} />
                <CompactSelect label="Encoding" value={textValue('encoding') || 'UTF-8'} options={['UTF-8', 'UTF-16', 'ISO-8859-1', 'Auto detect']} onChange={set('encoding')} />
                <CompactInput label="Delimiter" value={textValue('delimiter')} placeholder="Auto detect" onChange={set('delimiter')} />
              </div>
            </>
          ) : null}

          {source.kind === 'database' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CompactInput label="Host / server" value={textValue('host')} placeholder="readonly.database.local" onChange={set('host')} />
              <CompactInput label="Port" value={textValue('port')} placeholder="5432" onChange={set('port')} />
              <CompactInput label="Database" value={textValue('database')} placeholder="operations" onChange={set('database')} />
              <CompactInput label="Schema / table" value={textValue('schemaTable')} placeholder="public.inventory_balance" onChange={set('schemaTable')} />
              <CompactInput label="Username" value={textValue('username')} placeholder="readonly_user" onChange={set('username')} />
              <CompactInput label="Password" type="password" value={textValue('password')} placeholder="Masked" onChange={set('password')} />
              <CompactSelect label="Connectivity" value={textValue('connectivityMode') || 'Import'} options={['Import', 'Direct query', 'Incremental import']} onChange={set('connectivityMode')} />
              <CompactSelect label="Access mode" value={values.readOnly === false ? 'Write-enabled draft' : 'Read-only'} options={['Read-only', 'Write-enabled draft']} onChange={(value) => onChange('readOnly', value === 'Read-only')} />
            </div>
          ) : null}

          {source.kind === 'api' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CompactInput label="Base URL" value={textValue('baseUrl')} placeholder="https://api.vendor.com" onChange={set('baseUrl')} />
              <CompactInput label="Endpoint" value={textValue('endpoint')} placeholder="/inventory/balances" onChange={set('endpoint')} />
              <CompactSelect label="Method" value={textValue('method') || 'GET'} options={['GET', 'POST']} onChange={set('method')} />
              <CompactInput label="Token / key" type="password" value={textValue('token')} placeholder="Masked" onChange={set('token')} />
              <CompactSelect label="Pagination" value={textValue('pagination') || 'Auto detect'} options={['Auto detect', 'Page number', 'Cursor', 'Offset', 'None']} onChange={set('pagination')} />
              <CompactInput label="Headers" value={textValue('headers')} placeholder="JSON headers" onChange={set('headers')} />
            </div>
          ) : null}

          {source.kind === 'cloud' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CompactInput label="Resource URL" value={textValue('resourceUrl')} placeholder="Cloud file or folder URL" onChange={set('resourceUrl')} />
              <CompactInput label="Resource name" value={textValue('resourceName')} placeholder="ERP stock extract" onChange={set('resourceName')} />
              <CompactSelect label="Authentication" value={textValue('authMethod') || source.authMethods[0]} options={source.authMethods} onChange={set('authMethod')} />
              <CompactSelect label="Sync mode" value={textValue('syncMode') || 'Manual refresh'} options={refreshModes} onChange={set('syncMode')} />
              <CompactInput label="Client ID" value={textValue('clientId')} placeholder="Optional OAuth app ID" onChange={set('clientId')} />
              <CompactInput label="Secret" type="password" value={textValue('clientSecret')} placeholder="Masked" onChange={set('clientSecret')} />
            </div>
          ) : null}

          {source.kind === 'manufacturing' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CompactInput label="System URL" value={textValue('systemUrl')} placeholder="MES/WMS/ERP endpoint" onChange={set('systemUrl')} />
              <CompactSelect label="Data object" value={textValue('dataObject') || 'Inventory balance'} options={['Inventory balance', 'Production orders', 'Maintenance work orders', 'Quality inspections', 'Warehouse tasks']} onChange={set('dataObject')} />
              <CompactInput label="Asset scope" value={textValue('assetScope')} placeholder="Plant / line / warehouse" onChange={set('assetScope')} />
              <CompactInput label="Object path" value={textValue('objectPath')} placeholder="Table, topic, tag path, or report ID" onChange={set('objectPath')} />
              <CompactInput label="Token" type="password" value={textValue('token')} placeholder="Masked" onChange={set('token')} />
              <CompactSelect label="Authentication" value={textValue('authMethod') || source.authMethods[0]} options={source.authMethods} onChange={set('authMethod')} />
            </div>
          ) : null}

          {source.kind === 'manual' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <CompactInput label="Table name" value={textValue('tableName')} placeholder="inventory_adjustment_upload" onChange={set('tableName')} />
              <CompactSelect label="Entry mode" value={textValue('entryMode') || 'Manual form'} options={['Manual form', 'Bulk copy-paste', 'Template-based upload']} onChange={set('entryMode')} />
              <CompactInput label="Owner" value={textValue('owner')} placeholder="Process owner" onChange={set('owner')} />
              <CompactInput label="Approval reason" value={textValue('approvalReason')} placeholder="Why this data is being loaded" onChange={set('approvalReason')} />
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rows</span>
                <textarea className={`${inputClass} min-h-28 w-full`} value={textValue('pastedRows')} placeholder="Paste rows here only when needed" onChange={(event) => onChange('pastedRows', event.target.value)} />
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="form-button-primary" disabled={!canImport || testPending} onClick={onTest}>
              <Play className="mr-2 inline h-4 w-4" />
              {testPending ? 'Testing...' : 'Test connection'}
            </button>
            <button type="button" className="form-button-subtle" disabled={!canImport || savePending} onClick={onSave}>
              <Save className="mr-2 inline h-4 w-4" />
              {savePending ? 'Saving...' : 'Save draft'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-4">
          <div className="grid min-h-52 place-items-center rounded-xl border border-white/10 bg-black/10 p-5 text-center">
            <div>
              <Eye className="mx-auto h-8 w-8 text-cyan-100" />
              <p className="mt-3 font-semibold text-white">Preview appears after connection test</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">No preview data is fetched until a saved source is selected and preview is opened.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LazyPanelButton({
  panel,
  activePanel,
  title,
  description,
  count,
  icon: Icon,
  onToggle,
}: {
  panel: Exclude<LazyPanel, null>;
  activePanel: LazyPanel;
  title: string;
  description: string;
  count: string;
  icon: typeof Database;
  onToggle: (panel: Exclude<LazyPanel, null>) => void;
}) {
  const active = activePanel === panel;
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-cyan-300/35 bg-cyan-400/12 text-white' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]'}`}
      onClick={() => onToggle(panel)}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block truncate text-xs text-slate-500">{description}</span>
        </span>
      </span>
      <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-semibold text-cyan-100">{count}</span>
    </button>
  );
}

function CurrentDataPanel({
  systems,
  catalog,
  uploads,
  mappings,
  savedConnections,
  errors,
  isLoading,
  error,
}: {
  systems: ConnectedSystem[];
  catalog: DataCatalogEntry[];
  uploads: DataHubUpload[];
  mappings: DataMappingRule[];
  savedConnections: GetDataSavedConnection[];
  errors: GetDataErrorLog[];
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) return <LoadingState label="Loading current Data Hub data" />;
  if (error) return <ErrorState title="Unable to load current Data Hub data" error={error} />;

  return (
    <section className="enterprise-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Current data</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Existing records in selected scope</h2>
        </div>
        <StatusBadge status={`${systems.length + catalog.length + uploads.length + mappings.length + savedConnections.length} rows loaded`} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniMetric label="Systems" value={systems.length} />
        <MiniMetric label="Catalog" value={catalog.length} />
        <MiniMetric label="Uploads" value={uploads.length} />
        <MiniMetric label="Mappings" value={mappings.length} />
        <MiniMetric label="Saved sources" value={savedConnections.length} />
        <MiniMetric label="Open issues" value={errors.length} tone={errors.length ? 'amber' : 'cyan'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <PreviewList
          title="Connected systems"
          rows={systems.slice(0, 5).map((system) => ({
            title: system.system_name,
            meta: `${system.system_type} · ${system.connection_status}`,
            value: `${system.health_score}%`,
          }))}
          empty="No connected systems in this scope."
        />
        <PreviewList
          title="Catalog entries"
          rows={catalog.slice(0, 5).map((entry) => ({
            title: entry.data_type,
            meta: `${entry.source_system} · ${entry.owner}`,
            value: `${entry.quality_score}%`,
          }))}
          empty="No catalog records in this scope."
        />
        <PreviewList
          title="Recent uploads"
          rows={uploads.slice(0, 5).map((upload) => ({
            title: upload.resource_name,
            meta: `${upload.file_format} · ${upload.status}`,
            value: `${uploadRowCount(upload)} preview rows`,
          }))}
          empty="No uploads in this scope."
        />
        <PreviewList
          title="Saved sources"
          rows={savedConnections.slice(0, 5).map((connection) => ({
            title: connection.connection_name,
            meta: `${connection.connector_name} · ${connection.destination_module}`,
            value: connection.status,
          }))}
          empty="No saved sources in this scope."
        />
      </div>
    </section>
  );
}

function MiniMetric({ label, value, tone = 'cyan' }: { label: string; value: number; tone?: 'cyan' | 'amber' }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone === 'amber' ? 'border-amber-300/20 bg-amber-400/10' : 'border-white/10 bg-white/[0.04]'}`}>
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function PreviewList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ title: string; meta: string; value: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={`${row.title}-${row.meta}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{row.title}</span>
              <span className="block truncate text-xs text-slate-500">{row.meta}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-cyan-100">{row.value}</span>
          </div>
        )) : <p className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-400">{empty}</p>}
      </div>
    </div>
  );
}

export function DataHubPage() {
  const queryClient = useQueryClient();
  const { runtimeUser, platformUser, selectedClient, selectedClientId, isPlatformContext, state } = usePlatform();
  const context = { user: runtimeUser, platformUser, selectedClient, isPlatformContext };
  const canUseHub = canAccessAppSection(context, 'data-hub');
  const canImport = canUseDataHubUploads(runtimeUser) || canPerformAction(runtimeUser, 'import');
  const canManage = canImport || canPerformAction(runtimeUser, 'manage') || canPerformAction(runtimeUser, 'delete');

  const companiesQuery = useQuery({ queryKey: ['data-hub', 'companies'], queryFn: backend.companies, enabled: canUseHub });
  const [activePanel, setActivePanel] = useState<LazyPanel>(null);

  const currentDataOpen = activePanel === 'current';
  const connectionsOpen = activePanel === 'connections' || activePanel === 'current' || activePanel === 'advanced';
  const uploadsOpen = activePanel === 'recent' || activePanel === 'current' || activePanel === 'advanced';
  const catalogOpen = activePanel === 'current' || activePanel === 'advanced';
  const mappingsOpen = activePanel === 'current' || activePanel === 'advanced';
  const systemsOpen = activePanel === 'current' || activePanel === 'advanced';
  const historyOpen = activePanel === 'history' || activePanel === 'advanced';
  const errorsOpen = activePanel === 'errors' || activePanel === 'current' || activePanel === 'advanced';
  const auditOpen = activePanel === 'history' || activePanel === 'advanced';
  const modelOpen = activePanel === 'current' || activePanel === 'advanced';

  const savedConnectionsQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'connections'], queryFn: backend.getDataSavedConnections, enabled: canUseHub && connectionsOpen });
  const connectedSystemsQuery = useQuery({ queryKey: ['data-hub', 'connected-systems'], queryFn: backend.connectedSystems, enabled: canUseHub && systemsOpen });
  const catalogQuery = useQuery({ queryKey: ['data-hub', 'catalog'], queryFn: backend.dataCatalog, enabled: canUseHub && catalogOpen });
  const mappingsQuery = useQuery({ queryKey: ['data-hub', 'mappings'], queryFn: backend.dataMappings, enabled: canUseHub && mappingsOpen });
  const uploadsQuery = useQuery({ queryKey: ['data-hub', 'uploads'], queryFn: backend.uploads, enabled: canUseHub && uploadsOpen });
  const refreshHistoryQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'refresh-history'], queryFn: backend.getDataRefreshHistory, enabled: canUseHub && historyOpen });
  const errorLogsQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'errors'], queryFn: backend.getDataErrors, enabled: canUseHub && errorsOpen });
  const auditQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'audit'], queryFn: backend.getDataAudit, enabled: canUseHub && auditOpen });
  const modelQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'model'], queryFn: backend.getDataModel, enabled: canUseHub && modelOpen });

  const companies = useMemo(() => mergedCompanies(companiesQuery.data ?? [], state.clients), [companiesQuery.data, state.clients]);
  const fixedCompany = companies.find((company) =>
    normalize(company.id) === normalize(runtimeUser.company_id)
    || normalize(company.name) === normalize(platformUser?.clientName)
    || normalize(company.code) === normalize(platformUser?.clientId));
  const selectableCompanies = canSelectCompany(runtimeUser) ? companies : companies.filter((company) => company.id === fixedCompany?.id);
  const initialCompany = selectedClient
    ? companies.find((company) => normalize(company.name) === normalize(selectedClient.clientName) || normalize(company.code) === normalize(clientCode(selectedClient)))
    : undefined;
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompany?.id ?? fixedCompany?.id ?? '');
  const currentCompany = selectableCompanies.find((company) => company.id === selectedCompanyId) ?? selectableCompanies[0];
  const currentClient = platformClientForCompany(currentCompany, state.clients);
  const platformSelectedClient = selectedClientId ? state.clients.find((client) => client.clientId === selectedClientId) : undefined;
  const plantSourceClient = currentClient ?? platformSelectedClient;
  const plantOptions = useMemo<SelectOption[]>(() => {
    const plants = plantSourceClient?.plants ?? [];
    return [
      { value: allPlantsValue, label: 'All plants', meta: 'Use all plant data for this client' },
      ...plants.map((plant) => ({ value: plant.plantId, label: plant.plantName, meta: `${plant.plantId} · ${plant.status}` })),
    ];
  }, [plantSourceClient]);
  const [selectedPlantId, setSelectedPlantId] = useState(plantOptions[1]?.value ?? allPlantsValue);
  const selectedPlant = plantOptions.find((plant) => plant.value === selectedPlantId) ?? plantOptions[0];
  const [selectedCategory, setSelectedCategory] = useState<(typeof connectorCategories)[number]>('Files');
  const sourceOptions = useMemo(() => dataHubConnectors.filter((source) => source.category === selectedCategory), [selectedCategory]);
  const [selectedSourceKey, setSelectedSourceKey] = useState('excel');
  const selectedSource = connectorByKey(selectedSourceKey);
  const [selectedDestination, setSelectedDestination] = useState('Inventory');
  const [selectedRefreshMode, setSelectedRefreshMode] = useState(refreshModes[1]);
  const [wizardStep, setWizardStep] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>(() => defaultValuesFor(selectedSource, selectedPlant.label));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!selectableCompanies.length) return;
    if (!selectedCompanyId || !selectableCompanies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(selectableCompanies[0].id);
    }
  }, [selectableCompanies, selectedCompanyId]);

  useEffect(() => {
    if (!plantOptions.some((plant) => plant.value === selectedPlantId)) {
      setSelectedPlantId(plantOptions[1]?.value ?? allPlantsValue);
    }
  }, [plantOptions, selectedPlantId]);

  useEffect(() => {
    if (!sourceOptions.some((source) => source.key === selectedSourceKey)) {
      setSelectedSourceKey(sourceOptions[0]?.key ?? 'excel');
    }
  }, [selectedSourceKey, sourceOptions]);

  useEffect(() => {
    setFormValues(defaultValuesFor(selectedSource, selectedPlant.label));
    setSelectedFile(null);
    setMessage('');
  }, [selectedSource, selectedPlant.label]);

  const scopedSavedConnections = useMemo(
    () => scopedRows((savedConnectionsQuery.data ?? []) as unknown as Array<GetDataSavedConnection & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [currentCompany, savedConnectionsQuery.data, selectedPlant.label, selectedPlantId],
  );
  const scopedCatalogEntries = useMemo(
    () => scopedRows((catalogQuery.data ?? []) as unknown as Array<DataCatalogEntry & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [catalogQuery.data, currentCompany, selectedPlant.label, selectedPlantId],
  );
  const scopedMappings = useMemo(
    () => scopedRows((mappingsQuery.data ?? []) as unknown as Array<DataMappingRule & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [currentCompany, mappingsQuery.data, selectedPlant.label, selectedPlantId],
  );
  const scopedConnectedSystems = useMemo(
    () => scopedRows((connectedSystemsQuery.data ?? []) as unknown as Array<ConnectedSystem & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [connectedSystemsQuery.data, currentCompany, selectedPlant.label, selectedPlantId],
  );
  const scopedUploads = useMemo(
    () => scopedRows((uploadsQuery.data ?? []) as unknown as Array<DataHubUpload & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [currentCompany, selectedPlant.label, selectedPlantId, uploadsQuery.data],
  );
  const scopedRefreshRuns = useMemo(
    () => scopedRows((refreshHistoryQuery.data ?? []) as unknown as Array<GetDataRefreshRun & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [currentCompany, refreshHistoryQuery.data, selectedPlant.label, selectedPlantId],
  );
  const scopedErrors = useMemo(
    () => scopedRows((errorLogsQuery.data ?? []) as unknown as Array<GetDataErrorLog & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [currentCompany, errorLogsQuery.data, selectedPlant.label, selectedPlantId],
  );
  const scopedAudit = useMemo(
    () => scopedRows((auditQuery.data ?? []) as unknown as Array<GetDataAuditEvent & Record<string, unknown>>, currentCompany, selectedPlantId, selectedPlant.label),
    [auditQuery.data, currentCompany, selectedPlant.label, selectedPlantId],
  );
  const selectedConnection = scopedSavedConnections.find((connection) => connection.id === selectedConnectionId) ?? scopedSavedConnections[0];
  const firstScopedConnectionId = scopedSavedConnections[0]?.id;

  useEffect(() => {
    if (!scopedSavedConnections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(firstScopedConnectionId);
    }
  }, [firstScopedConnectionId, scopedSavedConnections, selectedConnectionId]);

  const previewQuery = useQuery({
    queryKey: ['data-hub', 'get-data', 'preview', selectedConnection?.id],
    queryFn: () => backend.getDataPreview(selectedConnection!.id),
    enabled: canUseHub && activePanel === 'advanced' && Boolean(selectedConnection?.id),
  });

  const activeStepIndex = Math.min(dataHubSteps.length, Math.max(1, wizardStep));
  const currentDataLoading = connectedSystemsQuery.isLoading || catalogQuery.isLoading || mappingsQuery.isLoading || uploadsQuery.isLoading || savedConnectionsQuery.isLoading || errorLogsQuery.isLoading;
  const currentDataError = connectedSystemsQuery.error || catalogQuery.error || mappingsQuery.error || uploadsQuery.error || savedConnectionsQuery.error || errorLogsQuery.error;

  function refreshDataHubQueries() {
    void queryClient.invalidateQueries({ queryKey: ['data-hub'] });
  }

  function buildPayload() {
    return {
      company_id: currentCompany?.id,
      connector_key: selectedSource.key,
      connector_name: selectedSource.name,
      connector_category: selectedSource.category,
      connection_name: `${currentCompany?.name ?? 'Client'} · ${selectedSource.name}`,
      auth_method: String(formValues.authMethod ?? selectedSource.authMethods[0] ?? 'Platform permissions'),
      connection_details: {
        ...formValues,
        company_id: currentCompany?.id,
        company_name: currentCompany?.name,
        plant_id: selectedPlantId === allPlantsValue ? null : selectedPlantId,
        plant_name: selectedPlantId === allPlantsValue ? 'All plants' : selectedPlant.label,
        read_only: formValues.readOnly !== false,
      },
      credentials: sensitiveCredentials(formValues),
      refresh_mode: selectedRefreshMode,
      destination_module: selectedDestination,
    };
  }

  const testConnectionMutation = useMutation({
    mutationFn: () => backend.testGetDataConnection(buildPayload()),
    onSuccess: (result) => {
      setWizardStep(3);
      setMessage(String(result.message ?? 'Connection tested successfully. Preview is ready after saving the draft.'));
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'Connection test failed. Check required fields and credentials.');
    },
  });

  const saveConnectionMutation = useMutation({
    mutationFn: async () => {
      if (selectedFile && currentCompany) {
        await backend.uploadFile(selectedFile, currentCompany.id, selectedPlantId === allPlantsValue ? undefined : { plantId: selectedPlantId, plantName: selectedPlant.label });
      }
      return backend.createGetDataConnection(buildPayload());
    },
    onSuccess: (connection) => {
      setSelectedConnectionId(connection.id);
      setWizardStep(7);
      setModalOpen(false);
      setActivePanel('current');
      setMessage('Source draft saved. Current Data is loading so you can confirm what now exists in this scope.');
      refreshDataHubQueries();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'Unable to save source draft.');
    },
  });

  const runRefreshMutation = useMutation({
    mutationFn: () => backend.runGetDataRefresh({ company_id: currentCompany?.id, connection_id: selectedConnection!.id, refresh_mode: selectedRefreshMode }),
    onSuccess: () => {
      setWizardStep(7);
      setActivePanel('history');
      setMessage('Refresh started. History and audit will update after completion.');
      refreshDataHubQueries();
    },
  });

  const validateMappingMutation = useMutation({
    mutationFn: () => backend.validateGetDataMapping({
      company_id: currentCompany?.id,
      connection_id: selectedConnection?.id,
      destination_module: selectedDestination,
      mappings: [
        { source_field: 'item_code', target_field: 'product_code', required: true },
        { source_field: 'quantity', target_field: 'current_quantity', required: true },
        { source_field: 'plant', target_field: 'plant_id', required: selectedPlantId !== allPlantsValue },
      ],
    }),
    onSuccess: () => {
      setWizardStep(6);
      setActivePanel('advanced');
      setMessage('Mapping validation completed. Review warnings before loading.');
      refreshDataHubQueries();
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (connectionId: string) => backend.deleteGetDataConnection(connectionId),
    onSuccess: () => {
      setSelectedConnectionId(undefined);
      setActivePanel('current');
      setMessage('Saved source deleted. Current Data is refreshed for this scope.');
      refreshDataHubQueries();
    },
  });
  const messageLayerRef = useDismissibleLayer<HTMLDivElement>({
    open: Boolean(message),
    onDismiss: () => setMessage(''),
    closeOnPointerOutside: true,
  });
  const connectionModalLayerRef = useDismissibleLayer<HTMLDivElement>({
    open: modalOpen,
    onDismiss: () => setModalOpen(false),
    closeOnPointerOutside: false,
    lockBodyScroll: true,
    manageFocus: true,
  });

  const loading = companiesQuery.isLoading;
  const error = companiesQuery.error;

  if (!canUseHub) {
    return <ErrorState title="Data Hub is not available" error="Your current role or assigned applications do not include Data Hub access." />;
  }

  if (loading) return <LoadingState label="Loading Data Hub scope" />;
  if (error) return <ErrorState title="Unable to load Data Hub scope" error={error} />;

  return (
    <div className="space-y-4">
      <section className="enterprise-card overflow-visible p-4">
        <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">Data Hub</h1>
            <p className="mt-1 text-sm text-slate-400">Choose scope and source first. Existing backend data loads only when opened.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={canImport ? 'Import enabled' : 'Read only'} />
            <StatusBadge status={`${dataHubConnectors.length} source types`} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SearchSelect
            label={canSelectCompany(runtimeUser) ? 'Client' : 'Assigned client'}
            value={currentCompany?.id ?? ''}
            options={selectableCompanies.map((company) => ({ value: company.id, label: company.name, meta: `${company.code} · ${company.is_active ? 'Active' : 'Inactive'}` }))}
            placeholder="Search clients..."
            disabled={!canSelectCompany(runtimeUser)}
            onChange={(value) => {
              setSelectedCompanyId(value);
              setSelectedConnectionId(undefined);
              setActivePanel(null);
            }}
          />
          <SearchSelect
            label="Plant"
            value={selectedPlantId}
            options={plantOptions}
            placeholder="Search plants..."
            onChange={(value) => {
              setSelectedPlantId(value);
              setSelectedConnectionId(undefined);
              setActivePanel(null);
            }}
          />
          <SearchSelect
            label="Module"
            value={selectedDestination}
            options={destinationModules.map((module) => ({ value: module, label: module, meta: 'Destination for loaded data' }))}
            placeholder="Search modules..."
            onChange={setSelectedDestination}
          />
          <SearchSelect
            label="Source category"
            value={selectedCategory}
            options={connectorCategories.map((category) => ({ value: category, label: category, meta: `${dataHubConnectors.filter((source) => source.category === category).length} source types` }))}
            placeholder="Search source category..."
            onChange={(value) => {
              setSelectedCategory(value as typeof selectedCategory);
              setWizardStep(1);
            }}
          />
          <SearchSelect
            label="Source type"
            value={selectedSourceKey}
            options={sourceOptions.map((source) => ({ value: source.key, label: source.name, meta: source.requiredFields.join(', ') }))}
            placeholder="Search source type..."
            onChange={(value) => {
              setSelectedSourceKey(value);
              setWizardStep(2);
            }}
          />
          <SearchSelect
            label="Refresh mode"
            value={selectedRefreshMode}
            options={refreshModes.map((mode) => ({ value: mode, label: mode, meta: mode.includes('Real-time') ? 'Continuous update' : 'Controlled refresh' }))}
            placeholder="Search refresh modes..."
            onChange={setSelectedRefreshMode}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusChip icon={CheckCircle2} label="Scope saved" tone="emerald" />
          <StatusChip icon={ShieldCheck} label="Credentials masked" />
          <StatusChip icon={Database} label="Read-only source" />
          <StatusChip icon={AlertTriangle} label="Approval required before load" tone="amber" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RequiredSetupPanel
          source={selectedSource}
          values={formValues}
          selectedFileName={selectedFile?.name}
          canImport={canImport}
          testPending={testConnectionMutation.isPending}
          savePending={saveConnectionMutation.isPending}
          onChange={(key, value) => setFormValues((current) => ({ ...current, [key]: value }))}
          onFileChange={setSelectedFile}
          onTest={() => testConnectionMutation.mutate()}
          onSave={() => saveConnectionMutation.mutate()}
        />
        <Stepper activeStep={activeStepIndex} />
      </div>

      {message ? (
        <div ref={messageLayerRef} className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm leading-6 text-cyan-50">{message}</div>
      ) : null}

      <section className="enterprise-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Lazy data drawers</h2>
            <p className="mt-1 text-sm text-slate-400">Click a drawer to fetch backend data. Closed drawers make no API calls.</p>
          </div>
          {activePanel ? <StatusBadge status={`${activePanel} loaded on demand`} /> : <StatusBadge status="No detail loaded" />}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <LazyPanelButton
            panel="current"
            activePanel={activePanel}
            title="Current Data"
            description="See what already exists for the selected client and plant"
            count={countLabel(currentDataOpen, currentDataLoading, scopedConnectedSystems.length + scopedCatalogEntries.length + scopedUploads.length + scopedMappings.length + scopedSavedConnections.length)}
            icon={Database}
            onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          />
          <LazyPanelButton
            panel="connections"
            activePanel={activePanel}
            title="Saved Connections"
            description="Manage saved sources only when needed"
            count={countLabel(connectionsOpen, savedConnectionsQuery.isLoading, scopedSavedConnections.length)}
            icon={Link2}
            onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          />
          <LazyPanelButton
            panel="recent"
            activePanel={activePanel}
            title="Recent Imports"
            description="Load upload manifests on demand"
            count={countLabel(uploadsOpen, uploadsQuery.isLoading, scopedUploads.length)}
            icon={FileText}
            onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          />
          <LazyPanelButton
            panel="history"
            activePanel={activePanel}
            title="Refresh History"
            description="Fetch refresh runs and audit only when opened"
            count={countLabel(historyOpen, refreshHistoryQuery.isLoading || auditQuery.isLoading, scopedRefreshRuns.length + scopedAudit.length)}
            icon={Clock3}
            onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          />
          <LazyPanelButton
            panel="errors"
            activePanel={activePanel}
            title="Validation Errors"
            description="Load open issues when troubleshooting"
            count={countLabel(errorsOpen, errorLogsQuery.isLoading, scopedErrors.length)}
            icon={AlertTriangle}
            onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          />
          <LazyPanelButton
            panel="advanced"
            activePanel={activePanel}
            title="Advanced Workspace"
            description="Preview, mappings, model, refresh and audit tabs"
            count={activePanel === 'advanced' ? 'Loaded' : 'Click to load'}
            icon={Eye}
            onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
          />
        </div>
      </section>

      {activePanel === 'current' ? (
        <CurrentDataPanel
          systems={scopedConnectedSystems}
          catalog={scopedCatalogEntries}
          uploads={scopedUploads}
          mappings={scopedMappings}
          savedConnections={scopedSavedConnections}
          errors={scopedErrors}
          isLoading={currentDataLoading}
          error={currentDataError}
        />
      ) : null}

      {activePanel === 'advanced' ? (
        <LazyChunkBoundary label="Data Hub activity panels">
          <Suspense fallback={<LoadingState label="Loading Data Hub activity panels" />}>
            <DataHubActivityPanel
              canManage={canManage}
              savedConnections={scopedSavedConnections}
              selectedConnectionId={selectedConnection?.id}
              preview={previewQuery.data}
              model={modelQuery.data}
              refreshRuns={scopedRefreshRuns}
              errorLogs={scopedErrors}
              auditEvents={scopedAudit}
              catalogEntries={scopedCatalogEntries}
              mappingRules={scopedMappings}
              connectedSystems={scopedConnectedSystems}
              uploads={scopedUploads}
              onSelectConnection={setSelectedConnectionId}
              onDeleteConnection={(connectionId) => deleteConnectionMutation.mutate(connectionId)}
              onRunRefresh={() => selectedConnection && runRefreshMutation.mutate()}
              onValidateMapping={() => selectedConnection && validateMappingMutation.mutate()}
            />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}

      {activePanel === 'connections' ? (
        <CurrentDataPanel
          systems={[]}
          catalog={[]}
          uploads={[]}
          mappings={[]}
          savedConnections={scopedSavedConnections}
          errors={[]}
          isLoading={savedConnectionsQuery.isLoading}
          error={savedConnectionsQuery.error}
        />
      ) : null}

      {activePanel === 'recent' ? (
        <CurrentDataPanel
          systems={[]}
          catalog={[]}
          uploads={scopedUploads}
          mappings={[]}
          savedConnections={[]}
          errors={[]}
          isLoading={uploadsQuery.isLoading}
          error={uploadsQuery.error}
        />
      ) : null}

      {activePanel === 'history' || activePanel === 'errors' ? (
        <section className="enterprise-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">{activePanel === 'history' ? 'Refresh history' : 'Validation errors'}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{activePanel === 'history' ? 'On-demand refresh and audit data' : 'On-demand issue data'}</h2>
            </div>
            <StatusBadge status={activePanel === 'history' ? `${scopedRefreshRuns.length + scopedAudit.length} rows` : `${scopedErrors.length} issues`} />
          </div>
          {activePanel === 'history' && (refreshHistoryQuery.isLoading || auditQuery.isLoading) ? <LoadingState label="Loading refresh history" /> : null}
          {activePanel === 'errors' && errorLogsQuery.isLoading ? <LoadingState label="Loading validation errors" /> : null}
          {activePanel === 'history' && !refreshHistoryQuery.isLoading && !auditQuery.isLoading ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <PreviewList
                title="Refresh runs"
                rows={scopedRefreshRuns.slice(0, 8).map((run) => ({ title: run.refresh_mode, meta: run.started_at ?? 'Not started', value: run.status }))}
                empty="No refresh runs in this scope."
              />
              <PreviewList
                title="Audit events"
                rows={scopedAudit.slice(0, 8).map((event) => ({ title: event.action, meta: `${event.actor_email} · ${event.entity_type}`, value: event.created_at?.slice(0, 10) ?? 'No date' }))}
                empty="No audit activity in this scope."
              />
            </div>
          ) : null}
          {activePanel === 'errors' && !errorLogsQuery.isLoading ? (
            <PreviewList
              title="Open issues"
              rows={scopedErrors.slice(0, 10).map((issue) => ({ title: issue.error_code, meta: issue.message, value: issue.severity }))}
              empty="No validation errors in this scope."
            />
          ) : null}
        </section>
      ) : null}

      {modalOpen ? (
        <div ref={connectionModalLayerRef}>
          <LazyChunkBoundary label="Data source setup">
            <Suspense fallback={<LoadingState label="Loading source setup" />}>
              <DataHubConnectionModal
                source={selectedSource}
                clientName={currentCompany?.name ?? 'Selected client'}
                plantName={selectedPlant.label}
                destinationModule={selectedDestination}
                refreshMode={selectedRefreshMode}
                values={formValues}
                selectedFileName={selectedFile?.name}
                canImport={canImport}
                testStatus={testConnectionMutation.isPending ? 'testing' : testConnectionMutation.isSuccess ? 'success' : testConnectionMutation.isError ? 'error' : 'idle'}
                saveStatus={saveConnectionMutation.isPending ? 'saving' : saveConnectionMutation.isSuccess ? 'success' : saveConnectionMutation.isError ? 'error' : 'idle'}
                message={message}
                onChange={(key, value) => setFormValues((current) => ({ ...current, [key]: value }))}
                onFileChange={setSelectedFile}
                onClose={() => setModalOpen(false)}
                onTest={() => testConnectionMutation.mutate()}
                onSave={() => saveConnectionMutation.mutate()}
              />
            </Suspense>
          </LazyChunkBoundary>
        </div>
      ) : null}
    </div>
  );
}
