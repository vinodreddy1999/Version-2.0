# Security Policy

## Supported Branches

| Version | Branch | Security Status |
| --- | --- | --- |
| Version 2 | `agent/global-enterprise-hierarchy` | Supported for current security fixes |
| Version 2 | `main` | Target branch for release hardening after merge |

## Reporting a Vulnerability

Do not open public GitHub issues for suspected vulnerabilities, exposed secrets, credentials, or tenant data leaks.

Report privately to the repository owner with:

- affected route, module, or Docker service
- reproduction steps
- expected versus actual behavior
- severity estimate
- screenshots or logs with secrets removed

## Security Baseline

The repository includes:

- CodeQL security scanning for Python and TypeScript
- dependency review on pull requests
- Dependabot update tracking for Python, npm, Docker, and GitHub Actions
- environment-based JWT secrets instead of hardcoded token secrets
- authenticated refresh tokens and protected module APIs

## Required Production Controls

Before production use, configure:

- GitHub Advanced Security with secret scanning and push protection
- Snyk or equivalent SCA/container/IaC scanning
- SonarQube quality gates
- cloud and Kubernetes posture scanning
- runtime web application scanning
- annual independent penetration testing

Demo passwords must be replaced before any external deployment.
