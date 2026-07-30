from uuid import uuid4

from sqlalchemy.orm import Session

from .metadata_store import upsert_metadata
from .modules.frontend_admin_models import DataCatalogEntry, DataMappingRule, ManufacturingDataConnection, PendingErpUpdate
from .platform_models import Company, Department, FeatureFlag, ModuleRecord, Permission, Plant, Role, User
from .security import hash_password
from .store import MODULES, store


MODULE_KEYS = [
    "auth",
    "platform",
    "planning",
    "inventory",
    "warehouse",
    "supplier",
    "procurement",
    "production",
    "maintenance",
    "quality",
    "sales",
    "compliance",
    "customer-portal",
    "supplier-portal",
    "documents",
    "reporting",
    "reports",
    "costing",
    "forecasting",
    "supply_chain",
    "ai",
    "ai_copilot",
    "integrations",
]

COMPANY_SEEDS = [
    ("company-c", "Company C", "CO-C", "plant-north", "North Plant", "PLANT-NORTH", "dept-ops", "Operations", "OPS"),
    ("company-abc-manufacturing", "ABC Manufacturing", "ABC-MANUFACTURING", "plant-abc-manufacturing-001", "Plant A", "ABC-MFG-A", "dept-abc-ops", "ABC Manufacturing Operations", "ABC-OPS"),
    ("company-green-valley-foods", "Green Valley Foods", "GREEN-VALLEY-FOODS", "plant-green-valley-foods-001", "Plant A", "GVF-A", "dept-green-ops", "Green Valley Operations", "GVF-OPS"),
    ("company-europack-industries", "EuroPack Industries", "EUROPACK-INDUSTRIES", "plant-europack-industries-001", "Plant A", "EPI-A", "dept-europack-ops", "EuroPack Operations", "EPI-OPS"),
    ("company-gulf-plastics", "Gulf Plastics", "GULF-PLASTICS", "plant-gulf-plastics-001", "Plant A", "GP-A", "dept-gulf-ops", "Gulf Plastics Operations", "GP-OPS"),
    ("company-brittech-components", "BritTech Components", "BRITTECH-COMPONENTS", "plant-brittech-components-001", "Plant A", "BTC-A", "dept-brittech-ops", "BritTech Operations", "BTC-OPS"),
    ("company-apex", "Apex Components Ltd", "APEX", "plant-apex-hyd", "Apex Hyderabad Plant", "APEX-HYD", "dept-apex-ops", "Apex Operations", "APX-OPS"),
    ("company-nova", "Nova Textiles Pvt Ltd", "NOVA", "plant-nova-srt", "Nova Surat Mill", "NOVA-SRT", "dept-nova-prod", "Nova Production", "NOV-PROD"),
    ("company-fresh", "FreshFoods Processing Co", "FRESH", "plant-fresh-pune", "FreshFoods Pune Plant", "FRESH-PUNE", "dept-fresh-qa", "FreshFoods Quality", "FR-QA"),
    ("company-med", "MedSure Pharma", "MED", "plant-med-vizag", "MedSure Vizag Facility", "MED-VZG", "dept-med-compliance", "MedSure Compliance", "MED-COMP"),
]


def seed_platform(db: Session) -> None:
    upsert_metadata(
        db,
        category="tenant",
        record_key="precision-components",
        row_id="meta-tenant-precision-components",
        payload=store.snapshot(store.tenants["precision-components"]),
        name="Precision Components Demo",
    )
    for module in MODULES:
        module_payload = module.model_dump()
        upsert_metadata(
            db,
            category="module_definition",
            record_key=str(module.key),
            row_id=f"meta-module-{str(module.key).lower()}",
            payload=module_payload,
            name=module.name,
        )

    for company_id, company_name, company_code, plant_id, plant_name, plant_code, dept_id, dept_name, dept_code in COMPANY_SEEDS:
        if not db.query(Company).filter(Company.id == company_id).first():
            db.add(Company(id=company_id, tenant_id="tenant-demo-001", name=company_name, code=company_code))
        if not db.query(Plant).filter(Plant.id == plant_id).first():
            db.add(Plant(id=plant_id, tenant_id="tenant-demo-001", company_id=company_id, name=plant_name, code=plant_code))
        if not db.query(Department).filter(Department.id == dept_id).first():
            db.add(Department(id=dept_id, tenant_id="tenant-demo-001", company_id=company_id, plant_id=plant_id, name=dept_name, code=dept_code))
        upsert_metadata(
            db,
            category="company",
            record_key=company_id,
            row_id=f"meta-company-{company_id}",
            company_id=company_id,
            payload={"id": company_id, "tenant_id": "tenant-demo-001", "name": company_name, "code": company_code, "is_active": True},
            name=company_name,
        )
        upsert_metadata(
            db,
            category="plant",
            record_key=plant_id,
            row_id=f"meta-plant-{plant_id}",
            company_id=company_id,
            plant_id=plant_id,
            payload={"id": plant_id, "tenant_id": "tenant-demo-001", "company_id": company_id, "name": plant_name, "code": plant_code, "timezone": "Asia/Kolkata"},
            name=plant_name,
        )

    for warehouse in store.warehouses:
        upsert_metadata(
            db,
            category="warehouse",
            record_key=warehouse["id"],
            row_id=f"meta-warehouse-{warehouse['id']}",
            company_id="company-c",
            plant_id=warehouse.get("plant_id"),
            payload=warehouse,
            name=warehouse.get("name"),
        )
    for item in store.inventory_items:
        upsert_metadata(
            db,
            category="inventory_item",
            record_key=item["id"],
            row_id=f"meta-item-{item['id']}",
            company_id="company-c",
            plant_id="plant-north",
            payload=item,
            name=item.get("description"),
        )
    for balance in store.balances:
        upsert_metadata(
            db,
            category="inventory_balance",
            record_key=f"{balance['item_id']}::{balance['location_id']}",
            row_id=f"meta-balance-{balance['item_id']}-{balance['location_id']}",
            company_id="company-c",
            plant_id="plant-north",
            payload=balance,
            name=balance["item_id"],
        )
    for location in store.locations:
        upsert_metadata(
            db,
            category="location",
            record_key=location["id"],
            row_id=f"meta-location-{location['id']}",
            company_id="company-c",
            plant_id="plant-north",
            payload=location,
            name=location.get("code"),
        )
    for supplier in store.suppliers:
        upsert_metadata(
            db,
            category="supplier",
            record_key=supplier["id"],
            row_id=f"meta-supplier-{supplier['id']}",
            company_id="company-c",
            payload=supplier,
            name=supplier.get("name"),
        )
    for link in store.supplier_links:
        upsert_metadata(
            db,
            category="supplier_link",
            record_key=f"{link['item_id']}::{link['supplier_id']}::{link['role']}",
            row_id=f"meta-supplier-link-{link['item_id']}-{link['supplier_id']}-{link['role'].lower()}",
            company_id="company-c",
            plant_id="plant-north",
            payload=link,
            name=link.get("supplier_name"),
        )
    for batch in store.batches:
        key = batch["serial_number"] or batch["batch_number"]
        upsert_metadata(
            db,
            category="batch",
            record_key=key,
            row_id=f"meta-batch-{key.lower().replace(' ', '-')}",
            company_id="company-c",
            plant_id="plant-north",
            payload=batch,
            name=batch.get("batch_number"),
        )
    for reservation in store.reservations:
        upsert_metadata(
            db,
            category="inventory_reservation",
            record_key=reservation["id"],
            row_id=f"meta-reservation-{reservation['id']}",
            company_id="company-c",
            plant_id="plant-north",
            payload=reservation,
            name=reservation.get("reserved_for"),
        )
    for movement in store.seed_movements:
        upsert_metadata(
            db,
            category="inventory_movement",
            record_key=movement["id"],
            row_id=f"meta-movement-{movement['id']}",
            company_id="company-c",
            plant_id="plant-north",
            payload=movement,
            name=movement.get("movement_type"),
        )
    for count in store.stock_counts:
        upsert_metadata(
            db,
            category="stock_count",
            record_key=count["id"],
            row_id=f"meta-stock-count-{count['id']}",
            company_id="company-c",
            plant_id="plant-north",
            payload=count,
            name=count.get("count_type"),
        )
    for index, row in enumerate(store.non_moving_stock, start=1):
        upsert_metadata(
            db,
            category="non_moving_stock",
            record_key=f"non-moving-{index}",
            row_id=f"meta-non-moving-{index}",
            company_id="company-c",
            plant_id="plant-north",
            payload=row,
            name=row.get("item_id"),
        )
    for index, row in enumerate(store.slow_moving_stock, start=1):
        upsert_metadata(
            db,
            category="slow_moving_stock",
            record_key=f"slow-moving-{index}",
            row_id=f"meta-slow-moving-{index}",
            company_id="company-c",
            plant_id="plant-north",
            payload=row,
            name=row.get("item_id"),
        )
    for index, row in enumerate(store.expiry_actions, start=1):
        upsert_metadata(
            db,
            category="expiry_action",
            record_key=f"expiry-action-{index}",
            row_id=f"meta-expiry-action-{index}",
            company_id="company-c",
            plant_id="plant-north",
            payload=row,
            name=row.get("item_id"),
        )
    for index, row in enumerate(store.fifo_layers, start=1):
        upsert_metadata(
            db,
            category="fifo_layer",
            record_key=row["receipt_id"],
            row_id=f"meta-fifo-layer-{index}",
            company_id="company-c",
            plant_id="plant-north",
            payload=row,
            name=row.get("item_id"),
        )
    for index, row in enumerate(store.inventory_reports, start=1):
        upsert_metadata(
            db,
            category="inventory_report",
            record_key=f"inventory-report-{index}",
            row_id=f"meta-inventory-report-{index}",
            company_id="company-c",
            plant_id="plant-north",
            payload=row,
            name=row.get("report"),
        )

    seed_users = [
        ("user-super-001", "super@metam.local", "Metam Services Super Admin", "super_admin", "SuperAdmin123!"),
        ("user-owner-001", "owner@metam.local", "Metam Services Account Owner", "account_owner", "Owner12345!"),
        ("user-orgadmin-001", "orgadmin@metam.local", "Metam Services Organization Admin", "organization_admin", "OrgAdmin123!"),
        ("user-admin-001", "admin@metam.local", "Metam Services Admin", "admin", "ChangeMe123!"),
        ("user-manager-001", "manager@metam.local", "Metam Services Team Manager", "team_manager", "Manager123!"),
        ("user-supervisor-001", "supervisor@metam.local", "Metam Services Supervisor", "supervisor", "Supervisor123!"),
        ("user-operator-001", "operator@metam.local", "Metam Services Operator", "operator", "Operator123!"),
        ("user-auditor-001", "auditor@metam.local", "Metam Services Auditor", "auditor", "Auditor123!"),
        ("user-qa-001", "qa@metam.local", "Metam Services QA Tester", "qa_tester", "QaTester123!"),
        ("user-custom-001", "custom@metam.local", "Metam Services Custom User", "custom", "Custom123!"),
        ("user-viewer-001", "user@metam.local", "Metam Services User", "user", "User12345!"),
        ("user-disabled-001", "disabled.operator@metam.local", "Metam Services Disabled Operator", "operator", "Disabled123!"),
    ]
    for user_id, email, name, role, password in seed_users:
        user = db.query(User).filter(User.id == user_id).first()
        is_active = email != "disabled.operator@metam.local"
        if not user:
            db.add(
                User(
                    id=user_id,
                    tenant_id="tenant-demo-001",
                    company_id="company-c",
                    plant_id="plant-north",
                    email=email,
                    name=name,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=is_active,
                )
            )
        else:
            user.name = name
            user.role = role
            user.is_active = is_active

    company_user_templates = [
        ("admin", "admin", "Company Admin", "ChangeMe123!"),
        ("manager", "team_manager", "Operations Manager", "Manager123!"),
        ("supervisor", "supervisor", "Plant Supervisor", "Supervisor123!"),
        ("operator", "operator", "Shopfloor Operator", "Operator123!"),
        ("auditor", "auditor", "Compliance Auditor", "Auditor123!"),
        ("viewer", "user", "Business Viewer", "User12345!"),
    ]
    for company_id, company_name, company_code, plant_id, *_ in COMPANY_SEEDS:
        normalized_code = company_code.lower().replace("-", "")
        for login_prefix, role, title, password in company_user_templates:
            user_id = f"user-{login_prefix}-{normalized_code}"
            email = f"{login_prefix}.{normalized_code}@metam.local"
            if not db.query(User).filter(User.id == user_id).first():
                db.add(
                    User(
                        id=user_id,
                        tenant_id="tenant-demo-001",
                        company_id=company_id,
                        plant_id=plant_id,
                        email=email,
                        name=f"{company_name} {title}",
                        password_hash=hash_password(password),
                        role=role,
                        is_active=True,
                    )
                )

    roles = [
        ("role-super-admin", "Super Admin", ["platform.super_admin", "platform.admin", "account.override", "organization.override", "team.override", "users.manage", "roles.manage", "data.write", "data.read", "audit.read"]),
        ("role-account-owner", "Account Owner", ["account.override", "organization.override", "team.override", "users.manage", "roles.manage", "data.write", "data.read", "audit.read"]),
        ("role-organization-admin", "Organization Admin", ["organization.override", "team.override", "users.manage", "data.write", "data.read", "audit.read"]),
        ("role-team-manager", "Team Manager", ["team.override", "data.write", "data.read"]),
        ("role-supervisor", "Supervisor", ["data.write", "data.read"]),
        ("role-operator", "Operator/User", ["data.read"]),
        ("role-auditor", "Auditor", ["data.read", "audit.read"]),
        ("role-qa-tester", "QA/Tester", ["quality.write", "data.read"]),
        ("role-custom", "Custom Role", ["data.read"]),
        ("role-admin", "Admin", ["platform.admin", "users.manage", "data.write", "data.read", "audit.read"]),
        ("role-user", "User", ["data.read"]),
    ]
    for company_id, *_ in COMPANY_SEEDS:
        for role_id, name, permissions in roles:
            company_role_id = f"{role_id}-{company_id}"
            role = db.query(Role).filter(Role.id == company_role_id).first()
            if not role:
                db.add(Role(id=company_role_id, tenant_id="tenant-demo-001", company_id=company_id, name=name, permissions=permissions))
            else:
                role.permissions = permissions

    permission_keys = [
        "platform.super_admin",
        "platform.admin",
        "account.override",
        "organization.override",
        "team.override",
        "users.manage",
        "roles.manage",
        "data.write",
        "data.read",
        "audit.read",
        "quality.write",
        "inventory.read",
        "feature_flags.manage",
    ]
    for key in permission_keys:
        if not db.query(Permission).filter(Permission.key == key).first():
            db.add(Permission(id=str(uuid4()), key=key, description=key))

    for company_id, *_ in COMPANY_SEEDS:
        for module_key in MODULE_KEYS:
            if not db.query(FeatureFlag).filter(FeatureFlag.tenant_id == "tenant-demo-001", FeatureFlag.company_id == company_id, FeatureFlag.module_key == module_key).first():
                db.add(FeatureFlag(id=str(uuid4()), tenant_id="tenant-demo-001", company_id=company_id, module_key=module_key, enabled=True))

    for company_id, company_name, company_code, plant_id, plant_name, *_ in COMPANY_SEEDS:
        if not db.query(ManufacturingDataConnection).filter(ManufacturingDataConnection.id == f"conn-{company_id}-erp").first():
            db.add(
                ManufacturingDataConnection(
                    id=f"conn-{company_id}-erp",
                    company_id=company_id,
                    system_name=f"{company_name} ERP",
                    system_type="ERP",
                    connection_status="Healthy",
                    last_sync="2026-06-15T09:00:00Z",
                    health_score=92,
                    record_count=24000,
                )
            )
        upsert_metadata(
            db,
            category="datahub_connection_details",
            record_key=f"conn-{company_id}-erp",
            row_id=f"details-conn-{company_id}-erp",
            company_id=company_id,
            payload={
                "connection_id": f"conn-{company_id}-erp",
                "source_category": "ERP",
                "auth_method": "Database credentials",
                "connection_details": {"plant_id": plant_id, "plant_name": plant_name},
            },
            name=f"{company_name} ERP",
        )
        if not db.query(ManufacturingDataConnection).filter(ManufacturingDataConnection.id == f"conn-{company_id}-mes").first():
            db.add(
                ManufacturingDataConnection(
                    id=f"conn-{company_id}-mes",
                    company_id=company_id,
                    system_name=f"{company_name} MES",
                    system_type="MES",
                    connection_status="Warning",
                    last_sync="2026-06-15T08:40:00Z",
                    health_score=78,
                    record_count=8200,
                )
            )
        upsert_metadata(
            db,
            category="datahub_connection_details",
            record_key=f"conn-{company_id}-mes",
            row_id=f"details-conn-{company_id}-mes",
            company_id=company_id,
            payload={
                "connection_id": f"conn-{company_id}-mes",
                "source_category": "MES",
                "auth_method": "Database credentials",
                "connection_details": {"plant_id": plant_id, "plant_name": plant_name},
            },
            name=f"{company_name} MES",
        )
        if not db.query(DataCatalogEntry).filter(DataCatalogEntry.id == f"catalog-{company_id}-inventory").first():
            db.add(
                DataCatalogEntry(
                    id=f"catalog-{company_id}-inventory",
                    company_id=company_id,
                    data_type="Inventory",
                    source_system=f"{company_name} ERP",
                    owner="Inventory Manager",
                    ai_ready=True,
                    quality_score=91,
                    lineage={"plant": plant_name, "plant_id": plant_id, "warehouse": f"{company_code}-MAIN"},
                )
            )
        if not db.query(DataCatalogEntry).filter(DataCatalogEntry.id == f"catalog-{company_id}-production").first():
            db.add(
                DataCatalogEntry(
                    id=f"catalog-{company_id}-production",
                    company_id=company_id,
                    data_type="Production",
                    source_system=f"{company_name} MES",
                    owner="Production Manager",
                    ai_ready=True,
                    quality_score=86,
                    lineage={"plant": plant_name, "plant_id": plant_id, "warehouse": f"{company_code}-FG"},
                )
            )
        if not db.query(DataCatalogEntry).filter(DataCatalogEntry.id == f"catalog-{company_id}-machines").first():
            db.add(
                DataCatalogEntry(
                    id=f"catalog-{company_id}-machines",
                    company_id=company_id,
                    data_type="Machine Data",
                    source_system=f"{company_name} PLC",
                    owner="Maintenance Manager",
                    ai_ready=False,
                    quality_score=74,
                    lineage={"plant": plant_name, "plant_id": plant_id, "warehouse": f"{company_code}-MRO"},
                )
            )
        if not db.query(DataMappingRule).filter(DataMappingRule.id == f"map-{company_id}-material").first():
            db.add(
                DataMappingRule(
                    id=f"map-{company_id}-material",
                    company_id=company_id,
                    source_system=f"{company_name} ERP",
                    source_field="Material Code",
                    target_entity="InventoryItem",
                    target_field="sku",
                    transform_rule="trim_uppercase",
                    confidence=0.98,
                )
            )
        if not db.query(DataMappingRule).filter(DataMappingRule.id == f"map-{company_id}-plant").first():
            db.add(
                DataMappingRule(
                    id=f"map-{company_id}-plant",
                    company_id=company_id,
                    source_system=f"{company_name} ERP",
                    source_field="Plant",
                    target_entity="Plant",
                    target_field="plant_code",
                    transform_rule="lookup_company_plant",
                    confidence=0.95,
                )
            )
        if not db.query(PendingErpUpdate).filter(PendingErpUpdate.id == f"erp-upd-{company_id}-001").first():
            db.add(
                PendingErpUpdate(
                    id=f"erp-upd-{company_id}-001",
                    company_id=company_id,
                    recommendation=f"Increase safety stock for {company_name} item-steel",
                    entity_type="InventoryItem",
                    entity_id=f"{company_id}-item-steel",
                    current_value={"safety_stock": 500},
                    recommended_value={"safety_stock": 750},
                    approval_status="Pending",
                    erp_status="Draft",
                )
            )

    records = [
        ("inv-steel-001", "inventory", "raw_material", "RM-STEEL-001", "Stainless Steel Coil", "AVAILABLE", 1240.0, {"uom": "kg", "reorder_level": 500, "warehouse": "WH-A", "bin": "A-01-01", "unit_cost": 82}),
        ("inv-bearing-001", "inventory", "spare_part", "SP-BEAR-001", "Precision Bearing", "LOW_STOCK", 42.0, {"uom": "ea", "reorder_level": 75, "warehouse": "WH-B", "bin": "B-04-07", "unit_cost": 650}),
        ("inv-gasket-001", "inventory", "consumable", "CN-GASK-001", "Seal Gasket", "QUARANTINE", 18.0, {"uom": "ea", "reorder_level": 30, "warehouse": "WH-QA", "bin": "Q-01-02", "unit_cost": 24}),
        ("prod-order-001", "production", "work_order", "WO-10042", "Pump Assembly Batch", "SCHEDULED", 120.0, {"line": "LINE-2", "due_date": "2026-06-18"}),
        ("maint-order-001", "maintenance", "work_order", "MWO-7781", "CNC spindle inspection", "OPEN", 1.0, {"asset": "CNC-14", "priority": "high"}),
    ]
    for record_id, module_key, record_type, code, name, status, quantity, payload in records:
        if not db.query(ModuleRecord).filter(ModuleRecord.id == record_id).first():
            db.add(
                ModuleRecord(
                    id=record_id,
                    tenant_id="tenant-demo-001",
                    company_id="company-c",
                    plant_id="plant-north",
                    module_key=module_key,
                    record_type=record_type,
                    record_code=code,
                    name=name,
                    status=status,
                    quantity=quantity,
                    payload=payload,
                )
            )

    phase1_record_templates = {
        "planning": [
            ("demand_plan", "Demand Plan", "APPROVED", 1280.0),
            ("capacity_plan", "Capacity Window", "DRAFT", 420.0),
            ("workforce_plan", "Shift Coverage", "OPEN", 76.0),
        ],
        "inventory": [
            ("raw_material", "Steel Coil", "AVAILABLE", 680.0),
            ("finished_good", "Pump Assembly", "RESERVED", 94.0),
            ("spare_part", "Bearing Kit", "LOW_STOCK", 12.0),
        ],
        "production": [
            ("work_order", "Pump Assembly Run", "IN_PROGRESS", 240.0),
            ("routing", "Valve Machining", "SCHEDULED", 180.0),
            ("bom", "Pump Assembly BOM", "RELEASED", 32.0),
        ],
        "maintenance": [
            ("work_order", "Compressor PM", "OPEN", 1.0),
            ("asset", "CNC Machine", "RUNNING", 1.0),
            ("inspection", "Line Motor Inspection", "SCHEDULED", 1.0),
        ],
        "quality": [
            ("inspection_lot", "Incoming Steel Inspection", "PASSED", 60.0),
            ("ncr", "Surface Finish Variance", "OPEN", 8.0),
            ("capa", "Supplier Packaging Issue", "IN_PROGRESS", 1.0),
        ],
        "procurement": [
            ("purchase_request", "Bearing Replenishment", "PENDING_APPROVAL", 300.0),
            ("purchase_order", "Steel Coils", "RELEASED", 22.0),
            ("rfq", "Pump Castings", "OPEN", 4.0),
        ],
        "sales": [
            ("sales_order", "Pump Order", "CONFIRMED", 90.0),
            ("delivery", "Regional Dispatch", "IN_TRANSIT", 18.0),
            ("customer", "Customer Account", "ACTIVE", 1.0),
        ],
        "costing": [
            ("product_cost", "Pump Model Costing", "PUBLISHED", 1240.0),
            ("machine_rate", "Machine Hourly Rate", "REVIEW", 18.0),
            ("plant_profit", "Plant Margin", "ACTIVE", 14.0),
        ],
        "compliance": [
            ("audit", "ISO Audit Checklist", "OPEN", 34.0),
            ("signature", "Batch Release Signature", "SIGNED", 1.0),
            ("record", "Safety Compliance Record", "ACTIVE", 12.0),
        ],
        "customer-portal": [
            ("order_status", "Customer Order Status", "VISIBLE", 8.0),
            ("invoice", "Invoice Download", "READY", 1.0),
            ("ticket", "Delivery Query", "OPEN", 1.0),
        ],
        "supplier-portal": [
            ("rfq_response", "Casting Quotation", "SUBMITTED", 1.0),
            ("po_ack", "Steel PO Acknowledgement", "ACCEPTED", 1.0),
            ("scorecard", "Supplier Scorecard", "PUBLISHED", 92.0),
        ],
        "reports": [
            ("inventory_report", "Inventory Status Report", "READY", 1.0),
            ("production_report", "Production Output Report", "READY", 1.0),
            ("finance_report", "Finance Summary Report", "READY", 1.0),
        ],
        "documents": [
            ("sop", "Goods Receipt SOP", "APPROVED", 3.0),
            ("work_instruction", "CNC Setup Instruction", "PUBLISHED", 5.0),
            ("certificate", "Supplier Certificate", "ACTIVE", 1.0),
        ],
    }
    for company_id, company_name, company_code, plant_id, *_ in COMPANY_SEEDS:
        for module_key, templates in phase1_record_templates.items():
            for index, (record_type, name, status, quantity) in enumerate(templates, start=1):
                record_id = f"phase1-{company_id}-{module_key}-{index}".replace("_", "-")
                if not db.query(ModuleRecord).filter(ModuleRecord.id == record_id).first():
                    db.add(
                        ModuleRecord(
                            id=record_id,
                            tenant_id="tenant-demo-001",
                            company_id=company_id,
                            plant_id=plant_id,
                            module_key=module_key,
                            record_type=record_type,
                            record_code=f"{company_code}-{module_key.upper().replace('-', '')}-{index:03d}",
                            name=f"{company_name} {name}",
                            status=status,
                            quantity=quantity,
                            payload={
                                "company": company_name,
                                "source": "full_backend_seed",
                                "scenario": "phase1_frontend_validation",
                            },
                        )
                    )
    # The global-enterprise layer is additive and links the legacy company, plant,
    # department, user, and module data after those rows have been prepared.
    from .enterprise_access_seed import seed_enterprise_access

    # SessionLocal disables autoflush, so make the platform rows queryable before
    # the hierarchy seed links companies, plants, departments, and users.
    db.flush()
    seed_enterprise_access(db)
    db.commit()
