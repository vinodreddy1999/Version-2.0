# Version 2.0 Performance Baseline

## Measurement method

Both builds used the same `node:22-alpine` frontend Docker build and Vite production mode on 14 July 2026. V1 was commit `84b4f00`. V2 was measured after the first foundation batch. Sizes below are Vite output sizes, not estimates.

## Build comparison

| Metric | V1 baseline | V2 first batch | Change |
|---|---:|---:|---:|
| Modules transformed | 2,366 | 2,370 | +4 |
| Build render time | 17.79 s | 18.14 s | +0.35 s |
| Main JS | 375.37 kB / 118.90 kB gzip | 378.32 kB / 119.83 kB gzip | +2.95 kB / +0.93 kB gzip |
| Main CSS | 48.71 kB / 9.39 kB gzip | 48.76 kB / 9.40 kB gzip | +0.05 kB |
| Chart implementation chunk | 395.51 kB / 108.69 kB gzip | 395.51 kB / 108.69 kB gzip | unchanged |
| Data Hub chunk | 99.62 kB / 24.50 kB gzip | 99.62 kB / 24.50 kB gzip | unchanged |
| Platform workspace chunk | 72.27 kB / 16.82 kB gzip | 72.27 kB / 16.82 kB gzip | unchanged |

The first batch intentionally adds cache-scope control and breadcrumbs to the application shell, so the shell is 0.91 kB gzip larger. It creates deferred chunks for Unified Dashboards (5.87 kB) and Integration Dashboard (3.06 kB). It does not claim a net initial-transfer improvement yet.

## Existing strengths

- Major routes already use `React.lazy`.
- Recharts is isolated in a separate chart implementation chunk.
- Data Hub and Platform workspace are not part of the main route chunk.
- Permission conditions prevent several unauthorized queries.

## Problems found

1. Dashboard and record query keys did not include selected client context.
2. Client switching did not cancel scoped requests or remove prior-client cache.
3. Business Impact had a special route rather than one dashboard parent.
4. Platform workspace is one 72.27 kB chunk even though only one tab is visible.
5. Data Hub is one 99.62 kB page with many tabs and eager query definitions.
6. Chart code is 395.51 kB and should be loaded only near visible charts.
7. The main shell remains 378.32 kB and needs vendor and icon analysis.
8. The inherited lockfile selected vulnerable `form-data` 4.0.5 through Axios. V2 pins the patched 4.0.6 transitive release; `npm audit --omit=dev` now reports zero vulnerabilities.

## Changes in this batch

- Added a client-scoped query-key factory.
- Added cancellation and prior-client cache removal on context change.
- Keyed route content by client so client-specific local filters reset safely.
- Added a lazy Unified Dashboards page that renders one dashboard only.
- Added a separate lazy Integration dashboard chunk.
- Added a static regression check for the route/lazy/cache foundation.

## Runtime measurements not yet claimed

Browser request count, first usable screen, time to interactive, dashboard switch time, client switch time, and repeated-navigation memory need automated browser collection against the V2 container. Those numbers are deliberately not invented here.

## Recommended budgets

| Budget | Target |
|---|---:|
| Main application shell | <= 300 kB raw, <= 100 kB gzip |
| Individual dashboard selector chunk | <= 15 kB gzip |
| Platform workspace tab chunk | <= 12 kB gzip per tab |
| Data Hub initial tab | <= 18 kB gzip |
| Client switch stale-data flash | 0 frames |
| Dashboard feedback | immediate fallback within 100 ms |
| Large list response | first server page <= 1 s on local deployment |
