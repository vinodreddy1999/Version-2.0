import axios from 'axios';

import type {
  AdminDashboard,
  AiReadiness,
  ApiEnvelope,
  CommandCenter,
  ConnectedSystem,
  DataCatalogEntry,
  DataMappingRule,
  DashboardAccessResult,
  DataQuality,
  DemoConfig,
  Company,
  FeatureFlag,
  HealthResponse,
  InventoryDashboard,
  AuditLog,
  ModuleRecord,
  ModuleInfo,
  NavigationSection,
  OperationalFootprint,
  RuntimeAnalytics,
  DataHubUpload,
  GetDataAuditEvent,
  GetDataCatalog,
  GetDataErrorLog,
  GetDataModel,
  GetDataPreview,
  GetDataRefreshRun,
  GetDataSavedConnection,
  PasswordPolicy,
  RuntimeLoginResult,
  RuntimeUser,
  SuperAdminImportTemplateCatalog,
} from '../types';
import type {
  DataAccessPolicy,
  EffectiveAccess,
  Enterprise,
  EnterpriseAuditEvent,
  EnterpriseDashboard,
  EnterpriseMember,
  Hierarchy,
  ModuleEntitlement,
  OrganizationalRelationship,
  OrganizationalScope,
  PermissionDecision,
  RoleAssignment,
  RoleTemplate,
  SupportAccessSession,
  TemporaryAccess,
  VisibleNavigation,
} from '../enterprise/types';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const apiBaseUrl = configuredBaseUrl?.replace(/\/$/, '') ?? '';
const tokenStorageKey = 'metam.runtime.token';

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export const apiConfig = {
  baseUrl: apiBaseUrl || 'same-origin',
};

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(tokenStorageKey);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function getEnvelope<T>(url: string): Promise<T> {
  const response = await api.get<ApiEnvelope<T>>(url);
  return response.data.data;
}

export type ListQuery = {
  cursor?: string;
  fields?: string[];
  limit?: number;
  offset?: number;
  search?: string;
  sort?: string;
};

function withListQuery(url: string, query?: ListQuery) {
  if (!query) return url;
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  if (query.search) params.set('search', query.search);
  if (query.sort) params.set('sort', query.sort);
  if (query.fields?.length) params.set('fields', query.fields.join(','));
  const serialized = params.toString();
  return serialized ? `${url}?${serialized}` : url;
}

export const backend = {
  health: async () => {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },
  performanceSummary: () => getEnvelope<{
    api: {
      average_latency_ms: number;
      cache_hit_ratio: number;
      error_rate: number;
      requests: number;
      slowest_paths: Array<{ path: string; count: number; average_latency_ms: number; errors: number }>;
    };
    frontend: {
      bundle_budget_kb: number;
      lazy_loading: string;
      route_chunks: string;
    };
    database: {
      connection_pool: string;
      index_strategy: string[];
      query_mode: string;
    };
    jobs: {
      background_workers: string;
      queue_status: string;
    };
  }>('/performance/summary'),
  modules: async () => {
    const response = await api.get<ModuleInfo[]>('/modules');
    return response.data;
  },
  companies: async () => {
    const response = await api.get<Company[]>('/companies');
    return response.data;
  },
  createCompany: async (payload: { name: string; code: string }) => {
    const response = await api.post<Company>('/companies', {
      tenant_id: 'tenant-demo-001',
      name: payload.name,
      code: payload.code,
    });
    return response.data;
  },
  featureFlags: async () => {
    const response = await api.get<FeatureFlag[]>('/feature-flags');
    return response.data;
  },
  setFeatureFlag: async (payload: { company_id: string; module_key: string; enabled: boolean }) => {
    const response = await api.post<FeatureFlag>('/feature-flags', {
      tenant_id: 'tenant-demo-001',
      company_id: payload.company_id,
      module_key: payload.module_key,
      enabled: payload.enabled,
    });
    return response.data;
  },
  navigation: () => getEnvelope<NavigationSection[]>('/frontend/navigation'),
  adminDashboard: () => getEnvelope<AdminDashboard>('/admin/dashboard'),
  operationalFootprint: () => getEnvelope<OperationalFootprint>('/admin/operational-footprint'),
  updateOperationalFootprint: async (payload: OperationalFootprint) => {
    const response = await api.put<ApiEnvelope<OperationalFootprint>>('/admin/operational-footprint', payload);
    return response.data.data;
  },
  dataQuality: () => getEnvelope<DataQuality>('/manufacturing-data-hub/data-quality'),
  aiReadiness: () => getEnvelope<AiReadiness>('/manufacturing-data-hub/ai-readiness'),
  updateAiReadiness: async (payload: { readiness: AiReadiness['readiness'] }) => {
    const response = await api.put<ApiEnvelope<AiReadiness>>('/manufacturing-data-hub/ai-readiness', payload);
    return response.data.data;
  },
  connectedSystems: () => getEnvelope<ConnectedSystem[]>('/manufacturing-data-hub/connected-systems'),
  createConnectedSystem: async (payload: Omit<ConnectedSystem, 'id'>) => {
    const response = await api.post<ApiEnvelope<ConnectedSystem>>('/manufacturing-data-hub/connected-systems', payload);
    return response.data.data;
  },
  updateConnectedSystem: async (id: string, payload: Omit<ConnectedSystem, 'id'>) => {
    const response = await api.put<ApiEnvelope<ConnectedSystem>>(`/manufacturing-data-hub/connected-systems/${id}`, payload);
    return response.data.data;
  },
  deleteConnectedSystem: async (id: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string }>>(`/manufacturing-data-hub/connected-systems/${id}`);
    return response.data.data;
  },
  dataCatalog: () => getEnvelope<DataCatalogEntry[]>('/manufacturing-data-hub/catalog'),
  createDataCatalogEntry: async (payload: Omit<DataCatalogEntry, 'id'>) => {
    const response = await api.post<ApiEnvelope<DataCatalogEntry>>('/manufacturing-data-hub/catalog', payload);
    return response.data.data;
  },
  updateDataCatalogEntry: async (id: string, payload: Omit<DataCatalogEntry, 'id'>) => {
    const response = await api.put<ApiEnvelope<DataCatalogEntry>>(`/manufacturing-data-hub/catalog/${id}`, payload);
    return response.data.data;
  },
  deleteDataCatalogEntry: async (id: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string }>>(`/manufacturing-data-hub/catalog/${id}`);
    return response.data.data;
  },
  dataMappings: () => getEnvelope<DataMappingRule[]>('/manufacturing-data-hub/mappings'),
  createDataMapping: async (payload: Omit<DataMappingRule, 'id'>) => {
    const response = await api.post<ApiEnvelope<DataMappingRule>>('/manufacturing-data-hub/mappings', payload);
    return response.data.data;
  },
  updateDataMapping: async (id: string, payload: Omit<DataMappingRule, 'id'>) => {
    const response = await api.put<ApiEnvelope<DataMappingRule>>(`/manufacturing-data-hub/mappings/${id}`, payload);
    return response.data.data;
  },
  deleteDataMapping: async (id: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string }>>(`/manufacturing-data-hub/mappings/${id}`);
    return response.data.data;
  },
  uploads: () => getEnvelope<DataHubUpload[]>('/manufacturing-data-hub/uploads'),
  superAdminImportTemplates: () => getEnvelope<SuperAdminImportTemplateCatalog>('/manufacturing-data-hub/super-admin/templates'),
  downloadSuperAdminImportTemplate: async (fileName: string) => {
    const response = await api.get(`/manufacturing-data-hub/super-admin/templates/${encodeURIComponent(fileName)}`, {
      responseType: 'blob',
    });
    const contentType = response.headers['content-type'];
    const blob = new Blob([response.data], { type: typeof contentType === 'string' ? contentType : 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  uploadFile: async (file: File, companyId?: string, plant?: { plantId?: string; plantName?: string }) => {
    const form = new FormData();
    form.append('file', file);
    if (companyId) {
      form.append('company_id', companyId);
    }
    if (plant?.plantId) {
      form.append('plant_id', plant.plantId);
    }
    if (plant?.plantName) {
      form.append('plant_name', plant.plantName);
    }
    const response = await api.post<ApiEnvelope<DataHubUpload>>('/manufacturing-data-hub/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
  createCloudSource: async (payload: {
    company_id?: string;
    provider: string;
    resource_name: string;
    resource_url: string;
    file_format: string;
    sync_mode: string;
    auth_method?: string;
    connection_details?: Record<string, unknown>;
  }) => {
    const response = await api.post<ApiEnvelope<DataHubUpload>>('/manufacturing-data-hub/cloud-sources', payload);
    return response.data.data;
  },
  getDataConnectors: () => getEnvelope<GetDataCatalog>('/manufacturing-data-hub/get-data/connectors'),
  getDataSavedConnections: () => getEnvelope<GetDataSavedConnection[]>('/manufacturing-data-hub/get-data/saved-connections'),
  createGetDataConnection: async (payload: {
    company_id?: string;
    connector_key: string;
    connector_name: string;
    connector_category: string;
    connection_name: string;
    auth_method: string;
    connection_details: Record<string, unknown>;
    credentials: Record<string, unknown>;
    refresh_mode: string;
    destination_module: string;
  }) => {
    const response = await api.post<ApiEnvelope<GetDataSavedConnection>>('/manufacturing-data-hub/get-data/saved-connections', payload);
    return response.data.data;
  },
  deleteGetDataConnection: async (id: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string }>>(`/manufacturing-data-hub/get-data/saved-connections/${id}`);
    return response.data.data;
  },
  testGetDataConnection: async (payload: {
    company_id?: string;
    connector_key: string;
    connector_name: string;
    connector_category: string;
    auth_method: string;
    connection_details: Record<string, unknown>;
    credentials: Record<string, unknown>;
  }) => {
    const response = await api.post<ApiEnvelope<Record<string, unknown>>>('/manufacturing-data-hub/get-data/test-connection', payload);
    return response.data.data;
  },
  getDataMetadata: async (connectionId: string) => getEnvelope<{ connection_id: string; assets: Array<Record<string, unknown>> }>(`/manufacturing-data-hub/get-data/connections/${connectionId}/metadata`),
  saveGetDataSelection: async (connectionId: string, payload: { selected_assets: string[]; selected_columns: string[] }) => {
    const response = await api.post<ApiEnvelope<GetDataSavedConnection>>(`/manufacturing-data-hub/get-data/connections/${connectionId}/selection`, payload);
    return response.data.data;
  },
  getDataPreview: async (connectionId: string) => getEnvelope<GetDataPreview>(`/manufacturing-data-hub/get-data/connections/${connectionId}/preview`),
  transformGetDataPreview: async (payload: { company_id?: string; connection_id: string; recipe_name: string; operations: Array<Record<string, unknown>> }) => {
    const response = await api.post<ApiEnvelope<{ id: string; operations: Array<Record<string, unknown>>; preview_rows: Array<Record<string, unknown>> }>>('/manufacturing-data-hub/get-data/transform-preview', payload);
    return response.data.data;
  },
  validateGetDataMapping: async (payload: { company_id?: string; connection_id?: string; destination_module: string; mappings: Array<Record<string, unknown>> }) => {
    const response = await api.post<ApiEnvelope<{ valid: boolean; validation_results: Array<Record<string, unknown>> }>>('/manufacturing-data-hub/get-data/field-mapping/validate', payload);
    return response.data.data;
  },
  createGetDataRelationship: async (payload: { company_id?: string; left_table: string; left_column: string; right_table: string; right_column: string; cardinality: string; direction: string; active: boolean }) => {
    const response = await api.post<ApiEnvelope<Record<string, unknown>>>('/manufacturing-data-hub/get-data/model/relationships', payload);
    return response.data.data;
  },
  getDataModel: () => getEnvelope<GetDataModel>('/manufacturing-data-hub/get-data/model'),
  runGetDataRefresh: async (payload: { company_id?: string; connection_id: string; refresh_mode: string; incremental_column?: string; schedule?: Record<string, unknown> }) => {
    const response = await api.post<ApiEnvelope<Record<string, unknown>>>('/manufacturing-data-hub/get-data/refresh', payload);
    return response.data.data;
  },
  getDataRefreshHistory: () => getEnvelope<GetDataRefreshRun[]>('/manufacturing-data-hub/get-data/refresh-history'),
  getDataErrors: () => getEnvelope<GetDataErrorLog[]>('/manufacturing-data-hub/get-data/errors'),
  getDataAudit: () => getEnvelope<GetDataAuditEvent[]>('/manufacturing-data-hub/get-data/audit'),
  commandCenter: () => getEnvelope<CommandCenter>('/manufacturing-intelligence/command-center'),
  inventoryDashboard: () => getEnvelope<InventoryDashboard>('/inventory/dashboard'),
  evaluateDashboardAccess: async () => {
    const response = await api.post<ApiEnvelope<DashboardAccessResult>>('/admin/access-control/evaluate-dashboard', {
      tenant_dashboard_enabled: true,
      role_permission: true,
      user_permission: true,
      data_scope_permission: true,
    });
    return response.data.data;
  },
  login: async (email: string, password: string) => {
    const response = await api.post<ApiEnvelope<RuntimeLoginResult>>('/runtime/auth/login', { email, password });
    window.localStorage.setItem(tokenStorageKey, response.data.data.access_token);
    return response.data.data;
  },
  demoConfig: () => getEnvelope<DemoConfig>('/runtime/auth/demo-config'),
  demoLogin: async (role: RuntimeUser['role']) => {
    const response = await api.post<ApiEnvelope<RuntimeLoginResult>>('/runtime/auth/demo-login', { role });
    window.localStorage.setItem(tokenStorageKey, response.data.data.access_token);
    return response.data.data;
  },
  passwordPolicy: () => getEnvelope<PasswordPolicy>('/runtime/auth/password-policy'),
  generatePassword: async () => {
    const response = await api.post<ApiEnvelope<{ password: string; criteria: PasswordPolicy }>>('/runtime/auth/generate-password');
    return response.data.data;
  },
  forgotPassword: async (email: string) => {
    const response = await api.post<ApiEnvelope<{ email: string; reset_link?: string; expires_in_minutes?: number }>>('/runtime/auth/forgot-password', { email });
    return response.data.data;
  },
  resetPassword: async (payload: { token: string; new_password: string; confirm_password: string }) => {
    const response = await api.post<ApiEnvelope<{ email: string }>>('/runtime/auth/reset-password', payload);
    return response.data.data;
  },
  changePassword: async (payload: { current_password: string; new_password: string; confirm_password: string }) => {
    const response = await api.post<ApiEnvelope<RuntimeUser>>('/runtime/auth/change-password', payload);
    return response.data.data;
  },
  logout: () => {
    window.localStorage.removeItem(tokenStorageKey);
  },
  currentUser: () => getEnvelope<RuntimeUser>('/runtime/auth/me'),
  enterprises: () => getEnvelope<Enterprise[]>('/enterprises'),
  enterpriseHierarchy: (enterpriseId: string) => getEnvelope<Hierarchy>(`/enterprises/${enterpriseId}/hierarchy`),
  enterpriseMembers: (enterpriseId: string) => getEnvelope<EnterpriseMember[]>(`/enterprises/${enterpriseId}/members`),
  enterpriseDashboard: (
    enterpriseId: string,
    scopeType: string,
    scopeId: string,
    compareScopeIds: string[] = [],
  ) => {
    const search = new URLSearchParams({ scope_type: scopeType, scope_id: scopeId });
    compareScopeIds.forEach((id) => search.append('compare_scope_ids', id));
    return getEnvelope<EnterpriseDashboard>(`/enterprises/${enterpriseId}/dashboard?${search.toString()}`);
  },
  createHierarchyNode: async (enterpriseId: string, payload: {
    node_type: string;
    code: string;
    name: string;
    status?: string;
    source_entity_type?: string;
    source_entity_id?: string;
    currency?: string;
    timezone?: string;
    metadata_json?: Record<string, unknown>;
    parent_node_id?: string;
    dimension?: 'geography' | 'business' | 'legal' | 'operational';
  }) => {
    const response = await api.post<ApiEnvelope<OrganizationalScope>>(`/enterprises/${enterpriseId}/hierarchy/nodes`, payload);
    return response.data.data;
  },
  updateHierarchyNode: async (enterpriseId: string, nodeId: string, payload: {
    name?: string;
    status?: string;
    currency?: string;
    timezone?: string;
    metadata_json?: Record<string, unknown>;
  }) => {
    const response = await api.patch<ApiEnvelope<OrganizationalScope>>(`/enterprises/${enterpriseId}/hierarchy/nodes/${nodeId}`, payload);
    return response.data.data;
  },
  deleteHierarchyNode: async (enterpriseId: string, nodeId: string, reason: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string; status: string }>>(
      `/enterprises/${enterpriseId}/hierarchy/nodes/${nodeId}?reason=${encodeURIComponent(reason)}`,
    );
    return response.data.data;
  },
  createHierarchyRelationship: async (
    enterpriseId: string,
    payload: {
      dimension: OrganizationalRelationship['dimension'];
      parent_node_id: string;
      child_node_id: string;
      reason: string;
    },
  ) => {
    const response = await api.post<ApiEnvelope<OrganizationalRelationship>>(
      `/enterprises/${enterpriseId}/hierarchy/relationships`,
      payload,
    );
    return response.data.data;
  },
  deleteHierarchyRelationship: async (enterpriseId: string, relationshipId: string, reason: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string; status: string }>>(
      `/enterprises/${enterpriseId}/hierarchy/relationships/${relationshipId}?reason=${encodeURIComponent(reason)}`,
    );
    return response.data.data;
  },
  roleTemplates: (enterpriseId: string) => getEnvelope<RoleTemplate[]>(`/enterprises/${enterpriseId}/role-templates`),
  moduleEntitlements: (enterpriseId: string) =>
    getEnvelope<ModuleEntitlement[]>(`/enterprises/${enterpriseId}/module-entitlements`),
  updateModuleEntitlement: async (
    enterpriseId: string,
    moduleKey: string,
    payload: {
      enabled: boolean;
      valid_from?: string | null;
      valid_until?: string | null;
      rules?: Record<string, unknown>;
      reason: string;
    },
  ) => {
    const response = await api.patch<ApiEnvelope<ModuleEntitlement>>(
      `/enterprises/${enterpriseId}/module-entitlements/${encodeURIComponent(moduleKey)}`,
      payload,
    );
    return response.data.data;
  },
  dataPolicies: (enterpriseId: string) =>
    getEnvelope<DataAccessPolicy[]>(`/enterprises/${enterpriseId}/data-policies`),
  createDataPolicy: async (
    enterpriseId: string,
    payload: {
      resource_pattern: string;
      classification: string;
      masked_fields: string[];
      hidden_fields: string[];
      reason: string;
    },
  ) => {
    const response = await api.post<ApiEnvelope<DataAccessPolicy>>(
      `/enterprises/${enterpriseId}/data-policies`,
      payload,
    );
    return response.data.data;
  },
  temporaryAccess: (enterpriseId: string) =>
    getEnvelope<TemporaryAccess[]>(`/enterprises/${enterpriseId}/temporary-access`),
  supportAccessSessions: (enterpriseId: string) =>
    getEnvelope<SupportAccessSession[]>(`/enterprises/${enterpriseId}/support-access-sessions`),
  enterpriseAuditEvents: (enterpriseId: string, limit = 100) =>
    getEnvelope<EnterpriseAuditEvent[]>(`/enterprises/${enterpriseId}/audit-events?limit=${limit}`),
  effectiveAccess: (userId: string, enterpriseId: string) =>
    getEnvelope<EffectiveAccess>(`/users/${userId}/effective-access?enterprise_id=${encodeURIComponent(enterpriseId)}`),
  availableScopes: (userId: string, enterpriseId: string) =>
    getEnvelope<OrganizationalScope[]>(`/users/${userId}/available-scopes?enterprise_id=${encodeURIComponent(enterpriseId)}`),
  enterpriseNavigation: (userId: string, enterpriseId: string) =>
    getEnvelope<VisibleNavigation>(`/users/${userId}/navigation?enterprise_id=${encodeURIComponent(enterpriseId)}`),
  roleAssignments: (userId: string, enterpriseId: string) =>
    getEnvelope<RoleAssignment[]>(`/users/${userId}/role-assignments?enterprise_id=${encodeURIComponent(enterpriseId)}`),
  createRoleAssignment: async (userId: string, payload: Omit<RoleAssignment, 'id' | 'user_id' | 'status'>) => {
    const response = await api.post<ApiEnvelope<RoleAssignment>>(`/users/${userId}/role-assignments`, payload);
    return response.data.data;
  },
  revokeRoleAssignment: async (userId: string, assignmentId: string, reason: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string; status: string }>>(
      `/users/${userId}/role-assignments/${assignmentId}?reason=${encodeURIComponent(reason)}`,
    );
    return response.data.data;
  },
  explainPermission: async (userId: string, payload: {
    enterprise_id: string;
    scope_type: string;
    scope_id: string;
    capability: string;
    domain?: string;
    module_key?: string;
    data_classification?: string;
    record_owner_id?: string;
  }) => {
    const response = await api.post<ApiEnvelope<PermissionDecision>>(`/users/${userId}/permission-explanation`, payload);
    return response.data.data;
  },
  createSupportAccess: async (payload: {
    enterprise_id: string;
    reason: string;
    duration_minutes: number;
    capabilities: string[];
    allowed_modules: string[];
    acting_as_user_id?: string;
  }) => {
    const response = await api.post<ApiEnvelope<Record<string, unknown>>>('/support-access-sessions', payload);
    return response.data.data;
  },
  revokeSupportAccess: async (sessionId: string, reason: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string; revoked_at: string }>>(
      `/support-access-sessions/${sessionId}?reason=${encodeURIComponent(reason)}`,
    );
    return response.data.data;
  },
  users: (query?: ListQuery) => getEnvelope<RuntimeUser[]>(withListQuery('/runtime/users', query)),
  createUser: async (payload: {
    email: string;
    name: string;
    password: string;
    role: RuntimeUser['role'];
    is_active: boolean;
    company_id?: string | null;
    plant_id?: string | null;
  }) => {
    const response = await api.post<ApiEnvelope<RuntimeUser>>('/runtime/users', payload);
    return response.data.data;
  },
  updateUser: async (id: string, payload: Partial<Pick<RuntimeUser, 'name' | 'role' | 'is_active'>>) => {
    const response = await api.put<ApiEnvelope<RuntimeUser>>(`/runtime/users/${id}`, payload);
    return response.data.data;
  },
  resetUserPassword: async (id: string, payload: { new_password: string; confirm_password: string; force_change_on_login: boolean }) => {
    const response = await api.post<ApiEnvelope<RuntimeUser>>(`/runtime/users/${id}/reset-password`, payload);
    return response.data.data;
  },
  records: (moduleKey?: string, query?: ListQuery) => {
    const url = moduleKey ? withListQuery('/runtime/records', { ...query, search: query?.search }) : withListQuery('/runtime/records', query);
    return getEnvelope<ModuleRecord[]>(moduleKey ? `${url}${url.includes('?') ? '&' : '?'}module_key=${moduleKey}` : url);
  },
  createRecord: async (payload: Omit<ModuleRecord, 'id' | 'created_at'>) => {
    const response = await api.post<ApiEnvelope<ModuleRecord>>('/runtime/records', payload);
    return response.data.data;
  },
  updateRecord: async (id: string, payload: Partial<Omit<ModuleRecord, 'id' | 'created_at'>>) => {
    const response = await api.put<ApiEnvelope<ModuleRecord>>(`/runtime/records/${id}`, payload);
    return response.data.data;
  },
  deleteRecord: async (id: string) => {
    const response = await api.delete<ApiEnvelope<{ id: string }>>(`/runtime/records/${id}`);
    return response.data.data;
  },
  analytics: () => getEnvelope<RuntimeAnalytics>('/runtime/analytics/summary'),
  auditLogs: (query?: ListQuery) => getEnvelope<AuditLog[]>(withListQuery('/runtime/audit-logs', query)),
  factoryPulseDashboard: async () => (await api.get<{ data: Record<string, unknown> }>('/factorypulse/dashboard')).data.data,
  factoryPulseOrders: async () => (await api.get<{ data: Array<Record<string, unknown>> }>('/factorypulse/production-orders')).data.data,
  factoryPulseDowntime: async () => (await api.get<{ data: Array<Record<string, unknown>> }>('/factorypulse/downtime-events')).data.data,
  factoryPulseScrap: async () => (await api.get<{ data: Array<Record<string, unknown>> }>('/factorypulse/scrap-events')).data.data,
  factoryPulseActions: async () => (await api.get<{ data: Array<Record<string, unknown>> }>('/factorypulse/actions')).data.data,
  factoryPulseProgramme: async () => (await api.get<{ data: Record<string, unknown> }>('/factorypulse/programme')).data.data,
  factoryPulseKpis: async () => (await api.get<{ data: Array<Record<string, unknown>> }>('/factorypulse/kpi-dictionary')).data.data,
};
