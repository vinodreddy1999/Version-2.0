from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt

from .supplier_portal_repository import SupplierPortalRepository, supplier_portal_repo

SUPPLIER_PORTAL_JWT_SECRET = os.getenv("SUPPLIER_PORTAL_JWT_SECRET") or secrets.token_urlsafe(48)
SUPPLIER_PORTAL_JWT_ALGORITHM = "HS256"


class SupplierPortalService:
    def __init__(self, repo: SupplierPortalRepository = supplier_portal_repo) -> None:
        self.repo = repo

    def login(self, email: str, password: str) -> dict[str, Any]:
        user = next((row for row in self.repo.users if row["email"] == email and row["password"] == password and row["status"] == "Active"), None)
        if not user:
            raise PermissionError("Invalid supplier portal credentials")
        user["last_login"] = datetime.utcnow().isoformat()
        refresh_token = f"spr-{uuid4().hex}"
        self.repo.add(self.repo.sessions, {"supplier_portal_user_id": user["supplier_portal_user_id"], "refresh_token": refresh_token, "status": "Active"}, "sp-session")
        self.repo.audit(user["supplier_portal_user_id"], "supplier_portal_login", {"supplier_id": user["supplier_id"]})
        return {"access_token": self._token(user), "refresh_token": refresh_token, "token_type": "bearer", "supplier_id": user["supplier_id"], "role": user["role"]}

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        session = next((row for row in self.repo.sessions if row["refresh_token"] == refresh_token and row["status"] == "Active"), None)
        if not session:
            raise PermissionError("Invalid refresh token")
        user = next(row for row in self.repo.users if row["supplier_portal_user_id"] == session["supplier_portal_user_id"])
        return {"access_token": self._token(user), "token_type": "bearer"}

    def profile(self, user: dict[str, Any]) -> dict[str, Any]:
        supplier = next(row for row in self.repo.suppliers if row["supplier_id"] == user["supplier_id"])
        return {key: supplier.get(key) for key in ["supplier_id", "supplier_code", "supplier_name", "address", "tax_id", "contact", "payment_terms", "active_status"]}

    def enablement(self, user: dict[str, Any]) -> dict[str, Any]:
        flags = self.repo.company_feature_flags.get(user["company_id"], {"supplier_portal_enabled": False})
        role = next((role for role in self.repo.roles if role["company_id"] == user["company_id"] and role["role_name"] == user["role"]), None)
        return {"company_id": user["company_id"], "supplier_id": user["supplier_id"], "feature_flags": flags, "role": user["role"], "permissions": role["permissions"] if role else []}

    def purchase_orders(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [self.portal_po(po) for po in self.repo.purchase_orders if po["supplier_id"] == user["supplier_id"]]

    def purchase_order(self, user: dict[str, Any], po_id: str) -> dict[str, Any]:
        po = next((row for row in self.repo.purchase_orders if row["id"] == po_id and row["supplier_id"] == user["supplier_id"]), None)
        if not po:
            raise KeyError(po_id)
        return self.portal_po(po)

    def acknowledge_po(self, user: dict[str, Any], po_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.purchase_order(user, po_id)
        ack = self.repo.add(self.repo.acknowledgements, {"purchase_order_id": po_id, "supplier_id": user["supplier_id"], "submitted_by": user["supplier_portal_user_id"], **payload}, "po-ack")
        self.repo.audit(user["supplier_portal_user_id"], "po_acknowledged", {"purchase_order_id": po_id, "status": payload["acknowledgement_status"]})
        return ack

    def upload_document(self, user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        document = self.repo.add(self.repo.documents, {"supplier_id": user["supplier_id"], "status": "Pending Review", **payload}, "sp-doc")
        self.repo.audit(user["supplier_portal_user_id"], "document_uploaded", {"document_id": document["id"]})
        return document

    def upload_certificate(self, user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        certificate = self.repo.add(self.repo.certificates, {"supplier_id": user["supplier_id"], "verification_status": "Pending Review", "verified_by": None, **payload}, "sp-cert")
        return certificate

    def dashboard(self, user: dict[str, Any]) -> dict[str, Any]:
        pos = self.purchase_orders(user)
        return {"feature_flags": self.enablement(user)["feature_flags"], "open_pos": [po for po in pos if po["supplier_status"] not in {"Closed", "Cancelled"}], "pos_awaiting_acknowledgement": [po for po in pos if po["supplier_status"] == "Received"], "upcoming_deliveries": [po for po in pos if po["delivery_date"] >= str(date.today())], "delayed_deliveries": self.delivery_risk()["delayed_deliveries"], "documents_pending_upload": ["Test certificate"], "certificates_expiring": self.certificate_expiry()["expiring_soon"], "quality_issues": [], "messages": self.messages(user), "capa_actions": self.capa(user), "tasks": self.tasks(user)}

    def reports(self, user: dict[str, Any], report_type: str) -> dict[str, Any]:
        data = {"purchase-orders": self.purchase_orders(user), "deliveries": [row for row in self.repo.delivery_confirmations if row["supplier_id"] == user["supplier_id"]], "documents": [row for row in self.repo.documents if row["supplier_id"] == user["supplier_id"]], "certificates": [row for row in self.repo.certificates if row["supplier_id"] == user["supplier_id"]]}
        return {"report_type": report_type, "formats": ["PDF", "Excel", "CSV"], "data": data.get(report_type, [])}

    def risk_center(self) -> dict[str, Any]:
        risks = [risk for risk in self.repo.ai_risks if risk["supplier_id"] == "supplier-apex"]
        risks.extend(self.delivery_risk()["risks"])
        risks.extend(self.document_risk()["risks"])
        risks.extend(self.certificate_expiry()["risks"])
        return {"risks": risks, "ai_safety": self.ai_safety()}

    def delivery_risk(self) -> dict[str, Any]:
        risks = []
        delayed = []
        for po in self.repo.purchase_orders:
            if po["supplier_id"] == "supplier-apex" and po["delivery_date"] <= str(date.today() + timedelta(days=7)):
                risks.append({"purchase_order_id": po["id"], "risk": "Supplier delay risk", "severity": "MEDIUM", "recommended_action": "Follow up supplier"})
                delayed.append(po)
        return {"risks": risks, "delayed_deliveries": delayed, "expected_delay_duration_days": 2, "draft_follow_up_email": "Please confirm delivery status."}

    def document_risk(self) -> dict[str, Any]:
        return {"risks": [{"risk": "Missing test certificate", "supplier_id": "supplier-apex", "severity": "HIGH"}], "recommendation": "Create document reminder and internal review task."}

    def certificate_expiry(self) -> dict[str, Any]:
        expiring = [cert for cert in self.repo.certificates if cert["supplier_id"] == "supplier-apex" and cert["expiry_date"] <= str(date.today() + timedelta(days=30))]
        return {"expiring_soon": expiring, "risks": [{"risk": "Certificate expiry risk", "supplier_id": "supplier-apex", "severity": "MEDIUM"}] if expiring else []}

    def supplier_quality_risk(self) -> dict[str, Any]:
        return {"supplier_quality_risk_score": 38, "recommended_supplier_review": True, "draft_capa_request": {"status": "DRAFT"}}

    def po_ack_risk(self) -> dict[str, Any]:
        return {"po_not_acknowledged": [po for po in self.repo.purchase_orders if po["supplier_id"] == "supplier-apex" and po["status"] == "Issued"], "recommendation": "Follow-up supplier and escalate if no response."}

    def draft_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        sanitized = payload["reason"].replace("production shortage", "delivery urgency").replace("inventory risk", "delivery priority")
        return self.repo.add(self.repo.recommendations, {**payload, "reason": sanitized, "status": "DRAFT", "requires_human_approval": True, "ai_safety": self.ai_safety()}, "sp-draft")

    def ai_safety(self) -> dict[str, list[str]]:
        return {"can": ["Analyze", "Recommend", "Create Drafts"], "cannot": ["Approve Supplier", "Approve Certificate", "Change PO", "Accept Supplier Delivery Date", "Send PO", "Commit Financial Action", "Replace Supplier Automatically"]}

    def messages(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [row for row in self.repo.messages if row["supplier_id"] == user["supplier_id"]]

    def capa(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [row for row in self.repo.capa_responses if row["supplier_id"] == user["supplier_id"]]

    def performance(self, user: dict[str, Any]) -> dict[str, Any]:
        flags = self.enablement(user)["feature_flags"]
        if not flags.get("performance_visible", False):
            return {"visible": False, "message": "Supplier performance sharing is disabled for this company."}
        metrics = next((row for row in self.repo.performance if row["supplier_id"] == user["supplier_id"]), {})
        return {"visible": True, "metrics": metrics}

    def tasks(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [row for row in self.repo.tasks if row["supplier_id"] == user["supplier_id"]]

    def current_user(self) -> dict[str, Any]:
        return self.repo.users[0]

    def portal_po(self, po: dict[str, Any]) -> dict[str, Any]:
        return {"id": po["id"], "po_number": po["po_number"], "po_date": po["po_date"], "items": po["items"], "delivery_date": po["delivery_date"], "delivery_address": po["delivery_address"], "supplier_status": self.supplier_status(po["status"]), "buyer_contact": po["buyer_contact"], "delivery_instructions": po["delivery_instructions"], "document_requirements": po["document_requirements"]}

    def supplier_status(self, internal_status: str) -> str:
        return {"Issued": "Received", "Acknowledged": "Accepted", "Partially Accepted": "Partially Accepted", "Delivery Scheduled": "Delivery Scheduled", "Closed": "Closed", "Cancelled": "Cancelled"}.get(internal_status, "Under Review")

    def _token(self, user: dict[str, Any]) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode({"sub": user["supplier_portal_user_id"], "company_id": user["company_id"], "supplier_id": user["supplier_id"], "role": user["role"], "scope": "supplier_portal", "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=4)).timestamp())}, SUPPLIER_PORTAL_JWT_SECRET, algorithm=SUPPLIER_PORTAL_JWT_ALGORITHM)


supplier_portal_service = SupplierPortalService()
