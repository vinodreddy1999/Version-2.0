import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { LazyChunkBoundary } from '../components/LazyChunkBoundary';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { useEnterpriseAccess } from '../enterprise/EnterpriseAccessContext';
import { canAccessAppSection, canAccessModule, canViewFinancialData } from '../lib/rbac';
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
const EnterpriseScopeDashboard = lazy(() => import('./EnterpriseScopeDashboardPage').then((module) => ({ default: module.EnterpriseScopeDashboardPage })));

type DashboardDefinition = {
  key: string;
  label: string;
  moduleName?: string;
  section?: 'data-hub';
  financialOnly?: boolean;
  enterpriseExperiences?: Array<'global' | 'regional' | 'plant' | 'frontline'>;
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
  { key: 'business-impact', label: 'Business Impact', moduleName: 'Reports & Analytics', financialOnly: true, render: () => <BusinessImpactDashboard /> },
  { key: 'integration', label: 'Integration', section: 'data-hub', render: () => <IntegrationDashboard /> },
  { key: 'global-executive', label: 'Global Executive', enterpriseExperiences: ['global'], render: () => <EnterpriseScopeDashboard dashboardKey="global-executive" title="Global Executive Dashboard" /> },
  { key: 'global-operations', label: 'Global Operations', enterpriseExperiences: ['global'], render: () => <EnterpriseScopeDashboard dashboardKey="global-operations" title="Global Operations Dashboard" /> },
  { key: 'global-quality', label: 'Global Quality', enterpriseExperiences: ['global'], moduleName: 'Quality', render: () => <EnterpriseScopeDashboard dashboardKey="global-quality" title="Global Quality Dashboard" /> },
  { key: 'global-supply-chain', label: 'Global Supply Chain', enterpriseExperiences: ['global'], moduleName: 'Procurement', render: () => <EnterpriseScopeDashboard dashboardKey="global-supply-chain" title="Global Supply Chain Dashboard" /> },
  { key: 'global-maintenance', label: 'Global Maintenance', enterpriseExperiences: ['global'], moduleName: 'Maintenance', render: () => <EnterpriseScopeDashboard dashboardKey="global-maintenance" title="Global Maintenance Dashboard" /> },
  { key: 'regional', label: 'Regional', enterpriseExperiences: ['global', 'regional'], render: () => <EnterpriseScopeDashboard dashboardKey="regional" title="Regional Dashboard" /> },
  { key: 'country', label: 'Country', enterpriseExperiences: ['global', 'regional'], render: () => <EnterpriseScopeDashboard dashboardKey="country" title="Country Dashboard" /> },
  { key: 'business-unit', label: 'Business Unit', enterpriseExperiences: ['global'], render: () => <EnterpriseScopeDashboard dashboardKey="business-unit" title="Business Unit Dashboard" /> },
  { key: 'multi-site', label: 'Multi-site', enterpriseExperiences: ['global', 'regional'], render: () => <EnterpriseScopeDashboard dashboardKey="multi-site" title="Multi-site Dashboard" /> },
  { key: 'plant-command-center', label: 'Plant Command Center', enterpriseExperiences: ['global', 'regional', 'plant'], render: () => <EnterpriseScopeDashboard dashboardKey="plant-command-center" title="Plant Command Center" /> },
  { key: 'department', label: 'Department', enterpriseExperiences: ['plant'], render: () => <EnterpriseScopeDashboard dashboardKey="department" title="Department Dashboard" /> },
  { key: 'shift', label: 'Shift', enterpriseExperiences: ['plant', 'frontline'], render: () => <EnterpriseScopeDashboard dashboardKey="shift" title="Shift Dashboard" /> },
  { key: 'frontline', label: 'Frontline Workspace', enterpriseExperiences: ['frontline'], render: () => <EnterpriseScopeDashboard dashboardKey="frontline" title="Frontline Workspace" /> },
  { key: 'people', label: 'People & Capability', enterpriseExperiences: ['global'], render: () => <EnterpriseScopeDashboard dashboardKey="people" title="People & Capability" /> },
  { key: 'risks', label: 'Risks & Escalations', enterpriseExperiences: ['global', 'regional'], render: () => <EnterpriseScopeDashboard dashboardKey="risks" title="Risks & Escalations" /> },
  { key: 'regional-initiatives', label: 'Regional Initiatives', enterpriseExperiences: ['regional'], render: () => <EnterpriseScopeDashboard dashboardKey="regional-initiatives" title="Regional Initiatives" /> },
  { key: 'tasks', label: 'Tasks & Approvals', enterpriseExperiences: ['plant'], render: () => <EnterpriseScopeDashboard dashboardKey="tasks" title="Tasks & Approvals" /> },
  { key: 'my-work', label: 'My Work', enterpriseExperiences: ['frontline'], render: () => <EnterpriseScopeDashboard dashboardKey="my-work" title="My Work" /> },
  { key: 'notifications', label: 'Notifications', enterpriseExperiences: ['frontline'], render: () => <EnterpriseScopeDashboard dashboardKey="notifications" title="Notifications" /> },
  { key: 'profile', label: 'My Profile', enterpriseExperiences: ['frontline'], render: () => <EnterpriseScopeDashboard dashboardKey="profile" title="My Profile" /> },
];

export function UnifiedDashboardsPage({ user }: { user: RuntimeUser }) {
  const navigate = useNavigate();
  const { dashboardKey } = useParams();
  const { selectedClient, platformUser, isPlatformContext } = usePlatform();
  const enterpriseAccess = useEnterpriseAccess();
  const permissionContext = { user, selectedClient, platformUser, isPlatformContext };
  const allowedDashboards = dashboards.filter((dashboard) => {
    if (enterpriseAccess.isExplicitAccess) {
      if (!dashboard.enterpriseExperiences?.includes(enterpriseAccess.visibleNavigation?.experience as 'global' | 'regional' | 'plant' | 'frontline')) return false;
      if (dashboard.moduleName) {
        const moduleKey = dashboard.moduleName.toLowerCase().replace(' & distribution', '').replace(' & profitability', '').replace(/[^a-z0-9]+/g, '-');
        return enterpriseAccess.canUseModule(moduleKey);
      }
      return enterpriseAccess.can('dashboard.view');
    }
    if (dashboard.enterpriseExperiences) return false;
    if (dashboard.financialOnly && !canViewFinancialData(permissionContext)) return false;
    if (dashboard.section && !canAccessAppSection(permissionContext, dashboard.section)) return false;
    return !dashboard.moduleName || canAccessModule(permissionContext, dashboard.moduleName);
  });
  const selected = allowedDashboards.find((dashboard) => dashboard.key === dashboardKey) ?? allowedDashboards[0];

  if (!selected) return <Panel title="No dashboards available" description="No dashboard is assigned to this user and client scope."><div className="text-sm text-slate-400">Contact an administrator to assign dashboard and module access.</div></Panel>;
  if (!dashboardKey || dashboardKey !== selected.key) return <Navigate replace to={`/workspace/dashboards/${selected.key}`} />;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Unified Dashboards" title={selected.label} description={`One governed dashboard source for ${enterpriseAccess.activeScope?.label ?? selectedClient?.clientName ?? 'platform scope'}. Only the selected dashboard is loaded.`} />
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
