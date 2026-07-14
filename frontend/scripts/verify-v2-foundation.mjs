import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  app: await readFile(resolve(root, 'src/app/App.tsx'), 'utf8'),
  dashboards: await readFile(resolve(root, 'src/pages/UnifiedDashboardsPage.tsx'), 'utf8'),
  queryKeys: await readFile(resolve(root, 'src/lib/queryKeys.ts'), 'utf8'),
  platform: await readFile(resolve(root, 'src/platform/PlatformContext.tsx'), 'utf8'),
};

const assertions = [
  ['canonical dashboards route', files.app.includes('path="/workspace/dashboards/:dashboardKey"')],
  ['single dashboards navigation', files.app.includes("{ to: '/workspace/dashboards', label: 'Dashboards'") && !files.app.includes("{ to: '/', label: 'Dashboard'")],
  ['legacy business impact redirect', files.app.includes('to="/workspace/dashboards/business-impact"')],
  ['unified page is lazy', files.app.includes("lazy(() => import('../pages/UnifiedDashboardsPage')")],
  ['selected dashboards are lazy', files.dashboards.includes("lazy(() => import('./InventoryModulePage')")],
  ['client scope is in query keys', files.queryKeys.includes("['scope', clientScopeToken(clientId)]")],
  ['client switch cancels scoped requests', files.platform.includes('queryClient.cancelQueries')],
  ['client switch removes previous cache', files.platform.includes('queryClient.removeQueries')],
];

const failures = assertions.filter(([, passed]) => !passed);
for (const [name, passed] of assertions) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failures.length) process.exit(1);
