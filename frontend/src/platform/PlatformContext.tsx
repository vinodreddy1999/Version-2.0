import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { belongsToClient, isClientScopedQuery } from '../lib/queryKeys';
import type { RuntimeUser } from '../types';
import { initialPlatformState, initialWidgets, platformModules } from './data';
import type { PlatformAuditLog, PlatformClient, PlatformState, PlatformUser, WidgetConfig } from './types';

const storageKey = 'metam.platform.demo.v1';

type PlatformContextValue = {
  state: PlatformState;
  runtimeUser: RuntimeUser;
  platformUser: PlatformUser;
  selectedClientId: string | null;
  selectedClient?: PlatformClient;
  isPlatformContext: boolean;
  currency: PlatformClient['currency'] | 'USD';
  canSelectPlatform: boolean;
  selectClient: (clientId: string | null) => void;
  createClient: (client: Omit<PlatformClient, 'clientId' | 'createdDate' | 'disabledModules'>) => PlatformClient;
  updateClient: (clientId: string, client: Omit<PlatformClient, 'clientId' | 'createdDate' | 'disabledModules'>, action?: string) => PlatformClient;
  createUser: (user: Omit<PlatformUser, 'userId' | 'fullName' | 'clientName' | 'createdDate' | 'lastLogin'>) => PlatformUser;
  updateUser: (userId: string, payload: Partial<PlatformUser>, action?: string) => void;
  replacePlatformState: (next: PlatformState) => void;
  recordAudit: (input: Omit<PlatformAuditLog, 'logId' | 'timestamp'>) => void;
  updateWidget: (widgetId: string, payload: Partial<WidgetConfig>) => void;
  resetWidgets: () => void;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

function loadState() {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return initialPlatformState;
    const saved = JSON.parse(value) as PlatformState;
    const usersByEmail = new Map(saved.users.map((user) => [user.email.toLowerCase(), user]));
    initialPlatformState.users.forEach((user) => usersByEmail.set(user.email.toLowerCase(), user));
    const clientsById = new Map(saved.clients.map((client) => [client.clientId, client]));
    initialPlatformState.clients.forEach((client) => clientsById.set(client.clientId, client));
    return {
      ...saved,
      clients: Array.from(clientsById.values()),
      users: Array.from(usersByEmail.values()),
    };
  } catch {
    return initialPlatformState;
  }
}

function nextId(prefix: string, values: string[]) {
  const next = Math.max(0, ...values.map((value) => Number(value.split('-').at(-1)) || 0)) + 1;
  return `${prefix}-${String(next).padStart(6, '0')}`;
}

export function PlatformProvider({ runtimeUser, children }: { runtimeUser: RuntimeUser; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PlatformState>(loadState);
  const canSelectPlatform = runtimeUser.role === 'super_admin';
  const matchedUser = state.users.find((user) => user.email.toLowerCase() === runtimeUser.email.toLowerCase()) ?? state.users.find((user) => user.email === 'user@metam.local')!;
  const [selectedClientId, setSelectedClientId] = useState<string | null>(() => canSelectPlatform ? null : matchedUser.clientId ?? state.clients[0].clientId);
  const selectedClient = state.clients.find((client) => client.clientId === selectedClientId);

  function persist(next: PlatformState) {
    setState(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function addAudit(next: PlatformState, log: Omit<PlatformAuditLog, 'logId' | 'timestamp'>) {
    return { ...next, auditLogs: [{ ...log, logId: nextId('LOG', next.auditLogs.map((item) => item.logId)), timestamp: new Date().toISOString() }, ...next.auditLogs] };
  }

  const value = useMemo<PlatformContextValue>(() => ({
    state,
    runtimeUser,
    platformUser: matchedUser,
    selectedClientId,
    selectedClient,
    isPlatformContext: selectedClientId === null,
    currency: selectedClient?.currency ?? 'USD',
    canSelectPlatform,
    selectClient: (clientId) => {
      const nextClientId = canSelectPlatform ? clientId : matchedUser.clientId ?? state.clients[0].clientId;
      if (nextClientId === selectedClientId) return;
      const previousClientId = selectedClientId;
      void queryClient.cancelQueries({ predicate: (query) => isClientScopedQuery(query.queryKey) });
      queryClient.removeQueries({ predicate: (query) => belongsToClient(query.queryKey, previousClientId) });
      setSelectedClientId(nextClientId);
    },
    createClient: (input) => {
      const clientId = nextId('CLT', state.clients.map((client) => client.clientId));
      const client: PlatformClient = {
        ...input,
        clientId,
        disabledModules: platformModules.filter((module) => module !== 'Admin' && !input.enabledModules.includes(module)),
        createdDate: new Date().toISOString().slice(0, 10),
      };
      let next = { ...state, clients: [...state.clients, client] };
      next = addAudit(next, { clientId, clientName: client.clientName, userId: matchedUser.userId, moduleName: 'Admin', action: 'Created client' });
      persist(next);
      return client;
    },
    updateClient: (clientId, input, action = 'Updated client access') => {
      const existing = state.clients.find((client) => client.clientId === clientId)!;
      const client: PlatformClient = {
        ...existing,
        ...input,
        disabledModules: platformModules.filter((module) => module !== 'Admin' && !input.enabledModules.includes(module)),
      };
      let next = { ...state, clients: state.clients.map((item) => item.clientId === clientId ? client : item) };
      next = addAudit(next, { clientId, clientName: client.clientName, userId: matchedUser.userId, moduleName: 'Admin', action, description: `${action} for ${client.clientName}`, status: 'Completed' });
      persist(next);
      return client;
    },
    createUser: (input) => {
      const client = input.clientId ? state.clients.find((item) => item.clientId === input.clientId) : undefined;
      const userId = nextId('USR', state.users.map((user) => user.userId));
      const user: PlatformUser = { ...input, userId, fullName: `${input.firstName} ${input.lastName}`.trim(), clientName: client?.clientName ?? 'Platform', createdDate: new Date().toISOString().slice(0, 10), lastLogin: 'Never' };
      let next = { ...state, users: [...state.users, user] };
      next = addAudit(next, { clientId: client?.clientId ?? null, clientName: client?.clientName ?? 'Platform', userId, moduleName: 'Admin', action: 'Created User', description: `Created user ${user.fullName}`, status: 'Completed' });
      persist(next);
      return user;
    },
    updateUser: (userId, payload, action = 'Updated user') => {
      const currentUser = state.users.find((user) => user.userId === userId)!;
      const updatedUser = { ...currentUser, ...payload };
      let next = { ...state, users: state.users.map((user) => user.userId === userId ? updatedUser : user) };
      next = addAudit(next, { clientId: updatedUser.clientId, clientName: updatedUser.clientName, userId: matchedUser.userId, moduleName: 'Admin', action, description: `${action}: ${updatedUser.fullName}`, status: 'Completed' });
      persist(next);
    },
    replacePlatformState: (next) => persist(next),
    recordAudit: (input) => persist(addAudit(state, input)),
    updateWidget: (widgetId, payload) => persist({ ...state, widgets: state.widgets.map((widget) => widget.widgetId === widgetId ? { ...widget, ...payload } : widget) }),
    resetWidgets: () => persist({ ...state, widgets: initialWidgets }),
  }), [state, runtimeUser, matchedUser, selectedClientId, selectedClient, canSelectPlatform, queryClient]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

// Provider and hook intentionally share this module as one context boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform must be used inside PlatformProvider');
  return value;
}
