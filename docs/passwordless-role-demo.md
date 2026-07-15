# Version 2 Passwordless Role Demo

## Purpose

This mode lets reviewers document the real Version 2 navigation, unified dashboards, and client-scoped data visibility for every seeded role without receiving or entering a password. Every demo session is read-only in both the frontend permission layer and the FastAPI middleware.

## Access

- Local application: `http://localhost:18080`
- Local API: `http://localhost:18000`
- Docker images: `vinodreddy1999/metam-services-v2-fullstack:2.0.0-beta.2` and `vinodreddy1999/metam-services-v2-frontend:2.0.0-beta.2`

Open the application, choose **Passwordless role preview**, and select a role. Use **Switch role** in the header to return to the role list.

## Role Usernames

| Role | Demo username |
|---|---|
| Super Admin | `super@metam.local` |
| Account Owner | `owner@metam.local` |
| Organization Admin | `orgadmin@metam.local` |
| Admin | `admin@metam.local` |
| Team Manager | `manager@metam.local` |
| Supervisor | `supervisor@metam.local` |
| Operator | `operator@metam.local` |
| Auditor | `auditor@metam.local` |
| QA Tester | `qa@metam.local` |
| Custom User | `custom@metam.local` |
| Standard User | `user@metam.local` |

Passwords are intentionally excluded from this document and from the login interface.

## Security Behavior

- Demo JWTs expire after 120 minutes by default.
- Demo JWTs contain `demo_read_only=true` and the selected role.
- `GET`, `HEAD`, and `OPTIONS` requests are permitted according to normal RBAC and selected-client scope.
- `POST`, `PUT`, `PATCH`, and `DELETE` requests are rejected by backend middleware.
- Normal password login is unchanged.
- The application image defaults demo mode to disabled. The local documentation Compose deployment explicitly enables it.

Set `ENABLE_PUBLIC_DEMO=false` before deploying to a normal environment. Use `PUBLIC_DEMO_TOKEN_MINUTES` to set a value from 15 to 240 minutes.

## API Checks

- `GET /runtime/auth/demo-config` returns the available roles and usernames, never passwords.
- `POST /runtime/auth/demo-login` creates a read-only token for an allowed role.
- `GET /runtime/auth/me` confirms `demo_read_only: true`.
- Any authenticated write request returns HTTP 403 with `Read-only demo sessions cannot modify data.`
