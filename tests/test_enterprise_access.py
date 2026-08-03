from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.authorization import AuthorizationRequest, available_scope_nodes, evaluate_access, is_effective, mask_fields
from app.database import SessionLocal
from app.enterprise_access_models import (
    Enterprise,
    ModuleEntitlement,
    OrganizationalRelationship,
    SupportAccessSession,
    TemporaryAccessGrant,
    UserAccessOverride,
    UserRoleAssignment,
)
from app.main import app
from app.platform_models import User


client = TestClient(app)
ENTERPRISE_ID = "enterprise-example-global"


def runtime_headers(email: str, password: str = "Enterprise123!") -> dict[str, str]:
    response = client.post("/runtime/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def request(
    scope_type: str,
    scope_id: str,
    capability: str,
    *,
    domain: str | None = None,
    module_key: str | None = None,
    owner_id: str | None = None,
) -> AuthorizationRequest:
    return AuthorizationRequest(
        enterprise_id=ENTERPRISE_ID,
        scope_type=scope_type,
        scope_id=scope_id,
        capability=capability,
        domain=domain,
        module_key=module_key,
        record_owner_id=owner_id,
    )


def test_parallel_geography_business_and_legal_relationships_are_seeded():
    with SessionLocal() as db:
        chennai = "org-plant-abc-manufacturing-001"
        dimensions = {
            row.dimension
            for row in db.query(OrganizationalRelationship)
            .filter(
                OrganizationalRelationship.enterprise_id == ENTERPRISE_ID,
                OrganizationalRelationship.child_node_id == chennai,
            )
            .all()
        }
        assert {"geography", "business", "legal"}.issubset(dimensions)


def test_regional_scope_allows_descendant_and_denies_sibling_region():
    with SessionLocal() as db:
        actor = db.get(User, "user-regional-apac")
        allowed = evaluate_access(
            db,
            actor,
            request(
                "plant",
                "org-plant-abc-manufacturing-001",
                "production.view",
                domain="production",
                module_key="production",
            ),
        )
        denied = evaluate_access(
            db,
            actor,
            request(
                "plant",
                "org-plant-europack-industries-001",
                "production.view",
                domain="production",
                module_key="production",
            ),
        )
        assert allowed.allowed is True
        assert denied.allowed is False
        assert denied.code == "no_effective_assignment"


def test_business_unit_scope_crosses_geography_but_not_other_business_unit():
    with SessionLocal() as db:
        actor = db.get(User, "user-bu-automotive")
        india = evaluate_access(
            db,
            actor,
            request("plant", "org-plant-abc-manufacturing-001", "quality.view", domain="quality", module_key="quality"),
        )
        united_states = evaluate_access(
            db,
            actor,
            request("plant", "org-plant-brittech-components-001", "quality.view", domain="quality", module_key="quality"),
        )
        industrial = evaluate_access(
            db,
            actor,
            request("plant", "org-plant-europack-industries-001", "quality.view", domain="quality", module_key="quality"),
        )
        assert india.allowed is True
        assert united_states.allowed is True
        assert industrial.allowed is False


def test_plant_and_frontline_assignments_do_not_escape_their_scope():
    with SessionLocal() as db:
        manager = db.get(User, "user-plant-manager-chennai")
        operator = db.get(User, "user-operator-shift-b")
        manager_other_plant = evaluate_access(
            db,
            manager,
            request("plant", "org-plant-europack-industries-001", "production.view", domain="operations", module_key="production"),
        )
        operator_team = evaluate_access(
            db,
            operator,
            request("team", "org-team-chennai-b4", "production.create", domain="production", module_key="production"),
        )
        operator_enterprise = evaluate_access(
            db,
            operator,
            request("enterprise", ENTERPRISE_ID, "dashboard.view"),
        )
        assert manager_other_plant.allowed is False
        assert operator_team.allowed is True
        assert operator_enterprise.allowed is False


def test_frontline_runtime_records_resolve_the_authorized_parent_data_boundary():
    headers = runtime_headers("shift.line4.supervisor@example-global.local")
    response = client.get("/runtime/records", params={"module_key": "quality"}, headers=headers)
    assert response.status_code == 200
    rows = response.json()["data"]
    assert all(row["module_key"] == "quality" for row in rows)
    assert all(row.get("plant_id") == "plant-abc-manufacturing-001" for row in rows)


def test_frontend_routes_win_only_for_browser_html_navigation():
    for path in [
        "/reports",
        "/quality",
        "/supplier-portal",
        "/workspace/dashboards/frontline",
        "/admin/company",
    ]:
        response = client.get(path, headers={"Accept": "text/html"})
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    api_response = client.get("/inventory/reports", headers={"Accept": "application/json"})
    assert api_response.status_code == 200
    assert "application/json" in api_response.headers["content-type"]


def test_read_only_and_expired_assignments_stop_mutations():
    assert is_effective("active", datetime.utcnow() - timedelta(days=2), datetime.utcnow() - timedelta(seconds=1)) is False
    with SessionLocal() as db:
        auditor = db.get(User, "user-temporary-auditor")
        denied = evaluate_access(
            db,
            auditor,
            request(
                "plant",
                "org-plant-abc-manufacturing-001",
                "quality.update",
                domain="quality",
                module_key="quality",
            ),
        )
        assert denied.allowed is False


def test_external_identity_is_limited_to_its_organization_records():
    with SessionLocal() as db:
        supplier = db.get(User, "user-external-supplier")
        own = evaluate_access(
            db,
            supplier,
            request(
                "enterprise",
                ENTERPRISE_ID,
                "dashboard.view",
                domain="procurement",
                module_key="supplier-portal",
                owner_id="external-org-external_supplier",
            ),
        )
        other = evaluate_access(
            db,
            supplier,
            request(
                "enterprise",
                ENTERPRISE_ID,
                "dashboard.view",
                domain="procurement",
                module_key="supplier-portal",
                owner_id="external-org-another-supplier",
            ),
        )
        assert own.allowed is True
        assert other.allowed is False


def test_portal_runtime_records_match_visible_role_navigation():
    admin_headers = runtime_headers("admin@metam.local", "ChangeMe123!")
    supplier_headers = runtime_headers("supplier.portal@example-global.local")
    customer_headers = runtime_headers("customer.portal@example-global.local")

    for module_key in ["customer-portal", "supplier-portal"]:
        response = client.get("/runtime/records", params={"module_key": module_key}, headers=admin_headers)
        assert response.status_code == 200

    supplier = client.get("/runtime/records", params={"module_key": "supplier-portal"}, headers=supplier_headers)
    customer = client.get("/runtime/records", params={"module_key": "customer-portal"}, headers=customer_headers)
    assert supplier.status_code == 200
    assert customer.status_code == 200


def test_platform_super_admin_requires_explicit_support_session():
    with SessionLocal() as db:
        actor = db.get(User, "user-super-001")
        db.query(SupportAccessSession).filter(
            SupportAccessSession.platform_user_id == actor.id,
            SupportAccessSession.enterprise_id == ENTERPRISE_ID,
        ).delete()
        db.commit()
        denied = evaluate_access(
            db,
            actor,
            request("enterprise", ENTERPRISE_ID, "dashboard.view"),
        )
        assert denied.allowed is False
        assert denied.code == "support_session_required"


def test_support_session_is_explicit_time_limited_and_revocable():
    headers = runtime_headers("super@metam.local", "SuperAdmin123!")
    created = client.post(
        "/support-access-sessions",
        headers=headers,
        json={
            "enterprise_id": ENTERPRISE_ID,
            "reason": "Investigate enterprise authorization regression",
            "duration_minutes": 15,
            "capabilities": ["dashboard.view", "organization.view", "support.impersonate"],
            "allowed_modules": ["quality"],
        },
    )
    assert created.status_code == 200
    session_id = created.json()["data"]["id"]
    access = client.get(
        f"/users/user-super-001/effective-access?enterprise_id={ENTERPRISE_ID}",
        headers=headers,
    )
    assert access.status_code == 200
    assert access.json()["data"]["compatibility_fallback"] is False
    assert "dashboard.view" in access.json()["data"]["capabilities"]

    revoked = client.delete(
        f"/support-access-sessions/{session_id}?reason=Verification%20complete",
        headers=headers,
    )
    assert revoked.status_code == 200


def test_role_generated_navigation_matches_frontline_and_regional_experience():
    frontline = client.get(
        f"/users/user-operator-shift-b/navigation?enterprise_id={ENTERPRISE_ID}",
        headers=runtime_headers("operator.shiftb@example-global.local"),
    )
    regional = client.get(
        f"/users/user-regional-apac/navigation?enterprise_id={ENTERPRISE_ID}",
        headers=runtime_headers("regional.apac@example-global.local"),
    )
    assert frontline.status_code == 200
    assert frontline.json()["data"]["experience"] == "frontline"
    assert "Enterprise Administration" not in frontline.json()["data"]["items"]
    assert regional.status_code == 200
    assert regional.json()["data"]["experience"] == "regional"


def test_sensitive_field_masking_hides_secrets_and_masks_personal_values():
    masked = mask_fields(
        {
            "name": "Asha Auditor",
            "email": "asha@example.com",
            "password_hash": "never-return-this",
            "department": "Quality",
        },
        masked_fields=["name", "email"],
        hidden_fields=["password_hash"],
    )
    assert masked["name"] == "As***or"
    assert masked["email"] == "as***om"
    assert "password_hash" not in masked
    assert masked["department"] == "Quality"


def test_special_data_classifications_are_not_treated_as_linear_clearance():
    with SessionLocal() as db:
        actor = db.get(User, "user-global-executive")
        denied = evaluate_access(
            db,
            actor,
            AuthorizationRequest(
                enterprise_id=ENTERPRISE_ID,
                scope_type="enterprise",
                scope_id=ENTERPRISE_ID,
                capability="reports.view",
                domain="analytics",
                data_classification="personal",
            ),
        )
        assert denied.allowed is False
        assert denied.code == "no_effective_assignment"


def test_cross_enterprise_context_is_safely_denied():
    with SessionLocal() as db:
        other = db.get(Enterprise, "enterprise-other-test")
        if not other:
            other = Enterprise(
                id="enterprise-other-test",
                tenant_id="tenant-other-test",
                name="Other Enterprise",
                code="OTHER-TEST",
                status="active",
                default_currency="USD",
                default_timezone="UTC",
            )
            db.add(other)
            db.commit()
        actor = db.get(User, "user-regional-apac")
        denied = evaluate_access(
            db,
            actor,
            AuthorizationRequest(
                enterprise_id=other.id,
                scope_type="enterprise",
                scope_id=other.id,
                capability="dashboard.view",
            ),
        )
        assert denied.allowed is False
        assert denied.code == "not_found"


def test_enterprise_assignment_without_descendants_does_not_list_child_scopes():
    with SessionLocal() as db:
        supplier = db.get(User, "user-external-supplier")
        assert available_scope_nodes(db, supplier, ENTERPRISE_ID) == []


def test_disabled_module_entitlement_blocks_an_otherwise_allowed_request():
    with SessionLocal() as db:
        actor = db.get(User, "user-global-quality")
        entitlement = (
            db.query(ModuleEntitlement)
            .filter(
                ModuleEntitlement.enterprise_id == ENTERPRISE_ID,
                ModuleEntitlement.module_key == "quality",
            )
            .one()
        )
        previous = entitlement.enabled
        entitlement.enabled = False
        db.flush()
        denied = evaluate_access(
            db,
            actor,
            request(
                "plant",
                "org-plant-abc-manufacturing-001",
                "quality.view",
                domain="quality",
                module_key="quality",
            ),
        )
        entitlement.enabled = previous
        db.commit()
        assert denied.allowed is False
        assert denied.code == "module_not_entitled"


def test_explicit_user_deny_overrides_role_allow():
    with SessionLocal() as db:
        actor = db.get(User, "user-global-quality")
        override = UserAccessOverride(
            id="test-override-global-quality",
            enterprise_id=ENTERPRISE_ID,
            user_id=actor.id,
            scope_type="plant",
            scope_id="org-plant-abc-manufacturing-001",
            capability="quality.view",
            effect="deny",
            reason="Test explicit deny precedence.",
        )
        db.merge(override)
        db.flush()
        denied = evaluate_access(
            db,
            actor,
            request(
                "plant",
                "org-plant-abc-manufacturing-001",
                "quality.view",
                domain="quality",
                module_key="quality",
            ),
        )
        db.query(UserAccessOverride).filter(UserAccessOverride.id == override.id).delete()
        db.commit()
        assert denied.allowed is False
        assert denied.code == "explicit_deny"


def test_cross_region_dashboard_url_is_denied_without_leaking_data():
    response = client.get(
        f"/enterprises/{ENTERPRISE_ID}/dashboard"
        "?scope_type=plant&scope_id=org-plant-europack-industries-001",
        headers=runtime_headers("regional.apac@example-global.local"),
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "no_effective_assignment"


def test_time_bound_assignment_creates_governed_temporary_access_record():
    headers = runtime_headers("enterprise.owner@example-global.local")
    valid_until = (datetime.utcnow() + timedelta(days=2)).isoformat()
    created = client.post(
        "/users/user-operator-shift-b/role-assignments",
        headers=headers,
        json={
            "enterprise_id": ENTERPRISE_ID,
            "role_template_id": "role-template-quality_inspector",
            "scope_type": "team",
            "scope_id": "org-team-chennai-b4",
            "include_descendants": False,
            "domains": ["quality"],
            "allowed_modules": ["quality"],
            "allowed_classifications": ["public", "internal"],
            "record_ownership": "scope",
            "valid_until": valid_until,
            "reason": "Temporary quality coverage during scheduled leave.",
        },
    )
    assert created.status_code == 200
    assignment_id = created.json()["data"]["id"]
    with SessionLocal() as db:
        grant = (
            db.query(TemporaryAccessGrant)
            .filter(TemporaryAccessGrant.assignment_id == assignment_id)
            .one()
        )
        assert grant.valid_until.isoformat() == valid_until
    revoked = client.delete(
        f"/users/user-operator-shift-b/role-assignments/{assignment_id}"
        "?reason=Temporary%20coverage%20test%20complete",
        headers=headers,
    )
    assert revoked.status_code == 200
