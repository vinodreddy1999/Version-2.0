import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Database, Filter, Play, Search, Sparkles } from 'lucide-react';

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

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
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
  return { authMethod: source.authMethods[0], headerMode: 'First row as headers', encoding: 'UTF-8', resourceUrl: '', sheetName: '', delimiter: 'Auto detect' };
}

function sensitiveCredentials(values: Record<string, string | boolean>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => ['password', 'token', 'clientSecret'].includes(key) && String(values[key] ?? '').trim().length > 0),
  );
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
      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
      <button
        type="button"
        className={`${inputClass} flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">
          <span className="block font-semibold text-white">{selected?.label ?? placeholder}</span>
          {selected?.meta ? <span className="block truncate text-xs text-slate-500">{selected.meta}</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
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

function MetricTile({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-3 text-sm leading-5 text-slate-400">{helper}</p>
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
  const connectorCatalogQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'connectors'], queryFn: backend.getDataConnectors, enabled: canUseHub });
  const savedConnectionsQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'connections'], queryFn: backend.getDataSavedConnections, enabled: canUseHub });
  const connectedSystemsQuery = useQuery({ queryKey: ['data-hub', 'connected-systems'], queryFn: backend.connectedSystems, enabled: canUseHub });
  const catalogQuery = useQuery({ queryKey: ['data-hub', 'catalog'], queryFn: backend.dataCatalog, enabled: canUseHub });
  const mappingsQuery = useQuery({ queryKey: ['data-hub', 'mappings'], queryFn: backend.dataMappings, enabled: canUseHub });
  const uploadsQuery = useQuery({ queryKey: ['data-hub', 'uploads'], queryFn: backend.uploads, enabled: canUseHub });
  const refreshHistoryQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'refresh-history'], queryFn: backend.getDataRefreshHistory, enabled: canUseHub });
  const errorLogsQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'errors'], queryFn: backend.getDataErrors, enabled: canUseHub });
  const auditQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'audit'], queryFn: backend.getDataAudit, enabled: canUseHub });
  const modelQuery = useQuery({ queryKey: ['data-hub', 'get-data', 'model'], queryFn: backend.getDataModel, enabled: canUseHub });

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
  const [sourceSearch, setSourceSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<(typeof connectorCategories)[number] | 'All'>('All');
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
    enabled: canUseHub && Boolean(selectedConnection?.id),
  });

  const normalizedSourceSearch = normalize(sourceSearch);
  const connectorGroups = connectorCategories
    .map((category) => ({
      category,
      connectors: dataHubConnectors.filter((source) =>
        (categoryFilter === 'All' || source.category === category)
        && source.category === category
        && (!normalizedSourceSearch || normalize(`${source.name} ${source.description} ${source.examples.join(' ')} ${source.category}`).includes(normalizedSourceSearch))),
    }))
    .filter((group) => group.connectors.length > 0);
  const backendConnectorCount = connectorCatalogQuery.data?.groups.reduce((total, group) => total + group.connectors.length, 0) ?? 0;
  const qualityScore = average(scopedCatalogEntries.map((entry) => entry.quality_score).filter((score) => Number.isFinite(score)));
  const aiReadyScore = scopedCatalogEntries.length ? Math.round((scopedCatalogEntries.filter((entry) => entry.ai_ready).length / scopedCatalogEntries.length) * 100) : 0;
  const systemHealth = average(scopedConnectedSystems.map((system) => system.health_score).filter((score) => Number.isFinite(score)));
  const activeStepIndex = Math.min(dataHubSteps.length, Math.max(1, wizardStep));

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
      setMessage('Source draft saved. Select it below to preview, map, validate, refresh, or inspect audit.');
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
      setMessage('Mapping validation completed. Review warnings before loading.');
      refreshDataHubQueries();
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (connectionId: string) => backend.deleteGetDataConnection(connectionId),
    onSuccess: () => {
      setSelectedConnectionId(undefined);
      setMessage('Saved source deleted.');
      refreshDataHubQueries();
    },
  });

  const loading = companiesQuery.isLoading || connectedSystemsQuery.isLoading || catalogQuery.isLoading;
  const error = companiesQuery.error || connectedSystemsQuery.error || catalogQuery.error;

  if (!canUseHub) {
    return <ErrorState title="Data Hub is not available" error="Your current role or assigned applications do not include Data Hub access." />;
  }

  if (loading) return <LoadingState label="Loading Data Hub workspace" />;
  if (error) return <ErrorState title="Unable to load Data Hub" error={error} />;

  return (
    <div className="space-y-5">
      <section className="enterprise-card overflow-visible p-4 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Data Hub</span>
              <StatusBadge status={canImport ? 'Import enabled' : 'Read only'} />
              <StatusBadge status={`${backendConnectorCount || dataHubConnectors.length} connector contracts`} />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">Get Data Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              One guided path: choose scope, select a source, test it, preview rows, transform, map, validate, then create an approval-safe import draft.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchSelect
              label={canSelectCompany(runtimeUser) ? 'Client' : 'Assigned client'}
              value={currentCompany?.id ?? ''}
              options={selectableCompanies.map((company) => ({ value: company.id, label: company.name, meta: `${company.code} · ${company.is_active ? 'Active' : 'Inactive'}` }))}
              placeholder="Search clients..."
              disabled={!canSelectCompany(runtimeUser)}
              onChange={(value) => {
                setSelectedCompanyId(value);
                setSelectedConnectionId(undefined);
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
              }}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <MetricTile label="Systems" value={scopedConnectedSystems.length} helper={`Health ${systemHealth || 0}% for selected scope`} />
        <MetricTile label="Data Quality" value={`${qualityScore || 0}%`} helper={`${scopedCatalogEntries.length} catalog rows in scope`} />
        <MetricTile label="AI Ready" value={`${aiReadyScore}%`} helper="Catalog entries marked AI-ready" />
        <MetricTile label="Saved Sources" value={scopedSavedConnections.length} helper={`${scopedErrors.length} open Data Hub issues`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="enterprise-card overflow-visible p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Sources</h2>
              <p className="mt-1 text-sm text-slate-400">Search once. Select once.</p>
            </div>
            <button type="button" className="form-button-primary !min-h-10" disabled={!canImport} onClick={() => setModalOpen(true)}>
              Get Data
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input className={`${inputClass} w-full pl-9`} value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search source..." />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select className={`${inputClass} w-full appearance-none`} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}>
                <option>All</option>
                {connectorCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 max-h-[600px] space-y-4 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.55)_rgba(255,255,255,0.05)]">
            {connectorGroups.map((group) => (
              <div key={group.category}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">{group.category}</p>
                  <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400">{group.connectors.length}</span>
                </div>
                <div className="space-y-2">
                  {group.connectors.map((source) => (
                    <button
                      key={source.key}
                      type="button"
                      className={`w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${
                        selectedSource.key === source.key ? 'border-cyan-300/45 bg-cyan-400/14 shadow-[0_0_28px_rgba(34,211,238,0.12)]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                      }`}
                      onClick={() => {
                        setSelectedSourceKey(source.key);
                        setWizardStep(2);
                        setModalOpen(true);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{source.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{source.description}</p>
                        </div>
                        <Database className="h-5 w-5 shrink-0 text-cyan-200" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {source.examples.slice(0, 2).map((example) => <span key={example} className="rounded-full bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400">{example}</span>)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!connectorGroups.length ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">No source matched. Try Excel, SQL, API, ERP, WMS, or manual.</div>
            ) : null}
          </div>
        </aside>

        <main className="enterprise-card p-4 xl:p-5">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Pipeline</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{currentCompany?.name ?? 'Client'} data intake</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {selectedSource.name} to {selectedDestination} · {selectedPlant.label} · {selectedRefreshMode}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="form-button-subtle" onClick={() => setModalOpen(true)} disabled={!canImport}>
                Configure source
              </button>
              <button type="button" className="form-button-primary" onClick={() => saveConnectionMutation.mutate()} disabled={!canImport || saveConnectionMutation.isPending}>
                {saveConnectionMutation.isPending ? 'Saving...' : 'Save draft'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {dataHubSteps.map((step, index) => {
              const position = index + 1;
              const active = activeStepIndex === position;
              const complete = activeStepIndex > position;
              return (
                <button
                  key={step.key}
                  type="button"
                  className={`rounded-2xl border p-3 text-left transition ${
                    active ? 'border-cyan-300/45 bg-cyan-400/14 text-white' : complete ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07]'
                  }`}
                  onClick={() => setWizardStep(position)}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-xs font-bold">{complete ? <CheckCircle2 className="h-4 w-4" /> : position}</span>
                  <span className="mt-3 block text-sm font-semibold">{step.label}</span>
                  <span className="mt-1 block text-xs leading-4 opacity-75">{step.helper}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[24px] border border-cyan-300/15 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.18),transparent_32%),rgba(15,23,42,0.45)] p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/12 text-cyan-100">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedSource.name}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{selectedSource.description}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Required</p>
                  <p className="mt-2 text-sm font-semibold text-white">{selectedSource.requiredFields.join(', ')}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Auth</p>
                  <p className="mt-2 text-sm font-semibold text-white">{selectedSource.authMethods[0]}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Mode</p>
                  <p className="mt-2 text-sm font-semibold text-white">{selectedSource.kind}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="form-button-primary" disabled={!canImport || testConnectionMutation.isPending} onClick={() => testConnectionMutation.mutate()}>
                  <Play className="mr-2 inline h-4 w-4" />
                  {testConnectionMutation.isPending ? 'Testing...' : 'Test selected source'}
                </button>
                <button type="button" className="form-button-subtle" onClick={() => setModalOpen(true)} disabled={!canImport}>Open source setup</button>
              </div>
            </div>

            <div className="space-y-3">
              <SearchSelect
                label="Destination module"
                value={selectedDestination}
                options={destinationModules.map((module) => ({ value: module, label: module, meta: 'Route imported data here' }))}
                placeholder="Search modules..."
                onChange={setSelectedDestination}
              />
	              <SearchSelect
	                label="Refresh"
	                value={selectedRefreshMode}
	                options={refreshModes.map((mode) => ({ value: mode, label: mode, meta: mode.includes('Real-time') ? 'Continuous update' : 'Controlled refresh' }))}
	                placeholder="Search refresh modes..."
	                onChange={setSelectedRefreshMode}
	              />
	              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
	                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Validation</p>
	                <div className="mt-3 flex flex-wrap gap-2">
	                  <StatusBadge status={testConnectionMutation.isSuccess ? 'Connection tested' : 'Test required'} />
	                  <StatusBadge status={selectedConnection ? 'Preview available' : 'No draft'} />
	                  <StatusBadge status={scopedErrors.length ? `${scopedErrors.length} issues` : 'No issues'} />
	                </div>
	              </div>
	              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
	                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Security</p>
	                <p className="mt-2 text-sm leading-6 text-slate-300">Credentials are masked. Database sources are treated as read-only. Imports create drafts and require approval for critical changes.</p>
	              </div>
	              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.07] p-4">
	                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">Scope</p>
	                <p className="mt-2 text-sm font-semibold text-white">{currentCompany?.name ?? 'No client'}</p>
	                <p className="mt-1 text-xs text-slate-400">{selectedPlant.label}</p>
	              </div>
	            </div>
	          </div>
	          {message ? (
	            <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm leading-6 text-cyan-50">{message}</div>
	          ) : null}
	        </main>
      </section>

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

      {modalOpen ? (
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
      ) : null}
    </div>
  );
}
