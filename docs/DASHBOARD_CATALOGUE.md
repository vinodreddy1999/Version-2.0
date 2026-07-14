# Version 2.0 Dashboard Catalogue

## Rules

- `/workspace/dashboards/:dashboardKey` is the canonical central location. The `/workspace` prefix prevents a collision with the existing `/dashboards/{dashboard_id}` backend API.
- Module dashboards remain available inside their operational module.
- The central page imports only the selected dashboard.
- Permission checks run before the selected dashboard renders or calls an API.
- Client context is included in dashboard query keys.

| Dashboard | Route | Reused component | Access | Primary APIs | Status |
|---|---|---|---|---|---|
| Executive | `/workspace/dashboards/executive` | `DashboardPage` | Dashboard section | admin, analytics, inventory, systems, uploads, records | Working |
| Planning | `/workspace/dashboards/planning` | `PlanningModulePage` | Planning module | Planning backend contracts | Working, shared module page |
| Inventory | `/workspace/dashboards/inventory` | `InventoryModulePage` | Inventory module | Inventory dashboard and records | Working, shared module page |
| Warehouse | `/workspace/dashboards/warehouse` | `WarehouseModulePage` | Warehouse module | Warehouse backend contracts | Working, shared module page |
| Production | `/workspace/dashboards/production` | `ProductionModulePage` | Production module | Production backend contracts | Working, shared module page |
| Maintenance | `/workspace/dashboards/maintenance` | `MaintenanceModulePage` | Maintenance module | Maintenance backend contracts | Working, shared module page |
| Quality | `/workspace/dashboards/quality` | `ModuleWorkspacePage` | Quality module | Runtime records | Foundation; dedicated dashboard extraction pending |
| Procurement | `/workspace/dashboards/procurement` | `ModuleWorkspacePage` | Procurement module | Runtime records | Foundation; dedicated dashboard extraction pending |
| Sales | `/workspace/dashboards/sales` | `ModuleWorkspacePage` | Sales module | Runtime records | Foundation; dedicated dashboard extraction pending |
| Costing | `/workspace/dashboards/costing` | `ModuleWorkspacePage` | Costing module | Runtime records | Foundation; dedicated dashboard extraction pending |
| Compliance | `/workspace/dashboards/compliance` | `ModuleWorkspacePage` | Compliance module | Runtime records | Foundation; dedicated dashboard extraction pending |
| Business Impact | `/workspace/dashboards/business-impact` | `BusinessImpactDashboard` | Reports module | Simulated calculation model | Working and explicitly labelled simulated |
| Integration | `/workspace/dashboards/integration` | `IntegrationDashboard` | Data Hub section | systems, quality, readiness, uploads | New V2 working dashboard |
| Custom | Reserved | Admin-managed widget definitions | Dashboard assignment | Widget configuration API | Not claimed complete; implementation pending |

## Shared filters

Selected client is global and is preserved by the route shell. Plant, warehouse, line, date, product, and status filters remain owned by the selected dashboard until a shared filter contract is implemented. A dashboard switch does not import all other dashboards.

## Drilldown contract

KPI drilldowns must retain client context, route to the owning register, apply the KPI condition, and preserve a return route. Existing cards retain their working module routes. A later batch will standardize drilldown query parameters across all modules.

## Chunk evidence

- `UnifiedDashboardsPage`: 5.87 kB (2.11 kB gzip).
- `IntegrationDashboard`: 3.06 kB (1.32 kB gzip).
- Dashboard module chunks are reused; no duplicate dashboard implementation was created.
