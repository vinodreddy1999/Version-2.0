import type { QueryKey } from '@tanstack/react-query';

export function clientScopeToken(clientId?: string | null) {
  return `client:${clientId ?? 'platform'}`;
}

function scoped(clientId?: string | null) {
  return ['scope', clientScopeToken(clientId)] as const;
}

export type EnterpriseQueryContext = {
  enterpriseId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  module?: string | null;
  dashboardKey?: string | null;
  dateRange?: string | null;
  currency?: string | null;
  timezone?: string | null;
  compareScopeIds?: string[];
};

export function enterpriseScopeToken(context: EnterpriseQueryContext) {
  return [
    'enterprise',
    context.enterpriseId ?? 'none',
    context.scopeType ?? 'enterprise',
    context.scopeId ?? context.enterpriseId ?? 'none',
    context.module ?? 'all-modules',
    context.dashboardKey ?? 'no-dashboard',
    context.dateRange ?? 'default-range',
    context.currency ?? 'default-currency',
    context.timezone ?? 'default-timezone',
    [...(context.compareScopeIds ?? [])].sort().join(',') || 'no-comparison',
  ] as const;
}

export const enterpriseQueryKeys = {
  enterprises: (userId: string) => ['enterprise-access', 'enterprises', userId] as const,
  effectiveAccess: (userId: string, enterpriseId?: string | null) => ['enterprise-access', enterpriseId ?? 'none', userId, 'effective-access'] as const,
  availableScopes: (userId: string, enterpriseId?: string | null) => ['enterprise-access', enterpriseId ?? 'none', userId, 'available-scopes'] as const,
  navigation: (userId: string, enterpriseId?: string | null) => ['enterprise-access', enterpriseId ?? 'none', userId, 'navigation'] as const,
  hierarchy: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'hierarchy'] as const,
  members: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'members'] as const,
  roleTemplates: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'role-templates'] as const,
  assignments: (context: EnterpriseQueryContext, userId?: string | null) => [...enterpriseScopeToken(context), 'assignments', userId ?? 'none'] as const,
  entitlements: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'module-entitlements'] as const,
  dataPolicies: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'data-policies'] as const,
  temporaryAccess: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'temporary-access'] as const,
  supportSessions: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'support-sessions'] as const,
  audit: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'audit'] as const,
  dashboard: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'dashboard-data'] as const,
  module: (context: EnterpriseQueryContext) => [...enterpriseScopeToken(context), 'module-data'] as const,
};

export const queryKeys = {
  dashboard: {
    admin: (clientId?: string | null) => [...scoped(clientId), 'dashboard', 'admin'] as const,
    inventory: (clientId?: string | null) => [...scoped(clientId), 'dashboard', 'inventory'] as const,
    analytics: (clientId?: string | null) => [...scoped(clientId), 'dashboard', 'analytics'] as const,
    systems: (clientId?: string | null) => [...scoped(clientId), 'dashboard', 'connected-systems'] as const,
    uploads: (clientId?: string | null) => [...scoped(clientId), 'dashboard', 'uploads'] as const,
    records: (clientId?: string | null) => [...scoped(clientId), 'dashboard', 'records'] as const,
  },
  module: {
    records: (clientId: string | null | undefined, moduleKey: string) => [...scoped(clientId), 'module', moduleKey, 'records'] as const,
  },
  integration: {
    systems: (clientId?: string | null) => [...scoped(clientId), 'integration', 'systems'] as const,
    quality: (clientId?: string | null) => [...scoped(clientId), 'integration', 'quality'] as const,
    readiness: (clientId?: string | null) => [...scoped(clientId), 'integration', 'readiness'] as const,
    uploads: (clientId?: string | null) => [...scoped(clientId), 'integration', 'uploads'] as const,
  },
};

export function isClientScopedQuery(queryKey: QueryKey) {
  return queryKey[0] === 'scope' && typeof queryKey[1] === 'string' && queryKey[1].startsWith('client:');
}

export function belongsToClient(queryKey: QueryKey, clientId?: string | null) {
  return isClientScopedQuery(queryKey) && queryKey[1] === clientScopeToken(clientId);
}

export function isEnterpriseScopedQuery(queryKey: QueryKey) {
  return queryKey[0] === 'enterprise';
}
