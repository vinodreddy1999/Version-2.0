import { ArrowRightLeft, BarChart3, ClipboardCheck, FileText, History, PackageCheck, PackagePlus, Search, ShieldCheck, Truck, Users, Warehouse } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { LazyBarChart, LazyLineChart } from '../components/LazyCharts';
import { ModuleFilterSelect } from '../components/ModuleFilterSelect';
import { ModuleNavigationTabs } from '../components/ModuleNavigationTabs';
import { Panel } from '../components/Panel';
import { ReportExportButtons } from '../components/ReportExportButtons';
import { RowActions } from '../components/RowActions';
import { ScrollableTableFrame } from '../components/ScrollableTableFrame';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { applyModuleFilters, type ModuleFilterValues } from '../lib/moduleFilters';
import { getUserDataScope, scopeFilterDefaults, scopeOptions } from '../lib/rbac';
import { usePlatform } from '../platform/PlatformContext';
import type { RuntimeUser } from '../types';
import {
  auditEntries,
  cycleCounts,
  dispatchRecords,
  internalMovements,
  laborRecords,
  packingRecords,
  pickingTasks,
  putawayTasks,
  receivingRecords,
  utilizationRecords,
  warehouseBins,
  warehouseCompany,
  warehouseReports,
} from '../warehouse/data';

type WarehouseSection = 'dashboard' | 'receiving' | 'putaway' | 'bins' | 'picking' | 'packing' | 'dispatch' | 'movements' | 'cycle-counts' | 'utilization' | 'labor' | 'reports' | 'audit';
type TableRow = Record<string, string | number | ReactNode>;

const warehouseNav: Array<{ section: WarehouseSection; label: string; path: string; icon: typeof Warehouse }> = [
  { section: 'dashboard', label: 'Warehouse Dashboard', path: '/warehouse', icon: Warehouse },
  { section: 'receiving', label: 'Receiving', path: '/warehouse/receiving', icon: PackagePlus },
  { section: 'putaway', label: 'Putaway', path: '/warehouse/putaway', icon: PackageCheck },
  { section: 'bins', label: 'Bin Management', path: '/warehouse/bins', icon: Warehouse },
  { section: 'picking', label: 'Picking', path: '/warehouse/picking', icon: ClipboardCheck },
  { section: 'packing', label: 'Packing', path: '/warehouse/packing', icon: PackageCheck },
  { section: 'dispatch', label: 'Dispatch', path: '/warehouse/dispatch', icon: Truck },
  { section: 'movements', label: 'Internal Movements', path: '/warehouse/movements', icon: ArrowRightLeft },
  { section: 'cycle-counts', label: 'Cycle Counts', path: '/warehouse/cycle-counts', icon: ShieldCheck },
  { section: 'utilization', label: 'Warehouse Utilization', path: '/warehouse/utilization', icon: BarChart3 },
  { section: 'labor', label: 'Warehouse Labor', path: '/warehouse/labor', icon: Users },
  { section: 'reports', label: 'Warehouse Reports', path: '/warehouse/reports', icon: FileText },
  { section: 'audit', label: 'Warehouse Audit', path: '/warehouse/audit', icon: History },
];

const sectionByPath = Object.fromEntries(warehouseNav.map((item) => [item.path, item.section])) as Record<string, WarehouseSection>;

export function WarehouseModulePage({ user }: { user: RuntimeUser }) {
  void user;
  const { selectedClient, platformUser } = usePlatform();
  const location = useLocation();
  const section = sectionByPath[location.pathname] ?? 'dashboard';
  const warehouseAllowed = platformUser.assignedModules.includes('Warehouse') && (!selectedClient || selectedClient.enabledModules.includes('Warehouse'));

  if (!warehouseAllowed) {
    return (
      <Panel title="Warehouse is not enabled" description="Your role, company, or assigned module list does not include Warehouse.">
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Warehouse requires tenant, company, role, and user assignment before the Company Admin view is visible.
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <ModuleNavigationTabs items={warehouseNav} dashboardPath="/warehouse" />
      <WarehouseSectionContent section={section} />
    </div>
  );
}

function WarehouseSectionContent({ section }: { section: WarehouseSection }) {
  if (section === 'dashboard') return <WarehouseDashboard />;
  if (section === 'receiving') return <WarehouseRegister title="Receiving" description="Inbound receipts from purchase orders, production receipts, transfers, and customer returns." rows={receivingRows()} searchKeys={['Receipt ID', 'Source Reference', 'Supplier / Source', 'Item']} action="Create Receipt" />;
  if (section === 'putaway') return <WarehouseRegister title="Putaway" description="Move received inventory into storage zones, racks, shelves, and bins." rows={putawayRows()} searchKeys={['Putaway Task ID', 'Receipt ID', 'Item', 'Suggested Bin']} action="Create Putaway Task" />;
  if (section === 'bins') return <WarehouseRegister title="Bin Management" description="Manage exact storage hierarchy, occupancy, capacity, and location availability." rows={binRows()} searchKeys={['Bin ID', 'Warehouse', 'Zone', 'Bin Code', 'Storage Type']} action="Create Bin" />;
  if (section === 'picking') return <WarehouseRegister title="Picking" description="Pick inventory for sales, production, maintenance, and transfer demand." rows={pickingRows()} searchKeys={['Pick Task ID', 'Source Reference', 'Item', 'Picker']} action="Create Pick Task" />;
  if (section === 'packing') return <WarehouseRegister title="Packing" description="Pack picked inventory, validate package details, and create dispatch-ready records." rows={packingRows()} searchKeys={['Packing ID', 'Pick Task ID', 'Order / Source Reference', 'Packed By']} action="Create Packing Record" />;
  if (section === 'dispatch') return <WarehouseRegister title="Dispatch" description="Dispatch packed goods to customers, plants, warehouses, departments, and production lines." rows={dispatchRows()} searchKeys={['Dispatch ID', 'Destination', 'Source Reference', 'Carrier', 'Vehicle']} action="Create Dispatch" />;
  if (section === 'movements') return <WarehouseRegister title="Internal Movements" description="Track bin-to-bin, zone-to-zone, warehouse, replenishment, and quality-hold movement." rows={movementRows()} searchKeys={['Movement ID', 'Item', 'From Location', 'To Location']} action="Create Movement" />;
  if (section === 'cycle-counts') return <WarehouseRegister title="Cycle Counts" description="Verify bin and location accuracy, capture variance, and prepare inventory corrections." rows={cycleRows()} searchKeys={['Count ID', 'Bin', 'Item', 'Counted By']} action="Create Count" />;
  if (section === 'utilization') return <UtilizationPanel />;
  if (section === 'labor') return <LaborPanel />;
  if (section === 'reports') return <ReportsPanel />;
  return <WarehouseRegister title="Warehouse Audit" description="Business-friendly audit history for warehouse execution changes." rows={auditRows()} searchKeys={['Timestamp', 'User', 'Action', 'Warehouse Area', 'Reference ID']} action="Export Audit" />;
}

const warehouseCategoryOptions = ['Finished Goods', 'Raw Material', 'Spare Parts', 'Consumables'];
const warehouseOwnerOptions = ['Receiving Lead', 'Putaway Lead', 'Picking Lead', 'Dispatch Lead', 'Company Admin', 'FG Supervisor', 'Quality Receiver', 'Transfer Desk'];

function itemCategory(item: string) {
  if (['Chocolate Cake', 'Vanilla Cake', 'Plastic Container'].includes(item)) return 'Finished Goods';
  if (item === 'Industrial Component') return 'Spare Parts';
  if (['Sugar', 'Flour', 'Milk Powder', 'Plastic Resin', 'Packaging Film', 'Food Packaging Film'].includes(item)) return 'Raw Material';
  return 'Consumables';
}

function warehousePlantText(row: Record<string, unknown>) {
  return [row.warehouse, row.source, row.destination, row.from, row.to].filter(Boolean).join(' ');
}

const receivingFilterMap = {
  Plant: (row: (typeof receivingRecords)[number]) => warehousePlantText(row),
  Warehouse: 'warehouse' as const,
  Zone: 'warehouse' as const,
  Product: 'item' as const,
  Category: (row: (typeof receivingRecords)[number]) => itemCategory(row.item),
  Owner: 'owner' as const,
};

const putawayFilterMap = {
  Plant: (row: (typeof putawayTasks)[number]) => warehousePlantText(row),
  Warehouse: (row: (typeof putawayTasks)[number]) => receivingRecords.find((receipt) => receipt.id === row.receiptId)?.warehouse ?? '',
  Zone: 'suggestedZone' as const,
  Product: 'item' as const,
  Category: (row: (typeof putawayTasks)[number]) => itemCategory(row.item),
  Owner: 'assignedUser' as const,
};

const pickingFilterMap = {
  Plant: (row: (typeof pickingTasks)[number]) => warehousePlantText(row),
  Warehouse: 'warehouse' as const,
  Zone: 'bin' as const,
  Product: 'item' as const,
  Category: (row: (typeof pickingTasks)[number]) => itemCategory(row.item),
  Owner: 'picker' as const,
};

const dispatchFilterMap = {
  Plant: (row: (typeof dispatchRecords)[number]) => warehousePlantText(row),
  Warehouse: 'warehouse' as const,
  Zone: 'destination' as const,
  Product: 'sourceReference' as const,
  Category: () => '',
  Owner: () => '',
};

const utilizationFilterMap = {
  Plant: (row: (typeof utilizationRecords)[number]) => warehousePlantText(row),
  Warehouse: 'warehouse' as const,
  Zone: 'zone' as const,
  Product: () => '',
  Category: () => '',
  Owner: () => '',
};

const cycleCountFilterMap = {
  Plant: (row: (typeof cycleCounts)[number]) => warehousePlantText(row),
  Warehouse: 'warehouse' as const,
  Zone: 'zone' as const,
  Product: 'item' as const,
  Category: (row: (typeof cycleCounts)[number]) => itemCategory(row.item),
  Owner: 'countedBy' as const,
};

function WarehouseDashboard() {
  const { platformUser } = usePlatform();
  const [filters, setFilters] = useState<ModuleFilterValues>(() => scopeFilterDefaults(userFromPlatform(platformUser), platformUser));
  const filteredReceiving = useMemo(
    () => applyModuleFilters(receivingRecords, filters, receivingFilterMap),
    [filters],
  );
  const filteredPutaway = useMemo(
    () => applyModuleFilters(putawayTasks, filters, putawayFilterMap),
    [filters],
  );
  const filteredPicking = useMemo(
    () => applyModuleFilters(pickingTasks, filters, pickingFilterMap),
    [filters],
  );
  const filteredDispatch = useMemo(
    () => applyModuleFilters(dispatchRecords, filters, dispatchFilterMap),
    [filters],
  );
  const filteredUtilization = useMemo(
    () => applyModuleFilters(utilizationRecords, filters, utilizationFilterMap),
    [filters],
  );
  const filteredCycleCounts = useMemo(
    () => applyModuleFilters(cycleCounts, filters, cycleCountFilterMap),
    [filters],
  );
  const filteredMovements = useMemo(
    () => applyModuleFilters(internalMovements, filters, {
      Plant: (row) => warehousePlantText(row),
      Warehouse: (row) => `${row.from} ${row.to}`,
      Zone: (row) => `${row.from} ${row.to}`,
      Product: 'item' as const,
      Category: (row) => itemCategory(row.item),
      Owner: 'movedBy' as const,
    }),
    [filters],
  );

  const pendingReceipts = filteredReceiving.filter((item) => item.pendingQty > 0).length;
  const pendingPutaway = filteredPutaway.filter((item) => !['Completed'].includes(item.status)).length;
  const dispatchReady = filteredDispatch.filter((item) => item.status === 'Ready').length;
  const openTasks = [...filteredPutaway, ...filteredPicking, ...filteredMovements].filter((item) => !['Completed', 'Received', 'Delivered', 'Dispatched'].includes(item.status)).length;
  const avgUtilization = filteredUtilization.length
    ? Math.round(filteredUtilization.reduce((sum, item) => sum + item.utilization, 0) / filteredUtilization.length)
    : 0;
  const avgCycleAccuracy = filteredCycleCounts.length
    ? Math.round((filteredCycleCounts.filter((item) => item.variance === 0).length / filteredCycleCounts.length) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Pending Receipts" value={pendingReceipts} helper="Inbound records with pending qty" accent="amber" />
        <StatCard label="Pending Putaway" value={pendingPutaway} helper="Open storage tasks" accent="amber" />
        <StatCard label="Picking Accuracy" value="97.6%" helper="Task weighted" accent="emerald" />
        <StatCard label="Packing Accuracy" value="98.3%" helper="Package validation" accent="emerald" />
        <StatCard label="Dispatch Readiness" value={dispatchReady} helper="Ready outbound loads" accent="blue" />
        <StatCard label="Warehouse Utilization" value={`${avgUtilization}%`} helper="Average occupied space" accent={avgUtilization > 85 ? 'amber' : 'emerald'} />
        <StatCard label="Bin Utilization" value="82%" helper="Occupied bin capacity" accent="blue" />
        <StatCard label="Cycle Count Accuracy" value={`${avgCycleAccuracy}%`} helper="Zero-variance locations" accent="emerald" />
        <StatCard label="Open Warehouse Tasks" value={openTasks} helper="Putaway, picks, moves" accent="violet" />
        <StatCard label="Warehouse Health Score" value="88%" helper="Risk adjusted score" accent="emerald" />
      </div>
      <WarehouseFilters filters={filters} onChange={setFilters} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Receiving Status" description="Expected, received, pending, and delayed inbound quantities."><WarehouseBarChart data={receivingStatusChart(filteredReceiving)} bars={['received', 'pending', 'delayed']} /></Panel>
        <Panel title="Putaway Queue" description="Open putaway tasks by receipt, item, suggested bin, and priority."><WarehouseDataTable rows={putawayRows(filteredPutaway).filter((row) => row.Status !== 'Completed')} /></Panel>
        <Panel title="Bin Utilization" description="Capacity, occupied space, available space, and utilization by zone."><WarehouseBarChart data={filteredUtilization.map((item) => ({ name: item.zone, occupied: item.occupied, available: item.available }))} bars={['occupied', 'available']} /></Panel>
        <Panel title="Picking Performance" description="Pick task accuracy and status by order and picker."><WarehouseDataTable rows={pickingRows(filteredPicking).slice(0, 6)} /></Panel>
        <Panel title="Dispatch Readiness" description="Packed and pending items by dispatch date."><WarehouseDataTable rows={dispatchRows(filteredDispatch).slice(0, 6)} /></Panel>
        <Panel title="Warehouse Performance Trend" description="Handling time and readiness trend."><WarehouseLineChart data={[{ name: 'Jan', value: 70 }, { name: 'Feb', value: 74 }, { name: 'Mar', value: 79 }, { name: 'Apr', value: 83 }, { name: 'May', value: 86 }, { name: 'Jun', value: 88 }]} /></Panel>
      </div>
    </div>
  );
}

function WarehouseRegister({ title, description, rows, searchKeys, action }: { title: string; description: string; rows: TableRow[]; searchKeys: string[]; action: string }) {
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
      <WarehouseFilters compact />
      <Panel title={title} description={description} action={<button className="form-button-primary" onClick={() => setDrawer(true)}>{action}</button>}>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="form-input w-full pl-10" placeholder={`Search ${searchKeys.join(', ').toLowerCase()}...`} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['Open', 'Pending', 'In Progress', 'Completed', 'Received', 'Packed', 'Ready', 'Warning', 'Critical', 'Review', 'Blocked'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="form-button-subtle" onClick={() => { setSearch(''); setStatus(''); }}>Clear</button>
        </div>
        <WarehouseDataTable rows={filteredRows} />
      </Panel>
      {drawer ? <WarehouseFormDrawer title={action} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function UtilizationPanel() {
  const totalCapacity = utilizationRecords.reduce((sum, item) => sum + item.capacity, 0);
  const occupied = utilizationRecords.reduce((sum, item) => sum + item.occupied, 0);
  const available = utilizationRecords.reduce((sum, item) => sum + item.available, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total Capacity" value={totalCapacity.toLocaleString()} helper="Warehouse capacity units" accent="blue" />
        <StatCard label="Occupied Capacity" value={occupied.toLocaleString()} helper="Stored volume" accent="emerald" />
        <StatCard label="Available Capacity" value={available.toLocaleString()} helper="Open space" accent="blue" />
        <StatCard label="Overloaded Bins" value={warehouseBins.filter((item) => item.utilization > 95).length} helper="Critical capacity risk" accent="amber" />
      </div>
      <Panel title="Warehouse Utilization" description="Measure warehouse space efficiency, overcapacity risk, and optimization opportunities.">
        <WarehouseBarChart data={utilizationRecords.map((item) => ({ name: item.zone, utilization: item.utilization, available: item.available }))} bars={['utilization', 'available']} />
        <div className="mt-5"><WarehouseDataTable rows={utilizationRows()} /></div>
      </Panel>
    </div>
  );
}

function LaborPanel() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Tasks Assigned" value={laborRecords.reduce((sum, item) => sum + item.assignedTasks, 0)} helper="Current shift workload" accent="violet" />
        <StatCard label="Tasks Completed" value={laborRecords.reduce((sum, item) => sum + item.completedTasks, 0)} helper="Closed by warehouse team" accent="emerald" />
        <StatCard label="Average Accuracy" value="97.2%" helper="User weighted accuracy" accent="emerald" />
      </div>
      <Panel title="Warehouse Labor Productivity" description="Workload, completion time, task progress, and accuracy by warehouse user.">
        <WarehouseBarChart data={laborRecords.map((item) => ({ name: item.user, assigned: item.assignedTasks, completed: item.completedTasks, pending: item.pendingTasks }))} bars={['assigned', 'completed', 'pending']} />
        <div className="mt-5"><WarehouseDataTable rows={laborRows()} /></div>
      </Panel>
    </div>
  );
}

function ReportsPanel() {
  return (
    <div className="space-y-5">
      <WarehouseFilters />
      <Panel title="Warehouse Reports" description="Preview and export warehouse reports as PDF, Excel, or CSV.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {warehouseReports.map((report) => (
            <div key={report} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="font-medium text-white">{report}</p>
              <p className="mt-2 text-sm text-slate-400">Company-scoped report for ABC Manufacturing.</p>
              <ReportExportButtons reportName={report} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function WarehouseDataTable({ rows }: { rows: TableRow[] }) {
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
            <tr key={String(Object.values(row)[0] ?? index)} className="border-b border-white/10 hover:bg-white/[0.04]">
              {headers.map((header) => <td key={header} className="px-3 py-3 text-slate-300">{header === 'Status' && typeof row[header] === 'string' ? <StatusBadge status={String(row[header])} /> : row[header]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableFrame>
  );
}

function WarehouseFilters({
  compact = false,
  filters = {},
  onChange,
}: {
  compact?: boolean;
  filters?: ModuleFilterValues;
  onChange?: (next: ModuleFilterValues) => void;
}) {
  const { platformUser } = usePlatform();
  const scope = getUserDataScope(userFromPlatform(platformUser), platformUser);
  function setFilter(key: string, value: string) {
    onChange?.({ ...filters, [key]: value });
  }

  return (
    <Panel title="Warehouse Filters" description="Company context is fixed. Filters refresh dashboard cards, charts, and tables below.">
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-4 xl:grid-cols-8' : 'md:grid-cols-4 xl:grid-cols-[repeat(8,minmax(0,1fr))_auto]'}`}>
        <ModuleFilterSelect label="Plant" options={scopeOptions(warehouseCompany.plants, scope.plant)} value={filters.Plant ?? scope.plant ?? ''} onChange={(value) => setFilter('Plant', value)} />
        <ModuleFilterSelect label="Warehouse" options={scopeOptions(warehouseCompany.warehouses, scope.warehouse)} value={filters.Warehouse ?? scope.warehouse ?? ''} onChange={(value) => setFilter('Warehouse', value)} />
        <ModuleFilterSelect label="Zone" options={warehouseCompany.zones} value={filters.Zone ?? ''} onChange={(value) => setFilter('Zone', value)} />
        <ModuleFilterSelect label="Bin" options={warehouseCompany.bins} value={filters.Bin ?? ''} onChange={(value) => setFilter('Bin', value)} />
        <ModuleFilterSelect label="Product" options={warehouseCompany.products} value={filters.Product ?? ''} onChange={(value) => setFilter('Product', value)} />
        <ModuleFilterSelect label="Category" options={warehouseCategoryOptions} value={filters.Category ?? ''} onChange={(value) => setFilter('Category', value)} />
        <Field label="Date Range"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
        <ModuleFilterSelect label="Owner" options={warehouseOwnerOptions} value={filters.Owner ?? ''} onChange={(value) => setFilter('Owner', value)} />
        {onChange ? <button type="button" className="form-button-subtle self-end" onClick={() => onChange(scopeFilterDefaults(userFromPlatform(platformUser), platformUser))}>Clear</button> : null}
      </div>
    </Panel>
  );
}

function userFromPlatform(platformUser?: { plant?: string; warehouse?: string; department?: string; assignedModules?: string[]; assignedApplications?: string[] }): RuntimeUser {
  return {
    id: 'scope',
    tenant_id: 'tenant',
    email: '',
    name: '',
    role: 'user',
    is_active: true,
    permissions: [],
    scope_plant_name: platformUser?.plant,
    scope_warehouse_name: platformUser?.warehouse,
    scope_department: platformUser?.department,
    assigned_modules: platformUser?.assignedModules,
    assigned_applications: platformUser?.assignedApplications,
  };
}

function WarehouseFormDrawer({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">Draft-only mock form. Warehouse confirmations still require human approval.</p>
          </div>
          <button className="form-button-subtle" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Warehouse"><select className="form-input mt-1 w-full">{warehouseCompany.warehouses.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Zone"><select className="form-input mt-1 w-full">{warehouseCompany.zones.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Item"><select className="form-input mt-1 w-full">{[...warehouseCompany.products, ...warehouseCompany.materials].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Status"><select className="form-input mt-1 w-full">{['Open', 'In Progress', 'Pending Approval', 'Completed', 'Blocked'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Quantity"><input className="form-input mt-1 w-full" min={0} type="number" defaultValue={0} /></Field>
          <Field label="Required Date"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
          <Field label="Business Reason" className="md:col-span-2"><textarea className="form-input mt-1 min-h-24 w-full" placeholder="Reason required before changing warehouse execution status" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="form-button-subtle" onClick={onClose}>Cancel</button>
          <button className="form-button-primary" onClick={onClose}>Save Draft</button>
        </div>
      </section>
    </div>
  );
}

function WarehouseBarChart({ data, bars }: { data: Array<Record<string, string | number>>; bars: string[] }) {
  return <LazyBarChart data={data} bars={bars} />;
}

function WarehouseLineChart({ data }: { data: Array<Record<string, string | number>> }) {
  return <LazyLineChart data={data} />;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`text-sm text-slate-300 ${className}`}>{label}{children}</label>;
}

function receivingStatusChart(source = receivingRecords) {
  return [
    { name: 'Expected', received: 0, pending: source.reduce((sum, item) => sum + item.expectedQty, 0), delayed: 0 },
    { name: 'Received', received: source.reduce((sum, item) => sum + item.receivedQty, 0), pending: 0, delayed: 0 },
    { name: 'Pending', received: 0, pending: source.reduce((sum, item) => sum + item.pendingQty, 0), delayed: 0 },
    { name: 'Delayed', received: 0, pending: 0, delayed: source.filter((item) => item.status === 'Delayed').reduce((sum, item) => sum + item.pendingQty, 0) },
  ];
}

function receivingRows(source = receivingRecords) { return source.map((item) => ({ 'Receipt ID': item.id, 'Source Type': item.sourceType, 'Source Reference': item.sourceReference, 'Supplier / Source': item.source, Warehouse: item.warehouse, Item: item.item, 'Expected Qty': item.expectedQty, 'Received Qty': item.receivedQty, 'Pending Qty': item.pendingQty, 'Received Date': item.receivedDate, Status: item.status, Owner: item.owner, Actions: <RowActions labels={['View Receipt', 'Confirm', 'Putaway']} recordId={item.id} recordTitle={item.item} recordDetails={{ ID: item.id, Item: item.item, Warehouse: item.warehouse, Source: item.source, Status: item.status }} /> })); }
function putawayRows(source = putawayTasks) { return source.map((item) => ({ 'Putaway Task ID': item.id, 'Receipt ID': item.receiptId, Item: item.item, Quantity: item.quantity, 'Suggested Zone': item.suggestedZone, 'Suggested Bin': item.suggestedBin, 'Assigned User': item.assignedUser, Priority: item.priority, 'Created Date': item.createdDate, 'Completed Date': item.completedDate, Status: item.status, Actions: <RowActions labels={['Assign', 'Confirm', 'Change Bin']} recordId={item.id} recordTitle={item.item} recordDetails={{ ID: item.id, Item: item.item, Zone: item.suggestedZone, Bin: item.suggestedBin, Status: item.status }} /> })); }
function binRows() { return warehouseBins.map((item) => ({ 'Bin ID': item.id, Warehouse: item.warehouse, Zone: item.zone, Aisle: item.aisle, Rack: item.rack, Shelf: item.shelf, 'Bin Code': item.binCode, Capacity: item.capacity, Occupied: item.occupied, Available: item.available, 'Utilization %': `${item.utilization}%`, 'Storage Type': item.storageType, Status: item.status, Actions: <RowActions labels={['View Contents', 'Move Stock', 'Disable']} /> })); }
function pickingRows(source = pickingTasks) { return source.map((item) => ({ 'Pick Task ID': item.id, 'Source Type': item.sourceType, 'Source Reference': item.sourceReference, Item: item.item, 'Required Qty': item.requiredQty, 'Picked Qty': item.pickedQty, Warehouse: item.warehouse, Bin: item.bin, Picker: item.picker, Priority: item.priority, 'Due Date': item.dueDate, Status: item.status, Actions: <RowActions labels={['Assign', 'Confirm', 'Short Pick']} recordId={item.id} recordTitle={item.item} recordDetails={{ ID: item.id, Item: item.item, Warehouse: item.warehouse, Bin: item.bin, Picker: item.picker, Status: item.status }} /> })); }
function packingRows() { return packingRecords.map((item) => ({ 'Packing ID': item.id, 'Pick Task ID': item.pickTaskId, 'Order / Source Reference': item.orderReference, 'Item Count': item.itemCount, 'Packed Qty': item.packedQty, 'Package Type': item.packageType, 'Packed By': item.packedBy, 'Packing Date': item.packingDate, Status: item.status, Actions: <RowActions labels={['Confirm', 'Print Label', 'View']} /> })); }
function dispatchRows(source = dispatchRecords) { return source.map((item) => ({ 'Dispatch ID': item.id, 'Destination Type': item.destinationType, Destination: item.destination, 'Source Reference': item.sourceReference, Warehouse: item.warehouse, 'Packed Items': item.packedItems, 'Dispatch Date': item.dispatchDate, Carrier: item.carrier, Vehicle: item.vehicle, Status: item.status, Actions: <RowActions labels={['Confirm', 'Track', 'Cancel']} recordId={item.id} recordTitle={item.destination} recordDetails={{ ID: item.id, Destination: item.destination, Warehouse: item.warehouse, Carrier: item.carrier, Status: item.status }} /> })); }
function movementRows() { return internalMovements.map((item) => ({ 'Movement ID': item.id, 'Movement Type': item.type, Item: item.item, Quantity: item.quantity, 'From Location': item.from, 'To Location': item.to, 'Moved By': item.movedBy, 'Movement Date': item.movementDate, Status: item.status, Actions: <RowActions labels={['Confirm', 'Cancel', 'Export']} /> })); }
function cycleRows() { return cycleCounts.map((item) => ({ 'Count ID': item.id, Warehouse: item.warehouse, Zone: item.zone, Bin: item.bin, Item: item.item, 'System Qty': item.systemQty, 'Counted Qty': item.countedQty, Variance: item.variance, 'Counted By': item.countedBy, 'Count Date': item.countDate, Status: item.status, Actions: <RowActions labels={['Submit', 'Approve Variance', 'Post']} /> })); }
function utilizationRows() { return utilizationRecords.map((item) => ({ Warehouse: item.warehouse, Zone: item.zone, Capacity: item.capacity, Occupied: item.occupied, Available: item.available, 'Utilization %': `${item.utilization}%`, Status: item.status })); }
function laborRows() { return laborRecords.map((item) => ({ User: item.user, Role: item.role, 'Assigned Tasks': item.assignedTasks, 'Completed Tasks': item.completedTasks, 'Pending Tasks': item.pendingTasks, 'Average Completion Time': item.avgCompletionTime, 'Accuracy %': `${item.accuracy}%`, Status: item.status })); }
function auditRows() { return auditEntries.map((item) => ({ Timestamp: item.timestamp, User: item.user, Action: item.action, 'Warehouse Area': item.area, 'Reference ID': item.referenceId, 'Previous Value': item.previousValue, 'New Value': item.newValue, Reason: item.reason })); }
