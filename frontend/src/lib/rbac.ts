import type { RuntimeUser } from '../types';
import type { PlatformClient, PlatformUser } from '../platform/types';

export type AppSection = 'dashboard' | 'admin' | 'data-hub' | 'operations' | 'intelligence';
export type ActionKey = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import' | 'approve' | 'reject' | 'manage';

export type PermissionContext = {
  user: RuntimeUser;
  selectedClient?: PlatformClient | null;
  platformUser?: PlatformUser | null;
  isPlatformContext?: boolean;
};

const privilegedFinancialRoles: RuntimeUser['role'][] = ['super_admin', 'account_owner', 'organization_admin', 'admin'];

const routeModuleMap: Record<string, string> = {
  '/planning': 'Planning',
  '/inventory': 'Inventory',
  '/warehouse': 'Warehouse',
  '/production': 'Production',
  '/maintenance': 'Maintenance',
  '/quality': 'Quality',
  '/procurement': 'Procurement',
  '/sales': 'Sales & Distribution',
  '/costing': 'Costing & Profitability',
  '/compliance': 'Compliance',
  '/customer-portal': 'Customer Portal',
  '/supplier-portal': 'Supplier Portal',
  '/reports': 'Reports & Analytics',
  '/documents': 'Document Management',
};

const sectionAccess: Record<RuntimeUser['role'], AppSection[]> = {
  super_admin: ['dashboard', 'admin', 'data-hub', 'operations', 'intelligence'],
  account_owner: ['dashboard', 'admin', 'data-hub', 'operations', 'intelligence'],
  organization_admin: ['dashboard', 'admin', 'operations', 'intelligence'],
  admin: ['dashboard', 'admin', 'data-hub', 'operations', 'intelligence'],
  team_manager: ['dashboard', 'operations', 'intelligence'],
  supervisor: ['dashboard', 'operations', 'intelligence'],
  auditor: ['dashboard', 'operations', 'intelligence'],
  qa_tester: ['dashboard', 'operations', 'intelligence'],
  operator: ['dashboard', 'operations'],
  custom: ['dashboard', 'operations'],
  user: ['dashboard', 'operations'],
};

export function canAccessSection(user: RuntimeUser, section: AppSection) {
  return sectionAccess[user.role].includes(section);
}

function assignedAccess({ user, platformUser }: PermissionContext) {
  const userModules = Array.isArray(user.assigned_modules) ? user.assigned_modules : undefined;
  const userApplications = Array.isArray(user.assigned_applications) ? user.assigned_applications : undefined;
  return {
    modules: userModules ?? platformUser?.assignedModules ?? [],
    applications: userApplications ?? platformUser?.assignedApplications ?? [],
  };
}

function hasAssignedAppOrModule(context: PermissionContext, keys: string[]) {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const access = assignedAccess(context);
  return [...access.modules, ...access.applications].some((item) => normalizedKeys.includes(item.toLowerCase()));
}

export function hasOperationalAssignment(context: PermissionContext) {
  if (context.isPlatformContext && context.user.role === 'super_admin') return true;
  if (['super_admin', 'account_owner', 'organization_admin', 'admin'].includes(context.user.role)) return true;
  const access = assignedAccess(context);
  return access.modules.length > 0 || access.applications.length > 0;
}

export function canAccessAppSection(context: PermissionContext, section: AppSection) {
  if (section === 'dashboard') return canAccessSection(context.user, section) && hasOperationalAssignment(context);
  if (section === 'operations') return canAccessSection(context.user, section) && hasOperationalAssignment(context);
  if (section === 'data-hub') {
    return (
      canAccessSection(context.user, section)
      || hasAssignedAppOrModule(context, ['Manufacturing Data Hub', 'Integration Hub'])
      || context.user.permissions.some((permission) => permission.startsWith('integrations.'))
    );
  }
  if (section === 'intelligence') {
    return (
      canAccessSection(context.user, section)
      || hasAssignedAppOrModule(context, ['AI Intelligence'])
      || context.user.permissions.some((permission) => permission.startsWith('ai.'))
    );
  }
  return canAccessSection(context.user, section);
}

export function canViewFinancialData({ user, platformUser }: PermissionContext) {
  if (privilegedFinancialRoles.includes(user.role)) return true;
  const roleText = [
    user.role,
    ...user.permissions,
    platformUser?.department,
    ...(platformUser?.roles ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return ['finance', 'costing', 'profitability', 'commercial', 'cfo', 'controller', 'accountant'].some((term) => roleText.includes(term));
}

export function isFinancialField(label: string) {
  const normalized = label.trim().toLowerCase();
  return [
    /^value$/,
    /inventory value/,
    /aging value/,
    /value update/,
    /scrap value/,
    /unit cost/,
    /cost variance/,
    /maintenance cost/,
    /downtime cost/,
    /breakdown cost/,
    /preventive cost/,
    /corrective cost/,
    /spare cost/,
    /^cost$/,
    /amount/,
    /price/,
    /margin/,
    /profit/,
    /savings/,
    /valuation/,
    /currency/,
    /financial/,
  ].some((pattern) => pattern.test(normalized));
}

export function filterFinancialTableRows<T extends Record<string, unknown>>(rows: T[], context: PermissionContext) {
  if (canViewFinancialData(context)) return rows;
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !isFinancialField(key))) as T);
}

export function filterScopedTableRows<T extends Record<string, unknown>>(rows: T[], context: PermissionContext) {
  const scope = getUserDataScope(context.user, context.platformUser ?? undefined);
  return rows.filter((row) => {
    const rowPlant = row.Plant ?? row['Plant Name'] ?? row.Site;
    const rowWarehouse = row.Warehouse ?? row['Warehouse Name'];
    if (scope.plant && rowPlant && !String(rowPlant).toLowerCase().includes(scope.plant.toLowerCase())) return false;
    if (scope.warehouse && rowWarehouse && !String(rowWarehouse).toLowerCase().includes(scope.warehouse.toLowerCase())) return false;
    return true;
  });
}

export function canAccessModule(context: PermissionContext, moduleName: string) {
  const { user, selectedClient, isPlatformContext } = context;
  const normalizedModule = moduleName.toLowerCase();
  if (isPlatformContext) return user.role === 'super_admin';
  if (!canAccessSection(user, 'operations')) return false;
  if (selectedClient && !selectedClient.enabledModules.some((module) => module.toLowerCase() === normalizedModule)) return false;
  if (normalizedModule === 'costing & profitability' && !canViewFinancialData(context)) return false;
  if (!assignedAccess(context).modules.some((module) => module.toLowerCase() === normalizedModule)) return false;
  return true;
}

export function canAccessPage(context: PermissionContext, path: string) {
  if (path.startsWith('/platform')) return context.user.role === 'super_admin' && Boolean(context.isPlatformContext);
  if (path.startsWith('/workspace/dashboards/business-impact') || path.startsWith('/dashboard/business-impact') || path.startsWith('/impact/')) {
    return canAccessSection(context.user, 'dashboard') && canViewFinancialData(context);
  }
  if (path.startsWith('/workspace/dashboards') || path.startsWith('/dashboard')) return canAccessAppSection(context, 'dashboard');
  if (path.startsWith('/admin/performance')) return canAccessAppSection(context, 'admin');
  if (path.startsWith('/admin')) return canAccessAppSection(context, 'admin');
  if (path.startsWith('/data-hub')) return canAccessAppSection(context, 'data-hub');
  if (path.startsWith('/intelligence')) return canAccessAppSection(context, 'intelligence');
  if (path.startsWith('/factorypulse') || path.startsWith('/operations')) return canAccessAppSection(context, 'operations');
  const moduleEntry = Object.entries(routeModuleMap).find(([route]) => path === route || path.startsWith(`${route}/`));
  if (moduleEntry) return canAccessModule(context, moduleEntry[1]);
  if (path === '/') return canAccessSection(context.user, 'dashboard');
  return true;
}

export function canPerformAction(user: RuntimeUser, action: ActionKey) {
  if (!user.is_active) return false;
  if (user.demo_read_only && action !== 'view' && action !== 'export') return false;
  if (user.role === 'super_admin') return true;
  if (action === 'view') return true;
  if (action === 'export') return user.permissions.includes('data.export') || user.permissions.includes('data.read') || canAccessSection(user, 'operations');
  if (action === 'import') return canUseDataHubUploads(user);
  if (action === 'create' || action === 'edit') return user.permissions.includes('data.write') || ['account_owner', 'organization_admin', 'admin', 'team_manager', 'supervisor'].includes(user.role);
  if (action === 'approve' || action === 'reject') return user.permissions.includes('approval.write') || ['account_owner', 'organization_admin', 'admin', 'team_manager'].includes(user.role);
  if (action === 'delete' || action === 'manage') return ['account_owner', 'organization_admin', 'admin'].includes(user.role) || user.permissions.includes('data.delete');
  return false;
}

export function actionKeyFromLabel(label: string): ActionKey {
  const normalized = label.toLowerCase();
  if (normalized.includes('export') || normalized.includes('download')) return 'export';
  if (normalized.includes('import') || normalized.includes('upload')) return 'import';
  if (normalized.includes('delete') || normalized.includes('dispose') || normalized.includes('disable') || normalized.includes('cancel')) return 'delete';
  if (normalized.includes('approve')) return 'approve';
  if (normalized.includes('reject')) return 'reject';
  if (normalized.includes('create') || normalized.includes('add') || normalized.includes('generate')) return 'create';
  if (normalized.includes('edit') || normalized.includes('assign') || normalized.includes('reassign') || normalized.includes('post') || normalized.includes('save')) return 'edit';
  return 'view';
}

export function firstAllowedPath(context: PermissionContext, candidatePaths: string[]) {
  return candidatePaths.find((path) => canAccessPage(context, path)) ?? '/';
}

export function canManagePlatform(user: RuntimeUser) {
  return canAccessSection(user, 'admin');
}

export function canCreateCompanies(user: RuntimeUser) {
  return !user.demo_read_only && ['super_admin', 'account_owner'].includes(user.role);
}

export function canWriteOperationalData(user: RuntimeUser) {
  return !user.demo_read_only && user.permissions.includes('data.write');
}

export function canReadAuditLogs(user: RuntimeUser) {
  return user.permissions.includes('audit.read');
}

export function canEditExecutiveMetrics(user: RuntimeUser) {
  return !user.demo_read_only && ['admin', 'super_admin'].includes(user.role);
}

export function canUseDataHubUploads(user: RuntimeUser) {
  return !user.demo_read_only && ['admin', 'super_admin'].includes(user.role);
}

export function getUserDataScope(user: RuntimeUser, platformUser?: PlatformUser) {
  const plant = user.scope_plant_name ?? platformUser?.plant ?? null;
  const warehouse = user.scope_warehouse_name ?? platformUser?.warehouse ?? null;
  return {
    plant: plant && plant !== 'All Plants' ? plant : null,
    warehouse: warehouse && warehouse !== 'All Warehouses' ? warehouse : null,
    department: user.scope_department ?? platformUser?.department ?? null,
    modules: user.assigned_modules ?? platformUser?.assignedModules ?? [],
    applications: user.assigned_applications ?? platformUser?.assignedApplications ?? [],
  };
}

export function scopeFilterDefaults(user: RuntimeUser, platformUser?: PlatformUser) {
  const scope = getUserDataScope(user, platformUser);
  return {
    ...(scope.plant ? { Plant: scope.plant } : {}),
    ...(scope.warehouse ? { Warehouse: scope.warehouse } : {}),
  };
}

export function scopeOptions(options: string[], value?: string | null) {
  if (!value) return options;
  return options.includes(value) ? [value] : options;
}

export { routeModuleMap };
