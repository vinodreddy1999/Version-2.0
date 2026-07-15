from typing import Any, Literal

from pydantic import BaseModel, Field


RoleName = Literal[
    "super_admin",
    "account_owner",
    "organization_admin",
    "team_manager",
    "supervisor",
    "operator",
    "auditor",
    "qa_tester",
    "custom",
    "admin",
    "user",
]


class RuntimeEnvelope(BaseModel):
    action: str
    message: str
    data: Any


class LoginPayload(BaseModel):
    email: str
    password: str = Field(min_length=1)


class DemoLoginPayload(BaseModel):
    role: RoleName


class ForgotPasswordPayload(BaseModel):
    email: str


class ResetPasswordPayload(BaseModel):
    token: str = Field(min_length=16)
    new_password: str = Field(min_length=1)
    confirm_password: str = Field(min_length=1)


class ChangePasswordPayload(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=1)
    confirm_password: str = Field(min_length=1)


class AdminResetPasswordPayload(BaseModel):
    new_password: str = Field(min_length=1)
    confirm_password: str = Field(min_length=1)
    force_change_on_login: bool = True


class SessionUser(BaseModel):
    id: str
    tenant_id: str
    company_id: str | None = None
    plant_id: str | None = None
    email: str
    name: str
    role: RoleName
    is_active: bool
    permissions: list[str]
    password_expires_at: str | None = None
    password_days_to_expiry: int | None = None
    password_expiry_warning: bool = False
    force_password_change: bool = False
    demo_read_only: bool = False
    demo_role: RoleName | None = None


class LoginResult(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: SessionUser


class UserCreate(BaseModel):
    email: str
    name: str = Field(min_length=2)
    password: str = Field(min_length=8)
    role: RoleName = "user"
    is_active: bool = True
    company_id: str | None = None
    plant_id: str | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    role: RoleName | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class ModuleRecordCreate(BaseModel):
    company_id: str | None = None
    plant_id: str | None = None
    module_key: str = Field(min_length=2)
    record_type: str = Field(min_length=2)
    record_code: str = Field(min_length=2)
    name: str = Field(min_length=2)
    status: str = "ACTIVE"
    quantity: float | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class ModuleRecordUpdate(BaseModel):
    company_id: str | None = None
    plant_id: str | None = None
    record_type: str | None = None
    record_code: str | None = None
    name: str | None = None
    status: str | None = None
    quantity: float | None = None
    payload: dict[str, Any] | None = None
