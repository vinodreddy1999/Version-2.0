from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .authorization import (
    AuthorizationRequest,
    AccessDecision,
    available_scope_nodes,
    descendant_scope_ids,
    effective_access_summary,
    evaluate_access,
    is_effective,
    mask_fields,
)
from .database import get_db
from .enterprise_access_models import (
    Enterprise,
    EnterpriseAuditEvent,
    EnterpriseMembership,
    DataClassificationPolicy,
    ModuleEntitlement,
    OrganizationalNode,
    OrganizationalRelationship,
    RoleCapability,
    RoleTemplate,
    SupportAccessSession,
    TemporaryAccessGrant,
    UserRoleAssignment,
)
from .enterprise_access_schemas import (
    EnterpriseCreate,
    DataPolicyCreate,
    DataPolicyUpdate,
    HierarchyNodeCreate,
    HierarchyNodeUpdate,
    HierarchyRelationshipCreate,
    PermissionExplanationRequest,
    RoleAssignmentCreate,
    RoleAssignmentUpdate,
    RoleTemplateCreate,
    RoleTemplateUpdate,
    SupportAccessCreate,
    ModuleEntitlementUpdate,
)
from .platform_models import ModuleRecord, User
from .runtime_router import current_user


router = APIRouter(tags=["Global Enterprise Access"])

NODE_TYPES = {
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
}

GLOBAL_NAVIGATION = [
    "Enterprise Overview",
    "Global Operations",
    "Global Network",
    "Regional Performance",
    "Country Performance",
    "Business Units",
    "Plant Network",
    "Quality & Compliance",
    "Supply Chain",
    "Maintenance & Reliability",
    "Cost & Profitability",
    "People & Capability",
    "Sustainability",
    "Enterprise Reports",
    "Global Standards",
    "Risk & Actions",
    "Enterprise Administration",
]
REGIONAL_NAVIGATION = [
    "Regional Overview",
    "Countries",
    "Sites",
    "Operations",
    "Quality",
    "Supply Chain",
    "Maintenance",
    "Regional Initiatives",
    "Risks & Escalations",
    "Reports",
    "Regional Administration",
]
PLANT_NAVIGATION = [
    "Plant Overview",
    "Production",
    "Planning",
    "Maintenance",
    "Quality",
    "Inventory",
    "Warehouse",
    "Procurement",
    "Dispatch",
    "People & Shifts",
    "Tasks & Approvals",
    "Documents",
    "Plant Reports",
    "Plant Administration",
]
FRONTLINE_NAVIGATION = [
    "My Shift",
    "My Work",
    "Production Entry",
    "Inspections",
    "Downtime Reporting",
    "Maintenance Tasks",
    "Issue Reporting",
    "SOPs",
    "Training",
    "Notifications",
    "My Profile",
]
SUPPLIER_NAVIGATION = [
    "Purchase Orders",
    "Acknowledgements",
    "Advance Shipping Notices",
    "Deliveries",
    "Certificates",
    "Supplier CAPA",
    "Messages",
    "Performance",
    "Documents",
]
CUSTOMER_NAVIGATION = ["Orders", "Shipments", "Returns", "Support", "Documents", "Notifications", "Reports"]


def as_dict(row: Any) -> dict[str, Any]:
    return {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in row.__dict__.items()
        if not key.startswith("_")
    }


def result(action: str, data: Any, message: str = "OK") -> dict[str, Any]:
    return {"action": action, "message": message, "data": data}


def safe_denial(decision: AccessDecision) -> None:
    if decision.allowed:
        return
    if decision.code in {"not_found", "legacy_scope_denied"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested resource was not found")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"message": decision.summary, "code": decision.code, "reasons": decision.reasons},
    )


def require_platform_capability(user: User, capability: str) -> None:
    if user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform operator access is required")
    decision = evaluate_access(
        db=_NoDatabaseSession(),  # type: ignore[arg-type]
        user=user,
        request=AuthorizationRequest(
            enterprise_id=None,
            scope_type="platform",
            scope_id="platform",
            capability=capability,
        ),
    )
    safe_denial(decision)


class _NoDatabaseSession:
    """Platform-scope evaluation intentionally does not touch customer data."""


def authorize(
    db: Session,
    actor: User,
    *,
    enterprise_id: str,
    scope_type: str,
    scope_id: str,
    capability: str,
    domain: str | None = None,
    module_key: str | None = None,
    classification: str = "internal",
    record_owner_id: str | None = None,
) -> AccessDecision:
    decision = evaluate_access(
        db,
        actor,
        AuthorizationRequest(
            enterprise_id=enterprise_id,
            scope_type=scope_type,
            scope_id=scope_id,
            capability=capability,
            domain=domain,
            module_key=module_key,
            data_classification=classification,
            record_owner_id=record_owner_id,
        ),
    )
    safe_denial(decision)
    return decision


def audit_event(
    db: Session,
    actor: User,
    request: Request,
    *,
    enterprise_id: str | None,
    scope_type: str | None,
    scope_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reason: str | None = None,
    acting_as_id: str | None = None,
) -> None:
    db.add(
        EnterpriseAuditEvent(
            id=f"enterprise-audit-{uuid4()}",
            enterprise_id=enterprise_id,
            actor_id=actor.id,
            acting_as_id=acting_as_id,
            scope_type=scope_type,
            scope_id=scope_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            before=before,
            after=after,
            reason=reason,
            session_metadata={
                "correlation_id": request.headers.get("x-correlation-id"),
                "client": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
            },
        )
    )


@router.get("/enterprises")
def list_enterprises(actor: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    query = db.query(Enterprise).filter(Enterprise.status == "active")
    if actor.role != "super_admin":
        membership_enterprise_ids = [
            row.enterprise_id
            for row in db.query(EnterpriseMembership)
            .filter(EnterpriseMembership.user_id == actor.id, EnterpriseMembership.status == "active")
            .all()
            if is_effective(row.status, row.valid_from, row.valid_until)
        ]
        query = query.filter(Enterprise.tenant_id == actor.tenant_id, Enterprise.id.in_(membership_enterprise_ids))
    return result("list_enterprises", [as_dict(row) for row in query.order_by(Enterprise.name).all()])


@router.post("/enterprises")
def create_enterprise(
    payload: EnterpriseCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    require_platform_capability(actor, "enterprise.manage")
    if db.query(Enterprise).filter((Enterprise.id == f"enterprise-{payload.code.lower()}") | (Enterprise.tenant_id == payload.tenant_id)).first():
        raise HTTPException(status_code=409, detail="Enterprise code or tenant already exists")
    row = Enterprise(
        id=f"enterprise-{payload.code.lower()}",
        tenant_id=payload.tenant_id,
        name=payload.name,
        code=payload.code.upper(),
        default_currency=payload.default_currency,
        default_timezone=payload.default_timezone,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(row)
    db.flush()
    audit_event(
        db,
        actor,
        request,
        enterprise_id=row.id,
        scope_type="enterprise",
        scope_id=row.id,
        action="enterprise.create",
        resource_type="enterprise",
        resource_id=row.id,
        after=as_dict(row),
    )
    db.commit()
    db.refresh(row)
    return result("create_enterprise", as_dict(row), "Enterprise provisioned.")


@router.get("/enterprises/{enterprise_id}")
def get_enterprise(enterprise_id: str, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="enterprise.view",
        domain="administration",
    )
    row = db.get(Enterprise, enterprise_id)
    if not row:
        raise HTTPException(status_code=404, detail="Enterprise was not found")
    return result("get_enterprise", as_dict(row))


@router.get("/enterprises/{enterprise_id}/hierarchy")
def get_hierarchy(enterprise_id: str, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="organization.view",
        domain="administration",
    )
    permitted_nodes = available_scope_nodes(db, actor, enterprise_id)
    node_ids = {row.id for row in permitted_nodes}
    relationships = (
        db.query(OrganizationalRelationship)
        .filter(
            OrganizationalRelationship.enterprise_id == enterprise_id,
            OrganizationalRelationship.status == "active",
            OrganizationalRelationship.parent_node_id.in_(node_ids),
            OrganizationalRelationship.child_node_id.in_(node_ids),
        )
        .all()
        if node_ids
        else []
    )
    return result(
        "enterprise_hierarchy",
        {
            "enterprise_id": enterprise_id,
            "nodes": [as_dict(row) for row in permitted_nodes],
            "relationships": [as_dict(row) for row in relationships],
            "dimensions": ["geography", "business", "legal", "operational"],
        },
    )


@router.get("/enterprises/{enterprise_id}/members")
def list_enterprise_members(
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    decision = authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="users.view",
        domain="administration",
        classification="personal",
    )
    policy = (
        db.query(DataClassificationPolicy)
        .filter(
            DataClassificationPolicy.enterprise_id == enterprise_id,
            DataClassificationPolicy.resource_pattern == "users.*",
            DataClassificationPolicy.status == "active",
        )
        .first()
    )
    rows = (
        db.query(EnterpriseMembership, User)
        .join(User, EnterpriseMembership.user_id == User.id)
        .filter(EnterpriseMembership.enterprise_id == enterprise_id)
        .order_by(User.name)
        .all()
    )
    members = []
    for membership, user in rows:
        user_data = {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
            "company_id": user.company_id,
            "plant_id": user.plant_id,
        }
        if decision.masked and policy:
            user_data = mask_fields(user_data, policy.masked_fields, policy.hidden_fields)
        members.append({"membership": as_dict(membership), "user": user_data})
    return result("enterprise_members", members)


def aggregate_scope_records(
    db: Session,
    enterprise: Enterprise,
    scope_type: str,
    scope_id: str,
    allowed_modules: set[str] | None = None,
) -> dict[str, Any]:
    query = db.query(ModuleRecord).filter(ModuleRecord.tenant_id == enterprise.tenant_id)
    if allowed_modules:
        query = query.filter(ModuleRecord.module_key.in_(allowed_modules))
    scope_label = enterprise.name
    if scope_type != "enterprise":
        node = (
            db.query(OrganizationalNode)
            .filter(
                OrganizationalNode.enterprise_id == enterprise.id,
                or_(OrganizationalNode.id == scope_id, OrganizationalNode.source_entity_id == scope_id),
            )
            .first()
        )
        if not node:
            raise HTTPException(status_code=404, detail="Requested context is unavailable")
        scope_label = node.name
        node_ids = descendant_scope_ids(db, enterprise.id, node.id)
        scoped_nodes = (
            db.query(OrganizationalNode)
            .filter(OrganizationalNode.enterprise_id == enterprise.id, OrganizationalNode.id.in_(node_ids))
            .all()
        )
        company_ids = [row.source_entity_id for row in scoped_nodes if row.node_type == "legal_entity" and row.source_entity_id]
        plant_ids = [row.source_entity_id for row in scoped_nodes if row.node_type == "plant" and row.source_entity_id]
        if not company_ids and not plant_ids:
            query = query.filter(ModuleRecord.id == "__no_scope_records__")
        else:
            query = query.filter(
                or_(
                    ModuleRecord.company_id.in_(company_ids) if company_ids else False,
                    ModuleRecord.plant_id.in_(plant_ids) if plant_ids else False,
                )
            )
    total_records = query.count()
    open_records = query.filter(func.lower(ModuleRecord.status).in_(["open", "pending", "at_risk", "blocked"])).count()
    total_quantity = query.with_entities(func.coalesce(func.sum(ModuleRecord.quantity), 0.0)).scalar() or 0.0
    latest = query.with_entities(func.max(ModuleRecord.created_at)).scalar()
    modules = [
        {
            "module_key": module_key,
            "record_count": record_count,
            "total_quantity": float(quantity or 0),
        }
        for module_key, record_count, quantity in query.with_entities(
            ModuleRecord.module_key,
            func.count(ModuleRecord.id),
            func.coalesce(func.sum(ModuleRecord.quantity), 0.0),
        )
        .group_by(ModuleRecord.module_key)
        .order_by(func.count(ModuleRecord.id).desc())
        .all()
    ]
    return {
        "scope_type": scope_type,
        "scope_id": scope_id,
        "scope_label": scope_label,
        "total_records": total_records,
        "open_records": open_records,
        "total_quantity": float(total_quantity),
        "module_count": len(modules),
        "modules": modules,
        "data_through": latest.isoformat() if latest else None,
    }


@router.get("/enterprises/{enterprise_id}/dashboard")
def enterprise_dashboard(
    enterprise_id: str,
    scope_type: str = "enterprise",
    scope_id: str | None = None,
    compare_scope_ids: list[str] = Query(default=[]),
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    resolved_scope_id = scope_id or enterprise_id
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type=scope_type,
        scope_id=resolved_scope_id,
        capability="dashboard.view",
    )
    enterprise = db.get(Enterprise, enterprise_id)
    if not enterprise:
        raise HTTPException(status_code=404, detail="Requested context is unavailable")
    access_summary = effective_access_summary(db, actor, enterprise_id)
    allowed_modules = {
        module
        for assignment in access_summary.get("assignments", [])
        for module in assignment.get("modules", [])
    }
    primary = aggregate_scope_records(db, enterprise, scope_type, resolved_scope_id, allowed_modules)
    comparisons: list[dict[str, Any]] = []
    for comparison_id in list(dict.fromkeys(compare_scope_ids))[:8]:
        node = db.get(OrganizationalNode, comparison_id)
        if not node or node.enterprise_id != enterprise_id:
            continue
        decision = evaluate_access(
            db,
            actor,
            AuthorizationRequest(
                enterprise_id=enterprise_id,
                scope_type=node.node_type,
                scope_id=node.id,
                capability="dashboard.view",
            ),
        )
        if decision.allowed:
            comparisons.append(aggregate_scope_records(db, enterprise, node.node_type, node.id, allowed_modules))
    return result(
        "enterprise_dashboard",
        {
            "enterprise_id": enterprise.id,
            "enterprise_name": enterprise.name,
            "currency": enterprise.default_currency,
            "timezone": enterprise.default_timezone,
            "primary": primary,
            "comparisons": comparisons,
            "normalization_warning": (
                "Counts and quantities are shown separately. Monetary values require a configured consolidation rate."
                if comparisons
                else None
            ),
        },
    )
@router.post("/enterprises/{enterprise_id}/hierarchy/nodes")
def create_hierarchy_node(
    enterprise_id: str,
    payload: HierarchyNodeCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if payload.node_type not in NODE_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported hierarchy node type")
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="organization.manage",
        domain="administration",
    )
    row = OrganizationalNode(
        id=f"org-{payload.node_type}-{uuid4()}",
        enterprise_id=enterprise_id,
        node_type=payload.node_type,
        code=payload.code.upper(),
        name=payload.name,
        status=payload.status,
        source_entity_type=payload.source_entity_type,
        source_entity_id=payload.source_entity_id,
        currency=payload.currency,
        timezone=payload.timezone,
        metadata_json=payload.metadata_json,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(row)
    db.flush()
    if payload.parent_node_id and payload.dimension:
        parent = db.get(OrganizationalNode, payload.parent_node_id)
        if not parent or parent.enterprise_id != enterprise_id:
            raise HTTPException(status_code=404, detail="Parent scope was not found")
        db.add(
            OrganizationalRelationship(
                id=f"org-rel-{uuid4()}",
                enterprise_id=enterprise_id,
                dimension=payload.dimension,
                parent_node_id=parent.id,
                child_node_id=row.id,
                created_by_id=actor.id,
            )
        )
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type=payload.node_type,
        scope_id=row.id,
        action="organization.node.create",
        resource_type="organizational_node",
        resource_id=row.id,
        after=as_dict(row),
    )
    db.commit()
    db.refresh(row)
    return result("create_hierarchy_node", as_dict(row), "Hierarchy node created.")


@router.patch("/enterprises/{enterprise_id}/hierarchy/nodes/{node_id}")
def update_hierarchy_node(
    enterprise_id: str,
    node_id: str,
    payload: HierarchyNodeUpdate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.get(OrganizationalNode, node_id)
    if not row or row.enterprise_id != enterprise_id:
        raise HTTPException(status_code=404, detail="Hierarchy node was not found")
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type=row.node_type,
        scope_id=row.id,
        capability="organization.manage",
        domain="administration",
    )
    before = as_dict(row)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.updated_by_id = actor.id
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type=row.node_type,
        scope_id=row.id,
        action="organization.node.update",
        resource_type="organizational_node",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
    )
    db.commit()
    db.refresh(row)
    return result("update_hierarchy_node", as_dict(row))


@router.delete("/enterprises/{enterprise_id}/hierarchy/nodes/{node_id}")
def deactivate_hierarchy_node(
    enterprise_id: str,
    node_id: str,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.get(OrganizationalNode, node_id)
    if not row or row.enterprise_id != enterprise_id:
        raise HTTPException(status_code=404, detail="Hierarchy node was not found")
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type=row.node_type,
        scope_id=row.id,
        capability="organization.manage",
        domain="administration",
    )
    before = as_dict(row)
    row.status = "inactive"
    row.updated_by_id = actor.id
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type=row.node_type,
        scope_id=row.id,
        action="organization.node.deactivate",
        resource_type="organizational_node",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
    )
    db.commit()
    return result("deactivate_hierarchy_node", {"id": row.id, "status": row.status})


@router.post("/enterprises/{enterprise_id}/hierarchy/relationships")
def create_hierarchy_relationship(
    enterprise_id: str,
    payload: HierarchyRelationshipCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="organization.manage",
        domain="administration",
    )
    parent = db.get(OrganizationalNode, payload.parent_node_id)
    child = db.get(OrganizationalNode, payload.child_node_id)
    if not parent or not child or parent.enterprise_id != enterprise_id or child.enterprise_id != enterprise_id:
        raise HTTPException(status_code=404, detail="Relationship node was not found")
    if parent.id in descendant_scope_ids(db, enterprise_id, child.id):
        raise HTTPException(status_code=409, detail="Relationship would create a hierarchy cycle")
    existing = (
        db.query(OrganizationalRelationship)
        .filter(
            OrganizationalRelationship.enterprise_id == enterprise_id,
            OrganizationalRelationship.dimension == payload.dimension,
            OrganizationalRelationship.parent_node_id == parent.id,
            OrganizationalRelationship.child_node_id == child.id,
        )
        .first()
    )
    if existing and existing.status == "active":
        raise HTTPException(status_code=409, detail="Relationship already exists")
    if existing:
        before = as_dict(existing)
        existing.status = "active"
        row = existing
    else:
        before = None
        row = OrganizationalRelationship(
            id=f"org-rel-{uuid4()}",
            enterprise_id=enterprise_id,
            dimension=payload.dimension,
            parent_node_id=parent.id,
            child_node_id=child.id,
            created_by_id=actor.id,
        )
        db.add(row)
    db.flush()
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type=child.node_type,
        scope_id=child.id,
        action="organization.relationship.create",
        resource_type="organizational_relationship",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=payload.reason,
    )
    db.commit()
    db.refresh(row)
    return result("create_hierarchy_relationship", as_dict(row))


@router.delete("/enterprises/{enterprise_id}/hierarchy/relationships/{relationship_id}")
def deactivate_hierarchy_relationship(
    enterprise_id: str,
    relationship_id: str,
    request: Request,
    reason: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.get(OrganizationalRelationship, relationship_id)
    if not row or row.enterprise_id != enterprise_id:
        raise HTTPException(status_code=404, detail="Relationship was not found")
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="organization.manage",
        domain="administration",
    )
    before = as_dict(row)
    row.status = "inactive"
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        action="organization.relationship.deactivate",
        resource_type="organizational_relationship",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=reason,
    )
    db.commit()
    return result("deactivate_hierarchy_relationship", {"id": row.id, "status": row.status})


@router.get("/enterprises/{enterprise_id}/role-templates")
def list_role_templates(enterprise_id: str, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="organization.view",
        domain="administration",
    )
    rows = (
        db.query(RoleTemplate)
        .filter((RoleTemplate.enterprise_id == enterprise_id) | (RoleTemplate.enterprise_id.is_(None)))
        .order_by(RoleTemplate.role_level, RoleTemplate.name)
        .all()
    )
    return result("list_role_templates", [serialize_role_template(db, row) for row in rows])


@router.post("/enterprises/{enterprise_id}/role-templates")
def create_role_template(
    enterprise_id: str,
    payload: RoleTemplateCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="roles.manage",
        domain="administration",
    )
    row = RoleTemplate(
        id=f"role-template-{uuid4()}",
        enterprise_id=enterprise_id,
        key=payload.key,
        name=payload.name,
        description=payload.description,
        role_level=payload.role_level,
        default_domains=payload.default_domains,
        default_modules=payload.default_modules,
        allowed_classifications=payload.allowed_classifications,
        read_only=payload.read_only,
        external_identity_type=payload.external_identity_type,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(row)
    db.flush()
    for capability in sorted(set(payload.capabilities)):
        db.add(
            RoleCapability(
                id=f"role-capability-{uuid4()}",
                role_template_id=row.id,
                capability=capability,
                effect="allow",
            )
        )
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        action="role_template.create",
        resource_type="role_template",
        resource_id=row.id,
        after=serialize_role_template(db, row),
    )
    db.commit()
    return result("create_role_template", serialize_role_template(db, row))


@router.patch("/enterprises/{enterprise_id}/role-templates/{role_id}")
def update_role_template(
    enterprise_id: str,
    role_id: str,
    payload: RoleTemplateUpdate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.get(RoleTemplate, role_id)
    if not row or row.enterprise_id != enterprise_id:
        raise HTTPException(status_code=404, detail="Role template was not found")
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="roles.manage",
        domain="administration",
    )
    before = serialize_role_template(db, row)
    values = payload.model_dump(exclude_unset=True)
    capabilities = values.pop("capabilities", None)
    for key, value in values.items():
        setattr(row, key, value)
    row.updated_by_id = actor.id
    if capabilities is not None:
        db.query(RoleCapability).filter(RoleCapability.role_template_id == row.id).delete()
        for capability in sorted(set(capabilities)):
            db.add(
                RoleCapability(
                    id=f"role-capability-{uuid4()}",
                    role_template_id=row.id,
                    capability=capability,
                    effect="allow",
                )
            )
    db.flush()
    after = serialize_role_template(db, row)
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        action="role_template.update",
        resource_type="role_template",
        resource_id=row.id,
        before=before,
        after=after,
    )
    db.commit()
    return result("update_role_template", after)


def serialize_role_template(db: Session, row: RoleTemplate) -> dict[str, Any]:
    data = as_dict(row)
    data["capabilities"] = [
        capability.capability
        for capability in db.query(RoleCapability)
        .filter(RoleCapability.role_template_id == row.id, RoleCapability.effect == "allow")
        .order_by(RoleCapability.capability)
        .all()
    ]
    return data


def authorize_user_admin(db: Session, actor: User, enterprise_id: str, user_id: str, capability: str) -> User:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User was not found")
    enterprise = db.get(Enterprise, enterprise_id)
    if not enterprise:
        raise HTTPException(status_code=404, detail="Requested context is unavailable")
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability=capability,
        domain="administration",
    )
    if target.tenant_id != enterprise.tenant_id:
        raise HTTPException(status_code=404, detail="User was not found")
    return target


@router.get("/users/{user_id}/role-assignments")
def list_role_assignments(
    user_id: str,
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if actor.id != user_id:
        authorize_user_admin(db, actor, enterprise_id, user_id, "users.view")
    rows = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.user_id == user_id, UserRoleAssignment.enterprise_id == enterprise_id)
        .order_by(UserRoleAssignment.created_at.desc())
        .all()
    )
    return result("list_role_assignments", [as_dict(row) for row in rows])


@router.post("/users/{user_id}/role-assignments")
def create_role_assignment(
    user_id: str,
    payload: RoleAssignmentCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = authorize_user_admin(db, actor, payload.enterprise_id, user_id, "users.assign_roles")
    template = db.get(RoleTemplate, payload.role_template_id)
    if not template or template.enterprise_id not in {None, payload.enterprise_id}:
        raise HTTPException(status_code=404, detail="Role template was not found")
    if payload.scope_type != "enterprise":
        scope = db.get(OrganizationalNode, payload.scope_id)
        if not scope or scope.enterprise_id != payload.enterprise_id or scope.node_type != payload.scope_type:
            raise HTTPException(status_code=404, detail="Assignment scope was not found")
    membership = (
        db.query(EnterpriseMembership)
        .filter(EnterpriseMembership.enterprise_id == payload.enterprise_id, EnterpriseMembership.user_id == user_id)
        .first()
    )
    if not membership:
        membership = EnterpriseMembership(
            id=f"membership-{uuid4()}",
            enterprise_id=payload.enterprise_id,
            user_id=user_id,
            identity_type=template.external_identity_type or "employee",
            created_by_id=actor.id,
        )
        db.add(membership)
    row = UserRoleAssignment(
        id=f"assignment-{uuid4()}",
        enterprise_id=payload.enterprise_id,
        user_id=target.id,
        role_template_id=payload.role_template_id,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        include_descendants=payload.include_descendants,
        domains=payload.domains,
        allowed_modules=payload.allowed_modules,
        capability_overrides=payload.capability_overrides,
        denied_capabilities=payload.denied_capabilities,
        allowed_classifications=payload.allowed_classifications,
        record_ownership=payload.record_ownership,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        delegated_by_id=actor.id,
        reason=payload.reason,
    )
    db.add(row)
    db.flush()
    if payload.valid_until:
        db.add(
            TemporaryAccessGrant(
                id=f"temporary-grant-{uuid4()}",
                enterprise_id=payload.enterprise_id,
                assignment_id=row.id,
                approved_by_id=actor.id,
                reason=payload.reason or "Time-bound scoped role assignment.",
                valid_from=payload.valid_from or datetime.utcnow(),
                valid_until=payload.valid_until,
            )
        )
    audit_event(
        db,
        actor,
        request,
        enterprise_id=payload.enterprise_id,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        action="role_assignment.create",
        resource_type="user_role_assignment",
        resource_id=row.id,
        after=as_dict(row),
        reason=payload.reason,
    )
    db.commit()
    db.refresh(row)
    return result("create_role_assignment", as_dict(row), "Scoped role assignment created.")


@router.patch("/users/{user_id}/role-assignments/{assignment_id}")
def update_role_assignment(
    user_id: str,
    assignment_id: str,
    payload: RoleAssignmentUpdate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.get(UserRoleAssignment, assignment_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Role assignment was not found")
    authorize_user_admin(db, actor, row.enterprise_id, user_id, "users.assign_roles")
    before = as_dict(row)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.delegated_by_id = actor.id
    audit_event(
        db,
        actor,
        request,
        enterprise_id=row.enterprise_id,
        scope_type=row.scope_type,
        scope_id=row.scope_id,
        action="role_assignment.update",
        resource_type="user_role_assignment",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=payload.reason,
    )
    db.commit()
    db.refresh(row)
    return result("update_role_assignment", as_dict(row))


@router.delete("/users/{user_id}/role-assignments/{assignment_id}")
def revoke_role_assignment(
    user_id: str,
    assignment_id: str,
    request: Request,
    reason: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.get(UserRoleAssignment, assignment_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Role assignment was not found")
    authorize_user_admin(db, actor, row.enterprise_id, user_id, "users.assign_roles")
    before = as_dict(row)
    row.status = "revoked"
    row.reason = reason
    row.delegated_by_id = actor.id
    audit_event(
        db,
        actor,
        request,
        enterprise_id=row.enterprise_id,
        scope_type=row.scope_type,
        scope_id=row.scope_id,
        action="role_assignment.revoke",
        resource_type="user_role_assignment",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=reason,
    )
    db.commit()
    return result("revoke_role_assignment", {"id": row.id, "status": row.status})


def resolve_target_access(
    db: Session,
    actor: User,
    user_id: str,
    enterprise_id: str,
) -> User:
    if actor.id == user_id:
        return actor
    return authorize_user_admin(db, actor, enterprise_id, user_id, "users.view")


@router.get("/users/{user_id}/effective-access")
def get_effective_access(
    user_id: str,
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = resolve_target_access(db, actor, user_id, enterprise_id)
    return result("effective_access", effective_access_summary(db, target, enterprise_id))


@router.get("/users/{user_id}/available-scopes")
def get_available_scopes(
    user_id: str,
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = resolve_target_access(db, actor, user_id, enterprise_id)
    rows = available_scope_nodes(db, target, enterprise_id)
    return result("available_scopes", [as_dict(row) for row in rows])


@router.get("/users/{user_id}/navigation")
def get_navigation(
    user_id: str,
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = resolve_target_access(db, actor, user_id, enterprise_id)
    summary = effective_access_summary(db, target, enterprise_id)
    membership = summary.get("membership") or {}
    role_keys = set(summary.get("role_keys") or [])
    if membership.get("identity_type") == "supplier" or "external_supplier" in role_keys:
        items = SUPPLIER_NAVIGATION
        experience = "supplier"
    elif membership.get("identity_type") == "customer" or "external_customer" in role_keys:
        items = CUSTOMER_NAVIGATION
        experience = "customer"
    elif role_keys.intersection({"operator", "technician", "inspector", "warehouse_operator", "maintenance_technician", "quality_inspector", "shift_supervisor", "team_lead"}):
        items = FRONTLINE_NAVIGATION
        experience = "frontline"
    elif role_keys.intersection({"plant_manager", "production_manager", "quality_manager", "maintenance_manager", "warehouse_manager", "planning_manager", "procurement_manager", "department_manager", "area_manager"}):
        items = PLANT_NAVIGATION
        experience = "plant"
    elif role_keys.intersection({"regional_director", "country_manager", "site_group_manager", "multi_site_operations_manager"}):
        items = REGIONAL_NAVIGATION
        experience = "regional"
    else:
        items = GLOBAL_NAVIGATION
        experience = "global"
    capabilities = set(summary.get("capabilities") or [])
    if "organization.manage" not in capabilities and "Enterprise Administration" in items:
        items = [item for item in items if item != "Enterprise Administration"]
    if "reports.view" not in capabilities:
        items = [item for item in items if "Reports" not in item]
    return result(
        "visible_navigation",
        {"experience": experience, "items": items, "role_keys": sorted(role_keys), "enterprise_id": enterprise_id},
    )


@router.post("/users/{user_id}/permission-explanation")
def explain_permission(
    user_id: str,
    payload: PermissionExplanationRequest,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = resolve_target_access(db, actor, user_id, payload.enterprise_id)
    decision = evaluate_access(
        db,
        target,
        AuthorizationRequest(
            enterprise_id=payload.enterprise_id,
            scope_type=payload.scope_type,
            scope_id=payload.scope_id,
            capability=payload.capability,
            domain=payload.domain,
            module_key=payload.module_key,
            data_classification=payload.data_classification,
            record_owner_id=payload.record_owner_id,
        ),
    )
    return result("permission_explanation", decision.model_dump())


@router.post("/support-access-sessions")
def create_support_access_session(
    payload: SupportAccessCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    require_platform_capability(actor, "support.impersonate")
    enterprise = db.get(Enterprise, payload.enterprise_id)
    if not enterprise:
        raise HTTPException(status_code=404, detail="Enterprise was not found")
    now = datetime.utcnow()
    row = SupportAccessSession(
        id=f"support-session-{uuid4()}",
        platform_user_id=actor.id,
        enterprise_id=payload.enterprise_id,
        acting_as_user_id=payload.acting_as_user_id,
        capabilities=payload.capabilities,
        allowed_modules=payload.allowed_modules,
        reason=payload.reason,
        valid_from=now,
        valid_until=now + timedelta(minutes=payload.duration_minutes),
    )
    db.add(row)
    audit_event(
        db,
        actor,
        request,
        enterprise_id=payload.enterprise_id,
        scope_type="enterprise",
        scope_id=payload.enterprise_id,
        action="support_access.create",
        resource_type="support_access_session",
        resource_id=row.id,
        after=as_dict(row),
        reason=payload.reason,
        acting_as_id=payload.acting_as_user_id,
    )
    db.commit()
    db.refresh(row)
    return result("create_support_access_session", as_dict(row), "Time-limited support access is active.")


@router.delete("/support-access-sessions/{session_id}")
def revoke_support_access_session(
    session_id: str,
    request: Request,
    reason: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    require_platform_capability(actor, "support.impersonate")
    row = db.get(SupportAccessSession, session_id)
    if not row or row.platform_user_id != actor.id:
        raise HTTPException(status_code=404, detail="Support session was not found")
    before = as_dict(row)
    row.revoked_at = datetime.utcnow()
    row.revoked_by_id = actor.id
    audit_event(
        db,
        actor,
        request,
        enterprise_id=row.enterprise_id,
        scope_type="enterprise",
        scope_id=row.enterprise_id,
        action="support_access.revoke",
        resource_type="support_access_session",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=reason,
        acting_as_id=row.acting_as_user_id,
    )
    db.commit()
    return result("revoke_support_access_session", {"id": row.id, "revoked_at": row.revoked_at.isoformat()})


@router.get("/enterprises/{enterprise_id}/audit-events")
def list_enterprise_audit_events(
    enterprise_id: str,
    limit: int = 100,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="audit.view",
        domain="security",
        classification="confidential",
    )
    rows = (
        db.query(EnterpriseAuditEvent)
        .filter(EnterpriseAuditEvent.enterprise_id == enterprise_id)
        .order_by(EnterpriseAuditEvent.created_at.desc())
        .limit(max(1, min(limit, 250)))
        .all()
    )
    return result("enterprise_audit_events", [as_dict(row) for row in rows])


@router.get("/enterprises/{enterprise_id}/module-entitlements")
def list_module_entitlements(
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="settings.view",
        domain="administration",
    )
    rows = db.query(ModuleEntitlement).filter(ModuleEntitlement.enterprise_id == enterprise_id).all()
    return result("module_entitlements", [as_dict(row) for row in rows])


@router.patch("/enterprises/{enterprise_id}/module-entitlements/{module_key}")
def update_module_entitlement(
    enterprise_id: str,
    module_key: str,
    payload: ModuleEntitlementUpdate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="settings.manage",
        domain="administration",
    )
    row = (
        db.query(ModuleEntitlement)
        .filter(ModuleEntitlement.enterprise_id == enterprise_id, ModuleEntitlement.module_key == module_key)
        .first()
    )
    if not row:
        row = ModuleEntitlement(
            id=f"entitlement-{uuid4()}",
            enterprise_id=enterprise_id,
            module_key=module_key,
            enabled=payload.enabled,
            valid_from=payload.valid_from,
            valid_until=payload.valid_until,
            rules=payload.rules,
        )
        before = None
        db.add(row)
    else:
        before = as_dict(row)
        row.enabled = payload.enabled
        row.valid_from = payload.valid_from
        row.valid_until = payload.valid_until
        row.rules = payload.rules
    db.flush()
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        action="module_entitlement.update",
        resource_type="module_entitlement",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=payload.reason,
    )
    db.commit()
    db.refresh(row)
    return result("update_module_entitlement", as_dict(row))


@router.get("/enterprises/{enterprise_id}/data-policies")
def list_data_policies(
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="settings.view",
        domain="administration",
        classification="confidential",
    )
    rows = (
        db.query(DataClassificationPolicy)
        .filter(DataClassificationPolicy.enterprise_id == enterprise_id)
        .order_by(DataClassificationPolicy.resource_pattern)
        .all()
    )
    return result("data_policies", [as_dict(row) for row in rows])


@router.post("/enterprises/{enterprise_id}/data-policies")
def create_data_policy(
    enterprise_id: str,
    payload: DataPolicyCreate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="settings.manage",
        domain="administration",
        classification="confidential",
    )
    if db.query(DataClassificationPolicy).filter(
        DataClassificationPolicy.enterprise_id == enterprise_id,
        DataClassificationPolicy.resource_pattern == payload.resource_pattern,
    ).first():
        raise HTTPException(status_code=409, detail="A policy already exists for this resource pattern")
    row = DataClassificationPolicy(
        id=f"data-policy-{uuid4()}",
        enterprise_id=enterprise_id,
        resource_pattern=payload.resource_pattern,
        classification=payload.classification,
        masked_fields=payload.masked_fields,
        hidden_fields=payload.hidden_fields,
        status="active",
    )
    db.add(row)
    db.flush()
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        action="data_policy.create",
        resource_type="data_classification_policy",
        resource_id=row.id,
        after=as_dict(row),
        reason=payload.reason,
    )
    db.commit()
    db.refresh(row)
    return result("create_data_policy", as_dict(row))


@router.patch("/enterprises/{enterprise_id}/data-policies/{policy_id}")
def update_data_policy(
    enterprise_id: str,
    policy_id: str,
    payload: DataPolicyUpdate,
    request: Request,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="settings.manage",
        domain="administration",
        classification="confidential",
    )
    row = db.get(DataClassificationPolicy, policy_id)
    if not row or row.enterprise_id != enterprise_id:
        raise HTTPException(status_code=404, detail="Data policy was not found")
    before = as_dict(row)
    for key, value in payload.model_dump(exclude={"reason"}, exclude_unset=True).items():
        setattr(row, key, value)
    audit_event(
        db,
        actor,
        request,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        action="data_policy.update",
        resource_type="data_classification_policy",
        resource_id=row.id,
        before=before,
        after=as_dict(row),
        reason=payload.reason,
    )
    db.commit()
    db.refresh(row)
    return result("update_data_policy", as_dict(row))


@router.get("/enterprises/{enterprise_id}/temporary-access")
def list_temporary_access(
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    authorize(
        db,
        actor,
        enterprise_id=enterprise_id,
        scope_type="enterprise",
        scope_id=enterprise_id,
        capability="users.view",
        domain="administration",
        classification="confidential",
    )
    rows = (
        db.query(TemporaryAccessGrant, UserRoleAssignment, User)
        .join(UserRoleAssignment, TemporaryAccessGrant.assignment_id == UserRoleAssignment.id)
        .join(User, UserRoleAssignment.user_id == User.id)
        .filter(TemporaryAccessGrant.enterprise_id == enterprise_id)
        .order_by(TemporaryAccessGrant.valid_until.desc())
        .all()
    )
    return result(
        "temporary_access",
        [
            {
                **as_dict(grant),
                "assignment": as_dict(assignment),
                "user": {"id": user.id, "name": user.name, "email": user.email},
                "effective": is_effective(
                    assignment.status,
                    max(value for value in [grant.valid_from, assignment.valid_from] if value is not None),
                    min(value for value in [grant.valid_until, assignment.valid_until] if value is not None),
                )
                and grant.revoked_at is None,
            }
            for grant, assignment, user in rows
        ],
    )


@router.get("/enterprises/{enterprise_id}/support-access-sessions")
def list_support_access_sessions(
    enterprise_id: str,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if actor.role == "super_admin":
        rows = (
            db.query(SupportAccessSession)
            .filter(
                SupportAccessSession.enterprise_id == enterprise_id,
                SupportAccessSession.platform_user_id == actor.id,
            )
            .order_by(SupportAccessSession.created_at.desc())
            .all()
        )
    else:
        authorize(
            db,
            actor,
            enterprise_id=enterprise_id,
            scope_type="enterprise",
            scope_id=enterprise_id,
            capability="audit.view",
            domain="security",
            classification="confidential",
        )
        rows = (
            db.query(SupportAccessSession)
            .filter(SupportAccessSession.enterprise_id == enterprise_id)
            .order_by(SupportAccessSession.created_at.desc())
            .all()
        )
    return result("support_access_sessions", [as_dict(row) for row in rows])
