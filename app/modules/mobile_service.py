from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import uuid4

import jwt

from .mobile_repository import MobileRepository, mobile_repo

MOBILE_JWT_SECRET = os.getenv("MOBILE_JWT_SECRET") or secrets.token_urlsafe(48)
MOBILE_JWT_ALGORITHM = "HS256"


class MobileService:
    def __init__(self, repo: MobileRepository = mobile_repo) -> None:
        self.repo = repo

    def login(self, payload: dict[str, Any]) -> dict[str, Any]:
        user = next((row for row in self.repo.users if row["user_id"] == payload["user_id"] and row["password"] == payload["password"]), None)
        device = next((row for row in self.repo.devices if row["device_id"] == payload["device_id"] and row["status"] == "Active"), None)
        if not user or not device:
            raise PermissionError("Invalid mobile credentials or inactive device")
        refresh_token = f"mob-rfr-{uuid4().hex}"
        session = self.repo.add(self.repo.sessions, {"user_id": user["user_id"], "device_id": device["device_id"], "refresh_token": refresh_token, "status": "Active", "mfa_verified": False}, "mob-session")
        device["last_login_at"] = datetime.utcnow().isoformat()
        return {"access_token": self._token(user, device), "refresh_token": refresh_token, "token_type": "bearer", "session_id": session["id"], "role": user["role"], "permissions": user["permissions"]}

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        session = next((row for row in self.repo.sessions if row["refresh_token"] == refresh_token and row["status"] == "Active"), None)
        if not session:
            raise PermissionError("Invalid mobile refresh token")
        user = next(row for row in self.repo.users if row["user_id"] == session["user_id"])
        device = next(row for row in self.repo.devices if row["device_id"] == session["device_id"])
        return {"access_token": self._token(user, device), "token_type": "bearer"}

    def logout(self, device_id: str) -> dict[str, Any]:
        for session in self.repo.sessions:
            if session["device_id"] == device_id:
                session["status"] = "Logged Out"
        return {"device_id": device_id, "status": "Logged Out"}

    def register_device(self, payload: dict[str, Any]) -> dict[str, Any]:
        existing = next((row for row in self.repo.devices if row["device_id"] == payload["device_id"]), None)
        if existing:
            existing.update(payload)
            existing["status"] = "Active"
            return self.repo.snapshot(existing)
        return self.repo.add(self.repo.devices, {**payload, "last_sync_at": None, "last_login_at": None, "status": "Active"}, "mob-dev")

    def disable_device(self, device_id: str) -> dict[str, Any]:
        device = next((row for row in self.repo.devices if row["device_id"] == device_id or row["id"] == device_id), None)
        if not device:
            raise KeyError(device_id)
        device["status"] = "Disabled"
        self.logout(device["device_id"])
        return self.repo.snapshot(device)

    def my_work(self, user_id: str = "mobile-user-warehouse") -> dict[str, Any]:
        return {"feature_flags": self.repo.feature_flags["company-c"], "my_tasks": [row for row in self.repo.work_queue if row["user_id"] == user_id], "my_approvals": [row for row in self.repo.approvals if row["user_id"] == user_id and row["status"] == "Pending"], "assigned_work_orders": self.repo.maintenance_work_orders, "assigned_inspections": self.repo.quality_inspections, "pending_inventory_counts": self.repo.counts, "pending_receipts": self.repo.receipts, "production_updates_due": self.repo.production_orders, "critical_alerts": [row for row in self.repo.notifications if row["user_id"] == user_id], "offline_sync_status": self.sync_status()}

    def task_action(self, task_id: str, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        task = self.repo.get(self.repo.work_queue, task_id)
        if not task:
            raise KeyError(task_id)
        if action == "comment":
            task.setdefault("comments", []).append(payload or {})
        elif action == "block":
            task["status"] = "Blocked"
        else:
            task["status"] = {"start": "In Progress", "complete": "Completed"}.get(action, task["status"])
        self.repo.audit(task["user_id"], (payload or {}).get("device_id", "device-demo-001"), f"task_{action}", "Task", task_id, task)
        return self.repo.snapshot(task)

    def approval_action(self, approval_id: str, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        approval = self.repo.get(self.repo.approvals, approval_id)
        if not approval:
            raise KeyError(approval_id)
        approval["status"] = "Approved" if action == "approve" else "Rejected"
        approval["comment"] = payload.get("comment")
        self.repo.audit(approval["user_id"], payload.get("device_id", "device-demo-001"), f"approval_{action}", "Approval", approval_id, approval)
        return self.repo.snapshot(approval)

    def resolve_scan(self, payload: dict[str, Any]) -> dict[str, Any]:
        resolved = self.repo.scan_index.get(payload["scanned_value"], {"entity_type": "Unknown", "entity_id": None, "display_name": "Unrecognized scan", "allowed_actions": [], "warnings": ["No matching entity"]})
        self.repo.add(self.repo.scan_events, {**payload, "resolved_entity_type": resolved["entity_type"], "resolved_entity_id": resolved["entity_id"]}, "scan")
        return resolved

    def create_idempotent(self, collection: list[dict[str, Any]], payload: dict[str, Any], prefix: str, action_type: str) -> dict[str, Any]:
        existing = next((row for row in collection if row.get("idempotency_key") == payload.get("idempotency_key")), None)
        if existing:
            return {**self.repo.snapshot(existing), "idempotency_status": "duplicate"}
        record = self.repo.add(collection, {**payload, "status": "Draft"}, prefix)
        self.repo.audit("mobile-user-warehouse", "device-demo-001", action_type, None, record["id"], record)
        return record

    def submit_count_item(self, count_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        count = self.repo.get(self.repo.counts, count_id)
        if not count:
            raise KeyError(count_id)
        variance = payload["counted_quantity"] - payload["system_quantity"]
        result = {"count_id": count_id, **payload, "variance": variance, "variance_status": "Requires Approval" if variance else "Matched"}
        if variance:
            self.repo.add(self.repo.conflicts, {"conflict_type": "Inventory count variance", "related_type": "Count", "related_id": count_id, "conflict_reason": payload.get("variance_reason") or "Quantity variance", "status": "Requires Review"}, "mob-conflict")
        count.setdefault("submitted_items", []).append(result)
        return result

    def sync_push(self, payload: dict[str, Any]) -> dict[str, Any]:
        batch = self.repo.add(self.repo.sync_batches, {"device_id": payload["device_id"], "user_id": payload["user_id"], "last_sync_at": payload.get("last_sync_at"), "action_count": str(len(payload["actions"])), "status": "Processed"}, "sync")
        results = []
        blocked = {"approval.approve", "inventory.write_off", "quarantine.release", "dispatch.confirm", "purchase.approve"}
        for action in payload["actions"]:
            duplicate = next((row for row in self.repo.offline_actions if row["idempotency_key"] == action["idempotency_key"]), None)
            if duplicate:
                status, reason = "duplicate", "Idempotency key already processed"
            elif action["action_type"] in blocked:
                status, reason = "rejected", "High-risk action cannot be performed offline"
            elif action["payload"].get("closed"):
                status, reason = "requires_review", "Related record already closed"
            else:
                status, reason = "accepted", None
                self.repo.add(self.repo.offline_actions, {**action, "device_id": payload["device_id"], "user_id": payload["user_id"], "sync_status": "Accepted"}, "offline")
            results.append(self.repo.add(self.repo.sync_results, {"sync_batch_id": batch["id"], "local_action_id": action["local_action_id"], "status": status, "conflict_reason": reason}, "sync-result"))
        return {"batch": batch, "results": results}

    def sync_status(self) -> dict[str, Any]:
        return {"pending_actions": len([row for row in self.repo.offline_actions if row["sync_status"] == "Pending"]), "last_batch": self.repo.sync_batches[-1] if self.repo.sync_batches else None, "conflicts": self.repo.conflicts}

    def ai_safety(self) -> dict[str, list[str]]:
        return {"can": ["Suggest Next Action", "Warn", "Summarize", "Create Drafts"], "cannot": ["Approve", "Release Inventory", "Close Critical Work Order", "Dispatch Goods", "Override Reservation", "Write Off Inventory"]}

    def risk_center(self) -> dict[str, Any]:
        return {"risks": self.repo.snapshot(self.repo.ai_risks), "ai_safety": self.ai_safety()}

    def draft_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        sanitized = payload["reason"].replace("approve", "review").replace("release inventory", "inventory review").replace("dispatch goods", "dispatch review").replace("write off inventory", "inventory loss review")
        return self.repo.add(self.repo.recommendations, {**payload, "reason": sanitized, "status": "DRAFT", "requires_human_approval": True, "ai_safety": self.ai_safety()}, "mob-rec")

    def _token(self, user: dict[str, Any], device: dict[str, Any]) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode({"sub": user["user_id"], "company_id": user["company_id"], "device_id": device["device_id"], "role": user["role"], "permissions": user["permissions"], "scope": "mobile", "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=8)).timestamp())}, MOBILE_JWT_SECRET, algorithm=MOBILE_JWT_ALGORITHM)


mobile_service = MobileService()
