from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


ScopeType = Literal[
    "platform",
    "enterprise",
    "legal_entity",
    "business_unit",
    "region",
    "country",
    "site_group",
    "plant",
    "warehouse",
    "department",
    "area",
    "line",
    "shift",
    "team",
    "client",
    "company",
]


class EnterpriseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=80)
    tenant_id: str = Field(min_length=2, max_length=80)
    default_currency: str = "USD"
    default_timezone: str = "UTC"


class HierarchyNodeCreate(BaseModel):
    node_type: ScopeType
    code: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=200)
    status: str = "active"
    source_entity_type: str | None = None
    source_entity_id: str | None = None
    currency: str | None = None
    timezone: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    parent_node_id: str | None = None
    dimension: Literal["geography", "business", "legal", "operational"] | None = None

    @model_validator(mode="after")
    def validate_relationship(self):
        if bool(self.parent_node_id) != bool(self.dimension):
            raise ValueError("parent_node_id and dimension must be supplied together")
        return self


class HierarchyNodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    status: str | None = None
    currency: str | None = None
    timezone: str | None = None
    metadata_json: dict[str, Any] | None = None


class HierarchyRelationshipCreate(BaseModel):
    dimension: Literal["geography", "business", "legal", "operational"]
    parent_node_id: str = Field(min_length=2, max_length=80)
    child_node_id: str = Field(min_length=2, max_length=80)
    reason: str = Field(min_length=5)

    @model_validator(mode="after")
    def validate_nodes(self):
        if self.parent_node_id == self.child_node_id:
            raise ValueError("A node cannot be its own parent")
        return self


class RoleTemplateCreate(BaseModel):
    key: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=2, max_length=160)
    description: str = ""
    role_level: str = "enterprise"
    capabilities: list[str] = Field(default_factory=list)
    default_domains: list[str] = Field(default_factory=list)
    default_modules: list[str] = Field(default_factory=list)
    allowed_classifications: list[str] = Field(default_factory=lambda: ["public", "internal"])
    read_only: bool = False
    external_identity_type: str | None = None


class RoleTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    capabilities: list[str] | None = None
    default_domains: list[str] | None = None
    default_modules: list[str] | None = None
    allowed_classifications: list[str] | None = None
    read_only: bool | None = None
    status: str | None = None


class RoleAssignmentCreate(BaseModel):
    enterprise_id: str
    role_template_id: str
    scope_type: ScopeType
    scope_id: str
    include_descendants: bool = False
    domains: list[str] = Field(default_factory=list)
    allowed_modules: list[str] = Field(default_factory=list)
    capability_overrides: list[str] = Field(default_factory=list)
    denied_capabilities: list[str] = Field(default_factory=list)
    allowed_classifications: list[str] = Field(default_factory=list)
    record_ownership: Literal["scope", "self", "assigned", "external_organization"] = "scope"
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be after valid_from")
        return self


class RoleAssignmentUpdate(BaseModel):
    include_descendants: bool | None = None
    domains: list[str] | None = None
    allowed_modules: list[str] | None = None
    capability_overrides: list[str] | None = None
    denied_capabilities: list[str] | None = None
    allowed_classifications: list[str] | None = None
    record_ownership: str | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    reason: str | None = None
    status: str | None = None


class PermissionExplanationRequest(BaseModel):
    enterprise_id: str
    scope_type: ScopeType
    scope_id: str
    capability: str
    domain: str | None = None
    module_key: str | None = None
    data_classification: str = "internal"
    record_owner_id: str | None = None


class SupportAccessCreate(BaseModel):
    enterprise_id: str
    reason: str = Field(min_length=10)
    duration_minutes: int = Field(default=60, ge=5, le=480)
    capabilities: list[str] = Field(default_factory=lambda: ["dashboard.view", "support.impersonate"])
    allowed_modules: list[str] = Field(default_factory=list)
    acting_as_user_id: str | None = None


class ModuleEntitlementUpdate(BaseModel):
    enabled: bool
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    rules: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(min_length=5)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be after valid_from")
        return self


class DataPolicyCreate(BaseModel):
    resource_pattern: str = Field(min_length=2, max_length=180)
    classification: Literal[
        "public",
        "internal",
        "confidential",
        "restricted",
        "personal",
        "financial",
        "security_sensitive",
        "medical_or_safety_sensitive",
    ]
    masked_fields: list[str] = Field(default_factory=list)
    hidden_fields: list[str] = Field(default_factory=list)
    reason: str = Field(min_length=5)


class DataPolicyUpdate(BaseModel):
    classification: str | None = None
    masked_fields: list[str] | None = None
    hidden_fields: list[str] | None = None
    status: str | None = None
    reason: str = Field(min_length=5)
