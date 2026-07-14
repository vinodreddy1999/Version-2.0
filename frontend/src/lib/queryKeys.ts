import type { QueryKey } from '@tanstack/react-query';

export function clientScopeToken(clientId?: string | null) {
  return `client:${clientId ?? 'platform'}`;
}

function scoped(clientId?: string | null) {
  return ['scope', clientScopeToken(clientId)] as const;
}

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
