"""global enterprise hierarchy and scoped authorization

Revision ID: 0002_global_enterprise_access
Revises: 0001_platform_foundation
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_global_enterprise_access"
down_revision = "0001_platform_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy deployments created users through Base.metadata.create_all().
    # Create that dependency only when this migration runs on an empty database.
    if "users" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "users",
            sa.Column("id", sa.String(80), primary_key=True),
            sa.Column("tenant_id", sa.String(80), nullable=False),
            sa.Column("company_id", sa.String(80), nullable=True),
            sa.Column("plant_id", sa.String(80), nullable=True),
            sa.Column("email", sa.String(200), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("password_hash", sa.String(300), nullable=False),
            sa.Column("password_history", sa.JSON(), nullable=False),
            sa.Column("password_changed_at", sa.DateTime(), nullable=False),
            sa.Column("password_expires_at", sa.DateTime(), nullable=True),
            sa.Column("reset_token_hash", sa.String(300), nullable=True),
            sa.Column("reset_token_expires_at", sa.DateTime(), nullable=True),
            sa.Column("force_password_change", sa.Boolean(), nullable=False),
            sa.Column("role", sa.String(40), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
        )
        op.create_index("ix_users_tenant_company_email", "users", ["tenant_id", "company_id", "email"])
        op.create_index("ix_users_tenant_company_role", "users", ["tenant_id", "company_id", "role"])

    op.create_table(
        "enterprises",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("tenant_id", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("default_currency", sa.String(12), nullable=False),
        sa.Column("default_timezone", sa.String(80), nullable=False),
        sa.Column("created_by_id", sa.String(80), nullable=True),
        sa.Column("updated_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_enterprises_tenant_id", "enterprises", ["tenant_id"], unique=True)

    op.create_table(
        "enterprise_memberships",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("identity_type", sa.String(40), nullable=False),
        sa.Column("external_organization_id", sa.String(80), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_until", sa.DateTime(), nullable=True),
        sa.Column("created_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("enterprise_id", "user_id"),
    )
    op.create_index("ix_enterprise_memberships_enterprise_id", "enterprise_memberships", ["enterprise_id"])
    op.create_index("ix_enterprise_memberships_user_status", "enterprise_memberships", ["user_id", "status"])
    op.create_index("ix_enterprise_memberships_external_organization_id", "enterprise_memberships", ["external_organization_id"])

    op.create_table(
        "organizational_nodes",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("node_type", sa.String(40), nullable=False),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("source_entity_type", sa.String(40), nullable=True),
        sa.Column("source_entity_id", sa.String(80), nullable=True),
        sa.Column("currency", sa.String(12), nullable=True),
        sa.Column("timezone", sa.String(80), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_by_id", sa.String(80), nullable=True),
        sa.Column("updated_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("enterprise_id", "node_type", "code"),
    )
    op.create_index("ix_organizational_nodes_enterprise_type_status", "organizational_nodes", ["enterprise_id", "node_type", "status"])
    op.create_index("ix_organizational_nodes_source_entity_id", "organizational_nodes", ["source_entity_id"])

    op.create_table(
        "organizational_relationships",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("dimension", sa.String(30), nullable=False),
        sa.Column("parent_node_id", sa.String(80), sa.ForeignKey("organizational_nodes.id"), nullable=False),
        sa.Column("child_node_id", sa.String(80), sa.ForeignKey("organizational_nodes.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("enterprise_id", "dimension", "parent_node_id", "child_node_id"),
    )
    op.create_index("ix_org_relationship_parent_dimension", "organizational_relationships", ["enterprise_id", "parent_node_id", "dimension"])
    op.create_index("ix_org_relationship_child_dimension", "organizational_relationships", ["enterprise_id", "child_node_id", "dimension"])

    op.create_table(
        "role_templates",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=True),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("role_level", sa.String(40), nullable=False),
        sa.Column("default_domains", sa.JSON(), nullable=False),
        sa.Column("default_modules", sa.JSON(), nullable=False),
        sa.Column("allowed_classifications", sa.JSON(), nullable=False),
        sa.Column("read_only", sa.Boolean(), nullable=False),
        sa.Column("external_identity_type", sa.String(40), nullable=True),
        sa.Column("system_managed", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_by_id", sa.String(80), nullable=True),
        sa.Column("updated_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("enterprise_id", "key"),
    )
    op.create_index("ix_role_templates_key", "role_templates", ["key"])
    op.create_index("ix_role_templates_enterprise_id", "role_templates", ["enterprise_id"])

    op.create_table(
        "role_capabilities",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("role_template_id", sa.String(80), sa.ForeignKey("role_templates.id"), nullable=False),
        sa.Column("capability", sa.String(140), nullable=False),
        sa.Column("effect", sa.String(10), nullable=False),
        sa.UniqueConstraint("role_template_id", "capability"),
    )
    op.create_index("ix_role_capabilities_role_template_id", "role_capabilities", ["role_template_id"])
    op.create_index("ix_role_capabilities_capability", "role_capabilities", ["capability"])

    op.create_table(
        "user_role_assignments",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role_template_id", sa.String(80), sa.ForeignKey("role_templates.id"), nullable=False),
        sa.Column("scope_type", sa.String(40), nullable=False),
        sa.Column("scope_id", sa.String(80), nullable=False),
        sa.Column("include_descendants", sa.Boolean(), nullable=False),
        sa.Column("domains", sa.JSON(), nullable=False),
        sa.Column("allowed_modules", sa.JSON(), nullable=False),
        sa.Column("capability_overrides", sa.JSON(), nullable=False),
        sa.Column("denied_capabilities", sa.JSON(), nullable=False),
        sa.Column("allowed_classifications", sa.JSON(), nullable=False),
        sa.Column("record_ownership", sa.String(40), nullable=False),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_until", sa.DateTime(), nullable=True),
        sa.Column("delegated_by_id", sa.String(80), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_role_assignments_effective", "user_role_assignments", ["user_id", "enterprise_id", "status", "valid_from", "valid_until"])
    op.create_index("ix_user_role_assignments_scope", "user_role_assignments", ["enterprise_id", "scope_type", "scope_id"])
    op.create_index("ix_user_role_assignments_role_template_id", "user_role_assignments", ["role_template_id"])

    op.create_table(
        "user_access_overrides",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scope_type", sa.String(40), nullable=True),
        sa.Column("scope_id", sa.String(80), nullable=True),
        sa.Column("capability", sa.String(140), nullable=False),
        sa.Column("effect", sa.String(10), nullable=False),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_until", sa.DateTime(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_access_overrides_user_id", "user_access_overrides", ["user_id"])
    op.create_index("ix_user_access_overrides_capability", "user_access_overrides", ["capability"])

    op.create_table(
        "enterprise_module_entitlements",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("module_key", sa.String(80), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_until", sa.DateTime(), nullable=True),
        sa.Column("rules", sa.JSON(), nullable=False),
        sa.UniqueConstraint("enterprise_id", "module_key"),
    )
    op.create_index("ix_enterprise_module_entitlements_enterprise_id", "enterprise_module_entitlements", ["enterprise_id"])
    op.create_index("ix_enterprise_module_entitlements_module_key", "enterprise_module_entitlements", ["module_key"])

    op.create_table(
        "data_classification_policies",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("resource_pattern", sa.String(180), nullable=False),
        sa.Column("classification", sa.String(40), nullable=False),
        sa.Column("masked_fields", sa.JSON(), nullable=False),
        sa.Column("hidden_fields", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.UniqueConstraint("enterprise_id", "resource_pattern"),
    )
    op.create_index("ix_data_classification_policies_enterprise_id", "data_classification_policies", ["enterprise_id"])
    op.create_index("ix_data_classification_policies_classification", "data_classification_policies", ["classification"])

    op.create_table(
        "temporary_access_grants",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("assignment_id", sa.String(80), sa.ForeignKey("user_role_assignments.id"), nullable=False, unique=True),
        sa.Column("approved_by_id", sa.String(80), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("valid_from", sa.DateTime(), nullable=False),
        sa.Column("valid_until", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_by_id", sa.String(80), nullable=True),
    )
    op.create_index("ix_temporary_access_grants_enterprise_id", "temporary_access_grants", ["enterprise_id"])

    op.create_table(
        "support_access_sessions",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("platform_user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("acting_as_user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("capabilities", sa.JSON(), nullable=False),
        sa.Column("allowed_modules", sa.JSON(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("valid_from", sa.DateTime(), nullable=False),
        sa.Column("valid_until", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_by_id", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_support_access_active", "support_access_sessions", ["platform_user_id", "enterprise_id", "valid_until", "revoked_at"])

    op.create_table(
        "scope_bookmarks",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("scope_type", sa.String(40), nullable=False),
        sa.Column("scope_id", sa.String(80), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "enterprise_id", "scope_type", "scope_id"),
    )
    op.create_index("ix_scope_bookmarks_user_id", "scope_bookmarks", ["user_id"])
    op.create_index("ix_scope_bookmarks_enterprise_id", "scope_bookmarks", ["enterprise_id"])

    op.create_table(
        "enterprise_audit_events",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("enterprise_id", sa.String(80), sa.ForeignKey("enterprises.id"), nullable=True),
        sa.Column("actor_id", sa.String(80), nullable=False),
        sa.Column("acting_as_id", sa.String(80), nullable=True),
        sa.Column("scope_type", sa.String(40), nullable=True),
        sa.Column("scope_id", sa.String(80), nullable=True),
        sa.Column("action", sa.String(140), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("session_metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_enterprise_audit_scope_created", "enterprise_audit_events", ["enterprise_id", "scope_id", "created_at"])
    op.create_index("ix_enterprise_audit_events_actor_id", "enterprise_audit_events", ["actor_id"])
    op.create_index("ix_enterprise_audit_events_action", "enterprise_audit_events", ["action"])


def downgrade() -> None:
    for table_name in [
        "enterprise_audit_events",
        "scope_bookmarks",
        "support_access_sessions",
        "temporary_access_grants",
        "data_classification_policies",
        "enterprise_module_entitlements",
        "user_access_overrides",
        "user_role_assignments",
        "role_capabilities",
        "role_templates",
        "organizational_relationships",
        "organizational_nodes",
        "enterprise_memberships",
        "enterprises",
    ]:
        op.drop_table(table_name)
