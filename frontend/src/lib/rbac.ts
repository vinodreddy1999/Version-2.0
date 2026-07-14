import type { RuntimeUser } from '../types';
import type { PlatformClient, PlatformUser } from '../platform/types';

export type AppSection = 'dashboard' | 'admin' | 'data-hub' | 'operations' | 'intelligence';
export type ActionKey = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import' | 'approve' | 'reject' | 'manage';

export type PermissionContext = {
  user: RuntimeUser;
  selectedClient?: PlatformClient;
  platformUser?: PlatformUser;
  isPlatformContext?: boolean;
};

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
  organization_admin: ['dashboard', 'admin', 'data-hub', 'operations', 'intelligence'],
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

export function canAccessModule({ user, selectedClient, platformUser, isPlatformContext }: PermissionContext, moduleName: string) {
  if (isPlatformContext) return user.role === 'super_admin';
  if (!canAccessSection(user, 'operations')) return false;
  if (selectedClient && !selectedClient.enabledModules.includes(moduleName)) return false;
  if (platformUser && !platformUser.assignedModules.includes(moduleName)) return false;
  return true;
}

export function canAccessPage(context: PermissionContext, path: string) {
  if (path.startsWith('/platform')) return context.user.role === 'super_admin' && Boolean(context.isPlatformContext);
  if (path.startsWith('/workspace/dashboards') || path.startsWith('/dashboard')) return canAccessSection(context.user, 'dashboard');
  if (path.startsWith('/admin/performance')) return canAccessSection(context.user, 'admin');
  if (path.startsWith('/admin')) return canAccessSection(context.user, 'admin');
  if (path.startsWith('/data-hub')) return canAccessSection(context.user, 'data-hub');
  if (path.startsWith('/intelligence')) return canAccessSection(context.user, 'intelligence');
  const moduleEntry = Object.entries(routeModuleMap).find(([route]) => path === route || path.startsWith(`${route}/`));
  if (moduleEntry) return canAccessModule(context, moduleEntry[1]);
  if (path === '/') return canAccessSection(context.user, 'dashboard');
  return true;
}

export function canPerformAction(user: RuntimeUser, action: ActionKey) {
  if (!user.is_active) return false;
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
  return ['super_admin', 'account_owner'].includes(user.role);
}

export function canWriteOperationalData(user: RuntimeUser) {
  return user.permissions.includes('data.write');
}

export function canReadAuditLogs(user: RuntimeUser) {
  return user.permissions.includes('audit.read');
}

export function canEditExecutiveMetrics(user: RuntimeUser) {
  return ['admin', 'super_admin'].includes(user.role);
}

export function canUseDataHubUploads(user: RuntimeUser) {
  return ['admin', 'super_admin'].includes(user.role);
}

export { routeModuleMap };
