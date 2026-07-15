import os
import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from jose import JWTError, jwt
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from .database import engine, get_db
from .platform_models import AuditLog, ModuleRecord, User
from .runtime_schemas import (
    DemoLoginPayload,
    LoginPayload,
    LoginResult,
    AdminResetPasswordPayload,
    ChangePasswordPayload,
    ForgotPasswordPayload,
    ModuleRecordCreate,
    ModuleRecordUpdate,
    ResetPasswordPayload,
    RuntimeEnvelope,
    SessionUser,
    UserCreate,
    UserUpdate,
)
from .security import (
    JWT_ALGORITHM,
    JWT_SECRET,
    PASSWORD_EXPIRY_DAYS,
    PASSWORD_EXPIRY_WARNING_DAYS,
    create_token,
    generate_secure_password,
    hash_password,
    password_policy,
    validate_password_strength,
    verify_password,
)

router = APIRouter(prefix="/runtime", tags=["Runtime Application"])

TENANT_ID = "tenant-demo-001"
COMPANY_ID = "company-c"
PLANT_ID = "plant-north"
OVERRIDE_ROLES = {"super_admin", "account_owner"}

ROLE_PERMISSIONS = {
    "super_admin": ["platform.super_admin", "platform.admin", "account.override", "organization.override", "team.override", "users.manage", "roles.manage", "data.write", "data.read", "audit.read"],
    "account_owner": ["account.override", "organization.override", "team.override", "users.manage", "roles.manage", "data.write", "data.read", "audit.read"],
    "organization_admin": ["organization.override", "team.override", "users.manage", "data.write", "data.read", "audit.read"],
    "team_manager": ["team.override", "data.write", "data.read"],
    "supervisor": ["data.write", "data.read"],
    "operator": ["data.read"],
    "auditor": ["data.read", "audit.read"],
    "qa_tester": ["quality.write", "data.read"],
    "custom": ["data.read"],
    "admin": ["platform.admin", "users.manage", "data.write", "data.read", "audit.read"],
    "user": ["data.read"],
}

DEMO_ROLE_DETAILS = [
    ("super_admin", "Super Admin", "Platform-wide administration and governance"),
    ("account_owner", "Account Owner", "Account, organization, and team oversight"),
    ("organization_admin", "Organization Admin", "Company administration and data management"),
    ("admin", "Admin", "Company users, Data Hub, and operational administration"),
    ("team_manager", "Team Manager", "Team work allocation and operational oversight"),
    ("supervisor", "Supervisor", "Operational review and supervised updates"),
    ("operator", "Operator", "Assigned operational screens and records"),
    ("auditor", "Auditor", "Read-only operational and audit visibility"),
    ("qa_tester", "QA Tester", "Quality workflows and operational verification"),
    ("custom", "Custom User", "Custom assigned module visibility"),
    ("user", "Standard User", "Standard assigned read-only workspace"),
]
DEMO_READ_PERMISSIONS = {"platform.super_admin", "platform.admin", "data.read", "audit.read"}


def public_demo_enabled() -> bool:
    return os.getenv("ENABLE_PUBLIC_DEMO", "false").strip().lower() in {"1", "true", "yes", "on"}


def public_demo_minutes() -> int:
    try:
        return max(15, min(int(os.getenv("PUBLIC_DEMO_TOKEN_MINUTES", "120")), 240))
    except ValueError:
        return 120


def public_demo_roles() -> list[str]:
    configured = os.getenv("PUBLIC_DEMO_ROLES", "").strip()
    allowed = {item.strip() for item in configured.split(",") if item.strip()} if configured else {item[0] for item in DEMO_ROLE_DETAILS}
    return [role for role, _, _ in DEMO_ROLE_DETAILS if role in allowed]


def demo_permissions_for(role: str) -> list[str]:
    return [permission for permission in permissions_for(role) if permission in DEMO_READ_PERMISSIONS]


def ensure_runtime_schema() -> None:
    inspector = inspect(engine)
    if "users" in inspector.get_table_names():
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "role" not in user_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(40) DEFAULT 'user'"))
        missing_columns = {
            "password_history": "JSON DEFAULT '[]'",
            "password_changed_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            "password_expires_at": "TIMESTAMP",
            "reset_token_hash": "VARCHAR(300)",
            "reset_token_expires_at": "TIMESTAMP",
            "force_password_change": "BOOLEAN DEFAULT FALSE",
        }
        with engine.begin() as connection:
            for column, ddl in missing_columns.items():
                if column not in user_columns:
                    connection.execute(text(f"ALTER TABLE users ADD COLUMN {column} {ddl}"))


def runtime_result(action: str, message: str, data: Any) -> RuntimeEnvelope:
    return RuntimeEnvelope(action=action, message=message, data=data)


def permissions_for(role: str) -> list[str]:
    return ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["user"])


def has_override_scope(user: User) -> bool:
    return (user.role or "user") in OVERRIDE_ROLES


def serialize_user(user: User) -> dict[str, Any]:
    role = user.role or "user"
    demo_read_only = bool(getattr(user, "_demo_read_only", False))
    now = datetime.utcnow()
    expires_at = user.password_expires_at or (user.password_changed_at + timedelta(days=PASSWORD_EXPIRY_DAYS) if user.password_changed_at else None)
    days_to_expiry = (expires_at - now).days if expires_at else None
    return {
        "id": user.id,
        "tenant_id": user.tenant_id,
        "company_id": user.company_id,
        "plant_id": user.plant_id,
        "email": user.email,
        "name": user.name,
        "role": role,
        "is_active": user.is_active,
        "permissions": demo_permissions_for(role) if demo_read_only else permissions_for(role),
        "password_expires_at": expires_at.isoformat() if expires_at else None,
        "password_days_to_expiry": days_to_expiry,
        "password_expiry_warning": days_to_expiry is not None and 0 <= days_to_expiry <= PASSWORD_EXPIRY_WARNING_DAYS,
        "force_password_change": bool(user.force_password_change),
        "demo_read_only": demo_read_only,
        "demo_role": getattr(user, "_demo_role", None),
    }


def serialize_record(record: ModuleRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "tenant_id": record.tenant_id,
        "company_id": record.company_id,
        "plant_id": record.plant_id,
        "module_key": record.module_key,
        "record_type": record.record_type,
        "record_code": record.record_code,
        "name": record.name,
        "status": record.status,
        "quantity": record.quantity,
        "payload": record.payload or {},
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from error
    user_id = payload.get("sub")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled or missing")
    user._demo_read_only = bool(payload.get("demo_read_only", False))
    user._demo_role = payload.get("demo_role")
    return user


def require_any(*roles: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles and user.role not in OVERRIDE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient access")
        return user

    return dependency


def audit(db: Session, actor: User, action: str, entity_type: str, entity_id: str, old_value: dict[str, Any] | None, new_value: dict[str, Any] | None) -> None:
    db.add(
        AuditLog(
            id=f"audit-{uuid4()}",
            tenant_id=actor.tenant_id,
            company_id=actor.company_id,
            plant_id=actor.plant_id,
            actor_id=actor.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
        )
    )


def set_user_password(user: User, password: str, *, force_change_on_login: bool = False) -> None:
    errors = validate_password_strength(password)
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Password does not meet protection criteria", "criteria": password_policy(), "errors": errors})
    history = list(user.password_history or [])
    recent_hashes = [user.password_hash, *history][:3]
    for stored_hash in recent_hashes:
        if not stored_hash or stored_hash == "pending":
            continue
        try:
            if verify_password(password, stored_hash):
                raise HTTPException(status_code=409, detail="New password cannot match the last 3 passwords")
        except ValueError:
            continue
    if user.password_hash:
        history = [user.password_hash, *history][:3]
    now = datetime.utcnow()
    user.password_hash = hash_password(password)
    user.password_history = history
    user.password_changed_at = now
    user.password_expires_at = now + timedelta(days=PASSWORD_EXPIRY_DAYS)
    user.force_password_change = force_change_on_login
    user.reset_token_hash = None
    user.reset_token_expires_at = None


@router.post("/auth/login", response_model=RuntimeEnvelope)
def runtime_login(payload: LoginPayload, db: Session = Depends(get_db)) -> RuntimeEnvelope:
    ensure_runtime_schema()
    user = db.query(User).filter(User.email == payload.email, User.tenant_id == TENANT_ID).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")
    if user.password_expires_at is None:
        user.password_expires_at = datetime.utcnow() + timedelta(days=PASSWORD_EXPIRY_DAYS)
        db.commit()
    role = user.role or "user"
    result = LoginResult(
        access_token=create_token(user.id, user.tenant_id, permissions_for(role), minutes=8 * 60),
        user=SessionUser(**serialize_user(user)),
    )
    return runtime_result("login", "Authenticated user session.", result.model_dump())


@router.get("/auth/demo-config", response_model=RuntimeEnvelope)
def public_demo_config(db: Session = Depends(get_db)) -> RuntimeEnvelope:
    enabled = public_demo_enabled()
    roles: list[dict[str, Any]] = []
    if enabled:
        allowed_roles = public_demo_roles()
        users = (
            db.query(User)
            .filter(User.tenant_id == TENANT_ID, User.is_active.is_(True), User.role.in_(allowed_roles))
            .order_by(User.email)
            .all()
        )
        users_by_role = {user.role: user for user in users}
        for role, label, description in DEMO_ROLE_DETAILS:
            user = users_by_role.get(role)
            if role in allowed_roles and user:
                roles.append({"role": role, "label": label, "description": description, "username": user.email})
    return runtime_result(
        "demo_config",
        "Passwordless read-only demonstration configuration.",
        {"enabled": enabled, "read_only": True, "session_minutes": public_demo_minutes(), "roles": roles},
    )


@router.post("/auth/demo-login", response_model=RuntimeEnvelope)
def public_demo_login(payload: DemoLoginPayload, db: Session = Depends(get_db)) -> RuntimeEnvelope:
    if not public_demo_enabled():
        raise HTTPException(status_code=404, detail="Passwordless demo mode is not enabled")
    if payload.role not in public_demo_roles():
        raise HTTPException(status_code=403, detail="This role is not available in the public demo")
    user = (
        db.query(User)
        .filter(User.tenant_id == TENANT_ID, User.role == payload.role, User.is_active.is_(True))
        .order_by(User.email)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="No active demo user is available for this role")
    user._demo_read_only = True
    user._demo_role = payload.role
    result = LoginResult(
        access_token=create_token(
            user.id,
            user.tenant_id,
            demo_permissions_for(payload.role),
            minutes=public_demo_minutes(),
            claims={"demo_read_only": True, "demo_role": payload.role},
        ),
        user=SessionUser(**serialize_user(user)),
    )
    return runtime_result("demo_login", "Read-only demonstration session created.", result.model_dump())


@router.get("/auth/password-policy", response_model=RuntimeEnvelope)
def get_password_policy() -> RuntimeEnvelope:
    return runtime_result("password_policy", "Password protection criteria.", password_policy())


@router.post("/auth/generate-password", response_model=RuntimeEnvelope)
def generate_password(_: User = Depends(current_user)) -> RuntimeEnvelope:
    return runtime_result("generate_password", "Secure temporary password generated.", {"password": generate_secure_password(), "criteria": password_policy()})


@router.post("/auth/forgot-password", response_model=RuntimeEnvelope)
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)) -> RuntimeEnvelope:
    ensure_runtime_schema()
    user = db.query(User).filter(User.email == payload.email, User.tenant_id == TENANT_ID).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token_hash = hash_password(token)
        user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=30)
        db.commit()
        return runtime_result(
            "forgot_password",
            "Password reset email queued. Demo mode returns the secure link for testing.",
            {"email": payload.email, "reset_link": f"/reset-password?token={token}", "expires_in_minutes": 30},
        )
    return runtime_result("forgot_password", "If the email exists, a password reset link will be sent.", {"email": payload.email})


@router.post("/auth/reset-password", response_model=RuntimeEnvelope)
def reset_password(payload: ResetPasswordPayload, db: Session = Depends(get_db)) -> RuntimeEnvelope:
    ensure_runtime_schema()
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=422, detail="New password and re-entered password must match")
    candidates = db.query(User).filter(User.reset_token_hash.isnot(None), User.tenant_id == TENANT_ID).all()
    user = next((row for row in candidates if row.reset_token_hash and verify_password(payload.token, row.reset_token_hash)), None)
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired")
    set_user_password(user, payload.new_password)
    db.commit()
    return runtime_result("reset_password", "Password updated. User can now sign in.", {"email": user.email})


@router.post("/auth/change-password", response_model=RuntimeEnvelope)
def change_password(payload: ChangePasswordPayload, user: User = Depends(current_user), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=422, detail="New password and re-entered password must match")
    old_value = serialize_user(user)
    set_user_password(user, payload.new_password)
    audit(db, user, "CHANGE_PASSWORD", "user", user.id, old_value, serialize_user(user))
    db.commit()
    return runtime_result("change_password", "Password changed successfully.", serialize_user(user))


@router.get("/auth/me", response_model=RuntimeEnvelope)
def me(user: User = Depends(current_user)) -> RuntimeEnvelope:
    return runtime_result("session", "Current authenticated user.", serialize_user(user))


@router.get("/users", response_model=RuntimeEnvelope)
def list_users(
    _: User = Depends(require_any("admin")),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=250),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    fields: str | None = None,
) -> RuntimeEnvelope:
    actor = _
    query = db.query(User).filter(User.tenant_id == TENANT_ID)
    if not has_override_scope(actor):
        query = query.filter(User.company_id == actor.company_id)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter((User.email.ilike(pattern)) | (User.name.ilike(pattern)) | (User.role.ilike(pattern)))
    users = query.order_by(User.email).offset(offset).limit(clamp_limit(limit)).all()
    return runtime_result("list_users", "Users with access status and roles.", [apply_projection(serialize_user(user), fields) for user in users])


@router.post("/users", response_model=RuntimeEnvelope)
def create_user(payload: UserCreate, actor: User = Depends(require_any("admin")), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    existing = db.query(User).filter(User.email == payload.email, User.tenant_id == TENANT_ID).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")
    if payload.role in {"super_admin", "account_owner"} and actor.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can create top-level override users")
    target_company_id = payload.company_id or actor.company_id or COMPANY_ID
    if not has_override_scope(actor) and target_company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot create users for another company")
    user = User(
        id=f"user-{uuid4()}",
        tenant_id=TENANT_ID,
        company_id=target_company_id,
        plant_id=payload.plant_id or PLANT_ID,
        email=payload.email,
        name=payload.name,
        password_hash="pending",
        role=payload.role,
        is_active=payload.is_active,
    )
    set_user_password(user, payload.password, force_change_on_login=True)
    db.add(user)
    audit(db, actor, "CREATE", "user", user.id, None, serialize_user(user))
    db.commit()
    db.refresh(user)
    return runtime_result("create_user", "User created.", serialize_user(user))


@router.put("/users/{user_id}", response_model=RuntimeEnvelope)
def update_user(user_id: str, payload: UserUpdate, actor: User = Depends(require_any("admin")), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not has_override_scope(actor) and user.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot manage users from another company")
    if user.role in {"super_admin", "account_owner"} and actor.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can update top-level override users")
    if payload.role in {"super_admin", "account_owner"} and actor.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can grant top-level override roles")
    old_value = serialize_user(user)
    if payload.name is not None:
        user.name = payload.name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        set_user_password(user, payload.password, force_change_on_login=True)
    audit(db, actor, "UPDATE", "user", user.id, old_value, serialize_user(user))
    db.commit()
    db.refresh(user)
    return runtime_result("update_user", "User updated.", serialize_user(user))


@router.post("/users/{user_id}/reset-password", response_model=RuntimeEnvelope)
def admin_reset_user_password(user_id: str, payload: AdminResetPasswordPayload, actor: User = Depends(require_any("admin")), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not has_override_scope(actor) and user.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot reset users from another company")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=422, detail="New password and re-entered password must match")
    old_value = serialize_user(user)
    set_user_password(user, payload.new_password, force_change_on_login=payload.force_change_on_login)
    audit(db, actor, "RESET_PASSWORD", "user", user.id, old_value, serialize_user(user))
    db.commit()
    return runtime_result("reset_user_password", "Password reset. Share the temporary password securely with the user.", serialize_user(user))


@router.get("/records", response_model=RuntimeEnvelope)
def list_records(
    module_key: str | None = None,
    company_id: str | None = None,
    plant_id: str | None = None,
    limit: int = Query(100, ge=1, le=250),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    fields: str | None = None,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> RuntimeEnvelope:
    query = db.query(ModuleRecord)
    if not has_override_scope(actor):
        query = query.filter(ModuleRecord.company_id == actor.company_id)
    if module_key:
        query = query.filter(ModuleRecord.module_key == module_key)
    if company_id:
        query = query.filter(ModuleRecord.company_id == company_id)
    if plant_id:
        query = query.filter(ModuleRecord.plant_id == plant_id)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter((ModuleRecord.record_code.ilike(pattern)) | (ModuleRecord.name.ilike(pattern)) | (ModuleRecord.record_type.ilike(pattern)) | (ModuleRecord.status.ilike(pattern)))
    records = query.order_by(ModuleRecord.module_key, ModuleRecord.record_code).offset(offset).limit(clamp_limit(limit)).all()
    return runtime_result("list_records", "Database-backed module records.", [apply_projection(serialize_record(record), fields) for record in records])


@router.post("/records", response_model=RuntimeEnvelope)
def create_record(payload: ModuleRecordCreate, actor: User = Depends(require_any("admin")), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    target_company_id = payload.company_id or actor.company_id or COMPANY_ID
    if not has_override_scope(actor) and target_company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot create records for another company")
    record = ModuleRecord(
        id=f"record-{uuid4()}",
        tenant_id=TENANT_ID,
        company_id=target_company_id,
        plant_id=payload.plant_id or actor.plant_id or PLANT_ID,
        module_key=payload.module_key,
        record_type=payload.record_type,
        record_code=payload.record_code,
        name=payload.name,
        status=payload.status,
        quantity=payload.quantity,
        payload=payload.payload,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    audit(db, actor, "CREATE", "module_record", record.id, None, serialize_record(record))
    db.commit()
    db.refresh(record)
    return runtime_result("create_record", "Module record created.", serialize_record(record))


@router.put("/records/{record_id}", response_model=RuntimeEnvelope)
def update_record(record_id: str, payload: ModuleRecordUpdate, actor: User = Depends(require_any("admin")), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    record = db.get(ModuleRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not has_override_scope(actor) and record.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot modify records from another company")
    old_value = serialize_record(record)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(record, key, value)
    audit(db, actor, "UPDATE", "module_record", record.id, old_value, serialize_record(record))
    db.commit()
    db.refresh(record)
    return runtime_result("update_record", "Module record updated.", serialize_record(record))


@router.delete("/records/{record_id}", response_model=RuntimeEnvelope)
def delete_record(record_id: str, actor: User = Depends(require_any("admin")), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    record = db.get(ModuleRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not has_override_scope(actor) and record.company_id != actor.company_id:
        raise HTTPException(status_code=403, detail="Cannot delete records from another company")
    old_value = serialize_record(record)
    db.delete(record)
    audit(db, actor, "DELETE", "module_record", record_id, old_value, None)
    db.commit()
    return runtime_result("delete_record", "Module record deleted.", {"id": record_id})


@router.get("/inventory/items", response_model=RuntimeEnvelope)
def inventory_items(user: User = Depends(current_user), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    return list_records(module_key="inventory", actor=user, db=db)


@router.get("/analytics/summary", response_model=RuntimeEnvelope)
def analytics_summary(_: User = Depends(current_user), db: Session = Depends(get_db)) -> RuntimeEnvelope:
    actor = _
    record_query = db.query(ModuleRecord)
    user_query = db.query(User)
    if not has_override_scope(actor):
        record_query = record_query.filter(ModuleRecord.company_id == actor.company_id)
        user_query = user_query.filter(User.company_id == actor.company_id)
    active_users = user_query.filter(User.is_active.is_(True)).count()
    disabled_users = user_query.filter(User.is_active.is_(False)).count()
    by_module = {
        module_key: count
        for module_key, count in record_query.with_entities(
            ModuleRecord.module_key,
            func.count(ModuleRecord.id),
        ).group_by(ModuleRecord.module_key).all()
    }
    by_company = {
        company_id or "unassigned": count
        for company_id, count in record_query.with_entities(
            ModuleRecord.company_id,
            func.count(ModuleRecord.id),
        ).group_by(ModuleRecord.company_id).all()
    }
    inventory_query = record_query.filter(ModuleRecord.module_key == "inventory")
    inventory_by_company = {
        company_id or "unassigned": float(quantity or 0)
        for company_id, quantity in inventory_query.with_entities(
            ModuleRecord.company_id,
            func.sum(ModuleRecord.quantity),
        ).group_by(ModuleRecord.company_id).all()
    }
    total_quantity = sum(inventory_by_company.values())
    low_stock_detail_limit = 20
    reorder_level = func.coalesce(ModuleRecord.payload["reorder_level"].as_float(), 0.0)
    low_stock_query = inventory_query.filter(
        func.coalesce(ModuleRecord.quantity, 0.0) <= reorder_level
    )
    low_stock_count = low_stock_query.count()
    low_stock_items = [
        serialize_record(record)
        for record in low_stock_query.order_by(ModuleRecord.created_at.desc())
        .limit(low_stock_detail_limit)
        .all()
    ]
    return runtime_result(
        "analytics_summary",
        "Live database analytics for visualization.",
        {
            "active_users": active_users,
            "disabled_users": disabled_users,
            "module_record_counts": by_module,
            "company_record_counts": by_company,
            "inventory_quantity_by_company": inventory_by_company,
            "inventory_total_quantity": total_quantity,
            "inventory_low_stock_count": low_stock_count,
            "inventory_low_stock_items": low_stock_items,
            "inventory_low_stock_detail_limit": low_stock_detail_limit,
            "inventory_low_stock_items_truncated": low_stock_count > len(low_stock_items),
        },
    )


@router.get("/audit-logs", response_model=RuntimeEnvelope)
def audit_logs(
    _: User = Depends(require_any("admin")),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=250),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    fields: str | None = None,
) -> RuntimeEnvelope:
    actor = _
    query = db.query(AuditLog)
    if not has_override_scope(actor):
        query = query.filter(AuditLog.company_id == actor.company_id)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter((AuditLog.action.ilike(pattern)) | (AuditLog.entity_type.ilike(pattern)) | (AuditLog.entity_id.ilike(pattern)))
    logs = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(clamp_limit(limit)).all()
    data = [
        apply_projection({
            "id": log.id,
            "actor_id": log.actor_id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }, fields)
        for log in logs
    ]
    return runtime_result("audit_logs", "Latest database write audit trail.", data)
def apply_projection(row: dict[str, Any], fields: str | None) -> dict[str, Any]:
    if not fields:
        return row
    allowed = {field.strip() for field in fields.split(",") if field.strip()}
    if not allowed:
        return row
    return {key: value for key, value in row.items() if key in allowed}


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 250))
