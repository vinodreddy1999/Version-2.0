# Global Enterprise Migration and Rollback

## Migration

Migration `0002_global_enterprise_access` is additive and follows
`0001_platform_foundation`.

It creates the enterprise, hierarchy, role assignment, entitlement,
classification, temporary access, support access, bookmark, and enterprise
audit tables. It does not delete or rename tenant, company, plant, department,
user, permission, feature flag, module record, or existing audit tables.

## Existing-data mapping

On application seed:

1. The existing tenant becomes the enterprise boundary.
2. Existing companies become legal-entity nodes.
3. Existing plants become plant nodes.
4. Existing departments become operational department nodes.
5. Geography, business, and legal edges are generated independently.
6. Existing company module flags initialize enterprise entitlements.
7. Existing users receive memberships.
8. Existing roles map to explicit compatibility templates and scoped
   assignments.
9. No legacy platform administrator is granted automatic customer-data access.

`SessionLocal` uses `autoflush=False`; `seed_platform` explicitly flushes the
legacy records before hierarchy linking. This is required for deterministic
first-run migration.

## Apply

Back up PostgreSQL before production migration.

```bash
docker compose exec postgres pg_dump -U metam -d metam_v2 -Fc -f /tmp/metam_v2_before_enterprise.dump
docker compose run --rm platform-api alembic upgrade head
docker compose up -d
```

Validate:

```bash
docker compose exec platform-api alembic current
curl http://localhost:18000/ready
curl http://localhost:18080/ready
```

Log in as the seeded enterprise owner and verify `/admin/enterprise`. Then
verify one regional, business-unit, plant, frontline, auditor, supplier, and
customer account.

## Rollback

Stop application writers before schema rollback.

```bash
docker compose stop fullstack-app platform-api worker vinod-live-data-stream
docker compose run --rm platform-api alembic downgrade 0001_platform_foundation
docker compose up -d
```

The downgrade drops only tables created by `0002_global_enterprise_access` in
reverse dependency order. Existing Version 2 tenant/company/plant/user/module
data remains.

If enterprise administration has been used in production, export enterprise
tables or restore the pre-migration database backup before rollback because
scoped role assignments and hierarchy changes exist only in the new tables.

## Operational rollback

The Docker image can be returned to the prior tag without deleting volumes:

```bash
METAM_V2_IMAGE_TAG=2.0.0-beta.8 docker compose up -d
```

Do not run `docker compose down -v` unless all Version 2 PostgreSQL and pgAdmin
data should be destroyed.

## Migration cautions

- Do not map `platform_super_admin` to `enterprise_global_owner`.
- Do not assign all descendants during migration unless existing semantics
  require it and the assignment is reviewed.
- Do not create a global auditor assignment.
- Confirm each old `client` field means tenant, legal entity, or company before
  changing any contract.
- Re-run seed safely after adding legacy plants or companies; stale generated
  relationships are deactivated and desired edges are reactivated.

