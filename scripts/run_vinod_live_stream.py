#!/usr/bin/env python3
"""Run a two-day Vinod live-data stream into the platform database.

This process is intentionally long-running and restart-safe. It stores progress in
app_metadata, writes operational rows into module_records, and emits periodic
Data Hub refresh/audit events so the UI and database have live evidence to read.
"""

from __future__ import annotations

import argparse
import os
import signal
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.modules.frontend_admin_models import DataHubAuditEvent, DataHubRefreshRun
from app.platform_models import AppMetadata, ModuleRecord
from scripts.seed_vinod_scale_data import (
    COMPANY_ID,
    COMPANY_NAME,
    PLANTS,
    TENANT_ID,
    db_now,
    ensure_vinod_company,
)


DEFAULT_STATE_KEY = "vinod-48h-live-stream"
DEFAULT_DURATION_HOURS = 48.0
DEFAULT_INTERVAL_SECONDS = 10.0
DEFAULT_BATCH_SIZE = 50
STREAM_RECORD_ID_PREFIX = "vinod-live-48h-"

MODULE_STREAMS = [
    ("inventory", "inventory_live_snapshot", "Live inventory signal"),
    ("warehouse", "warehouse_live_task", "Live warehouse signal"),
    ("production", "production_live_order", "Live production signal"),
    ("maintenance", "maintenance_live_alert", "Live maintenance signal"),
    ("quality", "quality_live_event", "Live quality signal"),
    ("procurement", "procurement_live_signal", "Live procurement signal"),
    ("planning", "planning_live_signal", "Live planning signal"),
    ("reports", "reporting_live_metric", "Live reporting signal"),
]

STATUSES = ["ACTIVE", "OPEN", "IN_PROGRESS", "ATTENTION", "COMPLETED"]


stop_requested = False


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="seconds")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def handle_stop(_signum: int, _frame: object) -> None:
    global stop_requested
    stop_requested = True


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return float(value)


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return int(value)


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a restart-safe Vinod live stream for 48 hours.")
    parser.add_argument("--state-key", default=os.getenv("VINOD_LIVE_STATE_KEY", DEFAULT_STATE_KEY))
    parser.add_argument("--duration-hours", type=float, default=env_float("VINOD_LIVE_DURATION_HOURS", DEFAULT_DURATION_HOURS))
    parser.add_argument("--interval-seconds", type=float, default=env_float("VINOD_LIVE_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS))
    parser.add_argument("--batch-size", type=int, default=env_int("VINOD_LIVE_BATCH_SIZE", DEFAULT_BATCH_SIZE))
    parser.add_argument("--audit-every-batches", type=int, default=env_int("VINOD_LIVE_AUDIT_EVERY_BATCHES", 12))
    parser.add_argument("--max-batches", type=int, default=env_int("VINOD_LIVE_MAX_BATCHES", 0))
    parser.add_argument("--hold-after-complete", action=argparse.BooleanOptionalAction, default=env_bool("VINOD_LIVE_HOLD_AFTER_COMPLETE", True))
    return parser


def load_or_start_state(db: Session, state_key: str, duration_hours: float) -> AppMetadata:
    row = (
        db.query(AppMetadata)
        .filter(
            AppMetadata.tenant_id == TENANT_ID,
            AppMetadata.company_id == COMPANY_ID,
            AppMetadata.category == "live_stream_state",
            AppMetadata.record_key == state_key,
        )
        .first()
    )
    now = utc_now()
    if row:
        payload = row.payload or {}
        status = payload.get("status")
        ends_at = parse_iso(payload.get("ends_at"))
        if status == "Completed":
            return row
        if ends_at and ends_at > now:
            payload["status"] = "Running"
            payload["resumed_at"] = iso_now()
            row.payload = payload
            db.commit()
            return row

    payload: dict[str, Any] = {
        "status": "Running",
        "company_id": COMPANY_ID,
        "company_name": COMPANY_NAME,
        "started_at": now.isoformat(timespec="seconds"),
        "ends_at": (now + timedelta(hours=duration_hours)).isoformat(timespec="seconds"),
        "duration_hours": duration_hours,
        "sequence": 0,
        "rows_inserted": 0,
        "batches_inserted": 0,
        "last_batch_at": None,
        "last_batch_seconds": None,
        "last_record_code": None,
    }
    if row:
        row.payload = payload
        row.name = "Vinod 48-hour live stream"
    else:
        row = AppMetadata(
            id=f"meta-{state_key}",
            tenant_id=TENANT_ID,
            company_id=COMPANY_ID,
            plant_id=None,
            category="live_stream_state",
            record_key=state_key,
            name="Vinod 48-hour live stream",
            payload=payload,
            created_at=db_now(),
        )
        db.add(row)
    db.commit()
    return row


def mark_state(db: Session, state: AppMetadata, status: str, **updates: Any) -> None:
    payload = dict(state.payload or {})
    payload["status"] = status
    payload.update(updates)
    state.payload = payload
    db.commit()


def latest_stream_sequence(db: Session) -> int:
    latest_id = (
        db.query(ModuleRecord.id)
        .filter(
            ModuleRecord.company_id == COMPANY_ID,
            ModuleRecord.id.like(f"{STREAM_RECORD_ID_PREFIX}%"),
        )
        .order_by(ModuleRecord.id.desc())
        .limit(1)
        .scalar()
    )
    if not latest_id:
        return 0
    try:
        return int(latest_id.removeprefix(STREAM_RECORD_ID_PREFIX))
    except ValueError:
        return 0


def create_batch_rows(sequence_start: int, batch_size: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    created_at = db_now()
    for offset in range(batch_size):
        sequence = sequence_start + offset
        module_key, record_type, label = MODULE_STREAMS[sequence % len(MODULE_STREAMS)]
        plant_id, plant_name, plant_code = PLANTS[sequence % len(PLANTS)]
        status = STATUSES[sequence % len(STATUSES)]
        quantity = float(((sequence * 37) % 950) + 25)
        risk_score = round(((sequence * 17) % 100) / 100, 2)
        latency_ms = int(40 + ((sequence * 19) % 900))
        record_code = f"VINOD-LIVE-48H-{sequence:012d}"
        rows.append(
            {
                "id": f"{STREAM_RECORD_ID_PREFIX}{sequence:012d}",
                "tenant_id": TENANT_ID,
                "company_id": COMPANY_ID,
                "plant_id": plant_id,
                "module_key": module_key,
                "record_type": record_type,
                "record_code": record_code,
                "name": f"{label} {sequence:012d}",
                "status": status,
                "quantity": quantity,
                "payload": {
                    "source": "Vinod 48-hour continuous stream",
                    "client": COMPANY_NAME,
                    "plant_code": plant_code,
                    "plant_name": plant_name,
                    "stream_sequence": sequence,
                    "event_time": iso_now(),
                    "risk_score": risk_score,
                    "latency_ms": latency_ms,
                    "requires_ui_refresh": True,
                    "sync_mode": "continuous",
                },
                "created_at": created_at,
            }
        )
    return rows


def write_observability_events(db: Session, batch_number: int, rows_inserted: int, elapsed: float) -> None:
    event_time = iso_now()
    refresh_id = f"vinod-live-refresh-{batch_number:012d}"
    audit_id = f"vinod-live-audit-{batch_number:012d}"
    db.add(
        DataHubRefreshRun(
            id=refresh_id,
            company_id=COMPANY_ID,
            connection_id="vinod-48h-continuous-stream",
            refresh_mode="Continuous stream",
            status="Completed",
            rows_processed=rows_inserted,
            started_at=event_time,
            completed_at=event_time,
            failure_reason=None,
        )
    )
    db.add(
        DataHubAuditEvent(
            id=audit_id,
            company_id=COMPANY_ID,
            actor_email="system@metam.local",
            action="CONTINUOUS_STREAM_BATCH",
            entity_type="module_records",
            entity_id=refresh_id,
            details={
                "batch_number": batch_number,
                "rows_inserted": rows_inserted,
                "elapsed_seconds": round(elapsed, 3),
                "stream": "Vinod 48-hour continuous stream",
            },
        )
    )


def run_batch(db: Session, state: AppMetadata, batch_size: int, audit_every_batches: int) -> dict[str, Any]:
    payload = dict(state.payload or {})
    sequence = max(int(payload.get("sequence") or 0), latest_stream_sequence(db))
    persisted_batch_count = sequence // max(batch_size, 1)
    batch_number = max(int(payload.get("batches_inserted") or 0), persisted_batch_count) + 1
    sequence_start = sequence + 1
    rows = create_batch_rows(sequence_start, batch_size)

    start = time.perf_counter()
    db.bulk_insert_mappings(ModuleRecord, rows)
    elapsed = time.perf_counter() - start

    if audit_every_batches > 0 and batch_number % audit_every_batches == 0:
        write_observability_events(db, batch_number, batch_size, elapsed)

    new_sequence = sequence + batch_size
    payload.update(
        {
            "status": "Running",
            "sequence": new_sequence,
            "rows_inserted": int(payload.get("rows_inserted") or 0) + batch_size,
            "batches_inserted": batch_number,
            "last_batch_at": iso_now(),
            "last_batch_seconds": round(elapsed, 3),
            "last_record_code": rows[-1]["record_code"],
        }
    )
    state.payload = payload
    db.commit()
    return payload


def idle_after_completion(hold_after_complete: bool) -> None:
    if not hold_after_complete:
        return
    print("Vinod live stream completed; container is staying idle for Docker health/inspection.", flush=True)
    while True:
        time.sleep(3600)


def main() -> int:
    args = build_parser().parse_args()
    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    db = SessionLocal()
    try:
        ensure_vinod_company(db)
        state = load_or_start_state(db, args.state_key, args.duration_hours)
        payload = dict(state.payload or {})
        if payload.get("status") == "Completed":
            print(f"Vinod live stream already completed at {payload.get('completed_at')}.", flush=True)
            idle_after_completion(args.hold_after_complete)
            return 0

        ends_at = parse_iso(payload.get("ends_at"))
        if not ends_at:
            raise RuntimeError("Live stream state is missing a valid ends_at timestamp.")

        print(
            "Starting Vinod live stream: "
            f"state_key={args.state_key}, batch_size={args.batch_size}, "
            f"interval_seconds={args.interval_seconds}, ends_at={ends_at.isoformat(timespec='seconds')}",
            flush=True,
        )

        batches_this_run = 0
        while not stop_requested:
            now = utc_now()
            if now >= ends_at:
                mark_state(db, state, "Completed", completed_at=iso_now())
                print("Vinod live stream reached its configured 48-hour end time.", flush=True)
                idle_after_completion(args.hold_after_complete)
                return 0

            payload = run_batch(db, state, args.batch_size, args.audit_every_batches)
            batches_this_run += 1
            live_count = (
                db.query(func.count(ModuleRecord.id))
                .filter(ModuleRecord.company_id == COMPANY_ID, ModuleRecord.record_code.like("VINOD-LIVE-48H-%"))
                .scalar()
            )
            print(
                "Vinod live batch "
                f"{payload['batches_inserted']} inserted {args.batch_size} rows "
                f"in {payload['last_batch_seconds']}s; "
                f"stream_total={payload['rows_inserted']}; db_live_rows={live_count}; "
                f"last={payload['last_record_code']}",
                flush=True,
            )

            if args.max_batches and batches_this_run >= args.max_batches:
                print(f"Stopping after max_batches={args.max_batches} for validation.", flush=True)
                return 0

            sleep_until = time.monotonic() + max(args.interval_seconds, 0)
            while not stop_requested and time.monotonic() < sleep_until:
                time.sleep(min(1.0, sleep_until - time.monotonic()))

        mark_state(db, state, "Stopped", stopped_at=iso_now())
        print("Vinod live stream stopped by signal.", flush=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
