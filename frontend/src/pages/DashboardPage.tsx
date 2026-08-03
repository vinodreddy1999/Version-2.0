import { Activity, Bell, Boxes, CheckCircle2, Link2, PackageCheck, ShoppingCart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '../components/DataTable';
import { ErrorState } from '../components/ErrorState';
import { LazyBarChart } from '../components/LazyCharts';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency, formatNumber, toTitle } from '../lib/format';
import { queryKeys } from '../lib/queryKeys';
import { canAccessAppSection, canAccessModule, canAccessPage, canViewFinancialData } from '../lib/rbac';
import { backend } from '../services/api';
import type { ModuleRecord, RuntimeUser } from '../types';
import { usePlatform } from '../platform/PlatformContext';

function statusScore(records: ModuleRecord[] | undefined, moduleKey: string, fallback: number) {
  const moduleRecords = records?.filter((record) => record.module_key === moduleKey) ?? [];
  if (!moduleRecords.length) return fallback;
  const closedStatuses = ['approved', 'published', 'released', 'completed', 'signed', 'passed', 'ready', 'active'];
  const healthy = moduleRecords.filter((record) => closedStatuses.includes(record.status.toLowerCase())).length;
  return Math.max(35, Math.round((healthy / moduleRecords.length) * 100));
}

function moduleRoute(moduleKey: string) {
  const directRoutes = new Set([
    'planning',
    'inventory',
    'production',
    'maintenance',
    'quality',
    'procurement',
    'sales',
    'costing',
    'compliance',
    'customer-portal',
    'supplier-portal',
    'reports',
    'documents',
  ]);
  const routeMap: Record<string, string> = {
    reporting: '/workspace/dashboards/business-impact',
    reports: '/workspace/dashboards/business-impact',
    integrations: '/data-hub',
    mobile: '/operations',
    ai_copilot: '/intelligence',
    ai: '/intelligence',
  };
  if (directRoutes.has(moduleKey)) return `/${moduleKey}`;
  return routeMap[moduleKey] ?? '/operations';
}

const moduleLabelByKey: Record<string, string> = {
  planning: 'Planning',
  inventory: 'Inventory',
  warehouse: 'Warehouse',
  production: 'Production',
  maintenance: 'Maintenance',
  quality: 'Quality',
  procurement: 'Procurement',
  sales: 'Sales & Distribution',
  costing: 'Costing & Profitability',
  compliance: 'Compliance',
  'customer-portal': 'Customer Portal',
  'supplier-portal': 'Supplier Portal',
  reports: 'Reports & Analytics',
  documents: 'Document Management',
};

export function DashboardPage({ user }: { user: RuntimeUser }) {
  const navigate = useNavigate();
  const { currency, selectedClientId, selectedClient, platformUser, isPlatformContext } = usePlatform();
  const permissionContext = { user, selectedClient, platformUser, isPlatformContext };
  const canViewAdmin = canAccessAppSection(permissionContext, 'admin');
  const canViewDataHub = canAccessAppSection(permissionContext, 'data-hub');
  const canViewOperations = canAccessAppSection(permissionContext, 'operations');
  const canViewFinancial = canViewFinancialData(permissionContext);
  const canReadAdminData = canViewAdmin && ['super_admin', 'account_owner', 'admin'].includes(user.role);
  const canReadDataHubData = canViewDataHub && ['super_admin', 'account_owner', 'admin'].includes(user.role);
  const canViewInventory = canAccessModule(permissionContext, 'Inventory');
  const canViewProduction = canAccessModule(permissionContext, 'Production');
  const canViewMaintenance = canAccessModule(permissionContext, 'Maintenance');
  const canViewQuality = canAccessModule(permissionContext, 'Quality');
  const canViewProcurement = canAccessModule(permissionContext, 'Procurement');

  const admin = useQuery({ queryKey: queryKeys.dashboard.admin(selectedClientId), queryFn: backend.adminDashboard, enabled: canReadAdminData });
  const inventory = useQuery({ queryKey: queryKeys.dashboard.inventory(selectedClientId), queryFn: backend.inventoryDashboard, enabled: canViewInventory && canViewFinancial });
  const analytics = useQuery({ queryKey: queryKeys.dashboard.analytics(selectedClientId), queryFn: backend.analytics, enabled: canViewOperations });
  const systems = useQuery({ queryKey: queryKeys.dashboard.systems(selectedClientId), queryFn: backend.connectedSystems, enabled: canReadDataHubData });
  const uploads = useQuery({ queryKey: queryKeys.dashboard.uploads(selectedClientId), queryFn: backend.uploads, enabled: canReadDataHubData });
  const records = useQuery({ queryKey: queryKeys.dashboard.records(selectedClientId), queryFn: () => backend.records(), enabled: canViewOperations });

  const activeQueries = [
    canReadAdminData ? admin : null,
    canViewInventory && canViewFinancial ? inventory : null,
    canViewOperations ? analytics : null,
    canReadDataHubData ? systems : null,
    canReadDataHubData ? uploads : null,
    canViewOperations ? records : null,
  ].filter(Boolean);
  const hasResolvedData = activeQueries.some((query) => query?.data !== undefined);
  const isWaitingForFirstResult = !hasResolvedData && activeQueries.some((query) => query?.isLoading);
  const firstError = activeQueries.map((query) => query?.error).find(Boolean);

  if (isWaitingForFirstResult) {
    return <LoadingState label="Loading backend dashboard data" />;
  }

  if (!hasResolvedData && firstError) {
    return <ErrorState title="Dashboard data unavailable" error={firstError} />;
  }

  const allRecords = (records.data ?? []).filter((record) => canAccessModule(permissionContext, moduleLabelByKey[String(record.module_key).toLowerCase()] ?? toTitle(record.module_key)));
  const connectedSystems = systems.data ?? [];
  const fileUploads = uploads.data ?? [];
  const moduleCounts = analytics.data?.module_record_counts ?? {};
  const lowStockItems = analytics.data?.inventory_low_stock_items ?? [];
  const productionScore = statusScore(allRecords, 'production', 82);
  const maintenanceScore = statusScore(allRecords, 'maintenance', 64);
  const qualityScore = admin.data?.data_quality ?? statusScore(allRecords, 'quality', 91);
  const procurementScore = statusScore(allRecords, 'procurement', 73);
  const inventoryScore = Math.max(20, 100 - (analytics.data?.inventory_low_stock_count ?? 0) * 8);

  const dashboardMetrics = [
    {
      label: 'Active Users',
      value: formatNumber(admin.data?.active_users ?? analytics.data?.active_users),
      helper: `${formatNumber(admin.data?.user_count)} total users`,
      accent: 'emerald' as const,
      route: '/admin',
      visible: canReadAdminData,
    },
    {
      label: 'Backend Records',
      value: formatNumber(allRecords.length),
      helper: 'All module records',
      accent: 'blue' as const,
      route: '/operations',
      visible: canViewOperations,
    },
    canViewFinancial
      ? {
          label: 'Inventory Value',
          value: formatCurrency(inventory.data?.total_inventory_value, currency),
          helper: `${formatNumber(analytics.data?.inventory_total_quantity)} units tracked`,
          accent: 'amber' as const,
          route: '/inventory',
          visible: canViewInventory,
        }
      : {
          label: 'Inventory Quantity',
          value: formatNumber(analytics.data?.inventory_total_quantity),
          helper: 'Units tracked in assigned scope',
          accent: 'amber' as const,
          route: '/inventory',
          visible: canViewInventory,
        },
    {
      label: 'Open Approvals',
      value: formatNumber(admin.data?.open_approvals ?? admin.data?.pending_actions),
      helper: 'Waiting for action',
      accent: 'violet' as const,
      route: '/admin',
      visible: canReadAdminData,
    },
    {
      label: 'Active Integrations',
      value: formatNumber(connectedSystems.length || admin.data?.integrations),
      helper: 'ERP, files, APIs, SFTP',
      accent: 'blue' as const,
      route: '/data-hub',
      visible: canReadDataHubData,
    },
  ].filter((metric) => metric.visible && canAccessPage(permissionContext, metric.route));

  const operationalStatus = [
    { area: 'Production', status: 'Backend', value: productionScore, route: '/production', visible: canViewProduction },
    { area: 'Maintenance', status: 'Backend', value: maintenanceScore, route: '/maintenance', visible: canViewMaintenance },
    { area: 'Quality', status: 'Backend', value: qualityScore, route: '/quality', visible: canViewQuality },
    { area: 'Procurement', status: 'Backend', value: procurementScore, route: '/procurement', visible: canViewProcurement },
    { area: 'Inventory', status: 'Backend', value: inventoryScore, route: '/inventory', visible: canViewInventory },
  ].filter((item) => item.visible && canAccessPage(permissionContext, item.route));

  const notifications = [
    ...(canViewInventory ? lowStockItems.slice(0, 2).map((item) => ({
      title: `${item.name} is low stock`,
      owner: item.record_code,
      status: 'Review',
      route: '/inventory',
    })) : []),
    ...(canReadAdminData ? [{
      title: `${formatNumber(admin.data?.pending_actions)} pending admin actions`,
      owner: 'Admin workflow',
      status: (admin.data?.pending_actions ?? 0) > 0 ? 'Pending' : 'Closed',
      route: '/admin',
    }] : []),
    ...(canReadDataHubData ? [{
      title: `${formatNumber(fileUploads.length)} DataHub uploads available`,
      owner: 'DataHub',
      status: fileUploads.length ? 'Ready' : 'Open',
      route: '/data-hub',
    }] : []),
  ].filter((item) => canAccessPage(permissionContext, item.route));

  const widgetRows = Object.entries(moduleCounts).map(([module, count]) => ({
    widget: `${toTitle(module)} Workspace`,
    owner: user.role.replace('_', ' '),
    records: count,
    status: count > 0 ? 'Enabled' : 'Empty',
    route: moduleRoute(module),
  })).filter((row) => canAccessPage(permissionContext, row.route));

  return (
    <>
      <PageHeader
        eyebrow="Executive Dashboard"
        title="Operations overview"
        description={`Operational visibility, approvals, notifications, integrations, and module status for ${selectedClient?.clientName ?? 'the selected client'}.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status="Operational" />
        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs text-slate-300">
          {user.role.replace('_', ' ')}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboardMetrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} accent={metric.accent} onClick={() => navigate(metric.route)} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        {operationalStatus.length ? (
          <Panel title="Operational Status" description="High-level operational health across core business functions.">
            <LazyBarChart data={operationalStatus.map((item) => ({ name: item.area, value: item.value }))} bars={['value']} height="h-80" showGrid={false} />
          </Panel>
        ) : null}

        {notifications.length ? <Panel title="Open Notifications" description="Operational items that require review or action.">
          <div className="space-y-3">
            {notifications.map((item) => (
              <button key={item.title} className="w-full rounded-xl border border-white/10 bg-slate-950/25 p-3 text-left transition hover:border-cyan-300/30 hover:bg-slate-900/50" onClick={() => navigate(item.route)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.owner}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              </button>
            ))}
          </div>
        </Panel> : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {canViewProduction ? <StatCard label="Production Status" value={`${productionScore}%`} helper="Open production workspace" icon={<PackageCheck className="h-5 w-5" />} accent="blue" onClick={() => navigate('/production')} /> : null}
        {canViewQuality ? <StatCard label="Quality Status" value={`${qualityScore}%`} helper="Open quality workspace" icon={<CheckCircle2 className="h-5 w-5" />} accent="emerald" onClick={() => navigate('/quality')} /> : null}
        {canViewProcurement ? <StatCard label="Procurement Status" value={`${procurementScore}%`} helper="Open procurement workspace" icon={<ShoppingCart className="h-5 w-5" />} accent="amber" onClick={() => navigate('/procurement')} /> : null}
        {canViewInventory ? <StatCard label="Inventory Status" value={`${inventoryScore}%`} helper="Open inventory workspace" icon={<Boxes className="h-5 w-5" />} accent="violet" onClick={() => navigate('/inventory')} /> : null}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Configurable Widgets" description="Dashboard blocks that can be enabled, disabled, or assigned by administrator roles.">
          <DataTable
            rows={widgetRows}
            emptyTitle="No widgets configured"
            columns={[
              { key: 'widget', label: 'Widget' },
              { key: 'owner', label: 'Owner' },
              { key: 'records', label: 'Records' },
              { key: 'status', label: 'Status', render: (value) => <StatusBadge status={String(value)} /> },
              {
                key: 'route',
                label: 'Open',
                render: (value) => (
                  <button className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20" onClick={() => navigate(String(value))}>
                    View
                  </button>
                ),
              },
            ]}
          />
        </Panel>

        <Panel title="Integration Snapshot" description="ERP, database, upload, REST API, and SFTP connection overview.">
          <div className="grid gap-3 sm:grid-cols-2">
            {canReadDataHubData ? <StatCard label="ERP Systems" value={formatNumber(connectedSystems.filter((system) => system.system_type.toLowerCase().includes('erp')).length)} helper="Open Data Hub connections" icon={<Link2 className="h-5 w-5" />} onClick={() => navigate('/data-hub')} /> : null}
            {canReadDataHubData ? <StatCard label="File Uploads" value={formatNumber(fileUploads.length)} helper="Open upload center" icon={<Activity className="h-5 w-5" />} accent="emerald" onClick={() => navigate('/data-hub')} /> : null}
            {canReadAdminData ? <StatCard label="Open Alerts" value={formatNumber((admin.data?.pending_actions ?? 0) + (analytics.data?.inventory_low_stock_count ?? 0))} helper="Open admin and inventory queues" icon={<Bell className="h-5 w-5" />} accent="amber" onClick={() => navigate('/admin')} /> : null}
            {canReadDataHubData ? <StatCard label="REST APIs" value={formatNumber(connectedSystems.filter((system) => system.system_type.toLowerCase().includes('api')).length)} helper="Open Data Hub integrations" icon={<Link2 className="h-5 w-5" />} accent="violet" onClick={() => navigate('/data-hub')} /> : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
