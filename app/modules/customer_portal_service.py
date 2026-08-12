from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt

from .customer_portal_repository import CustomerPortalRepository, customer_portal_repo
from .sales_repository import sales_repo

PORTAL_JWT_SECRET = os.getenv("CUSTOMER_PORTAL_JWT_SECRET") or secrets.token_urlsafe(48)
PORTAL_JWT_ALGORITHM = "HS256"


class CustomerPortalService:
    def __init__(self, repo: CustomerPortalRepository = customer_portal_repo) -> None:
        self.repo = repo

    def login(self, email: str, password: str) -> dict[str, Any]:
        user = next((row for row in self.repo.users if row["email"] == email and row["password"] == password and row["status"] == "Active"), None)
        if not user:
            raise PermissionError("Invalid customer portal credentials")
        user["last_login"] = datetime.utcnow().isoformat()
        token = self._token(user)
        refresh_token = f"cpr-{uuid4().hex}"
        self.repo.add(self.repo.sessions, {"customer_portal_user_id": user["customer_portal_user_id"], "refresh_token": refresh_token, "status": "Active"}, "cp-session")
        self.repo.audit(user["customer_portal_user_id"], "portal_login", {"customer_id": user["customer_id"]})
        return {"access_token": token, "refresh_token": refresh_token, "token_type": "bearer", "customer_id": user["customer_id"], "role": user["role"]}

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        session = next((row for row in self.repo.sessions if row["refresh_token"] == refresh_token and row["status"] == "Active"), None)
        if not session:
            raise PermissionError("Invalid refresh token")
        user = next(row for row in self.repo.users if row["customer_portal_user_id"] == session["customer_portal_user_id"])
        return {"access_token": self._token(user), "token_type": "bearer"}

    def invite_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        user = self.repo.add(self.repo.users, {**payload, "customer_portal_user_id": f"cpu-{uuid4().hex[:8]}", "status": "Invited", "last_login": None, "invitation_status": "Pending", "password": "Portal123!"}, "cpu")
        self.notify(payload["customer_id"], "Portal invitation sent", f"Portal invitation sent to {payload['email']}.")
        return self._public_user(user)

    def profile(self, user: dict[str, Any]) -> dict[str, Any]:
        customer = self.customer(user["customer_id"])
        return self._safe_customer(customer)

    def profile_update_request(self, user: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
        request = self.repo.add(self.repo.profile_update_requests, {"customer_id": user["customer_id"], "requested_by": user["customer_portal_user_id"], "requested_changes": changes, "status": "Pending Review"}, "cpu-profile")
        self.repo.audit(user["customer_portal_user_id"], "profile_update_request", {"fields": list(changes.keys())})
        return request

    def orders(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [self.portal_order(order) for order in sales_repo.orders if order["customer_id"] == user["customer_id"]]

    def order_detail(self, user: dict[str, Any], order_id: str) -> dict[str, Any]:
        order = next((row for row in sales_repo.orders if row["id"] == order_id and row["customer_id"] == user["customer_id"]), None)
        if not order:
            raise KeyError(order_id)
        support = [row for row in self.repo.support_requests if row.get("sales_order_id") == order_id and row["customer_id"] == user["customer_id"]]
        returns = [row for row in self.repo.return_requests if row["sales_order_id"] == order_id and row["customer_id"] == user["customer_id"]]
        documents = [row for row in self.repo.documents if row["customer_id"] == user["customer_id"] and row["linked_id"] == order_id]
        return {**self.portal_order(order), "support_requests": support, "return_requests": returns, "documents": documents}

    def shipments(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [self.portal_shipment(row) for row in sales_repo.shipments if row["customer_id"] == user["customer_id"]]

    def documents(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [self.portal_document(row) for row in self.repo.documents if row["customer_id"] == user["customer_id"]]

    def download_document(self, user: dict[str, Any], document_id: str) -> dict[str, Any]:
        doc = next((row for row in self.repo.documents if row["id"] == document_id and row["customer_id"] == user["customer_id"] and row["downloadable"]), None)
        if not doc:
            raise KeyError(document_id)
        self.repo.audit(user["customer_portal_user_id"], "document_download", {"document_id": document_id})
        return {**self.portal_document(doc), "secure_download_token": f"download-{uuid4().hex[:16]}"}

    def create_support(self, user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        support = self.repo.add(self.repo.support_requests, {**payload, "support_request_id": f"SUP-{uuid4().hex[:6].upper()}", "customer_id": user["customer_id"], "status": "Open", "assigned_internal_user_id": None, "created_at": datetime.utcnow().isoformat()}, "support")
        self.repo.audit(user["customer_portal_user_id"], "support_request_created", {"support_request_id": support["id"]})
        return support

    def create_return(self, user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        self.order_detail(user, payload["sales_order_id"])
        return_request = self.repo.add(self.repo.return_requests, {**payload, "return_request_id": f"RET-{uuid4().hex[:6].upper()}", "customer_id": user["customer_id"], "status": "Submitted", "quality_required": True}, "cp-return")
        self.notify(user["customer_id"], "Return requested", "Return request submitted for internal review.")
        return return_request

    def dashboard(self, user: dict[str, Any]) -> dict[str, Any]:
        orders = self.orders(user)
        shipments = self.shipments(user)
        return {
            "open_orders": [row for row in orders if row["portal_status"] not in {"Delivered", "Cancelled", "Returned"}],
            "orders_in_production": [row for row in orders if row["portal_status"] == "In Production"],
            "ready_for_dispatch": [row for row in orders if row["portal_status"] == "Ready for Dispatch"],
            "in_transit_shipments": [row for row in shipments if row["shipment_status"] == "In Transit"],
            "delivered_orders": [row for row in orders if row["portal_status"] == "Delivered"],
            "open_support_requests": [row for row in self.repo.support_requests if row["customer_id"] == user["customer_id"] and row["status"] not in {"Closed", "Cancelled"}],
            "open_return_requests": [row for row in self.repo.return_requests if row["customer_id"] == user["customer_id"] and row["status"] not in {"Closed", "Cancelled"}],
            "documents_available": self.documents(user),
            "notifications": self.notifications(user),
        }

    def reports(self, user: dict[str, Any], report_type: str) -> dict[str, Any]:
        data = {"orders": self.orders(user), "shipments": self.shipments(user), "returns": [row for row in self.repo.return_requests if row["customer_id"] == user["customer_id"]], "documents": self.documents(user)}
        return {"report_type": report_type, "formats": ["PDF", "Excel", "CSV"], "data": data.get(report_type, [])}

    def notifications(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        return [row for row in self.repo.notifications if row["customer_id"] == user["customer_id"]]

    def risk_center(self) -> dict[str, Any]:
        return {"risks": [{"risk": "Order delay risk", "customer_id": "cust-apollo", "severity": "MEDIUM"}, {"risk": "Document missing risk", "customer_id": "cust-apollo", "severity": "LOW"}], "ai_safety": self.ai_safety()}

    def draft_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        sanitized = payload["reason"].replace("internal shortage", "fulfillment delay")
        return self.repo.add(self.repo.recommendations, {**payload, "reason": sanitized, "status": "DRAFT", "requires_human_approval": True, "ai_safety": self.ai_safety()}, "cp-draft")

    def ai_safety(self) -> dict[str, list[str]]:
        return {"can": ["Analyze", "Recommend", "Create Drafts"], "cannot": ["Approve Return", "Issue Credit", "Cancel Order", "Promise Delivery Date", "Release Internal Information", "Send External Email Without Approval"]}

    def portal_order(self, order: dict[str, Any]) -> dict[str, Any]:
        items = [self._safe_order_item(item) for item in sales_repo.order_items if item["sales_order_id"] == order["id"]]
        return {"id": order["id"], "sales_order_number": order["sales_order_number"], "order_date": order["order_date"], "requested_delivery_date": order["requested_delivery_date"], "portal_status": self.portal_status(order["status"]), "items": items, "expected_dispatch_date": order["requested_delivery_date"], "expected_delivery_date": order["requested_delivery_date"]}

    def portal_status(self, internal_status: str) -> str:
        mapping = {"Draft": "Order Received", "Submitted": "Under Review", "Pending Approval": "Under Review", "Approved": "Confirmed", "Inventory Check Pending": "Confirmed", "Partially Reserved": "Confirmed", "Fully Reserved": "Confirmed", "Production Required": "In Production", "Ready For Dispatch": "Ready for Dispatch", "Partially Dispatched": "Partially Dispatched", "Fully Dispatched": "Dispatched", "Delivered": "Delivered", "Cancelled": "Cancelled", "Returned": "Returned"}
        return mapping.get(internal_status, "Under Review")

    def portal_shipment(self, shipment: dict[str, Any]) -> dict[str, Any]:
        return {key: shipment.get(key) for key in ["id", "shipment_number", "dispatch_date", "carrier_name", "tracking_number", "vehicle_number", "shipment_status", "expected_delivery_date", "actual_delivery_date", "proof_of_delivery_document"]}

    def portal_document(self, doc: dict[str, Any]) -> dict[str, Any]:
        return {key: doc.get(key) for key in ["id", "document_id", "linked_type", "linked_id", "document_type", "downloadable", "access_level"]}

    def customer(self, customer_id: str) -> dict[str, Any]:
        customer = next((row for row in sales_repo.customers if row["customer_id"] == customer_id), None)
        if not customer:
            raise KeyError(customer_id)
        return customer

    def current_user(self) -> dict[str, Any]:
        return self.repo.users[0]

    def notify(self, customer_id: str, notification_type: str, message: str) -> dict[str, Any]:
        return self.repo.add(self.repo.notifications, {"customer_id": customer_id, "notification_type": notification_type, "message": message, "status": "Unread"}, "cp-notify")

    def _token(self, user: dict[str, Any]) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode({"sub": user["customer_portal_user_id"], "company_id": user["company_id"], "customer_id": user["customer_id"], "role": user["role"], "scope": "customer_portal", "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=4)).timestamp())}, PORTAL_JWT_SECRET, algorithm=PORTAL_JWT_ALGORITHM)

    def _public_user(self, user: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in user.items() if key != "password"}

    def _safe_customer(self, customer: dict[str, Any]) -> dict[str, Any]:
        allowed = ["customer_id", "customer_code", "customer_name", "customer_type", "gst_vat_tax_id", "billing_address", "shipping_address", "contact_person", "email", "phone", "assigned_sales_rep_id", "active_status"]
        return {key: customer.get(key) for key in allowed}

    def _safe_order_item(self, item: dict[str, Any]) -> dict[str, Any]:
        allowed = ["product_id", "ordered_quantity", "reserved_quantity", "dispatched_quantity", "pending_quantity", "requested_delivery_date", "status"]
        return {key: item.get(key) for key in allowed}


customer_portal_service = CustomerPortalService()
