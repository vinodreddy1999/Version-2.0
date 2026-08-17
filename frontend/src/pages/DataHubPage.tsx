import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Cable, CheckCircle2, Database, Route, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';

import { DataTable } from '../components/DataTable';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { useClickOutside } from '../hooks/useClickOutside';
import { canManagePlatform, canPerformAction, canUseDataHubUploads } from '../lib/rbac';
import { usePlatform } from '../platform/PlatformContext';
import type { PlatformClient } from '../platform/types';
import { backend } from '../services/api';
import type { Company, ConnectedSystem, DataCatalogEntry, DataMappingRule, GetDataCatalog, GetDataModel, GetDataPreview, GetDataSavedConnection, RuntimeUser } from '../types';

const acceptedFormats = '.csv,.tsv,.xls,.xlsx,.xlsm,.json,.xml,.txt,.ods';

type SourceConfig = {
  value: string;
  label: string;
  description: string;
  defaultSystemType: string;
  formats: string[];
  authMethods: string[];
  fields: Array<{ key: string; label: string; type?: string; placeholder: string; required?: boolean }>;
};

type DataSourceOption = {
  value: string;
  label: string;
  group: string;
  description: string;
  auth: string;
  connectorType: string;
};

const sourceTypes: SourceConfig[] = [
  {
    value: 'erp',
    label: 'ERP / SAP / Oracle',
    description: 'Master data, inventory, purchasing, production, finance and order exports.',
    defaultSystemType: 'ERP',
    formats: ['csv', 'xlsx', 'xml', 'json', 'idoc'],
    authMethods: ['API Key', 'OAuth2', 'Basic Auth', 'SFTP Credentials'],
    fields: [
      { key: 'base_url', label: 'ERP/API URL', placeholder: 'https://sap.company.com/odata', required: true },
      { key: 'client_id', label: 'Client / Tenant ID', placeholder: 'SAP client, Oracle tenant, or ERP company code' },
      { key: 'username', label: 'Username', placeholder: 'integration.user' },
      { key: 'password', label: 'Password / Secret', type: 'password', placeholder: 'Stored securely in production vault' },
    ],
  },
  {
    value: 'database',
    label: 'Database',
    description: 'PostgreSQL, SQL Server, MySQL, Oracle or data warehouse tables.',
    defaultSystemType: 'DATABASE',
    formats: ['table', 'view', 'query', 'parquet'],
    authMethods: ['Database Password', 'IAM / Managed Identity', 'Connection String'],
    fields: [
      { key: 'host', label: 'Host', placeholder: 'db.company.local', required: true },
      { key: 'port', label: 'Port', placeholder: '5432' },
      { key: 'database', label: 'Database', placeholder: 'manufacturing_ops', required: true },
      { key: 'schema', label: 'Schema / Table', placeholder: 'inventory.stock_balance' },
      { key: 'username', label: 'Username', placeholder: 'readonly_user' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Stored securely in production vault' },
    ],
  },
  {
    value: 'cloud_storage',
    label: 'Cloud Storage',
    description: 'Google Drive, OneDrive, SharePoint, S3, Azure Blob or Dropbox sources.',
    defaultSystemType: 'CLOUD_STORAGE',
    formats: ['xlsx', 'csv', 'gsheets', 'json', 'parquet'],
    authMethods: ['OAuth2', 'Shared Link', 'Service Account', 'SAS / Presigned URL'],
    fields: [
      { key: 'resource_url', label: 'File / Folder Link', placeholder: 'https://drive.google.com/...', required: true },
      { key: 'folder_path', label: 'Folder / Path', placeholder: '/exports/inventory' },
      { key: 'client_id', label: 'Client ID', placeholder: 'OAuth client id' },
      { key: 'client_secret', label: 'Client Secret', type: 'password', placeholder: 'OAuth secret or service account key' },
    ],
  },
  {
    value: 'machine_iot',
    label: 'Machine / IoT / OPC-UA',
    description: 'PLC, OPC-UA, MQTT, sensor, machine and edge data feeds.',
    defaultSystemType: 'IOT',
    formats: ['mqtt', 'opcua', 'json', 'timeseries'],
    authMethods: ['Certificate', 'Token', 'Basic Auth', 'No Auth'],
    fields: [
      { key: 'endpoint', label: 'Broker / Endpoint', placeholder: 'opc.tcp://edge.local:4840', required: true },
      { key: 'topic_or_node', label: 'Topic / Node Path', placeholder: 'factory/line1/machine5/#' },
      { key: 'certificate_ref', label: 'Certificate Reference', placeholder: 'certificate alias or thumbprint' },
      { key: 'token', label: 'Token', type: 'password', placeholder: 'Access token when required' },
    ],
  },
  {
    value: 'file_upload',
    label: 'Local File Upload',
    description: 'Manual ERP exports, SAP spreadsheets, Excel sheets and data extracts.',
    defaultSystemType: 'FILE_UPLOAD',
    formats: ['csv', 'xlsx', 'xlsm', 'tsv', 'json', 'xml'],
    authMethods: ['No Auth'],
    fields: [
      { key: 'expected_file_name', label: 'Expected File Name', placeholder: 'inventory_export_*.xlsx' },
      { key: 'sheet_name', label: 'Sheet / Tab Name', placeholder: 'Stock Balance' },
    ],
  },
];

const dataDomains = [
  { value: 'Inventory', route: 'Inventory module', description: 'Stock, batches, bins, reservations, movement ledger and valuation.' },
  { value: 'Production', route: 'Production module', description: 'Work orders, BOM, routing, WIP, capacity and production status.' },
  { value: 'Procurement', route: 'Procurement module', description: 'Purchase requests, suppliers, POs, lead time and receiving.' },
  { value: 'Warehouse', route: 'Warehouse module', description: 'Plants, warehouses, zones, racks, shelves, bins and occupancy.' },
  { value: 'Quality', route: 'Quality module', description: 'Inspection lots, defects, quarantine, rejection and audit results.' },
  { value: 'Maintenance', route: 'Maintenance module', description: 'Assets, work orders, downtime, spares and preventive maintenance.' },
  { value: 'Machine Data', route: 'AI / Machine Data readiness', description: 'IoT, PLC, OPC-UA and edge telemetry for intelligence models.' },
  { value: 'Supplier', route: 'Supplier performance module', description: 'Supplier master, quality rating, SLA and delay patterns.' },
  { value: 'Finance / Costing', route: 'Costing and reporting module', description: 'Inventory valuation, wastage, expiry loss and operational cost.' },
];

const powerBiSourceGroups: Array<{ group: string; sources: Omit<DataSourceOption, 'group'>[] }> = [
  {
    group: 'Files',
    sources: [
      { value: 'excel', label: 'Excel', description: 'Workbook, sheet, named table, and multi-sheet imports.', auth: 'File upload or cloud link', connectorType: 'FILE' },
      { value: 'csv', label: 'CSV', description: 'Delimited files with encoding, header, and schema detection.', auth: 'File upload or folder path', connectorType: 'FILE' },
      { value: 'json', label: 'JSON', description: 'Nested JSON documents with flattening and array expansion.', auth: 'File upload, URL, or API key', connectorType: 'FILE' },
      { value: 'xml', label: 'XML', description: 'XML feeds and exported ERP document structures.', auth: 'File upload or URL', connectorType: 'FILE' },
      { value: 'pdf', label: 'PDF table extraction', description: 'Extract tabular data from invoices, statements, and reports.', auth: 'File upload', connectorType: 'DOCUMENT' },
      { value: 'folder', label: 'Folder import', description: 'Combine files from a local, network, or cloud folder.', auth: 'Folder permission', connectorType: 'FOLDER' },
    ],
  },
  {
    group: 'Databases',
    sources: [
      { value: 'sql_server', label: 'SQL Server', description: 'Read-only SQL Server tables, views, or queries.', auth: 'Database credentials / AD', connectorType: 'DATABASE' },
      { value: 'mysql', label: 'MySQL', description: 'MySQL operational tables and reporting views.', auth: 'Database credentials', connectorType: 'DATABASE' },
      { value: 'postgresql', label: 'PostgreSQL', description: 'PostgreSQL schemas, tables, views, and warehouse marts.', auth: 'Database credentials', connectorType: 'DATABASE' },
      { value: 'oracle', label: 'Oracle', description: 'Oracle ERP and operational data schemas.', auth: 'Database credentials / wallet', connectorType: 'DATABASE' },
      { value: 'mongodb', label: 'MongoDB', description: 'Document collections with flattening and schema inference.', auth: 'Connection string', connectorType: 'DATABASE' },
      { value: 'sqlite', label: 'SQLite', description: 'Embedded database files for local exports and edge stores.', auth: 'File permission', connectorType: 'DATABASE' },
      { value: 'warehouse', label: 'Data warehouse connection', description: 'Cloud warehouse views and curated analytics datasets.', auth: 'OAuth / key / IAM', connectorType: 'WAREHOUSE' },
    ],
  },
  {
    group: 'APIs and Web',
    sources: [
      { value: 'rest_api', label: 'REST API', description: 'JSON/XML endpoints with headers, params, and pagination.', auth: 'API key / OAuth2 / Basic', connectorType: 'API' },
      { value: 'graphql', label: 'GraphQL API', description: 'GraphQL queries and variables for business entities.', auth: 'Bearer token / OAuth2', connectorType: 'API' },
      { value: 'web_url', label: 'Web URL', description: 'Web table import from a public or internal URL.', auth: 'No auth / header auth', connectorType: 'WEB' },
      { value: 'portal_login', label: 'Web portal login-based import', description: 'Portal-driven downloads requiring credentials and approval.', auth: 'Username/password / MFA handoff', connectorType: 'WEB' },
      { value: 'odata', label: 'OData feed', description: 'SAP, Dynamics, and service feeds with entity selection.', auth: 'OAuth2 / Basic / API key', connectorType: 'API' },
      { value: 'webhook', label: 'Webhook receiver', description: 'Real-time inbound events for machine or business updates.', auth: 'Signed webhook secret', connectorType: 'WEBHOOK' },
    ],
  },
  {
    group: 'Cloud Apps',
    sources: [
      { value: 'google_sheets', label: 'Google Sheets', description: 'Sheets, ranges, and shared spreadsheets.', auth: 'OAuth2 / service account', connectorType: 'CLOUD_APP' },
      { value: 'sharepoint', label: 'SharePoint', description: 'SharePoint lists, libraries, and Excel files.', auth: 'Microsoft OAuth2', connectorType: 'CLOUD_APP' },
      { value: 'onedrive', label: 'OneDrive', description: 'OneDrive files and folders.', auth: 'Microsoft OAuth2', connectorType: 'CLOUD_APP' },
      { value: 'google_drive', label: 'Google Drive', description: 'Drive files, folders, and exported Sheets.', auth: 'Google OAuth2', connectorType: 'CLOUD_APP' },
      { value: 'salesforce', label: 'Salesforce', description: 'CRM accounts, orders, service, and custom objects.', auth: 'OAuth2', connectorType: 'CLOUD_APP' },
      { value: 'sap', label: 'SAP', description: 'SAP S/4HANA, ECC, OData, IDoc, and exported files.', auth: 'OAuth2 / Basic / SAP client', connectorType: 'ERP' },
      { value: 'zoho', label: 'Zoho', description: 'Zoho CRM, inventory, books, and custom modules.', auth: 'OAuth2', connectorType: 'CLOUD_APP' },
      { value: 'servicenow', label: 'ServiceNow', description: 'Tickets, assets, workflow, and service records.', auth: 'OAuth2 / Basic', connectorType: 'CLOUD_APP' },
    ],
  },
  {
    group: 'Manufacturing / Operations Sources',
    sources: [
      { value: 'erp', label: 'ERP', description: 'Master data, purchasing, inventory, finance, and orders.', auth: 'API / database / file export', connectorType: 'ERP' },
      { value: 'mes', label: 'MES', description: 'Production execution, work orders, line status, and OEE.', auth: 'API / database / OPC bridge', connectorType: 'MES' },
      { value: 'wms', label: 'WMS', description: 'Warehouse receiving, bin, picking, packing, and dispatch.', auth: 'API / database / file export', connectorType: 'WMS' },
      { value: 'scm', label: 'SCM', description: 'Supply chain plans, shipment, suppliers, and lead times.', auth: 'API / file / EDI', connectorType: 'SCM' },
      { value: 'iot_machine', label: 'IoT machine data', description: 'Machine telemetry, runtime, temperature, and throughput.', auth: 'Token / certificate', connectorType: 'IOT' },
      { value: 'plc', label: 'PLC/device data', description: 'PLC values through gateway, OPC-UA, or edge bridge.', auth: 'Certificate / gateway token', connectorType: 'DEVICE' },
      { value: 'barcode_rfid', label: 'Barcode/RFID data', description: 'Scan events, goods movement, pallet, and bin tracking.', auth: 'Device key / file feed', connectorType: 'EVENT' },
      { value: 'sensor', label: 'Sensor data', description: 'Environmental, quality, safety, and condition monitoring.', auth: 'Token / MQTT cert', connectorType: 'IOT' },
    ],
  },
  {
    group: 'Manual Data',
    sources: [
      { value: 'manual_entry', label: 'Manual entry form', description: 'Controlled entry for small master-data or correction sets.', auth: 'Platform RBAC', connectorType: 'MANUAL' },
      { value: 'bulk_paste', label: 'Bulk copy-paste table', description: 'Paste tabular rows and validate before import.', auth: 'Platform RBAC', connectorType: 'MANUAL' },
      { value: 'template_upload', label: 'Template-based upload', description: 'Download template, fill data, upload and validate.', auth: 'Platform RBAC', connectorType: 'MANUAL' },
    ],
  },
];

const flatPowerBiSources = powerBiSourceGroups.flatMap((group) => group.sources.map((source) => ({ ...source, group: group.group })));
const guidedSteps = ['Select source', 'Connection details', 'Test connection', 'Select data', 'Preview', 'Transform', 'Map fields', 'Validate', 'Destination', 'Import or refresh'];
const transformOptions = ['Rename columns', 'Remove columns', 'Change data type', 'Filter rows', 'Remove duplicates', 'Replace values', 'Split columns', 'Merge columns', 'Trim/clean text', 'Date formatting', 'Currency formatting', 'Join/merge datasets', 'Append datasets', 'Create calculated columns'];
const refreshOptions = ['One-time import', 'Manual refresh', 'Scheduled refresh', 'Incremental refresh', 'Real-time webhook update', 'Retry failed refresh'];
const destinationModules = ['Inventory', 'Planning', 'Production', 'Maintenance', 'Finance', 'Reports', 'Admin master data'];
const previewRows = [
  { item_code: 'RM-STEEL-001', item_name: 'Steel Coil', quantity: '680', plant: 'Plant 01', status: 'Available' },
  { item_code: 'FG-PUMP-041', item_name: 'Pump Assembly', quantity: '94', plant: 'Plant 01', status: 'Reserved' },
  { item_code: 'SP-BEAR-009', item_name: 'Bearing Kit', quantity: '12', plant: 'Plant 02', status: 'Low Stock' },
];
const validationRows = [
  { rule: 'Required destination fields mapped', result: 'Passed', severity: 'Info' },
  { rule: 'Duplicate item code check', result: '2 warnings', severity: 'Warning' },
  { rule: 'Critical import approval', result: 'Required before posting', severity: 'Approval' },
];
const refreshHistoryRows = [
  { time: '2026-06-22 09:00', source: 'SAP S/4HANA Inventory', mode: 'Scheduled refresh', status: 'Completed', rows: '12,480' },
  { time: '2026-06-22 08:15', source: 'WMS Barcode Events', mode: 'Incremental refresh', status: 'Completed', rows: '3,128' },
  { time: '2026-06-21 23:45', source: 'Supplier REST API', mode: 'Retry failed refresh', status: 'Attention Needed', rows: '0' },
];

const inputClass = 'rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60 focus:shadow-[0_0_18px_rgba(79,172,254,0.25)]';
const selectClass = `${inputClass} appearance-none`;

function canSelectCompany(user: RuntimeUser) {
  return ['super_admin', 'account_owner'].includes(user.role);
}

function getSourceConfig(value: string) {
  return sourceTypes.find((source) => source.value === value) ?? sourceTypes[0];
}

function getDomain(value: string) {
  return dataDomains.find((domain) => domain.value === value) ?? dataDomains[0];
}

function normalizeCompanyName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function platformClientCode(client: PlatformClient) {
  return client.clientName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || client.clientId.replace(/[^A-Z0-9]+/gi, '-').toUpperCase();
}

function companyIdForPlatformClient(client: PlatformClient, backendCompanies: Company[]) {
  const byName = backendCompanies.find((company) => normalizeCompanyName(company.name) === normalizeCompanyName(client.clientName));
  if (byName) return byName.id;
  const code = platformClientCode(client);
  const byCode = backendCompanies.find((company) => company.code.toUpperCase() === code);
  return byCode?.id ?? `company-${code.toLowerCase()}`;
}

function platformCompanies(backendCompanies: Company[], platformClients: PlatformClient[]) {
  return platformClients
    .map((client) => ({
      id: companyIdForPlatformClient(client, backendCompanies),
      tenant_id: 'tenant-demo-001',
      name: client.clientName,
      code: platformClientCode(client),
      is_active: client.status !== 'Suspended',
      created_at: client.createdDate,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

function visibleDataHubCompanies(backendCompanies: Company[], platformClients: PlatformClient[]) {
  if (platformClients.length) return platformCompanies(backendCompanies, platformClients);
  return backendCompanies.sort((first, second) => first.name.localeCompare(second.name));
}

function meanScore(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function dataHubPlantTokens(row: Record<string, unknown>) {
  const lineage = readRecord(row.lineage);
  const metadata = readRecord(row.metadata);
  const connectionDetails = readRecord(row.connection_details);
  const metadataConnectionDetails = readRecord(metadata.connection_details);
  return [
    row.plant_id,
    row.plant_name,
    lineage.plant_id,
    lineage.plant,
    lineage.plant_name,
    metadata.plant_id,
    metadata.plant_name,
    metadataConnectionDetails.plant_id,
    metadataConnectionDetails.plant_name,
    connectionDetails.plant_id,
    connectionDetails.plant_name,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function CompanySearchSelect({
  companies,
  selectedCompanyId,
  onChange,
}: {
  companies: Company[];
  selectedCompanyId: string;
  onChange: (companyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const activeCompany = companies.find((company) => company.id === selectedCompanyId);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCompanies = companies.filter((company) =>
    !normalizedSearch || `${company.name} ${company.code}`.toLowerCase().includes(normalizedSearch));
  const containerRef = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative mt-3">
      <button
        type="button"
        className={`${selectClass} flex w-full items-center justify-between gap-3 text-left`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{activeCompany ? `${activeCompany.name} (${activeCompany.code})` : 'Select client'}</span>
        <span className="text-slate-400">v</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <input
            className={`${inputClass} w-full`}
            placeholder="Search clients..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <div className="mt-2 max-h-64 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.55)_rgba(255,255,255,0.05)]">
            {filteredCompanies.map((company) => (
              <button
                key={company.id}
                type="button"
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition ${
                  company.id === selectedCompanyId ? 'bg-cyan-400/18 text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                onClick={() => {
                  onChange(company.id);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="font-semibold">{company.name}</span>
                <span className="text-xs text-slate-500">{company.code}</span>
              </button>
            ))}
            {!filteredCompanies.length ? (
              <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">No clients matched.</div>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-slate-500">{filteredCompanies.length} of {companies.length} clients</div>
        </div>
      ) : null}
    </div>
  );
}

function CompanySelector({
  companies,
  selectedCompanyId,
  user,
  onChange,
}: {
  companies: Company[];
  selectedCompanyId: string;
  user: RuntimeUser;
  onChange: (companyId: string) => void;
}) {
  const activeCompany = companies.find((company) => company.id === selectedCompanyId);
  if (!canSelectCompany(user)) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Company scope</p>
        <p className="mt-2 text-lg font-semibold text-white">{activeCompany?.name ?? user.company_id ?? 'Assigned company'}</p>
        <p className="mt-1 text-sm text-slate-300">Admin users can only add, change, and read DataHub data for their own company.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-cyan-300/15 bg-cyan-400/8 p-4 shadow-[0_18px_60px_rgba(8,145,178,0.12)]">
      <label className="text-xs uppercase tracking-[0.22em] text-cyan-100">Super Admin target client</label>
      <CompanySearchSelect companies={companies} selectedCompanyId={selectedCompanyId} onChange={onChange} />
      <p className="mt-2 text-sm text-slate-300">
        This follows Platform View clients. DataHub will sync the backend company record before saving data.
      </p>
    </div>
  );
}

type DataHubPlantOption = {
  plantId: string;
  plantName: string;
  status: string;
};

function PlantSearchSelect({
  plants,
  selectedPlantId,
  onChange,
}: {
  plants: DataHubPlantOption[];
  selectedPlantId: string;
  onChange: (plantId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const activePlant = plants.find((plant) => plant.plantId === selectedPlantId) ?? plants[0];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredPlants = plants.filter((plant) =>
    !normalizedSearch || `${plant.plantName} ${plant.plantId} ${plant.status}`.toLowerCase().includes(normalizedSearch));
  const containerRef = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative mt-3">
      <button
        type="button"
        className={`${selectClass} flex w-full items-center justify-between gap-3 text-left`}
        onClick={() => setOpen((value) => !value)}
        disabled={!plants.length}
      >
        <span className="truncate">{activePlant ? `${activePlant.plantName} (${activePlant.plantId})` : 'No plants available'}</span>
        <span className="text-slate-400">v</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <input
            className={`${inputClass} w-full`}
            placeholder="Search plants..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <div className="mt-2 max-h-48 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.55)_rgba(255,255,255,0.05)]">
            {filteredPlants.map((plant) => (
              <button
                key={plant.plantId}
                type="button"
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition ${
                  plant.plantId === selectedPlantId ? 'bg-cyan-400/18 text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                onClick={() => {
                  onChange(plant.plantId);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="font-semibold">{plant.plantName}</span>
                <span className="text-xs text-slate-500">{plant.plantId} · {plant.status}</span>
              </button>
            ))}
            {!filteredPlants.length ? (
              <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">No plants matched.</div>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-slate-500">{filteredPlants.length} of {plants.length} plants</div>
        </div>
      ) : null}
    </div>
  );
}

function PlantSelector({
  plants,
  selectedPlantId,
  onChange,
}: {
  plants: DataHubPlantOption[];
  selectedPlantId: string;
  onChange: (plantId: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
      <label className="text-xs uppercase tracking-[0.22em] text-slate-400">Target plant</label>
      <PlantSearchSelect plants={plants} selectedPlantId={selectedPlantId} onChange={onChange} />
      <p className="mt-2 text-sm text-slate-300">
        Plant context is saved with catalog, mapping, preview, and import draft metadata.
      </p>
    </div>
  );
}

function PowerBiGetDataExperience({
  selectedSource,
  selectedSourceValue,
  onSelectSource,
  wizardStep,
  setWizardStep,
  selectedTransforms,
  setSelectedTransforms,
  selectedDestination,
  setSelectedDestination,
  selectedRefresh,
  setSelectedRefresh,
  connectionTested,
  setConnectionTested,
  targetCompanyName,
  moduleFilter,
  onCreateDraft,
  onTestConnection,
  backendCatalog,
  savedConnections,
  selectedSavedConnection,
  backendPreview,
  backendModel,
  refreshRows,
  errorRows,
  auditRows,
  onSelectSavedConnection,
  onRunRefresh,
  onValidateMapping,
  onDeleteSavedConnection,
}: {
  selectedSource: DataSourceOption;
  selectedSourceValue: string;
  onSelectSource: (source: DataSourceOption) => void;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  selectedTransforms: string[];
  setSelectedTransforms: (items: string[]) => void;
  selectedDestination: string;
  setSelectedDestination: (module: string) => void;
  selectedRefresh: string;
  setSelectedRefresh: (refresh: string) => void;
  connectionTested: boolean;
  setConnectionTested: (tested: boolean) => void;
  targetCompanyName: string;
  moduleFilter: string;
  onCreateDraft: () => void;
  onTestConnection: () => void;
  backendCatalog?: GetDataCatalog;
  savedConnections: GetDataSavedConnection[];
  selectedSavedConnection?: GetDataSavedConnection;
  backendPreview?: GetDataPreview;
  backendModel?: GetDataModel;
  refreshRows: Array<Record<string, unknown>>;
  errorRows: Array<Record<string, unknown>>;
  auditRows: Array<Record<string, unknown>>;
  onSelectSavedConnection: (connectionId: string) => void;
  onRunRefresh: () => void;
  onValidateMapping: () => void;
  onDeleteSavedConnection: (connectionId: string) => void;
}) {
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [sourceMenuExpanded, setSourceMenuExpanded] = useState(false);
  const [connectorDialogOpen, setConnectorDialogOpen] = useState(false);
  const sourceMenuRef = useClickOutside<HTMLDivElement>(sourceMenuOpen, () => {
    setSourceMenuOpen(false);
    setSourceMenuExpanded(false);
  });
  const visibleDestinations = destinationModules.filter((module) => !moduleFilter || module === moduleFilter);
  const liveConnectorGroups = backendCatalog?.groups ?? [];
  const liveConnectorCount = liveConnectorGroups.reduce((total, group) => total + group.connectors.length, 0);
  const liveTransformOptions = backendCatalog?.transform_operations ?? transformOptions;
  const liveRefreshOptions = backendCatalog?.refresh_modes ?? refreshOptions;
  const connectionProfile = connectionProfileFor(selectedSource);
  const commonSourceValues = ['excel', 'sql_server', 'csv', 'web_url', 'odata', 'postgresql', 'google_sheets', 'manual_entry'];
  const commonSources = commonSourceValues
    .map((value) => flatPowerBiSources.find((source) => source.value === value))
    .filter(Boolean) as DataSourceOption[];
  const quickCards = [
    { title: 'Import from Excel', source: flatPowerBiSources.find((source) => source.value === 'excel') },
    { title: 'Import from SQL Server', source: flatPowerBiSources.find((source) => source.value === 'sql_server') },
    { title: 'Paste data into table', source: flatPowerBiSources.find((source) => source.value === 'bulk_paste') },
    { title: 'Connect web or API', source: flatPowerBiSources.find((source) => source.value === 'rest_api') },
  ].filter((item): item is { title: string; source: DataSourceOption } => Boolean(item.source));
  const normalizedSearch = sourceSearch.trim().toLowerCase();
  const matchingSourceGroups = powerBiSourceGroups
    .map((group) => ({
      ...group,
      sources: group.sources.filter((source) =>
        !normalizedSearch
        || `${group.group} ${source.label} ${source.description} ${source.auth} ${source.connectorType}`.toLowerCase().includes(normalizedSearch)),
    }))
    .filter((group) => group.sources.length);
  const stepLabel = guidedSteps[wizardStep - 1] ?? guidedSteps[0];
  const completedCount = Math.max(0, wizardStep - 1);
  function chooseSource(source: DataSourceOption, nextStep = 2) {
    onSelectSource(source);
    setSourceMenuOpen(false);
    setSourceMenuExpanded(false);
    setConnectorDialogOpen(true);
    setWizardStep(Math.max(wizardStep, nextStep));
  }
  return (
    <div className="mt-4 space-y-4">
      <Panel title="Home" description="Power BI-style ribbon for choosing sources, entering data, transforming data, and creating import drafts.">
        <div className="overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/40">
          <div className="flex flex-wrap gap-1 border-b border-white/10 bg-white/[0.03] px-4 pt-3">
            {['File', 'Home', 'Insert', 'Modeling', 'View', 'Optimize', 'Help'].map((tab) => (
              <button
                key={tab}
                className={`rounded-t-xl px-4 py-2 text-sm font-semibold transition ${tab === 'Home' ? 'border-b-2 border-cyan-300 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div ref={sourceMenuRef} className="relative flex flex-wrap gap-2 border-b border-white/10 bg-white/[0.04] p-3">
            <button
              type="button"
              className={`min-w-[92px] rounded-2xl border px-3 py-3 text-center text-sm transition ${sourceMenuOpen ? 'border-cyan-300/35 bg-cyan-400/14 text-white' : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/8'}`}
              onClick={() => setSourceMenuOpen((value) => !value)}
            >
              <Database className="mx-auto mb-1 h-5 w-5 text-cyan-200" />
              Get data
              <span className="ml-1 text-slate-500">v</span>
            </button>
            {[
              ['Excel workbook', 'excel'],
              ['SQL Server', 'sql_server'],
              ['Enter data', 'manual_entry'],
              ['Recent sources', 'folder'],
              ['Transform data', 'csv'],
              ['Refresh', 'webhook'],
              ['New visual', 'reports'],
              ['Text box', 'bulk_paste'],
              ['More visuals', 'template_upload'],
            ].map(([label, value]) => {
              const source = flatPowerBiSources.find((item) => item.value === value);
              return (
                <button
                  key={label}
                  type="button"
                  className="min-w-[92px] rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-sm text-slate-300 transition hover:bg-white/8 hover:text-white"
                  onClick={() => {
                    if (source) chooseSource(source);
                  }}
                >
                  <Database className="mx-auto mb-1 h-5 w-5 text-slate-300" />
                  {label}
                </button>
              );
            })}
            {sourceMenuOpen ? (
              <div className={`absolute left-3 top-[96px] z-20 max-h-[520px] w-[min(92vw,760px)] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.04)] ${sourceMenuExpanded ? 'max-w-[760px]' : 'max-w-[360px]'}`}>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <p className="text-sm font-semibold text-white">{sourceMenuExpanded ? 'All data sources' : 'Common data sources'}</p>
                  {sourceMenuExpanded ? (
                    <button type="button" className="text-xs font-semibold text-cyan-200 hover:text-cyan-100" onClick={() => setSourceMenuExpanded(false)}>
                      Common only
                    </button>
                  ) : null}
                </div>
                {sourceMenuExpanded ? (
                  <input
                    className={`${inputClass} mb-3 w-full`}
                    placeholder="Search all sources: Excel, SQL, SAP, API, sensor..."
                    value={sourceSearch}
                    onChange={(event) => setSourceSearch(event.target.value)}
                  />
                ) : null}
                {!sourceMenuExpanded ? (
                  <div className="space-y-1">
                    {commonSources.map((source) => (
                      <button
                        key={source.value}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${selectedSourceValue === source.value ? 'bg-cyan-400/14 text-cyan-50' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}
                        onClick={() => {
                          chooseSource(source);
                        }}
                      >
                        <Database className="h-4 w-4 text-cyan-200" />
                        <span>
                          <span className="block font-medium">{source.label}</span>
                          <span className="block text-xs text-slate-500">{source.group}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {matchingSourceGroups.map((group) => (
                      <div key={group.group} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">{group.group}</p>
                          <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400">{group.sources.length}</span>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {group.sources.map((source) => {
                            const fullSource = { ...source, group: group.group };
                            return (
                              <button
                                key={source.value}
                                type="button"
                                className={`flex items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${selectedSourceValue === source.value ? 'bg-cyan-400/14 text-cyan-50' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}
                                onClick={() => chooseSource(fullSource)}
                              >
                                <Database className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                                <span>
                                  <span className="block font-medium">{source.label}</span>
                                  <span className="block text-xs leading-5 text-slate-500">{source.auth}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {!matchingSourceGroups.length ? (
                      <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                        No sources matched. Try Excel, database, API, SAP, cloud, or sensor.
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="mt-2 border-t border-white/10 pt-2">
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-cyan-100 hover:bg-cyan-400/10"
                    onClick={() => {
                      setSourceMenuExpanded(true);
                      setSourceSearch('');
                    }}
                  >
                    {sourceMenuExpanded ? 'Showing all sources' : 'More...'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid min-h-[320px] place-items-center bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_42%),rgba(15,23,42,0.18)] p-8 text-center" onClick={() => setSourceMenuOpen(false)}>
            <div className="w-full max-w-5xl">
              <h2 className="text-3xl font-semibold tracking-tight text-white">Add data to your platform</h2>
              <p className="mt-3 text-lg text-slate-300">Once loaded, your data can be previewed, transformed, mapped, validated, and routed to the selected module.</p>
              <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-50">
                Selected: {selectedSource.label}
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                {quickCards.map(({ title, source }) => (
                  <button
                    key={title}
                    type="button"
                    className={`rounded-[24px] border p-5 text-left transition hover:-translate-y-0.5 ${selectedSourceValue === source.value ? 'border-cyan-300/45 bg-cyan-400/14 shadow-[0_0_34px_rgba(34,211,238,0.14)]' : 'border-white/10 bg-white/[0.05] hover:bg-white/8'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      chooseSource(source);
                    }}
                  >
                    <Database className="h-8 w-8 text-cyan-200" />
                    <p className="mt-5 font-semibold text-white">{title}</p>
                    <p className="mt-2 text-sm leading-5 text-slate-400">{source.description}</p>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-6 text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                onClick={(event) => {
                  event.stopPropagation();
                  setSourceMenuOpen(true);
                  setSourceSearch('');
                }}
              >
                Get data from another source -&gt;
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Start a Data Import" description="Follow this guided path. Nothing is posted into a module until you create a draft and send it for approval.">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {[
            ['1', 'Pick a source', 'Choose Excel, SAP, database, API, cloud app, machine data, or manual entry.'],
            ['2', 'Check and shape data', 'Test the connection, preview rows, clean values, and map fields.'],
            ['3', 'Create a safe draft', 'Select destination module and refresh mode. Critical imports require approval.'],
          ].map(([number, title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/12 text-sm font-bold text-cyan-100">{number}</span>
                <p className="font-semibold text-white">{title}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
            </div>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">Current step</p>
            <p className="mt-1 text-lg font-semibold text-white">{wizardStep}. {stepLabel}</p>
            <p className="mt-1 text-sm text-slate-400">Target client: {targetCompanyName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={`${completedCount} completed`} />
            <StatusBadge status={connectionTested ? 'Connection tested' : 'Connection not tested'} />
            <StatusBadge status={selectedDestination} />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-10">
          {guidedSteps.map((step, index) => {
            const active = wizardStep === index + 1;
            const complete = wizardStep > index + 1;
            return (
              <button key={step} className={`rounded-2xl border p-3 text-left text-xs transition ${active ? 'border-cyan-300/40 bg-cyan-400/15 text-white' : complete ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-400'}`} onClick={() => setWizardStep(index + 1)}>
                <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Step {index + 1}</span>
                <span className="mt-1 block font-semibold">{step}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Live Connector Catalog" description="Connector registry returned by the backend, grouped like Power BI Get Data.">
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusBadge status={`${liveConnectorGroups.length} groups`} />
            <StatusBadge status={`${liveConnectorCount} connectors`} />
            <StatusBadge status={`${liveTransformOptions.length} transforms`} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {liveConnectorGroups.map((group) => (
              <div key={group.category} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{group.category}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{group.description}</p>
                  </div>
                  <StatusBadge status={`${group.connectors.length}`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.connectors.map((connector) => (
                    <span key={connector.key} className="rounded-full border border-cyan-300/15 bg-cyan-400/8 px-3 py-1 text-xs text-cyan-50">
                      {connector.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Saved Connections" description="Manage credentials, source selections, refresh mode, and destination module from backend records.">
          <div className="mb-4 grid gap-2">
            {savedConnections.length ? savedConnections.slice(0, 5).map((connection) => (
              <div key={connection.id} className={`rounded-2xl border p-3 ${selectedSavedConnection?.id === connection.id ? 'border-cyan-300/35 bg-cyan-400/12' : 'border-white/10 bg-white/[0.04]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="text-left" onClick={() => onSelectSavedConnection(connection.id)}>
                    <span className="block text-sm font-semibold text-white">{connection.connection_name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{connection.connector_name} {'->'} {connection.destination_module}</span>
                  </button>
                  <StatusBadge status={connection.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge status={connection.last_test_status} />
                  <StatusBadge status={connection.refresh_mode} />
                  <button type="button" className="rounded-full border border-red-300/20 bg-red-400/10 px-3 py-1 text-xs text-red-100" onClick={() => onDeleteSavedConnection(connection.id)}>
                    Delete
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-slate-400">
                No saved Get Data connections yet. Select a source and create an import draft.
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="form-button-primary" disabled={!selectedSavedConnection} onClick={onRunRefresh}>Run Refresh</button>
            <button type="button" className="form-button-subtle" disabled={!selectedSavedConnection} onClick={onValidateMapping}>Validate Mapping</button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Preview Data" description="Check a small sample before you transform or map fields. This prevents wrong data entering a module.">
          <DataTable
            rows={previewRows}
            emptyTitle="No preview rows"
            columns={[
              { key: 'item_code', label: 'Item Code' },
              { key: 'item_name', label: 'Item Name' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'plant', label: 'Plant' },
              { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
            ]}
          />
        </Panel>

        <Panel title="Clean and Transform" description="Select transformations to apply to the import draft. You can change these before approval.">
          <div className="grid gap-2 sm:grid-cols-2">
            {liveTransformOptions.map((option) => {
              const selected = selectedTransforms.includes(option);
              return (
                <button key={option} type="button" className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${selected ? 'border-cyan-300/35 bg-cyan-400/12 text-cyan-50' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-white'}`} onClick={() => setSelectedTransforms(selected ? selectedTransforms.filter((item) => item !== option) : [...selectedTransforms, option])}>
                  {selected ? <CheckCircle2 className="mr-2 inline h-4 w-4 text-cyan-200" /> : null}
                  {option}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Map Fields" description="Tell the platform where each source column belongs.">
          <div className="space-y-2">
            {[
              ['item_code', 'Inventory.Item Code'],
              ['quantity', 'Inventory.On Hand Quantity'],
              ['plant', 'Admin Plant ID'],
              ['status', 'Inventory Status'],
            ].map(([source, target]) => (
              <div key={source} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/25 p-3 text-sm">
                <span className="text-slate-200">{source}</span>
                <span className="text-cyan-200">to</span>
                <span className="text-white">{target}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Validate Before Import" description="Warnings and approval requirements are shown before any module data changes.">
          <div className="space-y-2">
            {validationRows.map((row) => (
              <div key={row.rule} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{row.rule}</p>
                  <StatusBadge status={row.severity} />
                </div>
                <p className="mt-1 text-sm text-slate-400">{row.result}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Create Import Draft" description="Choose destination and refresh behavior. This creates a draft, not an automatic production import.">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">
              Destination module
              <select className={`${selectClass} mt-1 w-full`} value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)}>
                {visibleDestinations.map((module) => <option key={module}>{module}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Refresh mode
              <select className={`${selectClass} mt-1 w-full`} value={selectedRefresh} onChange={(event) => setSelectedRefresh(event.target.value)}>
                {liveRefreshOptions.map((mode) => <option key={mode}>{mode}</option>)}
              </select>
            </label>
            <button className="form-button-primary w-full" onClick={onCreateDraft}>Create Import Draft</button>
            <button className="form-button-subtle w-full" onClick={() => setWizardStep(10)}>Send for Approval</button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Backend Preview and Type Detection" description="Preview rows and inferred data types returned by the Get Data API before loading.">
          {backendPreview ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {backendPreview.detected_types.map((item) => (
                  <StatusBadge key={item.column} status={`${item.column}: ${item.detected_type}`} />
                ))}
              </div>
              <DataTable
                rows={backendPreview.rows}
                emptyTitle="No backend preview rows"
                columns={backendPreview.columns.map((column) => ({ key: column, label: column.replaceAll('_', ' ') }))}
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-slate-400">Save/select a connection to fetch backend preview rows.</div>
          )}
        </Panel>

        <Panel title="Data Model" description="Power BI-style model area with tables, columns, measures, calculated columns, keys, and relationships.">
          <div className="space-y-3">
            {(backendModel?.tables ?? []).slice(0, 4).map((table) => (
              <div key={`${table.source}-${table.table}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{table.table}</p>
                    <p className="mt-1 text-xs text-slate-400">{table.source}</p>
                  </div>
                  <StatusBadge status={`PK: ${table.primary_key}`} />
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-300">{table.columns.join(', ')}</p>
              </div>
            ))}
            {(backendModel?.relationships ?? []).slice(0, 3).map((relationship) => (
              <div key={String(relationship.id)} className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-3 text-sm text-cyan-50">
                {String(relationship.left_table)}.{String(relationship.left_column)} {'->'} {String(relationship.right_table)}.{String(relationship.right_column)}
              </div>
            ))}
            {!backendModel?.tables?.length ? <p className="text-sm text-slate-400">No model yet. Select assets on a saved connection to build the model.</p> : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Refresh History" description="Manual, scheduled, incremental, webhook and failed refresh outcomes.">
          <DataTable
            rows={refreshRows.slice(0, 6)}
            emptyTitle="No backend refresh runs"
            columns={[
              { key: 'refresh_mode', label: 'Mode' },
              { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
              { key: 'rows_processed', label: 'Rows' },
              { key: 'failure_reason', label: 'Failure Reason' },
            ]}
          />
        </Panel>
        <Panel title="Error Logs" description="Failed connection tests and refresh problems include clear reasons and next steps.">
          <DataTable
            rows={errorRows.slice(0, 6)}
            emptyTitle="No backend error logs"
            columns={[
              { key: 'severity', label: 'Severity', render: (value) => <StatusBadge status={String(value)} /> },
              { key: 'error_code', label: 'Code' },
              { key: 'message', label: 'Message' },
              { key: 'resolution_hint', label: 'Resolution' },
            ]}
          />
        </Panel>
        <Panel title="Audit Trail" description="Every connector, preview, transform, mapping and refresh action is tracked.">
          <DataTable
            rows={auditRows.slice(0, 6)}
            emptyTitle="No backend audit events"
            columns={[
              { key: 'actor_email', label: 'Actor' },
              { key: 'action', label: 'Action' },
              { key: 'entity_type', label: 'Entity' },
              { key: 'created_at', label: 'Time' },
            ]}
          />
        </Panel>
      </div>
      {connectorDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`${selectedSource.label} connector`}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.65)] [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.04)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Get Data Connector</p>
                <h3 className="mt-1 text-xl font-semibold text-white">{selectedSource.label}</h3>
                <p className="mt-1 text-sm text-slate-400">{selectedSource.group} / {selectedSource.connectorType}</p>
              </div>
              <button type="button" className="form-button-subtle" onClick={() => setConnectorDialogOpen(false)}>
                Close
              </button>
            </div>
            <div className="space-y-4 p-5">
              <SourceSpecificConnectorPanel
                source={selectedSource}
                profile={connectionProfile}
                connectionTested={connectionTested}
                onTestConnection={() => {
                  onTestConnection();
                  setConnectionTested(true);
                  setWizardStep(Math.max(wizardStep, 4));
                }}
              />

              <Panel title={`Select ${connectionProfile.assetLabel} to Load`} description={connectionProfile.assetDescription}>
                <div className="grid gap-2 md:grid-cols-2">
                  {connectionProfile.assets.map((entity) => (
                    <label key={entity} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                      <span>{entity}</span>
                      <input type="radio" name="source-entity" defaultChecked={entity === connectionProfile.assets[0]} onChange={() => setWizardStep(Math.max(wizardStep, 5))} />
                    </label>
                  ))}
                </div>
              </Panel>

              <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
                <button type="button" className="form-button-subtle" onClick={() => setConnectorDialogOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="form-button-primary"
                  onClick={() => {
                    setConnectorDialogOpen(false);
                    setWizardStep(Math.max(wizardStep, 5));
                  }}
                >
                  Continue to Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourceSpecificConnectorPanel({
  source,
  profile,
  connectionTested,
  onTestConnection,
}: {
  source: DataSourceOption;
  profile: ConnectionProfile;
  connectionTested: boolean;
  onTestConnection: () => void;
}) {
  const commonFooter = (
    <ConnectorActionFooter
      primaryAction={profile.primaryAction}
      connectionTested={connectionTested}
      onTestConnection={onTestConnection}
      readOnly={source.connectorType !== 'MANUAL'}
    />
  );

  if (source.value === 'excel') {
    return (
      <Panel title="Excel Workbook" description="Power BI-style workbook import. Choose a file or cloud link first, then discover sheets and named tables.">
        <ConnectorHeader source={source} nextAction="Open workbook navigator" />
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Workbook source</p>
            <label className="mt-4 block text-sm font-medium text-slate-300">
              Upload Excel workbook
              <input className={`${inputClass} mt-1 w-full`} type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.ods" />
            </label>
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-slate-500">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
            <label className="block text-sm font-medium text-slate-300">
              OneDrive / SharePoint / Google Drive link
              <input className={`${inputClass} mt-1 w-full`} placeholder="https://sharepoint.company.com/sites/ops/inventory.xlsx" />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-300">
                Password if protected
                <input className={`${inputClass} mt-1 w-full`} type="password" placeholder="Optional workbook password" />
              </label>
              <label className="text-sm font-medium text-slate-300">
                Import mode
                <select className={`${selectClass} mt-1 w-full`} defaultValue="Import">
                  <option>Import</option>
                  <option>Refresh from cloud link</option>
                </select>
              </label>
            </div>
          </div>
          <ConnectorNavigator
            title="Workbook navigator"
            items={['Stock Balance sheet', 'Batch Ledger named table', 'Supplier Lead Time sheet', 'Hidden rows ignored', 'First row headers detected']}
          />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.value === 'csv') {
    return (
      <Panel title="Text/CSV" description="Delimited-file import with encoding, delimiter, header, and sample-row controls.">
        <ConnectorHeader source={source} nextAction="Preview detected table" />
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <label className="block text-sm font-medium text-slate-300">
              CSV / TSV file
              <input className={`${inputClass} mt-1 w-full`} type="file" accept=".csv,.tsv,.txt" />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-300">
                Delimiter
                <select className={`${selectClass} mt-1 w-full`} defaultValue="Auto detect">
                  <option>Auto detect</option>
                  <option>Comma</option>
                  <option>Semicolon</option>
                  <option>Tab</option>
                  <option>Pipe</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">
                Encoding
                <select className={`${selectClass} mt-1 w-full`} defaultValue="UTF-8">
                  <option>UTF-8</option>
                  <option>UTF-16</option>
                  <option>Windows-1252</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">
                First row as headers
                <select className={`${selectClass} mt-1 w-full`} defaultValue="Yes">
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">
                Bad row handling
                <select className={`${selectClass} mt-1 w-full`} defaultValue="Keep as validation errors">
                  <option>Keep as validation errors</option>
                  <option>Skip bad rows</option>
                  <option>Stop import</option>
                </select>
              </label>
            </div>
          </div>
          <ConnectorNavigator title="Detected preview settings" items={['Column count auto-detected', 'Text qualifiers supported', 'Numeric and date type inference', 'Rejected-row list created']} />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.value === 'sql_server') {
    return (
      <Panel title="SQL Server Database" description="Database connector format with server, optional database, connectivity mode, and advanced query options.">
        <ConnectorHeader source={source} nextAction="Open SQL object navigator" />
        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-300">
                Server
                <input className={`${inputClass} mt-1 w-full`} placeholder="sql-server.company.local,1433" autoFocus />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Database (optional)
                <input className={`${inputClass} mt-1 w-full`} placeholder="manufacturing_ops" />
              </label>
              <div>
                <p className="text-sm font-medium text-slate-300">Data connectivity mode</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {['Import', 'DirectQuery'].map((mode, index) => (
                    <label key={mode} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                      <input type="radio" name="sql-connectivity" defaultChecked={index === 0} />
                      {mode}
                    </label>
                  ))}
                </div>
              </div>
              <details className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-cyan-100">Advanced options</summary>
                <label className="mt-3 block text-sm font-medium text-slate-300">
                  SQL statement
                  <textarea className={`${inputClass} mt-1 min-h-24 w-full`} placeholder="Optional SELECT statement. Read-only queries only." />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-300">
                  Command timeout
                  <input className={`${inputClass} mt-1 w-full`} placeholder="30 seconds" />
                </label>
              </details>
            </div>
          </div>
          <DatabaseCredentialCard authOptions={['Database credentials', 'Windows / AD', 'Azure AD']} />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.connectorType === 'DATABASE' || source.connectorType === 'WAREHOUSE') {
    return (
      <Panel title={`${source.label} Database`} description="Schema-first database connector with host, port, database, schema, SSL, credentials, and table discovery.">
        <ConnectorHeader source={source} nextAction="Discover schemas and tables" />
        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-300">
              Host
              <input className={`${inputClass} mt-1 w-full`} placeholder={`${source.value}.company.local`} />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Port
              <input className={`${inputClass} mt-1 w-full`} placeholder={source.value === 'postgresql' ? '5432' : '3306'} />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Database
              <input className={`${inputClass} mt-1 w-full`} placeholder="manufacturing_ops" />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Schema / collection
              <input className={`${inputClass} mt-1 w-full`} placeholder="public / dbo / collection" />
            </label>
            <label className="text-sm font-medium text-slate-300">
              SSL mode
              <select className={`${selectClass} mt-1 w-full`} defaultValue="Require">
                <option>Require</option>
                <option>Prefer</option>
                <option>Disable</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-300">
              Connection role
              <select className={`${selectClass} mt-1 w-full`} defaultValue="Read-only">
                <option>Read-only</option>
                <option>Read-only with warehouse views</option>
              </select>
            </label>
          </div>
          <DatabaseCredentialCard authOptions={source.auth.split('/').map((item) => item.trim())} />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.connectorType === 'API' || source.connectorType === 'WEB' || source.connectorType === 'WEBHOOK') {
    return (
      <Panel title={source.value === 'web_url' ? 'Web URL' : `${source.label} Endpoint`} description="Endpoint connector with method, auth, headers, parameters, pagination, and response-shape controls.">
        <ConnectorHeader source={source} nextAction="Fetch endpoint sample" />
        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <label className="text-sm font-medium text-slate-300">
                Method
                <select className={`${selectClass} mt-1 w-full`} defaultValue="GET">
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">
                URL
                <input className={`${inputClass} mt-1 w-full`} placeholder="https://api.company.com/v1/inventory/items" />
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-300">
                Authentication
                <select className={`${selectClass} mt-1 w-full`} defaultValue="Bearer token">
                  <option>No Auth</option>
                  <option>API key</option>
                  <option>Bearer token</option>
                  <option>OAuth2</option>
                  <option>Basic Auth</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">
                Token / key
                <input className={`${inputClass} mt-1 w-full`} type="password" placeholder="Masked after save" />
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium text-slate-300">
              Headers
              <textarea className={`${inputClass} mt-1 min-h-20 w-full`} placeholder='{"Accept":"application/json","x-tenant":"ABC"}' />
            </label>
          </div>
          <ConnectorNavigator title="Response handling" items={['JSON path selector', 'Pagination: next link / offset', 'Retry policy', 'Webhook receiver URL', 'Sample payload validation']} />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.connectorType === 'CLOUD_APP' || source.connectorType === 'ERP' || source.connectorType === 'MES' || source.connectorType === 'WMS' || source.connectorType === 'SCM') {
    return (
      <Panel title={`${source.label} Application Connector`} description="Business-application connector with tenant, OAuth/API credentials, object scope, and module routing.">
        <ConnectorHeader source={source} nextAction="Authorize and list business objects" />
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-4">
            <label className="block text-sm font-medium text-slate-300">
              Tenant / client / company code
              <input className={`${inputClass} mt-1 w-full`} placeholder="SAP client, Salesforce org, Google workspace, MES site" />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-300">
              Resource URL
              <input className={`${inputClass} mt-1 w-full`} placeholder="https://system.company.com" />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-300">
                Auth flow
                <select className={`${selectClass} mt-1 w-full`} defaultValue={source.auth.split('/')[0]?.trim()}>
                  {source.auth.split('/').map((option) => <option key={option.trim()}>{option.trim()}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">
                Refresh policy
                <select className={`${selectClass} mt-1 w-full`} defaultValue="Scheduled refresh">
                  <option>Scheduled refresh</option>
                  <option>Manual refresh only</option>
                  <option>Incremental refresh</option>
                </select>
              </label>
            </div>
          </div>
          <ConnectorNavigator title="Business objects" items={['Material master', 'Stock balance', 'Purchase orders', 'Production orders', 'Asset register', 'Quality lots']} />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.connectorType === 'IOT' || source.connectorType === 'DEVICE' || source.connectorType === 'EVENT') {
    return (
      <Panel title={`${source.label} Stream`} description="Machine and event-data format with gateway, topics, tags, certificate/token, and sampling controls.">
        <ConnectorHeader source={source} nextAction="Subscribe to sample stream" />
        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-300 sm:col-span-2">
              Gateway endpoint
              <input className={`${inputClass} mt-1 w-full`} placeholder="opc.tcp://edge.local:4840 or mqtts://broker.company.com" />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Topic / tag path
              <input className={`${inputClass} mt-1 w-full`} placeholder="factory/line1/machine5/#" />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Sampling interval
              <select className={`${selectClass} mt-1 w-full`} defaultValue="Real time">
                <option>Real time</option>
                <option>5 seconds</option>
                <option>1 minute</option>
                <option>5 minutes</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-300">
              Certificate alias
              <input className={`${inputClass} mt-1 w-full`} placeholder="edge-cert-prod" />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Token
              <input className={`${inputClass} mt-1 w-full`} type="password" placeholder="Masked after save" />
            </label>
          </div>
          <ConnectorNavigator title="Stream payloads" items={['Runtime tag', 'Temperature tag', 'Barcode event', 'Quality sensor', 'Downtime signal']} />
        </div>
        {commonFooter}
      </Panel>
    );
  }

  if (source.connectorType === 'MANUAL') {
    return (
      <Panel title={source.label} description="Manual data format for controlled entry, copy-paste tables, or template uploads.">
        <ConnectorHeader source={source} nextAction="Create controlled manual dataset" />
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <label className="block text-sm font-medium text-slate-300">
              Template
              <select className={`${selectClass} mt-1 w-full`} defaultValue="Inventory template">
                <option>Inventory template</option>
                <option>Planning template</option>
                <option>Maintenance template</option>
                <option>Admin master data</option>
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-300">
              Owner
              <input className={`${inputClass} mt-1 w-full`} placeholder="data.owner@company.com" />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-300">
              Approval reason
              <textarea className={`${inputClass} mt-1 min-h-20 w-full`} placeholder="Reason for manual import" />
            </label>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/35 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Paste table</p>
            <textarea className={`${inputClass} mt-3 min-h-44 w-full font-mono text-xs`} placeholder={'item_code\titem_name\tquantity\nRM-001\tSteel coil\t680'} />
          </div>
        </div>
        {commonFooter}
      </Panel>
    );
  }

  return (
    <Panel title={profile.title} description={profile.description}>
      <ConnectorHeader source={source} nextAction={profile.primaryAction} />
      <ConnectorNavigator title="Available source assets" items={profile.assets} />
      {commonFooter}
    </Panel>
  );
}

function ConnectorHeader({ source, nextAction }: { source: DataSourceOption; nextAction: string }) {
  return (
    <div className="mb-4 grid gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-4 sm:grid-cols-3">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">Selected source</p>
        <p className="mt-1 font-semibold text-white">{source.label}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">Format</p>
        <p className="mt-1 font-semibold text-white">{source.connectorType}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">Next action</p>
        <p className="mt-1 font-semibold text-white">{nextAction}</p>
      </div>
    </div>
  );
}

function ConnectorActionFooter({
  primaryAction,
  connectionTested,
  readOnly,
  onTestConnection,
}: {
  primaryAction: string;
  connectionTested: boolean;
  readOnly: boolean;
  onTestConnection: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="form-button-primary" onClick={onTestConnection}>{primaryAction}</button>
      <StatusBadge status={connectionTested ? 'Connection Tested' : 'Not Tested'} />
      {readOnly ? <StatusBadge status="Read-only mode" /> : <StatusBadge status="Approval required" />}
    </div>
  );
}

function ConnectorNavigator({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <label key={item} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
            <span>{item}</span>
            <input type="checkbox" defaultChecked={index < 2} />
          </label>
        ))}
      </div>
    </div>
  );
}

function DatabaseCredentialCard({ authOptions }: { authOptions: string[] }) {
  return (
    <div className="rounded-2xl border border-cyan-300/15 bg-slate-950/35 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Credentials</p>
      <label className="mt-3 block text-sm font-medium text-slate-300">
        Authentication
        <select className={`${selectClass} mt-1 w-full`} defaultValue={authOptions[0]}>
          {authOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-300">
        Read-only username
        <input className={`${inputClass} mt-1 w-full`} placeholder="readonly_user" />
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-300">
        Password / secret
        <input className={`${inputClass} mt-1 w-full`} type="password" placeholder="Stored securely" />
      </label>
      <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100">
        Credentials are masked in the UI, saved as metadata placeholders in this demo, and treated as read-only for imports.
      </div>
    </div>
  );
}

type ConnectionProfile = {
  title: string;
  description: string;
  primaryAction: string;
  assetLabel: string;
  assetDescription: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder?: string;
    kind?: 'text' | 'password' | 'select' | 'file';
    options?: string[];
    fullWidth?: boolean;
  }>;
  assets: string[];
};

function connectionProfileFor(source: DataSourceOption): ConnectionProfile {
  if (source.value === 'excel') {
    return {
      title: 'Excel Workbook',
      description: 'Choose an Excel workbook, then select sheets or named tables before previewing rows.',
      primaryAction: 'Open Workbook',
      assetLabel: 'Sheet / Table',
      assetDescription: 'Power BI-style sheet and named table selection for the selected workbook.',
      fields: [
        { key: 'workbook', label: 'Workbook file', kind: 'file', fullWidth: true },
        { key: 'cloudLink', label: 'Cloud workbook link', placeholder: 'https://onedrive/sharepoint/google-drive/workbook.xlsx', fullWidth: true },
        { key: 'password', label: 'Password if protected', placeholder: 'Optional workbook password', kind: 'password' },
        { key: 'mode', label: 'Data connectivity mode', kind: 'select', options: ['Import', 'Refresh from cloud link'] },
      ],
      assets: ['Inventory Export', 'Stock Balance', 'Batch Ledger', 'Supplier Lead Time', 'Sheet1'],
    };
  }
  if (source.value === 'csv') {
    return {
      title: 'Text/CSV',
      description: 'Connect to a delimited file and detect delimiter, encoding, headers, and column types.',
      primaryAction: 'Preview CSV',
      assetLabel: 'CSV file',
      assetDescription: 'Choose the file and detected table before transform.',
      fields: [
        { key: 'csvFile', label: 'CSV file', kind: 'file', fullWidth: true },
        { key: 'delimiter', label: 'Delimiter', kind: 'select', options: ['Auto detect', 'Comma', 'Semicolon', 'Tab', 'Pipe'] },
        { key: 'encoding', label: 'Encoding', kind: 'select', options: ['UTF-8', 'UTF-16', 'Windows-1252'] },
        { key: 'headers', label: 'First row as headers', kind: 'select', options: ['Yes', 'No'] },
      ],
      assets: ['Detected CSV table', 'Header row', 'Rejected rows'],
    };
  }
  if (source.value === 'sql_server') {
    return {
      title: 'SQL Server Database',
      description: 'Enter server and database details, choose Import or DirectQuery-style read-only mode, then discover tables.',
      primaryAction: 'Connect to SQL Server',
      assetLabel: 'Table / View',
      assetDescription: 'Select SQL Server tables, views, or stored read-only query outputs.',
      fields: [
        { key: 'server', label: 'Server', placeholder: 'sql-server.company.local,1433', fullWidth: true },
        { key: 'database', label: 'Database (optional)', placeholder: 'manufacturing_ops', fullWidth: true },
        { key: 'connectivity', label: 'Data connectivity mode', kind: 'select', options: ['Import', 'DirectQuery'] },
        { key: 'auth', label: 'Authentication', kind: 'select', options: ['Database credentials', 'Windows / AD', 'Azure AD'] },
        { key: 'username', label: 'Read-only username', placeholder: 'readonly_user' },
        { key: 'password', label: 'Password', placeholder: 'Stored securely', kind: 'password' },
        { key: 'advanced', label: 'Advanced SQL statement', placeholder: 'Optional SELECT query', fullWidth: true },
      ],
      assets: ['dbo.InventoryBalance', 'dbo.ProductionOrders', 'dbo.MaintenanceAssets', 'dbo.SupplierLeadTimes'],
    };
  }
  if (source.connectorType === 'DATABASE' || source.connectorType === 'WAREHOUSE') {
    return {
      title: `${source.label} Database`,
      description: 'Connect read-only to schemas, tables, views, or warehouse marts.',
      primaryAction: `Connect to ${source.label}`,
      assetLabel: 'Schema object',
      assetDescription: 'Select available tables, views, collections, or warehouse datasets.',
      fields: [
        { key: 'host', label: 'Host / Server', placeholder: `${source.value}.company.local` },
        { key: 'port', label: 'Port', placeholder: source.value === 'postgresql' ? '5432' : '3306' },
        { key: 'database', label: 'Database', placeholder: 'manufacturing_ops' },
        { key: 'schema', label: 'Schema / Collection', placeholder: 'public / dbo / collection' },
        { key: 'auth', label: 'Authentication', kind: 'select', options: source.auth.split('/').map((item) => item.trim()) },
        { key: 'password', label: 'Password / Secret', placeholder: 'Stored securely', kind: 'password' },
      ],
      assets: ['inventory_stock_balance', 'production_work_orders', 'maintenance_assets', 'supplier_lead_times'],
    };
  }
  if (source.connectorType === 'API' || source.connectorType === 'WEB' || source.connectorType === 'WEBHOOK') {
    return {
      title: source.value === 'web_url' ? 'Web URL' : `${source.label} Connector`,
      description: 'Enter endpoint, authentication, headers, pagination, and response options before preview.',
      primaryAction: source.value === 'web_url' ? 'Connect to Web' : 'Test API Connection',
      assetLabel: 'Endpoint / Entity',
      assetDescription: 'Select discovered endpoints, web tables, OData entities, or webhook payload samples.',
      fields: [
        { key: 'url', label: 'URL / Endpoint', placeholder: 'https://api.company.com/v1/inventory', fullWidth: true },
        { key: 'auth', label: 'Authentication', kind: 'select', options: ['No Auth', 'API key', 'Bearer token', 'OAuth2', 'Basic Auth'] },
        { key: 'secret', label: 'API key / token', placeholder: 'Masked after save', kind: 'password' },
        { key: 'headers', label: 'Headers', placeholder: '{"Accept":"application/json"}', fullWidth: true },
        { key: 'pagination', label: 'Pagination rule', kind: 'select', options: ['None', 'Page number', 'Next link', 'Offset / limit'] },
      ],
      assets: ['GET /inventory/items', 'GET /production/orders', 'GET /maintenance/assets', 'Web table 1'],
    };
  }
  if (source.connectorType === 'CLOUD_APP' || source.connectorType === 'ERP' || source.connectorType === 'MES' || source.connectorType === 'WMS' || source.connectorType === 'SCM') {
    return {
      title: `${source.label} Source`,
      description: 'Connect to a cloud or enterprise application using OAuth, API credentials, database read-only access, or exports.',
      primaryAction: `Connect to ${source.label}`,
      assetLabel: 'Business object',
      assetDescription: 'Select application objects, entities, exports, or reports to bring into platform modules.',
      fields: [
        { key: 'tenant', label: 'Tenant / Client ID', placeholder: 'Company tenant or SAP client' },
        { key: 'url', label: 'Resource URL', placeholder: 'https://system.company.com', fullWidth: true },
        { key: 'auth', label: 'Authentication', kind: 'select', options: source.auth.split('/').map((item) => item.trim()) },
        { key: 'clientId', label: 'OAuth client ID', placeholder: 'client-id' },
        { key: 'secret', label: 'Client secret / API key', placeholder: 'Masked after save', kind: 'password' },
        { key: 'scope', label: 'Scope / Object filter', placeholder: 'Inventory, production, maintenance' },
      ],
      assets: ['Material Master', 'Inventory Balance', 'Production Orders', 'Purchase Orders', 'Asset Register'],
    };
  }
  if (source.connectorType === 'IOT' || source.connectorType === 'DEVICE' || source.connectorType === 'EVENT') {
    return {
      title: `${source.label} Stream`,
      description: 'Connect machine, PLC, scan, or sensor data through a gateway, signed topic, or device token.',
      primaryAction: 'Test Device Stream',
      assetLabel: 'Topic / Tag',
      assetDescription: 'Select machine tags, topics, scan event streams, or sensor payloads.',
      fields: [
        { key: 'gateway', label: 'Gateway endpoint', placeholder: 'opc.tcp://edge.local:4840', fullWidth: true },
        { key: 'topic', label: 'Topic / Tag path', placeholder: 'factory/line1/machine5/#' },
        { key: 'certificate', label: 'Certificate alias', placeholder: 'edge-cert-prod' },
        { key: 'token', label: 'Token', placeholder: 'Masked after save', kind: 'password' },
        { key: 'interval', label: 'Sampling interval', kind: 'select', options: ['Real time', '5 seconds', '1 minute', '5 minutes'] },
      ],
      assets: ['line1/machine5/runtime', 'line1/machine5/temperature', 'barcode/goods-movement', 'sensor/quality-check'],
    };
  }
  if (source.connectorType === 'MANUAL') {
    return {
      title: `${source.label}`,
      description: 'Enter, paste, or upload controlled manual data with validation and approval.',
      primaryAction: 'Create Manual Table',
      assetLabel: 'Manual dataset',
      assetDescription: 'Select a manual template or pasted table before mapping fields.',
      fields: [
        { key: 'template', label: 'Template', kind: 'select', options: ['Inventory template', 'Planning template', 'Maintenance template', 'Admin master data'] },
        { key: 'owner', label: 'Owner', placeholder: 'data.owner@company.com' },
        { key: 'approval', label: 'Approval group', kind: 'select', options: ['Data Steward', 'Admin', 'Module Manager'] },
        { key: 'notes', label: 'Data notes', placeholder: 'Reason for manual import', fullWidth: true },
      ],
      assets: ['Manual entry table', 'Bulk pasted rows', 'Template upload'],
    };
  }
  return {
    title: `${source.label} Source`,
    description: 'Connect this source, preview data, transform it, and create an import draft.',
    primaryAction: `Connect to ${source.label}`,
    assetLabel: 'Data',
    assetDescription: 'Select available data from this source.',
    fields: [
      { key: 'resource', label: 'File, folder, or URL', placeholder: 'Source path or URL', fullWidth: true },
      { key: 'name', label: 'Sheet/table name', placeholder: 'Optional' },
      { key: 'password', label: 'Password if protected', placeholder: 'Optional', kind: 'password' },
    ],
    assets: ['Inventory data', 'Production data', 'Maintenance data'],
  };
}

export function DataHubPage({ user }: { user: RuntimeUser }) {
  const queryClient = useQueryClient();
  const { state: platformState, selectedClient: platformSelectedClient } = usePlatform();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canUpload = canUseDataHubUploads(user);
  const canDelete = canPerformAction(user, 'delete');
  const [isDragging, setIsDragging] = useState(false);
  const [activeView, setActiveView] = useState<'get-data' | 'sources' | 'catalog' | 'mapping' | 'refresh'>('get-data');
  const [selectedSourceValue, setSelectedSourceValue] = useState('excel');
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedTransforms, setSelectedTransforms] = useState<string[]>(['Trim/clean text', 'Change data type', 'Remove duplicates']);
  const [selectedDestination, setSelectedDestination] = useState('Inventory');
  const [selectedRefresh, setSelectedRefresh] = useState('One-time import');
  const [connectionTested, setConnectionTested] = useState(false);
  const [selectedModuleFilter, setSelectedModuleFilter] = useState('');
  const [selectedGetDataConnectionId, setSelectedGetDataConnectionId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(user.company_id ?? '');
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [sourceCategory, setSourceCategory] = useState('erp');
  const [catalogSourceCategory, setCatalogSourceCategory] = useState('erp');
  const [catalogFormat, setCatalogFormat] = useState('xlsx');
  const [catalogAuthMethod, setCatalogAuthMethod] = useState('OAuth2');
  const [connectionDetails, setConnectionDetails] = useState<Record<string, string>>({});
  const [catalogDetails, setCatalogDetails] = useState<Record<string, string>>({});
  const [cloudDetails, setCloudDetails] = useState<Record<string, string>>({});
  const [newConnection, setNewConnection] = useState<Omit<ConnectedSystem, 'id'>>({
    company_id: user.company_id ?? undefined,
    system_name: '',
    system_type: 'ERP',
    connection_status: 'Healthy',
    last_sync: '2026-06-15T09:00:00Z',
    health_score: 90,
    record_count: 0,
  });
  const [newCatalogEntry, setNewCatalogEntry] = useState<Omit<DataCatalogEntry, 'id'>>({
    company_id: user.company_id ?? undefined,
    data_type: 'Inventory',
    source_system: '',
    owner: '',
    ai_ready: true,
    quality_score: 90,
    lineage: {},
  });
  const [newMapping, setNewMapping] = useState<Omit<DataMappingRule, 'id'>>({
    company_id: user.company_id ?? undefined,
    source_system: '',
    source_field: '',
    target_entity: 'InventoryItem',
    target_field: '',
    transform_rule: 'trim_uppercase',
    confidence: 0.95,
  });
  const [cloudSource, setCloudSource] = useState({
    company_id: user.company_id ?? undefined,
    provider: 'Google Drive',
    resource_name: '',
    resource_url: '',
    file_format: 'xlsx',
    sync_mode: 'manual',
    auth_method: 'OAuth2',
  });
  const [companies, systems, quality, readiness, catalog, mappings, uploads, getDataCatalog, getDataConnections, getDataModel, getDataRefreshHistory, getDataErrors, getDataAudit] = useQueries({
    queries: [
      { queryKey: ['companies'], queryFn: backend.companies },
      { queryKey: ['connected-systems'], queryFn: backend.connectedSystems },
      { queryKey: ['data-quality'], queryFn: backend.dataQuality },
      { queryKey: ['ai-readiness'], queryFn: backend.aiReadiness },
      { queryKey: ['data-catalog'], queryFn: backend.dataCatalog },
      { queryKey: ['data-mappings'], queryFn: backend.dataMappings },
      { queryKey: ['datahub-uploads'], queryFn: backend.uploads },
      { queryKey: ['get-data-catalog'], queryFn: backend.getDataConnectors },
      { queryKey: ['get-data-connections'], queryFn: backend.getDataSavedConnections },
      { queryKey: ['get-data-model'], queryFn: backend.getDataModel },
      { queryKey: ['get-data-refresh-history'], queryFn: backend.getDataRefreshHistory },
      { queryKey: ['get-data-errors'], queryFn: backend.getDataErrors },
      { queryKey: ['get-data-audit'], queryFn: backend.getDataAudit },
    ],
  });

  const backendCompanyRows = useMemo(() => companies.data ?? [], [companies.data]);
  const companyRows = useMemo(
    () => visibleDataHubCompanies(backendCompanyRows, platformState.clients),
    [backendCompanyRows, platformState.clients],
  );
  const platformSelectedCompanyId = platformSelectedClient ? companyIdForPlatformClient(platformSelectedClient, backendCompanyRows) : '';
  const targetCompanyId = selectedCompanyId || platformSelectedCompanyId || user.company_id || companyRows[0]?.id || '';
  const targetCompany = companyRows.find((company) => company.id === targetCompanyId);
  const targetPlatformClient = platformState.clients.find((client) => companyIdForPlatformClient(client, backendCompanyRows) === targetCompanyId || normalizeCompanyName(client.clientName) === normalizeCompanyName(targetCompany?.name ?? ''));
  const targetPlantOptions = useMemo<DataHubPlantOption[]>(() => {
    const platformPlants = targetPlatformClient?.plants ?? [];
    if (platformPlants.length) return platformPlants;
    return [
      { plantId: `${targetCompany?.code ?? 'CLIENT'}-PLT-001`, plantName: 'Plant A', status: 'Active' },
      { plantId: `${targetCompany?.code ?? 'CLIENT'}-PLT-002`, plantName: 'Plant B', status: 'Active' },
    ];
  }, [targetCompany?.code, targetPlatformClient?.plants]);
  const targetPlant = targetPlantOptions.find((plant) => plant.plantId === selectedPlantId) ?? targetPlantOptions[0];
  const activeSource = getSourceConfig(sourceCategory);
  const activeCatalogSource = getSourceConfig(catalogSourceCategory);
  const activeDomain = getDomain(newCatalogEntry.data_type);
  const isTargetCompanyRecord = useMemo(() => {
    const targetName = normalizeCompanyName(targetCompany?.name ?? '');
    return (row: { company_id?: string | null; company_name?: string | null }) => {
      if (!targetCompanyId) return true;
      if (row.company_id === targetCompanyId) return true;
      if (targetName && row.company_name && normalizeCompanyName(row.company_name) === targetName) return true;
      return false;
    };
  }, [targetCompany?.name, targetCompanyId]);
  const isTargetPlantRecord = useMemo(() => {
    const targetPlantId = targetPlant?.plantId ?? '';
    const targetPlantName = normalizeCompanyName(targetPlant?.plantName ?? '');
    return (row: Record<string, unknown>) => {
      if (!targetPlantId && !targetPlantName) return true;
      const tokens = dataHubPlantTokens(row);
      if (!tokens.length) return true;
      return tokens.some((token) => token === targetPlantId || normalizeCompanyName(token) === targetPlantName);
    };
  }, [targetPlant?.plantId, targetPlant?.plantName]);
  const selectedPowerSource = flatPowerBiSources.find((source) => source.value === selectedSourceValue) ?? flatPowerBiSources[0];
  const allGetDataConnectionRows = useMemo(() => getDataConnections.data ?? [], [getDataConnections.data]);
  const getDataConnectionRows = useMemo(
    () => allGetDataConnectionRows.filter((row) => isTargetCompanyRecord(row) && isTargetPlantRecord(row as unknown as Record<string, unknown>)),
    [allGetDataConnectionRows, isTargetCompanyRecord, isTargetPlantRecord],
  );
  const selectedGetDataConnection = getDataConnectionRows.find((connection) => connection.id === selectedGetDataConnectionId) ?? getDataConnectionRows[0];
  const getDataPreview = useQueries({
    queries: [
      {
        queryKey: ['get-data-preview', selectedGetDataConnection?.id],
        queryFn: () => backend.getDataPreview(selectedGetDataConnection?.id ?? ''),
        enabled: Boolean(selectedGetDataConnection?.id),
      },
    ],
  })[0];

  useEffect(() => {
    if (platformSelectedCompanyId && platformSelectedCompanyId !== selectedCompanyId) {
      changeTargetCompany(platformSelectedCompanyId);
    }
  }, [platformSelectedCompanyId, selectedCompanyId]);

  useEffect(() => {
    if (targetPlantOptions.length && !targetPlantOptions.some((plant) => plant.plantId === selectedPlantId)) {
      setSelectedPlantId(targetPlantOptions[0].plantId);
    }
  }, [selectedPlantId, targetPlantOptions]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['companies'] });
    queryClient.invalidateQueries({ queryKey: ['connected-systems'] });
    queryClient.invalidateQueries({ queryKey: ['data-quality'] });
    queryClient.invalidateQueries({ queryKey: ['ai-readiness'] });
    queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
    queryClient.invalidateQueries({ queryKey: ['data-mappings'] });
    queryClient.invalidateQueries({ queryKey: ['datahub-uploads'] });
    queryClient.invalidateQueries({ queryKey: ['get-data-connections'] });
    queryClient.invalidateQueries({ queryKey: ['get-data-model'] });
    queryClient.invalidateQueries({ queryKey: ['get-data-refresh-history'] });
    queryClient.invalidateQueries({ queryKey: ['get-data-errors'] });
    queryClient.invalidateQueries({ queryKey: ['get-data-audit'] });
    queryClient.invalidateQueries({ queryKey: ['get-data-preview'] });
  };

  async function ensureTargetCompanyExists(companyId = targetCompanyId) {
    if (!companyId || backendCompanyRows.some((company) => company.id === companyId)) return companyId;
    const company = companyRows.find((item) => item.id === companyId);
    if (!company) return companyId;
    try {
      await backend.createCompany({ name: company.name, code: company.code });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('409')) throw error;
    }
    return companyId;
  }

  const createConnection = useMutation({
    mutationFn: backend.createConnectedSystem,
    onSuccess: () => {
      setNewConnection({
        company_id: targetCompanyId,
        system_name: '',
        system_type: activeSource.defaultSystemType,
        connection_status: 'Healthy',
        last_sync: '2026-06-15T09:00:00Z',
        health_score: 90,
        record_count: 0,
      });
      setConnectionDetails({});
      invalidate();
    },
  });
  const updateConnection = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Omit<ConnectedSystem, 'id'> }) => backend.updateConnectedSystem(id, payload), onSuccess: invalidate });
  const deleteConnection = useMutation({ mutationFn: backend.deleteConnectedSystem, onSuccess: invalidate });

  const createCatalog = useMutation({
    mutationFn: backend.createDataCatalogEntry,
    onSuccess: () => {
      setNewCatalogEntry({
        company_id: targetCompanyId,
        data_type: 'Inventory',
        source_system: '',
        owner: '',
        ai_ready: true,
        quality_score: 90,
        lineage: {},
      });
      setCatalogDetails({});
      invalidate();
    },
  });
  const updateCatalog = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Omit<DataCatalogEntry, 'id'> }) => backend.updateDataCatalogEntry(id, payload), onSuccess: invalidate });
  const deleteCatalog = useMutation({ mutationFn: backend.deleteDataCatalogEntry, onSuccess: invalidate });

  const createMapping = useMutation({
    mutationFn: backend.createDataMapping,
    onSuccess: () => {
      setNewMapping({
        company_id: targetCompanyId,
        source_system: '',
        source_field: '',
        target_entity: `${newCatalogEntry.data_type.replaceAll(' ', '')}Record`,
        target_field: '',
        transform_rule: 'trim_uppercase',
        confidence: 0.95,
      });
      invalidate();
    },
  });
  const updateMapping = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Omit<DataMappingRule, 'id'> }) => backend.updateDataMapping(id, payload), onSuccess: invalidate });
  const deleteMapping = useMutation({ mutationFn: backend.deleteDataMapping, onSuccess: invalidate });
  const uploadFile = useMutation({
    mutationFn: ({ file, companyId, plant }: { file: File; companyId?: string; plant?: { plantId?: string; plantName?: string } }) => backend.uploadFile(file, companyId, plant),
    onSuccess: invalidate,
  });
  const createCloudSource = useMutation({
    mutationFn: backend.createCloudSource,
    onSuccess: () => {
      setCloudSource({ company_id: targetCompanyId, provider: 'Google Drive', resource_name: '', resource_url: '', file_format: 'xlsx', sync_mode: 'manual', auth_method: 'OAuth2' });
      setCloudDetails({});
      invalidate();
    },
  });
  const createGetDataConnection = useMutation({
    mutationFn: backend.createGetDataConnection,
    onSuccess: (connection) => {
      setSelectedGetDataConnectionId(connection.id);
      setConnectionTested(true);
      invalidate();
    },
  });
  const deleteGetDataConnection = useMutation({
    mutationFn: backend.deleteGetDataConnection,
    onSuccess: () => {
      setSelectedGetDataConnectionId('');
      invalidate();
    },
  });
  const testGetDataConnection = useMutation({
    mutationFn: backend.testGetDataConnection,
    onSuccess: () => {
      setConnectionTested(true);
      setWizardStep(Math.max(wizardStep, 4));
      invalidate();
    },
  });
  const runGetDataRefresh = useMutation({ mutationFn: backend.runGetDataRefresh, onSuccess: invalidate });
  const validateGetDataMapping = useMutation({ mutationFn: backend.validateGetDataMapping, onSuccess: invalidate });
  const transformGetDataPreview = useMutation({ mutationFn: backend.transformGetDataPreview, onSuccess: invalidate });

  const uploadRows = useMemo(
    () => (uploads.data ?? []).filter((row) => isTargetCompanyRecord(row) && isTargetPlantRecord(row as Record<string, unknown>)),
    [isTargetCompanyRecord, isTargetPlantRecord, uploads.data],
  );
  const uploadPreview = useMemo(() => uploadRows[0]?.metadata?.preview?.sample_rows ?? [], [uploadRows]);
  const rows = useMemo(
    () => (systems.data ?? []).filter((row) => isTargetCompanyRecord(row) && isTargetPlantRecord(row as unknown as Record<string, unknown>)),
    [isTargetCompanyRecord, isTargetPlantRecord, systems.data],
  );
  const catalogRows = useMemo(
    () => (catalog.data ?? []).filter((row) => isTargetCompanyRecord(row) && isTargetPlantRecord(row as unknown as Record<string, unknown>)),
    [catalog.data, isTargetCompanyRecord, isTargetPlantRecord],
  );
  const mappingRows = useMemo(() => (mappings.data ?? []).filter(isTargetCompanyRecord), [isTargetCompanyRecord, mappings.data]);
  const scopedQualityScore = useMemo(() => meanScore(catalogRows.map((row) => Number(row.quality_score) || 0)), [catalogRows]);
  const scopedAiReadinessScore = useMemo(
    () => meanScore(catalogRows.map((row) => (row.ai_ready ? Number(row.quality_score) || 0 : Math.min(Number(row.quality_score) || 0, 50)))),
    [catalogRows],
  );
  const selectedPlantConnectionIds = useMemo(() => new Set(getDataConnectionRows.map((connection) => connection.id)), [getDataConnectionRows]);
  const refreshRows = useMemo(
    () => ((getDataRefreshHistory.data ?? []) as Array<Record<string, unknown>>).filter((row) => isTargetCompanyRecord(row as { company_id?: string | null; company_name?: string | null }) && (!row.connection_id || selectedPlantConnectionIds.has(String(row.connection_id)))),
    [getDataRefreshHistory.data, isTargetCompanyRecord, selectedPlantConnectionIds],
  );
  const errorRows = useMemo(
    () => ((getDataErrors.data ?? []) as Array<Record<string, unknown>>).filter((row) => isTargetCompanyRecord(row as { company_id?: string | null; company_name?: string | null }) && (!row.connection_id || selectedPlantConnectionIds.has(String(row.connection_id)))),
    [getDataErrors.data, isTargetCompanyRecord, selectedPlantConnectionIds],
  );
  const auditRows = useMemo(
    () => ((getDataAudit.data ?? []) as Array<Record<string, unknown>>).filter((row) => isTargetCompanyRecord(row as { company_id?: string | null; company_name?: string | null }) && (!row.entity_id || selectedPlantConnectionIds.has(String(row.entity_id)) || dataHubPlantTokens(row).length === 0)),
    [getDataAudit.data, isTargetCompanyRecord, selectedPlantConnectionIds],
  );
  const scopedGetDataModel = useMemo(() => {
    const model = getDataModel.data;
    if (!model) return undefined;
    const scopedConnectionNames = new Set(getDataConnectionRows.map((connection) => connection.connection_name));
    return {
      ...model,
      tables: model.tables.filter((table) => scopedConnectionNames.has(table.source)),
      relationships: model.relationships.filter((relationship) => isTargetCompanyRecord(relationship as { company_id?: string | null; company_name?: string | null })),
    };
  }, [getDataConnectionRows, getDataModel.data, isTargetCompanyRecord]);

  if ([companies, systems, quality, readiness, catalog, mappings, uploads, getDataCatalog, getDataConnections, getDataModel, getDataRefreshHistory, getDataErrors, getDataAudit].some((query) => query.isLoading)) {
    return <LoadingState label="Loading company-scoped Manufacturing Data Hub responses" />;
  }

  const firstError = [companies, systems, quality, readiness, catalog, mappings, uploads, getDataCatalog, getDataConnections, getDataModel, getDataRefreshHistory, getDataErrors, getDataAudit].find((query) => query.isError)?.error;
  if (firstError) {
    return <ErrorState error={firstError} title="Manufacturing Data Hub integration failed" />;
  }

  if (!canManagePlatform(user)) {
    return <ErrorState error={new Error('This workspace is reserved for platform administrators.')} title="DataHub is restricted to admin roles" />;
  }

  function setDetail(setter: (details: Record<string, string>) => void, current: Record<string, string>, key: string, value: string) {
    setter({ ...current, [key]: value });
  }

  function renderDetailFields(config: SourceConfig, values: Record<string, string>, setter: (details: Record<string, string>) => void) {
    return config.fields.map((field) => (
      <input
        key={field.key}
        className={inputClass}
        type={field.type ?? 'text'}
        placeholder={field.label}
        value={values[field.key] ?? ''}
        onChange={(event) => setDetail(setter, values, field.key, event.target.value)}
        required={field.required}
        title={field.placeholder}
      />
    ));
  }

  async function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const companyId = await ensureTargetCompanyExists();
    createConnection.mutate({
      ...newConnection,
      company_id: companyId,
      system_type: activeSource.defaultSystemType,
      source_category: activeSource.label,
      auth_method: newConnection.auth_method ?? activeSource.authMethods[0],
      connection_details: {
        ...connectionDetails,
        plant_id: targetPlant?.plantId,
        plant_name: targetPlant?.plantName,
      },
    });
  }

  async function submitCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const companyId = await ensureTargetCompanyExists();
    createCatalog.mutate({
      ...newCatalogEntry,
      company_id: companyId,
      lineage: {
        ...newCatalogEntry.lineage,
        source_category: activeCatalogSource.label,
        source_format: catalogFormat,
        auth_method: catalogAuthMethod,
        routing_target: activeDomain.route,
        routing_description: activeDomain.description,
        plant_id: targetPlant?.plantId,
        plant_name: targetPlant?.plantName,
        required_connection: catalogDetails,
      },
    });
  }

  async function submitMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const companyId = await ensureTargetCompanyExists();
    createMapping.mutate({ ...newMapping, company_id: companyId });
  }

  async function submitCloudSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const companyId = await ensureTargetCompanyExists();
    createCloudSource.mutate({
      ...cloudSource,
      company_id: companyId,
      connection_details: {
        ...cloudDetails,
        plant_id: targetPlant?.plantId,
        plant_name: targetPlant?.plantName,
      },
    });
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length || !canUpload) return;
    const companyId = await ensureTargetCompanyExists();
    uploadFile.mutate({ file: fileList[0], companyId, plant: { plantId: targetPlant?.plantId, plantName: targetPlant?.plantName } });
  }

  function changeTargetCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    setSelectedPlantId('');
    setNewConnection((current) => ({ ...current, company_id: companyId }));
    setNewCatalogEntry((current) => ({ ...current, company_id: companyId }));
    setNewMapping((current) => ({ ...current, company_id: companyId }));
    setCloudSource((current) => ({ ...current, company_id: companyId }));
  }

  function defaultGetDataDetails(source: DataSourceOption) {
    const base: Record<string, unknown> = {
      file_name: `${source.value}_sample.xlsx`,
      file_name_or_url: `https://example.local/${source.value}`,
      delimiter: ',',
      folder_path: '/exports/monthly',
      host: `${source.value}.metam.local`,
      database: 'metam_operational',
      service_name: 'METAM',
      connection_string: 'masked://connection-string',
      site_url: 'https://tenant.sharepoint.com/sites/operations',
      spreadsheet_url: 'https://docs.google.com/spreadsheets/demo',
      resource_url: 'https://storage.example.local/export',
      base_url: 'https://api.example.local/v1',
      url: 'https://example.local/table',
      feed_url: 'https://sap.example.local/odata',
      system_url: `https://${source.value}.example.local`,
    };
    return { ...base, source_description: source.description, connector_type: source.connectorType };
  }

  function getDataPayload(companyId = targetCompanyId) {
    return {
      company_id: companyId,
      connector_key: selectedPowerSource.value,
      connector_name: selectedPowerSource.label,
      connector_category: selectedPowerSource.group,
      connection_name: `${targetCompany?.code ?? 'CLIENT'} ${selectedPowerSource.label} ${selectedDestination}`,
      auth_method: selectedPowerSource.auth,
      connection_details: {
        ...defaultGetDataDetails(selectedPowerSource),
        plant_id: targetPlant?.plantId,
        plant_name: targetPlant?.plantName,
      },
      credentials: {
        username: 'readonly.integration',
        api_key: 'sample-api-key-for-masked-storage',
        password: 'sample-password-for-masked-storage',
      },
      refresh_mode: selectedRefresh,
      destination_module: selectedDestination,
    };
  }

  async function createGetDataDraft() {
    const companyId = await ensureTargetCompanyExists();
    createGetDataConnection.mutate(getDataPayload(companyId));
    setWizardStep(10);
  }

  async function testSelectedGetDataConnection() {
    const companyId = await ensureTargetCompanyExists();
    testGetDataConnection.mutate(getDataPayload(companyId));
  }

  async function runSelectedRefresh() {
    const connectionId = selectedGetDataConnection?.id;
    if (!connectionId) return;
    const companyId = await ensureTargetCompanyExists();
    runGetDataRefresh.mutate({ company_id: companyId, connection_id: connectionId, refresh_mode: selectedRefresh });
  }

  async function validateSelectedMapping() {
    const companyId = await ensureTargetCompanyExists();
    if (selectedGetDataConnection?.id) {
      transformGetDataPreview.mutate({
        company_id: companyId,
        connection_id: selectedGetDataConnection.id,
        recipe_name: `${selectedPowerSource.label} Power Query Draft`,
        operations: selectedTransforms.map((operation) => ({ operation })),
      });
    }
    validateGetDataMapping.mutate({
      company_id: companyId,
      connection_id: selectedGetDataConnection?.id,
      destination_module: selectedDestination,
      mappings: [
        { source_field: 'item_code', target_field: 'item_code', data_type: 'Text' },
        { source_field: 'item_name', target_field: 'item_name', data_type: 'Text' },
        { source_field: 'quantity', target_field: 'quantity', data_type: 'Whole number' },
        { source_field: 'status', target_field: 'status', data_type: 'Text' },
      ],
    });
  }

  return (
    <>
      <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">Data Hub</p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-white">Get Data Workspace</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">{rows.length} systems</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">{scopedQualityScore}% quality</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">{scopedAiReadinessScore}% AI ready</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_1fr_0.8fr_0.8fr]">
          <CompanySelector companies={companyRows} selectedCompanyId={targetCompanyId} user={user} onChange={changeTargetCompany} />
          <PlantSelector plants={targetPlantOptions} selectedPlantId={targetPlant?.plantId ?? ''} onChange={setSelectedPlantId} />
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Source
            <select className={`${selectClass} mt-2 w-full`} value={selectedSourceValue} onChange={(event) => {
              setSelectedSourceValue(event.target.value);
              setConnectionTested(false);
              setActiveView('get-data');
            }}>
              {flatPowerBiSources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Destination
            <select className={`${selectClass} mt-2 w-full`} value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)}>
              {destinationModules.map((module) => <option key={module}>{module}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_0.75fr_0.75fr_0.75fr]">
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Connector group
            <select className={`${selectClass} mt-2 w-full`} value={selectedPowerSource.group} onChange={(event) => {
              const nextSource = flatPowerBiSources.find((source) => source.group === event.target.value) ?? selectedPowerSource;
              setSelectedSourceValue(nextSource.value);
              setConnectionTested(false);
            }}>
              {powerBiSourceGroups.map((group) => <option key={group.group}>{group.group}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Refresh
            <select className={`${selectClass} mt-2 w-full`} value={selectedRefresh} onChange={(event) => setSelectedRefresh(event.target.value)}>
              {refreshOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Filter
            <select className={`${selectClass} mt-2 w-full`} value={selectedModuleFilter} onChange={(event) => setSelectedModuleFilter(event.target.value)}>
              <option value="">All modules</option>
              {destinationModules.map((module) => <option key={module}>{module}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="button" className="h-[42px] flex-1 rounded-2xl border border-cyan-300/30 bg-cyan-400/15 px-4 text-sm font-semibold text-cyan-50 hover:bg-cyan-400/20" onClick={() => setActiveView('get-data')}>
              Get Data
            </button>
            <button type="button" className="h-[42px] flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-slate-100 hover:bg-white/10" onClick={testSelectedGetDataConnection}>
              Test
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {[
            ['Client', targetCompany?.name ?? targetCompanyId],
            ['Plant', targetPlant?.plantName ?? 'All plants'],
            ['Source', selectedPowerSource.label],
            ['Status', connectionTested ? 'Connection ready' : 'Not tested'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2 rounded-[24px] border border-white/10 bg-slate-950/45 p-2">
        {[
          { key: 'get-data', label: 'Get Data' },
          { key: 'sources', label: 'Source Connectors' },
          { key: 'catalog', label: 'Catalog & Uploads' },
          { key: 'mapping', label: 'Field Mapping' },
          { key: 'refresh', label: 'Refresh / Logs' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeView === item.key ? 'bg-cyan-400/15 text-cyan-50' : 'text-slate-400 hover:bg-white/8 hover:text-white'
            }`}
            onClick={() => setActiveView(item.key as typeof activeView)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeView === 'get-data' ? (
        <PowerBiGetDataExperience
          selectedSource={selectedPowerSource}
          selectedSourceValue={selectedSourceValue}
          onSelectSource={(source) => {
            setSelectedSourceValue(source.value);
            setConnectionTested(false);
            setWizardStep(2);
            setNewConnection((current) => ({
              ...current,
              company_id: targetCompanyId,
              system_name: current.system_name || `${source.label} connector`,
              system_type: source.connectorType,
              source_category: source.group,
              auth_method: source.auth,
            }));
          }}
          wizardStep={wizardStep}
          setWizardStep={setWizardStep}
          selectedTransforms={selectedTransforms}
          setSelectedTransforms={setSelectedTransforms}
          selectedDestination={selectedDestination}
          setSelectedDestination={setSelectedDestination}
          selectedRefresh={selectedRefresh}
          setSelectedRefresh={setSelectedRefresh}
          connectionTested={connectionTested}
          setConnectionTested={setConnectionTested}
          targetCompanyName={targetCompany?.name ?? targetCompanyId}
          moduleFilter={selectedModuleFilter}
          onTestConnection={testSelectedGetDataConnection}
          onCreateDraft={createGetDataDraft}
          backendCatalog={getDataCatalog.data}
          savedConnections={getDataConnectionRows}
          selectedSavedConnection={selectedGetDataConnection}
          backendPreview={getDataPreview.data}
          backendModel={scopedGetDataModel}
          refreshRows={refreshRows}
          errorRows={errorRows}
          auditRows={auditRows}
          onSelectSavedConnection={setSelectedGetDataConnectionId}
          onRunRefresh={runSelectedRefresh}
          onValidateMapping={validateSelectedMapping}
          onDeleteSavedConnection={(connectionId) => {
            if (window.confirm('Delete this saved Get Data connection? Refresh history and catalog views will update immediately.')) {
              deleteGetDataConnection.mutate(connectionId);
            }
          }}
        />
      ) : null}

      {activeView === 'sources' ? (
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Connected Systems" description="Choose the company, source type, auth pattern, and required connection fields before adding the integration.">
          <form className="mb-4 grid gap-3 md:grid-cols-2" onSubmit={submitConnection}>
            <select
              className={selectClass}
              value={sourceCategory}
              onChange={(event) => {
                const config = getSourceConfig(event.target.value);
                setSourceCategory(config.value);
                setNewConnection({ ...newConnection, system_type: config.defaultSystemType, auth_method: config.authMethods[0] });
                setConnectionDetails({});
              }}
            >
              {sourceTypes.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
            <select className={selectClass} value={newConnection.auth_method ?? activeSource.authMethods[0]} onChange={(event) => setNewConnection({ ...newConnection, auth_method: event.target.value })}>
              {activeSource.authMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input className={inputClass} placeholder="System name" value={newConnection.system_name} onChange={(event) => setNewConnection({ ...newConnection, system_name: event.target.value })} required />
            <input className={inputClass} placeholder="Status" value={newConnection.connection_status} onChange={(event) => setNewConnection({ ...newConnection, connection_status: event.target.value })} required />
            <input className={inputClass} placeholder="Last sync" value={newConnection.last_sync} onChange={(event) => setNewConnection({ ...newConnection, last_sync: event.target.value })} required />
            <input className={inputClass} type="number" placeholder="Health score" value={newConnection.health_score} onChange={(event) => setNewConnection({ ...newConnection, health_score: Number(event.target.value) })} required />
            <input className={inputClass} type="number" placeholder="Record count" value={newConnection.record_count} onChange={(event) => setNewConnection({ ...newConnection, record_count: Number(event.target.value) })} required />
            {renderDetailFields(activeSource, connectionDetails, setConnectionDetails)}
            <div className="rounded-2xl border border-white/10 bg-white/6 p-3 text-sm text-slate-300 md:col-span-2">
              <ShieldCheck className="mr-2 inline h-4 w-4 text-cyan-200" />
              {activeSource.description}
            </div>
            <button className="rounded-2xl border border-cyan-300/20 bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-60 md:col-span-2" disabled={createConnection.isPending}>
              {createConnection.isPending ? 'Saving...' : `Add Source for ${targetCompany?.name ?? targetCompanyId}`}
            </button>
          </form>
          <DataTable
            rows={rows as Array<ConnectedSystem & Record<string, unknown>>}
            emptyTitle="No systems connected"
            columns={[
              { key: 'company_name', label: 'Company' },
              { key: 'system_name', label: 'System' },
              { key: 'system_type', label: 'Type / Source / Auth' },
              { key: 'connection_status', label: 'Status', render: (value, row) => <input className="w-28 rounded-xl border border-white/10 bg-white/10 px-2 py-1 text-xs text-white" value={String(value)} onChange={(event) => updateConnection.mutate({ id: String(row.id), payload: { ...(row as ConnectedSystem), company_id: String(row.company_id), connection_status: event.target.value } })} /> },
              { key: 'health_score', label: 'Health', render: (value, row) => <input className="w-20 rounded-xl border border-white/10 bg-white/10 px-2 py-1 text-xs text-white" type="number" value={Number(value)} onChange={(event) => updateConnection.mutate({ id: String(row.id), payload: { ...(row as ConnectedSystem), company_id: String(row.company_id), health_score: Number(event.target.value) } })} /> },
              { key: 'id', label: 'Action', render: (value) => canDelete ? <button className="rounded-xl border border-red-300/20 bg-red-400/10 px-2 py-1 text-xs text-red-100 hover:bg-red-400/20" onClick={() => {
                if (window.confirm('Delete this connected system? DataHub tables will refresh immediately.')) {
                  deleteConnection.mutate(String(value));
                }
              }}><Trash2 className="mr-1 inline h-3 w-3" />Delete</button> : null },
            ]}
          />
        </Panel>

        <Panel title="DataHub Upload Center" description="Upload local data or connect cloud files for the selected company. Auth requirements change by provider/source.">
          {canUpload ? (
            <>
              <button
                type="button"
                className={`mb-4 flex min-h-[210px] w-full flex-col items-center justify-center rounded-[28px] border border-dashed px-6 py-8 text-center transition ${isDragging ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-white/15 bg-white/6 hover:bg-white/10'}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  handleFiles(event.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-10 w-10 text-cyan-200" />
                <p className="mt-4 text-lg font-semibold text-white">Drop files for {targetCompany?.name ?? targetCompanyId}</p>
                <p className="mt-2 max-w-xl text-sm text-slate-300">ERP exports, SAP files, Excel, Google Sheets exports, CSV, XML, JSON and other table formats.</p>
                <span className="mt-4 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-200">Upload from local computer</span>
              </button>
              <input ref={fileInputRef} type="file" accept={acceptedFormats} className="hidden" onChange={(event) => handleFiles(event.target.files)} />

              <form className="grid gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4" onSubmit={submitCloudSource}>
                <div className="grid gap-3 md:grid-cols-2">
                  <select className={selectClass} value={cloudSource.provider} onChange={(event) => setCloudSource({ ...cloudSource, provider: event.target.value })}>
                    <option value="Google Drive">Google Drive</option>
                    <option value="OneDrive">OneDrive</option>
                    <option value="SharePoint">SharePoint</option>
                    <option value="AWS S3">AWS S3</option>
                    <option value="Azure Blob">Azure Blob</option>
                    <option value="Dropbox">Dropbox</option>
                  </select>
                  <select className={selectClass} value={cloudSource.auth_method} onChange={(event) => setCloudSource({ ...cloudSource, auth_method: event.target.value })}>
                    {getSourceConfig('cloud_storage').authMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  <input className={inputClass} placeholder="Resource name" value={cloudSource.resource_name} onChange={(event) => setCloudSource({ ...cloudSource, resource_name: event.target.value })} required />
                  <select className={selectClass} value={cloudSource.file_format} onChange={(event) => setCloudSource({ ...cloudSource, file_format: event.target.value })}>
                    {getSourceConfig('cloud_storage').formats.map((format) => (
                      <option key={format} value={format}>
                        {format.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <input className={`${inputClass} md:col-span-2`} placeholder="Cloud file or folder URL" value={cloudSource.resource_url} onChange={(event) => setCloudSource({ ...cloudSource, resource_url: event.target.value })} required />
                  {renderDetailFields(getSourceConfig('cloud_storage'), cloudDetails, setCloudDetails)}
                  <select className={selectClass} value={cloudSource.sync_mode} onChange={(event) => setCloudSource({ ...cloudSource, sync_mode: event.target.value })}>
                    <option value="manual">Manual</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
                <button className="rounded-2xl border border-violet-300/20 bg-violet-400/15 px-3 py-2 text-sm font-semibold text-violet-50 disabled:opacity-60" disabled={createCloudSource.isPending}>
                  {createCloudSource.isPending ? 'Linking...' : `Add Cloud Source for ${targetCompany?.name ?? targetCompanyId}`}
                </button>
              </form>
            </>
          ) : (
            <div className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">Only Admin and Super Admin users can upload local files or connect cloud storage sources in the DataHub.</div>
          )}
        </Panel>
      </div>
      ) : null}

      {activeView === 'catalog' ? (
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Data Catalog" description="Select data domain, source type, format, auth, and routing target before cataloging the dataset.">
          <form className="mb-4 grid gap-3 md:grid-cols-2" onSubmit={submitCatalog}>
            <select className={selectClass} value={newCatalogEntry.data_type} onChange={(event) => setNewCatalogEntry({ ...newCatalogEntry, data_type: event.target.value })}>
              {dataDomains.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {domain.value}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={catalogSourceCategory}
              onChange={(event) => {
                const config = getSourceConfig(event.target.value);
                setCatalogSourceCategory(config.value);
                setCatalogFormat(config.formats[0]);
                setCatalogAuthMethod(config.authMethods[0]);
                setCatalogDetails({});
              }}
            >
              {sourceTypes.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
            <select className={selectClass} value={newCatalogEntry.source_system} onChange={(event) => setNewCatalogEntry({ ...newCatalogEntry, source_system: event.target.value })} required>
              <option value="">Select connected source</option>
              {rows.map((system) => (
                <option key={system.id} value={system.system_name}>
                  {system.system_name}
                </option>
              ))}
              <option value="Manual Upload">Manual Upload</option>
            </select>
            <select className={selectClass} value={catalogFormat} onChange={(event) => setCatalogFormat(event.target.value)}>
              {activeCatalogSource.formats.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
            <select className={selectClass} value={catalogAuthMethod} onChange={(event) => setCatalogAuthMethod(event.target.value)}>
              {activeCatalogSource.authMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input className={inputClass} placeholder="Data owner" value={newCatalogEntry.owner} onChange={(event) => setNewCatalogEntry({ ...newCatalogEntry, owner: event.target.value })} required />
            <input className={inputClass} type="number" placeholder="Quality score" value={newCatalogEntry.quality_score} onChange={(event) => setNewCatalogEntry({ ...newCatalogEntry, quality_score: Number(event.target.value) })} required />
            {renderDetailFields(activeCatalogSource, catalogDetails, setCatalogDetails)}
            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-3 text-sm text-slate-200 md:col-span-2">
              <Route className="mr-2 inline h-4 w-4 text-cyan-200" />
              Routes to <strong>{activeDomain.route}</strong>: {activeDomain.description}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={newCatalogEntry.ai_ready} onChange={(event) => setNewCatalogEntry({ ...newCatalogEntry, ai_ready: event.target.checked })} />
              AI ready
            </label>
            <button className="rounded-2xl border border-cyan-300/20 bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-60" disabled={createCatalog.isPending}>
              {createCatalog.isPending ? 'Saving...' : 'Add Catalog Entry'}
            </button>
          </form>
          <DataTable
            rows={catalogRows as Array<DataCatalogEntry & Record<string, unknown>>}
            emptyTitle="No catalog entries"
            columns={[
              { key: 'company_name', label: 'Company' },
              { key: 'data_type', label: 'Data Type' },
              { key: 'source_system', label: 'Source' },
              { key: 'owner', label: 'Owner' },
              { key: 'lineage', label: 'Route', render: (value) => <span>{String((value as Record<string, unknown>)?.routing_target ?? 'DataHub')}</span> },
              { key: 'quality_score', label: 'Quality', render: (value, row) => <input className="w-20 rounded-xl border border-white/10 bg-white/10 px-2 py-1 text-xs text-white" type="number" value={Number(value)} onChange={(event) => updateCatalog.mutate({ id: String(row.id), payload: { ...(row as DataCatalogEntry), company_id: String(row.company_id), quality_score: Number(event.target.value) } })} /> },
              { key: 'ai_ready', label: 'AI Ready', render: (value, row) => <button className="rounded-xl border border-white/10 bg-white/10 px-2 py-1 text-xs text-white" onClick={() => updateCatalog.mutate({ id: String(row.id), payload: { ...(row as DataCatalogEntry), company_id: String(row.company_id), ai_ready: !value } })}>{value ? 'Enabled' : 'Disabled'}</button> },
              { key: 'id', label: 'Action', render: (value) => canDelete ? <button className="rounded-xl border border-red-300/20 bg-red-400/10 px-2 py-1 text-xs text-red-100 hover:bg-red-400/20" onClick={() => {
                if (window.confirm('Delete this catalog entry? Data quality and AI readiness will refresh immediately.')) {
                  deleteCatalog.mutate(String(value));
                }
              }}><Trash2 className="mr-1 inline h-3 w-3" />Delete</button> : null },
            ]}
          />
        </Panel>

        <Panel title="Upload Manifests" description="Local uploads and cloud-linked source manifests show their company ownership and intake metadata.">
          <DataTable
            rows={uploadRows as Array<Record<string, unknown>>}
            emptyTitle="No upload manifests yet"
            columns={[
              { key: 'company_name', label: 'Company' },
              { key: 'provider', label: 'Provider' },
              { key: 'resource_name', label: 'Resource' },
              { key: 'file_format', label: 'Format', render: (value) => <StatusBadge status={String(value).toUpperCase()} /> },
              { key: 'source', label: 'Source' },
              { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
            ]}
          />
          {uploadPreview.length ? (
            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/6 p-4">
              <p className="text-sm font-semibold text-white">Latest preview rows</p>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950/40 p-3 text-xs text-slate-200">{JSON.stringify(uploadPreview, null, 2)}</pre>
            </div>
          ) : null}
        </Panel>
      </div>
      ) : null}

      {activeView === 'mapping' ? (
      <div className="mt-4">
        <Panel title="Mapping Studio" description="Mapping rules stay isolated per company and document how source fields transform into target module fields.">
          <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={submitMapping}>
            <select className={selectClass} value={newMapping.source_system} onChange={(event) => setNewMapping({ ...newMapping, source_system: event.target.value })} required>
              <option value="">Select source system</option>
              {rows.map((system) => (
                <option key={system.id} value={system.system_name}>
                  {system.system_name}
                </option>
              ))}
            </select>
            <input className={inputClass} placeholder="Source field" value={newMapping.source_field} onChange={(event) => setNewMapping({ ...newMapping, source_field: event.target.value })} required />
            <input className={inputClass} placeholder="Target entity" value={newMapping.target_entity} onChange={(event) => setNewMapping({ ...newMapping, target_entity: event.target.value })} required />
            <input className={inputClass} placeholder="Target field" value={newMapping.target_field} onChange={(event) => setNewMapping({ ...newMapping, target_field: event.target.value })} required />
            <input className={inputClass} placeholder="Transform rule" value={newMapping.transform_rule ?? ''} onChange={(event) => setNewMapping({ ...newMapping, transform_rule: event.target.value })} />
            <input className={inputClass} type="number" step="0.01" min="0" max="1" placeholder="Confidence" value={newMapping.confidence} onChange={(event) => setNewMapping({ ...newMapping, confidence: Number(event.target.value) })} required />
            <button className="rounded-2xl border border-cyan-300/20 bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-60 md:col-span-3" disabled={createMapping.isPending}>
              {createMapping.isPending ? 'Saving...' : 'Add Mapping Rule'}
            </button>
          </form>
          <DataTable
            rows={mappingRows as Array<DataMappingRule & Record<string, unknown>>}
            emptyTitle="No mapping rules"
            columns={[
              { key: 'company_name', label: 'Company' },
              { key: 'source_system', label: 'Source System' },
              { key: 'source_field', label: 'Source Field' },
              { key: 'target_entity', label: 'Target Entity' },
              { key: 'target_field', label: 'Target Field' },
              { key: 'confidence', label: 'Confidence', render: (value, row) => (
                <div className="flex items-center gap-2">
                  <input className="w-20 rounded-xl border border-white/10 bg-white/10 px-2 py-1 text-xs text-white" type="number" step="0.01" min="0" max="1" value={Number(value)} onChange={(event) => updateMapping.mutate({ id: String(row.id), payload: { ...(row as DataMappingRule), company_id: String(row.company_id), confidence: Number(event.target.value) } })} />
                  <StatusBadge status={`${Math.round(Number(value) * 100)}%`} />
                </div>
              ) },
              { key: 'id', label: 'Action', render: (value) => canDelete ? <button className="rounded-xl border border-red-300/20 bg-red-400/10 px-2 py-1 text-xs text-red-100 hover:bg-red-400/20" onClick={() => {
                if (window.confirm('Delete this mapping rule? Mapping and validation views will refresh immediately.')) {
                  deleteMapping.mutate(String(value));
                }
              }}><Trash2 className="mr-1 inline h-3 w-3" />Delete</button> : null },
            ]}
          />
        </Panel>
      </div>
      ) : null}

      {activeView === 'refresh' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Refresh History" description="One-time, scheduled, incremental, webhook, and retry refresh outcomes.">
            <DataTable
              rows={refreshHistoryRows.filter((row) => !selectedModuleFilter || row.source.toLowerCase().includes(selectedModuleFilter.toLowerCase()) || selectedModuleFilter === 'Reports')}
              emptyTitle="No refresh runs"
              columns={[
                { key: 'time', label: 'Time' },
                { key: 'source', label: 'Source' },
                { key: 'mode', label: 'Refresh Mode' },
                { key: 'rows', label: 'Rows' },
                { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
              ]}
            />
          </Panel>
          <Panel title="Error Logs and Audit Trail" description="Every import decision is tracked before data reaches a module.">
            <div className="space-y-3">
              {[
                ['Credential policy', 'API keys masked, OAuth tokens stored outside visible forms, no hardcoded secrets.'],
                ['Read-only database mode', 'Database connectors request SELECT/read-only access by default.'],
                ['Approval gate', 'Critical imports and master-data overwrites require approval before execution.'],
                ['Audit log', 'Connector, client, module, mapping, validation, approver, and result are recorded.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-cyan-400/15 p-2.5 text-cyan-100">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Company isolation and source-specific intake are active</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Super Admin explicitly chooses the company before adding data. Admin users remain company-scoped. Source forms adapt to ERP, database, cloud, IoT, and file upload requirements, including links, credentials, tokens, and route metadata.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
