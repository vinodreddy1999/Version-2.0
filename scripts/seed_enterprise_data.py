#!/usr/bin/env python3
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8080").rstrip("/")
SEED_ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "enterprise.owner@example-global.local")
SEED_ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "Enterprise123!")


@dataclass(frozen=True)
class SeedUser:
    email: str
    name: str
    role: str
    password: str
    is_active: bool = True
    company_id: str = "company-c"
    plant_id: str = "plant-north"


@dataclass(frozen=True)
class SeedCompany:
    company_id: str
    company_name: str
    company_code: str
    plant_id: str
    plant_name: str
    industry: str


def request_json(method: str, path: str, payload: dict[str, Any] | None = None, token: str | None = None) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(f"{BASE_URL}{path}", data=body, method=method)
    request.add_header("Accept", "application/json")
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_post(path: str, token: str, payload: dict[str, Any], duplicate_ok: bool = False) -> tuple[bool, str]:
    try:
        request_json("POST", path, payload, token)
        return True, "created"
    except HTTPError as error:
        if duplicate_ok and error.code == 409:
            return False, "exists"
        detail = error.read().decode("utf-8")
        raise RuntimeError(f"POST {path} failed: {error.code} {detail}") from error


def login() -> str:
    response = request_json(
        "POST",
        "/runtime/auth/login",
        {"email": SEED_ADMIN_EMAIL, "password": SEED_ADMIN_PASSWORD},
    )
    return response["data"]["access_token"]


def companies() -> list[SeedCompany]:
    return [
        SeedCompany("company-c", "Company C", "COC", "plant-north", "North Plant", "manufacturing"),
        SeedCompany("company-apex", "Apex Components Ltd", "APX", "plant-apex-hyd", "Apex Hyderabad Plant", "automotive"),
        SeedCompany("company-nova", "Nova Textiles Pvt Ltd", "NOV", "plant-nova-srt", "Nova Surat Mill", "textile"),
        SeedCompany("company-fresh", "FreshFoods Processing Co", "FRS", "plant-fresh-pune", "FreshFoods Pune Plant", "food_processing"),
        SeedCompany("company-med", "MedSure Pharma", "MED", "plant-med-vizag", "MedSure Vizag Facility", "pharmaceutical"),
    ]


def role_users() -> list[SeedUser]:
    roles = [
        ("super", "Super Admin", "super_admin", True),
        ("owner", "Account Owner", "account_owner", True),
        ("orgadmin", "Organization Admin", "organization_admin", True),
        ("manager", "Team Manager", "team_manager", True),
        ("supervisor", "Supervisor", "supervisor", True),
        ("operator", "Operator", "operator", True),
        ("auditor", "Auditor", "auditor", True),
        ("qa", "QA Tester", "qa_tester", True),
        ("custom", "Custom Role User", "custom", True),
        ("admin", "Admin", "admin", True),
        ("user", "Read Only User", "user", True),
        ("disabled.operator", "Disabled Operator", "operator", False),
    ]
    users: list[SeedUser] = []
    for company in companies():
        for slug, label, role, active in roles:
            users.append(
                SeedUser(
                    f"{slug}.{company.company_code.lower()}@metam.local",
                    f"{company.company_name} {label}",
                    role,
                    "Enterprise123!",
                    active,
                    company.company_id,
                    company.plant_id,
                )
            )
    return users


def record(company: SeedCompany, module_key: str, record_type: str, code: str, name: str, status: str, quantity: float, **payload: Any) -> dict[str, Any]:
    return {
        "company_id": company.company_id,
        "plant_id": company.plant_id,
        "module_key": module_key,
        "record_type": record_type,
        "record_code": code,
        "name": name,
        "status": status,
        "quantity": quantity,
        "payload": {
            "company_id": company.company_id,
            "company_name": company.company_name,
            "company_code": company.company_code,
            "plant_id": company.plant_id,
            "plant_name": company.plant_name,
            **payload,
        },
    }


def enterprise_records(batch: str) -> list[dict[str, Any]]:
    industries = [
        ("manufacturing", "MFG", "Discrete Manufacturing"),
        ("textile", "TXT", "Textile Mill"),
        ("clothing", "CLT", "Clothing Factory"),
        ("food_processing", "FOD", "Food Processing"),
        ("electronics", "ELC", "Electronics Assembly"),
        ("automotive", "AUT", "Automotive Parts"),
        ("pharmaceutical", "PHR", "Pharmaceutical Batch"),
        ("packaging", "PKG", "Packaging Line"),
        ("warehousing", "WHR", "Warehouse Operation"),
        ("logistics", "LOG", "Logistics Fleet"),
        ("chemical", "CHM", "Chemical Plant"),
        ("generic_business", "GEN", "Generic Business"),
    ]

    rows: list[dict[str, Any]] = []
    for company_index, company in enumerate(companies(), start=1):
        for index, (industry, code, label) in enumerate(industries, start=1):
            composite_index = company_index * 100 + index
            rows.extend(
                [
                    record(
                        company,
                    "inventory",
                    "raw_material",
                    f"ENT-{batch}-{company.company_code}-{code}-RM",
                    f"{company.company_name} {label} Raw Material",
                    "LOW_STOCK" if composite_index % 4 == 0 else "AVAILABLE",
                    80 + composite_index * 3,
                    industry=industry,
                    uom="kg",
                    reorder_level=420 if composite_index % 4 == 0 else 120,
                    warehouse=f"WH-{(index % 4) + 1}",
                    zone=f"Z-{(index % 5) + 1}",
                    rack=f"R-{composite_index:03d}",
                    bin=f"BIN-{composite_index:04d}",
                    unit_cost=25 + composite_index,
                    supplier=f"{company.company_name} Supplier {code}",
                ),
                record(
                    company,
                    "procurement",
                    "purchase_requisition",
                    f"ENT-{batch}-{company.company_code}-{code}-PR",
                    f"{company.company_name} {label} Procurement Request",
                    "PENDING_APPROVAL" if composite_index % 3 == 0 else "DRAFT",
                    100 + composite_index * 2,
                    industry=industry,
                    supplier=f"{company.company_name} Supplier {code}",
                    lead_time_days=3 + (index % 8),
                    estimated_value=(100 + composite_index * 2) * (40 + index),
                    approval_required=True,
                ),
                record(
                    company,
                    "production",
                    "work_order",
                    f"ENT-{batch}-{company.company_code}-{code}-WO",
                    f"{company.company_name} {label} Production Work Order",
                    "SCHEDULED" if composite_index % 2 else "IN_PROGRESS",
                    30 + composite_index,
                    industry=industry,
                    line=f"LINE-{(index % 6) + 1}",
                    priority="high" if composite_index % 5 == 0 else "normal",
                    due_date="2026-07-15",
                    oee_target=82 + (index % 10),
                ),
                record(
                    company,
                    "quality",
                    "inspection_lot",
                    f"ENT-{batch}-{company.company_code}-{code}-QI",
                    f"{company.company_name} {label} Quality Inspection",
                    "OPEN" if composite_index % 3 else "IN_REVIEW",
                    10 + index,
                    industry=industry,
                    sample_size=3 + (index % 5),
                    acceptance_level="AQL-1.5",
                    defect_rate_percent=round((index % 6) * 0.7, 2),
                ),
                record(
                    company,
                    "maintenance",
                    "work_order",
                    f"ENT-{batch}-{company.company_code}-{code}-MWO",
                    f"{company.company_name} {label} Maintenance Task",
                    "OPEN" if composite_index % 2 else "ASSIGNED",
                    1,
                    industry=industry,
                    asset=f"ASSET-{company.company_code}-{code}-{index:03d}",
                    priority="critical" if composite_index % 6 == 0 else "medium",
                    estimated_hours=2 + (index % 7),
                ),
                record(
                    company,
                    "sales",
                    "sales_order",
                    f"ENT-{batch}-{company.company_code}-{code}-SO",
                    f"{company.company_name} {label} Customer Order",
                    "OPEN" if composite_index % 2 else "ALLOCATED",
                    20 + composite_index,
                    industry=industry,
                    customer=f"{company.company_name} Customer {code}",
                    requested_date="2026-07-20",
                    margin_percent=12 + (index % 9),
                ),
            ]
        )

        rows.extend(
            [
                record(company, "warehouse", "bin_occupancy", f"ENT-{batch}-{company.company_code}-WH-OCC-001", f"{company.company_name} Main Warehouse Occupancy", "ACTIVE", 78 + company_index, warehouse="WH-1", occupancy_percent=78 + company_index, congestion="medium"),
                record(company, "warehouse", "bin_occupancy", f"ENT-{batch}-{company.company_code}-WH-OCC-002", f"{company.company_name} Critical Warehouse Occupancy", "ACTIVE", 88 + company_index, warehouse="WH-2", occupancy_percent=88 + company_index, congestion="high"),
                record(company, "reporting", "scheduled_report", f"ENT-{batch}-{company.company_code}-RPT-DAILY", f"{company.company_name} Daily Executive Operations Report", "SCHEDULED", 1, cadence="daily", recipients=[f"owner.{company.company_code.lower()}@metam.local", f"admin.{company.company_code.lower()}@metam.local"]),
                record(company, "reporting", "scheduled_report", f"ENT-{batch}-{company.company_code}-RPT-WEEKLY", f"{company.company_name} Weekly Plant Performance Report", "SCHEDULED", 1, cadence="weekly", recipients=[f"manager.{company.company_code.lower()}@metam.local"]),
                record(company, "costing", "cost_snapshot", f"ENT-{batch}-{company.company_code}-COST-001", f"{company.company_name} Inventory Valuation Snapshot", "POSTED", 18400000 + company_index * 850000, currency="INR", variance_percent=3.4 + company_index / 10),
                record(company, "integrations", "erp_sync", f"ENT-{batch}-{company.company_code}-ERP-SYNC", f"{company.company_name} ERP Inventory Sync", "HEALTHY", 12500 + company_index * 200, provider="SAP S/4HANA", last_sync="2026-06-12T10:00:00Z"),
                record(company, "integrations", "iot_stream", f"ENT-{batch}-{company.company_code}-IOT-STREAM", f"{company.company_name} Machine Telemetry Stream", "DEGRADED", 4200 + company_index * 100, provider="MQTT", packet_loss_percent=1.7),
                record(company, "mobile", "offline_sync", f"ENT-{batch}-{company.company_code}-MOB-SYNC", f"{company.company_name} Warehouse Scanner Offline Sync", "PENDING", 42 + company_index, device_group="warehouse_scanners", conflicts=company_index),
                record(company, "ai_copilot", "recommendation", f"ENT-{batch}-{company.company_code}-AI-REC", f"{company.company_name} Consume Expiring Batch First", "DRAFT", 1, requires_human_approval=True, risk_level="HIGH"),
            ]
        )
    return rows


def main() -> int:
    print(f"Connecting to {BASE_URL}")
    health = request_json("GET", "/health")
    print(f"Health: {health['status']}")
    token = login()
    print(f"Authenticated as authorized enterprise seed owner: {SEED_ADMIN_EMAIL}")

    created_users = 0
    existing_users = 0
    for user in role_users():
        created, status = safe_post(
            "/runtime/users",
            token,
            {
                "email": user.email,
                "name": user.name,
                "password": user.password,
                "role": user.role,
                "is_active": user.is_active,
                "company_id": user.company_id,
                "plant_id": user.plant_id,
            },
            duplicate_ok=True,
        )
        created_users += int(created)
        existing_users += int(status == "exists")

    batch = time.strftime("%Y%m%d%H%M%S")
    rows = enterprise_records(batch)
    for row in rows:
        try:
            safe_post("/runtime/records", token, row)
        except RuntimeError as error:
            raise RuntimeError(
                f"Record seed failed for module={row['module_key']} "
                f"company={row['company_id']} code={row['record_code']}"
            ) from error

    analytics = request_json("GET", "/runtime/analytics/summary", token=token)["data"]
    users = request_json("GET", "/runtime/users", token=token)["data"]
    audit_logs = request_json("GET", "/runtime/audit-logs", token=token)["data"]

    print(f"Users created: {created_users}")
    print(f"Users already existed: {existing_users}")
    print(f"Records created: {len(rows)}")
    print(f"Active users: {analytics['active_users']}")
    print(f"Disabled users: {analytics['disabled_users']}")
    print(f"Module counts: {analytics['module_record_counts']}")
    print(f"Company counts: {analytics.get('company_record_counts', {})}")
    print(f"Inventory quantity by company: {analytics.get('inventory_quantity_by_company', {})}")
    print(f"Low stock items: {analytics['inventory_low_stock_count']}")
    print(f"Audit rows returned: {len(audit_logs)}")
    print("Role coverage:")
    for role in sorted({user["role"] for user in users}):
        count = sum(1 for user in users if user["role"] == role)
        print(f"  {role}: {count}")
    print("Enterprise seed: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
