from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Enterprise(Base):
    __tablename__ = "enterprises"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(80), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    default_currency: Mapped[str] = mapped_column(String(12), default="USD")
    default_timezone: Mapped[str] = mapped_column(String(80), default="UTC")
    created_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnterpriseMembership(Base):
    __tablename__ = "enterprise_memberships"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(80), ForeignKey("users.id"), index=True)
    identity_type: Mapped[str] = mapped_column(String(40), default="employee")
    external_organization_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("enterprise_id", "user_id"),
        Index("ix_enterprise_memberships_user_status", "user_id", "status"),
    )


class OrganizationalNode(Base):
    __tablename__ = "organizational_nodes"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    node_type: Mapped[str] = mapped_column(String(40), index=True)
    code: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default="active")
    source_entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_entity_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    currency: Mapped[str | None] = mapped_column(String(12), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("enterprise_id", "node_type", "code"),
        Index("ix_organizational_nodes_enterprise_type_status", "enterprise_id", "node_type", "status"),
    )


class OrganizationalRelationship(Base):
    __tablename__ = "organizational_relationships"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    dimension: Mapped[str] = mapped_column(String(30), index=True)
    parent_node_id: Mapped[str] = mapped_column(String(80), ForeignKey("organizational_nodes.id"), index=True)
    child_node_id: Mapped[str] = mapped_column(String(80), ForeignKey("organizational_nodes.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    created_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("enterprise_id", "dimension", "parent_node_id", "child_node_id"),
        Index("ix_org_relationship_parent_dimension", "enterprise_id", "parent_node_id", "dimension"),
        Index("ix_org_relationship_child_dimension", "enterprise_id", "child_node_id", "dimension"),
    )


class RoleTemplate(Base):
    __tablename__ = "role_templates"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True, nullable=True)
    key: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    role_level: Mapped[str] = mapped_column(String(40), default="enterprise")
    default_domains: Mapped[list[str]] = mapped_column(JSON, default=list)
    default_modules: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_classifications: Mapped[list[str]] = mapped_column(JSON, default=list)
    read_only: Mapped[bool] = mapped_column(Boolean, default=False)
    external_identity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    system_managed: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="active")
    created_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("enterprise_id", "key"),)


class RoleCapability(Base):
    __tablename__ = "role_capabilities"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    role_template_id: Mapped[str] = mapped_column(String(80), ForeignKey("role_templates.id"), index=True)
    capability: Mapped[str] = mapped_column(String(140), index=True)
    effect: Mapped[str] = mapped_column(String(10), default="allow")

    __table_args__ = (UniqueConstraint("role_template_id", "capability"),)


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(80), ForeignKey("users.id"), index=True)
    role_template_id: Mapped[str] = mapped_column(String(80), ForeignKey("role_templates.id"), index=True)
    scope_type: Mapped[str] = mapped_column(String(40), index=True)
    scope_id: Mapped[str] = mapped_column(String(80), index=True)
    include_descendants: Mapped[bool] = mapped_column(Boolean, default=False)
    domains: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_modules: Mapped[list[str]] = mapped_column(JSON, default=list)
    capability_overrides: Mapped[list[str]] = mapped_column(JSON, default=list)
    denied_capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_classifications: Mapped[list[str]] = mapped_column(JSON, default=list)
    record_ownership: Mapped[str] = mapped_column(String(40), default="scope")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delegated_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_user_role_assignments_effective", "user_id", "enterprise_id", "status", "valid_from", "valid_until"),
        Index("ix_user_role_assignments_scope", "enterprise_id", "scope_type", "scope_id"),
    )


class UserAccessOverride(Base):
    __tablename__ = "user_access_overrides"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(80), ForeignKey("users.id"), index=True)
    scope_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    scope_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    capability: Mapped[str] = mapped_column(String(140), index=True)
    effect: Mapped[str] = mapped_column(String(10))
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    created_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModuleEntitlement(Base):
    __tablename__ = "enterprise_module_entitlements"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    module_key: Mapped[str] = mapped_column(String(80), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rules: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (UniqueConstraint("enterprise_id", "module_key"),)


class DataClassificationPolicy(Base):
    __tablename__ = "data_classification_policies"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    resource_pattern: Mapped[str] = mapped_column(String(180), index=True)
    classification: Mapped[str] = mapped_column(String(40), index=True)
    masked_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    hidden_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="active")

    __table_args__ = (UniqueConstraint("enterprise_id", "resource_pattern"),)


class TemporaryAccessGrant(Base):
    __tablename__ = "temporary_access_grants"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    assignment_id: Mapped[str] = mapped_column(String(80), ForeignKey("user_role_assignments.id"), unique=True)
    approved_by_id: Mapped[str] = mapped_column(String(80))
    reason: Mapped[str] = mapped_column(Text)
    valid_from: Mapped[datetime] = mapped_column(DateTime)
    valid_until: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)


class SupportAccessSession(Base):
    __tablename__ = "support_access_sessions"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    platform_user_id: Mapped[str] = mapped_column(String(80), ForeignKey("users.id"), index=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    acting_as_user_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("users.id"), nullable=True)
    capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_modules: Mapped[list[str]] = mapped_column(JSON, default=list)
    reason: Mapped[str] = mapped_column(Text)
    valid_from: Mapped[datetime] = mapped_column(DateTime)
    valid_until: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_by_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_support_access_active", "platform_user_id", "enterprise_id", "valid_until", "revoked_at"),)


class ScopeBookmark(Base):
    __tablename__ = "scope_bookmarks"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(80), ForeignKey("users.id"), index=True)
    enterprise_id: Mapped[str] = mapped_column(String(80), ForeignKey("enterprises.id"), index=True)
    scope_type: Mapped[str] = mapped_column(String(40))
    scope_id: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(200))
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "enterprise_id", "scope_type", "scope_id"),)


class EnterpriseAuditEvent(Base):
    __tablename__ = "enterprise_audit_events"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    enterprise_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("enterprises.id"), nullable=True, index=True)
    actor_id: Mapped[str] = mapped_column(String(80), index=True)
    acting_as_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    scope_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    scope_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action: Mapped[str] = mapped_column(String(140), index=True)
    resource_type: Mapped[str] = mapped_column(String(100))
    resource_id: Mapped[str] = mapped_column(String(100))
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_enterprise_audit_scope_created", "enterprise_id", "scope_id", "created_at"),)
