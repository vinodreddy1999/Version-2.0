# Security Posture Review — 2026-08-19

## Purpose

This review maps the platform's current security posture against the enterprise security-tooling stack below, and records what was actually tested today (not just what's configured), because that's what an auditor or enterprise customer will ask to see evidence of.

| Tool | Covers | Status after this review |
|---|---|---|
| GitHub Advanced Security (CodeQL, secret scanning) | PR-level static analysis, secret scanning | CodeQL workflow added (`.github/workflows/codeql.yml`), runs on push/PR/weekly. Secret scanning is a repo Settings toggle, not a workflow file — **needs to be turned on in GitHub Settings → Code security and analysis**; if this repo is private, native GHAS scanning also requires GitHub Advanced Security to be licensed for the repo. |
| Snyk Enterprise | Dependency, container, IaC vulnerabilities | Not provisioned (paid product, needs an account). Ran the open-source equivalents instead: `pip-audit` (Python), `npm audit` (frontend). Real, current findings below — see [Dependency Vulnerabilities](#dependency-vulnerabilities). Dependabot config added (`.github/dependabot.yml`) for ongoing coverage. |
| SonarQube Enterprise | Code quality/maintainability gates | Not provisioned. Ran ESLint (frontend) and `bandit` (Python security linter) as the available equivalents — see [Static Analysis](#static-analysis-sast). |
| Orca Security | Cloud/Kubernetes/IaC security | Not provisioned. Ran `checkov` against the Dockerfiles and Kubernetes/Helm manifests — see [Infrastructure-as-Code](#infrastructure-as-code). |
| Burp Suite Enterprise | Runtime DAST | Not provisioned. Ran a manual runtime probe against the live app (auth headers, CORS, error handling, and — critically — a live exploit attempt) — see [Runtime Testing](#runtime-testing-dast-style). |
| Annual independent penetration test | Manual, adversarial, third-party | Cannot be replicated by an automated session — this requires a licensed firm and human testers. What's below is a best-effort automated/scripted pass, not a substitute. |

**Bottom line up front:** the critical finding below (hardcoded JWT secrets → full auth bypass) was proven exploitable against the running application and has since been fixed and re-verified the same day — see [Critical Finding](#critical-finding-hardcoded-jwt-secrets--full-authentication-bypass). All dependency vulnerabilities, Dockerfile/Kubernetes hardening gaps, and one more real credential issue found along the way have also been fixed — see [What Changed Today](#what-changed-today) for the full list, and [What Still Needs a Human Decision](#what-still-needs-a-human-decision) for what's left.

---

## Critical Finding: Hardcoded JWT Secrets → Full Authentication Bypass

**Severity: Critical. Proven exploitable — fixed the same day, see [Fix Applied](#fix-applied) below.**

Static analysis (`bandit`) found three independent, hardcoded JWT signing secrets checked into source control:

| File | Secret |
|---|---|
| `app/security.py:10` | `JWT_SECRET = "local-development-secret"` — **this is the one actually used by the live auth endpoints** (`app/runtime_router.py` imports `JWT_SECRET` from here) |
| `app/main.py:57` | `JWT_SECRET = "local-python-demo-secret"` |
| `app/modules/customer_portal_service.py:12` | `PORTAL_JWT_SECRET = "local-customer-portal-secret"` |

### Proof of exploitability

Using the guessed secret from `app/security.py`, a forged JWT was signed locally (no login, no credentials) and sent to the running server:

```python
from jose import jwt
forged = jwt.encode({
    "sub": "user-admin-001", "tenant_id": "tenant-demo-001",
    "permissions": ["platform.admin"], "demo_read_only": False,
    "iat": ..., "exp": ...,
}, "local-development-secret", algorithm="HS256")
```

```
curl http://127.0.0.1:8000/runtime/auth/me -H "Authorization: Bearer <forged>"
→ HTTP 200
→ {"id":"user-admin-001", "role":"admin", "permissions":["platform.admin","users.manage","data.write",...], "demo_read_only":false, ...}
```

The server accepted the forged token as a fully authenticated `admin` session with write permissions and `demo_read_only: false` — bypassing both login and the read-only demo restriction entirely. Anyone who reads this repository's source (or brute-forces these short, guessable strings) can mint a valid admin session with no credentials.

While investigating this, the same pattern was found in two more files bandit's `hardcoded_password_string` check didn't catch (it only flags variable names containing "password"/"pwd", not "secret"): `app/modules/mobile_service.py` (`MOBILE_JWT_SECRET = "local-mobile-secret"`) and `app/modules/supplier_portal_service.py` (`SUPPLIER_PORTAL_JWT_SECRET = "local-supplier-portal-secret"`) — five hardcoded JWT secrets total across the codebase.

### Fix Applied

Added `resolve_jwt_secret()` in `app/security.py`: reads the secret from an environment variable, and if unset, generates a random per-process secret (via `secrets.token_urlsafe(32)`) with a logged warning — never a fixed, source-visible literal. Applied to all five secrets:

| File | Variable | Env var |
|---|---|---|
| `app/security.py` | `JWT_SECRET` | `JWT_SECRET` |
| `app/main.py` | `JWT_SECRET` (legacy `/auth/login` path) | `LEGACY_JWT_SECRET` |
| `app/modules/customer_portal_service.py` | `PORTAL_JWT_SECRET` | `PORTAL_JWT_SECRET` |
| `app/modules/mobile_service.py` | `MOBILE_JWT_SECRET` | `MOBILE_JWT_SECRET` |
| `app/modules/supplier_portal_service.py` | `SUPPLIER_PORTAL_JWT_SECRET` | `SUPPLIER_PORTAL_JWT_SECRET` |

Documented in `.env.example` and wired into `docker-compose.yml` (`platform-api` and `fullstack-app` services) so a real deployment can set them explicitly.

**Verified live**: restarted the running server with no `JWT_SECRET` set (so it fell back to a random per-process secret), re-sent the exact same forged token that previously returned `200` with a full admin session — it now returns `401 {"detail":"Invalid token"}`. Confirmed legitimate `demo-login` still issues working tokens. Full 11-role regression crawl afterward: zero failures, same baseline as before the fix.

### Remaining recommendation

- Set `JWT_SECRET`/`LEGACY_JWT_SECRET`/`PORTAL_JWT_SECRET`/`MOBILE_JWT_SECRET`/`SUPPLIER_PORTAL_JWT_SECRET` explicitly (e.g. via `secrets.token_urlsafe(32)`) for any shared, staging, or production deployment — the random per-process fallback means sessions won't survive restarts and won't agree across multiple instances until these are set.
- Consider consolidating to fewer independent JWT signing paths where the separation isn't load-bearing; five parallel secrets is itself a maintenance/consistency risk, independent of how each is sourced.

---

## Dependency Vulnerabilities

**Status: fixed.** Both sides upgraded and re-verified; see [Fixes Applied — 2026-08-19 follow-up](#fixes-applied--2026-08-19-follow-up).

### Backend (`pip-audit` against `requirements.txt`) — as found

22 known vulnerabilities across 5 packages, all with fixes available except one:

| Package | Version | Vulnerabilities | Fix |
|---|---|---|---|
| `starlette` | 0.41.3 | 9 (host-header URL reconstruction, quadratic-time `Range` header DoS, SSRF via UNC path on Windows, HTTP method handler bypass, form-parsing limits not enforced pre-1.3.1) | Needs ≥1.0.1–1.3.1 depending on CVE, but **pinned below that by `fastapi==0.115.6`'s `starlette<0.42.0` constraint** — upgrading `starlette` alone will break the app; requires a coordinated `fastapi` + `starlette` upgrade |
| `python-multipart` | 0.0.20 | 6 (path traversal via `UPLOAD_DIR`, several DoS parsing large/malformed multipart bodies) | ≥0.0.31 |
| `python-jose` | 3.3.0 | 5 (JWT "bomb" DoS via compressed JWE, ECDSA/OpenSSH algorithm-confusion) | ≥3.4.0 |
| `ecdsa` | 0.19.2 | 1 (Minerva timing side-channel on P-256) | No fix available — maintainers consider timing side-channels out of scope; consider whether `ecdsa` is a hard dependency or can be dropped |
| `pytest` | 8.3.4 | 1 (predictable `/tmp/pytest-of-{user}` path, local privilege/DoS) | ≥9.0.3 — dev-only dependency, lower real-world priority |

### Frontend (`npm audit`) — as found

7 vulnerabilities (6 high, 1 moderate), all with a fix available via `npm audit fix`:

| Package | Severity | Issue |
|---|---|---|
| `axios` | High | Recursive `formDataToJSON`/`formToJSON` → DoS |
| `brace-expansion` | High | Exponential-time `{}` expansion → DoS |
| `js-yaml` | High | Quadratic-time YAML merge-key/`!!omap` parsing → DoS |
| `nanoid` | High | Non-secure generators loop indefinitely on size ≤ 0 |
| `postcss` | High | Path traversal via `sourceMappingURL` when `from` is unset → arbitrary `.map` file disclosure |
| `react-router` | High | Open redirect via backslash in `<Link>`/`useNavigate`; missing protocol validation in `RSCErrorHandler` (XSS) |
| `react-router-dom` | Moderate | Inherited from `react-router` |

---

## Static Analysis (SAST)

### Backend — `bandit`

34 findings, all bandit-rated LOW, but some are more significant in context than the raw severity suggests:

- **The 5 hardcoded JWT secrets** — see [Critical Finding](#critical-finding-hardcoded-jwt-secrets--full-authentication-bypass) above; bandit rates these LOW by default heuristic, but the live exploit proves real severity is Critical. **Fixed.**
- `app/store.py:41` — a default admin account (`admin@metam.local`) with a hardcoded plaintext password (`ChangeMe123!`) in source. Investigated: this in-memory `DemoStore.users` dict is never read by any live authentication path (confirmed by randomizing it and re-running the full test suite — all 81 tests still pass). **Fixed** — randomized regardless, since dead code today shouldn't stay one accidental wiring-away from being a real hardcoded credential.
- The remaining ~29 findings are demo/seed data (customer portal seed users, integration credential *references* like `vault://cred-demo-erp` that are already correctly externalized) — reviewed individually, not real secrets.

### Related finding, not caught by bandit: `platform_seed.py`'s demo account passwords

While tracing whether `store.py`'s password was reachable, found the actual live equivalent: `app/platform_seed.py` seeds **~42 real database accounts** (12 base demo roles, plus 6 role templates × 5 seeded companies) with hardcoded, predictable passwords — e.g. `admin@metam.local` / `ChangeMe123!`. Proven live: `POST /auth/login` with that exact email/password returned a real `200` with a working admin session.

**Decision: intentionally left as-is.** Unlike the JWT secrets, this isn't a boundary bypass — these are the platform's own documented demo accounts (`docs/passwordless-role-demo.md` describes real password login as a supported, intentional feature alongside the passwordless flow), the data behind them is entirely fictional, and 81 backend tests hardcode these exact credentials. Reviewed with the team and confirmed: keep as published, known demo credentials for a demo application. Revisit if this codebase is ever used as a base for a deployment handling real customer data — at that point these should follow the same env-var-with-random-fallback pattern used for the JWT secrets.

### Frontend — ESLint

Clean: 0 errors, 0 warnings across all 81 linted files.

### CodeQL / broader multi-language SAST

Not run in this session — `semgrep`'s rule registry (`semgrep.dev`) is not reachable from this sandbox's network policy. The CodeQL workflow added today (see below) will provide this coverage on GitHub's infrastructure once merged and enabled.

---

## Infrastructure-as-Code

**Status: fixed** (Dockerfiles and Kubernetes manifests); compose secret finding still open — see below.

### `checkov` — Dockerfiles — as found → after fix

182 passed, 6 failed across the 3 Dockerfiles (root, `frontend/`, `inventory-ai-service/`): none set a `HEALTHCHECK`, none created/switched to a non-root `USER`.

**Fixed:** all three now run as a dedicated non-root user (root and `inventory-ai-service` Dockerfiles use an explicit high UID `10001`; the frontend's nginx image uses its built-in unprivileged `nginx` user with its cache/pid directories re-owned accordingly) and declare a `HEALTHCHECK` against each service's `/health` endpoint. `checkov`: **225/225 passing** (up from 182/188).

Also found and fixed a functional bug while here: `docker-compose.yml`'s healthchecks for `platform-api` and `fullstack-app` pointed at `/ready`, an endpoint that doesn't exist anywhere in the app (only `/health` does) — those healthchecks would have failed permanently in any real deployment. Repointed both to `/health`.

### `checkov` — Kubernetes manifests (`deploy/kubernetes/`) — as found → after fix

73 passed, 23 failed, concentrated in `deployment.yaml`: no resource requests/limits, no `securityContext` (root-capable, privilege escalation not disabled, no seccomp, no read-only rootfs), service account tokens auto-mounted unnecessarily, no `NetworkPolicy`, everything in the default namespace. The deployment's own `readinessProbe`/`livenessProbe` had the same `/ready`/`/live` bug as the compose healthchecks.

**Fixed:** added a `metam` namespace (`namespace.yaml`) referenced by every manifest; CPU/memory requests and limits; a full pod+container `securityContext` (`runAsNonRoot`, UID/GID `10001`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` with `emptyDir` mounts for `/data` and `/tmp`, all capabilities dropped, `seccompProfile: RuntimeDefault`); `automountServiceAccountToken: false`; `imagePullPolicy: Always`; a baseline `NetworkPolicy` (`networkpolicy.yaml`) restricting ingress to the app's port and egress to DNS/Postgres/Redis/HTTPS; and repointed both probes to `/health`. `checkov`: **94/96 passing** (up from 73/96).

The remaining 2 failures need infrastructure this session doesn't have access to, not more YAML: `CKV_K8S_43` (pin the image by digest) needs a real registry-pushed build to compute a digest against; `CKV_K8S_35` (secrets as mounted files instead of env vars) would need application-level changes to how the app reads its config, which isn't safe to do blind without a real cluster to validate against — flagging both for whoever owns the CI/CD pipeline and cluster.

**Note:** the `NetworkPolicy` is a conservative starting point based on reading the manifests, not validated against a real cluster (no Kubernetes cluster available in this environment) — confirm it against your actual ingress controller and database topology before applying.

### Secrets in IaC/compose files

- `deploy/kubernetes/secret.example.yaml` — filename correctly marks it as a template (`change-this-in-production` placeholder), not a real leaked secret. Now also includes the 5 new JWT secret env vars for completeness. Low risk, but worth a README pointer reminding whoever applies it to actually change every value.
- `inventory-ai-service/docker-compose.yml:16` — **`POSTGRES_PASSWORD: inventory_ai`**, a real hardcoded weak credential (same as the username), not marked as a template. Unlike the root `docker-compose.yml` (which sources `POSTGRES_PASSWORD` from `${POSTGRES_PASSWORD:-metam}`), this service's compose file hardcoded the value directly with no way to override it. **Fixed** — parameterized as `${INVENTORY_AI_POSTGRES_PASSWORD:-inventory_ai}` (and the matching user/db vars), matching the root compose file's exact convention: a simple default for zero-config local dev, overridable via env var for anything shared.

---

## Runtime Testing (DAST-style)

Tested against the live running app (`127.0.0.1:8000` backend, `127.0.0.1:5173` frontend):

| Check | Result |
|---|---|
| Security headers | Good: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` set. **Missing: `Content-Security-Policy`** — no CSP header on any response. |
| CORS | Well-scoped: disallowed origins get no `Access-Control-Allow-Origin` echoed back (browser blocks); allowed dev origins work correctly. `access-control-allow-credentials: true` is paired with an explicit origin allowlist (not a wildcard), which is the correct pattern. |
| Unauthenticated access to protected endpoint | Correctly rejected with a clean `401` and no information leakage. |
| Malformed JSON body | Clean `422` with a structured Pydantic validation error, no stack trace or internal path disclosure. |
| `/docs`, `/openapi.json` | Both publicly exposed (`200`), unauthenticated. Standard FastAPI default — not a vulnerability by itself, but hands an unauthenticated attacker a complete map of the API surface. Consider gating behind auth or disabling in non-dev environments. |
| **Forged-JWT authentication bypass** | **Exploited successfully — see [Critical Finding](#critical-finding-hardcoded-jwt-secrets--full-authentication-bypass).** |

---

## What Changed Today

- `.github/workflows/codeql.yml` — CodeQL analysis for Python and JavaScript/TypeScript, on push/PR to `main` and weekly.
- `.github/dependabot.yml` — automated dependency update PRs for pip (root + `inventory-ai-service`), npm (`frontend`), GitHub Actions, and Docker base images across all three Dockerfiles.
- **Fixed the critical hardcoded JWT secrets** (all five) — see [Fix Applied](#fix-applied) above. Verified the previously-working exploit is now blocked, with no regressions.
- **Fixed `app/store.py`'s hardcoded password** (confirmed dead code; randomized anyway).
- **Fixed all frontend dependency vulnerabilities** (`npm audit fix`, 7/7, zero regressions).
- **Fixed all fixable backend dependency vulnerabilities** — coordinated `fastapi` 0.115.6→0.141.1 upgrade pulling in `starlette` 1.6.0, `python-jose` 3.5.0, `python-multipart` 0.0.32, `pytest` 9.1.1. `pip-audit` clean except `ecdsa` (no fix exists upstream). 81/81 backend tests pass; full 11-role live regression crawl clean.
- **Hardened all 3 Dockerfiles** (non-root user, `HEALTHCHECK`) — checkov 182/188 → 225/225.
- **Hardened the Kubernetes manifests** (namespace, resource limits, full `securityContext`, `NetworkPolicy`, disabled auto-mounted service account tokens) — checkov 73/96 → 94/96 (2 remaining need real registry/cluster access this session doesn't have).
- **Fixed a real bug found along the way**: `docker-compose.yml` healthchecks and the Kubernetes deployment's readiness/liveness probes all pointed at `/ready`/`/live` endpoints that don't exist anywhere in the app — repointed to the real `/health` endpoint.
- **Fixed `inventory-ai-service/docker-compose.yml`'s hardcoded DB password** — parameterized via env var, matching the root compose file's existing convention.
- **Reviewed and intentionally left as-is**: `platform_seed.py`'s ~42 demo account passwords (see [Static Analysis](#related-finding-not-caught-by-bandit-platform_seedpys-demo-account-passwords) above) — a deliberate decision, not an oversight.

## What Still Needs a Human Decision

1. Set real values for `JWT_SECRET`/`LEGACY_JWT_SECRET`/`PORTAL_JWT_SECRET`/`MOBILE_JWT_SECRET`/`SUPPLIER_PORTAL_JWT_SECRET` in any shared, staging, or production environment.
2. Enable GitHub secret scanning in repo Settings (and confirm GHAS licensing if this repo is private).
3. Decide on and provision the paid tools (Snyk Enterprise, SonarQube Enterprise, Orca Security, Burp Suite Enterprise) if the enterprise-tier coverage (contract scanning cadence, compliance reporting, vendor SLAs) is actually required for your customers/auditors, versus the open-source equivalents run today.
4. Commission the annual independent penetration test — this is a vendor/scheduling decision, not something automatable.
5. Add a `Content-Security-Policy` header (flagged in [Runtime Testing](#runtime-testing-dast-style), not yet fixed).
6. Consider gating or disabling `/docs`/`/openapi.json` outside dev environments (flagged, not yet fixed).
7. Pin the Kubernetes deployment's image by digest and consider secrets-as-mounted-files once a real CI/CD pipeline and cluster are available to validate against.
8. Validate the new `NetworkPolicy` against your actual cluster topology before applying — it was written by reading the manifests, not tested against a live cluster.
9. If this codebase is ever extended to handle real customer data, revisit the `platform_seed.py` demo password decision above.
