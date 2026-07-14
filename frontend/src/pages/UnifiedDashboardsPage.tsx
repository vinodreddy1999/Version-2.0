import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { LazyChunkBoundary } from '../components/LazyChunkBoundary';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { canAccessModule, canAccessSection } from '../lib/rbac';
import { usePlatform } from '../platform/PlatformContext';
import type { RuntimeUser } from '../types';

const ExecutiveDashboard = lazy(() => import('./DashboardPage').then((module) => ({ default: module.DashboardPage })));
const PlanningDashboard = lazy(() => import('./PlanningModulePage').then((module) => ({ default: module.PlanningModulePage })));
const InventoryDashboard = lazy(() => import('./InventoryModulePage').then((module) => ({ default: module.InventoryModulePage })));
const WarehouseDashboard = lazy(() => import('./WarehouseModulePage').then((module) => ({ default: module.WarehouseModulePage })));
const ProductionDashboard = lazy(() => import('./ProductionModulePage').then((module) => ({ default: module.ProductionModulePage })));
const MaintenanceDashboard = lazy(() => import('./MaintenanceModulePage').then((module) => ({ default: module.MaintenanceModulePage })));
const ModuleDashboard = lazy(() => import('./ModuleWorkspacePage').then((module) => ({ default: module.ModuleWorkspacePage })));
const BusinessImpactDashboard = lazy(() => import('./BusinessImpactDashboard').then((module) => ({ default: module.BusinessImpactDashboard })));
const IntegrationDashboard = lazy(() => import('../dashboards/IntegrationDashboard').then((module) => ({ default: module.IntegrationDashboard })));

type DashboardDefinition = {
  key: string;
  label: string;
  moduleName?: string;
  section?: 'data-hub';
  render: (user: RuntimeUser) => ReactNode;
};

const dashboards: DashboardDefinition[] = [
  { key: 'executive', label: 'Executive', render: (user) => <ExecutiveDashboard user={user} /> },
  { key: 'planning', label: 'Planning', moduleName: 'Planning', render: (user) => <PlanningDashboard user={user} /> },
  { key: 'inventory', label: 'Inventory', moduleName: 'Inventory', render: (user) => <InventoryDashboard user={user} /> },
  { key: 'warehouse', label: 'Warehouse', moduleName: 'Warehouse', render: (user) => <WarehouseDashboard user={user} /> },
  { key: 'production', label: 'Production', moduleName: 'Production', render: (user) => <ProductionDashboard user={user} /> },
  { key: 'maintenance', label: 'Maintenance', moduleName: 'Maintenance', render: (user) => <MaintenanceDashboard user={user} /> },
  { key: 'quality', label: 'Quality', moduleName: 'Quality', render: (user) => <ModuleDashboard moduleKey="quality" user={user} /> },
  { key: 'procurement', label: 'Procurement', moduleName: 'Procurement', render: (user) => <ModuleDashboard moduleKey="procurement" user={user} /> },
  { key: 'sales', label: 'Sales', moduleName: 'Sales & Distribution', render: (user) => <ModuleDashboard moduleKey="sales" user={user} /> },
  { key: 'costing', label: 'Costing', moduleName: 'Costing & Profitability', render: (user) => <ModuleDashboard moduleKey="costing" user={user} /> },
  { key: 'compliance', label: 'Compliance', moduleName: 'Compliance', render: (user) => <ModuleDashboard moduleKey="compliance" user={user} /> },
  { key: 'business-impact', label: 'Business Impact', moduleName: 'Reports & Analytics', render: () => <BusinessImpactDashboard /> },
  { key: 'integration', label: 'Integration', section: 'data-hub', render: () => <IntegrationDashboard /> },
];

export function UnifiedDashboardsPage({ user }: { user: RuntimeUser }) {
  const navigate = useNavigate();
  const { dashboardKey } = useParams();
  const { selectedClient, platformUser, isPlatformContext } = usePlatform();
  const permissionContext = { user, selectedClient, platformUser, isPlatformContext };
  const allowedDashboards = dashboards.filter((dashboard) => {
    if (dashboard.section && !canAccessSection(user, dashboard.section)) return false;
    return !dashboard.moduleName || canAccessModule(permissionContext, dashboard.moduleName);
  });
  const selected = allowedDashboards.find((dashboard) => dashboard.key === dashboardKey) ?? allowedDashboards[0];

  if (!selected) return <Panel title="No dashboards available" description="No dashboard is assigned to this user and client scope."><div className="text-sm text-slate-400">Contact an administrator to assign dashboard and module access.</div></Panel>;
  if (!dashboardKey || dashboardKey !== selected.key) return <Navigate replace to={`/workspace/dashboards/${selected.key}`} />;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Unified Dashboards" title={selected.label} description={`One governed dashboard source for ${selectedClient?.clientName ?? 'platform scope'}. Only the selected dashboard is loaded.`} />
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/25 p-2" aria-label="Dashboard selector">
        {allowedDashboards.map((dashboard) => (
          <button key={dashboard.key} type="button" className={`${dashboard.key === selected.key ? 'form-button-primary' : 'form-button-subtle'} min-w-max`} onClick={() => navigate(`/workspace/dashboards/${dashboard.key}`)}>
            {dashboard.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2"><StatusBadge status="Live backend" /><span className="text-xs text-slate-500">Client and permission context preserved</span></div>
      <LazyChunkBoundary key={selected.key} label={`${selected.label} dashboard`}>
        <Suspense fallback={<LoadingState label={`Loading ${selected.label} dashboard`} />}>
          {selected.render(user)}
        </Suspense>
      </LazyChunkBoundary>
    </div>
  );
}
