from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.platform_models import AppMetadata


client = TestClient(app)


def runtime_headers(email: str = "super@metam.local", password: str = "SuperAdmin123!") -> dict[str, str]:
    response = client.post("/runtime/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_enterprise_observability_endpoints():
    assert client.get("/live").json()["success"] is True
    assert client.get("/ready").json()["success"] is True

    info = client.get("/info")
    assert info.status_code == 200
    assert "manufacturing" in info.json()["data"]["industries"]

    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "metam_requests_total" in metrics.text

    traffic = client.get("/traffic")
    assert traffic.status_code == 200
    assert "requests" in traffic.json()["data"]

    swagger = client.get("/swagger", follow_redirects=False)
    assert swagger.status_code in {307, 308}


def test_modules_are_available():
    response = client.get("/modules")
    assert response.status_code == 200
    modules = {item["key"] for item in response.json()}
    assert "INVENTORY" in modules
    assert "PRODUCTION" in modules
    assert "AI" in modules


def test_demo_login():
    response = client.post(
        "/auth/login",
        json={
            "tenant_slug": "precision-components",
            "email": "admin@metam.local",
            "password": "ChangeMe123!",
        },
    )
    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"


def test_inventory_balances():
    response = client.get("/inventory/balances")
    assert response.status_code == 200
    assert response.json()["module"] == "INVENTORY"



def test_inventory_dashboard():
    response = client.get("/inventory/dashboard")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total_inventory_value"] > 0
    assert "low_stock_risks" in data
    assert "warehouse_occupancy" in data


def test_inventory_items_by_category():
    response = client.get("/inventory/items/by-category")
    assert response.status_code == 200
    data = response.json()["data"]
    assert "RAW_MATERIALS" in data
    assert "FINISHED_GOODS" in data


def test_inventory_warehouse_map_highlight():
    response = client.get("/inventory/warehouse-map?search_item_id=item-steel")
    assert response.status_code == 200
    bins = response.json()["data"]["bins"]
    assert any(item["highlight"] for item in bins)


def test_inventory_reservation_create():
    response = client.post(
        "/inventory/reservations",
        json={
            "item_id": "item-steel",
            "quantity": 100,
            "reservation_type": "TRANSFER",
            "reserved_for": "Transfer request TR-100",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ACTIVE"


def test_inventory_mobile_scan():
    response = client.post(
        "/inventory/mobile/scan",
        json={"action": "SCAN_BIN", "location_id": "bin-a-01-01", "barcode_or_qr": "BIN:A-01-01"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["sync_status"] == "SYNCED"


def test_inventory_metadata_is_persisted_in_database():
    scan = client.post(
        "/inventory/mobile/scan",
        json={"action": "COUNT_STOCK", "item_id": "item-steel", "location_id": "bin-a-01-01", "quantity": 3},
    )
    assert scan.status_code == 200
    scan_id = scan.json()["data"]["id"]

    with SessionLocal() as db:
        row = db.query(AppMetadata).filter(AppMetadata.category == "inventory_mobile_scan", AppMetadata.record_key == scan_id).first()
        assert row is not None
        assert row.payload["action"] == "COUNT_STOCK"


def test_admin_can_update_ai_readiness_overrides():
    headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    response = client.put(
        "/manufacturing-data-hub/ai-readiness",
        headers=headers,
        json={
            "readiness": [
                {"area": "ERP AI Readiness", "score": 88, "ready": True},
                {"area": "Quality AI Readiness", "score": 76, "ready": True},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["overall_ai_readiness"] == 82


def test_admin_can_update_operational_footprint():
    headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    response = client.put(
        "/admin/operational-footprint",
        headers=headers,
        json={"plants": 9, "warehouses": 14, "integrations": 11, "open_approvals": 6},
    )
    assert response.status_code == 200
    data = client.get("/admin/operational-footprint", headers=headers).json()["data"]
    assert data["plants"] == 9
    assert data["warehouses"] == 14


def test_admin_can_upload_datahub_file_manifest():
    headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    response = client.post(
        "/manufacturing-data-hub/uploads",
        headers=headers,
        files={"file": ("erp-export.csv", b"material,qty\nRM-001,25\nRM-002,40\n", "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["source"] == "local_upload"
    assert data["metadata"]["preview"]["columns"] == ["material", "qty"]


def test_non_admin_cannot_upload_datahub_file():
    headers = runtime_headers("user@metam.local", "User12345!")
    response = client.post(
        "/manufacturing-data-hub/uploads",
        headers=headers,
        files={"file": ("erp-export.csv", b"material,qty\nRM-001,25\n", "text/csv")},
    )
    assert response.status_code == 403


def test_core_company_seed_available():
    response = client.get("/companies", headers=runtime_headers())
    assert response.status_code == 200
    companies = response.json()
    assert any(company["id"] == "company-c" for company in companies)


def test_feature_flag_toggle():
    headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    response = client.post("/feature-flags/warehouse/disable", headers=headers)
    assert response.status_code == 200
    assert response.json()["enabled"] is False

    response = client.post("/feature-flags/warehouse/enable", headers=headers)
    assert response.status_code == 200
    assert response.json()["enabled"] is True


def test_feature_flag_toggle_for_selected_company():
    headers = runtime_headers("super@metam.local", "SuperAdmin123!")
    response = client.post("/feature-flags/inventory/disable?company_id=company-apex", headers=headers)
    assert response.status_code == 200
    assert response.json()["company_id"] == "company-apex"
    assert response.json()["module_key"] == "inventory"
    assert response.json()["enabled"] is False

    flags = client.get("/feature-flags", headers=headers)
    assert flags.status_code == 200
    apex_inventory = [
        flag for flag in flags.json()
        if flag["company_id"] == "company-apex" and flag["module_key"] == "inventory"
    ][0]
    assert apex_inventory["enabled"] is False

    response = client.post("/feature-flags/inventory/enable?company_id=company-apex", headers=headers)
    assert response.status_code == 200
    assert response.json()["enabled"] is True


def test_registered_modules_have_company_allocations():
    module_keys = {item["key"].lower() for item in client.get("/modules").json()}
    company_c_flags = {
        item["module_key"]
        for item in client.get("/feature-flags", headers=runtime_headers()).json()
        if item["company_id"] == "company-c"
    }
    assert module_keys.issubset(company_c_flags)


def test_create_company_initializes_module_allocations():
    headers = runtime_headers("super@metam.local", "SuperAdmin123!")
    company = client.post("/companies", headers=headers, json={"tenant_id": "tenant-demo-001", "name": "Pytest Company", "code": "PYTCO"})
    assert company.status_code in {200, 409}

    module_keys = {item["key"].lower() for item in client.get("/modules").json()}
    company_flags = {
        item["module_key"]: item["enabled"]
        for item in client.get("/feature-flags", headers=headers).json()
        if item["company_id"] == "company-pytco"
    }
    assert module_keys.issubset(set(company_flags))
    assert all(company_flags[key] for key in module_keys)


def test_generic_module_record_create():
    response = client.post(
        "/purchase-orders",
        json={
            "record_code": "PO-1001",
            "name": "Demo purchase order",
            "quantity": 25,
            "payload": {"supplier_id": "supplier-apex"},
        },
    )
    assert response.status_code == 200
    assert response.json()["module_key"] == "purchase_orders"


def test_production_dashboard():
    response = client.get("/production/dashboard")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["active_orders"] >= 1
    assert "material_shortages" in data
    assert "line_utilization" in data


def test_production_material_requirements():
    response = client.post("/production/orders/po-demo-001/material-requirements")
    assert response.status_code == 200
    data = response.json()["data"]
    assert any(item["material_item"] == "item-steel" for item in data)
    assert all("shortage_quantity" in item for item in data)


def test_production_reserve_materials_tracks_shortage():
    response = client.post("/production/orders/po-demo-001/reserve-materials")
    assert response.status_code == 200
    data = response.json()["data"]
    assert "reservations" in data
    assert data["production_order"]["status"] in {"Material Reserved", "Material Shortage"}


def test_production_ai_draft_actions_are_safe():
    response = client.get("/production/ai/draft-actions")
    assert response.status_code == 200
    data = response.json()["data"]
    assert all(action["requires_human_approval"] for action in data["drafts"])
    assert "Change Schedule" in data["ai_safety"]["cannot"]


def test_maintenance_dashboard():
    response = client.get("/maintenance/dashboard")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["open_work_orders"] >= 1
    assert "mttr_minutes" in data
    assert "spare_shortages" in data


def test_maintenance_root_machine_alias():
    response = client.get("/machines")
    assert response.status_code == 200
    assert response.json()["module"] == "MAINTENANCE"
    assert any(machine["machine_id"] == "M-ASM-01" for machine in response.json()["data"])


def test_maintenance_spare_reservation_creates_shortage():
    response = client.post(
        "/maintenance/spare-reservations",
        json={"work_order_id": "wo-breakdown-001", "spare_part_id": "spare-spindle-bearing", "required_quantity": 1},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "WAITING_FOR_SPARE"
    assert data["shortage_quantity"] == 1


def test_maintenance_work_order_lifecycle_assign_start():
    assign = client.post(
        "/work-orders/wo-breakdown-001/assign",
        json={"assigned_user_id": "tech-sita", "skill_required": "CNC spindle maintenance"},
    )
    assert assign.status_code == 200
    assert assign.json()["data"]["work_order"]["status"] == "Assigned"

    start = client.post("/work-orders/wo-breakdown-001/start")
    assert start.status_code == 200
    assert start.json()["data"]["status"] == "In Progress"


def test_maintenance_ai_draft_action_is_safe():
    response = client.post(
        "/ai/maintenance/draft-action",
        json={"action_type": "Draft work order", "machine_id": "M-CUT-01", "reason": "Repeated spindle vibration"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_human_approval"] is True
    assert "Close Work Order" in data["ai_safety"]["cannot"]


def test_quality_dashboard():
    response = client.get("/quality/dashboard")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["quality_enabled"] is True
    assert "pending_inspections" in data
    assert "cost_of_poor_quality" in data


def test_quality_inspection_failure_creates_quarantine():
    start = client.post("/quality/inspection-lots/lot-incoming-001/start")
    assert start.status_code == 200
    assert start.json()["data"]["status"] == "In Inspection"

    submit = client.post(
        "/quality/inspection-lots/lot-incoming-001/submit",
        json={
            "inspected_by": "qa-user",
            "results": [
                {
                    "checklist_item_id": "chk-item-thickness",
                    "measured_value": "10.8",
                    "result_status": "Failed",
                    "defect_code": "VIS-SCRATCH",
                    "comments": "Out of tolerance",
                }
            ],
        },
    )
    assert submit.status_code == 200
    assert submit.json()["data"]["inspection_lot"]["status"] == "Quarantine"

    quarantine = client.get("/quality/quarantine")
    assert quarantine.status_code == 200
    assert len(quarantine.json()["data"]) >= 1


def test_quality_kpis_and_reports():
    kpis = client.get("/quality/kpis")
    assert kpis.status_code == 200
    assert "first_pass_yield" in kpis.json()["data"]

    reports = client.get("/quality/reports")
    assert reports.status_code == 200
    assert "inspection_report" in reports.json()["data"]


def test_quality_ai_draft_action_is_safe():
    response = client.post(
        "/ai/quality/draft-action",
        json={"action_type": "Draft CAPA", "source_type": "Defect", "source_id": "defect-visual-001", "reason": "Repeated supplier defect"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_human_approval"] is True
    assert "Scrap Inventory" in data["ai_safety"]["cannot"]


def test_sales_dashboard_and_customers():
    dashboard = client.get("/sales/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["data"]["sales_enabled"] is True

    customers = client.get("/customers")
    assert customers.status_code == 200
    assert customers.json()["module"] == "SALES"
    assert any(customer["customer_id"] == "cust-apollo" for customer in customers.json()["data"])


def test_sales_reserve_order_partial_allocation():
    response = client.post("/sales-orders/so-001/reserve")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["order"]["status"] in {"Partially Reserved", "Fully Reserved", "Production Required"}
    assert "production_recommendation" in data


def test_sales_protected_allocation_requires_override_approval():
    response = client.post(
        "/allocations",
        json={"sales_order_id": "so-001", "item_id": "fg-pump-900", "quantity": 50, "override_protected": True},
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "Override Approval Required"


def test_sales_dispatch_and_kpis():
    dispatch = client.post("/sales-orders/so-001/dispatch")
    assert dispatch.status_code == 200
    assert "pick_list" in dispatch.json()["data"]["dispatch_order"]

    kpis = client.get("/sales/kpis")
    assert kpis.status_code == 200
    assert "fill_rate" in kpis.json()["data"]


def test_sales_ai_draft_action_is_safe():
    response = client.post(
        "/ai/sales/draft-action",
        json={"action_type": "Draft production request", "source_type": "Sales Order", "source_id": "so-001", "reason": "Insufficient finished goods"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_human_approval"] is True
    assert "Dispatch Goods" in data["ai_safety"]["cannot"]


def test_customer_portal_login_and_profile_are_customer_scoped():
    login = client.post("/customer-portal/auth/login", json={"email": "meera@example.com", "password": "Portal123!"})
    assert login.status_code == 200
    assert login.json()["data"]["customer_id"] == "cust-apollo"

    profile = client.get("/customer-portal/profile")
    assert profile.status_code == 200
    data = profile.json()["data"]
    assert data["customer_id"] == "cust-apollo"
    assert "region_id" not in data


def test_customer_portal_orders_hide_internal_details():
    response = client.get("/customer-portal/orders")
    assert response.status_code == 200
    orders = response.json()["data"]
    assert all(order["id"] == "so-001" for order in orders)
    assert "portal_status" in orders[0]
    assert "priority" not in orders[0]


def test_customer_portal_support_and_return_requests():
    support = client.post(
        "/customer-portal/support-requests",
        json={"sales_order_id": "so-001", "request_type": "Delivery issue", "subject": "Need delivery update", "description": "Please update expected delivery."},
    )
    assert support.status_code == 200
    assert support.json()["data"]["customer_id"] == "cust-apollo"

    return_request = client.post(
        "/customer-portal/returns",
        json={"sales_order_id": "so-001", "reason": "Damaged item", "quantity": 1},
    )
    assert return_request.status_code == 200
    assert return_request.json()["data"]["status"] == "Submitted"


def test_customer_portal_document_download_is_scoped():
    response = client.get("/customer-portal/documents/doc-invoice-001/download")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["document_id"] == "doc-invoice-001"
    assert "secure_download_token" in data
    assert "file_url" not in data


def test_customer_portal_ai_draft_action_is_safe_and_sanitized():
    response = client.post(
        "/ai/customer-portal/draft-action",
        json={"action_type": "Draft customer delay email", "customer_id": "cust-apollo", "source_type": "Sales Order", "source_id": "so-001", "reason": "internal shortage in plant"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_human_approval"] is True
    assert "Release Internal Information" in data["ai_safety"]["cannot"]
    assert "internal shortage" not in data["reason"]


def test_supplier_portal_login_and_profile_are_supplier_scoped():
    login = client.post("/supplier-portal/auth/login", json={"email": "apex@example.com", "password": "Supplier123!"})
    assert login.status_code == 200
    assert login.json()["data"]["supplier_id"] == "supplier-apex"

    profile = client.get("/supplier-portal/profile")
    assert profile.status_code == 200
    data = profile.json()["data"]
    assert data["supplier_id"] == "supplier-apex"
    assert "quality_risk_score" not in data


def test_supplier_portal_purchase_orders_hide_other_suppliers():
    response = client.get("/supplier-portal/purchase-orders")
    assert response.status_code == 200
    orders = response.json()["data"]
    assert any(order["id"] == "po-apex-001" for order in orders)
    assert all(order["id"] != "po-other-001" for order in orders)
    assert "supplier_status" in orders[0]


def test_supplier_portal_acknowledgement_and_delivery_confirmation():
    acknowledgement = client.post(
        "/supplier-portal/purchase-orders/po-apex-001/acknowledge",
        json={
            "acknowledgement_status": "Accepted",
            "confirmed_quantity": 1000,
            "rejected_quantity": 0,
            "confirmed_delivery_date": "2026-06-20",
            "supplier_comments": "Confirmed",
        },
    )
    assert acknowledgement.status_code == 200
    assert acknowledgement.json()["data"]["supplier_id"] == "supplier-apex"

    delivery = client.post(
        "/supplier-portal/delivery-confirmations",
        json={
            "purchase_order_id": "po-apex-001",
            "shipment_reference": "SHIP-APX-001",
            "dispatch_date": "2026-06-16",
            "expected_delivery_date": "2026-06-20",
            "carrier_name": "Blue Dart",
            "vehicle_number": "TS09AB1234",
            "tracking_number": "TRK-001",
            "shipped_quantity": 1000,
            "package_count": 8,
            "supplier_comments": "Loaded",
        },
    )
    assert delivery.status_code == 200
    assert delivery.json()["data"]["status"] == "Submitted"


def test_supplier_portal_documents_and_certificates():
    upload = client.post(
        "/supplier-portal/documents/upload",
        json={"linked_type": "Purchase Order", "linked_id": "po-apex-001", "document_type": "Invoice", "file_url": "https://example.com/invoice.pdf"},
    )
    assert upload.status_code == 200
    assert upload.json()["data"]["status"] == "Pending Review"

    documents = client.get("/supplier-portal/documents")
    assert documents.status_code == 200
    assert any(document["document_type"] == "Invoice" for document in documents.json()["data"])

    certificates = client.get("/supplier-portal/certificates")
    assert certificates.status_code == 200
    assert any(certificate["id"] == "cert-apex-iso" for certificate in certificates.json()["data"])


def test_supplier_portal_enablement_performance_and_tasks():
    enablement = client.get("/supplier-portal/enablement")
    assert enablement.status_code == 200
    data = enablement.json()["data"]
    assert data["feature_flags"]["supplier_portal_enabled"] is True
    assert "po:acknowledge" in data["permissions"]

    performance = client.get("/supplier-portal/performance")
    assert performance.status_code == 200
    assert performance.json()["data"]["visible"] is True
    assert performance.json()["data"]["metrics"]["supplier_id"] == "supplier-apex"

    tasks = client.get("/supplier-portal/tasks")
    assert tasks.status_code == 200
    assert any(task["task_type"] == "Acknowledge PO" for task in tasks.json()["data"])


def test_supplier_portal_ai_draft_action_is_safe_and_sanitized():
    response = client.post(
        "/ai/supplier-portal/draft-action",
        json={
            "action_type": "Draft supplier follow-up",
            "supplier_id": "supplier-apex",
            "source_type": "Purchase Order",
            "source_id": "po-apex-001",
            "reason": "production shortage and inventory risk",
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_human_approval"] is True
    assert "Change PO" in data["ai_safety"]["cannot"]
    assert "production shortage" not in data["reason"]


def test_reporting_catalog_run_and_export():
    catalog = client.get("/reports/catalog?category=Inventory")
    assert catalog.status_code == 200
    reports = catalog.json()["data"]
    assert any(report["report_code"] == "INVENTORY_STATUS_REPORT" for report in reports)

    run = client.post("/reports/run", json={"report_code": "INVENTORY_STATUS_REPORT", "filters": {"risk_level": "HIGH"}, "user_role": "Executive"})
    assert run.status_code == 200
    data = run.json()["data"]
    assert data["run"]["status"] == "Completed"
    assert data["access_policy"] == "tenant/company/role scoped"

    export = client.post("/reports/export", json={"report_code": "INVENTORY_STATUS_REPORT", "export_format": "CSV", "user_role": "Executive"})
    assert export.status_code == 200
    assert export.json()["data"]["export_format"] == "CSV"


def test_reporting_saved_schedule_dashboard_and_kpi():
    saved = client.post(
        "/reports/saved",
        json={"report_name": "My weekly inventory risk", "report_type": "Standard", "owner_user_id": "admin-user", "company_id": "company-c", "columns_json": ["name", "risk_level"], "visibility": "Private"},
    )
    assert saved.status_code == 200
    saved_id = saved.json()["data"]["id"]
    assert client.get(f"/reports/saved/{saved_id}").status_code == 200

    schedule = client.post(
        "/reports/schedules",
        json={"report_id": "report-inventory_status_report", "frequency": "Weekly", "recipients": ["ops@example.com"], "format": "Excel", "active_status": True},
    )
    assert schedule.status_code == 200
    assert schedule.json()["data"]["frequency"] == "Weekly"

    dashboard = client.get("/dashboards/EXECUTIVE")
    assert dashboard.status_code == 200
    assert len(dashboard.json()["data"]["widgets"]) >= 1

    kpi = client.post("/kpis/kpi-fpy/calculate")
    assert kpi.status_code == 200
    assert kpi.json()["data"]["status"] in {"Good", "Warning", "Critical"}


def test_reporting_analytics_and_ai_are_draft_only():
    cross = client.get("/analytics/cross-module")
    assert cross.status_code == 200
    assert cross.json()["data"][0]["risk_level"] == "HIGH"

    summary = client.get("/ai/reporting/executive-summary")
    assert summary.status_code == 200
    assert "recommended_actions" in summary.json()["data"]

    draft = client.post(
        "/ai/reporting/draft-action",
        json={"action_type": "Draft investigation", "source_type": "KPI", "source_id": "kpi-fpy", "reason": "financial record risk and release inventory concern", "owner": "quality-manager"},
    )
    assert draft.status_code == 200
    data = draft.json()["data"]
    assert data["requires_human_approval"] is True
    assert "Modify Financial Records" in data["ai_safety"]["cannot"]
    assert "financial record" not in data["reason"]


def test_costing_dashboard_and_inventory_landed_calculations():
    dashboard = client.get("/costing/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["data"]["total_inventory_value"] > 0
    assert "cost_variance_alerts" in dashboard.json()["data"]

    inventory = client.post("/inventory-costing/calculate", json={"item_id": "item-copper", "quantity": 100, "unit_cost": 45, "costing_method": "FIFO"})
    assert inventory.status_code == 200
    assert inventory.json()["data"]["total_cost"] == 4500

    landed = client.post(
        "/landed-cost/calculate",
        json={"purchase_order_id": "po-landed-001", "quantity": 100, "purchase_cost": 10000, "freight": 500, "duty": 250, "tax": 1000, "handling": 100, "inspection": 150, "other_charges": 0},
    )
    assert landed.status_code == 200
    assert landed.json()["data"]["total_landed_cost"] == 12000


def test_costing_production_variance_and_standard_cost_approval():
    production = client.post(
        "/production-costing/calculate",
        json={
            "production_order_id": "po-cost-001",
            "product_id": "fg-pump-900",
            "produced_quantity": 50,
            "planned_material_cost": 50000,
            "actual_material_cost": 56000,
            "planned_labor_cost": 8000,
            "actual_labor_cost": 9000,
            "planned_machine_cost": 12000,
            "actual_machine_cost": 15000,
            "overhead_cost": 5000,
            "wastage_cost": 2500,
        },
    )
    assert production.status_code == 200
    assert production.json()["data"]["actual_cost"] == 87500

    standard = client.post(
        "/standard-costs",
        json={"product_id": "fg-valve-100", "standard_material_cost": 100, "standard_labor_cost": 20, "standard_machine_cost": 30, "standard_overhead_cost": 10, "effective_from": "2026-06-09"},
    )
    assert standard.status_code == 200
    standard_id = standard.json()["data"]["id"]

    approve = client.post(f"/standard-costs/{standard_id}/approve")
    assert approve.status_code == 200
    assert approve.json()["data"]["approval_status"] == "Approved"


def test_costing_profitability_reports_and_ai_are_draft_only():
    products = client.get("/profitability/products")
    assert products.status_code == 200
    assert products.json()["data"][0]["product_id"] == "fg-pump-900"

    report = client.get("/costing/reports/profitability")
    assert report.status_code == 200
    assert report.json()["data"]["report_code"] == "PROFITABILITY"

    risk = client.get("/ai/costing/risk-center")
    assert risk.status_code == 200
    assert "Write Off Inventory" in risk.json()["data"]["ai_safety"]["cannot"]

    draft = client.post(
        "/ai/costing/draft-action",
        json={"action_type": "Draft cost review task", "source_type": "Variance", "source_id": "var-pump-001", "reason": "change product price and modify financial records", "owner": "finance-controller"},
    )
    assert draft.status_code == 200
    data = draft.json()["data"]
    assert data["requires_human_approval"] is True
    assert "change product price" not in data["reason"]


def test_mobile_login_device_my_work_and_scan():
    login = client.post("/mobile/auth/login", json={"user_id": "mobile-user-warehouse", "password": "Mobile123!", "device_id": "device-demo-001"})
    assert login.status_code == 200
    assert login.json()["data"]["role"] == "Warehouse Operator"

    device = client.post(
        "/mobile/devices/register",
        json={"device_id": "device-test-001", "user_id": "mobile-user-warehouse", "company_id": "company-c", "device_name": "Test Scanner", "device_type": "Scanner", "os": "Android", "app_version": "1.0.0"},
    )
    assert device.status_code == 200
    assert device.json()["data"]["status"] == "Active"

    my_work = client.get("/mobile/my-work")
    assert my_work.status_code == 200
    assert "my_tasks" in my_work.json()["data"]

    scan = client.post("/mobile/scan/resolve", json={"scanned_value": "ITEM:item-steel", "scan_context": "inventory_count", "device_id": "device-demo-001", "user_id": "mobile-user-warehouse"})
    assert scan.status_code == 200
    assert scan.json()["data"]["entity_type"] == "Item"


def test_mobile_inventory_count_transfer_and_sync_conflicts():
    transfer = client.post(
        "/mobile/inventory/transfers",
        json={"source_bin_id": "bin-a-01-01", "destination_bin_id": "bin-b-01-01", "item_id": "item-steel", "quantity": 5, "stock_status": "Available", "idempotency_key": "transfer-key-001"},
    )
    assert transfer.status_code == 200
    assert transfer.json()["data"]["status"] == "Draft"

    count = client.post(
        "/mobile/inventory/counts/count-cycle-001/submit-item",
        json={"location_id": "bin-a-01-01", "item_id": "item-steel", "counted_quantity": 90, "system_quantity": 100, "variance_reason": "Missing", "idempotency_key": "count-key-001"},
    )
    assert count.status_code == 200
    assert count.json()["data"]["variance_status"] == "Requires Approval"

    sync = client.post(
        "/mobile/sync/push",
        json={
            "device_id": "device-demo-001",
            "user_id": "mobile-user-warehouse",
            "actions": [
                {"local_action_id": "local-001", "action_type": "inventory.count_entry", "payload": {"item_id": "item-steel"}, "created_offline_at": "2026-06-09T10:00:00", "idempotency_key": "offline-key-001"},
                {"local_action_id": "local-002", "action_type": "approval.approve", "payload": {}, "created_offline_at": "2026-06-09T10:05:00", "idempotency_key": "offline-key-002"},
            ],
        },
    )
    assert sync.status_code == 200
    statuses = {row["status"] for row in sync.json()["data"]["results"]}
    assert "accepted" in statuses
    assert "rejected" in statuses


def test_mobile_workflows_uploads_and_ai_are_safe():
    maintenance = client.post(
        "/mobile/maintenance/work-orders/wo-breakdown-001/complete",
        json={"root_cause": "Bearing wear", "spare_usage": [{"spare_id": "spare-spindle-bearing", "quantity": 1}], "downtime_minutes": 30, "completion_notes": "Completed", "idempotency_key": "wo-key-001"},
    )
    assert maintenance.status_code == 200
    assert maintenance.json()["data"]["status"] == "Completed"

    upload = client.post("/mobile/uploads", json={"related_type": "Task", "related_id": "mob-task-count-001", "file_type": "Photo", "uploaded_by": "mobile-user-warehouse", "device_id": "device-demo-001"})
    assert upload.status_code == 200
    assert upload.json()["data"]["sync_status"] == "Synced"

    risk = client.get("/ai/mobile/risk-center")
    assert risk.status_code == 200
    assert "Write Off Inventory" in risk.json()["data"]["ai_safety"]["cannot"]

    draft = client.post(
        "/ai/mobile/draft-action",
        json={"action_type": "Draft supervisor escalation", "source_type": "Count", "source_id": "count-cycle-001", "reason": "approve release inventory and dispatch goods", "owner": "plant-supervisor"},
    )
    assert draft.status_code == 200
    data = draft.json()["data"]
    assert data["requires_human_approval"] is True
    assert "release inventory" not in data["reason"]


def test_integrations_provider_config_credentials_and_webhook():
    providers = client.get("/integrations/providers")
    assert providers.status_code == 200
    assert any(provider["provider_code"] == "DEMO_ERP" for provider in providers.json()["data"])

    configs = client.get("/integrations/configs")
    assert configs.status_code == 200
    assert configs.json()["data"][0]["auth_config_encrypted"]["masked"] is True

    credential = client.post("/integrations/credentials", json={"integration_config_id": "config-demo-erp", "credential_type": "API key", "secret_value": "super-secret-1234"})
    assert credential.status_code == 200
    assert credential.json()["data"]["masked_value"] == "****-1234"
    assert "super-secret" not in str(credential.json())

    webhook = client.post("/integrations/webhooks/webhook-inventory-moved/test")
    assert webhook.status_code == 200
    assert webhook.json()["data"]["status"] == "Queued"


def test_integrations_inbound_idempotency_import_export_and_sync():
    inbound_payload = {"company_id": "company-c", "source_module": "External", "event_type": "Supplier delivery update", "entity_type": "Delivery", "entity_id": "EXT-DEL-1", "payload_json": {"status": "In Transit"}, "idempotency_key": "inbound-key-001"}
    first = client.post("/integrations/inbound/DEMO_ERP", json=inbound_payload)
    assert first.status_code == 200
    duplicate = client.post("/integrations/inbound/DEMO_ERP", json=inbound_payload)
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["status"] == "Ignored"

    import_job = client.post("/integrations/import/file", json={"company_id": "company-c", "import_type": "Inventory opening balance", "file_format": "CSV", "records": [{"external_record_id": "EXT-ITEM-1", "quantity": 10}]})
    assert import_job.status_code == 200
    import_id = import_job.json()["data"]["id"]
    assert client.get(f"/integrations/import/{import_id}/preview").status_code == 200
    assert client.post(f"/integrations/import/{import_id}/approve").json()["data"]["status"] == "Approved"
    assert client.post(f"/integrations/import/{import_id}/commit").json()["data"]["committed_records"] == 1

    export = client.post("/integrations/export", json={"company_id": "company-c", "export_type": "Inventory data", "file_format": "CSV"})
    assert export.status_code == 200
    assert export.json()["data"]["status"] == "Generated"

    sync = client.post("/integrations/sync-jobs", json={"company_id": "company-c", "integration_config_id": "config-demo-erp", "sync_type": "Pull", "source_entity": "Item", "target_entity": "InventoryItem"})
    assert sync.status_code == 200
    retry = client.post(f"/integrations/sync-jobs/{sync.json()['data']['id']}/retry")
    assert retry.status_code == 200
    assert retry.json()["data"]["status"] == "Retrying"


def test_integrations_monitoring_ai_and_draft_safety():
    monitoring = client.get("/integrations/monitoring")
    assert monitoring.status_code == 200
    assert "data_mapping_issues" in monitoring.json()["data"]

    mapping = client.post("/ai/integrations/suggest-mapping", json={"external_field": "material_code", "target_entity": "Item"})
    assert mapping.status_code == 200
    assert mapping.json()["data"]["suggested_internal_field"] == "item_code"
    assert mapping.json()["data"]["requires_human_review"] is True

    risk = client.get("/ai/integrations/risk-center")
    assert risk.status_code == 200
    assert "Change Credentials" in risk.json()["data"]["ai_safety"]["cannot"]

    draft = client.post(
        "/ai/integrations/draft-action",
        json={"action_type": "Draft mapping fix", "source_type": "Error", "source_id": "int-error-001", "reason": "change credentials and send external data", "owner": "integration-owner"},
    )
    assert draft.status_code == 200
    data = draft.json()["data"]
    assert data["requires_human_approval"] is True
    assert "change credentials" not in data["reason"]


def test_manufacturing_intelligence_command_center_and_impact_graph():
    command = client.get("/manufacturing-intelligence/command-center")
    assert command.status_code == 200
    data = command.json()["data"]
    assert len(data["top_operational_risks"]) >= 1
    assert "customer_impact" in data
    assert "cost_impact" in data

    graph = client.get("/manufacturing-intelligence/impact-graph/Production%20Order/po-demo-001")
    assert graph.status_code == 200
    assert graph.json()["data"]["start"]["entity_id"] == "po-demo-001"
    assert len(graph.json()["data"]["edges"]) >= 1


def test_manufacturing_intelligence_root_cause_what_if_and_health():
    root = client.post("/manufacturing-intelligence/root-cause", json={"problem_type": "Production delay", "entity_type": "Production Order", "entity_id": "po-demo-001", "user_role": "Plant Manager"})
    assert root.status_code == 200
    assert "Material shortage" in root.json()["data"]["likely_causes"]
    assert root.json()["data"]["confidence"] > 0.5

    what_if = client.post("/manufacturing-intelligence/what-if", json={"scenario_type": "supplier delayed by 5 days", "parameters": {"delay_days": 5}, "created_by": "planner"})
    assert what_if.status_code == 200
    assert "production_impact" in what_if.json()["data"]["result"]

    health = client.get("/manufacturing-intelligence/health-score")
    assert health.status_code == 200
    assert health.json()["data"]["scores"][0]["score"] <= 100


def test_manufacturing_intelligence_impacts_summary_and_draft_safety():
    customer = client.get("/manufacturing-intelligence/customer-impact")
    assert customer.status_code == 200
    assert customer.json()["data"][0]["sales_order_id"] == "so-001"

    cost = client.get("/manufacturing-intelligence/cost-impact")
    assert cost.status_code == 200
    assert cost.json()["data"]["total_estimated_impact"] > 0

    summary = client.get("/manufacturing-intelligence/executive-summary")
    assert summary.status_code == 200
    assert "recommended_decisions" in summary.json()["data"]

    draft = client.post(
        "/manufacturing-intelligence/draft-action",
        json={"action_type": "Draft production reschedule", "source_type": "Risk", "source_id": "intel-risk-001", "reason": "approve purchase orders and transfer inventory and send external email", "owner": "operations-manager"},
    )
    assert draft.status_code == 200
    data = draft.json()["data"]
    assert data["requires_human_approval"] is True
    assert "approve purchase orders" not in data["reason"]
    assert "Transfer Inventory" in data["ai_safety"]["cannot"]


def test_frontend_navigation_admin_dashboard_and_access_control():
    navigation = client.get("/frontend/navigation")
    assert navigation.status_code == 200
    sections = {section["section"] for section in navigation.json()["data"]}
    assert "Platform Management" in sections
    assert "Intelligence" in sections

    dashboard = client.get("/admin/dashboard", headers=runtime_headers("admin@metam.local", "ChangeMe123!"))
    assert dashboard.status_code == 200
    data = dashboard.json()["data"]
    assert data["user_count"] >= data["active_users"]
    assert "ai_readiness" in data

    access = client.get("/admin/access-control")
    assert access.status_code == 200
    assert "Dashboard Visible" in access.json()["data"]["permission_logic"]

    visible = client.post(
        "/admin/access-control/evaluate-dashboard",
        json={"tenant_dashboard_enabled": True, "role_permission": True, "user_permission": True, "data_scope_permission": False},
    )
    assert visible.status_code == 200
    assert visible.json()["data"]["dashboard_visible"] is False


def test_admin_workflow_kpis_and_compliance_contracts():
    workflow = client.post("/admin/workflows/simulate", json={"workflow_name": "Purchase Request Approval", "amount": 150000, "requester_role": "Procurement Manager"})
    assert workflow.status_code == 200
    assert "Finance Approval" in workflow.json()["data"]["steps"]
    assert workflow.json()["data"]["requires_human_approval"] is True

    kpis = client.get("/admin/kpis")
    assert kpis.status_code == 200
    assert any(kpi["kpi_code"] == "OEE" for kpi in kpis.json()["data"])

    compliance = client.get("/admin/compliance")
    assert compliance.status_code == 200
    assert "ISO" in compliance.json()["data"]["standards"]


def test_manufacturing_data_hub_mapping_quality_and_pending_update():
    headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    systems = client.get("/manufacturing-data-hub/connected-systems", headers=headers)
    assert systems.status_code == 200
    assert all(system["company_id"] == "company-c" for system in systems.json()["data"])

    preview = client.post(
        "/manufacturing-data-hub/mappings/preview",
        headers=headers,
        json={"source_system": "SAP S/4HANA", "source_field": "SAP Material Code", "source_value": " rm-stl-001 ", "target_entity": "InventoryItem"},
    )
    assert preview.status_code == 200
    assert preview.json()["data"]["target_field"] == "SKU"
    assert preview.json()["data"]["transformed_value"] == "RM-STL-001"

    quality = client.get("/manufacturing-data-hub/data-quality", headers=headers)
    assert quality.status_code == 200
    assert quality.json()["data"]["overall_score"] > 80

    decision = client.post("/manufacturing-data-hub/pending-updates/erp-upd-company-c-001/decision", headers=headers, json={"decided_by": "company-admin", "decision": "Approved", "comment": "Approved for ERP export"})
    assert decision.status_code == 200
    assert decision.json()["data"]["approval_status"] == "Approved"
    assert decision.json()["data"]["erp_status"] == "Export Ready"


def test_planning_ai_command_digital_twin_and_operations_center():
    planning = client.get("/planning/overview")
    assert planning.status_code == 200
    assert "Demand Planning" in planning.json()["data"]["planning_areas"]

    command = client.get("/ai-command-center/overview")
    assert command.status_code == 200
    assert command.json()["data"]["autonomous_planning_engine"]["mode"] == "Recommendation Only"

    twin = client.get("/digital-twin/overview")
    assert twin.status_code == 200
    assert "Enterprise Twin" in twin.json()["data"]["twins"]
    assert twin.json()["data"]["knowledge_graph"]["used_by_ai"] is True

    operations = client.get("/digital-operations-center/overview")
    assert operations.status_code == 200
    assert "AI Decision Center" in operations.json()["data"]["executive_layer"]


def test_runtime_login_users_records_analytics_and_audit():
    login = client.post("/runtime/auth/login", json={"email": "super@metam.local", "password": "SuperAdmin123!"})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    users = client.get("/runtime/users", headers=headers)
    assert users.status_code == 200
    assert any(user["role"] == "super_admin" for user in users.json()["data"])
    assert any(user["role"] == "account_owner" for user in users.json()["data"])

    created = client.post(
        "/runtime/records",
        headers=headers,
        json={
            "module_key": "inventory",
            "record_type": "raw_material",
            "record_code": "RM-PYTEST-001",
            "name": "Pytest Steel",
            "status": "AVAILABLE",
            "quantity": 12,
            "payload": {"reorder_level": 20, "uom": "kg"},
        },
    )
    assert created.status_code == 200
    record_id = created.json()["data"]["id"]

    updated = client.put(f"/runtime/records/{record_id}", headers=headers, json={"quantity": 40, "status": "AVAILABLE"})
    assert updated.status_code == 200
    assert updated.json()["data"]["quantity"] == 40

    analytics = client.get("/runtime/analytics/summary", headers=headers)
    assert analytics.status_code == 200
    assert "inventory_total_quantity" in analytics.json()["data"]

    audit = client.get("/runtime/audit-logs", headers=headers)
    assert audit.status_code == 200
    assert any(log["entity_type"] == "module_record" for log in audit.json()["data"])


def test_all_seeded_runtime_roles_can_login():
    credentials = [
        ("super@metam.local", "SuperAdmin123!", "super_admin"),
        ("owner@metam.local", "Owner12345!", "account_owner"),
        ("orgadmin@metam.local", "OrgAdmin123!", "organization_admin"),
        ("admin@metam.local", "ChangeMe123!", "admin"),
        ("manager@metam.local", "Manager123!", "team_manager"),
        ("supervisor@metam.local", "Supervisor123!", "supervisor"),
        ("operator@metam.local", "Operator123!", "operator"),
        ("auditor@metam.local", "Auditor123!", "auditor"),
        ("qa@metam.local", "QaTester123!", "qa_tester"),
        ("custom@metam.local", "Custom123!", "custom"),
        ("user@metam.local", "User12345!", "user"),
    ]
    for email, password, role in credentials:
        response = client.post("/runtime/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200
        assert response.json()["data"]["user"]["role"] == role


def test_passwordless_demo_is_disabled_unless_explicitly_enabled(monkeypatch):
    monkeypatch.delenv("ENABLE_PUBLIC_DEMO", raising=False)
    config = client.get("/runtime/auth/demo-config")
    assert config.status_code == 200
    assert config.json()["data"]["enabled"] is False
    assert config.json()["data"]["roles"] == []
    assert client.post("/runtime/auth/demo-login", json={"role": "super_admin"}).status_code == 404


def test_passwordless_demo_supports_all_roles_and_enforces_read_only(monkeypatch):
    monkeypatch.setenv("ENABLE_PUBLIC_DEMO", "true")
    config = client.get("/runtime/auth/demo-config")
    assert config.status_code == 200
    roles = config.json()["data"]["roles"]
    assert len(roles) == 11
    assert all("username" in item and "password" not in item for item in roles)

    for role in [item["role"] for item in roles]:
        response = client.post("/runtime/auth/demo-login", json={"role": role})
        assert response.status_code == 200
        assert response.json()["data"]["user"]["demo_read_only"] is True
        assert response.json()["data"]["user"]["demo_role"] == role

    login = client.post("/runtime/auth/demo-login", json={"role": "super_admin"})
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}
    session = client.get("/runtime/auth/me", headers=headers)
    assert session.status_code == 200
    assert session.json()["data"]["demo_read_only"] is True
    assert client.get("/runtime/records", headers=headers).status_code == 200
    blocked = client.post(
        "/runtime/records",
        headers=headers,
        json={
            "module_key": "inventory",
            "record_type": "raw_material",
            "record_code": "DEMO-WRITE-BLOCKED",
            "name": "Must not be created",
            "status": "AVAILABLE",
            "quantity": 1,
            "payload": {},
        },
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Read-only demo sessions cannot modify data."


def test_disabled_runtime_user_cannot_login():
    response = client.post("/runtime/auth/login", json={"email": "disabled.operator@metam.local", "password": "Disabled123!"})
    assert response.status_code == 403


def test_core_platform_endpoints_require_auth_and_admin():
    assert client.get("/companies").status_code == 401
    assert client.get("/feature-flags").status_code == 401

    operator_login = client.post("/runtime/auth/login", json={"email": "operator@metam.local", "password": "Operator123!"})
    assert operator_login.status_code == 200
    operator_headers = {"Authorization": f"Bearer {operator_login.json()['data']['access_token']}"}

    companies = client.get("/companies", headers=operator_headers)
    assert companies.status_code == 200

    create_company = client.post(
        "/companies",
        headers=operator_headers,
        json={"tenant_id": "tenant-demo-001", "name": "Blocked Company", "code": "BLK"},
    )
    assert create_company.status_code == 403

    update_flag = client.post(
        "/feature-flags",
        headers=operator_headers,
        json={"tenant_id": "tenant-demo-001", "company_id": "company-c", "module_key": "inventory", "enabled": False},
    )
    assert update_flag.status_code == 403

    admin_login = client.post("/runtime/auth/login", json={"email": "admin@metam.local", "password": "ChangeMe123!"})
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}

    admin_update = client.post(
        "/feature-flags",
        headers=admin_headers,
        json={"tenant_id": "tenant-demo-001", "company_id": "company-c", "module_key": "inventory", "enabled": False},
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["enabled"] is False

    restore = client.post(
        "/feature-flags",
        headers=admin_headers,
        json={"tenant_id": "tenant-demo-001", "company_id": "company-c", "module_key": "inventory", "enabled": True},
    )
    assert restore.status_code == 200
    assert restore.json()["enabled"] is True

    company_scope = client.get("/companies", headers=admin_headers)
    assert company_scope.status_code == 200
    assert [row["id"] for row in company_scope.json()] == ["company-c"]


def test_runtime_user_role_is_read_only():
    login = client.post("/runtime/auth/login", json={"email": "user@metam.local", "password": "User12345!"})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]

    read = client.get("/runtime/analytics/summary", headers={"Authorization": f"Bearer {token}"})
    assert read.status_code == 200

    write = client.post(
        "/runtime/records",
        headers={"Authorization": f"Bearer {token}"},
        json={"module_key": "inventory", "record_type": "raw_material", "record_code": "DENIED", "name": "Denied", "quantity": 1, "payload": {}},
    )
    assert write.status_code == 403


def test_runtime_admin_is_company_scoped():
    login = client.post("/runtime/auth/login", json={"email": "admin@metam.local", "password": "ChangeMe123!"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

    users = client.get("/runtime/users", headers=headers)
    assert users.status_code == 200
    assert all(user["company_id"] == "company-c" for user in users.json()["data"])

    records = client.get("/runtime/records", headers=headers)
    assert records.status_code == 200
    assert all(record["company_id"] == "company-c" for record in records.json()["data"])


def test_datahub_requires_admin_and_is_company_scoped():
    operator_login = client.post("/runtime/auth/login", json={"email": "operator@metam.local", "password": "Operator123!"})
    assert operator_login.status_code == 200
    operator_headers = {"Authorization": f"Bearer {operator_login.json()['data']['access_token']}"}
    denied = client.get("/manufacturing-data-hub/connected-systems", headers=operator_headers)
    assert denied.status_code == 403

    admin_login = client.post("/runtime/auth/login", json={"email": "admin@metam.local", "password": "ChangeMe123!"})
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}

    systems = client.get("/manufacturing-data-hub/connected-systems", headers=admin_headers)
    assert systems.status_code == 200
    assert all(item["company_id"] == "company-c" for item in systems.json()["data"])

    created = client.post(
        "/manufacturing-data-hub/connected-systems",
        headers=admin_headers,
        json={
            "system_name": "Company C WMS",
            "system_type": "WMS",
            "connection_status": "Healthy",
            "last_sync": "2026-06-15T10:00:00Z",
            "health_score": 96,
            "record_count": 5500,
        },
    )
    assert created.status_code == 200
    assert created.json()["data"]["company_id"] == "company-c"


def test_datahub_super_admin_targets_company_and_admin_cannot_spoof_scope():
    super_headers = runtime_headers("super@metam.local", "SuperAdmin123!")
    catalog = client.post(
        "/manufacturing-data-hub/catalog",
        headers=super_headers,
        json={
            "company_id": "company-apex",
            "data_type": "Inventory",
            "source_system": "Apex SAP",
            "owner": "Apex Data Steward",
            "ai_ready": True,
            "quality_score": 92,
            "lineage": {
                "source_category": "ERP / SAP / Oracle",
                "source_format": "xlsx",
                "auth_method": "OAuth2",
                "routing_target": "Inventory module",
            },
        },
    )
    assert catalog.status_code == 200
    assert catalog.json()["data"]["company_id"] == "company-apex"
    assert catalog.json()["data"]["company_name"] == "Apex Components Ltd"
    assert catalog.json()["data"]["lineage"]["routing_target"] == "Inventory module"

    admin_headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    spoofed = client.post(
        "/manufacturing-data-hub/catalog",
        headers=admin_headers,
        json={
            "company_id": "company-apex",
            "data_type": "Procurement",
            "source_system": "Company C SAP",
            "owner": "Company C Admin",
            "ai_ready": True,
            "quality_score": 88,
            "lineage": {"routing_target": "Procurement module"},
        },
    )
    assert spoofed.status_code == 200
    assert spoofed.json()["data"]["company_id"] == "company-c"
    assert spoofed.json()["data"]["company_name"] == "Company C"


def test_datahub_company_scoped_upload_and_cloud_source_manifests():
    super_headers = runtime_headers("super@metam.local", "SuperAdmin123!")
    upload = client.post(
        "/manufacturing-data-hub/uploads",
        headers=super_headers,
        data={"company_id": "company-apex"},
        files={"file": ("apex-inventory.csv", b"material,qty\nRM-APX-001,50\n", "text/csv")},
    )
    assert upload.status_code == 200
    assert upload.json()["data"]["company_id"] == "company-apex"

    cloud = client.post(
        "/manufacturing-data-hub/cloud-sources",
        headers=super_headers,
        json={
            "company_id": "company-apex",
            "provider": "Google Drive",
            "resource_name": "Apex Inventory Sheet",
            "resource_url": "https://drive.google.com/apex-inventory",
            "file_format": "gsheets",
            "sync_mode": "scheduled",
            "auth_method": "OAuth2",
            "connection_details": {"client_id": "apex-client", "folder_path": "/inventory"},
        },
    )
    assert cloud.status_code == 200
    assert cloud.json()["data"]["metadata"]["auth_method"] == "OAuth2"

    uploads = client.get("/manufacturing-data-hub/uploads", headers=super_headers)
    assert uploads.status_code == 200
    assert any(item["company_id"] == "company-apex" and item["company_name"] == "Apex Components Ltd" for item in uploads.json()["data"])


def test_versioned_runtime_api_alias():
    login = client.post("/api/v1/runtime/auth/login", json={"email": "super@metam.local", "password": "SuperAdmin123!"})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]

    response = client.get("/api/v1/runtime/analytics/summary", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["action"] == "analytics_summary"
