# Version 2.0 Information Architecture Tree

## Purpose

Version 2.0 keeps the existing Metam Services visual identity while introducing a governed parent-child structure. One information type has one primary home. Summary cards and drilldowns may link to that home, but they must not create a second source of truth.

## Canonical tree

```text
Metam Services
|-- Platform View
|   |-- Platform Overview
|   |-- Clients
|   |-- Markets
|   |-- Users
|   |-- Applications and Modules
|   |-- Subscriptions
|   |-- Integration Health
|   `-- Platform Audit
|-- Unified Dashboards
|   |-- Executive
|   |-- Planning
|   |-- Inventory
|   |-- Warehouse
|   |-- Production
|   |-- Maintenance
|   |-- Quality
|   |-- Procurement
|   |-- Sales
|   |-- Costing
|   |-- Compliance
|   |-- Business Impact
|   `-- Integration
|-- Administration
|   |-- Company
|   |-- Roles and Access
|   |-- Modules
|   |-- Dashboards
|   |-- Data Scope
|   |-- Audit
|   |-- Recommendations
|   `-- Settings
|-- Data Hub
|   |-- Get Data
|   |-- Connections
|   |-- Catalog and Uploads
|   |-- Field Mapping
|   `-- Refresh and Logs
`-- Operational Modules
    |-- Planning
    |-- Inventory
    |-- Warehouse
    |-- Production
    |-- Maintenance
    |-- Quality
    |-- Procurement
    |-- Sales and Distribution
    |-- Costing and Profitability
    |-- Compliance
    |-- Customer Portal
    |-- Supplier Portal
    |-- Reports and Analytics
    `-- Document Management
```

The full operational child tree remains inside each module's horizontal navigation. It is not permanently expanded in the application sidebar.

## Current canonical routes

| Branch | Canonical route | Ownership | V2 behavior |
|---|---|---|---|
| Platform View | `/platform?workspace={workspace}` | Platform administration | Embedded workspaces remain in Platform View |
| Unified Dashboards | `/workspace/dashboards/:dashboardKey` | Dashboard catalogue | Only the selected dashboard component is imported and rendered |
| Administration | `/admin/{section}` | Company administration | Existing routes and permissions retained |
| Data Hub | `/data-hub` | Data connections and import governance | Existing tab state retained |
| Planning | `/planning/*` | Planning | Module dashboard and registers retained |
| Inventory | `/inventory/*` | Inventory | Module dashboard and registers retained |
| Warehouse | `/warehouse/*` | Warehouse | Module dashboard and registers retained |
| Production | `/production/*` | Production | Module dashboard and registers retained |
| Maintenance | `/maintenance/*` | Maintenance | Module dashboard and registers retained |
| Shared module workspace | `/{module}` | Module owner | Existing backend record workspace retained |
| Business Impact | `/workspace/dashboards/business-impact` | Unified Dashboards | Old `/dashboard/business-impact` redirects safely |

## Primary information ownership

| Information | Primary home | Allowed summaries |
|---|---|---|
| Client identity and allocation | Platform View > Clients | Dashboard client selector, health cards |
| User identity | Platform View > Users | Admin access summaries |
| Role and data scope | Administration | User profile summary |
| Dashboard rendering | Unified Dashboards and shared module dashboard component | Module dashboard tab |
| Data connections and refresh | Data Hub | Integration dashboard |
| Operational records | Owning module | Executive and module KPI cards |
| Audit events | Platform Audit / Administration Audit | Record history drawer |

## Permission rule

Every route and dashboard requires an active authenticated user plus the correct platform/client context, company-enabled module, user-assigned module, role permission, user permission, and data scope. The frontend evaluates access before rendering a lazy component. The backend remains authoritative for every API request.

## Lazy boundary by branch

| Branch | Boundary | Query activation |
|---|---|---|
| Platform View | `PlatformDashboardPage` and `PlatformEmbeddedWorkspace` route chunks | Platform context and Super Admin only |
| Unified Dashboards | `UnifiedDashboardsPage` plus one selected dashboard chunk | Selected dashboard and permitted module only |
| Operational module | One route chunk per module | Current route and permitted module only |
| Heavy charts | `LazyCharts` / viewport boundary | Visible panel only where implemented |
| Drawers and forms | Deferred sections currently; separate chunk extraction is next | Open state only after extraction |

## Incremental work remaining

- Split the 72.27 kB Platform Embedded Workspace into client, market, user, module, subscription, integration, and audit chunks.
- Introduce a compact expandable tree shell after route ownership is stable.
- Add canonical child routes for every module tab without removing current horizontal navigation.
- Move remaining unscoped Data Hub query keys to the shared scoped key factory.
