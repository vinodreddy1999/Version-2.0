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

**Bottom line up front:** one finding below is exploitable *today* against the running application and should be treated as the top priority — see [Critical Finding](#critical-finding-hardcoded-jwt-secrets--full-authentication-bypass).

---

## Critical Finding: Hardcoded JWT Secrets → Full Authentication Bypass

**Severity: Critical. Proven exploitable, not theoretical.**

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

### Recommendation

- Require `JWT_SECRET` (and `PORTAL_JWT_SECRET`) from an environment variable with no hardcoded fallback; fail fast at startup if unset in any non-local-dev mode.
- Rotate the secret before any real deployment — every token signed under the current secret is forgeable.
- Consolidate to a single JWT secret/signing path where reasonable; three independent secrets across the codebase is itself a maintenance/consistency risk.
- This is a contained, mechanical fix. Flagging for an explicit decision before touching auth code — happy to implement on request.

---

## Dependency Vulnerabilities

### Backend (`pip-audit` against `requirements.txt`)

22 known vulnerabilities across 5 packages, all with fixes available except one:

| Package | Version | Vulnerabilities | Fix |
|---|---|---|---|
| `starlette` | 0.41.3 | 9 (host-header URL reconstruction, quadratic-time `Range` header DoS, SSRF via UNC path on Windows, HTTP method handler bypass, form-parsing limits not enforced pre-1.3.1) | Needs ≥1.0.1–1.3.1 depending on CVE, but **pinned below that by `fastapi==0.115.6`'s `starlette<0.42.0` constraint** — upgrading `starlette` alone will break the app; requires a coordinated `fastapi` + `starlette` upgrade |
| `python-multipart` | 0.0.20 | 6 (path traversal via `UPLOAD_DIR`, several DoS parsing large/malformed multipart bodies) | ≥0.0.31 |
| `python-jose` | 3.3.0 | 5 (JWT "bomb" DoS via compressed JWE, ECDSA/OpenSSH algorithm-confusion) | ≥3.4.0 |
| `ecdsa` | 0.19.2 | 1 (Minerva timing side-channel on P-256) | No fix available — maintainers consider timing side-channels out of scope; consider whether `ecdsa` is a hard dependency or can be dropped |
| `pytest` | 8.3.4 | 1 (predictable `/tmp/pytest-of-{user}` path, local privilege/DoS) | ≥9.0.3 — dev-only dependency, lower real-world priority |

### Frontend (`npm audit`)

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

**Recommendation:** run `npm audit fix` in `frontend/` (all fixes are available, no breaking major-version jumps reported); coordinate the backend `fastapi`/`starlette` upgrade as a single deliberate change and re-test.

---

## Static Analysis (SAST)

### Backend — `bandit`

34 findings, all bandit-rated LOW, but two are more significant in context than the raw severity suggests:

- **The 3 hardcoded JWT secrets** — see [Critical Finding](#critical-finding-hardcoded-jwt-secrets--full-authentication-bypass) above; bandit rates these LOW by default heuristic, but the live exploit proves real severity is Critical.
- `app/store.py:41` — a default admin account (`admin@metam.local`) with a hardcoded plaintext password (`ChangeMe123!`) in source. Worth confirming this in-memory store isn't reachable in any real deployment path, and isn't left as a real default credential.
- The remaining ~29 findings are demo/seed data (customer portal seed users, integration credential *references* like `vault://cred-demo-erp` that are already correctly externalized) — reviewed individually, not real secrets.

### Frontend — ESLint

Clean: 0 errors, 0 warnings across all 81 linted files.

### CodeQL / broader multi-language SAST

Not run in this session — `semgrep`'s rule registry (`semgrep.dev`) is not reachable from this sandbox's network policy. The CodeQL workflow added today (see below) will provide this coverage on GitHub's infrastructure once merged and enabled.

---

## Infrastructure-as-Code

### `checkov` — Dockerfiles

182 passed, 6 failed across the 3 Dockerfiles (root, `frontend/`, `inventory-ai-service/`):

- None of the three set a `HEALTHCHECK`.
- None of the three create/switch to a non-root `USER` — all three containers run as root by default.

### `checkov` — Kubernetes manifests (`deploy/kubernetes/`)

73 passed, 23 failed, concentrated in `deployment.yaml`:

- No CPU/memory requests or limits set.
- No `securityContext` at pod or container level — containers can run as root, with privilege escalation not explicitly disabled, no seccomp profile, no read-only root filesystem.
- Service account tokens are auto-mounted even though the deployment doesn't appear to need the Kubernetes API.
- No `NetworkPolicy` restricting pod-to-pod traffic.
- All manifests use the default namespace.

### Secrets in IaC/compose files

- `deploy/kubernetes/secret.example.yaml` — filename correctly marks it as a template (`change-this-in-production` placeholder), not a real leaked secret. Low risk, but worth a comment/README pointer reminding whoever applies it to actually change the value.
- `inventory-ai-service/docker-compose.yml:16` — **`POSTGRES_PASSWORD: inventory_ai`**, a real hardcoded weak credential (same as the username), not marked as a template. Unlike the root `docker-compose.yml` (which sources `POSTGRES_PASSWORD` from `.env`/`.env.example`), this service's compose file hardcodes a guessable password directly. Low risk if genuinely local-only, but the pattern is inconsistent with the rest of the repo and easy to accidentally carry into a shared environment.

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

## What Still Needs a Human Decision

1. **Fix the hardcoded JWT secrets** (critical, contained fix — flagged, not yet applied).
2. Enable GitHub secret scanning in repo Settings (and confirm GHAS licensing if this repo is private).
3. Decide on and provision the paid tools (Snyk Enterprise, SonarQube Enterprise, Orca Security, Burp Suite Enterprise) if the enterprise-tier coverage (contract scanning cadence, compliance reporting, vendor SLAs) is actually required for your customers/auditors, versus the open-source equivalents run today.
4. Commission the annual independent penetration test — this is a vendor/scheduling decision, not something automatable.
5. Run `npm audit fix` and plan the coordinated `fastapi`/`starlette` upgrade.
6. Harden the Kubernetes deployment (resource limits, security context, non-root containers, NetworkPolicy) and add `USER`/`HEALTHCHECK` to the Dockerfiles.
