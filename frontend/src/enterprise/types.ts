export type Enterprise = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  status: string;
  default_currency: string;
  default_timezone: string;
};

export type ScopeType =
  | 'enterprise'
  | 'legal_entity'
  | 'business_unit'
  | 'region'
  | 'country'
  | 'site_group'
  | 'plant'
  | 'warehouse'
  | 'department'
  | 'area'
  | 'line'
  | 'shift'
  | 'team';

export type OrganizationalScope = {
  id: string;
  enterprise_id: string;
  node_type: ScopeType;
  code: string;
  name: string;
  status: string;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  currency?: string | null;
  timezone?: string | null;
  metadata_json: Record<string, unknown>;
};

export type EffectiveScope = {
  scope_type: ScopeType;
  scope_id: string;
  include_descendants: boolean;
  domains: string[];
  modules: string[];
  valid_until?: string | null;
};

export type EffectiveAccess = {
  enterprise_id: string;
  enterprise_name: string;
  membership?: {
    status: string;
    identity_type: string;
    external_organization_id?: string | null;
  } | null;
  role_keys: string[];
  assignments: EffectiveScope[];
  capabilities: string[];
  scopes: EffectiveScope[];
  compatibility_fallback: boolean;
};

export type VisibleNavigation = {
  experience: 'global' | 'regional' | 'plant' | 'frontline' | 'supplier' | 'customer';
  items: string[];
  role_keys: string[];
  enterprise_id: string;
};

export type PermissionDecision = {
  allowed: boolean;
  code: string;
  summary: string;
  reasons: string[];
  assignment_ids: string[];
  role_keys: string[];
  masked: boolean;
  effective_scope_ids: string[];
};

export type Hierarchy = {
  enterprise_id: string;
  nodes: OrganizationalScope[];
  relationships: OrganizationalRelationship[];
  dimensions: string[];
};

export type OrganizationalRelationship = {
  id: string;
  enterprise_id: string;
  dimension: 'geography' | 'business' | 'legal' | 'operational';
  parent_node_id: string;
  child_node_id: string;
  status: string;
};

export type EnterpriseMember = {
  membership: {
    id: string;
    enterprise_id: string;
    user_id: string;
    identity_type: string;
    external_organization_id?: string | null;
    status: string;
    valid_from?: string | null;
    valid_until?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    company_id?: string | null;
    plant_id?: string | null;
  };
};

export type RoleTemplate = {
  id: string;
  enterprise_id?: string | null;
  key: string;
  name: string;
  description: string;
  role_level: string;
  default_domains: string[];
  default_modules: string[];
  allowed_classifications: string[];
  read_only: boolean;
  external_identity_type?: string | null;
  status: string;
  capabilities: string[];
};

export type RoleAssignment = {
  id: string;
  enterprise_id: string;
  user_id: string;
  role_template_id: string;
  scope_type: ScopeType;
  scope_id: string;
  include_descendants: boolean;
  domains: string[];
  allowed_modules: string[];
  capability_overrides: string[];
  denied_capabilities: string[];
  allowed_classifications: string[];
  record_ownership: string;
  valid_from?: string | null;
  valid_until?: string | null;
  reason?: string | null;
  status: string;
};

export type EnterpriseScopeAggregate = {
  scope_type: string;
  scope_id: string;
  scope_label: string;
  total_records: number;
  open_records: number;
  total_quantity: number;
  module_count: number;
  modules: Array<{
    module_key: string;
    record_count: number;
    total_quantity: number;
  }>;
  data_through?: string | null;
};

export type EnterpriseDashboard = {
  enterprise_id: string;
  enterprise_name: string;
  currency: string;
  timezone: string;
  primary: EnterpriseScopeAggregate;
  comparisons: EnterpriseScopeAggregate[];
  normalization_warning?: string | null;
};

export type ModuleEntitlement = {
  id: string;
  enterprise_id: string;
  module_key: string;
  enabled: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  rules: Record<string, unknown>;
};

export type DataAccessPolicy = {
  id: string;
  enterprise_id: string;
  resource_pattern: string;
  classification: string;
  masked_fields: string[];
  hidden_fields: string[];
  status: string;
};

export type TemporaryAccess = {
  id: string;
  enterprise_id: string;
  assignment_id: string;
  approved_by_id: string;
  reason: string;
  valid_from: string;
  valid_until: string;
  revoked_at?: string | null;
  effective: boolean;
  assignment: RoleAssignment;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type SupportAccessSession = {
  id: string;
  platform_user_id: string;
  enterprise_id: string;
  acting_as_user_id?: string | null;
  capabilities: string[];
  allowed_modules: string[];
  reason: string;
  valid_from: string;
  valid_until: string;
  revoked_at?: string | null;
  created_at: string;
};

export type EnterpriseAuditEvent = {
  id: string;
  enterprise_id?: string | null;
  actor_id: string;
  acting_as_id?: string | null;
  scope_type?: string | null;
  scope_id?: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  created_at: string;
};
