import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense, lazy } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import type { PlatformWorkspace } from '../components/PlatformEmbeddedWorkspace';
import { StatusBadge } from '../components/StatusBadge';
import { useDismissibleLayer } from '../lib/useDismissibleLayer';
import { platformModules } from '../platform/data';
import { usePlatform } from '../platform/PlatformContext';

const PlatformEmbeddedWorkspace = lazy(() => import('../components/PlatformEmbeddedWorkspace').then((module) => ({ default: module.PlatformEmbeddedWorkspace })));

function ColumnFilter({ label, active, children, width = 'w-64' }: { label: string; active?: boolean; children: ReactNode; width?: string }) {
  const [open, setOpen] = useState(false);
  const filterRef = useDismissibleLayer<HTMLDivElement>({ open, onDismiss: () => setOpen(false) });
  return (
    <div ref={filterRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-md py-1 hover:text-cyan-200"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{label}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className={`absolute left-0 top-[calc(100%+8px)] z-50 ${width} max-w-[min(90vw,28rem)] rounded-lg border border-white/10 bg-[#111b30] p-3 normal-case tracking-normal shadow-2xl`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

const platformWorkspaces: PlatformWorkspace[] = ['clients', 'markets', 'users', 'modules', 'subscriptions', 'integrations', 'audit'];

function isPlatformWorkspace(value: string | null): value is PlatformWorkspace {
  return Boolean(value && platformWorkspaces.includes(value as PlatformWorkspace));
}

export function PlatformDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = usePlatform();
  const [moduleHealthClientId, setModuleHealthClientId] = useState('all');
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleAvailability, setModuleAvailability] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [moduleHealthStatus, setModuleHealthStatus] = useState<'all' | 'healthy' | 'attention' | 'disabled'>('all');
  const [moduleUpdatedSearch, setModuleUpdatedSearch] = useState('');
  const [scrolledModulePosition, setScrolledModulePosition] = useState(1);
  const [hoveredModulePosition, setHoveredModulePosition] = useState<number | null>(null);
  const [selectedModuleName, setSelectedModuleName] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<PlatformWorkspace>(() => {
    const workspace = searchParams.get('workspace');
    return isPlatformWorkspace(workspace) ? workspace : 'clients';
  });
  useEffect(() => {
    const workspace = searchParams.get('workspace');
    if (isPlatformWorkspace(workspace) && workspace !== activeWorkspace) {
      setActiveWorkspace(workspace);
    }
  }, [activeWorkspace, searchParams]);
  function changeWorkspace(workspace: PlatformWorkspace) {
    setActiveWorkspace(workspace);
    setSearchParams({ workspace });
  }
  const moduleHealthClient = state.clients.find((client) => client.clientId === moduleHealthClientId);
  const moduleHealthClients = moduleHealthClient ? [moduleHealthClient] : state.clients;
  const moduleRows = platformModules.map((moduleName, index) => {
    const enabledClients = moduleHealthClients.filter((client) => client.enabledModules.includes(moduleName) || moduleName === 'Admin').length;
    const disabledClients = moduleHealthClients.length - enabledClients;
    return {
      moduleName,
      enabledClients,
      disabledClients,
      status: disabledClients > 0 ? moduleHealthClient ? 'Disabled by Platform Admin' : 'Attention Needed' : index === 8 ? 'Attention Needed' : 'Healthy',
      lastUpdated: moduleHealthClient?.lastUpdated ? `${moduleHealthClient.lastUpdated} 09:00` : '21 Jun 2026 09:00',
    };
  });
  const moduleHealthDescription = moduleHealthClient
    ? `Module availability and health for ${moduleHealthClient.clientName}.`
    : 'Platform-level availability and client enablement across all clients.';
  const visibleModuleRows = moduleRows.filter((row) => {
    const matchesSearch = row.moduleName.toLowerCase().includes(moduleSearch.trim().toLowerCase());
    const matchesAvailability = moduleAvailability === 'all'
      || (moduleAvailability === 'enabled' && row.disabledClients === 0)
      || (moduleAvailability === 'disabled' && row.disabledClients > 0);
    const matchesHealth = moduleHealthStatus === 'all'
      || (moduleHealthStatus === 'healthy' && row.status === 'Healthy')
      || (moduleHealthStatus === 'attention' && row.status === 'Attention Needed')
      || (moduleHealthStatus === 'disabled' && row.status === 'Disabled by Platform Admin');
    const matchesUpdated = row.lastUpdated.toLowerCase().includes(moduleUpdatedSearch.trim().toLowerCase());
    return matchesSearch && matchesAvailability && matchesHealth && matchesUpdated;
  });
  const currentModulePosition = visibleModuleRows.length === 0
    ? 0
    : Math.min(hoveredModulePosition ?? scrolledModulePosition, visibleModuleRows.length);
  const selectedModule = moduleRows.find((row) => row.moduleName === selectedModuleName) ?? null;
  const selectedClientLabel = moduleHealthClient?.clientName ?? 'All Clients';
  const selectedModuleLogs = selectedModule
    ? state.auditLogs.filter((log) =>
      log.moduleName === selectedModule.moduleName
      && (!moduleHealthClient || log.clientId === moduleHealthClient.clientId || log.clientName === moduleHealthClient.clientName))
    : [];
  const impactedClients = selectedModule
    ? state.clients.filter((client) => selectedModule.moduleName !== 'Admin' && !client.enabledModules.includes(selectedModule.moduleName))
    : [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform Context" title="Platform Management Services" description="A single embedded workspace for clients, users, modules, subscriptions, integrations, and audit." />
      <Suspense fallback={<Panel title="Platform Management Services" description="Loading management workspace only when needed."><div className="rounded-2xl border border-white/10 bg-slate-950/30 p-6 text-sm text-slate-400">Loading platform workspace...</div></Panel>}>
        <PlatformEmbeddedWorkspace active={activeWorkspace} onChange={changeWorkspace} />
      </Suspense>
      <Panel title="Module Health" description={moduleHealthDescription}>
        <div className="overflow-x-auto">
          <div className="max-h-[321px] min-w-[980px] overflow-y-auto [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.04)]" onScroll={(event) => setScrolledModulePosition(Math.min(Math.floor(event.currentTarget.scrollTop / 54) + 1, Math.max(visibleModuleRows.length, 1)))}>
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-20 bg-[#0d1527]"><tr className="h-12 border-b border-white/10 text-left text-xs uppercase tracking-[0.1em] text-slate-500">
                <th className="px-3 py-3"><ColumnFilter label="Module Name" active={Boolean(moduleSearch)}><input autoFocus className="form-input w-full py-2 text-sm" type="search" placeholder="Search module name..." value={moduleSearch} onChange={(event) => { setModuleSearch(event.target.value); setScrolledModulePosition(1); }} /></ColumnFilter></th>
                <th className="px-3 py-3"><ColumnFilter label="Availability" active={moduleAvailability !== 'all'} width="w-52"><select className="form-input w-full py-2 text-sm" value={moduleAvailability} onChange={(event) => { setModuleAvailability(event.target.value as 'all' | 'enabled' | 'disabled'); setScrolledModulePosition(1); }}><option value="all">All availability</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></ColumnFilter></th>
                <th className="px-3 py-3"><ColumnFilter label="Health Status" active={moduleHealthStatus !== 'all'} width="w-56"><select className="form-input w-full py-2 text-sm" value={moduleHealthStatus} onChange={(event) => { setModuleHealthStatus(event.target.value as 'all' | 'healthy' | 'attention' | 'disabled'); setScrolledModulePosition(1); }}><option value="all">All health statuses</option><option value="healthy">Healthy</option><option value="attention">Attention Needed</option><option value="disabled">Disabled</option></select></ColumnFilter></th>
                <th className="px-3 py-3"><ColumnFilter label="Client" active={moduleHealthClientId !== 'all'}><select className="form-input w-full py-2 text-sm" value={moduleHealthClientId} onChange={(event) => { setModuleHealthClientId(event.target.value); setScrolledModulePosition(1); }}><option value="all">All Clients</option>{state.clients.map((client) => <option key={client.clientId} value={client.clientId}>{client.clientName}</option>)}</select></ColumnFilter></th>
                <th className="px-3 py-3"><ColumnFilter label="Last Updated" active={Boolean(moduleUpdatedSearch)}><input className="form-input w-full py-2 text-sm" type="search" placeholder="Search date or time..." value={moduleUpdatedSearch} onChange={(event) => { setModuleUpdatedSearch(event.target.value); setScrolledModulePosition(1); }} /></ColumnFilter></th>
                <th className="w-24 px-3 py-3" />
              </tr></thead>
              <tbody>{visibleModuleRows.map((row, index) => <tr key={row.moduleName} className="h-[54px] border-b border-white/10 hover:bg-white/[0.04]" onMouseEnter={() => setHoveredModulePosition(index + 1)} onMouseLeave={() => setHoveredModulePosition(null)}><td className="px-3 py-3 font-medium text-white">{row.moduleName}</td><td className="px-3 py-3">{row.disabledClients === 0 ? <span className="text-emerald-200">Enabled</span> : moduleHealthClient ? <span className="text-rose-200">Disabled</span> : <span className="text-amber-200">{row.enabledClients} enabled / {row.disabledClients} disabled</span>}</td><td className="px-3 py-3"><StatusBadge status={row.status} /></td><td className="px-3 py-3 text-slate-300">{moduleHealthClient?.clientName ?? 'All Clients'}</td><td className="px-3 py-3 text-slate-400">{row.lastUpdated}</td><td className="px-3 py-3 text-right"><button className="form-button-subtle py-1 text-xs" onClick={() => setSelectedModuleName(row.moduleName)}>View</button></td></tr>)}</tbody>
            </table>
            {visibleModuleRows.length === 0 && <div className="flex h-[270px] items-center justify-center text-sm text-slate-400">No modules match your search and filter.</div>}
          </div>
          <div className="sticky left-0 flex h-8 items-center border-t border-white/10 bg-[#0d1527] px-3 text-xs font-medium text-cyan-200" aria-live="polite">{currentModulePosition} of {visibleModuleRows.length}</div>
        </div>
      </Panel>
      {selectedModule && (
        <Panel title={`${selectedModule.moduleName} Health Diagnostics`} description={`Embedded issue details for ${selectedClientLabel}. No redirect needed.`}>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Current issue</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedModule.status === 'Healthy' ? 'No active issue' : selectedModule.status}</p>
              <p className="mt-2 text-sm text-slate-400">{selectedModule.disabledClients > 0 ? `${selectedModule.disabledClients} client allocation gap detected for this module.` : 'The module is enabled for the selected scope.'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Client impact</p>
              <p className="mt-2 text-lg font-semibold text-white">{moduleHealthClient ? moduleHealthClient.clientName : `${impactedClients.length} impacted clients`}</p>
              <p className="mt-2 text-sm text-slate-400">{impactedClients.length ? impactedClients.map((client) => client.clientName).join(', ') : 'No impacted client found in the current filter.'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Likely trigger</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedModuleLogs[0]?.action ?? 'No recent change log'}</p>
              <p className="mt-2 text-sm text-slate-400">{selectedModuleLogs[0]?.description ?? 'Use module/client audit logs to trace the exact change before the issue.'}</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.1em] text-slate-500">{['Timestamp','Client','Module','Change Before Issue','Actor','Status'].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead>
              <tbody>{selectedModuleLogs.map((log) => <tr key={log.logId} className="border-b border-white/10"><td className="px-3 py-3 text-slate-400">{log.timestamp}</td><td className="px-3 py-3 text-slate-300">{log.clientName}</td><td className="px-3 py-3 text-white">{log.moduleName}</td><td className="px-3 py-3 text-slate-300">{log.action}: {log.description ?? 'Platform change recorded'}</td><td className="px-3 py-3 text-cyan-200">{log.userId}</td><td className="px-3 py-3"><StatusBadge status={log.status ?? 'Completed'} /></td></tr>)}</tbody>
            </table>
            {selectedModuleLogs.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No audit logs found for this module and client filter.</div>}
          </div>
        </Panel>
      )}
    </div>
  );
}
