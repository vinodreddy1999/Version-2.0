from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt

from .auth_router import router as auth_router
from .core_router import create_module_router, router as core_router
from .database import Base, SessionLocal, engine, get_db
from .enterprise import configure_enterprise, enterprise_router
from .metadata_store import first_metadata, list_metadata, upsert_metadata
from .modules.customer_portal import ai_router as customer_portal_ai_router
from .modules.customer_portal import router as customer_portal_router
from .modules.costing import ai_router as costing_ai_router
from .modules.costing import router as costing_router
from .modules.integrations import ai_router as integrations_ai_router
from .modules.integrations import router as integrations_router
from .modules.inventory import router as inventory_router
from .modules.frontend_admin import admin_router, ai_command_router, data_hub_router, digital_ops_router, digital_twin_router, frontend_router, planning_router, platform_management_router
from .modules.maintenance import ai_router as maintenance_ai_router
from .modules.maintenance import alias_router as maintenance_alias_router
from .modules.maintenance import router as maintenance_router
from .modules.manufacturing_intelligence import router as manufacturing_intelligence_router
from .modules.mobile import ai_router as mobile_ai_router
from .modules.mobile import router as mobile_router
from .modules.production import router as production_router
from .modules.quality import ai_router as quality_ai_router
from .modules.quality import router as quality_router
from .modules.reporting import ai_router as reporting_ai_router
from .modules.reporting import router as reporting_router
from .modules.sales import ai_router as sales_ai_router
from .modules.sales import router as sales_router
from .modules.supplier_portal import ai_router as supplier_portal_ai_router
from .modules.supplier_portal import router as supplier_portal_router
from .platform_seed import seed_platform
from .platform_models import AppMetadata, FeatureFlag, ModuleRecord, User
from .runtime_router import ensure_runtime_schema, router as runtime_router
from .security import JWT_ALGORITHM as RUNTIME_JWT_ALGORITHM
from .security import JWT_SECRET as RUNTIME_JWT_SECRET
from .schemas import (
    ApiResult,
    ForecastRequest,
    LoginRequest,
    LoginResponse,
    ModuleKey,
    PurchaseRequisitionRequest,
    RecommendationRequest,
)
from .store import MODULES, store

JWT_SECRET = "local-python-demo-secret"
JWT_ALGORITHM = "HS256"

app = FastAPI(
    title="Metam Services - Python Backend",
    version="0.2.6",
    description="Python/FastAPI implementation of the Metam Services backend modules.",
)
configure_enterprise(app)

app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
DEMO_LOGIN_PATHS = {"/runtime/auth/demo-login", "/api/v1/runtime/auth/demo-login"}


@app.middleware("http")
async def enforce_read_only_demo_sessions(request: Request, call_next):
    if request.method.upper() in DEMO_SAFE_METHODS or request.url.path in DEMO_LOGIN_PATHS:
        return await call_next(request)
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        try:
            claims = jwt.decode(header.split(" ", 1)[1], RUNTIME_JWT_SECRET, algorithms=[RUNTIME_JWT_ALGORITHM])
        except JWTError:
            claims = {}
        if claims.get("demo_read_only") is True:
            return JSONResponse(
                status_code=403,
                content={"detail": "Read-only demo sessions cannot modify data."},
            )
    return await call_next(request)

Base.metadata.create_all(bind=engine)
ensure_runtime_schema()
with SessionLocal() as bootstrap_db:
    seed_platform(bootstrap_db)

app.include_router(auth_router)
app.include_router(runtime_router)
app.include_router(runtime_router, prefix="/api/v1")
app.include_router(enterprise_router)
app.include_router(core_router)
app.include_router(costing_router)
app.include_router(costing_ai_router)
app.include_router(customer_portal_router)
app.include_router(customer_portal_ai_router)
app.include_router(integrations_router)
app.include_router(integrations_ai_router)
app.include_router(inventory_router)
app.include_router(frontend_router)
app.include_router(admin_router)
app.include_router(platform_management_router)
app.include_router(data_hub_router)
app.include_router(planning_router)
app.include_router(ai_command_router)
app.include_router(digital_twin_router)
app.include_router(digital_ops_router)
app.include_router(manufacturing_intelligence_router)
app.include_router(production_router)
app.include_router(maintenance_router)
app.include_router(maintenance_alias_router)
app.include_router(maintenance_ai_router)
app.include_router(mobile_router)
app.include_router(mobile_ai_router)
app.include_router(quality_router)
app.include_router(quality_ai_router)
app.include_router(reporting_router)
app.include_router(reporting_ai_router)
app.include_router(sales_router)
app.include_router(sales_ai_router)
app.include_router(supplier_portal_router)
app.include_router(supplier_portal_ai_router)
app.include_router(create_module_router("warehouse", "/warehouses"))
app.include_router(create_module_router("warehouse_zones", "/warehouses/{warehouse_id}/zones"))
app.include_router(create_module_router("warehouse_map", "/warehouses/{warehouse_id}/map"))
app.include_router(create_module_router("warehouse_locations", "/warehouse-locations"))
app.include_router(create_module_router("warehouse_movements", "/warehouse-movements"))
app.include_router(create_module_router("warehouse_occupancy", "/warehouse-occupancy"))
app.include_router(create_module_router("suppliers", "/suppliers"))
app.include_router(create_module_router("purchase_requisitions", "/purchase-requisitions"))
app.include_router(create_module_router("purchase_orders", "/purchase-orders"))
app.include_router(create_module_router("products", "/products"))
app.include_router(create_module_router("bom", "/bom"))
app.include_router(create_module_router("routing", "/routing"))
app.include_router(create_module_router("production_orders", "/production-orders"))
app.include_router(create_module_router("production_schedules", "/production-schedules"))

frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def result(module: ModuleKey, action: str, message: str, data: dict[str, Any] | list[dict[str, Any]]) -> ApiResult:
    return ApiResult(module=module, action=action, message=message, data=data)


def make_token(user: dict[str, Any], tenant: dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user["id"],
            "tenant_id": tenant["id"],
            "tenant_slug": tenant["slug"],
            "permissions": user["permissions"],
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=8)).timestamp()),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "runtime": "python-fastapi", "service": "metam-services"}


@app.get("/modules")
def list_modules(db=Depends(get_db)) -> list[dict[str, Any]]:
    modules = list_metadata(db, "module_definition")
    return modules or [module.model_dump() for module in MODULES]


@app.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest, db=Depends(get_db)) -> LoginResponse:
    tenant = first_metadata(db, "tenant", request.tenant_slug)
    user = db.query(User).filter(User.email == request.email).first()
    if not tenant or not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid tenant or credentials")
    from .security import verify_password
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid tenant or credentials")
    company_id = user.company_id or "company-c"
    enabled_flags = (
        db.query(FeatureFlag)
        .filter(FeatureFlag.tenant_id == tenant["id"], FeatureFlag.company_id == company_id, FeatureFlag.enabled.is_(True))
        .all()
    )
    enabled_modules: list[ModuleKey] = []
    for flag in enabled_flags:
        key = flag.module_key.upper()
        if key in ModuleKey.__members__:
            enabled_modules.append(ModuleKey[key])
    return LoginResponse(
        access_token=make_token(
            {
                "id": user.id,
                "permissions": ["platform.admin"] if user.role in {"admin", "super_admin", "account_owner", "organization_admin"} else ["platform.read"],
            },
            tenant,
        ),
        tenant_id=tenant["id"],
        user_id=user.id,
        enabled_modules=enabled_modules or tenant["enabled_modules"],
    )


@app.get("/platform/overview", response_model=ApiResult)
def platform_overview(db=Depends(get_db)) -> ApiResult:
    return result(
        ModuleKey.PLATFORM,
        "overview",
        "Platform tenant, company, plant and feature flag summary.",
        {
            "tenant": first_metadata(db, "tenant", "precision-components") or store.snapshot(store.tenants["precision-components"]),
            "companies": [row.payload for row in db.query(AppMetadata).filter(AppMetadata.category == "company").all()] or store.snapshot(store.companies),
            "plants": [row.payload for row in db.query(AppMetadata).filter(AppMetadata.category == "plant").all()] or store.snapshot(store.plants),
            "enabled_modules": [module["key"] for module in list_modules(db)],
        },
    )



@app.get("/warehouse/locations", response_model=ApiResult)
def warehouse_locations(db=Depends(get_db)) -> ApiResult:
    return result(ModuleKey.WAREHOUSE, "list_locations", "Warehouse hierarchy and bin occupancy.", list_metadata(db, "location", company_id="company-c", plant_id="plant-north"))


@app.get("/supplier/suppliers", response_model=ApiResult)
def suppliers(db=Depends(get_db)) -> ApiResult:
    return result(ModuleKey.SUPPLIER, "list_suppliers", "Supplier ratings and delivery reliability.", list_metadata(db, "supplier", company_id="company-c"))


@app.post("/procurement/requisitions", response_model=ApiResult)
def create_requisition(request: PurchaseRequisitionRequest, db=Depends(get_db)) -> ApiResult:
    requisition = {
        "id": f"pr-{datetime.now(timezone.utc).timestamp()}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        **request.model_dump(),
        "status": "PENDING_APPROVAL",
    }
    upsert_metadata(
        db,
        category="procurement_requisition",
        record_key=requisition["id"],
        row_id=requisition["id"],
        company_id="company-c",
        plant_id="plant-north",
        payload=requisition,
        name=request.item_id,
    )
    db.commit()
    return result(ModuleKey.PROCUREMENT, "create_requisition", "Purchase requisition created for approval.", requisition)


@app.get("/procurement/requisitions", response_model=ApiResult)
def list_requisitions(db=Depends(get_db)) -> ApiResult:
    return result(ModuleKey.PROCUREMENT, "list_requisitions", "Purchase requisition work queue.", list_metadata(db, "procurement_requisition", company_id="company-c", plant_id="plant-north"))


@app.get("/reporting/kpis", response_model=ApiResult)
def reporting_kpis(db=Depends(get_db)) -> ApiResult:
    requisitions = list_metadata(db, "procurement_requisition", company_id="company-c", plant_id="plant-north")
    work_orders = db.query(ModuleRecord).filter(ModuleRecord.module_key == "maintenance", ModuleRecord.company_id == "company-c").count()
    inspections = list_metadata(db, "stock_count", company_id="company-c", plant_id="plant-north")
    kpis = {
        "inventory_value": 18400000,
        "pending_approvals": len(requisitions),
        "open_maintenance_work_orders": work_orders,
        "warehouse_occupancy_percent": 76,
        "quality_inspections": len(inspections),
    }
    return result(ModuleKey.REPORTING, "kpis", "Operational KPI dashboard output.", kpis)


@app.post("/supply-chain/forecast", response_model=ApiResult)
def supply_chain_forecast(request: ForecastRequest) -> ApiResult:
    base_demand = 1200 if request.item_id == "item-steel" else 18
    forecast = [
        {"period": period, "forecast_quantity": round(base_demand * (1 + period * 0.035), 2)}
        for period in range(1, request.periods + 1)
    ]
    return result(ModuleKey.SUPPLY_CHAIN, "forecast", "Demand forecast generated from demo trend logic.", forecast)


@app.get("/supply-chain/load-plan", response_model=ApiResult)
def supply_chain_load_plan() -> ApiResult:
    plan = {
        "truck_capacity_kg": 24000,
        "loads": [
            {"truck": "TRUCK-01", "item_id": "item-steel", "quantity_kg": 18000, "utilization_percent": 75},
            {"truck": "TRUCK-02", "item_id": "item-steel", "quantity_kg": 22000, "utilization_percent": 91.7},
        ],
    }
    return result(ModuleKey.SUPPLY_CHAIN, "load_plan", "Truck-load plan calculated for available supply.", plan)


@app.post("/ai/recommendations", response_model=ApiResult)
def ai_recommendation(request: RecommendationRequest) -> ApiResult:
    recommendation = {
        "recommendation_id": "rec-demo-001",
        "summary": "Create a purchase requisition and review safety stock before approving production release.",
        "risk_level": request.risk_level,
        "requires_human_approval": True,
        "draft_actions": [
            {"type": "CREATE_REQUISITION", "status": "DRAFT"},
            {"type": "ADJUST_SAFETY_STOCK", "status": "DRAFT"},
        ],
    }
    return result(ModuleKey.AI, "recommendation", "AI recommendation generated as draft actions only.", recommendation)


if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    def serve_frontend_index() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    def serve_frontend_app(path: str) -> FileResponse:
        requested = frontend_dist / path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(frontend_dist / "index.html")
