import { Archive, ArrowRightLeft, BarChart3, ClipboardCheck, FileText, History, PackageCheck, PackagePlus, Search, ShieldCheck, TimerReset, Warehouse } from 'lucide-react';
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
import { formatCurrency } from '../lib/format';
import { applyModuleFilters, type ModuleFilterValues } from '../lib/moduleFilters';
import { canAccessModule, canViewFinancialData, filterFinancialTableRows, type PermissionContext } from '../lib/rbac';
import { useDismissibleLayer } from '../lib/useDismissibleLayer';
import {
  adjustments,
  agingBuckets,
  cycleCounts,
  deadStock,
  goodsIssues,
  goodsReceipts,
  inventoryAudit,
  inventoryCompany,
  inventoryItems,
  inventoryReports,
  lots,
  physicalInventorySteps,
  reorderRules,
  serials,
  slowMoving,
  stockTransfers,
  valuationRows,
} from '../inventory/data';
import { usePlatform } from '../platform/PlatformContext';
import type { RuntimeUser } from '../types';

type InventorySection = 'dashboard' | 'overview' | 'receipts' | 'issues' | 'transfers' | 'adjustments' | 'cycle-counts' | 'physical' | 'aging' | 'dead-stock' | 'slow-moving' | 'reorder' | 'lots' | 'serials' | 'valuation' | 'audit' | 'reports';
type TableRow = Record<string, string | number | ReactNode>;

const inventoryNav: Array<{ section: InventorySection; label: string; path: string; icon: typeof Archive }> = [
  { section: 'dashboard', label: 'Inventory Dashboard', path: '/inventory', icon: Archive },
  { section: 'overview', label: 'Inventory Overview', path: '/inventory/overview', icon: Warehouse },
  { section: 'receipts', label: 'Goods Receipts', path: '/inventory/receipts', icon: PackagePlus },
  { section: 'issues', label: 'Goods Issues', path: '/inventory/issues', icon: PackageCheck },
  { section: 'transfers', label: 'Stock Transfers', path: '/inventory/transfers', icon: ArrowRightLeft },
  { section: 'adjustments', label: 'Inventory Adjustments', path: '/inventory/adjustments', icon: ClipboardCheck },
  { section: 'cycle-counts', label: 'Cycle Counts', path: '/inventory/cycle-counts', icon: ShieldCheck },
  { section: 'physical', label: 'Physical Inventory', path: '/inventory/physical', icon: ClipboardCheck },
  { section: 'aging', label: 'Inventory Aging', path: '/inventory/aging', icon: TimerReset },
  { section: 'dead-stock', label: 'Dead Stock', path: '/inventory/dead-stock', icon: Archive },
  { section: 'slow-moving', label: 'Slow Moving Stock', path: '/inventory/slow-moving', icon: TimerReset },
  { section: 'reorder', label: 'Reorder Management', path: '/inventory/reorder', icon: BarChart3 },
  { section: 'lots', label: 'Lot Management', path: '/inventory/lots', icon: History },
  { section: 'serials', label: 'Serial Tracking', path: '/inventory/serials', icon: History },
  { section: 'valuation', label: 'Inventory Valuation', path: '/inventory/valuation', icon: BarChart3 },
  { section: 'audit', label: 'Inventory Audit', path: '/inventory/audit', icon: ClipboardCheck },
  { section: 'reports', label: 'Inventory Reports', path: '/inventory/reports', icon: FileText },
];

const sectionByPath: Record<string, InventorySection> = Object.fromEntries(inventoryNav.map((item) => [item.path, item.section])) as Record<string, InventorySection>;

export function InventoryModulePage({ user }: { user: RuntimeUser }) {
  const { selectedClient, platformUser } = usePlatform();
  const location = useLocation();
  const section = sectionByPath[location.pathname] ?? 'dashboard';
  const accessContext = { user, selectedClient, platformUser };
  const inventoryAllowed = canAccessModule(accessContext, 'Inventory');
  const canViewFinancial = canViewFinancialData(accessContext);
  const allowedNav = canViewFinancial ? inventoryNav : inventoryNav.filter((item) => item.section !== 'valuation');

  if (!inventoryAllowed) {
    return (
      <Panel title="Inventory is not enabled" description="Your role, company, or assigned module list does not include Inventory.">
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">Inventory requires tenant, company, role, and user assignment before the Company Admin view is visible.</div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <ModuleNavigationTabs
        items={allowedNav}
        dashboardPath="/inventory"
        moduleName="Inventory"
        description={canViewFinancial ? 'Company-wide stock visibility, movement, valuation, traceability, aging, and replenishment risk.' : 'Company-wide stock visibility, movement, traceability, aging, and replenishment risk.'}
      />
      <InventorySectionContent section={section} accessContext={accessContext} />
    </div>
  );
}

function InventorySectionContent({ section, accessContext }: { section: InventorySection; accessContext: PermissionContext }) {
  const canViewFinancial = canViewFinancialData(accessContext);
  if (section === 'valuation' && !canViewFinancial) return <InventoryDashboard accessContext={accessContext} />;
  if (section === 'dashboard') return <InventoryDashboard accessContext={accessContext} />;
  if (section === 'overview') return <InventoryRegister accessContext={accessContext} title="Inventory Overview" description={canViewFinancial ? 'What inventory exists, where it exists, availability, reservation, and value.' : 'What inventory exists, where it exists, availability, reservation, and risk.'} rows={overviewRows()} searchKeys={['Item Code', 'Item Name', 'Warehouse', 'Category']} action="Create Inventory Item" />;
  if (section === 'receipts') return <InventoryRegister accessContext={accessContext} title="Goods Receipts" description={canViewFinancial ? 'Purchase, production, transfer, and return receipts that increase inventory and value.' : 'Purchase, production, transfer, and return receipts that increase inventory quantity.'} rows={receiptRows()} searchKeys={['Receipt Number', 'Supplier', 'PO Number', 'Item']} action="Create Receipt" />;
  if (section === 'issues') return <InventoryRegister accessContext={accessContext} title="Goods Issues" description="Production, maintenance, sales, sample, and scrap issues that reduce inventory." rows={issueRows()} searchKeys={['Issue Number', 'Warehouse', 'Department', 'Item']} action="Create Issue" />;
  if (section === 'transfers') return <InventoryRegister accessContext={accessContext} title="Stock Transfers" description="Warehouse, plant, and bin transfers with source and destination visibility." rows={transferRows()} searchKeys={['Transfer Number', 'Source', 'Destination', 'Item']} action="Create Transfer" />;
  if (section === 'adjustments') return <InventoryRegister accessContext={accessContext} title="Inventory Adjustments" description="Damage, loss, found stock, and audit corrections with approval workflow." rows={adjustmentRows()} searchKeys={['Adjustment Number', 'Reason', 'Item', 'Warehouse']} action="Create Adjustment" />;
  if (section === 'cycle-counts') return <InventoryRegister accessContext={accessContext} title="Cycle Counts" description="Cycle count variance, accuracy, and posting status." rows={cycleRows()} searchKeys={['Count Number', 'Warehouse', 'Item']} action="Create Count" />;
  if (section === 'physical') return <PhysicalInventory accessContext={accessContext} />;
  if (section === 'aging') return <InventoryRegister accessContext={accessContext} title="Inventory Aging" description={canViewFinancial ? 'Aging quantity and value by bucket.' : 'Aging quantity and risk by bucket.'} rows={agingRows()} searchKeys={['Bucket']} action="Export Aging" />;
  if (section === 'dead-stock') return <InventoryRegister accessContext={accessContext} title="Dead Stock" description="No movement for 180+ days." rows={deadStockRows()} searchKeys={['Item', 'Warehouse']} action="Create Disposal Review" />;
  if (section === 'slow-moving') return <InventoryRegister accessContext={accessContext} title="Slow Moving Inventory" description={canViewFinancial ? 'Low movement count, high coverage days, and trapped cash.' : 'Low movement count and high coverage days.'} rows={slowMovingRows()} searchKeys={['Item']} action="Create Optimization Action" />;
  if (section === 'reorder') return <InventoryRegister accessContext={accessContext} title="Reorder Management" description="Reorder points, safety stock, min/max, and stockout status." rows={reorderRows()} searchKeys={['Item', 'Status']} action="Create Reorder Draft" />;
  if (section === 'lots') return <InventoryRegister accessContext={accessContext} title="Lot Management" description="Lot number, manufacturing date, expiry date, quantity, and trace actions." rows={lotRows()} searchKeys={['Lot Number', 'Item', 'Status']} action="Create Lot" />;
  if (section === 'serials') return <InventoryRegister accessContext={accessContext} title="Serial Tracking" description="Serial-level status and movement history." rows={serialRows()} searchKeys={['Serial Number', 'Item', 'Warehouse', 'Status']} action="Create Serial" />;
  if (section === 'valuation') return <InventoryRegister accessContext={accessContext} title="Inventory Valuation" description="FIFO, LIFO, weighted average, standard cost, value, unit cost, and cost variance." rows={valuationTableRows()} searchKeys={['Item', 'Method']} action="Run Valuation" />;
  if (section === 'audit') return <InventoryRegister accessContext={accessContext} title="Inventory Audit" description={canViewFinancial ? 'Business-friendly audit history for stock and value changes.' : 'Business-friendly audit history for stock changes.'} rows={auditRows()} searchKeys={['Timestamp', 'User', 'Action', 'Item']} action="Export Audit" />;
  return <ReportsPanel accessContext={accessContext} />;
}

function InventoryDashboard({ accessContext }: { accessContext: PermissionContext }) {
  const canViewFinancial = canViewFinancialData(accessContext);
  const [filters, setFilters] = useState<ModuleFilterValues>({});
  const filteredItems = useMemo(
    () => applyModuleFilters(inventoryItems, filters, { Plant: 'plant', Warehouse: 'warehouse', Product: 'name', Category: 'category' }),
    [filters],
  );
  const filteredDeadStock = useMemo(
    () => deadStock.filter((item) => (!filters.Warehouse || item.warehouse === filters.Warehouse) && (!filters.Product || item.item === filters.Product)),
    [filters],
  );
  const filteredSlowMoving = useMemo(
    () => slowMoving.filter((item) => (!filters.Product || item.item === filters.Product)),
    [filters],
  );
  const filteredReorderRules = useMemo(
    () => reorderRules.filter((item) => !filters.Product || item.item === filters.Product),
    [filters],
  );
  const totalValue = filteredItems.reduce((sum, item) => sum + item.value, 0);
  const available = filteredItems.reduce((sum, item) => sum + item.availableQty, 0);
  const reserved = filteredItems.reduce((sum, item) => sum + item.reservedQty, 0);
  const totalQuantity = filteredItems.reduce((sum, item) => sum + item.availableQty + item.reservedQty + item.blockedQty + item.inTransitQty, 0);
  const deadValue = filteredDeadStock.reduce((sum, item) => sum + item.value, 0);
  const slowValue = filteredSlowMoving.reduce((sum, item) => sum + item.inventoryValue, 0);
  const stockoutRisk = filteredReorderRules.filter((item) => ['Critical', 'Stockout'].includes(item.status)).length;
  const coverageDays = filteredItems.length
    ? Math.round(filteredItems.reduce((sum, item) => sum + item.coverageDays, 0) / filteredItems.length)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {canViewFinancial ? <StatCard label="Total Inventory Value" value={formatCurrency(totalValue, inventoryCompany.currency)} helper="Filtered inventory value" accent="blue" /> : <StatCard label="Total Inventory Quantity" value={totalQuantity.toLocaleString()} helper="Filtered stock quantity" accent="blue" />}
        <StatCard label="Available Inventory" value={available.toLocaleString()} helper="Qty available" accent="emerald" />
        <StatCard label="Reserved Inventory" value={reserved.toLocaleString()} helper="Committed to demand" accent="amber" />
        <StatCard label="Inventory Accuracy" value="98.1%" helper="Cycle count weighted" accent="emerald" />
        <StatCard label="Coverage Days" value={coverageDays || '0'} helper="Filtered weighted coverage" accent="violet" />
        <StatCard label="Inventory Turns" value="8.4" helper="Annualized" accent="blue" />
        {canViewFinancial ? <StatCard label="Dead Stock Value" value={formatCurrency(deadValue, inventoryCompany.currency)} helper="No movement 180+ days" accent="amber" /> : <StatCard label="Dead Stock Items" value={filteredDeadStock.length} helper="No movement 180+ days" accent="amber" />}
        {canViewFinancial ? <StatCard label="Slow Moving Value" value={formatCurrency(slowValue, inventoryCompany.currency)} helper="Low movement stock" accent="amber" /> : <StatCard label="Slow Moving Items" value={filteredSlowMoving.length} helper="Low movement stock" accent="amber" />}
        <StatCard label="Stockout Risk" value={stockoutRisk} helper="Critical reorder items" accent="amber" />
        <StatCard label="Inventory Health Score" value="91%" helper="Risk adjusted" accent="emerald" />
      </div>
      <InventoryFilters filters={filters} onChange={setFilters} />
      <div className="grid gap-5 xl:grid-cols-2">
        {canViewFinancial ? <Panel title="Inventory Value Trend" description="Mock trend from inventory reduction and value optimization."><InventoryLineChart data={[{ name: 'Jan', value: 10000000 }, { name: 'Feb', value: 9400000 }, { name: 'Mar', value: 9100000 }, { name: 'Apr', value: 8700000 }, { name: 'May', value: 8300000 }, { name: 'Jun', value: 8000000 }]} /></Panel> : <Panel title="Inventory Quantity Trend" description="Operational stock quantity trend."><InventoryLineChart data={[{ name: 'Jan', value: 24500 }, { name: 'Feb', value: 23100 }, { name: 'Mar', value: 22200 }, { name: 'Apr', value: 21600 }, { name: 'May', value: 21150 }, { name: 'Jun', value: totalQuantity }]} /></Panel>}
        <Panel title={canViewFinancial ? 'Inventory by Warehouse' : 'Inventory Quantity by Warehouse'} description={canViewFinancial ? 'Current value by warehouse.' : 'Current quantity by warehouse.'}><InventoryBarChart data={canViewFinancial ? warehouseValueRows(filteredItems) : warehouseQuantityRows(filteredItems)} bars={[canViewFinancial ? 'value' : 'quantity']} /></Panel>
        <Panel title="Inventory Coverage" description="Coverage days by item."><InventoryBarChart data={filteredItems.slice(0, 8).map((item) => ({ name: item.name, coverage: item.coverageDays }))} bars={['coverage']} /></Panel>
        <Panel title="Stockout Risk" description="Items below reorder point or safety stock."><InventoryDataTable accessContext={accessContext} rows={reorderRows(filteredReorderRules).filter((row) => ['Critical', 'Stockout'].includes(String(row.Status)))} /></Panel>
        <Panel title="Dead Stock Summary" description="Items with no movement for 180+ days."><InventoryDataTable accessContext={accessContext} rows={deadStockRows(filteredDeadStock)} /></Panel>
        <Panel title="Slow Moving Inventory" description="Low movement count and high coverage days."><InventoryDataTable accessContext={accessContext} rows={slowMovingRows(filteredSlowMoving)} /></Panel>
      </div>
    </div>
  );
}

function InventoryRegister({ title, description, rows, searchKeys, action, accessContext }: { title: string; description: string; rows: TableRow[]; searchKeys: string[]; action: string; accessContext: PermissionContext }) {
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
      <Panel title={title} description={description} action={<button type="button" className="form-button-primary" onClick={() => setDrawer(true)}>{action}</button>}>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input className="form-input w-full pl-10" placeholder={`Search ${searchKeys.join(', ').toLowerCase()}...`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['Healthy', 'Warning', 'Critical', 'Review', 'Posted', 'Approved', 'Pending Approval', 'Dead Stock', 'Slow Moving'].map((item) => <option key={item}>{item}</option>)}</select>
          <button type="button" className="form-button-subtle" onClick={() => { setSearch(''); setStatus(''); }}>Clear</button>
        </div>
        <InventoryDataTable accessContext={accessContext} rows={filteredRows} />
      </Panel>
      {drawer ? <InventoryFormDrawer title={action} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function InventoryDataTable({ rows, accessContext }: { rows: TableRow[]; accessContext: PermissionContext }) {
  const visibleRows = filterFinancialTableRows(rows, accessContext);
  const headers = visibleRows[0] ? Object.keys(visibleRows[0]) : [];
  return (
    <ScrollableTableFrame count={visibleRows.length}>
      <table className="min-w-[1100px] w-full text-sm">
        <thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.08em] text-slate-500">{headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead>
        <tbody>{visibleRows.map((row, index) => <tr key={String(Object.values(row)[0] ?? index)} className="border-b border-white/10 hover:bg-white/[0.04]">{headers.map((header) => <td key={header} className="px-3 py-3 text-slate-300">{header === 'Status' && typeof row[header] === 'string' ? <StatusBadge status={String(row[header])} /> : row[header]}</td>)}</tr>)}</tbody>
      </table>
    </ScrollableTableFrame>
  );
}

function PhysicalInventory({ accessContext }: { accessContext: PermissionContext }) {
  return (
    <Panel title="Physical Inventory" description="Freeze, count, verify, approve, and post adjustments.">
      <div className="mb-5 grid gap-3 md:grid-cols-5">{physicalInventorySteps.map((step, index) => <div key={step.step} className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs text-slate-500">Step {index + 1}</p><p className="mt-1 font-medium text-white">{step.step}</p><p className="mt-2 text-sm text-slate-400">{step.owner}</p><div className="mt-3"><StatusBadge status={step.status} /></div></div>)}</div>
      <InventoryDataTable accessContext={accessContext} rows={physicalInventorySteps.map((step) => ({ Step: step.step, Owner: step.owner, Status: step.status, 'Completed On': step.completedOn }))} />
    </Panel>
  );
}

function ReportsPanel({ accessContext }: { accessContext: PermissionContext }) {
  const [filters, setFilters] = useState<ModuleFilterValues>({});
  const visibleReports = canViewFinancialData(accessContext) ? inventoryReports : inventoryReports.filter((report) => !isFinancialInventoryReport(report));
  return (
    <div className="space-y-5">
      <InventoryFilters filters={filters} onChange={setFilters} />
      <Panel title="Inventory Reports" description="Preview and export inventory reports as PDF, Excel, or CSV.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleReports.map((report) => (
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

function InventoryFilters({ filters, onChange }: { filters: ModuleFilterValues; onChange: (next: ModuleFilterValues) => void }) {
  function setFilter(key: string, value: string) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <Panel title="Inventory Filters" description="Company context is fixed. Filters refresh dashboard cards, charts, and tables below.">
      <div className="grid gap-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <ModuleFilterSelect label="Plant" options={inventoryCompany.plants} value={filters.Plant ?? ''} onChange={(value) => setFilter('Plant', value)} />
        <ModuleFilterSelect label="Warehouse" options={inventoryCompany.warehouses} value={filters.Warehouse ?? ''} onChange={(value) => setFilter('Warehouse', value)} />
        <ModuleFilterSelect label="Product" options={inventoryCompany.products} value={filters.Product ?? ''} onChange={(value) => setFilter('Product', value)} />
        <ModuleFilterSelect label="Category" options={inventoryCompany.categories} value={filters.Category ?? ''} onChange={(value) => setFilter('Category', value)} />
        <Field label="Date Range"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-06-24" /></Field>
        <button type="button" className="form-button-subtle self-end" onClick={() => onChange({})}>Clear Filters</button>
      </div>
    </Panel>
  );
}

function InventoryLineChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return <LazyLineChart data={data} />;
}

function InventoryBarChart({ data, bars }: { data: Array<Record<string, string | number>>; bars: string[] }) {
  return <LazyBarChart data={data} bars={bars} />;
}

function InventoryFormDrawer({ title, onClose }: { title: string; onClose: () => void }) {
  const drawerRef = useDismissibleLayer<HTMLElement>({
    open: true,
    onDismiss: onClose,
    lockBodyScroll: true,
    manageFocus: true,
  });
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-semibold text-white">{title}</h3><p className="text-sm text-slate-400">Draft-only mock form. Critical inventory actions require approval.</p></div><button type="button" className="form-button-subtle" onClick={onClose}>Close</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Item"><select className="form-input mt-1 w-full">{inventoryItems.map((item) => <option key={item.code}>{item.name}</option>)}</select></Field>
          <Field label="Warehouse"><select className="form-input mt-1 w-full">{inventoryCompany.warehouses.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Quantity"><input className="form-input mt-1 w-full" min={0} type="number" defaultValue={0} /></Field>
          <Field label="Reason"><select className="form-input mt-1 w-full">{['Production', 'Maintenance', 'Sales', 'Damage', 'Audit Correction'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Notes" className="md:col-span-2"><textarea className="form-input mt-1 min-h-24 w-full" placeholder="Business reason or inventory notes" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="form-button-subtle" onClick={onClose}>Cancel</button><button type="button" className="form-button-primary" onClick={onClose}>Save Draft</button></div>
      </section>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`text-sm text-slate-300 ${className}`}>{label}{children}</label>;
}

function overviewRows() { return inventoryItems.map((item) => ({ 'Item Code': item.code, 'Item Name': item.name, Category: item.category, Plant: item.plant, Warehouse: item.warehouse, 'Available Qty': item.availableQty, 'Reserved Qty': item.reservedQty, 'Blocked Qty': item.blockedQty, 'In Transit Qty': item.inTransitQty, UOM: item.uom, 'Inventory Value': formatCurrency(item.value, inventoryCompany.currency), Status: item.status, Actions: <RowActions labels={['View', 'History', 'Transfer', 'Reserve', 'Export']} recordId={item.code} recordTitle={item.name} recordDetails={{ Code: item.code, Name: item.name, Plant: item.plant, Warehouse: item.warehouse, Status: item.status }} /> })); }
function receiptRows() { return goodsReceipts.map((item) => ({ 'Receipt Number': item.receiptNo, Source: item.source, Supplier: item.supplier, 'PO Number': item.poNumber, Warehouse: item.warehouse, Item: item.item, Quantity: item.quantity, 'Lot Number': item.lotNumber, 'Expiry Date': item.expiryDate, 'Value Update': formatCurrency(item.valueUpdate, inventoryCompany.currency), Status: item.status, Actions: <RowActions recordId={item.receiptNo} recordTitle={item.item} recordDetails={{ Receipt: item.receiptNo, Item: item.item, Warehouse: item.warehouse, Status: item.status }} /> })); }
function issueRows() { return goodsIssues.map((item) => ({ 'Issue Number': item.issueNo, Type: item.type, Warehouse: item.warehouse, Department: item.department, Item: item.item, Quantity: item.quantity, Reason: item.reason, Status: item.status, Actions: <RowActions recordId={item.issueNo} recordTitle={item.item} recordDetails={{ Issue: item.issueNo, Item: item.item, Warehouse: item.warehouse, Status: item.status }} /> })); }
function transferRows() { return stockTransfers.map((item) => ({ 'Transfer Number': item.transferNo, Type: item.type, Source: item.source, Destination: item.destination, Item: item.item, Quantity: item.quantity, 'Transfer Date': item.transferDate, Status: item.status, Actions: <RowActions recordId={item.transferNo} recordTitle={item.item} recordDetails={{ Transfer: item.transferNo, Item: item.item, Status: item.status }} /> })); }
function adjustmentRows() { return adjustments.map((item) => ({ 'Adjustment Number': item.adjustmentNo, Reason: item.reason, Item: item.item, Warehouse: item.warehouse, Quantity: item.quantity, Workflow: item.workflow, Status: item.status, Actions: <RowActions labels={['View', 'Approve', 'Reject']} recordId={item.adjustmentNo} recordTitle={item.item} recordDetails={{ Adjustment: item.adjustmentNo, Item: item.item, Status: item.status }} /> })); }
function cycleRows() { return cycleCounts.map((item) => ({ 'Count Number': item.countNo, Warehouse: item.warehouse, Item: item.item, 'System Qty': item.systemQty, 'Counted Qty': item.countedQty, Variance: item.variance, 'Accuracy %': `${item.accuracy}%`, Status: item.status, Actions: <RowActions labels={['View', 'Post', 'Export']} recordId={item.countNo} recordTitle={item.item} recordDetails={{ Count: item.countNo, Item: item.item, Status: item.status }} /> })); }
function agingRows() { return agingBuckets.map((item) => ({ Bucket: item.bucket, 'Aging Quantity': item.quantity, 'Aging Value': formatCurrency(item.value, inventoryCompany.currency), Status: item.status })); }
function deadStockRows(source = deadStock) { return source.map((item) => ({ Item: item.item, Warehouse: item.warehouse, 'Last Movement Date': item.lastMovementDate, 'Days Since Movement': item.daysSinceMovement, Value: formatCurrency(item.value, inventoryCompany.currency), Status: item.status, Actions: <RowActions labels={['Review', 'Dispose', 'Transfer']} recordId={item.item} recordTitle={item.item} recordDetails={{ Item: item.item, Warehouse: item.warehouse, Status: item.status }} /> })); }
function slowMovingRows(source = slowMoving) { return source.map((item) => ({ Item: item.item, 'Movement Count': item.movementCount, 'Inventory Value': formatCurrency(item.inventoryValue, inventoryCompany.currency), 'Coverage Days': item.coverageDays, Status: item.status, Actions: <RowActions labels={['Review', 'Reduce', 'Transfer']} recordId={item.item} recordTitle={item.item} recordDetails={{ Item: item.item, Status: item.status }} /> })); }
function reorderRows(source = reorderRules) { return source.map((item) => ({ Item: item.item, 'Reorder Point': item.reorderPoint, 'Safety Stock': item.safetyStock, 'Minimum Stock': item.minimumStock, 'Maximum Stock': item.maximumStock, Status: item.status, Actions: <RowActions labels={['Create Draft', 'Approve', 'Export']} recordId={item.item} recordTitle={item.item} recordDetails={{ Item: item.item, Status: item.status }} /> })); }
function lotRows() { return lots.map((item) => ({ 'Lot Number': item.lotNumber, Item: item.item, 'Manufacturing Date': item.manufacturingDate, 'Expiry Date': item.expiryDate, Quantity: item.quantity, Status: item.status, Actions: <RowActions labels={['Trace Forward', 'Trace Backward', 'History']} recordId={item.lotNumber} recordTitle={item.item} recordDetails={{ Lot: item.lotNumber, Item: item.item, Status: item.status }} /> })); }
function serialRows() { return serials.map((item) => ({ 'Serial Number': item.serialNumber, Item: item.item, Warehouse: item.warehouse, Status: item.status, History: item.history, Actions: <RowActions labels={['View History', 'Transfer', 'Export']} recordId={item.serialNumber} recordTitle={item.item} recordDetails={{ Serial: item.serialNumber, Item: item.item, Status: item.status }} /> })); }
function valuationTableRows() { return valuationRows.map((item) => ({ Item: item.item, Method: item.method, 'Inventory Value': formatCurrency(item.inventoryValue, inventoryCompany.currency), 'Unit Cost': formatCurrency(item.unitCost, inventoryCompany.currency), 'Cost Variance %': `${item.costVariance}%`, Status: item.status, Actions: <RowActions labels={['View', 'Revalue', 'Export']} recordId={item.item} recordTitle={item.item} recordDetails={{ Item: item.item, Method: item.method, Status: item.status }} /> })); }
function auditRows() { return inventoryAudit.map((item) => ({ Timestamp: item.timestamp, User: item.user, Action: item.action, Item: item.item, 'Previous Value': item.previousValue, 'New Value': item.newValue })); }
function warehouseValueRows(source = inventoryItems) { return inventoryCompany.warehouses.map((warehouse) => ({ name: warehouse.replace(' Warehouse', ''), value: source.filter((item) => item.warehouse === warehouse).reduce((sum, item) => sum + item.value, 0) })); }
function warehouseQuantityRows(source = inventoryItems) { return inventoryCompany.warehouses.map((warehouse) => ({ name: warehouse.replace(' Warehouse', ''), quantity: source.filter((item) => item.warehouse === warehouse).reduce((sum, item) => sum + item.availableQty + item.reservedQty + item.blockedQty + item.inTransitQty, 0) })); }
function isFinancialInventoryReport(report: string) { return /value|valuation|cost|financial/i.test(report); }
