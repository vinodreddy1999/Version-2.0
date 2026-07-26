import { ClipboardCheck, Factory, FileText, Gauge, GitBranch, Hammer, PackageSearch, Search, ShoppingCart, UsersRound, Warehouse } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
import {
  approvals,
  auditEntries,
  capacityPlans,
  demandPlans,
  inventoryPlans,
  maintenancePlans,
  materialRequirements,
  planningCompany,
  planningFilters,
  procurementPlans,
  productionPlans,
  reports,
  scenarios,
  workforcePlans,
} from '../planning/data';
import type { RuntimeUser } from '../types';

type PlanningSection =
  | 'dashboard'
  | 'demand'
  | 'inventory'
  | 'production'
  | 'capacity'
  | 'materials'
  | 'procurement'
  | 'workforce'
  | 'maintenance'
  | 'scenarios'
  | 'approvals'
  | 'reports'
  | 'audit';

type TableRow = Record<string, string | number | ReactNode>;

const planningNav: Array<{ section: PlanningSection; label: string; path: string; icon: typeof Gauge }> = [
  { section: 'dashboard', label: 'Planning Dashboard', path: '/planning', icon: Gauge },
  { section: 'demand', label: 'Demand Planning', path: '/planning/demand', icon: Gauge },
  { section: 'inventory', label: 'Inventory Planning', path: '/planning/inventory', icon: Warehouse },
  { section: 'production', label: 'Production Planning', path: '/planning/production', icon: Factory },
  { section: 'capacity', label: 'Capacity Planning', path: '/planning/capacity', icon: Gauge },
  { section: 'materials', label: 'Material Planning', path: '/planning/materials', icon: PackageSearch },
  { section: 'procurement', label: 'Procurement Planning', path: '/planning/procurement', icon: ShoppingCart },
  { section: 'workforce', label: 'Workforce Planning', path: '/planning/workforce', icon: UsersRound },
  { section: 'maintenance', label: 'Maintenance Planning', path: '/planning/maintenance', icon: Hammer },
  { section: 'scenarios', label: 'Scenario Planning', path: '/planning/scenarios', icon: GitBranch },
  { section: 'approvals', label: 'Planning Approvals', path: '/planning/approvals', icon: ClipboardCheck },
  { section: 'reports', label: 'Planning Reports', path: '/planning/reports', icon: FileText },
  { section: 'audit', label: 'Planning Audit', path: '/planning/audit', icon: ClipboardCheck },
];

const sectionByPath: Record<string, PlanningSection> = {
  '/planning': 'dashboard',
  '/planning/demand': 'demand',
  '/planning/inventory': 'inventory',
  '/planning/production': 'production',
  '/planning/capacity': 'capacity',
  '/planning/materials': 'materials',
  '/planning/procurement': 'procurement',
  '/planning/workforce': 'workforce',
  '/planning/maintenance': 'maintenance',
  '/planning/scenarios': 'scenarios',
  '/planning/approvals': 'approvals',
  '/planning/reports': 'reports',
  '/planning/audit': 'audit',
};

export function PlanningModulePage({ user }: { user: RuntimeUser }) {
  const { selectedClient, platformUser } = usePlatform();
  const location = useLocation();
  const section = sectionByPath[location.pathname] ?? 'dashboard';
  const planningAllowed = platformUser.assignedModules.includes('Planning') && (!selectedClient || selectedClient.enabledModules.includes('Planning'));

  if (!planningAllowed) {
    return (
      <Panel title="Planning is not enabled" description="Your role, company, or assigned module list does not include Planning.">
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Planning requires tenant, company, role, and user assignment before the Company Admin view is visible.
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <ModuleNavigationTabs items={planningNav} dashboardPath="/planning" />
      <PlanningSectionContent section={section} user={user} />
    </div>
  );
}

function PlanningSectionContent({ section, user }: { section: PlanningSection; user: RuntimeUser }) {
  if (section === 'dashboard') return <PlanningDashboard />;
  if (section === 'demand') return <PlanRegister title="Demand Planning" description="Manage demand plans for ABC Manufacturing only." rows={demandRows()} searchKeys={['Demand Plan ID', 'Product', 'Customer', 'Owner']} action="Create Demand Plan" />;
  if (section === 'inventory') return <PlanRegister title="Inventory Planning" description="Target inventory, safety stock, reorder points, shortage risk, and excess inventory risk." rows={inventoryRows()} searchKeys={['Inventory Plan ID', 'Product', 'Plant', 'Warehouse', 'Owner']} action="Create Inventory Plan" extra={<InventoryWidgets />} />;
  if (section === 'production') return <PlanRegister title="Production Planning" description="Convert demand and inventory gaps into executable production plans." rows={productionRows()} searchKeys={['Production Plan ID', 'Product', 'Plant', 'Line', 'Owner']} action="Create Production Plan" extra={<ProductionWidgets />} />;
  if (section === 'capacity') return <PlanRegister title="Capacity Planning" description="Check whether plants, lines, machines, shifts, and labor can support the production plan." rows={capacityRows()} searchKeys={['Capacity Plan ID', 'Plant', 'Line', 'Work Center', 'Owner']} action="Create Capacity Plan" extra={<CapacityWidgets />} />;
  if (section === 'materials') return <PlanRegister title="Material Requirement Planning" description="Calculate material requirements from production plans and BOM demand." rows={materialRows()} searchKeys={['MRP ID', 'Material', 'Product', 'Supplier']} action="Create Material Plan" />;
  if (section === 'procurement') return <PlanRegister title="Procurement Planning" description="Convert material shortages into procurement plans and purchase schedules." rows={procurementRows()} searchKeys={['Procurement Plan ID', 'Material', 'Supplier', 'Owner']} action="Create Procurement Plan" />;
  if (section === 'workforce') return <PlanRegister title="Workforce Planning" description="Calculate workforce required to execute the production plan." rows={workforceRows()} searchKeys={['Workforce Plan ID', 'Plant', 'Line', 'Shift', 'Owner']} action="Create Workforce Plan" />;
  if (section === 'maintenance') return <PlanRegister title="Maintenance Planning" description="Align maintenance windows with production plan and asset availability." rows={maintenanceRows()} searchKeys={['Maintenance Plan ID', 'Asset', 'Plant', 'Line', 'Owner']} action="Create Maintenance Plan" />;
  if (section === 'scenarios') return <ScenarioPlanning />;
  if (section === 'approvals') return <ApprovalsPanel user={user} />;
  if (section === 'reports') return <ReportsPanel />;
  return <AuditPanel />;
}

const planningFilterFieldMap = {
  Plant: 'plant' as const,
  Warehouse: 'warehouse' as const,
  Product: 'product' as const,
  Category: (row: { product?: string }) => planningCategoryForProduct(row.product ?? ''),
  Planner: 'owner' as const,
  Status: 'status' as const,
};

function planningCategoryForProduct(product: string) {
  if (['Chocolate Cake', 'Vanilla Cake', 'Snack Pack'].includes(product)) return 'Finished Goods';
  if (['Sugar', 'Flour', 'Milk Powder', 'Packaging Film'].includes(product)) return 'Raw Material';
  if (product.toLowerCase().includes('line') || product.toLowerCase().includes('machine')) return 'Capacity';
  return 'Planning';
}

const materialFilterFieldMap = {
  Product: 'product' as const,
  Category: () => 'Raw Material',
  Status: 'status' as const,
};

function PlanningDashboard() {
  const navigate = useNavigate();
  const { platformUser } = usePlatform();
  const [filters, setFilters] = useState<ModuleFilterValues>(() => scopeFilterDefaults(userFromPlatform(platformUser), platformUser));
  const filteredDemand = useMemo(
    () => applyModuleFilters(demandPlans, filters, { Product: 'product', Category: planningFilterFieldMap.Category, Planner: 'owner', Status: 'status' }),
    [filters],
  );
  const filteredProduction = useMemo(
    () => applyModuleFilters(productionPlans, filters, planningFilterFieldMap),
    [filters],
  );
  const filteredCapacity = useMemo(
    () => applyModuleFilters(capacityPlans, filters, { Plant: 'plant', Planner: 'owner', Status: 'status' }),
    [filters],
  );
  const filteredMaterials = useMemo(
    () => applyModuleFilters(materialRequirements, filters, materialFilterFieldMap),
    [filters],
  );
  const filteredInventory = useMemo(
    () => applyModuleFilters(inventoryPlans, filters, planningFilterFieldMap),
    [filters],
  );
  const shortageCount = filteredMaterials.filter((item) => item.shortageQty > 0).length;
  const openRisks = [...filteredMaterials, ...filteredCapacity, ...workforcePlans, ...maintenancePlans].filter((item) => ['Critical', 'Warning', 'Review'].includes(item.status)).length;
  const totalDemand = filteredDemand.reduce((sum, item) => sum + item.forecastQty, 0);
  const plannedProduction = filteredProduction.reduce((sum, item) => sum + item.plannedProduction, 0);
  const coverageDays = filteredInventory.length
    ? Math.round(filteredInventory.reduce((sum, item) => sum + item.coverageDays, 0) / filteredInventory.length)
    : 0;
  const capacityUtilization = filteredCapacity.length
    ? Math.round(filteredCapacity.reduce((sum, item) => sum + item.utilization, 0) / filteredCapacity.length)
    : 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Forecast Demand" value={totalDemand.toLocaleString()} helper="Monthly demand quantity" accent="blue" />
        <StatCard label="Planned Production" value={plannedProduction.toLocaleString()} helper="Approved and draft plan" accent="emerald" />
        <StatCard label="Material Shortages" value={shortageCount} helper="Shortage rows requiring action" accent="amber" onClick={() => navigate('/planning/materials')} />
        <StatCard label="Inventory Coverage" value={`${coverageDays} days`} helper="Filtered weighted coverage" accent="violet" onClick={() => navigate('/planning/inventory')} />
        <StatCard label="Capacity Utilization" value={`${capacityUtilization}%`} helper="Across work centers" accent="amber" onClick={() => navigate('/planning/capacity')} />
        <StatCard label="Workforce Utilization" value="91%" helper="Shift labor utilization" accent="blue" onClick={() => navigate('/planning/workforce')} />
        <StatCard label="Open Planning Risks" value={openRisks} helper="Capacity, material, labor, maintenance" accent="amber" />
        <StatCard label="Planning Accuracy" value="91%" helper="Forecast versus actual orders" accent="emerald" />
      </div>
      <PlanningFilterSidebar filters={filters} onChange={setFilters} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Demand vs Production Plan" description="Demand quantity, planned production quantity, and gap." action={<button type="button" className="form-button-subtle" onClick={() => navigate('/planning/production')}>Open Production</button>}>
          <PlanningTrendChart data={filteredProduction.map((item) => ({ name: item.product, demand: item.forecastDemand, production: item.plannedProduction, gap: item.plannedProduction - item.forecastDemand }))} bars={['demand', 'production', 'gap']} />
        </Panel>
        <Panel title="Capacity Load" description="Available capacity, required capacity, and utilization." action={<button type="button" className="form-button-subtle" onClick={() => navigate('/planning/capacity')}>Open Capacity</button>}>
          <PlanningTrendChart data={filteredCapacity.map((item) => ({ name: item.workCenter, available: item.availableCapacity, required: item.requiredCapacity, utilization: item.utilization }))} bars={['available', 'required']} />
        </Panel>
        <Panel title="Material Shortage Summary" description="Materials short against production requirements." action={<button type="button" className="form-button-subtle" onClick={() => navigate('/planning/materials')}>Open Materials</button>}>
          <PlanningDataTable rows={materialRows(filteredMaterials).filter((row) => Number(row['Shortage Qty']) > 0)} />
        </Panel>
        <Panel title="Inventory Coverage" description="Current stock versus forecast demand and coverage days." action={<button type="button" className="form-button-subtle" onClick={() => navigate('/planning/inventory')}>Open Inventory</button>}>
          <PlanningDataTable rows={inventoryRows(filteredInventory)} />
        </Panel>
      </div>
      <Panel title="Planning Actions" description="Draft actions that require human approval before execution.">
        <PlanningDataTable rows={[
          { Action: 'Generate purchase requisition', Module: 'Procurement', Owner: 'Rohan Patel', Priority: 'High', 'Due Date': '2026-06-24', Status: <StatusBadge status="Pending Approval" /> },
          { Action: 'Resolve Line 2 capacity gap', Module: 'Capacity', Owner: 'Pavan Reddy', Priority: 'Critical', 'Due Date': '2026-06-25', Status: <StatusBadge status="Critical" /> },
          { Action: 'Move maintenance window', Module: 'Maintenance', Owner: 'Meera Iyer', Priority: 'High', 'Due Date': '2026-06-26', Status: <StatusBadge status="Review" /> },
          { Action: 'Approve cake demand plan', Module: 'Demand', Owner: 'Company Admin', Priority: 'Medium', 'Due Date': '2026-06-27', Status: <StatusBadge status="Pending Approval" /> },
        ]} />
      </Panel>
    </div>
  );
}

function PlanRegister({ title, description, rows, searchKeys, action, extra }: { title: string; description: string; rows: TableRow[]; searchKeys: string[]; action: string; extra?: ReactNode }) {
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
      <Panel title={title} description={description} action={<button className="form-button-primary" onClick={() => setDrawer(true)}>{action}</button>}>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="form-input w-full pl-10" placeholder={`Search ${searchKeys.join(', ').toLowerCase()}...`} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {planningFilters.statuses.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="form-button-subtle" onClick={() => { setSearch(''); setStatus(''); }}>Clear</button>
        </div>
        <PlanningDataTable rows={filteredRows} />
      </Panel>
      {extra}
      {drawer ? <PlanningFormDrawer title={action} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function ScenarioPlanning() {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="space-y-5">
      <Panel title="Scenario Planning" description="Run rule-based what-if scenarios. AI simulation is intentionally not enabled yet." action={<button className="form-button-primary" onClick={() => setDrawer(true)}>Create Scenario</button>}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((item) => <PlanningScenarioCard key={item.id} scenario={item} />)}
        </div>
      </Panel>
      {drawer ? <PlanningFormDrawer title="Create Scenario" onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function ApprovalsPanel({ user }: { user: RuntimeUser }) {
  const [notice, setNotice] = useState('');
  const rows = approvals.map((item) => ({
    'Approval ID': item.id,
    'Plan Type': item.type,
    'Plan ID': item.planId,
    'Requested By': item.requestedBy,
    Approver: item.approver,
    'Submitted Date': item.submittedDate,
    Status: <StatusBadge status={item.status} />,
    Comments: item.comments,
    Actions: (
      <div className="flex gap-2">
        {['Approve', 'Reject', 'Request Changes'].map((action) => <button key={action} className="form-button-subtle py-1 text-xs" onClick={() => setNotice(`${action} drafted by ${user.name}. Human confirmation is required before execution.`)}>{action}</button>)}
      </div>
    ),
  }));
  return <Panel title="Planning Approvals" description="Approve, reject, or request changes for company planning records.">{notice ? <div className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">{notice}</div> : null}<PlanningDataTable rows={rows} /></Panel>;
}

function ReportsPanel() {
  return (
    <div className="space-y-5">
      <PlanningFilterSidebar />
      <Panel title="Planning Reports" description="Preview and export planning reports by date, plant, warehouse, product, owner, and status.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <div key={report} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="font-medium text-white">{report}</p>
              <p className="mt-2 text-sm text-slate-400">Supports preview, PDF, Excel, and CSV export.</p>
              <ReportExportButtons reportName={report} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AuditPanel() {
  return <Panel title="Planning Audit" description="Business-friendly audit history without raw backend IDs."><PlanningDataTable rows={auditEntries.map((item) => ({ Timestamp: item.timestamp, User: item.user, Action: item.action, 'Plan Type': item.planType, 'Plan ID': item.planId, 'Previous Value': item.previousValue, 'New Value': item.newValue, Reason: item.reason }))} /></Panel>;
}

function PlanningFilterSidebar({ filters = {}, onChange }: { filters?: ModuleFilterValues; onChange?: (next: ModuleFilterValues) => void }) {
  const { platformUser } = usePlatform();
  const scope = getUserDataScope(userFromPlatform(platformUser), platformUser);
  function setFilter(key: string, value: string) {
    onChange?.({ ...filters, [key]: value });
  }

  return (
    <Panel title="Planning Filters" description="Company context is fixed. Filters refresh dashboard cards, charts, and tables below.">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
        <ModuleFilterSelect label="Plant" options={scopeOptions(planningFilters.plants, scope.plant)} value={filters.Plant ?? scope.plant ?? ''} onChange={(value) => setFilter('Plant', value)} />
        <ModuleFilterSelect label="Warehouse" options={scopeOptions(planningFilters.warehouses, scope.warehouse)} value={filters.Warehouse ?? scope.warehouse ?? ''} onChange={(value) => setFilter('Warehouse', value)} />
        <ModuleFilterSelect label="Product" options={planningFilters.products} value={filters.Product ?? ''} onChange={(value) => setFilter('Product', value)} />
        <ModuleFilterSelect label="Category" options={planningFilters.categories} value={filters.Category ?? ''} onChange={(value) => setFilter('Category', value)} />
        <ModuleFilterSelect label="Planner" options={planningFilters.planners} value={filters.Planner ?? ''} onChange={(value) => setFilter('Planner', value)} />
        <ModuleFilterSelect label="Status" options={planningFilters.statuses} value={filters.Status ?? ''} onChange={(value) => setFilter('Status', value)} />
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

function PlanningDataTable({ rows }: { rows: TableRow[] }) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <ScrollableTableFrame count={rows.length}>
      <table className="min-w-[1100px] w-full text-sm">
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

function PlanningTrendChart({ data, bars }: { data: Array<Record<string, string | number>>; bars: string[] }) {
  return <LazyBarChart data={data} bars={bars} showLegend />;
}

function PlanningLineChart({ data }: { data: Array<Record<string, string | number>> }) {
  return <LazyLineChart data={data} />;
}

function PlanningScenarioCard({ scenario }: { scenario: typeof scenarios[number] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{scenario.name}</p>
          <p className="mt-1 text-xs text-slate-500">{scenario.id} · {scenario.type}</p>
        </div>
        <StatusBadge status={scenario.status} />
      </div>
      <p className="mt-4 text-sm text-slate-300">{scenario.estimatedImpact}</p>
      <p className="mt-2 text-xs text-slate-500">{scenario.basePlan} · {scenario.impactArea} · {scenario.owner}</p>
      <div className="mt-4 flex gap-2">
        <button className="form-button-subtle py-1 text-xs">Run Scenario</button>
        <button className="form-button-subtle py-1 text-xs">Export</button>
      </div>
    </div>
  );
}

function PlanningFormDrawer({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">Draft-only mock form. Critical actions still require human approval.</p>
          </div>
          <button className="form-button-subtle" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Product"><select className="form-input mt-1 w-full">{planningCompany.products.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Owner"><select className="form-input mt-1 w-full">{planningFilters.planners.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Plant"><select className="form-input mt-1 w-full">{planningCompany.plants.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Status"><select className="form-input mt-1 w-full">{planningFilters.statuses.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Forecast Quantity"><input className="form-input mt-1 w-full" min={0} type="number" defaultValue={0} /></Field>
          <Field label="Required Date"><input className="form-input mt-1 w-full" type="date" defaultValue="2026-07-01" /></Field>
          <Field label="Notes" className="md:col-span-2"><textarea className="form-input mt-1 min-h-24 w-full" placeholder="Business reason or planning notes" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="form-button-subtle" onClick={onClose}>Cancel</button>
          <button className="form-button-primary" onClick={onClose}>Save Draft</button>
        </div>
      </section>
    </div>
  );
}

function InventoryWidgets() {
  return <Panel title="Inventory Coverage Chart" description="Coverage days by product."><PlanningLineChart data={inventoryPlans.map((item) => ({ name: item.product, value: item.coverageDays }))} /></Panel>;
}

function ProductionWidgets() {
  return <Panel title="Production Plan vs Demand" description="Required and planned production by product."><PlanningTrendChart data={productionPlans.map((item) => ({ name: item.product, required: item.requiredProduction, planned: item.plannedProduction }))} bars={['required', 'planned']} /></Panel>;
}

function CapacityWidgets() {
  return <Panel title="Overloaded Lines" description="Capacity utilization by work center."><PlanningTrendChart data={capacityPlans.map((item) => ({ name: item.workCenter, utilization: item.utilization }))} bars={['utilization']} /></Panel>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`text-sm text-slate-300 ${className}`}>{label}{children}</label>;
}

function demandRows() { return demandPlans.map((item) => ({ 'Demand Plan ID': item.id, Product: item.product, Customer: item.customer, Region: item.region, Market: item.market, 'Forecast Period': item.period, 'Forecast Qty': item.forecastQty, 'Confirmed Orders': item.confirmedOrders, Variance: item.variance, Status: item.status, Owner: item.owner, 'Last Updated': item.updated, Actions: <RowActions /> })); }
function inventoryRows(source = inventoryPlans) { return source.map((item) => ({ 'Inventory Plan ID': item.id, Product: item.product, Plant: item.plant, Warehouse: item.warehouse, 'Current Stock': item.currentStock, 'Forecast Demand': item.forecastDemand, 'Safety Stock': item.safetyStock, 'Reorder Point': item.reorderPoint, 'Target Stock': item.targetStock, 'Coverage Days': item.coverageDays, Status: item.status, Owner: item.owner, Actions: <RowActions recordId={item.id} recordTitle={item.product} recordDetails={{ ID: item.id, Product: item.product, Plant: item.plant, Warehouse: item.warehouse, Status: item.status }} /> })); }
function productionRows() { return productionPlans.map((item) => ({ 'Production Plan ID': item.id, Product: item.product, 'Forecast Demand': item.forecastDemand, 'Current Stock': item.currentStock, 'Required Production': item.requiredProduction, 'Planned Production': item.plannedProduction, Plant: item.plant, Line: item.line, 'Start Date': item.startDate, 'End Date': item.endDate, Status: item.status, Owner: item.owner, Actions: <RowActions /> })); }
function capacityRows() { return capacityPlans.map((item) => ({ 'Capacity Plan ID': item.id, Plant: item.plant, Line: item.line, 'Work Center': item.workCenter, 'Available Capacity': item.availableCapacity, 'Required Capacity': item.requiredCapacity, 'Utilization %': `${item.utilization}%`, 'Capacity Gap': item.capacityGap, Status: item.status, Owner: item.owner, Actions: <RowActions /> })); }
function materialRows(source = materialRequirements) { return source.map((item) => ({ 'MRP ID': item.id, Material: item.material, Product: item.product, 'Required Qty': item.requiredQty, 'Available Qty': item.availableQty, 'On Order Qty': item.onOrderQty, 'Shortage Qty': item.shortageQty, 'Required Date': item.requiredDate, Supplier: item.supplier, Status: item.status, Actions: <RowActions labels={['Create PR', 'View BOM', 'Export']} recordId={item.id} recordTitle={item.material} recordDetails={{ ID: item.id, Material: item.material, Product: item.product, Supplier: item.supplier, Status: item.status }} /> })); }
function procurementRows() { return procurementPlans.map((item) => ({ 'Procurement Plan ID': item.id, Material: item.material, Supplier: item.supplier, 'Required Qty': item.requiredQty, 'Purchase Qty': item.purchaseQty, 'Lead Time': `${item.leadTime} days`, 'Required Date': item.requiredDate, 'Suggested PO Date': item.suggestedPoDate, Status: item.status, Owner: item.owner, Actions: <RowActions labels={['Generate PR', 'Approve', 'Export']} /> })); }
function workforceRows() { return workforcePlans.map((item) => ({ 'Workforce Plan ID': item.id, Plant: item.plant, Line: item.line, Shift: item.shift, 'Required Workers': item.requiredWorkers, 'Available Workers': item.availableWorkers, Gap: item.gap, 'Overtime Hours': item.overtimeHours, Status: item.status, Owner: item.owner, Actions: <RowActions /> })); }
function maintenanceRows() { return maintenancePlans.map((item) => ({ 'Maintenance Plan ID': item.id, Asset: item.asset, Plant: item.plant, Line: item.line, 'Maintenance Type': item.type, 'Planned Date': item.plannedDate, 'Production Impact': item.productionImpact, 'Downtime Hours': item.downtimeHours, Status: item.status, Owner: item.owner, Actions: <RowActions /> })); }
