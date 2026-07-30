from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .audit import audit
from .database import get_db
from .enterprise_guards import authorize_record_action, scope_record_query
from .feature_flags import module_enabled
from .platform_models import Approval, Company, Department, Document, FeatureFlag, ModuleRecord, Permission, Plant, Role, Task, User
from .platform_schemas import (
    ApprovalDecisionRequest,
    CreateCompanyRequest,
    CreateDepartmentRequest,
    CreatePermissionRequest,
    CreatePlantRequest,
    CreateRoleRequest,
    CreateUserRequest,
    DocumentRequest,
    FeatureFlagRequest,
    ModuleRecordRequest,
    TaskRequest,
)
from .platform_seed import MODULE_KEYS
from .runtime_router import current_user, require_any
from .security import hash_password

router = APIRouter(tags=["Core Platform"])


def as_dict(row):
    return {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in row.__dict__.items()
        if not key.startswith("_")
    }


def has_override_scope(user: User) -> bool:
    return (user.role or "user") in {"super_admin", "account_owner"}


@router.post("/companies")
def create_company(request: CreateCompanyRequest, db: Session = Depends(get_db), _: User = Depends(require_any("super_admin"))):
    normalized_code = request.code.strip().lower()
    company_id = f"company-{normalized_code}"
    if db.query(Company).filter(Company.id == company_id).first():
        raise HTTPException(status_code=409, detail="Company code already exists")
    row = Company(id=company_id, tenant_id=request.tenant_id, name=request.name, code=request.code.strip().upper())
    db.add(row)
    for module_key in MODULE_KEYS:
        db.add(FeatureFlag(id=str(uuid4()), tenant_id=request.tenant_id, company_id=row.id, module_key=module_key, enabled=True))
    db.commit()
    db.refresh(row)
    audit(db, action="CREATE_COMPANY", entity_type="Company", entity_id=row.id, tenant_id=request.tenant_id, company_id=row.id, new_value=as_dict(row))
    return as_dict(row)


@router.get("/companies")
def list_companies(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    query = db.query(Company)
    if not has_override_scope(actor):
        query = query.filter(Company.id == actor.company_id)
    return [as_dict(row) for row in query.all()]


@router.post("/plants")
def create_plant(request: CreatePlantRequest, db: Session = Depends(get_db), actor: User = Depends(require_any("admin"))):
    if not has_override_scope(actor) and request.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot create plants for another company")
    row = Plant(id=f"plant-{request.code.lower()}", tenant_id=request.tenant_id, company_id=request.company_id, name=request.name, code=request.code, timezone=request.timezone)
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, action="CREATE_PLANT", entity_type="Plant", entity_id=row.id, tenant_id=request.tenant_id, company_id=request.company_id, plant_id=row.id, new_value=as_dict(row))
    return as_dict(row)


@router.get("/plants")
def list_plants(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    query = db.query(Plant)
    if not has_override_scope(actor):
        query = query.filter(Plant.company_id == actor.company_id)
    return [as_dict(row) for row in query.all()]


@router.post("/departments")
def create_department(request: CreateDepartmentRequest, db: Session = Depends(get_db), actor: User = Depends(require_any("admin"))):
    if not has_override_scope(actor) and request.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot create departments for another company")
    row = Department(id=f"dept-{request.code.lower()}", tenant_id=request.tenant_id, company_id=request.company_id, plant_id=request.plant_id, name=request.name, code=request.code)
    db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/departments")
def list_departments(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    query = db.query(Department)
    if not has_override_scope(actor):
        query = query.filter(Department.company_id == actor.company_id)
    return [as_dict(row) for row in query.all()]


@router.post("/users")
def create_user(request: CreateUserRequest, db: Session = Depends(get_db), actor: User = Depends(require_any("admin"))):
    if not has_override_scope(actor) and request.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot create core users for another company")
    row = User(id=str(uuid4()), tenant_id=request.tenant_id, company_id=request.company_id, plant_id=request.plant_id, email=request.email, name=request.name, password_hash=hash_password(request.password))
    db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    return [as_dict(row) for row in db.query(User).all()]


@router.post("/roles")
def create_role(request: CreateRoleRequest, db: Session = Depends(get_db), actor: User = Depends(require_any("admin"))):
    if not has_override_scope(actor) and request.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot create roles for another company")
    row = Role(id=str(uuid4()), tenant_id=request.tenant_id, company_id=request.company_id, name=request.name, permissions=request.permissions)
    db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    return [as_dict(row) for row in db.query(Role).all()]


@router.post("/permissions")
def create_permission(request: CreatePermissionRequest, db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    row = Permission(id=str(uuid4()), key=request.key, description=request.description)
    db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/permissions")
def list_permissions(db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    return [as_dict(row) for row in db.query(Permission).all()]


@router.post("/feature-flags")
def set_feature_flag(request: FeatureFlagRequest, db: Session = Depends(get_db), actor: User = Depends(require_any("admin"))):
    if not has_override_scope(actor) and request.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot manage feature flags for another company")
    row = (
        db.query(FeatureFlag)
        .filter(
            FeatureFlag.tenant_id == request.tenant_id,
            FeatureFlag.company_id == request.company_id,
            FeatureFlag.module_key == request.module_key,
        )
        .first()
    )
    if row:
        row.enabled = request.enabled
        row.rules = request.rules
    else:
        row = FeatureFlag(id=str(uuid4()), **request.model_dump())
        db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/feature-flags")
def list_feature_flags(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    query = db.query(FeatureFlag)
    if not has_override_scope(actor):
        query = query.filter(FeatureFlag.company_id == actor.company_id)
    return [as_dict(row) for row in query.all()]


@router.post("/feature-flags/{module_key}/enable")
def enable_module(
    module_key: str,
    company_id: str = "company-c",
    tenant_id: str = "tenant-demo-001",
    db: Session = Depends(get_db),
    actor: User = Depends(require_any("admin")),
):
    return set_feature_flag(FeatureFlagRequest(tenant_id=tenant_id, company_id=company_id, module_key=module_key, enabled=True), db, actor)


@router.post("/feature-flags/{module_key}/disable")
def disable_module(
    module_key: str,
    company_id: str = "company-c",
    tenant_id: str = "tenant-demo-001",
    db: Session = Depends(get_db),
    actor: User = Depends(require_any("admin")),
):
    return set_feature_flag(FeatureFlagRequest(tenant_id=tenant_id, company_id=company_id, module_key=module_key, enabled=False), db, actor)


@router.post("/tasks")
def create_task(request: TaskRequest, db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    row = Task(id=str(uuid4()), **request.model_dump(), status="OPEN")
    db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [as_dict(row) for row in db.query(Task).all()]


@router.post("/approvals/{approval_id}/decision")
def decide_approval(approval_id: str, request: ApprovalDecisionRequest, db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    row = db.query(Approval).filter(Approval.id == approval_id).first()
    if not row:
        row = Approval(id=approval_id, tenant_id="tenant-demo-001", company_id="company-c", plant_id="plant-north", entity_type="draft", entity_id=approval_id)
        db.add(row)
    row.status = request.status
    row.decided_by_id = request.decided_by_id
    row.reason = request.reason
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/approvals")
def list_approvals(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [as_dict(row) for row in db.query(Approval).all()]


@router.post("/documents")
def upload_document(request: DocumentRequest, db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    row = Document(id=str(uuid4()), **request.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.get("/documents")
def list_documents(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [as_dict(row) for row in db.query(Document).all()]


@router.get("/audit-logs")
def view_audit_logs(db: Session = Depends(get_db), _: User = Depends(require_any("admin"))):
    return [as_dict(row) for row in db.query(__import__("app.platform_models", fromlist=["AuditLog"]).AuditLog).all()]


def create_module_router(module_key: str, prefix: str) -> APIRouter:
    module_router = APIRouter(prefix=prefix, tags=[module_key])
    functional_module = (
        "warehouse"
        if module_key.startswith("warehouse")
        else "procurement"
        if module_key in {"suppliers", "purchase_requisitions", "purchase_orders"}
        else "production"
        if module_key in {"products", "bom", "routing", "production_orders", "production_schedules"}
        else module_key
    )

    @module_router.get("")
    def list_records(actor: User = Depends(current_user), db: Session = Depends(get_db)):
        access_scope = authorize_record_action(db, actor, module_key=functional_module, action="view")
        query = scope_record_query(
            db.query(ModuleRecord).filter(ModuleRecord.module_key == module_key),
            access_scope,
        )
        return [as_dict(row) for row in query.all()]

    @module_router.post("")
    def create_record(request: ModuleRecordRequest, actor: User = Depends(current_user), db: Session = Depends(get_db)):
        if not module_enabled(db, request.tenant_id, request.company_id, module_key):
            raise HTTPException(status_code=403, detail=f"{module_key} module is disabled for this company")
        authorize_record_action(
            db,
            actor,
            module_key=functional_module,
            action="create",
            company_id=request.company_id,
            plant_id=request.plant_id,
            data_classification=str(request.payload.get("data_classification", "internal")),
            record_owner_id=request.payload.get("record_owner_id") or request.payload.get("external_organization_id"),
        )
        row = ModuleRecord(id=str(uuid4()), module_key=module_key, record_type=prefix.strip("/"), **request.model_dump())
        db.add(row)
        db.commit()
        db.refresh(row)
        return as_dict(row)

    return module_router
