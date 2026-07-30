from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .enterprise_access_models import (
    Enterprise,
    EnterpriseMembership,
    ModuleEntitlement,
    OrganizationalNode,
    OrganizationalRelationship,
    RoleCapability,
    RoleTemplate,
    SupportAccessSession,
    UserAccessOverride,
    UserRoleAssignment,
)
from .platform_models import User


PLATFORM_ROLE_KEYS = {
    "super_admin": "platform_super_admin",
}

LEGACY_ROLE_KEYS = {
    "account_owner": "enterprise_global_owner",
    "organization_admin": "enterprise_global_admin",
    "admin": "scoped_administrator",
    "team_manager": "department_manager",
    "supervisor": "shift_supervisor",
    "operator": "operator",
    "auditor": "auditor",
    "qa_tester": "quality_inspector",
    "custom": "custom_scoped_role",
    "user": "basic_assigned_user",
}

LEGACY_CAPABILITIES = {
    "super_admin": {
        "enterprise.view",
        "enterprise.manage",
        "organization.view",
        "organization.manage",
        "dashboard.view",
        "dashboard.configure",
        "users.view",
        "users.invite",
        "users.assign_roles",
        "roles.manage",
        "settings.view",
        "settings.manage",
        "audit.view",
        "support.impersonate",
    },
    "account_owner": {
        "enterprise.view",
        "enterprise.manage",
        "organization.view",
        "organization.manage",
        "dashboard.view",
        "dashboard.configure",
        "users.view",
        "users.invite",
        "users.assign_roles",
        "roles.manage",
        "settings.view",
        "settings.manage",
        "audit.view",
        "reports.view",
        "reports.export",
    },
    "organization_admin": {
        "enterprise.view",
        "organization.view",
        "organization.manage",
        "dashboard.view",
        "dashboard.configure",
        "users.view",
        "users.invite",
        "users.assign_roles",
        "settings.view",
        "audit.view",
        "reports.view",
        "reports.export",
    },
    "admin": {
        "organization.view",
        "organization.manage",
        "dashboard.view",
        "dashboard.configure",
        "users.view",
        "users.invite",
        "users.assign_roles",
        "settings.view",
        "audit.view",
        "reports.view",
        "reports.export",
    },
    "team_manager": {
        "dashboard.view",
        "reports.view",
        "reports.export",
        "production.view",
        "production.update",
        "quality.view",
        "maintenance.view",
        "maintenance.assign",
    },
    "supervisor": {
        "dashboard.view",
        "production.view",
        "production.create",
        "production.update",
        "quality.view",
        "quality.create",
        "maintenance.view",
    },
    "operator": {
        "dashboard.view",
        "production.view",
        "production.create",
        "quality.view",
        "maintenance.view",
    },
    "auditor": {
        "dashboard.view",
        "quality.view",
        "audit.view",
        "reports.view",
        "reports.export",
    },
    "qa_tester": {
        "dashboard.view",
        "quality.view",
        "quality.create",
        "quality.update",
        "reports.view",
    },
    "custom": {"dashboard.view"},
    "user": {"dashboard.view"},
}

for _legacy_role, _legacy_capabilities in LEGACY_CAPABILITIES.items():
    for _module in [
        "planning",
        "inventory",
        "warehouse",
        "production",
        "maintenance",
        "quality",
        "procurement",
        "sales",
        "costing",
        "compliance",
        "documents",
        "reports",
        "integrations",
    ]:
        _legacy_capabilities.add(f"{_module}.view")
        if _legacy_role in {"account_owner", "organization_admin", "admin", "team_manager", "supervisor", "qa_tester"}:
            _legacy_capabilities.add(f"{_module}.create")
            _legacy_capabilities.add(f"{_module}.update")
        if _legacy_role in {"account_owner", "organization_admin", "admin"}:
            _legacy_capabilities.add(f"{_module}.approve")
            _legacy_capabilities.add(f"{_module}.export")
            _legacy_capabilities.add(f"{_module}.delete")

READ_ACTIONS = {"view", "export"}
CLASSIFICATIONS = [
    "public",
    "internal",
    "confidential",
    "restricted",
    "personal",
    "financial",
    "security_sensitive",
    "medical_or_safety_sensitive",
]
GENERAL_CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"]


@dataclass(frozen=True)
class AuthorizationRequest:
    enterprise_id: str | None
    scope_type: str
    scope_id: str
    capability: str
    domain: str | None = None
    module_key: str | None = None
    data_classification: str = "internal"
    record_owner_id: str | None = None


@dataclass
class AccessDecision:
    allowed: bool
    code: str
    summary: str
    reasons: list[str] = field(default_factory=list)
    assignment_ids: list[str] = field(default_factory=list)
    role_keys: list[str] = field(default_factory=list)
    masked: bool = False
    effective_scope_ids: list[str] = field(default_factory=list)

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


def utcnow() -> datetime:
    return datetime.utcnow()


def is_effective(status: str, valid_from: datetime | None, valid_until: datetime | None, now: datetime | None = None) -> bool:
    current = now or utcnow()
    return status == "active" and (valid_from is None or valid_from <= current) and (valid_until is None or valid_until > current)


def _active_membership(db: Session, user_id: str, enterprise_id: str) -> EnterpriseMembership | None:
    rows = (
        db.query(EnterpriseMembership)
        .filter(EnterpriseMembership.user_id == user_id, EnterpriseMembership.enterprise_id == enterprise_id)
        .all()
    )
    return next((row for row in rows if is_effective(row.status, row.valid_from, row.valid_until)), None)


def _active_support_session(db: Session, user_id: str, enterprise_id: str) -> SupportAccessSession | None:
    current = utcnow()
    return (
        db.query(SupportAccessSession)
        .filter(
            SupportAccessSession.platform_user_id == user_id,
            SupportAccessSession.enterprise_id == enterprise_id,
            SupportAccessSession.valid_from <= current,
            SupportAccessSession.valid_until > current,
            SupportAccessSession.revoked_at.is_(None),
        )
        .order_by(SupportAccessSession.valid_until.desc())
        .first()
    )


def _resolve_scope_node(db: Session, enterprise_id: str, scope_type: str, scope_id: str) -> OrganizationalNode | None:
    if scope_type == "enterprise" and scope_id == enterprise_id:
        return None
    query = db.query(OrganizationalNode).filter(
        OrganizationalNode.enterprise_id == enterprise_id,
        OrganizationalNode.status == "active",
    )
    direct = query.filter(OrganizationalNode.id == scope_id).first()
    if direct:
        return direct
    compatibility_types = {
        "client": {"legal_entity", "business_unit"},
        "company": {"legal_entity"},
        "plant": {"plant"},
        "warehouse": {"warehouse"},
        "department": {"department"},
    }
    target_types = compatibility_types.get(scope_type, {scope_type})
    return query.filter(
        OrganizationalNode.node_type.in_(target_types),
        OrganizationalNode.source_entity_id == scope_id,
    ).first()


def descendant_scope_ids(db: Session, enterprise_id: str, scope_id: str) -> set[str]:
    root = _resolve_scope_node(db, enterprise_id, "node", scope_id)
    if root is None:
        if scope_id == enterprise_id:
            return {
                row.id
                for row in db.query(OrganizationalNode.id).filter(OrganizationalNode.enterprise_id == enterprise_id).all()
            }
        return set()
    discovered = {root.id}
    queue: deque[str] = deque([root.id])
    while queue:
        parent_id = queue.popleft()
        children = (
            db.query(OrganizationalRelationship.child_node_id)
            .filter(
                OrganizationalRelationship.enterprise_id == enterprise_id,
                OrganizationalRelationship.parent_node_id == parent_id,
                OrganizationalRelationship.status == "active",
            )
            .all()
        )
        for (child_id,) in children:
            if child_id not in discovered:
                discovered.add(child_id)
                queue.append(child_id)
    return discovered


def scope_matches(db: Session, enterprise_id: str, assignment: UserRoleAssignment, request: AuthorizationRequest) -> bool:
    if assignment.scope_type == "enterprise":
        if assignment.scope_id != enterprise_id:
            return False
        return request.scope_type == "enterprise" or assignment.include_descendants
    assignment_node = _resolve_scope_node(db, enterprise_id, assignment.scope_type, assignment.scope_id)
    requested_node = _resolve_scope_node(db, enterprise_id, request.scope_type, request.scope_id)
    if assignment_node is None or requested_node is None:
        return assignment.scope_type == request.scope_type and assignment.scope_id == request.scope_id
    if assignment_node.id == requested_node.id:
        return True
    return assignment.include_descendants and requested_node.id in descendant_scope_ids(db, enterprise_id, assignment_node.id)


def _capability_action(capability: str) -> str:
    return capability.rsplit(".", 1)[-1].lower()


def _allowed_classification(allowed: list[str], requested: str) -> bool:
    if requested not in CLASSIFICATIONS:
        return False
    if requested in allowed:
        return True
    if requested not in GENERAL_CLASSIFICATIONS:
        return False
    requested_index = GENERAL_CLASSIFICATIONS.index(requested)
    return any(
        item in GENERAL_CLASSIFICATIONS
        and GENERAL_CLASSIFICATIONS.index(item) >= requested_index
        for item in allowed
    )


def _module_is_entitled(db: Session, enterprise_id: str, module_key: str | None) -> bool:
    if not module_key:
        return True
    entitlement = (
        db.query(ModuleEntitlement)
        .filter(ModuleEntitlement.enterprise_id == enterprise_id, ModuleEntitlement.module_key == module_key)
        .first()
    )
    if not entitlement:
        return True
    return entitlement.enabled and is_effective("active", entitlement.valid_from, entitlement.valid_until)


def _evaluate_support_session(
    session: SupportAccessSession,
    request: AuthorizationRequest,
) -> AccessDecision:
    if request.capability not in (session.capabilities or []):
        return AccessDecision(
            False,
            "support_capability_denied",
            "Support session does not include the requested capability.",
            ["Platform roles do not automatically grant customer-data access."],
        )
    if request.module_key and session.allowed_modules and request.module_key not in session.allowed_modules:
        return AccessDecision(
            False,
            "support_module_denied",
            "Support session does not include the requested module.",
            [f"Requested module: {request.module_key}"],
        )
    return AccessDecision(
        True,
        "support_session",
        "Allowed by an explicit, active support-access session.",
        [
            f"Support session: {session.id}",
            f"Session expires: {session.valid_until.isoformat()}",
            "All activity is audited and the session can be revoked.",
        ],
    )


def evaluate_access(
    db: Session,
    user: User,
    request: AuthorizationRequest,
    *,
    allow_legacy_fallback: bool = True,
) -> AccessDecision:
    if not user.is_active:
        return AccessDecision(False, "user_disabled", "User is inactive.", ["Inactive users cannot receive effective access."])
    if bool(getattr(user, "_demo_read_only", False)) and _capability_action(request.capability) not in READ_ACTIONS:
        return AccessDecision(False, "read_only_session", "Read-only session cannot perform this action.")

    if request.scope_type == "platform":
        if user.role == "super_admin" and request.capability in LEGACY_CAPABILITIES["super_admin"]:
            return AccessDecision(
                True,
                "platform_role",
                "Allowed by the platform operator role.",
                ["Role: platform_super_admin", "Scope: platform", "Customer operational data is not implied."],
                role_keys=["platform_super_admin"],
            )
        return AccessDecision(False, "platform_scope_denied", "Platform scope requires a platform role.")

    if not request.enterprise_id:
        return AccessDecision(False, "enterprise_required", "Enterprise context is required.")
    enterprise = db.get(Enterprise, request.enterprise_id)
    if not enterprise or enterprise.status != "active":
        return AccessDecision(False, "not_found", "Requested context is unavailable.")

    if user.role == "super_admin":
        support_session = _active_support_session(db, user.id, request.enterprise_id)
        if not support_session:
            return AccessDecision(
                False,
                "support_session_required",
                "Platform administrator has no automatic customer-data access.",
                ["Create an explicit, time-limited support session with a business reason."],
            )
        return _evaluate_support_session(support_session, request)

    if enterprise.tenant_id != user.tenant_id:
        return AccessDecision(False, "not_found", "Requested context is unavailable.")
    membership = _active_membership(db, user.id, request.enterprise_id)
    assignments = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.user_id == user.id, UserRoleAssignment.enterprise_id == request.enterprise_id)
        .all()
    )
    effective_assignments = [
        assignment
        for assignment in assignments
        if is_effective(assignment.status, assignment.valid_from, assignment.valid_until)
    ]

    if not membership and effective_assignments:
        return AccessDecision(False, "membership_required", "An active enterprise membership is required.")
    if not _module_is_entitled(db, request.enterprise_id, request.module_key):
        return AccessDecision(
            False,
            "module_not_entitled",
            "The enterprise is not entitled to the requested module.",
            [f"Module: {request.module_key}"],
        )

    overrides = (
        db.query(UserAccessOverride)
        .filter(
            UserAccessOverride.user_id == user.id,
            UserAccessOverride.enterprise_id == request.enterprise_id,
            UserAccessOverride.capability == request.capability,
        )
        .all()
    )
    effective_overrides = [
        row for row in overrides if is_effective("active", row.valid_from, row.valid_until)
    ]
    for override in effective_overrides:
        if override.effect == "deny" and (
            not override.scope_id
            or (override.scope_type == request.scope_type and override.scope_id == request.scope_id)
        ):
            return AccessDecision(
                False,
                "explicit_deny",
                "Access is denied by a user-specific policy.",
                [override.reason],
            )

    matched: list[tuple[UserRoleAssignment, RoleTemplate]] = []
    denied_reasons: list[str] = []
    for assignment in effective_assignments:
        template = db.get(RoleTemplate, assignment.role_template_id)
        if not template or template.status != "active":
            continue
        if not scope_matches(db, request.enterprise_id, assignment, request):
            denied_reasons.append(f"{template.name}: requested scope is outside assignment.")
            continue
        domains = assignment.domains or template.default_domains or []
        if request.domain and domains and request.domain not in domains:
            denied_reasons.append(f"{template.name}: domain {request.domain} is not assigned.")
            continue
        modules = assignment.allowed_modules or template.default_modules or []
        if request.module_key and modules and request.module_key not in modules:
            denied_reasons.append(f"{template.name}: module {request.module_key} is not assigned.")
            continue
        role_capabilities = {
            row.capability
            for row in db.query(RoleCapability).filter(
                RoleCapability.role_template_id == template.id,
                RoleCapability.effect == "allow",
            )
        }
        role_capabilities.update(assignment.capability_overrides or [])
        role_capabilities.difference_update(assignment.denied_capabilities or [])
        if request.capability not in role_capabilities:
            denied_reasons.append(f"{template.name}: capability {request.capability} is not granted.")
            continue
        if template.read_only and _capability_action(request.capability) not in READ_ACTIONS:
            denied_reasons.append(f"{template.name}: role is read-only.")
            continue
        classifications = assignment.allowed_classifications or template.allowed_classifications or ["public", "internal"]
        if not _allowed_classification(classifications, request.data_classification):
            denied_reasons.append(f"{template.name}: classification {request.data_classification} is not allowed.")
            continue
        if assignment.record_ownership == "self" and request.record_owner_id and request.record_owner_id != user.id:
            denied_reasons.append(f"{template.name}: record ownership is restricted to the current user.")
            continue
        if membership and membership.identity_type in {"supplier", "customer"}:
            if assignment.record_ownership != "external_organization":
                denied_reasons.append(f"{template.name}: external identity requires organization-owned records.")
                continue
            if request.record_owner_id and request.record_owner_id != membership.external_organization_id:
                denied_reasons.append(f"{template.name}: record belongs to another external organization.")
                continue
        matched.append((assignment, template))

    if matched:
        assignment_ids = [assignment.id for assignment, _ in matched]
        role_keys = [template.key for _, template in matched]
        reasons = [
            "User is an active enterprise member.",
            f"Capability: {request.capability}",
            f"Scope: {request.scope_type} / {request.scope_id}",
            *[
                f"Role: {template.name}; descendants: {'enabled' if assignment.include_descendants else 'disabled'}; "
                f"valid until: {assignment.valid_until.isoformat() if assignment.valid_until else 'no expiry'}"
                for assignment, template in matched
            ],
        ]
        return AccessDecision(
            True,
            "scoped_assignment",
            "Allowed by an effective scoped role assignment.",
            reasons,
            assignment_ids,
            role_keys,
            masked=(
                request.data_classification not in {"public", "internal"}
                and any(template.read_only for _, template in matched)
            ),
            effective_scope_ids=list({assignment.scope_id for assignment, _ in matched}),
        )

    if allow_legacy_fallback and not assignments:
        return evaluate_legacy_access(db, user, enterprise, request)
    return AccessDecision(
        False,
        "no_effective_assignment",
        "No effective role assignment grants this request.",
        denied_reasons[:8] or ["The user has no active assignment for the requested scope and capability."],
    )


def evaluate_legacy_access(
    db: Session,
    user: User,
    enterprise: Enterprise,
    request: AuthorizationRequest,
) -> AccessDecision:
    capabilities = LEGACY_CAPABILITIES.get(user.role or "user", set())
    if request.capability not in capabilities:
        return AccessDecision(
            False,
            "legacy_capability_denied",
            "Existing role does not grant the requested capability.",
            [f"Compatibility role: {LEGACY_ROLE_KEYS.get(user.role, user.role)}"],
        )
    if request.scope_type in {"company", "client", "legal_entity"} and user.company_id:
        requested_node = _resolve_scope_node(db, enterprise.id, request.scope_type, request.scope_id)
        if requested_node and requested_node.source_entity_id != user.company_id and user.role not in {"account_owner", "organization_admin"}:
            return AccessDecision(False, "legacy_scope_denied", "Existing role is assigned to another company.")
    if request.scope_type == "plant" and user.plant_id:
        requested_node = _resolve_scope_node(db, enterprise.id, "plant", request.scope_id)
        if requested_node and requested_node.source_entity_id != user.plant_id and user.role not in {"account_owner", "organization_admin"}:
            return AccessDecision(False, "legacy_scope_denied", "Existing role is assigned to another plant.")
    if user.role == "auditor" and _capability_action(request.capability) not in READ_ACTIONS:
        return AccessDecision(False, "legacy_read_only", "Auditor compatibility role is read-only.")
    return AccessDecision(
        True,
        "legacy_compatibility",
        "Allowed through the documented legacy-role compatibility mapping.",
        [
            f"Legacy role: {user.role}",
            f"Mapped template: {LEGACY_ROLE_KEYS.get(user.role, user.role)}",
            "Migrate this user to explicit scoped assignments to remove compatibility fallback.",
        ],
        role_keys=[LEGACY_ROLE_KEYS.get(user.role, user.role)],
    )


def effective_access_summary(db: Session, user: User, enterprise_id: str) -> dict[str, Any]:
    enterprise = db.get(Enterprise, enterprise_id)
    if not enterprise:
        return {"enterprise_id": enterprise_id, "memberships": [], "assignments": [], "capabilities": [], "scopes": []}
    if user.role == "super_admin":
        support_session = _active_support_session(db, user.id, enterprise_id)
        if not support_session:
            return {
                "enterprise_id": enterprise_id,
                "enterprise_name": enterprise.name,
                "membership": None,
                "role_keys": ["platform_super_admin"],
                "assignments": [],
                "capabilities": [],
                "scopes": [],
                "compatibility_fallback": True,
                "support_access_required": True,
            }
        support_scope = {
            "scope_type": "enterprise",
            "scope_id": enterprise_id,
            "include_descendants": True,
            "domains": [],
            "modules": support_session.allowed_modules or [],
            "valid_until": support_session.valid_until.isoformat(),
        }
        return {
            "enterprise_id": enterprise_id,
            "enterprise_name": enterprise.name,
            "membership": None,
            "role_keys": ["platform_support_session"],
            "assignments": [support_scope],
            "capabilities": sorted(set(support_session.capabilities or [])),
            "scopes": [support_scope],
            "compatibility_fallback": False,
            "support_session_id": support_session.id,
        }
    membership = _active_membership(db, user.id, enterprise_id)
    assignments = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.user_id == user.id, UserRoleAssignment.enterprise_id == enterprise_id)
        .all()
    )
    effective = [row for row in assignments if is_effective(row.status, row.valid_from, row.valid_until)]
    capabilities: set[str] = set()
    scopes: list[dict[str, Any]] = []
    role_keys: list[str] = []
    for assignment in effective:
        template = db.get(RoleTemplate, assignment.role_template_id)
        if not template:
            continue
        role_keys.append(template.key)
        capabilities.update(
            row.capability
            for row in db.query(RoleCapability).filter(
                RoleCapability.role_template_id == template.id,
                RoleCapability.effect == "allow",
            )
        )
        capabilities.update(assignment.capability_overrides or [])
        capabilities.difference_update(assignment.denied_capabilities or [])
        scopes.append(
            {
                "scope_type": assignment.scope_type,
                "scope_id": assignment.scope_id,
                "include_descendants": assignment.include_descendants,
                "domains": assignment.domains or template.default_domains,
                "modules": assignment.allowed_modules or template.default_modules,
                "valid_until": assignment.valid_until.isoformat() if assignment.valid_until else None,
            }
        )
    if not effective:
        capabilities.update(LEGACY_CAPABILITIES.get(user.role or "user", set()))
        role_keys.append(PLATFORM_ROLE_KEYS.get(user.role, LEGACY_ROLE_KEYS.get(user.role, user.role)))
    return {
        "enterprise_id": enterprise_id,
        "enterprise_name": enterprise.name,
        "membership": {
            "status": membership.status,
            "identity_type": membership.identity_type,
            "external_organization_id": membership.external_organization_id,
        }
        if membership
        else None,
        "role_keys": sorted(set(role_keys)),
        "assignments": scopes,
        "capabilities": sorted(capabilities),
        "scopes": scopes,
        "compatibility_fallback": not bool(effective),
    }


def available_scope_nodes(db: Session, user: User, enterprise_id: str) -> list[OrganizationalNode]:
    if user.role == "super_admin":
        if not _active_support_session(db, user.id, enterprise_id):
            return []
        return (
            db.query(OrganizationalNode)
            .filter(OrganizationalNode.enterprise_id == enterprise_id, OrganizationalNode.status == "active")
            .order_by(OrganizationalNode.node_type, OrganizationalNode.name)
            .all()
        )
    assignments = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.user_id == user.id, UserRoleAssignment.enterprise_id == enterprise_id)
        .all()
    )
    effective = [row for row in assignments if is_effective(row.status, row.valid_from, row.valid_until)]
    if not effective:
        query = db.query(OrganizationalNode).filter(OrganizationalNode.enterprise_id == enterprise_id, OrganizationalNode.status == "active")
        if user.role in {"account_owner", "organization_admin"}:
            return query.all()
        source_ids = [value for value in [user.company_id, user.plant_id] if value]
        return query.filter(
            or_(OrganizationalNode.source_entity_id.in_(source_ids), OrganizationalNode.id.in_(source_ids))
        ).all()
    node_ids: set[str] = set()
    for assignment in effective:
        if assignment.scope_type == "enterprise":
            if assignment.include_descendants:
                node_ids.update(
                    row.id
                    for row in db.query(OrganizationalNode.id)
                    .filter(OrganizationalNode.enterprise_id == enterprise_id, OrganizationalNode.status == "active")
                    .all()
                )
            continue
        node = _resolve_scope_node(db, enterprise_id, assignment.scope_type, assignment.scope_id)
        if not node:
            continue
        node_ids.add(node.id)
        if assignment.include_descendants:
            node_ids.update(descendant_scope_ids(db, enterprise_id, node.id))
    return (
        db.query(OrganizationalNode)
        .filter(OrganizationalNode.enterprise_id == enterprise_id, OrganizationalNode.id.in_(node_ids))
        .order_by(OrganizationalNode.node_type, OrganizationalNode.name)
        .all()
        if node_ids
        else []
    )


def mask_fields(payload: dict[str, Any], masked_fields: list[str], hidden_fields: list[str]) -> dict[str, Any]:
    result = dict(payload)
    for field_name in hidden_fields:
        result.pop(field_name, None)
    for field_name in masked_fields:
        if field_name in result and result[field_name] is not None:
            value = str(result[field_name])
            result[field_name] = f"{value[:2]}***{value[-2:]}" if len(value) > 4 else "***"
    return result
