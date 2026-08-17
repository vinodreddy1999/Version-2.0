import { Activity, BarChart3, ClipboardCheck, Factory, FileText, Gauge, History, MonitorCog, Search, TimerReset, Users } from 'lucide-react';
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
import { usePlatform } from '../platform/PlatformContext';
import {
  auditEntries,
  downtimeRecords,
  lineRecords,
  machineRecords,
  oeeRecords,
  productionCompany,
  productionOrders,
  productionReports,
  schedules,
  scrapRecords,
  shiftRecords,
  workOrders,
  yieldRecords,
} from '../production/data';
import type { RuntimeUser } from '../types';

type ProductionSection = 'dashboard' | 'orders' | 'schedule' | 'work-orders' | 'shifts' | 'lines' | 'machines' | 'tracking' | 'downtime' | 'oee' | 'yield' | 'scrap' | 'reports' | 'audit';
type TableRow = Record<string, string | number | ReactNode>;

const productionNav: Array<{ section: ProductionSection; label: string; path: string; icon: typeof Factory }> = [
  { section: 'dashboard', label: 'Production Dashboard', path: '/production', icon: Factory },
  { section: 'orders', label: 'Production Orders', path: '/production/orders', icon: ClipboardCheck },
  { section: 'schedule', label: 'Production Schedule', path: '/production/schedule', icon: TimerReset },
  { section: 'work-orders', label: 'Work Orders', path: '/production/work-orders', icon: ClipboardCheck },
  { section: 'shifts', label: 'Shift Management', path: '/production/shifts', icon: Users },
  { section: 'lines', label: 'Production Lines', path: '/production/lines', icon: Factory },
  { section: 'machines', label: 'Machine Monitoring', path: '/production/machines', icon: MonitorCog },
  { section: 'tracking', label: 'Production Tracking', path: '/production/tracking', icon: Activity },
  { section: 'downtime', label: 'Downtime Management', path: '/production/downtime', icon: TimerReset },
  { section: 'oee', label: 'OEE Dashboard', path: '/production/oee', icon: Gauge },
  { section: 'yield', label: 'Yield Analysis', path: '/production/yield', icon: BarChart3 },
  { section: 'scrap', label: 'Scrap Analysis', path: '/production/scrap', icon: BarChart3 },
  { section: 'reports', label: 'Production Reports', path: '/production/reports', icon: FileText },
  { section: 'audit', label: 'Production Audit', path: '/production/audit', icon: History },
];

const sectionByPath = Object.fromEntries(productionNav.map((item) => [item.path, item.section])) as Record<string, ProductionSection>;

export function ProductionModulePage({ user }: { user: RuntimeUser }) {
  void user;
  const { selectedClient, platformUser } = usePlatform();
  const location = useLocation();
  const section = sectionByPath[location.pathname] ?? 'dashboard';
  const productionAllowed = platformUser.assignedModules.includes('Production') && (!selectedClient || selectedClient.enabledModules.includes('Production'));

  if (!productionAllowed) {
    return (
      <Panel title="Production is not enabled" description="Your role, company, or assigned module list does not include Production.">
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Production requires tenant, company, role, and user assignment before the Company Admin view is visible.
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <ModuleNavigationTabs items={productionNav} dashboardPath="/production" />
      <ProductionSectionContent section={section} />
    </div>
  );
}

function ProductionSectionContent({ section }: { section: ProductionSection }) {
  if (section === 'dashboard') return <ProductionDashboard />;
  if (section === 'orders') return <ProductionRegister title="Production Orders" description="Create, release, close, cancel, and monitor manufacturing orders." rows={orderRows()} searchKeys={['Production Order Number', 'Product', 'Plant', 'Line']} action="Create Order" />;
  if (section === 'schedule') return <ProductionRegister title="Production Schedule" description="Daily, weekly, and monthly manufacturing schedule control." rows={scheduleRows()} searchKeys={['Schedule ID', 'Production Order', 'Product', 'Line', 'Shift']} action="Create Schedule" />;
  if (section === 'work-orders') return <ProductionRegister title="Work Orders" description="Track production execution tasks, operators, work centers, and completion." rows={workOrderRows()} searchKeys={['Work Order ID', 'Production Order', 'Operation', 'Work Center', 'Operator']} action="Create Work Order" />;
  if (section === 'shifts') return <ProductionRegister title="Shift Management" description="Monitor shift productivity, efficiency, downtime, and performance ranking." rows={shiftRows()} searchKeys={['Shift', 'Line']} action="Create Shift Record" />;
  if (section === 'lines') return <ProductionRegister title="Production Lines" description="Measure line output, utilization, downtime, OEE, and ranking." rows={lineRows()} searchKeys={['Line']} action="Create Line Record" />;
  if (section === 'machines') return <ProductionRegister title="Machine Monitoring" description="Monitor runtime, downtime, availability, utilization, and machine OEE." rows={machineRows()} searchKeys={['Machine', 'Line']} action="Create Machine Record" />;
  if (section === 'tracking') return <ProductionRegister title="Production Tracking" description="Real-time plan, actual, remaining quantity, completion percent, and forecast." rows={trackingRows()} searchKeys={['Production Order', 'Product', 'Status']} action="Update Production Progress" />;
  if (section === 'downtime') return <DowntimePanel />;
  if (section === 'oee') return <OeePanel />;
  if (section === 'yield') return <ProductionRegister title="Yield Analysis" description="Input quantity, output quantity, yield percent, and yield loss." rows={yieldRows()} searchKeys={['Product', 'Status']} action="Create Yield Record" />;
  if (section === 'scrap') return <ProductionRegister title="Scrap Analysis" description="Scrap quantity, value, reason, cost trend, and reduction opportunities." rows={scrapRows()} searchKeys={['Product', 'Scrap Reason', 'Status']} action="Create Scrap Record" />;
  if (section === 'reports') return <ReportsPanel />;
  return <ProductionRegister title="Production Audit" description="Business-friendly audit history for production execution changes." rows={auditRows()} searchKeys={['Timestamp', 'User', 'Action', 'Entity']} action="Export Audit" />;
}

function ProductionDashboard() {
  const planned = productionOrders.reduce((sum, item) => sum + item.plannedQty, 0);
  const actual = productionOrders.reduce((sum, item) => sum + item.producedQty, 0);
  const downtime = downtimeRecords.reduce((sum, item) => sum + item.duration, 0);
  const oee = Math.round(oeeRecords[0].oee);
  const avgMachineUtilization = Math.round(machineRecords.reduce((sum, item) => sum + item.availability, 0) / machineRecords.length);
  const avgLineUtilization = Math.round(lineRecords.reduce((sum, item) => sum + item.utilization, 0) / lineRecords.length);
  const avgYield = Math.round(yieldRecords.reduce((sum, item) => sum + item.yield, 0) / yieldRecords.length);
  const totalScrapQty = scrapRecords.reduce((sum, item) => sum + item.scrapQty, 0);
  const achievement = Math.round((actual / planned) * 100);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Planned Production" value={planned.toLocaleString()} helper="Units planned" accent="blue" />
        <StatCard label="Actual Production" value={actual.toLocaleString()} helper="Units produced" accent="emerald" />
        <StatCard label="Production Achievement" value={`${achievement}%`} helper="Plan vs actual" accent={achievement >= 85 ? 'emerald' : 'amber'} />
        <StatCard label="OEE" value={`${oee}%`} helper="Availability x performance x quality" accent={oee >= 75 ? 'emerald' : 'amber'} />
        <StatCard label="Machine Utilization" value={`${avgMachineUtilization}%`} helper="Machine availability" accent="blue" />
        <StatCard label="Line Utilization" value={`${avgLineUtilization}%`} helper="Line utilization average" accent="blue" />
        <StatCard label="Downtime Hours" value={downtime.toFixed(1)} helper="Logged production loss" accent="amber" />
        <StatCard label="Yield" value={`${avgYield}%`} helper="Output vs input" accent="emerald" />
        <StatCard label="Scrap Qty" value={totalScrapQty.toLocaleString()} helper="Waste units" accent="amber" />
        <StatCard label="Production Health Score" value="86%" helper="Risk adjusted score" accent="emerald" />
      </div>
      <ProductionFilters />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Plan vs Actual Production" description="Planned and actual production by order."><ProductionBarChart data={productionOrders.slice(0, 7).map((item) => ({ name: item.orderNo, planned: item.plannedQty, actual: item.producedQty }))} bars={['planned', 'actual']} /></Panel>
        <Panel title="Production by Line" description="Actual output and OEE by line."><ProductionBarChart data={lineRecords.map((item) => ({ name: item.line, output: item.actualOutput, oee: item.oee }))} bars={['output', 'oee']} /></Panel>
        <Panel title="Production by Shift" description="Shift achievement and OEE."><ProductionBarChart data={shiftRecords.map((item) => ({ name: `${item.shift} ${item.line}`, achievement: item.achievement, oee: item.oee }))} bars={['achievement', 'oee']} /></Panel>
        <Panel title="OEE Trend" description="Manufacturing efficiency trend."><ProductionLineChart data={[{ name: 'Jan', value: 62 }, { name: 'Feb', value: 66 }, { name: 'Mar', value: 70 }, { name: 'Apr', value: 73 }, { name: 'May', value: 76 }, { name: 'Jun', value: 78 }]} /></Panel>
        <Panel title="Downtime Analysis" description="Downtime duration by cause."><ProductionBarChart data={downtimeByCause()} bars={['hours']} /></Panel>
        <Panel title="Yield and Scrap Analysis" description="Yield percent and scrap cost risk."><ProductionDataTable rows={[...yieldRows().slice(0, 4), ...scrapRows().slice(0, 4)]} /></Panel>
      </div>
    </div>
  );
}

function DowntimePanel() {
  const total = downtimeRecords.reduce((sum, item) => sum + item.duration, 0);
  const open = downtimeRecords.filter((item) => item.status === 'Open').length;
  const cost = Math.round(total * 18500);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Downtime" value={`${total.toFixed(1)} hrs`} helper="Across machines" accent="amber" />
        <StatCard label="Open Downtime" value={open} helper="Needs action" accent="amber" />
        <StatCard label="Downtime Cost" value={formatCurrency(cost, productionCompany.currency)} helper="Estimated cost" accent="violet" />
      </div>
      <Panel title="Downtime Management" description="Track production losses by machine, cause, duration, root cause, and status.">
        <ProductionBarChart data={downtimeByCause()} bars={['hours']} />
        <div className="mt-5"><ProductionDataTable rows={downtimeRows()} /></div>
      </Panel>
    </div>
  );
}

function OeePanel() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="OEE" value={`${oeeRecords[0].oee}%`} helper="Plant OEE" accent="emerald" />
        <StatCard label="Availability" value={`${oeeRecords[0].availability}%`} helper="Machine availability" accent="blue" />
        <StatCard label="Performance" value={`${oeeRecords[0].performance}%`} helper="Run speed" accent="blue" />
        <StatCard label="Quality" value={`${oeeRecords[0].quality}%`} helper="Good output" accent="emerald" />
      </div>
      <Panel title="OEE Dashboard" description="OEE equals availability multiplied by performance multiplied by quality.">
        <ProductionBarChart data={oeeRecords.map((item) => ({ name: item.name, availability: item.availability, performance: item.performance, quality: item.quality, oee: item.oee }))} bars={['availability', 'performance', 'quality', 'oee']} />
        <div className="mt-5"><ProductionDataTable rows={oeeRows()} /></div>
      </Panel>
    </div>
  );
}

function ProductionRegister({ title, description, rows, searchKeys, action }: { title: string; description: string; rows: TableRow[]; searchKeys: string[]; action: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [drawer, setDrawer] = useState(false);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const searchable = searchKeys.map((key) => String(row[key] ?? '')).join(' ').toLowerCase();
    const statusText = String(row.Status ?? '').toLowerCase();
    return (!search || searchable.includes(search.toLowerCase())) && (!status || statusText.includes(status.toLowerCase()));
  }), [rows, search, searchKeys, status]);

  return (
    <div className="space-y-5">
      <ProductionFilters compact />
      <Panel title={title} description={description} action={<button className="form-button-primary" onClick={() => setDrawer(true)}>{action}</button>}>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="form-input w-full pl-10" placeholder={`Search ${searchKeys.join(', ').toLowerCase()}...`} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['Draft', 'Released', 'In Progress', 'Completed', 'Closed', 'Cancelled', 'Running', 'Planned', 'Risk', 'Warning', 'Critical', 'Open'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="form-button-subtle" onClick={() => { setSearch(''); setStatus(''); }}>Clear</button>
        </div>
        <ProductionDataTable rows={filteredRows} />
      </Panel>
      {drawer ? <ProductionFormDrawer title={action} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function ProductionDataTable({ rows }: { rows: TableRow[] }) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <ScrollableTableFrame count={rows.length}>
      <table className="min-w-[1120px] w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
            {headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}:${String(Object.values(row)[0] ?? '')}`} className="border-b border-white/10 hover:bg-white/[0.04]">
              {headers.map((header) => <td key={header} className="px-3 py-3 text-slate-300">{header === 'Status' && typeof row[header] === 'string' ? <StatusBadge status={String(row[header])} /> : row[header]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableFrame>
  );
}

function ReportsPanel() {
  return (
    <div className="space-y-5">
      <ProductionFilters />
      <Panel title="Production Reports" description="Preview and export production reports as PDF, Excel, or CSV.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {productionReports.map((report) => (
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

function ProductionFilters({ compact = false }: { compact?: boolean }) {
  return (
    <Panel title="Production Filters" description="Company context is fixed. No client or company filter is shown for Company Admin.">
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-3 xl:grid-cols-6'}`}>
        <Filter label="Plant" options={productionCompany.plants} />
        <Filter label="Production Line" options={productionCompany.lines} />
        <Filter label="Machine" options={productionCompany.machines} />
        <Filter label="Product" options={productionCompany.products} />
        <Filter label="Shift" options={productionCompany.shifts} />
        <Field label="Date Range"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
      </div>
    </Panel>
  );
}

function ProductionFormDrawer({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">Draft-only mock form. Production actions still require human approval.</p>
          </div>
          <button className="form-button-subtle" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Product"><select className="form-input mt-1 w-full">{productionCompany.products.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Line"><select className="form-input mt-1 w-full">{productionCompany.lines.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Machine"><select className="form-input mt-1 w-full">{productionCompany.machines.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Shift"><select className="form-input mt-1 w-full">{productionCompany.shifts.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Planned Quantity"><input className="form-input mt-1 w-full" min={0} type="number" defaultValue={0} /></Field>
          <Field label="Production Date"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
          <Field label="Business Reason" className="md:col-span-2"><textarea className="form-input mt-1 min-h-24 w-full" placeholder="Reason required before changing production execution status" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="form-button-subtle" onClick={onClose}>Cancel</button>
          <button className="form-button-primary" onClick={onClose}>Save Draft</button>
        </div>
      </section>
    </div>
  );
}

function ProductionBarChart({ data, bars }: { data: Array<Record<string, string | number>>; bars: string[] }) {
  return <LazyBarChart data={data} bars={bars} />;
}

function ProductionLineChart({ data }: { data: Array<Record<string, string | number>> }) {
  return <LazyLineChart data={data} />;
}

function Filter({ label, options }: { label: string; options: string[] }) {
  return <label className="text-sm text-slate-300">{label}<select className="form-input mt-1 w-full"><option>All {label.toLowerCase()}</option>{options.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`text-sm text-slate-300 ${className}`}>{label}{children}</label>;
}

function orderRows() { return productionOrders.map((item) => ({ 'Production Order Number': item.orderNo, Product: item.product, 'Planned Quantity': item.plannedQty, 'Produced Quantity': item.producedQty, 'Remaining Quantity': item.plannedQty - item.producedQty, Plant: item.plant, Line: item.line, 'Start Date': item.startDate, 'End Date': item.endDate, Priority: item.priority, Status: item.status, Actions: <RowActions labels={['Edit', 'Release', 'Close']} /> })); }
function scheduleRows() { return schedules.map((item) => ({ 'Schedule ID': item.id, 'Production Order': item.productionOrder, Product: item.product, Line: item.line, Shift: item.shift, 'Planned Start': item.plannedStart, 'Planned End': item.plannedEnd, Status: item.status, Actions: <RowActions labels={['Daily', 'Weekly', 'Monthly']} /> })); }
function workOrderRows() { return workOrders.map((item) => ({ 'Work Order ID': item.id, 'Production Order': item.productionOrder, Operation: item.operation, 'Work Center': item.workCenter, Operator: item.operator, 'Planned Quantity': item.plannedQty, 'Actual Quantity': item.actualQty, Status: item.status, Actions: <RowActions labels={['Start', 'Complete', 'Reassign']} /> })); }
function shiftRows() { return shiftRecords.map((item) => ({ Shift: item.shift, Line: item.line, Operators: item.operators, 'Planned Qty': item.plannedQty, 'Actual Qty': item.actualQty, 'Achievement %': `${item.achievement}%`, Downtime: `${item.downtime} hrs`, OEE: `${item.oee}%`, Status: item.achievement >= 90 ? 'Healthy' : item.achievement > 0 ? 'Warning' : 'Planned' })); }
function lineRows() { return lineRecords.map((item) => ({ Line: item.line, 'Planned Output': item.plannedOutput, 'Actual Output': item.actualOutput, 'Utilization %': `${item.utilization}%`, Downtime: `${item.downtime} hrs`, OEE: `${item.oee}%`, Status: item.status })); }
function machineRows() { return machineRecords.map((item) => ({ Machine: item.machine, Line: item.line, Runtime: `${item.runtime} hrs`, Downtime: `${item.downtime} hrs`, Availability: `${item.availability}%`, OEE: `${item.oee}%`, Status: item.status })); }
function trackingRows() { return productionOrders.map((item) => ({ 'Production Order': item.orderNo, Product: item.product, 'Planned Qty': item.plannedQty, 'Produced Qty': item.producedQty, 'Remaining Qty': item.plannedQty - item.producedQty, 'Completion %': `${Math.round((item.producedQty / item.plannedQty) * 100)}%`, Status: item.status, Forecast: item.status === 'Completed' || item.status === 'Closed' ? 'Complete' : 'On schedule with current shift output' })); }
function downtimeRows() { return downtimeRecords.map((item) => ({ 'Downtime ID': item.id, Machine: item.machine, Line: item.line, 'Downtime Type': item.type, 'Start Time': item.startTime, 'End Time': item.endTime, Duration: `${item.duration} hrs`, 'Root Cause': item.rootCause, Status: item.status, Actions: <RowActions labels={['View RCA', 'Close', 'Export']} /> })); }
function oeeRows() { return oeeRecords.map((item) => ({ View: item.name, 'OEE %': `${item.oee}%`, 'Availability %': `${item.availability}%`, 'Performance %': `${item.performance}%`, 'Quality %': `${item.quality}%`, Status: item.status })); }
function yieldRows() { return yieldRecords.map((item) => ({ Product: item.product, 'Input Qty': item.inputQty, 'Output Qty': item.outputQty, 'Yield %': `${item.yield}%`, Status: item.status })); }
function scrapRows() { return scrapRecords.map((item) => ({ Product: item.product, 'Scrap Qty': item.scrapQty, 'Scrap Value': formatCurrency(item.scrapValue, productionCompany.currency), 'Scrap Reason': item.reason, Date: item.date, Status: item.status, Actions: <RowActions labels={['Review', 'Create CAPA', 'Export']} /> })); }
function auditRows() { return auditEntries.map((item) => ({ Timestamp: item.timestamp, User: item.user, Action: item.action, Entity: item.entity, 'Previous Value': item.previousValue, 'New Value': item.newValue, Reason: item.reason })); }

function downtimeByCause() {
  return Object.values(downtimeRecords.reduce<Record<string, { name: string; hours: number }>>((acc, item) => {
    acc[item.type] = acc[item.type] ?? { name: item.type, hours: 0 };
    acc[item.type].hours = Math.round((acc[item.type].hours + item.duration) * 10) / 10;
    return acc;
  }, {}));
}
