import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { enterpriseQueryKeys, isEnterpriseScopedQuery } from '../lib/queryKeys';
import { backend } from '../services/api';
import type { RuntimeUser } from '../types';
import type { EffectiveAccess, Enterprise, OrganizationalScope, VisibleNavigation } from './types';

type EnterpriseAccessContextValue = {
  enterprises: Enterprise[];
  activeEnterprise?: Enterprise;
  activeEnterpriseId: string | null;
  activeScope: { type: 'enterprise' | OrganizationalScope['node_type']; id: string; label: string } | null;
  availableScopes: OrganizationalScope[];
  effectiveAccess?: EffectiveAccess;
  visibleNavigation?: VisibleNavigation;
  loading: boolean;
  isExplicitAccess: boolean;
  recentScopeIds: string[];
  compareScopeIds: string[];
  selectEnterprise: (enterpriseId: string | null) => void;
  selectScope: (scope: OrganizationalScope | null) => void;
  setCompareScopeIds: (scopeIds: string[]) => void;
  can: (capability: string) => boolean;
  canAny: (...capabilities: string[]) => boolean;
  canAll: (...capabilities: string[]) => boolean;
  canUseModule: (moduleKey: string) => boolean;
};

const EnterpriseAccessContext = createContext<EnterpriseAccessContextValue | null>(null);
const recentStorageKey = 'metam.enterprise.recent-scopes.v1';
const contextStoragePrefix = 'metam.enterprise.context.v1';

function loadRecentScopes() {
  try {
    return JSON.parse(localStorage.getItem(recentStorageKey) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function loadStoredContext(userId: string) {
  try {
    return JSON.parse(localStorage.getItem(`${contextStoragePrefix}.${userId}`) ?? 'null') as {
      enterpriseId?: string | null;
      scope?: { type: 'enterprise' | OrganizationalScope['node_type']; id: string; label: string } | null;
    } | null;
  } catch {
    return null;
  }
}

export function EnterpriseAccessProvider({ runtimeUser, children }: { runtimeUser: RuntimeUser; children: ReactNode }) {
  const queryClient = useQueryClient();
  const enterprisesQuery = useQuery({
    queryKey: enterpriseQueryKeys.enterprises(runtimeUser.id),
    queryFn: backend.enterprises,
    staleTime: 5 * 60 * 1000,
  });
  const enterprises = useMemo(() => enterprisesQuery.data ?? [], [enterprisesQuery.data]);
  const storedContext = useMemo(() => loadStoredContext(runtimeUser.id), [runtimeUser.id]);
  const [activeEnterpriseId, setActiveEnterpriseId] = useState<string | null>(() => storedContext?.enterpriseId ?? null);
  const [activeScopeState, setActiveScopeState] = useState<{ type: 'enterprise' | OrganizationalScope['node_type']; id: string; label: string } | null>(() => storedContext?.scope ?? null);
  const [recentScopeIds, setRecentScopeIds] = useState<string[]>(loadRecentScopes);
  const [compareScopeIds, setCompareScopeIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enterprises.length) return;
    if (activeEnterpriseId && enterprises.some((enterprise) => enterprise.id === activeEnterpriseId)) return;
    setActiveEnterpriseId(null);
  }, [activeEnterpriseId, enterprises]);

  const effectiveAccessQuery = useQuery({
    queryKey: enterpriseQueryKeys.effectiveAccess(runtimeUser.id, activeEnterpriseId),
    queryFn: () => backend.effectiveAccess(runtimeUser.id, activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId),
    retry: false,
  });
  const availableScopesQuery = useQuery({
    queryKey: enterpriseQueryKeys.availableScopes(runtimeUser.id, activeEnterpriseId),
    queryFn: () => backend.availableScopes(runtimeUser.id, activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId),
    retry: false,
  });
  const navigationQuery = useQuery({
    queryKey: enterpriseQueryKeys.navigation(runtimeUser.id, activeEnterpriseId),
    queryFn: () => backend.enterpriseNavigation(runtimeUser.id, activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId),
    retry: false,
  });
  const activeEnterprise = enterprises.find((enterprise) => enterprise.id === activeEnterpriseId);
  const availableScopes = useMemo(() => availableScopesQuery.data ?? [], [availableScopesQuery.data]);
  const effectiveAssignments = useMemo(
    () => effectiveAccessQuery.data?.assignments ?? [],
    [effectiveAccessQuery.data?.assignments],
  );
  const canUseEnterpriseRoot = Boolean(
    activeEnterprise
    && effectiveAssignments.some(
      (assignment) =>
        assignment.scope_type === 'enterprise'
        && assignment.scope_id === activeEnterprise.id,
    ),
  );

  useEffect(() => {
    if (
      activeEnterpriseId
      && (effectiveAccessQuery.isError || availableScopesQuery.isError || navigationQuery.isError)
    ) {
      setActiveEnterpriseId(null);
      setActiveScopeState(null);
      setCompareScopeIds([]);
      return;
    }
    if (!activeEnterprise) {
      setActiveScopeState(null);
      return;
    }
    if (
      activeScopeState
      && (
        (
          activeScopeState.type === 'enterprise'
          && activeScopeState.id === activeEnterprise.id
          && canUseEnterpriseRoot
        )
        || availableScopes.some((scope) => scope.id === activeScopeState.id)
      )
    ) return;
    const assignedScope = effectiveAssignments
      .map((assignment) => availableScopes.find((scope) => scope.id === assignment.scope_id))
      .find((scope): scope is OrganizationalScope => Boolean(scope));
    const firstAllowedScope = assignedScope ?? availableScopes[0];
    setActiveScopeState(
      canUseEnterpriseRoot || !firstAllowedScope
        ? { type: 'enterprise', id: activeEnterprise.id, label: activeEnterprise.name }
        : {
            type: firstAllowedScope.node_type,
            id: firstAllowedScope.id,
            label: firstAllowedScope.name,
          },
    );
  }, [
    activeEnterprise,
    activeEnterpriseId,
    activeScopeState,
    availableScopes,
    availableScopesQuery.isError,
    canUseEnterpriseRoot,
    effectiveAccessQuery.isError,
    effectiveAssignments,
    navigationQuery.isError,
  ]);

  useEffect(() => {
    localStorage.setItem(
      `${contextStoragePrefix}.${runtimeUser.id}`,
      JSON.stringify({ enterpriseId: activeEnterpriseId, scope: activeScopeState }),
    );
  }, [activeEnterpriseId, activeScopeState, runtimeUser.id]);

  const clearScopedQueries = useCallback((previousEnterpriseId: string | null) => {
    void queryClient.cancelQueries({ predicate: (query) => isEnterpriseScopedQuery(query.queryKey) });
    if (previousEnterpriseId) {
      queryClient.removeQueries({
        predicate: (query) => isEnterpriseScopedQuery(query.queryKey) && query.queryKey.includes(previousEnterpriseId),
      });
    }
  }, [queryClient]);

  const value = useMemo<EnterpriseAccessContextValue>(() => {
    const effectiveAccess = effectiveAccessQuery.data;
    const capabilities = new Set(effectiveAccess?.capabilities ?? []);
    const modules = new Set((effectiveAccess?.assignments ?? []).flatMap((assignment) => assignment.modules));
    return {
      enterprises,
      activeEnterprise,
      activeEnterpriseId,
      activeScope: activeScopeState,
      availableScopes,
      effectiveAccess,
      visibleNavigation: navigationQuery.data,
      loading:
        enterprisesQuery.isLoading
        || Boolean(activeEnterpriseId && (effectiveAccessQuery.isLoading || availableScopesQuery.isLoading || navigationQuery.isLoading)),
      isExplicitAccess: Boolean(effectiveAccess && !effectiveAccess.compatibility_fallback),
      recentScopeIds,
      compareScopeIds,
      selectEnterprise: (enterpriseId) => {
        if (enterpriseId === activeEnterpriseId) return;
        clearScopedQueries(activeEnterpriseId);
        setActiveEnterpriseId(enterpriseId);
        setActiveScopeState(null);
        setCompareScopeIds([]);
      },
      selectScope: (scope) => {
        if (!activeEnterprise) return;
        clearScopedQueries(activeEnterprise.id);
        const next = scope
          ? { type: scope.node_type, id: scope.id, label: scope.name }
          : { type: 'enterprise' as const, id: activeEnterprise.id, label: activeEnterprise.name };
        setActiveScopeState(next);
        setCompareScopeIds([]);
        if (scope) {
          setRecentScopeIds((current) => {
            const updated = [scope.id, ...current.filter((id) => id !== scope.id)].slice(0, 8);
            localStorage.setItem(recentStorageKey, JSON.stringify(updated));
            return updated;
          });
        }
      },
      setCompareScopeIds,
      can: (capability) => capabilities.has(capability),
      canAny: (...requested) => requested.some((capability) => capabilities.has(capability)),
      canAll: (...requested) => requested.every((capability) => capabilities.has(capability)),
      canUseModule: (moduleKey) => (
        (modules.size === 0 || modules.has(moduleKey))
        && capabilities.has(`${moduleKey}.view`)
      ),
    };
  }, [
    activeEnterprise,
    activeEnterpriseId,
    activeScopeState,
    availableScopes,
    availableScopesQuery.isLoading,
    compareScopeIds,
    clearScopedQueries,
    effectiveAccessQuery.data,
    effectiveAccessQuery.isLoading,
    enterprises,
    enterprisesQuery.isLoading,
    navigationQuery.data,
    navigationQuery.isLoading,
    recentScopeIds,
  ]);

  return <EnterpriseAccessContext.Provider value={value}>{children}</EnterpriseAccessContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEnterpriseAccess() {
  const value = useContext(EnterpriseAccessContext);
  if (!value) throw new Error('useEnterpriseAccess must be used inside EnterpriseAccessProvider');
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCan(capability: string) {
  return useEnterpriseAccess().can(capability);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCanAny(...capabilities: string[]) {
  return useEnterpriseAccess().canAny(...capabilities);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCanAll(...capabilities: string[]) {
  return useEnterpriseAccess().canAll(...capabilities);
}
