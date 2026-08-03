import { Database, FileSpreadsheet, KeyRound, Network, RadioTower, Rows3, X } from 'lucide-react';
import type { ChangeEvent } from 'react';

import { StatusBadge } from '../components/StatusBadge';
import type { DataHubConnector } from './catalog';

type DataHubConnectionModalProps = {
  source: DataHubConnector;
  clientName: string;
  plantName: string;
  destinationModule: string;
  refreshMode: string;
  values: Record<string, string | boolean>;
  selectedFileName?: string;
  canImport: boolean;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  saveStatus: 'idle' | 'saving' | 'success' | 'error';
  message?: string;
  onChange: (key: string, value: string | boolean) => void;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onTest: () => void;
  onSave: () => void;
};

const inputClass = 'min-h-11 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:shadow-[0_0_18px_rgba(34,211,238,0.2)]';
const selectClass = `${inputClass} appearance-none`;

function iconFor(source: DataHubConnector) {
  if (source.kind === 'file') return FileSpreadsheet;
  if (source.kind === 'database') return Database;
  if (source.kind === 'api') return Network;
  if (source.kind === 'cloud') return KeyRound;
  if (source.kind === 'manufacturing') return RadioTower;
  return Rows3;
}

function fieldHelp(source: DataHubConnector) {
  if (source.kind === 'database') return 'Database connections are configured as read-only by default. Use a reporting view or read replica where possible.';
  if (source.kind === 'api') return 'API keys and tokens are masked in the UI. Use pagination and retry policy for larger endpoints.';
  if (source.kind === 'cloud') return 'Cloud links should point to the exact file, folder, sheet, list, or library to avoid importing the wrong data.';
  if (source.kind === 'manufacturing') return 'Manufacturing sources should be scoped to plant, line, work center, warehouse, or device group before import.';
  if (source.kind === 'manual') return 'Manual data creates a governed draft and should be validated before posting to a module.';
  return 'Files are previewed first. Header, encoding, sheet, and table settings can be changed before import.';
}

function TextField({
  label,
  fieldKey,
  values,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string;
  fieldKey: string;
  values: Record<string, string | boolean>;
  onChange: (key: string, value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-300">
      {label}{required ? <span className="text-cyan-200"> *</span> : null}
      <input
        className={`${inputClass} mt-1 w-full`}
        type={type}
        value={String(values[fieldKey] ?? '')}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  fieldKey,
  values,
  onChange,
  options,
}: {
  label: string;
  fieldKey: string;
  values: Record<string, string | boolean>;
  onChange: (key: string, value: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-sm font-medium text-slate-300">
      {label}
      <select
        className={`${selectClass} mt-1 w-full`}
        value={String(values[fieldKey] ?? options[0] ?? '')}
        onChange={(event) => onChange(fieldKey, event.target.value)}
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ConnectorFields({
  source,
  values,
  selectedFileName,
  onChange,
  onFileChange,
}: Pick<DataHubConnectionModalProps, 'source' | 'values' | 'selectedFileName' | 'onChange' | 'onFileChange'>) {
  if (source.kind === 'database') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Server / host" fieldKey="host" values={values} onChange={onChange} placeholder="sql.company.local or 10.10.1.50" required />
        <TextField label="Port" fieldKey="port" values={values} onChange={onChange} placeholder="1433 / 5432 / 3306" />
        <TextField label="Database" fieldKey="database" values={values} onChange={onChange} placeholder="manufacturing_ops" required />
        <TextField label="Schema / table / view" fieldKey="schemaTable" values={values} onChange={onChange} placeholder="dbo.InventoryBalance" />
        <SelectField label="Authentication" fieldKey="authMethod" values={values} onChange={onChange} options={source.authMethods} />
        <SelectField label="Connectivity mode" fieldKey="connectivityMode" values={values} onChange={onChange} options={['Import', 'DirectQuery-style read', 'Metadata only']} />
        <TextField label="Username" fieldKey="username" values={values} onChange={onChange} placeholder="readonly_user" />
        <TextField label="Password / secret" fieldKey="password" values={values} onChange={onChange} placeholder="Stored securely in production vault" type="password" />
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-slate-200 md:col-span-2">
          <input type="checkbox" checked={Boolean(values.readOnly ?? true)} onChange={(event) => onChange('readOnly', event.target.checked)} />
          Force read-only connection for this source
        </label>
      </div>
    );
  }

  if (source.kind === 'api') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Base URL" fieldKey="baseUrl" values={values} onChange={onChange} placeholder="https://api.company.com" required />
        <TextField label="Endpoint / feed" fieldKey="endpoint" values={values} onChange={onChange} placeholder="/inventory/balances or /odata/Items" required />
        <SelectField label="HTTP method" fieldKey="method" values={values} onChange={onChange} options={['GET', 'POST for query only']} />
        <SelectField label="Authentication" fieldKey="authMethod" values={values} onChange={onChange} options={source.authMethods} />
        <TextField label="Token / API key" fieldKey="token" values={values} onChange={onChange} placeholder="Masked after save" type="password" />
        <TextField label="Pagination rule" fieldKey="pagination" values={values} onChange={onChange} placeholder="nextLink, page, offset, cursor" />
        <label className="block text-sm font-medium text-slate-300 md:col-span-2">
          Headers or GraphQL query
          <textarea className={`${inputClass} mt-1 min-h-28 w-full resize-y`} value={String(values.headers ?? '')} onChange={(event) => onChange('headers', event.target.value)} placeholder='{"Accept":"application/json"}' />
        </label>
      </div>
    );
  }

  if (source.kind === 'cloud') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="File, folder, site, or object URL" fieldKey="resourceUrl" values={values} onChange={onChange} placeholder="https://..." required />
        <TextField label="Folder, sheet, list, or object" fieldKey="resourceName" values={values} onChange={onChange} placeholder="Inventory Export / Orders / Cases" />
        <SelectField label="Authentication" fieldKey="authMethod" values={values} onChange={onChange} options={source.authMethods} />
        <SelectField label="Sync mode" fieldKey="syncMode" values={values} onChange={onChange} options={['One-time import', 'Manual refresh', 'Scheduled refresh', 'Incremental refresh']} />
        <TextField label="Service account / client id" fieldKey="clientId" values={values} onChange={onChange} placeholder="Optional for OAuth/service app" />
        <TextField label="Secret / delegated key" fieldKey="clientSecret" values={values} onChange={onChange} placeholder="Masked after save" type="password" />
      </div>
    );
  }

  if (source.kind === 'manufacturing') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="System endpoint" fieldKey="systemUrl" values={values} onChange={onChange} placeholder="https://mes.company.local or opc.tcp://edge:4840" required />
        <TextField label="Plant / line / warehouse scope" fieldKey="assetScope" values={values} onChange={onChange} placeholder="Plant A / Line 1 / Warehouse A" />
        <SelectField label="Data object" fieldKey="dataObject" values={values} onChange={onChange} options={['Inventory balance', 'Work orders', 'OEE events', 'Downtime events', 'Quality inspections', 'Scan events', 'Sensor stream']} />
        <SelectField label="Authentication" fieldKey="authMethod" values={values} onChange={onChange} options={source.authMethods} />
        <TextField label="Topic, node, table, or file pattern" fieldKey="objectPath" values={values} onChange={onChange} placeholder="factory/line1/# or /exports/*.csv" />
        <TextField label="Token / certificate alias" fieldKey="token" values={values} onChange={onChange} placeholder="Masked after save" type="password" />
      </div>
    );
  }

  if (source.kind === 'manual') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Table or template name" fieldKey="tableName" values={values} onChange={onChange} placeholder="inventory_adjustments" required />
        <SelectField label="Entry mode" fieldKey="entryMode" values={values} onChange={onChange} options={['Manual form', 'Bulk paste', 'Template upload']} />
        <TextField label="Owner" fieldKey="owner" values={values} onChange={onChange} placeholder="Data steward or department owner" />
        <TextField label="Approval reason" fieldKey="approvalReason" values={values} onChange={onChange} placeholder="Why this data is being added" />
        <label className="block text-sm font-medium text-slate-300 md:col-span-2">
          Paste sample rows
          <textarea className={`${inputClass} mt-1 min-h-32 w-full resize-y`} value={String(values.pastedRows ?? '')} onChange={(event) => onChange('pastedRows', event.target.value)} placeholder="Paste tabular rows here for preview and validation" />
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-sm font-medium text-slate-300 md:col-span-2">
        File
        <div className="mt-1 rounded-xl border border-dashed border-cyan-300/25 bg-cyan-400/[0.06] p-4">
          <input
            className="w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cyan-50 hover:file:bg-cyan-400/25"
            type="file"
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <p className="mt-2 text-xs text-slate-400">{selectedFileName ? `Selected: ${selectedFileName}` : 'Drag-and-drop can be added by the browser wrapper; manual selection works here.'}</p>
        </div>
      </label>
      <TextField label="Cloud link or local reference" fieldKey="resourceUrl" values={values} onChange={onChange} placeholder="Optional cloud URL or export path" />
      <TextField label="Sheet, table, row node, or page range" fieldKey="sheetName" values={values} onChange={onChange} placeholder="Sheet1 / Items / pages 1-3" />
      <SelectField label="Header handling" fieldKey="headerMode" values={values} onChange={onChange} options={['First row as headers', 'No headers', 'Detect automatically']} />
      <SelectField label="Encoding" fieldKey="encoding" values={values} onChange={onChange} options={['UTF-8', 'UTF-16', 'Windows-1252', 'Auto detect']} />
      <TextField label="Delimiter or file pattern" fieldKey="delimiter" values={values} onChange={onChange} placeholder="Auto detect, comma, tab, |, *.csv" />
    </div>
  );
}

export function DataHubConnectionModal({
  source,
  clientName,
  plantName,
  destinationModule,
  refreshMode,
  values,
  selectedFileName,
  canImport,
  testStatus,
  saveStatus,
  message,
  onChange,
  onFileChange,
  onClose,
  onTest,
  onSave,
}: DataHubConnectionModalProps) {
  const Icon = iconFor(source);
  const busy = testStatus === 'testing' || saveStatus === 'saving';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-md">
      <section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[28px] border border-cyan-300/20 bg-[#081425]/95 shadow-[0_32px_120px_rgba(0,0,0,0.62)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#081425]/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/12 text-cyan-100">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{source.category}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{source.name}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{source.description}</p>
            </div>
          </div>
          <button type="button" className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_260px]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Client</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{clientName}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Plant</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{plantName}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Destination</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{destinationModule}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-4">
              <p className="text-sm leading-6 text-cyan-50">{fieldHelp(source)}</p>
            </div>

            <ConnectorFields source={source} values={values} selectedFileName={selectedFileName} onChange={onChange} onFileChange={onFileChange} />
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Required fields</p>
              <div className="mt-3 space-y-2">
                {source.requiredFields.map((field) => (
                  <div key={field} className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-200">{field}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Modes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={refreshMode} />
                <StatusBadge status={values.readOnly === false ? 'Write blocked' : 'Read-only'} />
                <StatusBadge status={source.kind} />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Examples</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {source.examples.map((example) => (
                  <span key={example} className="rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-xs text-slate-300">{example}</span>
                ))}
              </div>
            </div>
            {message ? (
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm leading-6 text-cyan-50">{message}</div>
            ) : null}
          </aside>
        </div>

        <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-white/10 bg-[#081425]/95 px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={testStatus === 'success' ? 'Connection tested' : testStatus === 'error' ? 'Test failed' : 'Not tested'} />
            <StatusBadge status={saveStatus === 'success' ? 'Draft saved' : saveStatus === 'error' ? 'Save failed' : 'Draft only'} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="form-button-subtle" onClick={onClose}>Cancel</button>
            <button type="button" className="form-button-subtle" disabled={busy || !canImport} onClick={onTest}>
              {testStatus === 'testing' ? 'Testing...' : 'Test connection'}
            </button>
            <button type="button" className="form-button-primary" disabled={busy || !canImport} onClick={onSave}>
              {saveStatus === 'saving' ? 'Saving...' : 'Save source draft'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
