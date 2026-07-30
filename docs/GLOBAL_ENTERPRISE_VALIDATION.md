# Global Enterprise Validation

## Automated results

Validated on 30 July 2026.

| Layer | Command | Result |
|---|---|---|
| Backend enterprise tests | `pytest -q tests/test_enterprise_access.py` | 17 passed |
| Full backend regression | `pytest -q` | 98 passed |
| Frontend architecture | `npm run test:v2` | Passed |
| Frontend lint | `npm run lint` | Passed |
| TypeScript/build | `npm run build` | Passed |
| Full-stack Docker build | `docker build ...` | Passed |

The Python suite currently emits deprecation warnings from `datetime.utcnow`,
Passlib `crypt`, and SQLAlchemy callable defaults. They are non-failing
technical debt and are listed for follow-up.

The final `2.0.0-beta.9` full-stack image was also tested independently with
the repository test directory mounted read-only. It completed all 98 tests in
56.10 seconds.

## Deployed stack verification

The Version 2 stack was deployed alongside Version 1 without replacing or
stopping the existing containers.

| Service | Address | Verification |
|---|---|---|
| Full-stack application | `http://localhost:18080` | Healthy; SPA root returned 200 |
| Enterprise administration route | `http://localhost:18080/admin/enterprise` | Returned the SPA shell with status 200 |
| Platform API | `http://localhost:18000` | Healthy; `/health` returned `status: ok` |
| Standalone frontend | `http://localhost:18081` | Running |
| PostgreSQL | `localhost:55432` | Healthy |
| Redis | `localhost:56379` | Healthy |

Live seeded PostgreSQL verification produced:

- 59 hierarchy nodes and 74 multi-dimensional relationships;
- 17 role-generated navigation items for the enterprise owner;
- 175,269 scoped dashboard records across 18 modules;
- a `403 support_session_required` denial when the platform super admin tried
  to read customer records without an active support session.

The enterprise seed job completed successfully and reported 405 newly created
scenario records, 130 active users, 6 disabled users, and more than 170,000
records for the Vinod test company.

## Security matrix

| Scenario | Expected |
|---|---|
| Platform admin reads customer records without support session | Denied with `support_session_required` |
| Enterprise owner reads own enterprise descendants | Allowed |
| Enterprise owner targets another enterprise | Safe denial |
| APAC regional director reads APAC plant | Allowed |
| APAC regional director reads EMEA plant | Denied |
| Automotive business director reads India and US automotive plants | Allowed |
| Automotive business director reads industrial plant | Denied |
| Plant manager reads unrelated plant | Denied |
| Frontline operator enumerates all enterprise scopes | Denied; assigned scope only |
| Expired assignment | Denied automatically |
| Read-only auditor mutates data | Denied |
| Auditor reads personal field | Allowed only if assigned and masked |
| Explicit user deny conflicts with role allow | Deny wins |
| Module disabled at enterprise | Module API denied |
| Supplier reads another supplier's record | Denied by ownership |
| Direct cross-region dashboard URL | Denied without leaked data |
| Time-limited assignment created | Temporary-access grant created and audited |
| Support session revoked | Access stops and revocation is audited |

## Frontend matrix

The static architecture gate verifies:

- canonical lazy dashboard route;
- lazy dashboard component loading;
- client and enterprise scope in query/cache behavior;
- cancellation and removal of stale scoped queries;
- role-generated enterprise navigation;
- protected enterprise administration route;
- permitted-scope search;
- parallel hierarchy dimensions;
- permission explanation UI.

## Manual verification

1. Open `http://localhost:18080`.
2. Log in as `enterprise.owner@example-global.local` using the seeded
   development password.
3. Open Enterprise Administration.
4. Verify geography, business, legal, and operational nodes.
5. Assign a user to APAC with descendants and a future expiry.
6. Open Effective Access and explain `quality.view`.
7. Switch to APAC, then India, then a plant and confirm old data disappears
   before the next scoped response renders.
8. Log in as the APAC regional director and confirm EMEA is not available.
9. Log in as the business-unit director and confirm cross-country assigned
   plants are available.
10. Log in as the frontline operator and confirm the simplified work
    navigation.
11. Log in as the platform administrator and confirm customer records require
    a support session.
12. Start and revoke a support session; confirm the acting-as indicator and
    audit entries.

## Remaining risk

- Browser automation should be rerun after every visual redesign because the
  architecture test checks contracts, not pixel layout.
- Unit/currency conversion in compare mode needs governed master data before
  mixing non-normalized operational measures.
- Application-enforced row scoping should eventually be complemented by
  PostgreSQL row-level security for defense in depth.
