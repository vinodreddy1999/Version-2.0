from __future__ import annotations

import secrets
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from .schemas import ModuleDefinition, ModuleKey


MODULES = [
    ModuleDefinition(key=ModuleKey.AUTH, name="Auth", description="Login and tenant user context", permissions=["auth.login"]),
    ModuleDefinition(key=ModuleKey.PLATFORM, name="Platform", description="Tenants, companies, plants, users, roles, feature flags", permissions=["platform.read", "platform.admin"]),
    ModuleDefinition(key=ModuleKey.INVENTORY, name="Inventory", description="Items, dashboards, balances, movements, reservations, costing and reports", permissions=["inventory.read", "inventory.movements.create"]),
    ModuleDefinition(key=ModuleKey.WAREHOUSE, name="Warehouse", description="Warehouses, zones, racks, shelves, bins", permissions=["warehouse.read"], dependencies=[ModuleKey.INVENTORY]),
    ModuleDefinition(key=ModuleKey.SUPPLIER, name="Supplier", description="Suppliers, contacts, ratings, item sourcing", permissions=["supplier.read"]),
    ModuleDefinition(key=ModuleKey.PROCUREMENT, name="Procurement", description="Purchase requisitions and purchase orders", permissions=["procurement.read", "procurement.requisitions.create"], dependencies=[ModuleKey.INVENTORY, ModuleKey.SUPPLIER]),
    ModuleDefinition(key=ModuleKey.PRODUCTION, name="Production", description="BOM, routing, work centers, production orders", permissions=["production.read", "production.orders.create"], dependencies=[ModuleKey.INVENTORY, ModuleKey.WAREHOUSE]),
    ModuleDefinition(key=ModuleKey.MAINTENANCE, name="Maintenance", description="Machines, maintenance plans, work orders", permissions=["maintenance.read", "maintenance.work_orders.create"]),
    ModuleDefinition(key=ModuleKey.QUALITY, name="Quality", description="Inspections, CAPA, quarantine and rework", permissions=["quality.read", "quality.inspections.create"], dependencies=[ModuleKey.INVENTORY]),
    ModuleDefinition(key=ModuleKey.REPORTING, name="Reporting", description="Operational reports, KPIs and exports", permissions=["reporting.read"]),
    ModuleDefinition(key=ModuleKey.AI, name="AI", description="Recommendations and draft actions requiring approval", permissions=["ai.recommendations.read"]),
    ModuleDefinition(key=ModuleKey.SUPPLY_CHAIN, name="Supply Chain", description="Forecasting and truck-load optimization", permissions=["supply_chain.read"], dependencies=[ModuleKey.INVENTORY, ModuleKey.SUPPLIER]),
]


class DemoStore:
    def __init__(self) -> None:
        self.tenants = {
            "precision-components": {
                "id": "tenant-demo-001",
                "name": "Precision Components Demo",
                "slug": "precision-components",
                "enabled_modules": [module.key for module in MODULES],
            }
        }
        self.users = {
            # Nothing reads DemoStore.users for authentication today (the live
            # /auth/login and /runtime/auth/login paths query the SQLAlchemy
            # User model instead), but this password should never be a fixed,
            # source-visible literal in case something starts relying on it.
            "admin@metam.local": {
                "id": "user-admin-001",
                "tenant_slug": "precision-components",
                "name": "Metam Services Admin",
                "password": secrets.token_urlsafe(16),
                "permissions": ["platform.admin"],
            }
        }
        self.companies = [{"id": "company-c", "name": "Company C", "code": "CO-C"}]
        self.plants = [{"id": "plant-north", "company_id": "company-c", "name": "North Plant", "timezone": "Asia/Kolkata"}]
        self.warehouses = [{"id": "warehouse-north", "plant_id": "plant-north", "code": "WH-NORTH", "name": "North Plant Warehouse"}]
        self.inventory_items = [
            {"id": "item-steel", "sku": "RM-STL-001", "description": "Cold rolled steel coil", "uom": "KG", "category": "RAW_MATERIALS", "tracking_type": "BATCH", "reorder_level": 8000, "safety_stock": 5000},
            {"id": "item-wip-gear", "sku": "WIP-GEAR-220", "description": "Partially machined gear assembly", "uom": "EA", "category": "WIP", "tracking_type": "SERIAL", "reorder_level": 40, "safety_stock": 25},
            {"id": "item-finished-pump", "sku": "FG-PUMP-900", "description": "Finished hydraulic pump", "uom": "EA", "category": "FINISHED_GOODS", "tracking_type": "BATCH_AND_SERIAL", "reorder_level": 18, "safety_stock": 10},
            {"id": "item-cleaner", "sku": "CON-CLN-005", "description": "Industrial cleaner", "uom": "LTR", "category": "CONSUMABLES", "tracking_type": "NONE", "reorder_level": 120, "safety_stock": 75},
            {"id": "item-bearing", "sku": "SP-BRG-014", "description": "CNC spindle bearing", "uom": "EA", "category": "SPARE_PARTS", "tracking_type": "SERIAL", "reorder_level": 12, "safety_stock": 6},
        ]
        self.balances = [
            {"item_id": "item-steel", "location_id": "bin-a-01-01", "physical": 18400, "reserved": 3200, "allocated": 1400, "in_transit": 9000, "available": 15200, "status": "AVAILABLE", "unit_cost": 82.5},
            {"item_id": "item-wip-gear", "location_id": "bin-wip-03", "physical": 56, "reserved": 18, "allocated": 12, "in_transit": 0, "available": 38, "status": "RESERVED", "unit_cost": 1450},
            {"item_id": "item-finished-pump", "location_id": "bin-fg-01", "physical": 22, "reserved": 10, "allocated": 4, "in_transit": 6, "available": 12, "status": "ALLOCATED", "unit_cost": 9800},
            {"item_id": "item-cleaner", "location_id": "bin-chem-01", "physical": 90, "reserved": 0, "allocated": 0, "in_transit": 0, "available": 90, "status": "QUARANTINE", "unit_cost": 210},
            {"item_id": "item-bearing", "location_id": "bin-mro-02", "physical": 18, "reserved": 4, "allocated": 0, "in_transit": 0, "available": 14, "status": "DAMAGED", "unit_cost": 6400},
        ]
        self.locations = [
            {"id": "bin-a-01-01", "plant": "North Plant", "warehouse": "WH-NORTH", "zone": "RAW", "rack": "A", "shelf": "01", "bin": "01", "type": "BIN", "code": "A-01-01", "x": 12, "y": 18, "occupancy_percent": 76},
            {"id": "bin-wip-03", "plant": "North Plant", "warehouse": "WH-NORTH", "zone": "WIP", "rack": "C", "shelf": "02", "bin": "03", "type": "BIN", "code": "C-02-03", "x": 42, "y": 22, "occupancy_percent": 88},
            {"id": "bin-fg-01", "plant": "North Plant", "warehouse": "WH-NORTH", "zone": "FG", "rack": "F", "shelf": "01", "bin": "01", "type": "BIN", "code": "F-01-01", "x": 68, "y": 34, "occupancy_percent": 94},
            {"id": "bin-chem-01", "plant": "North Plant", "warehouse": "WH-NORTH", "zone": "CHEM", "rack": "H", "shelf": "01", "bin": "01", "type": "BIN", "code": "H-01-01", "x": 20, "y": 62, "occupancy_percent": 52},
            {"id": "bin-empty-01", "plant": "North Plant", "warehouse": "WH-NORTH", "zone": "RAW", "rack": "B", "shelf": "04", "bin": "01", "type": "BIN", "code": "B-04-01", "x": 26, "y": 18, "occupancy_percent": 0},
            {"id": "bin-mro-02", "plant": "North Plant", "warehouse": "WH-NORTH", "zone": "MRO", "rack": "M", "shelf": "02", "bin": "02", "type": "BIN", "code": "MRO-02", "x": 80, "y": 58, "occupancy_percent": 42},
        ]
        self.suppliers = [
            {"id": "supplier-apex", "name": "Apex Steel Components", "lead_time_days": 12, "quality_rating": 96.4, "delivery_reliability": 94.1},
            {"id": "supplier-mech", "name": "MechWorks Spares", "lead_time_days": 5, "quality_rating": 92.0, "delivery_reliability": 90.5},
        ]
        self.supplier_links = [
            {"item_id": "item-steel", "supplier_id": "supplier-apex", "supplier_name": "Apex Steel Components", "role": "PRIMARY", "lead_time_days": 12, "quality_rating": 96.4},
            {"item_id": "item-steel", "supplier_id": "supplier-mech", "supplier_name": "MechWorks Spares", "role": "BACKUP", "lead_time_days": 18, "quality_rating": 91.2},
            {"item_id": "item-bearing", "supplier_id": "supplier-mech", "supplier_name": "MechWorks Spares", "role": "PRIMARY", "lead_time_days": 5, "quality_rating": 92.0},
            {"item_id": "item-bearing", "supplier_id": "supplier-apex", "supplier_name": "Apex Steel Components", "role": "EMERGENCY", "lead_time_days": 3, "quality_rating": 89.5},
        ]
        self.batches = [
            {"item_id": "item-steel", "batch_number": "BATCH-STL-2401", "serial_number": None, "supplier_batch": "APX-STL-778", "manufacturing_date": "2026-01-10", "expiry_date": "2026-08-15", "status": "AVAILABLE"},
            {"item_id": "item-wip-gear", "batch_number": "WIP-GEAR-042", "serial_number": "SN-GEAR-00042", "supplier_batch": None, "manufacturing_date": "2026-05-28", "expiry_date": None, "status": "RESERVED"},
            {"item_id": "item-finished-pump", "batch_number": "FG-PUMP-0601", "serial_number": "SN-PUMP-900-001", "supplier_batch": None, "manufacturing_date": "2026-06-01", "expiry_date": "2027-06-01", "status": "ALLOCATED"},
            {"item_id": "item-cleaner", "batch_number": "CHEM-CLN-118", "serial_number": None, "supplier_batch": "CLN-EX-118", "manufacturing_date": "2025-10-01", "expiry_date": "2026-06-20", "status": "QUARANTINE"},
        ]
        self.reservations = [
            {"id": "res-prod-001", "item_id": "item-steel", "quantity": 2400, "reservation_type": "PRODUCTION", "reserved_for": "Production order PO-1007", "status": "ACTIVE"},
            {"id": "res-cust-001", "item_id": "item-finished-pump", "quantity": 8, "reservation_type": "CUSTOMER_ORDER", "reserved_for": "Customer order SO-8831", "status": "ACTIVE"},
            {"id": "res-maint-001", "item_id": "item-bearing", "quantity": 4, "reservation_type": "MAINTENANCE", "reserved_for": "Work order WO-209", "status": "ACTIVE"},
        ]
        self.seed_movements = [
            {"id": "mov-rec-001", "item_id": "item-steel", "movement_type": "RECEIVING", "quantity": 18400, "from_location_id": None, "to_location_id": "bin-a-01-01", "audit_status": "POSTED"},
            {"id": "mov-trn-001", "item_id": "item-bearing", "movement_type": "TRANSFER", "quantity": 6, "from_location_id": "bin-mro-02", "to_location_id": "bin-wip-03", "audit_status": "POSTED"},
            {"id": "mov-dmg-001", "item_id": "item-bearing", "movement_type": "DAMAGE", "quantity": 2, "from_location_id": "bin-mro-02", "to_location_id": None, "audit_status": "POSTED"},
            {"id": "mov-scrap-001", "item_id": "item-cleaner", "movement_type": "SCRAP", "quantity": 10, "from_location_id": "bin-chem-01", "to_location_id": None, "audit_status": "PENDING_APPROVAL"},
        ]
        self.stock_counts = [
            {"id": "cnt-cycle-001", "item_id": "item-steel", "location_id": "bin-a-01-01", "count_type": "CYCLE", "expected_quantity": 18400, "counted_quantity": 18390, "variance": -10, "approval_status": "AUTO_ACCEPTED"},
            {"id": "cnt-blind-001", "item_id": "item-bearing", "location_id": "bin-mro-02", "count_type": "BLIND", "expected_quantity": 18, "counted_quantity": 15, "variance": -3, "approval_status": "APPROVAL_REQUIRED"},
        ]
        self.non_moving_stock = [{"item_id": "item-cleaner", "days_without_movement": 142, "quantity": 90}]
        self.slow_moving_stock = [{"item_id": "item-bearing", "turnover_days": 86, "quantity": 18}]
        self.expiry_actions = [{"item_id": "item-cleaner", "action": "Move to quarantine review and discount/scrap decision", "estimated_loss": 18900}]
        self.fifo_layers = [
            {"item_id": "item-steel", "receipt_id": "mov-rec-001", "quantity_remaining": 18400, "unit_cost": 82.5},
            {"item_id": "item-bearing", "receipt_id": "mov-rec-002", "quantity_remaining": 18, "unit_cost": 6400},
        ]
        self.inventory_reports = [
            {"report": "Inventory status report", "endpoint": "/inventory/status"},
            {"report": "Inventory aging report", "endpoint": "/inventory/expiry-aging"},
            {"report": "Inventory valuation report", "endpoint": "/inventory/costs"},
            {"report": "Movement report", "endpoint": "/inventory/movement-ledger"},
            {"report": "Occupancy report", "endpoint": "/inventory/warehouse-map"},
            {"report": "Supplier performance report", "endpoint": "/inventory/supplier-links"},
        ]
        self.movements: list[dict] = []
        self.mobile_scans: list[dict] = []
        self.requisitions: list[dict] = []
        self.production_orders: list[dict] = []
        self.work_orders: list[dict] = []
        self.inspections: list[dict] = []

    @staticmethod
    def snapshot(value):
        return deepcopy(value)

    @staticmethod
    def create_record(collection: list[dict], payload: dict) -> dict:
        record = {"id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **payload}
        collection.append(record)
        return record


store = DemoStore()
