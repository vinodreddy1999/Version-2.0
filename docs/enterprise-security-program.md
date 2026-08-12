# Enterprise Security Program

This document defines the security controls expected for the Metam Services Version 2 platform repository. It separates controls that are already implemented in code from controls that must be enabled in vendor platforms.

## Control Map

| Layer | Tool | Purpose | Repository Status | External Setup Required |
| --- | --- | --- | --- | --- |
| PR security | GitHub Advanced Security | CodeQL, secret scanning, dependency review, pull request findings | CodeQL and dependency review workflows added | Enable Advanced Security, secret scanning, and push protection in GitHub settings |
| Dependency and container security | Snyk Enterprise | SCA, container, Dockerfile, Compose, and IaC remediation | Dependencies pinned and audit-clean locally | Add Snyk organization, token, project import, and policy gates |
| Code quality | SonarQube Enterprise | Maintainability, bugs, coverage, duplicated code, quality gates | No token-dependent workflow committed | Add `SONAR_TOKEN`, `SONAR_HOST_URL`, and quality gate policy |
| Cloud and IaC posture | Orca Security | Cloud, Kubernetes, image, and Infrastructure-as-Code risk | Docker and Compose files available for scanning | Connect cloud accounts, container registry, and repository integration |
| Runtime web testing | Burp Suite Enterprise | Authenticated DAST scanning for web routes and APIs | Routes can be scanned through staging | Configure staging URL, test users, scan profile, and exclusions |
| Independent assurance | Annual penetration test | External validation for enterprise customers and auditors | Recommended control documented | Contract third party and retain final report/remediation evidence |

## GitHub Advanced Security

Enable these repository settings:

1. Code scanning.
2. Secret scanning.
3. Push protection.
4. Dependency graph.
5. Dependabot alerts.
6. Dependabot security updates.

The repository includes:

- `.github/workflows/codeql.yml`
- `.github/workflows/dependency-review.yml`
- `.github/dependabot.yml`

Expected PR gate:

- CodeQL must complete without critical or high findings.
- Dependency review must block high severity vulnerable dependency changes.
- Any detected secret must be revoked, rotated, and removed from history if exposed.

## Snyk Enterprise

Recommended Snyk projects:

- Python backend dependencies from `requirements.txt`
- Inventory AI service dependencies from `inventory-ai-service/requirements.txt`
- Frontend dependencies from `frontend/package-lock.json`
- Docker image from `Dockerfile`
- Docker Compose and deployment configuration

Required secrets:

- `SNYK_TOKEN`
- Snyk organization ID or slug

Policy:

- Block critical vulnerabilities.
- Block high vulnerabilities when a fix is available.
- Require explicit risk acceptance for unfixed high vulnerabilities.
- Scan containers before Docker Hub release.

## SonarQube Enterprise

Recommended quality gate:

- no new critical or blocker issues
- no new high security hotspots without review
- no new duplicated code above project threshold
- coverage trend must not regress for changed backend services
- maintainability rating must remain acceptable

Required secrets:

- `SONAR_TOKEN`
- `SONAR_HOST_URL`

## Orca Security

Recommended scan scope:

- cloud accounts
- Kubernetes clusters if used
- container images
- Dockerfiles and Compose files
- exposed services and network paths

Policy:

- database, Redis, and pgAdmin must not be internet-exposed
- production secrets must be stored in a managed secret store
- public services must sit behind TLS and a web application firewall

## Burp Suite Enterprise

Recommended authenticated scan coverage:

- login and session handling
- admin routes
- data hub upload and connector flows
- module APIs
- report routes
- role-based redirects and direct URL access

Use a staging environment with test-only data. Do not scan local production-like credentials.

## Annual Independent Penetration Test

Minimum scope:

- web frontend
- FastAPI backend
- authentication and authorization
- multi-tenant data isolation
- Docker and deployment configuration
- file upload and data connector attack paths
- API abuse and rate limit behavior

Deliverables:

- executive summary
- technical finding list
- severity ratings
- reproduction evidence
- remediation plan
- retest confirmation

## Current Residual Risks

- Local demo stacks may expose Postgres, Redis, and pgAdmin ports for developer testing.
- Demo credentials exist for local walkthroughs and must be replaced before external deployment.
- Frontend token storage should move from `localStorage` to hardened session handling for production.
- Vendor controls require paid platform setup and secrets that must not be committed to Git.
