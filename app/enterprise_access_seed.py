from datetime import datetime, timedelta
from hashlib import sha1
from uuid import uuid4

from sqlalchemy.orm import Session

from .enterprise_access_models import (
    DataClassificationPolicy,
    Enterprise,
    EnterpriseMembership,
    ModuleEntitlement,
    OrganizationalNode,
    OrganizationalRelationship,
    RoleCapability,
    RoleTemplate,
    TemporaryAccessGrant,
    UserRoleAssignment,
)
from .platform_models import Company, Department, Plant, User
from .security import hash_password


ENTERPRISE_ID = "enterprise-example-global"
TENANT_ID = "tenant-demo-001"
ALL_MODULES = [
    "planning",
    "inventory",
    "warehouse",
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
    "supply_chain",
    "integrations",
    "mobile",
    "ai_copilot",
]

READ_CAPABILITIES = {
    "dashboard.view",
    "organization.view",
    "production.view",
    "quality.view",
    "maintenance.view",
    "reports.view",
    "audit.view",
}
OPERATIONAL_CAPABILITIES = READ_CAPABILITIES | {
    "production.create",
    "production.update",
    "quality.create",
    "quality.update",
    "maintenance.assign",
    "maintenance.complete",
    "reports.export",
}
ADMIN_CAPABILITIES = OPERATIONAL_CAPABILITIES | {
    "enterprise.view",
    "enterprise.manage",
    "organization.manage",
    "dashboard.configure",
    "production.approve",
    "quality.approve",
    "quality.close",
    "users.view",
    "users.invite",
    "users.assign_roles",
    "roles.manage",
    "settings.view",
    "settings.manage",
    "audit.view",
}


ROLE_DEFINITIONS: dict[str, dict] = {
    "platform_super_admin": {
        "level": "platform",
        "domains": ["administration", "security", "integrations"],
        "modules": [],
        "capabilities": {"enterprise.view", "enterprise.manage", "settings.view", "settings.manage", "audit.view", "support.impersonate"},
        "classifications": ["public", "internal"],
    },
    "platform_support_admin": {
        "level": "platform",
        "domains": ["administration", "integrations"],
        "modules": [],
        "capabilities": {"enterprise.view", "support.impersonate", "audit.view"},
        "classifications": ["public", "internal"],
    },
    "platform_security_admin": {
        "level": "platform",
        "domains": ["security"],
        "modules": [],
        "capabilities": {"enterprise.view", "settings.view", "settings.manage", "audit.view"},
        "classifications": ["public", "internal", "confidential", "security_sensitive"],
    },
    "platform_auditor": {
        "level": "platform",
        "domains": ["security"],
        "modules": [],
        "capabilities": {"enterprise.view", "audit.view", "reports.view", "reports.export"},
        "classifications": ["public", "internal", "confidential"],
        "read_only": True,
    },
    "enterprise_global_owner": {
        "level": "enterprise",
        "domains": ["executive", "operations", "production", "planning", "maintenance", "quality", "compliance", "safety", "inventory", "warehouse", "procurement", "supply_chain", "logistics", "sales", "finance", "costing", "people", "training", "documents", "analytics", "administration", "security", "integrations", "sustainability"],
        "modules": ALL_MODULES,
        "capabilities": ADMIN_CAPABILITIES,
        "classifications": ["public", "internal", "confidential", "restricted", "personal", "financial", "security_sensitive", "medical_or_safety_sensitive"],
    },
    "enterprise_global_admin": {
        "level": "enterprise",
        "domains": ["administration", "security", "integrations", "analytics"],
        "modules": ALL_MODULES,
        "capabilities": ADMIN_CAPABILITIES,
        "classifications": ["public", "internal", "confidential", "restricted", "personal", "security_sensitive"],
    },
    "global_executive": {
        "level": "enterprise",
        "domains": ["executive", "operations", "quality", "supply_chain", "maintenance", "finance", "costing", "analytics"],
        "modules": ALL_MODULES,
        "capabilities": READ_CAPABILITIES | {"enterprise.view", "reports.export"},
        "classifications": ["public", "internal", "confidential", "financial"],
        "read_only": True,
    },
    "global_operations_director": {
        "level": "enterprise",
        "domains": ["operations", "production", "planning", "inventory", "warehouse", "logistics", "analytics"],
        "modules": ["planning", "production", "inventory", "warehouse", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES | {"production.approve"},
        "classifications": ["public", "internal", "confidential"],
    },
    "global_quality_director": {
        "level": "enterprise",
        "domains": ["quality", "supplier_quality", "compliance", "documents", "analytics"],
        "modules": ["quality", "compliance", "documents", "supplier-portal", "reports"],
        "capabilities": READ_CAPABILITIES | {"quality.create", "quality.update", "quality.approve", "quality.close", "reports.export"},
        "classifications": ["public", "internal", "confidential", "restricted", "personal", "medical_or_safety_sensitive"],
    },
    "global_maintenance_director": {
        "level": "enterprise",
        "domains": ["maintenance", "operations", "analytics"],
        "modules": ["maintenance", "production", "reports"],
        "capabilities": READ_CAPABILITIES | {"maintenance.assign", "maintenance.complete", "reports.export"},
        "classifications": ["public", "internal", "confidential"],
    },
    "global_supply_chain_director": {
        "level": "enterprise",
        "domains": ["supply_chain", "inventory", "warehouse", "procurement", "logistics", "analytics"],
        "modules": ["inventory", "warehouse", "procurement", "supplier-portal", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES,
        "classifications": ["public", "internal", "confidential"],
    },
    "global_procurement_director": {
        "level": "enterprise",
        "domains": ["procurement", "supplier_quality", "supply_chain", "analytics"],
        "modules": ["procurement", "supplier-portal", "quality", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES,
        "classifications": ["public", "internal", "confidential", "financial"],
    },
    "global_finance_director": {
        "level": "enterprise",
        "domains": ["finance", "costing", "analytics"],
        "modules": ["costing", "reports"],
        "capabilities": {"dashboard.view", "reports.view", "reports.export"},
        "classifications": ["public", "internal", "confidential", "financial"],
        "read_only": True,
    },
    "global_compliance_director": {
        "level": "enterprise",
        "domains": ["compliance", "quality", "safety", "documents", "analytics"],
        "modules": ["compliance", "quality", "documents", "reports"],
        "capabilities": READ_CAPABILITIES | {"quality.approve", "reports.export"},
        "classifications": ["public", "internal", "confidential", "restricted", "medical_or_safety_sensitive"],
    },
    "global_it_data_director": {
        "level": "enterprise",
        "domains": ["integrations", "security", "analytics", "administration"],
        "modules": ["integrations", "reports"],
        "capabilities": {"enterprise.view", "organization.view", "dashboard.view", "dashboard.configure", "settings.view", "settings.manage", "audit.view", "reports.view"},
        "classifications": ["public", "internal", "confidential", "security_sensitive"],
    },
    "regional_director": {
        "level": "region",
        "domains": ["operations", "production", "planning", "maintenance", "quality", "supply_chain", "analytics"],
        "modules": ["planning", "production", "maintenance", "quality", "inventory", "warehouse", "procurement", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES | {"production.approve", "quality.approve"},
        "classifications": ["public", "internal", "confidential"],
    },
    "country_manager": {
        "level": "country",
        "domains": ["operations", "production", "quality", "supply_chain", "analytics"],
        "modules": ["planning", "production", "maintenance", "quality", "inventory", "warehouse", "procurement", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES,
        "classifications": ["public", "internal", "confidential"],
    },
    "business_unit_director": {
        "level": "business_unit",
        "domains": ["operations", "production", "planning", "quality", "supply_chain", "finance", "costing", "analytics"],
        "modules": ["planning", "production", "quality", "inventory", "warehouse", "costing", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES | {"production.approve"},
        "classifications": ["public", "internal", "confidential", "financial"],
    },
    "site_group_manager": {
        "level": "site_group",
        "domains": ["operations", "production", "maintenance", "quality", "inventory", "warehouse"],
        "modules": ["planning", "production", "maintenance", "quality", "inventory", "warehouse", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES,
        "classifications": ["public", "internal", "confidential"],
    },
    "multi_site_operations_manager": {
        "level": "site_group",
        "domains": ["operations", "production", "planning", "maintenance", "quality", "inventory", "warehouse", "analytics"],
        "modules": ["planning", "production", "maintenance", "quality", "inventory", "warehouse", "reports"],
        "capabilities": OPERATIONAL_CAPABILITIES,
        "classifications": ["public", "internal", "confidential"],
    },
}

for key, domain, modules in [
    ("plant_manager", "operations", ["planning", "production", "maintenance", "quality", "inventory", "warehouse", "procurement", "documents", "reports"]),
    ("production_manager", "production", ["planning", "production", "inventory", "quality", "reports"]),
    ("quality_manager", "quality", ["quality", "compliance", "documents", "reports"]),
    ("maintenance_manager", "maintenance", ["maintenance", "inventory", "reports"]),
    ("warehouse_manager", "warehouse", ["inventory", "warehouse", "reports"]),
    ("planning_manager", "planning", ["planning", "inventory", "production", "reports"]),
    ("procurement_manager", "procurement", ["procurement", "supplier-portal", "inventory", "reports"]),
    ("department_manager", "operations", ["planning", "production", "maintenance", "quality", "reports"]),
    ("area_manager", "operations", ["production", "maintenance", "quality", "reports"]),
    ("shift_supervisor", "operations", ["production", "maintenance", "quality", "documents"]),
    ("team_lead", "operations", ["production", "quality", "documents"]),
]:
    ROLE_DEFINITIONS[key] = {
        "level": key.split("_")[0] if key != "plant_manager" else "plant",
        "domains": [domain],
        "modules": modules,
        "capabilities": OPERATIONAL_CAPABILITIES if key.endswith("manager") else OPERATIONAL_CAPABILITIES - {"reports.export"},
        "classifications": ["public", "internal", "confidential"],
    }

for key, domain, modules in [
    ("operator", "production", ["production", "quality", "documents"]),
    ("technician", "maintenance", ["maintenance", "documents"]),
    ("inspector", "quality", ["quality", "documents"]),
    ("warehouse_operator", "warehouse", ["inventory", "warehouse", "documents"]),
    ("maintenance_technician", "maintenance", ["maintenance", "inventory", "documents"]),
    ("quality_inspector", "quality", ["quality", "documents"]),
]:
    ROLE_DEFINITIONS[key] = {
        "level": "frontline",
        "domains": [domain, "documents"],
        "modules": modules,
        "capabilities": {
            "dashboard.view",
            f"{domain}.view",
            f"{domain}.create",
            "maintenance.view",
            "quality.view",
            "production.view",
        },
        "classifications": ["public", "internal"],
    }

ROLE_DEFINITIONS.update(
    {
        "auditor": {
            "level": "external",
            "domains": ["quality", "compliance", "documents"],
            "modules": ["quality", "compliance", "documents", "reports"],
            "capabilities": {"dashboard.view", "quality.view", "audit.view", "reports.view", "reports.export"},
            "classifications": ["public", "internal", "confidential", "restricted", "personal"],
            "read_only": True,
        },
        "external_supplier": {
            "level": "external",
            "domains": ["procurement", "supplier_quality", "documents"],
            "modules": ["supplier-portal", "documents"],
            "capabilities": {"dashboard.view", "reports.view"},
            "classifications": ["public", "internal"],
            "external": "supplier",
        },
        "external_customer": {
            "level": "external",
            "domains": ["sales", "documents"],
            "modules": ["customer-portal", "documents"],
            "capabilities": {"dashboard.view", "reports.view"},
            "classifications": ["public", "internal"],
            "external": "customer",
        },
        "contractor": {
            "level": "external",
            "domains": ["maintenance", "safety", "documents"],
            "modules": ["maintenance", "documents"],
            "capabilities": {"dashboard.view", "maintenance.view", "maintenance.complete"},
            "classifications": ["public", "internal"],
            "external": "contractor",
        },
        "custom_scoped_role": {
            "level": "custom",
            "domains": [],
            "modules": [],
            "capabilities": {"dashboard.view"},
            "classifications": ["public", "internal"],
        },
        "basic_assigned_user": {
            "level": "frontline",
            "domains": [],
            "modules": [],
            "capabilities": {"dashboard.view"},
            "classifications": ["public", "internal"],
        },
        "scoped_administrator": {
            "level": "plant",
            "domains": ["administration", "operations", "integrations"],
            "modules": ALL_MODULES,
            "capabilities": ADMIN_CAPABILITIES - {"enterprise.manage"},
            "classifications": ["public", "internal", "confidential", "restricted", "personal"],
        },
    }
)

for role_key, definition in ROLE_DEFINITIONS.items():
    capabilities = set(definition["capabilities"])
    for module_key in definition["modules"]:
        capabilities.add(f"{module_key}.view")
        if not definition.get("read_only") and not definition.get("external"):
            capabilities.add(f"{module_key}.create")
            capabilities.add(f"{module_key}.update")
        if role_key.endswith(("owner", "admin", "director", "manager")):
            capabilities.add(f"{module_key}.approve")
            capabilities.add(f"{module_key}.export")
        if role_key.endswith(("owner", "admin")):
            capabilities.add(f"{module_key}.delete")
    definition["capabilities"] = capabilities


def _upsert_node(
    db: Session,
    node_id: str,
    node_type: str,
    code: str,
    name: str,
    *,
    source_entity_type: str | None = None,
    source_entity_id: str | None = None,
    currency: str | None = None,
    timezone: str | None = None,
    metadata: dict | None = None,
) -> OrganizationalNode:
    row = db.get(OrganizationalNode, node_id)
    if not row:
        row = OrganizationalNode(
            id=node_id,
            enterprise_id=ENTERPRISE_ID,
            node_type=node_type,
            code=code,
            name=name,
            source_entity_type=source_entity_type,
            source_entity_id=source_entity_id,
            currency=currency,
            timezone=timezone,
            metadata_json=metadata or {},
        )
        db.add(row)
        db.flush([row])
    return row


def _rel(db: Session, dimension: str, parent: str, child: str) -> None:
    existing = db.query(OrganizationalRelationship).filter(
        OrganizationalRelationship.enterprise_id == ENTERPRISE_ID,
        OrganizationalRelationship.dimension == dimension,
        OrganizationalRelationship.parent_node_id == parent,
        OrganizationalRelationship.child_node_id == child,
    ).first()
    if existing:
        existing.status = "active"
    else:
        db.add(
            OrganizationalRelationship(
                id=f"org-rel-{sha1(f'{dimension}:{parent}:{child}'.encode()).hexdigest()}",
                enterprise_id=ENTERPRISE_ID,
                dimension=dimension,
                parent_node_id=parent,
                child_node_id=child,
            )
        )


def _ensure_user(db: Session, user_id: str, email: str, name: str, legacy_role: str, company_id: str, plant_id: str | None) -> User:
    row = db.get(User, user_id)
    if not row:
        row = User(
            id=user_id,
            tenant_id=TENANT_ID,
            company_id=company_id,
            plant_id=plant_id,
            email=email,
            name=name,
            password_hash=hash_password("Enterprise123!"),
            role=legacy_role,
            is_active=True,
        )
        db.add(row)
        db.flush([row])
    return row


def seed_enterprise_access(db: Session) -> None:
    enterprise = db.get(Enterprise, ENTERPRISE_ID)
    if not enterprise:
        enterprise = Enterprise(
            id=ENTERPRISE_ID,
            tenant_id=TENANT_ID,
            name="Example Global Manufacturing",
            code="EXAMPLE-GLOBAL",
            default_currency="USD",
            default_timezone="UTC",
        )
        db.add(enterprise)
        # Persist the boundary first so PostgreSQL can enforce dependent
        # hierarchy, assignment, entitlement, and policy foreign keys.
        db.flush([enterprise])

    role_rows: dict[str, RoleTemplate] = {}
    for key, definition in ROLE_DEFINITIONS.items():
        role_id = f"role-template-{key}"
        row = db.get(RoleTemplate, role_id)
        if not row:
            row = RoleTemplate(
                id=role_id,
                enterprise_id=None if key.startswith("platform_") else ENTERPRISE_ID,
                key=key,
                name=key.replace("_", " ").title(),
                description=f"System role template for {key.replace('_', ' ')}.",
                role_level=definition["level"],
                default_domains=definition["domains"],
                default_modules=definition["modules"],
                allowed_classifications=definition["classifications"],
                read_only=definition.get("read_only", False),
                external_identity_type=definition.get("external"),
                system_managed=True,
            )
            db.add(row)
            # Capabilities reference the template and SQLAlchemy cannot infer
            # ordering from IDs alone when no ORM relationship is configured.
            db.flush([row])
        else:
            row.name = key.replace("_", " ").title()
            row.description = f"System role template for {key.replace('_', ' ')}."
            row.role_level = definition["level"]
            row.default_domains = definition["domains"]
            row.default_modules = definition["modules"]
            row.allowed_classifications = definition["classifications"]
            row.read_only = definition.get("read_only", False)
            row.external_identity_type = definition.get("external")
            row.system_managed = True
            row.status = "active"
        role_rows[key] = row
        desired_capabilities = set(definition["capabilities"])
        existing_capabilities = (
            db.query(RoleCapability)
            .filter(RoleCapability.role_template_id == role_id)
            .all()
        )
        for capability_row in existing_capabilities:
            if capability_row.capability not in desired_capabilities:
                db.delete(capability_row)
        existing_names = {row.capability for row in existing_capabilities}
        for capability in sorted(desired_capabilities - existing_names):
            capability_id = f"role-cap-{sha1(f'{role_id}:{capability}'.encode()).hexdigest()}"
            if not db.get(RoleCapability, capability_id):
                db.add(
                    RoleCapability(
                        id=capability_id,
                        role_template_id=role_id,
                        capability=capability,
                        effect="allow",
                    )
                )

    for module_key in ALL_MODULES:
        entitlement_id = f"entitlement-{module_key}"
        if not db.get(ModuleEntitlement, entitlement_id):
            db.add(
                ModuleEntitlement(
                    id=entitlement_id,
                    enterprise_id=ENTERPRISE_ID,
                    module_key=module_key,
                    enabled=True,
                )
            )

    nodes = {
        "global": ("region", "GLOBAL", "Global Headquarters"),
        "apac": ("region", "APAC", "APAC"),
        "emea": ("region", "EMEA", "EMEA"),
        "americas": ("region", "AMERICAS", "Americas"),
        "india": ("country", "IN", "India"),
        "germany": ("country", "DE", "Germany"),
        "mexico": ("country", "MX", "Mexico"),
        "united-states": ("country", "US", "United States"),
        "south-india": ("site_group", "SOUTH-IN", "South India"),
        "central-europe": ("site_group", "CENTRAL-EU", "Central Europe"),
        "north-america": ("site_group", "NORTH-AM", "North America"),
        "automotive": ("business_unit", "AUTO", "Automotive Components"),
        "industrial": ("business_unit", "IND", "Industrial Products"),
        "consumer": ("business_unit", "CONSUMER", "Consumer Manufacturing"),
        "global-operations": ("business_unit", "GLOBAL-OPS", "Global Operations"),
        "global-quality": ("business_unit", "GLOBAL-QA", "Global Quality"),
        "global-supply-chain": ("business_unit", "GLOBAL-SC", "Global Supply Chain"),
        "global-maintenance": ("business_unit", "GLOBAL-MAINT", "Global Maintenance"),
        "global-finance": ("business_unit", "GLOBAL-FIN", "Global Finance"),
        "global-it": ("business_unit", "GLOBAL-IT", "Global IT"),
        "global-compliance": ("business_unit", "GLOBAL-COMP", "Global Compliance"),
    }
    for node_id, (node_type, code, name) in nodes.items():
        _upsert_node(db, f"org-{node_id}", node_type, code, name)
    _rel(db, "geography", "org-global", "org-apac")
    _rel(db, "geography", "org-global", "org-emea")
    _rel(db, "geography", "org-global", "org-americas")
    _rel(db, "geography", "org-apac", "org-india")
    _rel(db, "geography", "org-emea", "org-germany")
    _rel(db, "geography", "org-americas", "org-mexico")
    _rel(db, "geography", "org-americas", "org-united-states")
    _rel(db, "geography", "org-india", "org-south-india")
    _rel(db, "geography", "org-germany", "org-central-europe")
    _rel(db, "geography", "org-united-states", "org-north-america")

    company_nodes: dict[str, str] = {}
    for company in db.query(Company).filter(Company.tenant_id == TENANT_ID).all():
        node_id = f"org-legal-{company.id}"
        company_nodes[company.id] = node_id
        _upsert_node(
            db,
            node_id,
            "legal_entity",
            company.code,
            company.name,
            source_entity_type="company",
            source_entity_id=company.id,
        )
        _rel(db, "legal", "org-global", node_id)

    plant_country_map = {
        "plant-abc-manufacturing-001": "org-south-india",
        "plant-north": "org-south-india",
        "plant-apex-hyd": "org-south-india",
        "plant-nova-srt": "org-south-india",
        "plant-fresh-pune": "org-south-india",
        "plant-med-vizag": "org-south-india",
        "plant-europack-industries-001": "org-central-europe",
        "plant-gulf-plastics-001": "org-mexico",
        "plant-brittech-components-001": "org-north-america",
    }
    plant_business_map = {
        "plant-abc-manufacturing-001": "org-automotive",
        "plant-apex-hyd": "org-automotive",
        "plant-brittech-components-001": "org-automotive",
        "plant-europack-industries-001": "org-industrial",
        "plant-gulf-plastics-001": "org-industrial",
        "plant-med-vizag": "org-industrial",
        "plant-north": "org-consumer",
        "plant-nova-srt": "org-consumer",
        "plant-fresh-pune": "org-consumer",
    }
    for plant in db.query(Plant).filter(Plant.tenant_id == TENANT_ID).all():
        plant_node_id = f"org-{plant.id}"
        _upsert_node(
            db,
            plant_node_id,
            "plant",
            plant.code,
            plant.name,
            source_entity_type="plant",
            source_entity_id=plant.id,
            timezone=plant.timezone,
        )
        country = plant_country_map.get(plant.id, "org-apac")
        business_unit = plant_business_map.get(plant.id, "org-industrial")
        legal_entity = company_nodes.get(plant.company_id)
        for relationship in (
            db.query(OrganizationalRelationship)
            .filter(
                OrganizationalRelationship.enterprise_id == ENTERPRISE_ID,
                OrganizationalRelationship.child_node_id == plant_node_id,
                OrganizationalRelationship.dimension.in_(["geography", "business", "legal"]),
            )
            .all()
        ):
            expected_parent = {
                "geography": country,
                "business": business_unit,
                "legal": legal_entity,
            }.get(relationship.dimension)
            if expected_parent and relationship.parent_node_id != expected_parent:
                relationship.status = "inactive"
        _rel(db, "geography", country, plant_node_id)
        _rel(db, "business", business_unit, plant_node_id)
        if plant.company_id in company_nodes:
            _rel(db, "legal", company_nodes[plant.company_id], plant_node_id)

    for department in db.query(Department).filter(Department.tenant_id == TENANT_ID).all():
        department_node_id = f"org-{department.id}"
        _upsert_node(
            db,
            department_node_id,
            "department",
            department.code,
            department.name,
            source_entity_type="department",
            source_entity_id=department.id,
        )
        _rel(db, "operational", f"org-{department.plant_id}", department_node_id)

    chennai_plant = "org-plant-abc-manufacturing-001"
    _upsert_node(db, "org-area-chennai-assembly", "area", "CHN-ASSY", "Assembly Area")
    _upsert_node(db, "org-line-chennai-4", "line", "CHN-L04", "Assembly Line 4")
    _upsert_node(db, "org-shift-chennai-b", "shift", "CHN-SHIFT-B", "Shift B")
    _upsert_node(db, "org-team-chennai-b4", "team", "CHN-TEAM-B4", "Line 4 Shift B Team")
    _rel(db, "operational", chennai_plant, "org-area-chennai-assembly")
    _rel(db, "operational", "org-area-chennai-assembly", "org-line-chennai-4")
    _rel(db, "operational", "org-line-chennai-4", "org-shift-chennai-b")
    _rel(db, "operational", "org-shift-chennai-b", "org-team-chennai-b4")

    user_definitions = [
        ("enterprise-owner", "enterprise.owner@example-global.local", "Elena Enterprise Owner", "account_owner", "enterprise_global_owner", "enterprise", ENTERPRISE_ID, True, None),
        ("global-executive", "global.executive@example-global.local", "Gabriel Global Executive", "custom", "global_executive", "enterprise", ENTERPRISE_ID, True, None),
        ("global-quality", "global.quality@example-global.local", "Quinn Global Quality", "custom", "global_quality_director", "enterprise", ENTERPRISE_ID, True, None),
        ("regional-apac", "regional.apac@example-global.local", "Aarav APAC Director", "custom", "regional_director", "region", "org-apac", True, None),
        ("bu-automotive", "business.automotive@example-global.local", "Bruno Automotive Director", "custom", "business_unit_director", "business_unit", "org-automotive", True, None),
        ("multi-site", "multisite.operations@example-global.local", "Maya Multi Site Manager", "custom", "multi_site_operations_manager", "site_group", "org-south-india", True, None),
        ("plant-manager-chennai", "plant.chennai.manager@example-global.local", "Priya Chennai Plant Manager", "team_manager", "plant_manager", "plant", chennai_plant, True, None),
        ("quality-manager-chennai", "quality.chennai.manager@example-global.local", "Kavya Chennai Quality Manager", "qa_tester", "quality_manager", "plant", chennai_plant, True, None),
        ("shift-supervisor-line4", "shift.line4.supervisor@example-global.local", "Sanjay Line 4 Supervisor", "supervisor", "shift_supervisor", "shift", "org-shift-chennai-b", True, None),
        ("operator-shift-b", "operator.shiftb@example-global.local", "Om Shift B Operator", "operator", "operator", "team", "org-team-chennai-b4", False, None),
        ("temporary-auditor", "auditor.apac@example-global.local", "Asha Temporary APAC Auditor", "auditor", "auditor", "region", "org-apac", True, "auditor"),
        ("external-supplier", "supplier.portal@example-global.local", "Atlas Supplier User", "user", "external_supplier", "enterprise", ENTERPRISE_ID, False, "supplier"),
        ("external-customer", "customer.portal@example-global.local", "Northwind Customer User", "user", "external_customer", "enterprise", ENTERPRISE_ID, False, "customer"),
    ]
    for user_suffix, email, name, legacy_role, role_key, scope_type, scope_id, descendants, identity_type in user_definitions:
        user = _ensure_user(
            db,
            f"user-{user_suffix}",
            email,
            name,
            legacy_role,
            "company-abc-manufacturing",
            "plant-abc-manufacturing-001",
        )
        membership_id = f"membership-{user_suffix}"
        membership = db.get(EnterpriseMembership, membership_id)
        if not membership:
            membership = EnterpriseMembership(
                id=membership_id,
                enterprise_id=ENTERPRISE_ID,
                user_id=user.id,
                identity_type=identity_type or "employee",
                external_organization_id=f"external-org-{role_key}" if identity_type else None,
                status="active",
            )
            db.add(membership)
        else:
            membership.identity_type = identity_type or "employee"
            membership.external_organization_id = f"external-org-{role_key}" if identity_type else None
            membership.status = "active"
        assignment_id = f"assignment-{user_suffix}"
        assignment = db.get(UserRoleAssignment, assignment_id)
        if not assignment:
            valid_until = datetime.utcnow() + timedelta(days=60) if role_key == "auditor" else None
            assignment = UserRoleAssignment(
                id=assignment_id,
                enterprise_id=ENTERPRISE_ID,
                user_id=user.id,
                role_template_id=role_rows[role_key].id,
                scope_type=scope_type,
                scope_id=scope_id,
                include_descendants=descendants,
                domains=ROLE_DEFINITIONS[role_key]["domains"],
                allowed_modules=ROLE_DEFINITIONS[role_key]["modules"],
                allowed_classifications=ROLE_DEFINITIONS[role_key]["classifications"],
                record_ownership="external_organization" if identity_type in {"supplier", "customer"} else "scope",
                valid_from=datetime.utcnow() - timedelta(days=1),
                valid_until=valid_until,
                delegated_by_id="user-super-001",
                reason="Global enterprise demonstration assignment.",
            )
            db.add(assignment)
            if role_key == "auditor":
                db.flush([assignment])
                db.add(
                    TemporaryAccessGrant(
                        id="temporary-grant-auditor-apac",
                        enterprise_id=ENTERPRISE_ID,
                        assignment_id=assignment.id,
                        approved_by_id="user-super-001",
                        reason="Time-bound APAC quality and compliance audit.",
                        valid_from=assignment.valid_from,
                        valid_until=assignment.valid_until,
                    )
                )
        else:
            assignment.role_template_id = role_rows[role_key].id
            assignment.scope_type = scope_type
            assignment.scope_id = scope_id
            assignment.include_descendants = descendants
            assignment.domains = ROLE_DEFINITIONS[role_key]["domains"]
            assignment.allowed_modules = ROLE_DEFINITIONS[role_key]["modules"]
            assignment.allowed_classifications = ROLE_DEFINITIONS[role_key]["classifications"]
            assignment.record_ownership = "external_organization" if identity_type in {"supplier", "customer"} else "scope"
            assignment.status = "active"

    policies = [
        ("policy-user-directory", "users.*", "personal", ["email", "name"], ["password_hash", "reset_token_hash"]),
        ("policy-finance", "costing.*", "financial", [], []),
        ("policy-security", "audit.*", "security_sensitive", ["client", "user_agent"], []),
        ("policy-safety", "safety.*", "medical_or_safety_sensitive", ["employee_name"], ["medical_notes"]),
    ]
    for policy_id, resource, classification, masked, hidden in policies:
        if not db.get(DataClassificationPolicy, policy_id):
            db.add(
                DataClassificationPolicy(
                    id=policy_id,
                    enterprise_id=ENTERPRISE_ID,
                    resource_pattern=resource,
                    classification=classification,
                    masked_fields=masked,
                    hidden_fields=hidden,
                )
            )
    db.flush()
