import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  app: await readFile(resolve(root, 'src/app/App.tsx'), 'utf8'),
  dashboards: await readFile(resolve(root, 'src/pages/UnifiedDashboardsPage.tsx'), 'utf8'),
  queryKeys: await readFile(resolve(root, 'src/lib/queryKeys.ts'), 'utf8'),
  platform: await readFile(resolve(root, 'src/platform/PlatformContext.tsx'), 'utf8'),
  enterpriseAccess: await readFile(resolve(root, 'src/enterprise/EnterpriseAccessContext.tsx'), 'utf8'),
  enterpriseSelector: await readFile(resolve(root, 'src/enterprise/EnterpriseScopeSelector.tsx'), 'utf8'),
  enterpriseAdmin: await readFile(resolve(root, 'src/pages/EnterpriseAdminPage.tsx'), 'utf8'),
  enterpriseGovernance: await readFile(resolve(root, 'src/enterprise/EnterpriseGovernancePanel.tsx'), 'utf8'),
  dismissibleLayer: await readFile(resolve(root, 'src/lib/useDismissibleLayer.ts'), 'utf8'),
  dataHub: await readFile(resolve(root, 'src/pages/DataHubPage.tsx'), 'utf8'),
  platformDashboard: await readFile(resolve(root, 'src/pages/PlatformDashboardPage.tsx'), 'utf8'),
  rowActions: await readFile(resolve(root, 'src/components/RowActions.tsx'), 'utf8'),
};

const assertions = [
  ['canonical dashboards route', files.app.includes('path="/workspace/dashboards/:dashboardKey"')],
  ['single dashboards navigation', files.app.includes("{ to: '/workspace/dashboards', label: 'Dashboards'") && !files.app.includes("{ to: '/', label: 'Dashboard'")],
  ['legacy business impact redirect', files.app.includes('to="/workspace/dashboards/business-impact"')],
  ['reports route renders content directly', files.app.includes('path="/reports"') && files.app.includes('<BusinessImpactDashboard />') && !files.app.includes('path="/reports" element={<Navigate')],
  ['unified page is lazy', files.app.includes("lazy(() => import('../pages/UnifiedDashboardsPage')")],
  ['selected dashboards are lazy', files.dashboards.includes("lazy(() => import('./InventoryModulePage')")],
  ['client scope is in query keys', files.queryKeys.includes("['scope', clientScopeToken(clientId)]")],
  ['client switch cancels scoped requests', files.platform.includes('queryClient.cancelQueries')],
  ['client switch removes previous cache', files.platform.includes('queryClient.removeQueries')],
  ['enterprise scope switch cancels scoped requests', files.enterpriseAccess.includes('queryClient.cancelQueries')],
  ['enterprise scope switch removes previous cache', files.enterpriseAccess.includes('queryClient.removeQueries')],
  ['invalid enterprise access clears active context', files.enterpriseAccess.includes('effectiveAccessQuery.isError') && files.enterpriseAccess.includes('setActiveEnterpriseId(null)')],
  ['enterprise navigation comes from effective access', files.app.includes('visibleNavigation.items.flatMap')],
  ['enterprise administration route is protected', files.app.includes('<EnterpriseRoute user={user}')],
  ['scope selector exposes permitted-scope search', files.enterpriseSelector.includes('Search permitted scopes')],
  ['enterprise admin supports parallel hierarchy dimensions', files.enterpriseAdmin.includes("'geography' | 'business' | 'legal' | 'operational'")],
  ['enterprise admin exposes permission explanation', files.enterpriseGovernance.includes('Permission explanation')],
  ['dismissible layers close on outside pointer', files.dismissibleLayer.includes("addEventListener('pointerdown'") && files.dismissibleLayer.includes('composedPath')],
  ['dismissible layers close on Escape', files.dismissibleLayer.includes("event.key !== 'Escape'")],
  ['Data Hub menus and dialogs use shared dismissal', (files.dataHub.match(/useDismissibleLayer/g) ?? []).length >= 4],
  ['platform column filters use shared dismissal', files.platformDashboard.includes('const filterRef = useDismissibleLayer')],
  ['row action dialogs lock background scroll', files.rowActions.includes('lockBodyScroll: true')],
];

const failures = assertions.filter(([, passed]) => !passed);
for (const [name, passed] of assertions) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failures.length) process.exit(1);
