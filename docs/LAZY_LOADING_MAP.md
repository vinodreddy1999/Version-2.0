# Version 2.0 Lazy Loading Map

## Route boundaries

| Parent | Lazy component | Fallback | Permission condition | Query activation |
|---|---|---|---|---|
| App shell | Platform Dashboard | Workspace loading state | Super Admin + platform context | Component mount |
| App shell | Unified Dashboards | Workspace loading state | Dashboard section | Selected route only |
| Unified Dashboards | Selected dashboard | Dashboard-specific loading state and error boundary | Module or Data Hub access | Selected dashboard mount |
| App shell | Administration | Workspace loading state | Admin section | Route mount |
| App shell | Data Hub | Workspace loading state | Data Hub section | Route mount |
| App shell | Planning / Inventory / Warehouse / Production / Maintenance | Workspace loading state | Company module + user module | Route mount |
| App shell | Generic module workspace | Workspace loading state | Company module + user module | Route mount |
| Dashboard/chart parent | Chart implementations | Inline chart fallback | Parent permission | Visible component mount |

## Query-key contract

Client-owned queries start with:

```text
['scope', 'client:<client-id-or-platform>', ...]
```

Dashboard keys then add `dashboard` and a stable data name. Module record keys add `module`, module key, and `records`. On client change, in-flight scoped queries are cancelled, the previous client's scoped cache is removed, and visible route content remounts using the new client key.

## Permission-aware import behavior

`React.lazy` imports are referenced by guarded route elements. A failed permission guard returns a redirect before the lazy child renders, so the restricted component is not requested by React. Unified Dashboards filters its catalogue before choosing or rendering a dashboard.

## Current component boundaries

| Component | Current state | Next action |
|---|---|---|
| Unified dashboard selector | Separate chunk | Complete |
| Integration dashboard | Separate chunk | Complete |
| Platform embedded workspaces | One shared 72.27 kB chunk | Split by workspace |
| Data Hub tabs | One 99.62 kB chunk | Split Get Data, connections, catalog, mapping, refresh/logs |
| Module tabs | Route page chunks, internal content varies | Split only heavy inactive tabs |
| Create/edit drawers | Deferred render but often same page chunk | Extract heavy forms to lazy drawer chunks |
| Charts | Shared lazy chart implementation | Add viewport activation consistently |
| Export libraries | Mostly browser-native exports | Add lazy spreadsheet/PDF exporters when standardized |

## Verification

Run:

```bash
cd frontend
npm run lint
npm run test:v2
npm run build
```

The V2 Dockerfiles run all three checks before producing an image.
