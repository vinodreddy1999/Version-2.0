# Version 2.0 Duplicate Information Register

| Information type | Existing locations | Primary home | V2 action | Risk / next verification |
|---|---|---|---|---|
| Executive dashboard | `/`, dashboard focus routes | Unified Dashboards > Executive | Reuse `DashboardPage`; canonical central route added | Keep `/` for compatibility until navigation migration |
| Business Impact | Old dashboard route, reports redirect | Unified Dashboards > Business Impact | Old route redirects to canonical route | Simulated model must remain clearly labelled |
| Module dashboards | Module root and central dashboard request | Module-owned shared component | Central selector lazy-loads existing module page | Dedicated dashboard-only extraction pending for generic modules |
| Client identity | Platform state, Data Hub company list | Platform View > Clients | Global selected client remains authoritative | Backend company/client ID reconciliation still needs one canonical identifier |
| Module records | Operations page and module workspaces | Owning module | Shared scoped query-key factory introduced | Some legacy query keys remain unscoped |
| Connected systems | Data Hub, executive integration snapshot | Data Hub | Integration dashboard reads the same backend endpoint | Apply server-side client filter rather than UI-only filtering |
| Module allocation | Client editor, module editor, health table | Platform View > Modules | Keep one platform state definition | Persist platform demo state to backend in later batch |
| Audit | Platform workspace, Admin audit | Central audit service | Keep summaries; route ownership documented | Consolidate frontend local audit and backend audit IDs |
| Dashboard access | Admin dashboard controls, runtime navigation | Administration > Dashboard Management | Unified selector filters by shared RBAC | Add dashboard-specific permission records to backend |

No duplicate KPI formula was added in this batch. The Integration dashboard uses persisted endpoint aggregates; module dashboards reuse existing components.
