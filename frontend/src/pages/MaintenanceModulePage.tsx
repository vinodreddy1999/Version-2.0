import { Activity, BarChart3, CalendarDays, ClipboardCheck, FileText, GitBranch, HeartPulse, History, PackageSearch, Search, TimerReset, Wrench } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { LazyBarChart, LazyLineChart } from '../components/LazyCharts';
import { ModuleNavigationTabs } from '../components/ModuleNavigationTabs';
import { Panel } from '../components/Panel';
import { RowActions } from '../components/RowActions';
import { ScrollableTableFrame } from '../components/ScrollableTableFrame';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '../lib/format';
import { canAccessModule, canViewFinancialData, filterFinancialTableRows, filterScopedTableRows, type PermissionContext } from '../lib/rbac';
import { useDismissibleLayer } from '../lib/useDismissibleLayer';
import {
  assetHealthRecords,
  assets,
  auditEntries,
  breakdownRecords,
  calendarEvents,
  correctiveRecords,
  costRecords,
  hierarchyRecords,
  maintenanceCompany,
  maintenanceReports,
  preventiveSchedules,
  spareParts,
  workOrders,
} from '../maintenance/data';
import { usePlatform } from '../platform/PlatformContext';
import type { RuntimeUser } from '../types';

type MaintenanceSection = 'dashboard' | 'assets' | 'hierarchy' | 'work-orders' | 'preventive' | 'corrective' | 'breakdown' | 'calendar' | 'spares' | 'cost' | 'asset-health' | 'reports' | 'audit';
type TableRow = Record<string, string | number | ReactNode>;

const maintenanceNav: Array<{ section: MaintenanceSection; label: string; path: string; icon: typeof Wrench }> = [
  { section: 'dashboard', label: 'Maintenance Dashboard', path: '/maintenance', icon: Wrench },
  { section: 'assets', label: 'Asset Register', path: '/maintenance/assets', icon: ClipboardCheck },
  { section: 'hierarchy', label: 'Asset Hierarchy', path: '/maintenance/hierarchy', icon: GitBranch },
  { section: 'work-orders', label: 'Work Orders', path: '/maintenance/work-orders', icon: ClipboardCheck },
  { section: 'preventive', label: 'Preventive Maintenance', path: '/maintenance/preventive', icon: TimerReset },
  { section: 'corrective', label: 'Corrective Maintenance', path: '/maintenance/corrective', icon: Wrench },
  { section: 'breakdown', label: 'Breakdown Maintenance', path: '/maintenance/breakdown', icon: Activity },
  { section: 'calendar', label: 'Maintenance Calendar', path: '/maintenance/calendar', icon: CalendarDays },
  { section: 'spares', label: 'Spare Parts', path: '/maintenance/spares', icon: PackageSearch },
  { section: 'cost', label: 'Maintenance Cost', path: '/maintenance/cost', icon: BarChart3 },
  { section: 'asset-health', label: 'Asset Health', path: '/maintenance/asset-health', icon: HeartPulse },
  { section: 'reports', label: 'Maintenance Reports', path: '/maintenance/reports', icon: FileText },
  { section: 'audit', label: 'Maintenance Audit', path: '/maintenance/audit', icon: History },
];

const sectionByPath = Object.fromEntries(maintenanceNav.map((item) => [item.path, item.section])) as Record<string, MaintenanceSection>;

export function MaintenanceModulePage({ user }: { user: RuntimeUser }) {
  const { selectedClient, platformUser } = usePlatform();
  const location = useLocation();
  const section = sectionByPath[location.pathname] ?? 'dashboard';
  const accessContext = { user, selectedClient, platformUser };
  const maintenanceAllowed = canAccessModule(accessContext, 'Maintenance');
  const canViewFinancial = canViewFinancialData(accessContext);
  const visibleNav = canViewFinancial ? maintenanceNav : maintenanceNav.filter((item) => item.section !== 'cost');

  if (!maintenanceAllowed) {
    return (
      <Panel title="Maintenance is not enabled" description="Your role, company, or assigned module list does not include Maintenance.">
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Maintenance requires tenant, company, role, and user assignment before the Company Admin view is visible.
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <ModuleNavigationTabs
        items={visibleNav}
        dashboardPath="/maintenance"
        moduleName="Maintenance"
        description={canViewFinancial ? 'Company-level asset reliability, work execution, preventive maintenance, breakdowns, cost, and health.' : 'Company-level asset reliability, work execution, preventive maintenance, breakdowns, and health.'}
      />
      <MaintenanceSectionContent section={section} accessContext={accessContext} />
    </div>
  );
}

function MaintenanceSectionContent({ section, accessContext }: { section: MaintenanceSection; accessContext: PermissionContext }) {
  const canViewFinancial = canViewFinancialData(accessContext);
  if (section === 'dashboard' || (section === 'cost' && !canViewFinancial)) return <MaintenanceDashboard accessContext={accessContext} />;
  if (section === 'assets') return <MaintenanceRegister accessContext={accessContext} title="Asset Register" description="Company assets, machines, ownership, criticality, and maintenance history access." rows={assetRows()} searchKeys={['Asset ID', 'Asset Name', 'Machine', 'Serial Number', 'Manufacturer']} action="Create Asset" />;
  if (section === 'hierarchy') return <MaintenanceRegister accessContext={accessContext} title="Asset Hierarchy" description="Plant to line to machine to component structure for spare linkage and traceability." rows={hierarchyRows()} searchKeys={['Node ID', 'Asset / Component Name', 'Parent Asset', 'Level']} action="Add Child Asset" />;
  if (section === 'work-orders') return <MaintenanceRegister accessContext={accessContext} title="Work Orders" description="Preventive, corrective, breakdown, inspection, calibration, and lubrication work orders." rows={workOrderRows()} searchKeys={['Work Order ID', 'Asset', 'Assigned Technician', 'Maintenance Type']} action="Create Work Order" />;
  if (section === 'preventive') return <MaintenanceRegister accessContext={accessContext} title="Preventive Maintenance" description="Planned maintenance schedule, compliance, upcoming tasks, and overdue PM work." rows={preventiveRows()} searchKeys={['PM Schedule ID', 'Asset', 'Assigned Technician']} action="Create PM Schedule" />;
  if (section === 'corrective') return <MaintenanceRegister accessContext={accessContext} title="Corrective Maintenance" description="Non-emergency corrective repairs identified during operation, inspection, or quality checks." rows={correctiveRows()} searchKeys={['Corrective WO ID', 'Asset', 'Issue Description', 'Assigned Technician']} action="Create Corrective Work Order" />;
  if (section === 'breakdown') return <MaintenanceRegister accessContext={accessContext} title="Breakdown Maintenance" description="Urgent breakdowns, root cause, downtime hours, production impact, and repair status." rows={breakdownRows()} searchKeys={['Breakdown ID', 'Asset', 'Line', 'Assigned Technician', 'Root Cause']} action="Log Breakdown" />;
  if (section === 'calendar') return <MaintenanceRegister accessContext={accessContext} title="Maintenance Calendar" description="Daily, weekly, monthly, asset, technician, and plant maintenance schedule." rows={calendarRows()} searchKeys={['Calendar ID', 'Asset', 'Technician', 'Maintenance Type']} action="Create Maintenance Task" />;
  if (section === 'spares') return <MaintenanceRegister accessContext={accessContext} title="Spare Parts" description="Spare availability, shortage risk, consumption, and maintenance material requirements." rows={spareRows()} searchKeys={['Spare Part ID', 'Spare Name', 'Linked Asset', 'Supplier']} action="Request Purchase" />;
  if (section === 'cost') return <CostPanel accessContext={accessContext} />;
  if (section === 'asset-health') return <AssetHealthPanel accessContext={accessContext} />;
  if (section === 'reports') return <ReportsPanel accessContext={accessContext} />;
  return <MaintenanceRegister accessContext={accessContext} title="Maintenance Audit" description="Business-friendly audit history for asset and maintenance changes." rows={auditRows()} searchKeys={['Timestamp', 'User', 'Action', 'Maintenance Area', 'Reference ID']} action="Export Audit" />;
}

function MaintenanceDashboard({ accessContext }: { accessContext: PermissionContext }) {
  const canViewFinancial = canViewFinancialData(accessContext);
  const availability = Math.round(assetHealthRecords.reduce((sum, item) => sum + item.availability, 0) / assetHealthRecords.length);
  const health = Math.round(assetHealthRecords.reduce((sum, item) => sum + item.healthScore, 0) / assetHealthRecords.length);
  const openWorkOrders = workOrders.filter((item) => ['Open', 'Assigned', 'In Progress', 'On Hold', 'Overdue'].includes(item.status)).length;
  const overdueWorkOrders = workOrders.filter((item) => item.status === 'Overdue').length;
  const activeBreakdowns = breakdownRecords.filter((item) => !['Closed'].includes(item.status)).length;
  const pmCompliance = Math.round(preventiveSchedules.reduce((sum, item) => sum + item.compliance, 0) / preventiveSchedules.length);
  const downtime = breakdownRecords.reduce((sum, item) => sum + item.downtimeHours, 0);
  const mttr = (assetHealthRecords.reduce((sum, item) => sum + item.mttr, 0) / assetHealthRecords.length).toFixed(1);
  const mtbf = Math.round(assetHealthRecords.reduce((sum, item) => sum + item.mtbf, 0) / assetHealthRecords.length);
  const totalCost = costRecords.reduce((sum, item) => sum + item.amount, 0);
  const criticalRisk = assetHealthRecords.filter((item) => ['Critical', 'Down'].includes(item.riskStatus)).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Asset Availability" value={`${availability}%`} helper="Average asset availability" accent="emerald" />
        <StatCard label="Asset Health Score" value={`${health}%`} helper="Risk weighted" accent={health >= 80 ? 'emerald' : 'amber'} />
        <StatCard label="Open Work Orders" value={openWorkOrders} helper="Needs maintenance action" accent="amber" />
        <StatCard label="Overdue Work Orders" value={overdueWorkOrders} helper="Past due date" accent="amber" />
        <StatCard label="Active Breakdowns" value={activeBreakdowns} helper="Production-impacting" accent="amber" />
        <StatCard label="PM Compliance" value={`${pmCompliance}%`} helper="Preventive schedule adherence" accent={pmCompliance >= 90 ? 'emerald' : 'amber'} />
        <StatCard label="Downtime Hours" value={downtime.toFixed(1)} helper="Breakdown downtime" accent="amber" />
        <StatCard label="MTTR" value={`${mttr} hrs`} helper="Mean time to repair" accent="blue" />
        <StatCard label="MTBF" value={`${mtbf} hrs`} helper="Mean time between failures" accent="blue" />
        {canViewFinancial ? <StatCard label="Maintenance Cost" value={formatCurrency(totalCost, maintenanceCompany.currency)} helper="Current maintenance spend" accent="violet" /> : null}
        <StatCard label="Critical Asset Risk" value={criticalRisk} helper="Critical or down assets" accent="amber" />
        <StatCard label="Maintenance Health Score" value="87%" helper="Reliability adjusted" accent="emerald" />
      </div>
      <MaintenanceFilters />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Asset Availability Trend" description="Available and unavailable assets by date."><MaintenanceLineChart data={[{ name: 'Jun 19', value: 84 }, { name: 'Jun 20', value: 86 }, { name: 'Jun 21', value: 88 }, { name: 'Jun 22', value: 90 }, { name: 'Jun 23', value: 89 }, { name: 'Jun 24', value: availability }]} /></Panel>
        <Panel title="Open Work Orders" description="Open, assigned, in-progress, overdue, and held work orders."><MaintenanceDataTable accessContext={accessContext} rows={workOrderRows().filter((row) => !['Completed', 'Closed'].includes(String(row.Status)))} /></Panel>
        <Panel title="Preventive Maintenance Compliance" description="Planned, completed, overdue, and compliance percentage by asset."><MaintenanceBarChart data={preventiveSchedules.map((item) => ({ name: item.asset, compliance: item.compliance }))} bars={['compliance']} /></Panel>
        <Panel title="Breakdown Summary" description={canViewFinancial ? 'Active and recently closed breakdowns with downtime cost impact.' : 'Active and recently closed breakdowns with downtime impact.'}><MaintenanceDataTable accessContext={accessContext} rows={breakdownRows().slice(0, 6)} /></Panel>
        <Panel title="Spare Parts Risk" description="Low-stock and stockout risks linked to maintenance assets."><MaintenanceDataTable accessContext={accessContext} rows={spareRows().filter((row) => ['Critical', 'Low Stock', 'Stockout'].includes(String(row.Status)))} /></Panel>
        {canViewFinancial ? <Panel title="Maintenance Cost Trend" description="Cost by maintenance category and work order."><MaintenanceBarChart data={costByType()} bars={['amount']} /></Panel> : <Panel title="Maintenance Risk Trend" description="Open work orders by maintenance category."><MaintenanceBarChart data={riskByType()} bars={['count']} /></Panel>}
      </div>
    </div>
  );
}

function CostPanel({ accessContext }: { accessContext: PermissionContext }) {
  const total = costRecords.reduce((sum, item) => sum + item.amount, 0);
  const breakdown = costRecords.filter((item) => ['Downtime Cost', 'Spare Parts'].includes(item.type)).reduce((sum, item) => sum + item.amount, 0);
  const spare = costRecords.filter((item) => item.type === 'Spare Parts').reduce((sum, item) => sum + item.amount, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Maintenance Cost" value={formatCurrency(total, maintenanceCompany.currency)} helper="All cost records" accent="violet" />
        <StatCard label="Preventive Cost" value={formatCurrency(6600, maintenanceCompany.currency)} helper="PM spend" accent="emerald" />
        <StatCard label="Corrective Cost" value={formatCurrency(34100, maintenanceCompany.currency)} helper="Corrective repairs" accent="amber" />
        <StatCard label="Breakdown Cost" value={formatCurrency(breakdown, maintenanceCompany.currency)} helper="Downtime and spares" accent="amber" />
        <StatCard label="Spare Cost" value={formatCurrency(spare, maintenanceCompany.currency)} helper="Spare part usage" accent="blue" />
        <StatCard label="Downtime Cost" value={formatCurrency(61200, maintenanceCompany.currency)} helper="Production loss estimate" accent="amber" />
      </div>
      <Panel title="Maintenance Cost" description="Track maintenance spend, spare cost, labor, external service, and downtime cost.">
        <MaintenanceBarChart data={costByType()} bars={['amount']} />
        <div className="mt-5"><MaintenanceDataTable accessContext={accessContext} rows={costRows()} /></div>
      </Panel>
    </div>
  );
}

function AssetHealthPanel({ accessContext }: { accessContext: PermissionContext }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Healthy Assets" value={assetHealthRecords.filter((item) => item.riskStatus === 'Healthy').length} helper="No immediate action" accent="emerald" />
        <StatCard label="Attention Needed" value={assetHealthRecords.filter((item) => item.riskStatus === 'Attention Needed').length} helper="Monitor closely" accent="amber" />
        <StatCard label="Critical / Down" value={assetHealthRecords.filter((item) => ['Critical', 'Down'].includes(item.riskStatus)).length} helper="Action required" accent="amber" />
        <StatCard label="Average MTBF" value={`${Math.round(assetHealthRecords.reduce((sum, item) => sum + item.mtbf, 0) / assetHealthRecords.length)} hrs`} helper="Reliability baseline" accent="blue" />
      </div>
      <Panel title="Asset Health" description="Asset condition, availability, MTTR, MTBF, breakdown count, and risk status.">
        <MaintenanceBarChart data={assetHealthRecords.map((item) => ({ name: item.asset, health: item.healthScore, availability: item.availability }))} bars={['health', 'availability']} />
        <div className="mt-5"><MaintenanceDataTable accessContext={accessContext} rows={assetHealthRows()} /></div>
      </Panel>
    </div>
  );
}

function MaintenanceRegister({ title, description, rows, searchKeys, action, accessContext }: { title: string; description: string; rows: TableRow[]; searchKeys: string[]; action: string; accessContext: PermissionContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [drawer, setDrawer] = useState(false);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const searchable = searchKeys.map((key) => String(row[key] ?? '')).join(' ').toLowerCase();
    const statusText = String(row.Status ?? row['Risk Status'] ?? '').toLowerCase();
    return (!search || searchable.includes(search.toLowerCase())) && (!status || statusText.includes(status.toLowerCase()));
  }), [rows, search, searchKeys, status]);

  return (
    <div className="space-y-5">
      <MaintenanceFilters compact />
      <Panel title={title} description={description} action={<button className="form-button-primary" onClick={() => setDrawer(true)}>{action}</button>}>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="form-input w-full pl-10" placeholder={`Search ${searchKeys.join(', ').toLowerCase()}...`} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['Running', 'Attention Needed', 'Down', 'Open', 'Assigned', 'In Progress', 'On Hold', 'Completed', 'Closed', 'Overdue', 'Critical', 'Low Stock', 'Stockout'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="form-button-subtle" onClick={() => { setSearch(''); setStatus(''); }}>Clear</button>
        </div>
        <MaintenanceDataTable accessContext={accessContext} rows={filteredRows} />
      </Panel>
      {drawer ? <MaintenanceFormDrawer accessContext={accessContext} title={action} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function MaintenanceDataTable({ rows, accessContext }: { rows: TableRow[]; accessContext?: PermissionContext }) {
  const scopedRows = accessContext ? filterScopedTableRows(rows, accessContext) : rows;
  const visibleRows = accessContext ? filterFinancialTableRows(scopedRows, accessContext) : scopedRows;
  const headers = visibleRows[0] ? Object.keys(visibleRows[0]) : [];
  return (
    <ScrollableTableFrame count={rows.length}>
      <table className="min-w-[1120px] w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
            {headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => (
            <tr key={String(Object.values(row)[0] ?? index)} className="border-b border-white/10 hover:bg-white/[0.04]">
              {headers.map((header) => <td key={header} className="px-3 py-3 text-slate-300">{(header === 'Status' || header === 'Risk Status') && typeof row[header] === 'string' ? <StatusBadge status={String(row[header])} /> : row[header]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableFrame>
  );
}

function ReportsPanel({ accessContext }: { accessContext: PermissionContext }) {
  void accessContext;
  return (
    <div className="space-y-5">
      <MaintenanceFilters />
      <Panel title="Maintenance Reports" description="Preview and export maintenance reports as PDF, Excel, or CSV.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {maintenanceReports.map((report) => (
            <div key={report} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="font-medium text-white">{report}</p>
              <p className="mt-2 text-sm text-slate-400">Company-scoped report for ABC Manufacturing.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Preview', 'PDF', 'Excel', 'CSV'].map((item) => <button key={item} className="form-button-subtle py-1 text-xs">{item}</button>)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MaintenanceFilters({ compact = false }: { compact?: boolean }) {
  return (
    <Panel title="Maintenance Filters" description="Company context is fixed. No client or company filter is shown for Company Admin.">
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-4 xl:grid-cols-5' : 'md:grid-cols-4 xl:grid-cols-5'}`}>
        <Filter label="Plant" options={maintenanceCompany.plants} />
        <Filter label="Department" options={maintenanceCompany.departments} />
        <Filter label="Production Line" options={maintenanceCompany.lines} />
        <Filter label="Asset" options={maintenanceCompany.assets} />
        <Filter label="Asset Category" options={['Mixer', 'Oven', 'Filler', 'Packaging', 'Utility', 'Conveyor']} />
        <Filter label="Criticality" options={['Critical', 'High', 'Medium', 'Low']} />
        <Filter label="Maintenance Type" options={['Preventive', 'Corrective', 'Breakdown', 'Inspection', 'Calibration', 'Lubrication']} />
        <Filter label="Technician" options={maintenanceCompany.technicians} />
        <Field label="Date Range"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
        <Filter label="Status" options={['Open', 'Assigned', 'In Progress', 'Completed', 'Closed', 'Overdue', 'Down']} />
      </div>
    </Panel>
  );
}

function MaintenanceFormDrawer({ title, onClose, accessContext }: { title: string; onClose: () => void; accessContext: PermissionContext }) {
  const canViewFinancial = canViewFinancialData(accessContext);
  const drawerRef = useDismissibleLayer<HTMLElement>({
    open: true,
    onDismiss: onClose,
    lockBodyScroll: true,
    manageFocus: true,
  });
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">Draft-only mock form. Maintenance actions still require human approval.</p>
          </div>
          <button className="form-button-subtle" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Asset"><select className="form-input mt-1 w-full">{maintenanceCompany.assets.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Maintenance Type"><select className="form-input mt-1 w-full">{['Preventive', 'Corrective', 'Breakdown', 'Inspection', 'Calibration', 'Lubrication'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Priority"><select className="form-input mt-1 w-full">{['Critical', 'High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Technician"><select className="form-input mt-1 w-full">{maintenanceCompany.technicians.map((item) => <option key={item}>{item}</option>)}</select></Field>
          {canViewFinancial ? <Field label="Estimated Cost"><input className="form-input mt-1 w-full" min={0} type="number" defaultValue={0} /></Field> : null}
          <Field label="Planned Date"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
          <Field label="Business Reason" className="md:col-span-2"><textarea className="form-input mt-1 min-h-24 w-full" placeholder="Reason required before changing maintenance status" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="form-button-subtle" onClick={onClose}>Cancel</button>
          <button className="form-button-primary" onClick={onClose}>Save Draft</button>
        </div>
      </section>
    </div>
  );
}

function MaintenanceBarChart({ data, bars }: { data: Array<Record<string, string | number>>; bars: string[] }) {
  return <LazyBarChart data={data} bars={bars} />;
}

function MaintenanceLineChart({ data }: { data: Array<Record<string, string | number>> }) {
  return <LazyLineChart data={data} />;
}

function Filter({ label, options }: { label: string; options: string[] }) {
  return <label className="text-sm text-slate-300">{label}<select className="form-input mt-1 w-full"><option>All {label.toLowerCase()}</option>{options.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`text-sm text-slate-300 ${className}`}>{label}{children}</label>;
}

function assetRows() { return assets.map((item) => ({ 'Asset ID': item.id, 'Asset Name': item.name, 'Asset Category': item.category, Plant: item.plant, Department: item.department, 'Production Line': item.line, Machine: item.machine, Manufacturer: item.manufacturer, Model: item.model, 'Serial Number': item.serial, Criticality: item.criticality, Status: item.status, 'Health Score': `${item.healthScore}%`, 'Last Maintenance Date': item.lastMaintenance, 'Next Maintenance Date': item.nextMaintenance, Owner: item.owner, Actions: <RowActions labels={['View', 'Edit', 'History']} /> })); }
function hierarchyRows() { return hierarchyRecords.map((item) => ({ 'Node ID': item.nodeId, 'Asset / Component Name': item.name, 'Parent Asset': item.parent, Level: item.level, Criticality: item.criticality, 'Linked Spares': item.linkedSpares, Status: item.status, Owner: item.owner, Actions: <RowActions labels={['Add Child', 'Link Spare', 'Documents']} /> })); }
function workOrderRows() { return workOrders.map((item) => ({ 'Work Order ID': item.id, Asset: item.asset, 'Maintenance Type': item.type, Priority: item.priority, Plant: item.plant, Line: item.line, 'Assigned Technician': item.technician, 'Planned Start': item.plannedStart, 'Planned End': item.plannedEnd, 'Actual Start': item.actualStart, 'Actual End': item.actualEnd, Status: item.status, Cost: formatCurrency(item.cost, maintenanceCompany.currency), 'Downtime Hours': item.downtimeHours, Actions: <RowActions labels={['Assign', 'Start', 'Complete']} /> })); }
function preventiveRows() { return preventiveSchedules.map((item) => ({ 'PM Schedule ID': item.id, Asset: item.asset, Frequency: item.frequency, 'Last PM Date': item.lastPm, 'Next PM Date': item.nextPm, 'Assigned Technician': item.technician, 'PM Checklist': item.checklist, Status: item.status, 'Compliance %': `${item.compliance}%`, Actions: <RowActions labels={['Generate WO', 'Checklist', 'Complete']} /> })); }
function correctiveRows() { return correctiveRecords.map((item) => ({ 'Corrective WO ID': item.id, Asset: item.asset, 'Issue Description': item.issue, Priority: item.priority, 'Reported By': item.reportedBy, 'Assigned Technician': item.technician, 'Planned Date': item.plannedDate, Status: item.status, Cost: formatCurrency(item.cost, maintenanceCompany.currency), Actions: <RowActions labels={['Assign', 'Progress', 'Close']} /> })); }
function breakdownRows() { return breakdownRecords.map((item) => ({ 'Breakdown ID': item.id, Asset: item.asset, Plant: item.plant, Line: item.line, 'Breakdown Start': item.start, 'Breakdown End': item.end, 'Downtime Hours': item.downtimeHours, 'Root Cause': item.rootCause, 'Assigned Technician': item.technician, 'Production Impact': item.productionImpact, Status: item.status, Cost: formatCurrency(item.cost, maintenanceCompany.currency), Actions: <RowActions labels={['RCA', 'Spare Usage', 'Close']} /> })); }
function calendarRows() { return calendarEvents.map((item) => ({ 'Calendar ID': item.id, 'Maintenance Type': item.type, Asset: item.asset, Technician: item.technician, Start: item.start, End: item.end, Status: item.status, Actions: <RowActions labels={['Reschedule', 'Assign', 'View WO']} /> })); }
function spareRows() { return spareParts.map((item) => ({ 'Spare Part ID': item.id, 'Spare Name': item.name, 'Linked Asset': item.asset, 'Available Qty': item.availableQty, 'Reserved Qty': item.reservedQty, 'Required Qty': item.requiredQty, 'Reorder Point': item.reorderPoint, 'Lead Time': item.leadTime, Supplier: item.supplier, Criticality: item.criticality, Status: item.status, Actions: <RowActions labels={['Reserve', 'Issue', 'Request PO']} /> })); }
function costRows() { return costRecords.map((item) => ({ 'Cost ID': item.id, 'Work Order': item.workOrder, Asset: item.asset, 'Cost Type': item.type, Amount: formatCurrency(item.amount, maintenanceCompany.currency), Date: item.date, Owner: item.owner, Status: item.status })); }
function assetHealthRows() { return assetHealthRecords.map((item) => ({ Asset: item.asset, Plant: item.plant, Line: item.line, 'Health Score': `${item.healthScore}%`, 'Availability %': `${item.availability}%`, MTTR: `${item.mttr} hrs`, MTBF: `${item.mtbf} hrs`, 'Breakdown Count': item.breakdownCount, 'Last Maintenance': item.lastMaintenance, 'Next Maintenance': item.nextMaintenance, 'Risk Status': item.riskStatus })); }
function auditRows() { return auditEntries.map((item) => ({ Timestamp: item.timestamp, User: item.user, Action: item.action, 'Maintenance Area': item.area, 'Reference ID': item.referenceId, 'Previous Value': item.previousValue, 'New Value': item.newValue, Reason: item.reason })); }

function costByType() {
  return Object.values(costRecords.reduce<Record<string, { name: string; amount: number }>>((acc, item) => {
    acc[item.type] = acc[item.type] ?? { name: item.type, amount: 0 };
    acc[item.type].amount += item.amount;
    return acc;
  }, {}));
}

function riskByType() {
  return Object.values(workOrders.reduce<Record<string, { name: string; count: number }>>((acc, item) => {
    acc[item.type] = acc[item.type] ?? { name: item.type, count: 0 };
    if (!['Completed', 'Closed'].includes(item.status)) acc[item.type].count += 1;
    return acc;
  }, {}));
}
