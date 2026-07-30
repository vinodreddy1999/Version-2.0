from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field


router = APIRouter(prefix="/factorypulse", tags=["FactoryPulse Improvement Platform"])


class FactoryPulseApiResult(BaseModel):
    module: str = "factorypulse"
    action: str
    message: str
    data: dict[str, Any] | list[dict[str, Any]]


class ProductionEntryRequest(BaseModel):
    order_number: str
    good_quantity: int = Field(ge=0)
    rejected_quantity: int = Field(default=0, ge=0)
    reworked_quantity: int = Field(default=0, ge=0)
    machine_id: str
    shift: str
    employee: str


class DowntimeEventRequest(BaseModel):
    machine_id: str
    production_order: str
    downtime_category: str
    downtime_reason: str
    start_time: datetime
    end_time: datetime | None = None
    severity: str = "Medium"
    description: str = ""
    assigned_owner: str = ""


class ScrapEventRequest(BaseModel):
    production_order: str
    product: str
    machine_id: str
    quantity_affected: int = Field(gt=0)
    defect_category: str
    defect_reason: str
    disposition: str = "Hold for review"
    material_cost: float = Field(default=0, ge=0)
    conversion_cost: float = Field(default=0, ge=0)


class ActionRequest(BaseModel):
    action_title: str
    related_entity: str
    owner: str
    priority: str = "Medium"
    due_date: date
    estimated_benefit: float = Field(default=0, ge=0)


def result(action: str, message: str, data: dict[str, Any] | list[dict[str, Any]]) -> FactoryPulseApiResult:
    return FactoryPulseApiResult(action=action, message=message, data=data)


now = datetime.now(timezone.utc)

production_orders: list[dict[str, Any]] = [
    {
        "id": "fp-po-001",
        "order_number": "PO-CNC-24001",
        "customer": "Apex Automotive",
        "product": "CNC Bracket A",
        "planned_quantity": 1200,
        "actual_good_quantity": 940,
        "rejected_quantity": 38,
        "line": "CNC Line 1",
        "machine": "CNC-01",
        "shift": "A",
        "status": "In progress",
        "target_attainment_percent": 78.3,
        "estimated_completion": (now + timedelta(hours=3)).isoformat(),
    },
    {
        "id": "fp-po-002",
        "order_number": "PO-ASM-24007",
        "customer": "Metro Pumps",
        "product": "Pump Housing Kit",
        "planned_quantity": 600,
        "actual_good_quantity": 600,
        "rejected_quantity": 14,
        "line": "Assembly Line 2",
        "machine": "ASM-02",
        "shift": "B",
        "status": "Completed",
        "target_attainment_percent": 100,
        "estimated_completion": now.isoformat(),
    },
]

downtime_events: list[dict[str, Any]] = [
    {
        "id": "fp-dt-001",
        "machine_id": "CNC-01",
        "production_order": "PO-CNC-24001",
        "start_time": (now - timedelta(hours=2, minutes=10)).isoformat(),
        "end_time": (now - timedelta(hours=1, minutes=20)).isoformat(),
        "duration_minutes": 50,
        "downtime_category": "Breakdown",
        "downtime_reason": "Spindle vibration",
        "severity": "High",
        "status": "Action assigned",
        "financial_loss": 62500,
        "assigned_owner": "maintenance.lead@factorypulse.local",
        "recurring_loss_alert": True,
    },
    {
        "id": "fp-dt-002",
        "machine_id": "CNC-02",
        "production_order": "PO-CNC-24001",
        "start_time": (now - timedelta(hours=5)).isoformat(),
        "end_time": (now - timedelta(hours=4, minutes=35)).isoformat(),
        "duration_minutes": 25,
        "downtime_category": "Changeover",
        "downtime_reason": "Fixture setting delay",
        "severity": "Medium",
        "status": "Under review",
        "financial_loss": 31250,
        "assigned_owner": "production.supervisor@factorypulse.local",
        "recurring_loss_alert": False,
    },
]

scrap_events: list[dict[str, Any]] = [
    {
        "id": "fp-sc-001",
        "production_order": "PO-CNC-24001",
        "product": "CNC Bracket A",
        "machine_id": "CNC-01",
        "quantity_affected": 38,
        "defect_category": "Dimensional",
        "defect_reason": "Tool wear",
        "disposition": "Scrap",
        "cost_of_poor_quality": 45600,
        "status": "Corrective action open",
    },
    {
        "id": "fp-sc-002",
        "production_order": "PO-ASM-24007",
        "product": "Pump Housing Kit",
        "machine_id": "ASM-02",
        "quantity_affected": 14,
        "defect_category": "Assembly",
        "defect_reason": "Seal seating issue",
        "disposition": "Rework",
        "cost_of_poor_quality": 16800,
        "status": "Awaiting verification",
    },
]

actions: list[dict[str, Any]] = [
    {
        "id": "fp-act-001",
        "action_title": "Inspect CNC-01 spindle bearings and vibration baseline",
        "related_entity": "fp-dt-001",
        "owner": "maintenance.lead@factorypulse.local",
        "priority": "High",
        "due_date": (date.today() + timedelta(days=1)).isoformat(),
        "status": "In progress",
        "estimated_benefit": 210000,
        "verified_benefit": 0,
    },
    {
        "id": "fp-act-002",
        "action_title": "Replace tool-life check sheet with operator confirmation",
        "related_entity": "fp-sc-001",
        "owner": "quality.lead@factorypulse.local",
        "priority": "Medium",
        "due_date": (date.today() + timedelta(days=3)).isoformat(),
        "status": "Not started",
        "estimated_benefit": 145000,
        "verified_benefit": 0,
    },
]


@router.get("/dashboard", response_model=FactoryPulseApiResult)
def dashboard() -> FactoryPulseApiResult:
    planned = sum(row["planned_quantity"] for row in production_orders)
    good = sum(row["actual_good_quantity"] for row in production_orders)
    rejected = sum(row["rejected_quantity"] for row in production_orders)
    downtime_minutes = sum(row["duration_minutes"] for row in downtime_events)
    operating_minutes = 8 * 60 * 2 - downtime_minutes
    availability = operating_minutes / (8 * 60 * 2)
    performance = good / planned if planned else 0
    quality = good / (good + rejected) if good + rejected else 0
    oee = availability * performance * quality
    data = {
        "company": "Apex Precision Components Pvt. Ltd.",
        "programme_day": 24,
        "programme_phase": "Foundation",
        "programme_health": "At risk",
        "production_attainment_percent": round(performance * 100, 1),
        "availability_percent": round(availability * 100, 1),
        "quality_percent": round(quality * 100, 1),
        "oee_percent": round(oee * 100, 1),
        "downtime_minutes": downtime_minutes,
        "scrap_cost": sum(row["cost_of_poor_quality"] for row in scrap_events),
        "downtime_loss": sum(row["financial_loss"] for row in downtime_events),
        "open_actions": len([row for row in actions if row["status"] not in {"Completed", "Cancelled"}]),
        "verified_savings": sum(row["verified_benefit"] for row in actions),
        "estimated_savings": sum(row["estimated_benefit"] for row in actions),
        "top_losses": [
            {"loss": "CNC spindle downtime", "amount": 62500, "owner": "Maintenance"},
            {"loss": "Tool-wear scrap", "amount": 45600, "owner": "Quality"},
            {"loss": "Changeover delay", "amount": 31250, "owner": "Production"},
        ],
        "oee_definition": "OEE = Availability x Performance x Quality",
    }
    return result("dashboard", "FactoryPulse improvement dashboard with OEE, losses and 90-day programme status.", data)


@router.get("/production-orders", response_model=FactoryPulseApiResult)
def list_production_orders() -> FactoryPulseApiResult:
    return result("production_orders", "Simple production-order workflow records.", production_orders)


@router.post("/production-entries", response_model=FactoryPulseApiResult)
def create_production_entry(request: ProductionEntryRequest) -> FactoryPulseApiResult:
    entry = {
        "id": f"fp-pe-{len(production_orders) + 1:03d}",
        "timestamp": now.isoformat(),
        **request.model_dump(),
    }
    return result("production_entry", "Production entry accepted for supervisor review.", entry)


@router.get("/downtime-events", response_model=FactoryPulseApiResult)
def list_downtime_events() -> FactoryPulseApiResult:
    return result("downtime_events", "Downtime events with duration, recurring loss and escalation status.", downtime_events)


@router.post("/downtime-events", response_model=FactoryPulseApiResult)
def create_downtime_event(request: DowntimeEventRequest) -> FactoryPulseApiResult:
    payload = request.model_dump()
    duration = None
    if payload["end_time"]:
        duration = int((payload["end_time"] - payload["start_time"]).total_seconds() / 60)
    event = {
        "id": f"fp-dt-{len(downtime_events) + 1:03d}",
        **payload,
        "duration_minutes": duration,
        "status": "Open" if duration is None else "Under review",
        "financial_loss": round((duration or 0) / 60 * 75000, 2),
        "recurring_loss_alert": False,
    }
    return result("create_downtime_event", "Downtime event created; escalation remains configurable.", event)


@router.get("/scrap-events", response_model=FactoryPulseApiResult)
def list_scrap_events() -> FactoryPulseApiResult:
    return result("scrap_events", "Scrap, rejection and rework events with cost of poor quality.", scrap_events)


@router.post("/scrap-events", response_model=FactoryPulseApiResult)
def create_scrap_event(request: ScrapEventRequest) -> FactoryPulseApiResult:
    payload = request.model_dump()
    cost = payload["quantity_affected"] * (payload["material_cost"] + payload["conversion_cost"])
    event = {
        "id": f"fp-sc-{len(scrap_events) + 1:03d}",
        **payload,
        "cost_of_poor_quality": cost,
        "status": "Open",
    }
    return result("create_scrap_event", "Quality-loss event created with cost calculation.", event)


@router.get("/actions", response_model=FactoryPulseApiResult)
def list_actions() -> FactoryPulseApiResult:
    return result("actions", "Corrective-action workflow with benefits and owners.", actions)


@router.post("/actions", response_model=FactoryPulseApiResult)
def create_action(request: ActionRequest) -> FactoryPulseApiResult:
    action = {
        "id": f"fp-act-{len(actions) + 1:03d}",
        **request.model_dump(),
        "status": "Not started",
        "verified_benefit": 0,
    }
    return result("create_action", "Corrective action created and awaiting completion evidence.", action)


@router.get("/programme", response_model=FactoryPulseApiResult)
def programme() -> FactoryPulseApiResult:
    phases = [
        {"phase": "Days 1-10 Diagnostic", "completed": 9, "total": 10, "status": "Completed"},
        {"phase": "Days 11-30 Foundation", "completed": 8, "total": 14, "status": "In progress"},
        {"phase": "Days 31-65 Improvement", "completed": 0, "total": 12, "status": "Not started"},
        {"phase": "Days 66-90 Sustain", "completed": 0, "total": 8, "status": "Not started"},
    ]
    return result("programme", "90-day improvement programme phase tracker.", {"day": 24, "health": "At risk", "phases": phases})


@router.get("/kpi-dictionary", response_model=FactoryPulseApiResult)
def kpi_dictionary() -> FactoryPulseApiResult:
    definitions = [
        {"kpi": "Availability", "definition": "Operating time / planned production time"},
        {"kpi": "Performance", "definition": "Ideal cycle time x total quantity / operating time"},
        {"kpi": "Quality", "definition": "Good quantity / total quantity"},
        {"kpi": "OEE", "definition": "Availability x Performance x Quality"},
        {"kpi": "Cost of Poor Quality", "definition": "Scrap, rework, rejection and containment cost"},
    ]
    return result("kpi_dictionary", "Visible KPI dictionary for manufacturing calculations.", definitions)
