from dataclasses import dataclass, field

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from .authorization import AuthorizationRequest, available_scope_nodes, evaluate_access
from .enterprise_access_models import (
    Enterprise,
    EnterpriseMembership,
    OrganizationalNode,
    OrganizationalRelationship,
)
from .platform_models import ModuleRecord, User


MODULE_DOMAINS = {
    "reports": "analytics",
    "reporting": "analytics",
    "supplier-portal": "procurement",
    "customer-portal": "sales",
    "data-hub": "integrations",
    "integrations": "integrations",
    "mobile": "operations",
    "ai_copilot": "analytics",
}

RUNTIME_DATA_OVERRIDE_ROLES = {"super_admin"}


@dataclass
class RecordAccessScope:
    enterprise_id: str
    company_ids: set[str] = field(default_factory=set)
    plant_ids: set[str] = field(default_factory=set)
    external_organization_id: str | None = None


def enterprise_for_user(db: Session, user: User) -> Enterprise:
    enterprise = db.query(Enterprise).filter(Enterprise.tenant_id == user.tenant_id, Enterprise.status == "active").first()
    if not enterprise:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active enterprise context is available")
    return enterprise


def scope_nodes_with_ancestors(
    db: Session,
    enterprise_id: str,
    nodes: list[OrganizationalNode],
) -> list[OrganizationalNode]:
    node_ids = {node.id for node in nodes}
    frontier = set(node_ids)
    while frontier:
        parent_ids = {
            parent_id
            for (parent_id,) in db.query(OrganizationalRelationship.parent_node_id)
            .filter(
                OrganizationalRelationship.enterprise_id == enterprise_id,
                OrganizationalRelationship.child_node_id.in_(frontier),
                OrganizationalRelationship.status == "active",
            )
            .all()
            if parent_id and parent_id not in node_ids
        }
        if not parent_ids:
            break
        node_ids.update(parent_ids)
        frontier = parent_ids
    if not node_ids:
        return []
    return (
        db.query(OrganizationalNode)
        .filter(
            OrganizationalNode.enterprise_id == enterprise_id,
            OrganizationalNode.id.in_(node_ids),
            OrganizationalNode.status == "active",
        )
        .all()
    )


def _deny(decision) -> None:
    if decision.allowed:
        return
    if decision.code in {"not_found", "legacy_scope_denied"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested resource was not found")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"message": decision.summary, "code": decision.code},
    )


def authorize_record_action(
    db: Session,
    user: User,
    *,
    module_key: str,
    action: str,
    company_id: str | None = None,
    plant_id: str | None = None,
    data_classification: str = "internal",
    record_owner_id: str | None = None,
) -> RecordAccessScope:
    enterprise = enterprise_for_user(db, user)
    if user.role in RUNTIME_DATA_OVERRIDE_ROLES and not bool(getattr(user, "_demo_read_only", False)):
        nodes = (
            db.query(OrganizationalNode)
            .filter(
                OrganizationalNode.enterprise_id == enterprise.id,
                OrganizationalNode.status == "active",
            )
            .all()
        )
        return RecordAccessScope(
            enterprise_id=enterprise.id,
            company_ids={
                row.source_entity_id
                for row in nodes
                if row.node_type == "legal_entity" and row.source_entity_id
            },
        )

    scope_type = "plant" if plant_id else "legal_entity" if company_id else "enterprise"
    scope_id = plant_id or company_id or enterprise.id
    domain = MODULE_DOMAINS.get(module_key, module_key.replace("-", "_"))
    request = AuthorizationRequest(
        enterprise_id=enterprise.id,
        scope_type=scope_type,
        scope_id=scope_id,
        capability=f"{module_key}.{action}",
        domain=domain,
        module_key=module_key,
        data_classification=data_classification,
        record_owner_id=record_owner_id,
    )
    if company_id or plant_id:
        decision = evaluate_access(db, user, request)
        _deny(decision)

    nodes = available_scope_nodes(db, user, enterprise.id)
    data_boundary_nodes = scope_nodes_with_ancestors(db, enterprise.id, nodes)
    company_ids = {
        row.source_entity_id
        for row in data_boundary_nodes
        if row.node_type == "legal_entity" and row.source_entity_id
    }
    plant_ids = {
        row.source_entity_id
        for row in data_boundary_nodes
        if row.node_type == "plant" and row.source_entity_id
    }
    if not company_id and not plant_id:
        allowed = False
        for node in nodes:
            candidate = AuthorizationRequest(
                enterprise_id=enterprise.id,
                scope_type=node.node_type,
                scope_id=node.id,
                capability=f"{module_key}.{action}",
                domain=domain,
                module_key=module_key,
                data_classification=data_classification,
                record_owner_id=record_owner_id,
            )
            if evaluate_access(db, user, candidate).allowed:
                allowed = True
                break
        if not allowed:
            _deny(evaluate_access(db, user, request))

    membership = (
        db.query(EnterpriseMembership)
        .filter(
            EnterpriseMembership.enterprise_id == enterprise.id,
            EnterpriseMembership.user_id == user.id,
            EnterpriseMembership.status == "active",
        )
        .first()
    )
    return RecordAccessScope(
        enterprise_id=enterprise.id,
        company_ids=company_ids,
        plant_ids=plant_ids,
        external_organization_id=membership.external_organization_id
        if membership and membership.identity_type in {"supplier", "customer"}
        else None,
    )


def scope_record_query(query: Query, scope: RecordAccessScope) -> Query:
    if scope.plant_ids:
        query = query.filter(ModuleRecord.plant_id.in_(scope.plant_ids))
    elif scope.company_ids:
        query = query.filter(ModuleRecord.company_id.in_(scope.company_ids))
    else:
        query = query.filter(ModuleRecord.id == "__no_access__")
    if scope.external_organization_id:
        query = query.filter(
            ModuleRecord.payload["external_organization_id"].as_string() == scope.external_organization_id
        )
    return query
