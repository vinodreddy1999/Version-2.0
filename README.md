# Metam Services Version 2.0

Role-by-role documentation can use the passwordless, backend-enforced read-only workflow in [docs/passwordless-role-demo.md](docs/passwordless-role-demo.md).

Version 2 now includes a global-enterprise hierarchy with parallel geography,
business, legal, and operational dimensions; scoped multi-role assignments;
central backend authorization; role-generated navigation; global-to-local
dashboards; time-limited support access; data masking; and enterprise
administration.

Architecture and delivery documents:

- [Global Enterprise Architecture](docs/GLOBAL_ENTERPRISE_ARCHITECTURE.md)
- [Global Enterprise Migration and Rollback](docs/GLOBAL_ENTERPRISE_MIGRATION.md)
- [Global Enterprise Validation](docs/GLOBAL_ENTERPRISE_VALIDATION.md)

This repository is the isolated Version 2.0 track. Version 1 remains in `vinodreddy1999/manufacturing-operations-platform` and can run at the same time.

Version 2.0 first-batch additions:

- Canonical, permission-aware `/workspace/dashboards/:dashboardKey` area
- One-dashboard-at-a-time lazy loading
- Shared client-scoped React Query keys
- Cancellation and removal of previous-client scoped queries
- Context-aware breadcrumbs
- Version-specific Docker images, network, database, volumes, and ports
- Measured architecture, dashboard, duplication, and performance documentation

Side-by-side URLs after Docker Compose starts:

- Version 1: `http://localhost:8080`
- Version 2: `http://localhost:18080`
- Version 2 API: `http://localhost:18000`

Enterprise administration: `http://localhost:18080/admin/enterprise`

See [Version 2 Deployment](docs/VERSION_2_DEPLOYMENT.md), [Current Role and Route Validation](docs/VERSION_2_CURRENT_VALIDATION.md), [Information Architecture](docs/INFORMATION_ARCHITECTURE_TREE.md), and [Performance Baseline](docs/PERFORMANCE_BASELINE.md).

## Existing backend foundation

This repository is now a Python-only implementation of the Metam Services backend.

It uses FastAPI and includes runnable backend modules for Metam Services:

- Auth
- Platform
- Inventory
- Warehouse
- Supplier
- Procurement
- Production
- Maintenance
- Quality
- Reporting
- Supply Chain
- AI

It now also includes a modular-monolith platform foundation with:

- PostgreSQL-ready SQLAlchemy 2.0 models
- Alembic migration scaffold
- Tenant/company/plant isolation fields
- JWT/password security helpers
- Role and permission records
- Company-level feature flags
- Tasks, approvals, documents and audit logs
- Redis/Celery background job hooks
- Optional AI provider interface for future LLM copilot integrations

Application metadata is now stored in the database rather than only in process memory for the shared runtime paths. This includes:

- tenant metadata
- module definitions
- company and plant metadata
- warehouse, supplier, and inventory reference metadata
- inventory reservations, movements, counts, and mobile scan metadata
- procurement requisition metadata
- admin/data hub/company feature metadata

The Production module has been expanded into a dedicated backend package with product master, BOM, routing, work centers, lines, machines, production orders, MRP, reservations, scheduling, logs, downtime, WIP, losses, costing, reports, dashboard, task/notification queues, and rule-based Production AI.

The Maintenance module has also been expanded into a dedicated CMMS/EAM-style backend package with machine registry, capability configuration, maintenance plans, breakdown work orders, spare mapping/reservation/consumption, downtime, shutdown windows, assignments, vendors, documents, machine history, lifecycle, costing, reports, dashboard, MTTR/MTBF, health scoring, and rule-based Maintenance AI.

The Quality module has been expanded into a dedicated QMS-style backend package with quality plans, checklists, sampling rules, inspection lots, inspection execution, defects, quarantine, rework, rejection, scrap, CAPA, KPIs, reports, quality tasks/notifications, and rule-based Quality AI.

The Sales & Distribution module has been expanded into a dedicated ERP-style backend package with customer master, regions, territories, plant representatives, sales orders, finished goods availability, protected customer reservations, partial allocation, dispatch orders, shipments, returns, KPIs, reports, tasks/notifications, and rule-based Sales AI.

The Customer Portal module has been added as a dedicated external-user backend with isolated customer authentication, profile view/update requests, customer-owned order and shipment tracking, secure document downloads, support requests, return requests, notifications, reports, audit logs, and rule-based Customer Portal AI.

The Supplier Portal module has been added as a dedicated external-supplier backend with isolated supplier authentication, company-level portal enablement flags, supplier users/RBAC, supplier-owned purchase orders, acknowledgements, delivery confirmations, ASN, document/certificate uploads, supplier performance visibility, supplier-facing tasks, messages, CAPA responses, notifications, reports, audit logs, and rule-based Supplier Portal AI.

The Reporting & Analytics module has been added as a dedicated BI-style backend with standard report catalog, scoped report execution, CSV/Excel/PDF export flow, saved reports, scheduled email reports, dashboards, KPI definitions/snapshots, trend analytics, cross-module insights, action insights, and rule-based Reporting AI.

The Costing & Profitability module has been added as a dedicated cost intelligence backend with cost centers, cost elements, inventory valuation, landed cost, production costing, maintenance and quality costing, allocation rules, standard costs, variance analysis, profitability views, costing reports, dashboard cards, and rule-based Costing AI.

The Mobile Operations module has been added as a dedicated shop-floor/mobile backend with mobile authentication, device management, my-work dashboard, task/approval actions, scan resolution, inventory receiving/transfers/counting, warehouse movement, production updates, maintenance execution, quality inspection, dispatch operations, uploads, offline sync, audit logs, notifications, and rule-based Mobile AI.

The Integrations module has been added as a dedicated API/file/webhook/email integration backend with provider registry, company configs, masked credential storage, webhooks, inbound events with idempotency, sync jobs, mappings, file import/export, errors/retries, monitoring reports, email/machine hooks, and rule-based Integration AI.

The Manufacturing Intelligence module has been added as a future command-center backend that connects risks across Inventory, Warehouse, Procurement, Production, Maintenance, Quality, Sales, Costing and Forecasting with impact graphs, root-cause analysis, what-if simulation, health scores, customer/cost impact, recommendations, draft actions and executive summaries.

The Frontend & Admin Platform module has been added as a backend contract layer for future React/TypeScript screens. It exposes navigation, folder structure, admin dashboard, company setup, RBAC, dashboard access, data scopes, workflows, KPIs, alerts, notifications, security, documents, compliance, platform management, Manufacturing Data Hub, Planning, AI Command Center, Digital Twin and Digital Operations Center APIs.

The Data Integration Hub now includes a Power BI-style **Get Data** module for source selection, connection testing, table/file/API discovery, preview, Power Query-style transforms, field mapping, model relationships, validation, refresh history, error logs, and audit logs. See [Get Data Module](docs/get-data-module.md).

## Diagram

See the GitHub-rendered end-to-end scheme diagram here:

[End-to-End Scheme Diagram](docs/end-to-end-scheme.md)

## Platform And Client Contexts

The frontend separates cross-client administration from tenant operations:

- Super Admin starts in **Platform View** and can inspect client, user, module, subscription, system, audit, and widget health.
- Selecting a client switches to that client's operational dashboard and configured currency.
- Company Admin and other tenant roles start directly in their assigned client and cannot select another tenant.
- Client module allocation controls which operational sections appear; non-admin users are further limited to their assigned modules.
- Client creation records enabled and disabled modules, market, region, currency, subscription state, creation date, and an audit event.
- User creation is constrained to applications and modules enabled for the selected client.

Frontend routes:

- `/platform` - platform overview
- `/platform/modules/:moduleName` - module health by client
- `/platform/widgets` - platform widget visibility and ordering
- `/admin/clients` and `/admin/clients/create` - client administration
- `/admin/clients/:clientId/health` - client health and allocation
- `/admin/users` and `/admin/users/create` - searchable, client-scoped user administration

The demonstration register includes five clients, 23 users, multiple currencies, disabled-module scenarios, subscription states, and audit events. Browser-created demo changes persist in local storage; production tenant authorization and database isolation remain enforced by the existing backend contracts.

## Administration Center

The business-facing administration workspace is organized into permission-aware routes:

- `/admin/company` - company profile and access summary
- `/admin/users` - searchable, filterable user governance
- `/admin/roles` - role scopes, permissions, applications, and modules
- `/admin/access` - user, role, module, and dashboard permission matrices
- `/admin/modules` - company-enabled modules and navigation preview
- `/admin/dashboards` - dashboard assignments and visibility
- `/admin/data-scope` - client, region, plant, warehouse, department, and line scopes
- `/admin/audit` - business-readable audit and compliance history
- `/workspace/dashboards/business-impact` - delivered value and operational improvement
- `/admin/recommendations` - opportunity pipeline and owner accountability
- `/admin/settings` - general, currency, notification, integration, security, and branding preferences

Company Admin is locked to its assigned client and cannot assign platform authority or re-enable modules disabled by Platform Admin. Operational navigation is the intersection of company-enabled and user-assigned modules.

## Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open:

- Health check: `http://localhost:8000/health`
- Swagger API docs: `http://localhost:8000/docs`
- Module registry: `http://localhost:8000/modules`

## Frontend

A production-oriented React/Vite frontend is available in:

```text
frontend/
```

Operational records use live backend responses. The explicitly simulated Improvement & Savings Impact model is the only frontend dataset pending its future backend API.

### Improvement & Savings Impact

The frontend includes a calculation-ready impact layer for Inventory, Production, Maintenance, Quality, Procurement, Sales, Costing, Planning, Warehouse, Compliance, Customer Portal, Supplier Portal, Integration Hub, Manufacturing Data Hub, Admin, and Document Management.

- `Reports & Analytics` opens the cross-module Business Impact Dashboard.
- Every supported module includes before/after metrics, savings, trends, outputs, and an improvement register.
- `/impact/:module/:metric` provides metric history, source data, accountable ownership, related records, review notes, and CSV/JSON exports.
- Impact values are deterministic simulated data and are visibly labelled as such. Existing backend data and AI services are unchanged; impact API integration is a future step.

Stack:

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- React Query
- Axios
- Recharts
- shadcn-style local UI components

Run locally:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The frontend reads the backend URL from:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Build:

```bash
cd frontend
npm run build
```

Docker build and run:

```bash
cd frontend
docker build \
  -t vinodreddy1999/metam-services-frontend:latest \
  -t vinodreddy1999/metam-services-frontend:0.1.0 \
  .
docker run -p 8080:8080 vinodreddy1999/metam-services-frontend:latest
```

Open:

```text
http://127.0.0.1:8080
```

Docker Compose also includes a standalone `frontend` service exposed on port `8081`.

Docker Hub push:

```bash
docker push vinodreddy1999/metam-services-frontend:latest
docker push vinodreddy1999/metam-services-frontend:0.1.0
```

## Full-Stack Application Image

The root `Dockerfile` now builds one deployable application image:

- React frontend is built with Vite.
- FastAPI serves both the backend APIs and the built frontend.
- The app listens on port `8080`.
- SQLite is used by default at `/data/metam.db` for a simple single-container run.
- `DATABASE_URL` can point to PostgreSQL for production or Docker Compose deployments.

Build:

```bash
docker build \
  -t vinodreddy1999/metam-services-fullstack:latest \
  -t vinodreddy1999/metam-services-fullstack:0.2.7 \
  .
```

Run:

```bash
docker run --name metam-fullstack -p 8080:8080 \
  -v metam_fullstack_data:/data \
  vinodreddy1999/metam-services-fullstack:latest
```

Seed full-scale multi-company demo data after the container is running:

```bash
docker exec metam-fullstack python scripts/seed_enterprise_data.py
```

Open:

```text
http://127.0.0.1:8080
```

Seeded login accounts:

```text
Super admin: super@metam.local / SuperAdmin123!
Admin:       admin@metam.local / ChangeMe123!
User:        user@metam.local / User12345!
```

Expanded multi-company test accounts are also seeded for each company. Use the same role password by prefix:

```text
admin.apex@metam.local     / ChangeMe123!
manager.apex@metam.local   / Manager123!
operator.apex@metam.local  / Operator123!
viewer.apex@metam.local    / User12345!

Replace apex with coc, nova, fresh, or med to test each seeded company.
```

The backend also seeds full module records for Planning, Inventory, Production, Maintenance, Quality, Procurement, Sales, Costing, Compliance, Customer Portal, Supplier Portal, Reports, and Documents across every seeded company.

Walkthrough artifacts:

- `docs/metam-services-complete-working-walkthrough.html`
- `docs/metam-services-complete-working-walkthrough.gif`

Access model:

- Super admin has full access and can create or update other super admins.
- Admin is scoped to its own company and can manage only its company users, records, and DataHub metadata.
- User has read-only runtime access and cannot access DataHub.
- Disabled users cannot log in or call protected APIs.

Multi-tenant validation helper:

```bash
python scripts/validate_multitenant_access.py
```

Expected validation highlights:

- `admin@metam.local` only sees `company-c`
- `super@metam.local` sees all companies
- standard users receive `403` for DataHub routes

Runtime APIs added:

- `POST /runtime/auth/login`
- `POST /api/v1/runtime/auth/login`
- `GET /runtime/auth/me`
- `GET /runtime/users`
- `POST /runtime/users`
- `PUT /runtime/users/{user_id}`
- `GET /runtime/records`
- `POST /runtime/records`
- `PUT /runtime/records/{record_id}`
- `DELETE /runtime/records/{record_id}`
- `GET /runtime/inventory/items`
- `GET /runtime/analytics/summary`
- `GET /runtime/audit-logs`

## Docker Compose Stack

Run the full stack with PostgreSQL, Redis, backend API, full-stack app, standalone frontend, worker, nginx, and pgAdmin:

```bash
docker compose up -d --build
```

Default ports:

- `8080`: full-stack app (frontend + backend served together)
- `8081`: standalone frontend
- `8000`: backend API only
- `5432`: PostgreSQL
- `5050`: pgAdmin
- `80`: nginx reverse proxy

Compose notes:

- PostgreSQL is the primary metadata store in compose deployments.
- Services share the `metam-network` Docker bridge network.
- `seed-enterprise-data` runs once after the app is healthy and creates multi-company demo users and records.
- pgAdmin uses `admin@metam.localhost.com / ChangeMe123!` by default.

Enterprise endpoints:

- `GET /health`
- `GET /ready`
- `GET /live`
- `GET /metrics`
- `GET /traffic`
- `GET /info`
- `GET /swagger`
- `GET /openapi.json`

Enterprise roles:

- `super_admin`
- `account_owner`
- `organization_admin`
- `team_manager`
- `supervisor`
- `operator`
- `auditor`
- `qa_tester`
- `custom`
- `admin`
- `user`

Validate the running full-stack container:

```bash
scripts/validate_fullstack.sh
```

Docker Hub push:

```bash
docker push vinodreddy1999/metam-services-fullstack:latest
docker push vinodreddy1999/metam-services-fullstack:0.2.6
```

Docker Compose enterprise services:

- `fullstack-app`: integrated frontend + backend
- `platform-api`: backend-only API service
- `frontend`: standalone frontend service for split deployment
- `postgres`: PostgreSQL database
- `pgadmin`: PostgreSQL administration UI
- `redis`: cache and worker broker
- `worker`: Celery worker
- `nginx`: reverse proxy with security headers

Compose run:

```bash
cp .env.example .env
docker compose up --build
```

Kubernetes and Helm starter manifests are available in:

```text
deploy/kubernetes/
deploy/helm/
```

## Demo Login

Use `POST /auth/login` with:

```json
{
  "tenant_slug": "precision-components",
  "email": "admin@metam.local",
  "password": "ChangeMe123!"
}
```


## Inventory AI Service

A separate Python FastAPI microservice is available here:

```text
inventory-ai-service/
```

It provides rule-based inventory intelligence APIs for:

- risk center
- shortage prediction
- overstock prediction
- procurement recommendations
- expiry intelligence
- dead stock detection
- production impact
- optimization draft actions

Run it with:

```bash
cd inventory-ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8100
```

Open:

```text
http://127.0.0.1:8100/docs
```

The AI service is recommendation-only. It creates draft actions and requires human approval for critical actions.

## Project Layout

```text
app/
  main.py             FastAPI application and module endpoints
  database.py         SQLAlchemy engine/session
  platform_models.py  Core platform SQLAlchemy models
  core_router.py      Companies, plants, users, roles, feature flags, tasks, approvals, documents and audit APIs
  auth_router.py      Refresh token and database-backed login structure
  schemas.py          Existing Pydantic request/response models
  store.py            Demo inventory/module data store
  modules/            Isolated business module packages
    inventory.py      Inventory operational views
    production.py     Production Management API routes
    production_models.py
                       SQLAlchemy tables for Production Management
    production_schemas.py
                       Pydantic schemas for Production requests and outputs
    production_repository.py
                       Seeded Production repository
    production_service.py
                       MRP, reservations, scheduling, costing, reports and AI rules
    maintenance.py    Maintenance Management API routes
    maintenance_models.py
                       SQLAlchemy tables for Maintenance Management
    maintenance_schemas.py
                       Pydantic schemas for Maintenance requests and outputs
    maintenance_repository.py
                       Seeded Maintenance repository
    maintenance_service.py
                       Approvals, spares, downtime, health, reports and AI rules
    quality.py         Quality Management API routes
    quality_models.py SQLAlchemy tables for Quality Management
    quality_schemas.py
                       Pydantic schemas for Quality requests and outputs
    quality_repository.py
                       Seeded Quality repository
    quality_service.py
                       Inspection execution, failure handling, KPIs, reports and AI rules
    sales.py           Sales & Distribution API routes
    sales_models.py    SQLAlchemy tables for Sales & Distribution
    sales_schemas.py   Pydantic schemas for Sales requests and outputs
    sales_repository.py
                       Seeded Sales repository
    sales_service.py   Availability, allocation, dispatch, KPIs, reports and AI rules
    customer_portal.py Customer Portal API routes
    customer_portal_models.py
                       SQLAlchemy tables for external portal users, support, returns, documents and audit
    customer_portal_schemas.py
                       Pydantic schemas for portal auth, support, returns and AI requests
    customer_portal_repository.py
                       Seeded Customer Portal repository
    customer_portal_service.py
                       Portal auth, customer-scoped data access, documents, reports and AI rules
    supplier_portal.py Supplier Portal API routes
    supplier_portal_models.py
                       SQLAlchemy tables for supplier users, PO acknowledgements, deliveries, ASN, documents, certificates, messages and AI drafts
    supplier_portal_schemas.py
                       Pydantic schemas for supplier auth, deliveries, ASN, uploads, CAPA and AI requests
    supplier_portal_repository.py
                       Seeded Supplier Portal repository
    supplier_portal_service.py
                       Portal auth, supplier-scoped data access, reports and AI rules
    reporting.py       Reporting & Analytics API routes
    reporting_models.py
                       SQLAlchemy tables for catalog, saved/scheduled reports, dashboards, KPIs, trends, insights, AI risks and anomalies
    reporting_schemas.py
                       Pydantic schemas for report runs, exports, schedules, dashboards, KPIs and AI requests
    reporting_repository.py
                       Seeded Reporting repository
    reporting_service.py
                       Report execution, exports, dashboards, KPI calculation, analytics and AI rules
    costing.py        Costing & Profitability API routes
    costing_models.py SQLAlchemy tables for cost records, variances, profitability, AI risks, reports and snapshots
    costing_schemas.py
                       Pydantic schemas for costing calculations, standard costs, variances and AI requests
    costing_repository.py
                       Seeded Costing repository
    costing_service.py
                       Cost calculation, profitability, reports and AI rules
    mobile.py         Mobile Operations API routes
    mobile_models.py  SQLAlchemy tables for devices, sessions, work queue, offline sync, scans, uploads, audit, conflicts, notifications and AI
    mobile_schemas.py Pydantic schemas for mobile auth, device registration, workflows, sync and AI requests
    mobile_repository.py
                       Seeded Mobile Operations repository
    mobile_service.py Mobile auth, device, workflow, scan, offline sync and AI rules
    integrations.py   Integrations API routes
    integrations_models.py
                       SQLAlchemy tables for providers, configs, credentials, webhooks, events, sync, imports, exports, errors, email, IoT and AI
    integrations_schemas.py
                       Pydantic schemas for providers, configs, credentials, webhooks, sync, mappings, import/export and AI requests
    integrations_repository.py
                       Seeded Integrations repository
    integrations_service.py
                       Credential masking, inbound idempotency, sync, import/export, monitoring and AI rules
    manufacturing_intelligence.py
                       Manufacturing Intelligence API routes
    manufacturing_intelligence_models.py
                       SQLAlchemy tables for risks, links, impact graph, root cause, what-if, health, impacts, recommendations, summaries and audit
    manufacturing_intelligence_schemas.py
                       Pydantic schemas for root cause, what-if and draft actions
    manufacturing_intelligence_repository.py
                       Seeded Manufacturing Intelligence repository
    manufacturing_intelligence_service.py
                       Command center, impact graph, root cause, what-if, health, impact, recommendation and summary rules
    frontend_admin.py  Frontend, Admin, Platform Management, Data Hub, Planning, AI Command Center, Digital Twin and Operations Center API routes
    frontend_admin_models.py
                       SQLAlchemy tables for subscriptions, dashboard access, scopes, workflows, data hub connections, mappings, pending ERP updates and digital twin nodes
    frontend_admin_schemas.py
                       Pydantic schemas for dashboard access, mapping preview, workflow simulation and pending update decisions
    frontend_admin_repository.py
                       Seeded frontend/admin/data hub repository
    frontend_admin_service.py
                       Admin metrics, RBAC logic, data quality, AI readiness, mapping, synchronization and digital operations rules
  ai_copilot/         AIProvider, MockAIProvider and optional OpenAIProvider interface
  jobs.py             Celery jobs for reports, AI risk scans, expiry/dead stock checks
alembic/              Migration environment and first foundation migration
requirements.txt
Dockerfile
docker-compose.yml
.github/workflows/ci.yml
```

The current version uses in-memory sample data so every module can run immediately without database setup. A database layer can be added later behind `app/store.py`.

## Production Management Module

Open `http://localhost:8000/docs` and use the `Production Management` tag.

Key endpoint groups:

- Product master: `GET/POST/PUT/DELETE /production/products`
- BOM management: `GET/POST/PUT /production/bom`, `POST /production/bom/{bom_id}/approve`
- Routing: `GET/POST/PUT /production/routing`
- Work centers, lines and machines: `/production/work-centers`, `/production/lines`, `/production/machines`
- Production orders: `GET/POST/PUT /production/orders`
- MRP and reservations: `/production/orders/{order_id}/material-requirements`, `/production/orders/{order_id}/reserve-materials`
- Time-aware planning and scheduling: `/production/orders/{order_id}/time-aware-plan`, `/production/schedules`
- Execution: `/production/logs`, `/production/material-consumption`, `/production/downtime`, `/production/completion`
- WIP, losses, costing and reports: `/production/wip`, `/production/losses`, `/production/costing`, `/production/reports`
- Production AI: `/production/ai/risk-center`, `/production/ai/delay-prediction`, `/production/ai/material-bottlenecks`, `/production/ai/capacity-optimization`, `/production/ai/schedule-optimization`, `/production/ai/what-if`, `/production/ai/bom-variance`, `/production/ai/downtime-impact`, `/production/ai/cost-risk`, `/production/ai/draft-actions`

Production AI is recommendation-only. It can analyze, recommend, and create draft actions; it cannot change schedules, consume inventory, close orders, or approve orders automatically.

## Maintenance Management Module

Open `http://localhost:8000/docs` and use the `Maintenance Management` and `Maintenance AI` tags.

Key endpoint groups:

- Machine registry: `GET/POST /maintenance/machines`, `GET/PUT/DELETE /maintenance/machines/{machine_id}`
- Root aliases from the prompt: `GET/POST /machines`, `GET/POST/PUT /maintenance-plans`, `GET/POST /work-orders`
- Capability and rule configuration: `/maintenance/rules`
- Preventive plans: `/maintenance/maintenance-plans`
- Breakdown and planned work orders: `/maintenance/work-orders`
- Assignment/start/complete/close workflow: `/maintenance/work-orders/{work_order_id}/assign`, `/start`, `/complete`, `/close`
- Spare mapping and reservation: `/maintenance/spare-parts`, `/maintenance/spare-reservations`, `/maintenance/spare-usage`
- Downtime and shutdown windows: `/maintenance/downtime-events`, `/maintenance/shutdown-windows`
- Documentation: `/maintenance/attachments`, `/maintenance/machine-documents`
- Runtime, vendors, costing, tasks, notifications and reports: `/maintenance/runtime-logs`, `/maintenance/vendors`, `/maintenance/costing`, `/maintenance/tasks`, `/maintenance/notifications`, `/maintenance/reports`
- Maintenance AI: `/ai/maintenance/risk-center`, `/ai/maintenance/failure-prediction`, `/ai/maintenance/downtime-prediction`, `/ai/maintenance/spare-prediction`, `/ai/maintenance/health-score`, `/ai/maintenance/root-cause`, `/ai/maintenance/cost-impact`, `/ai/maintenance/recommendations`, `/ai/maintenance/draft-action`

Maintenance AI is recommendation-only. It can analyze, recommend, and create draft actions; it cannot close work orders, approve maintenance, consume spares, change production schedules, or release a machine as available.

## Quality Management Module

Open `http://localhost:8000/docs` and use the `Quality Management` and `Quality AI` tags.

Key endpoint groups:

- Quality plans: `/quality/plans`
- Checklists and sampling rules: `/quality/checklists`, `/quality/sampling-rules`
- Inspection lots and execution: `/quality/inspection-lots`, `/quality/inspection-lots/{lot_id}/start`, `/submit`, `/approve`, `/reject`
- Defects and failure handling: `/quality/defects`, `/quality/quarantine`, `/quality/rework`, `/quality/rejections`, `/quality/scrap`
- CAPA: `/quality/capa`
- KPIs, reports, tasks and notifications: `/quality/kpis`, `/quality/reports`, `/quality/tasks`, `/quality/notifications`
- Quality AI: `/ai/quality/risk-center`, `/ai/quality/defect-prediction`, `/ai/quality/trends`, `/ai/quality/supplier-risk`, `/ai/quality/production-risk`, `/ai/quality/root-cause`, `/ai/quality/cost-risk`, `/ai/quality/draft-action`

Quality AI is recommendation-only. It can analyze, recommend, and create draft actions; it cannot approve releases, scrap inventory, release quarantine, close CAPA, reject suppliers, or dispatch affected goods.

## Sales & Distribution Module

Open `http://localhost:8000/docs` and use the `Sales & Distribution` and `Sales AI` tags.

Key endpoint groups:

- Customer master: `/customers`
- Regions and territories: `/regions`, `/territories`
- Plant representatives: `/plant-representatives`
- Sales orders: `/sales-orders`, `/sales-orders/{order_id}/submit`, `/approve`, `/reserve`, `/dispatch`, `/close`
- Finished goods allocation: `/allocations`
- Dispatch, shipments and returns: `/dispatch-orders`, `/shipments`, `/returns`
- KPIs, reports, tasks and notifications: `/sales/kpis`, `/sales/reports`, `/sales/tasks`, `/sales/notifications`
- Sales AI: `/ai/sales/risk-center`, `/ai/sales/demand-forecast`, `/ai/sales/order-risk`, `/ai/sales/allocation-recommendation`, `/ai/sales/regional-demand`, `/ai/sales/expiry-aware-sales`, `/ai/sales/customer-profitability`, `/ai/sales/dispatch-optimization`, `/ai/sales/returns-analysis`, `/ai/sales/draft-action`

Sales AI is recommendation-only. It can analyze, recommend, and create draft actions; it cannot confirm sales orders, reassign protected inventory, dispatch goods, approve returns, issue credit, or change customer pricing.

## Customer Portal Module

Open `http://localhost:8000/docs` and use the `Customer Portal` and `Customer Portal AI` tags.

Key endpoint groups:

- Portal auth: `/customer-portal/auth/login`, `/refresh`, `/password-reset`, `/verify-email`
- Portal users: `/customer-portal/users`, `/customer-portal/users/invite`, `/customer-portal/users/{id}/disable`
- Profile and update request: `/customer-portal/profile`, `/customer-portal/profile/update-request`
- Customer-owned order and shipment tracking: `/customer-portal/orders`, `/customer-portal/shipments`
- Secure shared documents: `/customer-portal/documents`, `/customer-portal/documents/{id}/download`
- Support and returns: `/customer-portal/support-requests`, `/customer-portal/returns`
- Notifications and reports: `/customer-portal/notifications`, `/customer-portal/reports/{report_type}`
- Customer Portal AI: `/ai/customer-portal/risk-center`, `/order-risk`, `/support-classification`, `/return-risk`, `/document-risk`, `/satisfaction-risk`, `/draft-action`

Customer Portal AI is recommendation-only. It can draft messages, support responses, return review tasks, document upload tasks and escalations; it cannot approve returns, issue credit, cancel orders, promise delivery dates, release internal information, or send external customer email without approval.

## Supplier Portal Module

Open `http://localhost:8000/docs` and use the `Supplier Portal` and `Supplier Portal AI` tags.

Key endpoint groups:

- Portal auth: `/supplier-portal/auth/login`, `/refresh`, `/password-reset`, `/verify-email`
- Supplier users: `/supplier-portal/users`, `/supplier-portal/users/invite`, `/supplier-portal/users/{id}`, `/supplier-portal/users/{id}/disable`
- Profile and update request: `/supplier-portal/profile`, `/supplier-portal/profile/update-request`
- Enablement and permissions: `/supplier-portal/enablement`
- Supplier-owned purchase orders: `/supplier-portal/purchase-orders`, `/supplier-portal/purchase-orders/{id}`, `/supplier-portal/purchase-orders/{id}/acknowledge`
- Delivery and ASN: `/supplier-portal/delivery-confirmations`, `/supplier-portal/asn`
- Documents and certificates: `/supplier-portal/documents`, `/supplier-portal/documents/upload`, `/supplier-portal/certificates`, `/supplier-portal/certificates/upload`
- Messages, CAPA, notifications, performance, tasks and reports: `/supplier-portal/messages`, `/supplier-portal/capa`, `/supplier-portal/notifications`, `/supplier-portal/performance`, `/supplier-portal/tasks`, `/supplier-portal/reports/{report_type}`
- Supplier Portal AI: `/ai/supplier-portal/risk-center`, `/delivery-risk`, `/document-risk`, `/certificate-expiry`, `/supplier-quality-risk`, `/po-acknowledgement-risk`, `/message-summary`, `/draft-action`

Supplier Portal AI is recommendation-only. It can analyze supplier delay, document, certificate, acknowledgement and quality risks, then create draft follow-ups or review tasks; it cannot approve suppliers or certificates, change purchase orders, accept delivery dates, send POs, commit financial actions, or replace suppliers automatically.

## Reporting & Analytics Module

Open `http://localhost:8000/docs` and use the `Reporting & Analytics` and `Reporting AI` tags.

Key endpoint groups:

- Feature flags and catalog: `/reports/enablement`, `/reports/catalog`, `/reports/catalog/{id}`
- Report execution and exports: `/reports/run`, `/reports/export`
- Saved reports: `/reports/saved`, `/reports/saved/{id}`
- Scheduled reports: `/reports/schedules`, `/reports/schedules/{id}`
- Dashboards: `/dashboards`, `/dashboards/{id}`
- KPIs: `/kpis`, `/kpis/{id}`, `/kpis/{id}/calculate`
- Analytics: `/analytics/trends`, `/analytics/cross-module`, `/analytics/action-insights`
- Reporting AI: `/ai/reporting/risk-center`, `/executive-summary`, `/root-cause`, `/anomalies`, `/kpi-insights`, `/report-narrative`, `/draft-action`

Reporting AI is recommendation-only. It can analyze, summarize, recommend and create draft tasks or report notes; it cannot approve decisions, change source data, send external email without approval, modify financial records, release inventory, or dispatch goods.

## Costing & Profitability Module

Open `http://localhost:8000/docs` and use the `Costing & Profitability` and `Costing AI` tags.

Key endpoint groups:

- Feature flags and dashboard: `/costing/enablement`, `/costing/dashboard`
- Masters: `/cost-centers`, `/cost-elements`
- Calculations: `/inventory-costing`, `/landed-cost`, `/production-costing`, `/maintenance-costing`, `/quality-costing`
- Rules and standards: `/cost-allocation-rules`, `/standard-costs`, `/standard-costs/{id}/approve`
- Variance and profitability: `/cost-variance`, `/profitability/products`, `/profitability/customers`, `/profitability/plants`
- Reports: `/costing/reports/inventory-valuation`, `/production-cost`, `/wastage-cost`, `/profitability`
- Costing AI: `/ai/costing/risk-center`, `/cost-increase`, `/low-margin-products`, `/customer-profitability-risk`, `/wastage-cost-risk`, `/production-variance`, `/supplier-cost-risk`, `/cost-optimization`, `/draft-action`

Costing AI is recommendation-only. It can analyze cost increases, low margin products, wastage, production variance and supplier cost risk; it cannot change product price, change supplier contracts, approve cost allocation, write off inventory, change standard cost, or modify financial records.

## Mobile Operations Module

Open `http://localhost:8000/docs` and use the `Mobile Operations` and `Mobile AI` tags.

Key endpoint groups:

- Auth and devices: `/mobile/auth/login`, `/refresh`, `/logout`, `/mobile/devices/register`, `/mobile/devices/{id}/disable`
- Work and approvals: `/mobile/my-work`, `/mobile/tasks`, `/mobile/approvals`
- Scan and inventory: `/mobile/scan/resolve`, `/mobile/inventory/receipts`, `/mobile/inventory/transfers`, `/mobile/inventory/counts`
- Warehouse and production: `/mobile/warehouse/movements`, `/mobile/production/orders`
- Maintenance and quality: `/mobile/maintenance/work-orders`, `/mobile/quality/inspections`
- Dispatch and uploads: `/mobile/dispatch/pick-lists`, `/mobile/dispatch/confirm`, `/mobile/uploads`
- Offline sync: `/mobile/sync/push`, `/mobile/sync/pull`, `/mobile/sync/status`
- Mobile AI: `/ai/mobile/risk-center`, `/scan-validation`, `/count-assist`, `/maintenance-assist`, `/quality-assist`, `/suggest-next-action`, `/draft-action`

Mobile AI is recommendation-only. It can suggest next actions, warn field users, summarize work and create draft notes/escalations; it cannot approve, release inventory, close critical work orders, dispatch goods, override reservations, or write off inventory.

## Integrations Module

Open `http://localhost:8000/docs` and use the `Integrations` and `Integrations AI` tags.

Key endpoint groups:

- Enablement and providers: `/integrations/enablement`, `/integrations/providers`
- Configs and credentials: `/integrations/configs`, `/integrations/credentials`
- Webhooks and inbound events: `/integrations/webhooks`, `/integrations/inbound/{provider_code}`
- Events and sync: `/integrations/events`, `/integrations/sync-jobs`
- Mappings and file exchange: `/integrations/mappings`, `/integrations/import/file`, `/integrations/export`
- Errors, monitoring and reports: `/integrations/errors`, `/integrations/monitoring`, `/integrations/reports/{report_type}`
- Integrations AI: `/ai/integrations/risk-center`, `/data-quality`, `/sync-failure-analysis`, `/anomaly-detection`, `/suggest-mapping`, `/draft-action`

Integration AI is recommendation-only. It can suggest mapping fixes, retry tasks, error reports, owner emails and validation tasks; it cannot commit high-risk imports, change credentials, send external data without approval, modify financial records, delete records, or override tenant security.

## Manufacturing Intelligence Module

Open `http://localhost:8000/docs` and use the `Manufacturing Intelligence` tag.

Key endpoint groups:

- Command center and risks: `/manufacturing-intelligence/command-center`, `/risks`
- Impact graph: `/manufacturing-intelligence/impact-graph/{entity_type}/{entity_id}`
- Root cause and what-if: `/manufacturing-intelligence/root-cause`, `/what-if`
- Bottlenecks and health: `/manufacturing-intelligence/bottlenecks`, `/health-score`, `/plant-health-score`
- Business impact: `/manufacturing-intelligence/customer-impact`, `/cost-impact`
- Recommendations and drafts: `/manufacturing-intelligence/recommendations`, `/draft-action`
- Executive summary: `/manufacturing-intelligence/executive-summary`

Manufacturing Intelligence is draft-only for critical actions. It can analyze, explain, simulate, recommend and create drafts; it cannot approve purchase orders, transfer inventory, change production schedules, release quarantine, dispatch goods, send external email without approval, write off inventory, change pricing, or modify financial records.

## Frontend & Admin Platform Contracts

Open `http://localhost:8000/docs` and use the `Frontend Contracts`, `Admin`, `Platform Management`, `Manufacturing Data Hub`, `Planning`, `AI Command Center`, `Digital Twin` and `Digital Operations Center` tags.

Key endpoint groups:

- Frontend contracts: `/frontend/navigation`, `/frontend/folder-structure`
- Admin dashboard and setup: `/admin/dashboard`, `/admin/company-setup`
- Access control: `/admin/users-roles`, `/admin/access-control`, `/admin/access-control/evaluate-dashboard`, `/admin/data-scopes`
- Admin engines: `/admin/workflows`, `/admin/workflows/simulate`, `/admin/kpis`, `/admin/alerts`, `/admin/notifications`
- Governance: `/admin/security`, `/admin/documents`, `/admin/compliance`
- Super Admin: `/platform-management/overview`
- Manufacturing Data Hub: `/manufacturing-data-hub/connected-systems`, `/catalog`, `/mappings`, `/mappings/preview`, `/data-quality`, `/ai-readiness`, `/lineage`, `/event-streaming`, `/pending-updates`, `/action-center`, `/erp-feedback`, `/reconciliation`, `/synchronization-dashboard`, `/get-data/connectors`, `/get-data/saved-connections`, `/get-data/test-connection`, `/get-data/transform-preview`, `/get-data/field-mapping/validate`, `/get-data/model`, `/get-data/refresh-history`, `/get-data/errors`, `/get-data/audit`
- Future command surfaces: `/planning/overview`, `/ai-command-center/overview`, `/digital-twin/overview`, `/digital-operations-center/overview`

Dashboard visibility uses the defined rule: tenant enabled dashboard plus role permission plus user permission plus data scope permission. Data Hub pending updates are approval-first so read-only ERP integrations can export recommended changes only after human decision.

## Platform Foundation

See:

[Platform Foundation](docs/platform-foundation.md)

Run with PostgreSQL and Redis:

```bash
docker compose up --build
```

Run migrations locally after setting `DATABASE_URL`:

```bash
alembic upgrade head
```
