import { FormEvent, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  Boxes,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  FileText,
  Factory,
  Gauge,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wrench,
} from 'lucide-react';

import { LazyChunkBoundary } from '../components/LazyChunkBoundary';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { LoadingState } from '../components/LoadingState';
import { canAccessModule, canAccessPage, canAccessSection, firstAllowedPath } from '../lib/rbac';
import { apiConfig, backend } from '../services/api';
import type { RuntimeUser } from '../types';
import { PlatformProvider, usePlatform } from '../platform/PlatformContext';
import { initialPlatformState } from '../platform/data';
import type { PlatformClient, PlatformState, PlatformUser } from '../platform/types';

const AdminCenterPage = lazy(() => import('../pages/AdminCenterPage').then((module) => ({ default: module.AdminCenterPage })));
const DataHubPage = lazy(() => import('../pages/DataHubPage').then((module) => ({ default: module.DataHubPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const IntelligencePage = lazy(() => import('../pages/IntelligencePage').then((module) => ({ default: module.IntelligencePage })));
const InventoryModulePage = lazy(() => import('../pages/InventoryModulePage').then((module) => ({ default: module.InventoryModulePage })));
const ModuleWorkspacePage = lazy(() => import('../pages/ModuleWorkspacePage').then((module) => ({ default: module.ModuleWorkspacePage })));
const MaintenanceModulePage = lazy(() => import('../pages/MaintenanceModulePage').then((module) => ({ default: module.MaintenanceModulePage })));
const OperationsPage = lazy(() => import('../pages/OperationsPage').then((module) => ({ default: module.OperationsPage })));
const PlanningModulePage = lazy(() => import('../pages/PlanningModulePage').then((module) => ({ default: module.PlanningModulePage })));
const ProductionModulePage = lazy(() => import('../pages/ProductionModulePage').then((module) => ({ default: module.ProductionModulePage })));
const WarehouseModulePage = lazy(() => import('../pages/WarehouseModulePage').then((module) => ({ default: module.WarehouseModulePage })));
const ImpactDrilldownPage = lazy(() => import('../pages/ImpactDrilldownPage').then((module) => ({ default: module.ImpactDrilldownPage })));
const PlatformDashboardPage = lazy(() => import('../pages/PlatformDashboardPage').then((module) => ({ default: module.PlatformDashboardPage })));
const PlatformModulePage = lazy(() => import('../pages/PlatformModulePage').then((module) => ({ default: module.PlatformModulePage })));
const PerformancePage = lazy(() => import('../pages/PerformancePage').then((module) => ({ default: module.PerformancePage })));
const UnifiedDashboardsPage = lazy(() => import('../pages/UnifiedDashboardsPage').then((module) => ({ default: module.UnifiedDashboardsPage })));

const navItems = [
  { to: '/workspace/dashboards', label: 'Dashboards', icon: Gauge, section: 'dashboard' as const },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, section: 'admin' as const },
  { to: '/data-hub', label: 'Data Hub', icon: DatabaseZap, section: 'data-hub' as const },
  { to: '/planning', label: 'Planning', moduleName: 'Planning', icon: Gauge, section: 'operations' as const },
  { to: '/inventory', label: 'Inventory', moduleName: 'Inventory', icon: Boxes, section: 'operations' as const },
  { to: '/warehouse', label: 'Warehouse', moduleName: 'Warehouse', icon: Boxes, section: 'operations' as const },
  { to: '/production', label: 'Production', moduleName: 'Production', icon: Factory, section: 'operations' as const },
  { to: '/maintenance', label: 'Maintenance', moduleName: 'Maintenance', icon: Wrench, section: 'operations' as const },
  { to: '/quality', label: 'Quality', moduleName: 'Quality', icon: ShieldCheck, section: 'operations' as const },
  { to: '/procurement', label: 'Procurement', moduleName: 'Procurement', icon: ShoppingCart, section: 'operations' as const },
  { to: '/sales', label: 'Sales', moduleName: 'Sales & Distribution', icon: Truck, section: 'operations' as const },
  { to: '/costing', label: 'Costing', moduleName: 'Costing & Profitability', icon: Activity, section: 'operations' as const },
  { to: '/compliance', label: 'Compliance', moduleName: 'Compliance', icon: ShieldCheck, section: 'operations' as const },
  { to: '/customer-portal', label: 'Customer Portal', moduleName: 'Customer Portal', icon: BadgeCheck, section: 'operations' as const },
  { to: '/supplier-portal', label: 'Supplier Portal', moduleName: 'Supplier Portal', icon: Truck, section: 'operations' as const },
  { to: '/reports', label: 'Reports & Analytics', moduleName: 'Reports & Analytics', icon: FileText, section: 'operations' as const },
  { to: '/documents', label: 'Documents', moduleName: 'Document Management', icon: FileText, section: 'operations' as const },
];

const platformNavItems = [
  { to: '/platform', label: 'Platform', icon: LayoutDashboard },
  { to: '/workspace/dashboards', label: 'Dashboards', icon: Gauge },
  { to: '/admin', label: 'Admin', icon: ShieldCheck },
  { to: '/data-hub', label: 'Data Hub', icon: DatabaseZap },
  { to: '/admin/performance', label: 'Performance', icon: Activity },
];

const abcTestClientId = 'CLT-000001';

const rolePermissions: Record<RuntimeUser['role'], string[]> = {
  super_admin: ['platform.super_admin', 'platform.admin', 'account.override', 'organization.override', 'team.override', 'users.manage', 'roles.manage', 'data.write', 'data.read', 'audit.read', 'data.export', 'data.delete', 'approval.write'],
  account_owner: ['account.override', 'organization.override', 'team.override', 'users.manage', 'roles.manage', 'data.write', 'data.read', 'audit.read', 'data.export', 'approval.write'],
  organization_admin: ['organization.override', 'team.override', 'users.manage', 'data.write', 'data.read', 'audit.read', 'data.export', 'approval.write'],
  admin: ['platform.admin', 'users.manage', 'data.write', 'data.read', 'audit.read', 'data.export', 'approval.write'],
  team_manager: ['team.override', 'data.write', 'data.read', 'data.export', 'approval.write'],
  supervisor: ['data.write', 'data.read', 'data.export'],
  operator: ['data.read'],
  auditor: ['data.read', 'audit.read', 'data.export'],
  qa_tester: ['quality.write', 'data.read', 'data.export'],
  custom: ['data.read'],
  user: ['data.read'],
};

function platformRoleToRuntimeRole(platformUser: PlatformUser): RuntimeUser['role'] {
  const roles = platformUser.roles.map((role) => role.toLowerCase());
  if (roles.some((role) => role.includes('super'))) return 'super_admin';
  if (roles.some((role) => role.includes('account owner'))) return 'account_owner';
  if (roles.some((role) => role.includes('organization'))) return 'organization_admin';
  if (roles.some((role) => role.includes('company admin') || role === 'admin')) return 'admin';
  if (roles.some((role) => role.includes('manager'))) return 'team_manager';
  if (roles.some((role) => role.includes('supervisor'))) return 'supervisor';
  if (roles.some((role) => role.includes('operator') || role.includes('technician'))) return 'operator';
  if (roles.some((role) => role.includes('auditor'))) return 'auditor';
  if (roles.some((role) => role.includes('quality') || role.includes('qa'))) return 'qa_tester';
  if (roles.some((role) => role.includes('custom'))) return 'custom';
  return 'user';
}

function getPlatformUsersForImpersonation(): PlatformUser[] {
  try {
    const savedState = localStorage.getItem('metam.platform.demo.v1');
    const state = savedState ? JSON.parse(savedState) as PlatformState : initialPlatformState;
    const usersByEmail = new Map<string, PlatformUser>();
    state.users.forEach((user) => usersByEmail.set(user.email.toLowerCase(), user));
    initialPlatformState.users.forEach((user) => usersByEmail.set(user.email.toLowerCase(), user));
    return Array.from(usersByEmail.values());
  } catch {
    return initialPlatformState.users;
  }
}

function buildImpersonatedAbcUser(baseUser: RuntimeUser, impersonatedEmail: string | null): RuntimeUser {
  if (baseUser.role !== 'super_admin' || !impersonatedEmail) return baseUser;
  const platformUser = getPlatformUsersForImpersonation().find(
    (user) => user.email.toLowerCase() === impersonatedEmail.toLowerCase() && user.clientId === abcTestClientId,
  );
  if (!platformUser) return baseUser;
  const role = platformRoleToRuntimeRole(platformUser);
  return {
    ...baseUser,
    id: platformUser.userId,
    company_id: 'company-abc-manufacturing',
    plant_id: platformUser.plant && platformUser.plant !== 'All Plants' ? `plant-abc-${platformUser.plant.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : null,
    email: platformUser.email,
    name: platformUser.fullName,
    role,
    permissions: rolePermissions[role],
    demo_read_only: false,
    demo_role: role,
    assigned_modules: platformUser.assignedModules,
    assigned_applications: platformUser.assignedApplications,
    scope_plant_name: platformUser.plant,
    scope_warehouse_name: platformUser.warehouse,
    scope_department: platformUser.department,
  };
}

function ClientContextSelector({
  clients,
  selectedClientId,
  canSelectPlatform,
  platformUserClientId,
  onSelect,
}: {
  clients: PlatformClient[];
  selectedClientId: string | null;
  canSelectPlatform: boolean;
  platformUserClientId?: string | null;
  onSelect: (clientId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const availableClients = clients.filter((client) => canSelectPlatform || client.clientId === platformUserClientId);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredClients = availableClients.filter((client) =>
    !normalizedSearch || `${client.clientName} ${client.clientId} ${client.market} ${client.region}`.toLowerCase().includes(normalizedSearch));
  const selectedClient = clients.find((client) => client.clientId === selectedClientId);

  return (
    <div className="relative w-[min(260px,72vw)]">
      <button
        type="button"
        className="form-input flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{selectedClient?.clientName ?? 'Platform View'}</span>
        <span className="text-slate-400">v</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(360px,86vw)] rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <input
            className="form-input w-full py-2 text-sm"
            placeholder="Search clients..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <div className="mt-2 max-h-64 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.55)_rgba(255,255,255,0.05)]">
            {canSelectPlatform && (!normalizedSearch || 'platform view'.includes(normalizedSearch)) ? (
              <button
                type="button"
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition ${
                  selectedClientId === null ? 'bg-cyan-400/18 text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="font-semibold">Platform View</span>
                <span className="text-xs text-slate-500">All clients / platform administration</span>
              </button>
            ) : null}
            {filteredClients.map((client) => (
              <button
                key={client.clientId}
                type="button"
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition ${
                  client.clientId === selectedClientId ? 'bg-cyan-400/18 text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                onClick={() => {
                  onSelect(client.clientId);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="font-semibold">{client.clientName}</span>
                <span className="text-xs text-slate-500">{client.clientId} · {client.region} / {client.market}</span>
              </button>
            ))}
            {!filteredClients.length && (!canSelectPlatform || normalizedSearch !== 'platform view') ? (
              <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">No clients matched.</div>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-slate-500">{filteredClients.length} of {availableClients.length} clients</div>
        </div>
      ) : null}
    </div>
  );
}

function SuperAdminImpersonationAccess({
  value,
  activeName,
  onChange,
  onBack,
}: {
  value: string;
  activeName?: string;
  onChange: (email: string | null) => void;
  onBack: () => void;
}) {
  const abcUsers = getPlatformUsersForImpersonation().filter((user) => user.clientId === abcTestClientId && user.status === 'Active');
  return (
    <div className="hidden min-w-[300px] lg:block">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Impersonate by email</span>
        {value ? (
          <button
            type="button"
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200 hover:text-amber-100"
            onClick={onBack}
          >
            Back to my profile
          </button>
        ) : null}
      </div>
      <select
        className="form-input w-full py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Select user email...</option>
        {abcUsers.map((item) => (
          <option key={item.userId} value={item.email}>{item.email} - {item.fullName}</option>
        ))}
      </select>
      {value ? <p className="mt-1 truncate text-xs text-amber-200">Acting as {activeName ?? value}</p> : null}
    </div>
  );
}

export function App() {
  const baseUrl = useMemo(() => apiConfig.baseUrl, []);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [passwordPromptSkippedFor, setPasswordPromptSkippedFor] = useState<string | null>(null);
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(null);
  const session = useQuery({
    queryKey: ['runtime-session', sessionVersion],
    queryFn: backend.currentUser,
    retry: false,
  });

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-[28px] border border-white/15 bg-white/8 px-6 py-4 text-sm text-slate-200 shadow-[0_24px_70px_rgba(15,23,42,0.2)] backdrop-blur-xl">
          Checking secure session...
        </div>
      </div>
    );
  }

  if (session.isError || !session.data) {
    return <LoginScreen onLogin={() => setSessionVersion((value) => value + 1)} baseUrl={baseUrl} />;
  }

  const user = session.data;
  const effectiveUser = buildImpersonatedAbcUser(user, impersonatedEmail);
  const shouldShowPasswordPrompt = !user.demo_read_only && (user.force_password_change || user.password_expiry_warning) && passwordPromptSkippedFor !== user.id;
  if (shouldShowPasswordPrompt) {
    return (
      <PasswordChangeGate
        user={user}
        onChanged={() => {
          setPasswordPromptSkippedFor(null);
          setSessionVersion((value) => value + 1);
        }}
        onSkip={() => setPasswordPromptSkippedFor(user.id)}
      />
    );
  }
  return (
    <PlatformProvider key={effectiveUser.email} runtimeUser={effectiveUser}>
      <AuthenticatedApp
        user={effectiveUser}
        canImpersonate={user.role === 'super_admin'}
        impersonatedEmail={impersonatedEmail}
        onImpersonationChange={setImpersonatedEmail}
        onLogout={() => {
          setImpersonatedEmail(null);
          setSessionVersion((value) => value + 1);
        }}
      />
    </PlatformProvider>
  );
}

function AuthenticatedApp({
  user,
  canImpersonate,
  impersonatedEmail,
  onImpersonationChange,
  onLogout,
}: {
  user: RuntimeUser;
  canImpersonate: boolean;
  impersonatedEmail: string | null;
  onImpersonationChange: (email: string | null) => void;
  onLogout: () => void;
}) {
  const { state, selectedClientId, selectedClient, isPlatformContext, canSelectPlatform, selectClient, platformUser } = usePlatform();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => sessionStorage.getItem('metam-sidebar-expanded') === 'true');
  const permissionContext = useMemo(
    () => ({ user, selectedClient, platformUser, isPlatformContext }),
    [user, selectedClient, platformUser, isPlatformContext],
  );
  const allowedNavItems = isPlatformContext
    ? platformNavItems.filter((item) => canAccessPage(permissionContext, item.to))
    : navItems.filter((item) => canAccessPage(permissionContext, item.to));
  const allowedFallbackPath = allowedNavItems[0]?.to ?? firstAllowedPath(permissionContext, [...platformNavItems.map((item) => item.to), ...navItems.map((item) => item.to)]);

  useEffect(() => {
    sessionStorage.setItem('metam-sidebar-expanded', String(sidebarExpanded));
  }, [sidebarExpanded]);

  useEffect(() => {
    if (selectedClientId !== abcTestClientId && impersonatedEmail) onImpersonationChange(null);
  }, [impersonatedEmail, onImpersonationChange, selectedClientId]);

  useEffect(() => {
    if (!canAccessPage(permissionContext, location.pathname)) {
      navigate(allowedFallbackPath, { replace: true });
    }
  }, [allowedFallbackPath, location.pathname, navigate, permissionContext]);

  return (
    <div className="app-shell min-h-screen bg-background text-white">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-slate-950/70 backdrop-blur-xl transition-all duration-200 xl:block ${
          sidebarExpanded ? 'w-64' : 'w-20'
        }`}
      >
        <div className={`flex h-16 items-center border-b border-white/10 px-4 ${sidebarExpanded ? 'justify-between gap-3' : 'justify-center'}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
            <Boxes className="h-5 w-5" />
          </div>
          {sidebarExpanded ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">METAM</p>
                <p className="text-xs text-slate-400">Services · Version 2.0</p>
              </div>
              <button
                type="button"
                className="focus-ring rounded-xl border border-white/10 bg-white/8 p-2 text-slate-300 hover:bg-white/12 hover:text-white"
                aria-label="Hide sidebar names"
                onClick={() => setSidebarExpanded(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
        {sidebarExpanded ? (
          <div className="px-4 pt-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Signed in</p>
              <p className="mt-2 truncate text-sm font-semibold text-white">{platformUser.fullName}</p>
              <p className="mt-1 text-sm text-slate-300">{user.email}</p>
               <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-cyan-100">
                <BadgeCheck className="h-3.5 w-3.5" />
                 {user.role.replace('_', ' ')}
               </div>
               {user.demo_read_only ? <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">Read-only demo</div> : null}
            </div>
          </div>
        ) : (
          <div className="px-3 pt-4">
            <button
              type="button"
              className="focus-ring flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-cyan-100 hover:bg-white/8"
              aria-label="Show sidebar names"
              onClick={() => setSidebarExpanded(true)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
        <nav className="space-y-1 p-3">
          {allowedNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarExpanded(false)}
              className={({ isActive }) =>
                `group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'border border-cyan-300/20 bg-cyan-400/10 text-white'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                } ${sidebarExpanded ? 'gap-3 justify-start' : 'justify-center'}`
              }
              title={sidebarExpanded ? undefined : item.label}
            >
              <item.icon className="h-4 w-4" />
              {sidebarExpanded ? item.label : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className={`transition-all duration-200 ${sidebarExpanded ? 'xl:pl-64' : 'xl:pl-20'}`}>
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
             <div className="flex items-center gap-3">
               {user.demo_read_only ? (
                 <div className="hidden rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 sm:block">
                   Read-only role demo
                 </div>
               ) : null}
              <button className="focus-ring rounded-xl border border-white/10 bg-white/8 p-2 text-slate-100 xl:hidden" aria-label="Open navigation">
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <ClientContextSelector
                  clients={state.clients}
                  selectedClientId={selectedClientId}
                  canSelectPlatform={canSelectPlatform}
                  platformUserClientId={platformUser.clientId}
                  onSelect={(clientId) => {
                    selectClient(clientId);
                    if (clientId === null) {
                      navigate('/platform');
                      return;
                    }
                    if (location.pathname.startsWith('/platform')) navigate('/');
                  }}
                />
                <p className="hidden truncate text-xs text-slate-400 sm:block">{isPlatformContext ? 'Platform Context · USD' : `${selectedClient?.clientId} · ${selectedClient?.currency}`}</p>
              </div>
              {selectedClientId === abcTestClientId && canImpersonate ? (
                <SuperAdminImpersonationAccess
                  value={impersonatedEmail ?? ''}
                  activeName={impersonatedEmail ? user.name : undefined}
                  onChange={onImpersonationChange}
                  onBack={() => onImpersonationChange(null)}
                />
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs text-slate-300 sm:flex">
                <Activity className="h-3.5 w-3.5 text-cyan-200" />
                {allowedNavItems.length} sections
              </div>
              <button
                className="focus-ring rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/12"
                onClick={() => {
                  backend.logout();
                  onLogout();
                }}
              >
                {user.demo_read_only ? 'Switch role' : 'Sign out'}
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 xl:hidden">
            {allowedNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                    isActive ? 'border border-cyan-300/20 bg-cyan-400/10 text-white' : 'text-slate-400'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1920px] px-4 py-6 sm:px-6 2xl:px-8">
          <Breadcrumbs />
          <div key={selectedClientId ?? 'platform'}>
          <LazyChunkBoundary label="Workspace view">
            <Suspense fallback={<LoadingState label="Loading workspace view" />}>
              <Routes>
              <Route path="/" element={isPlatformContext ? <PlatformDashboardPage /> : <Navigate to="/workspace/dashboards/executive" replace />} />
              <Route path="/platform" element={<PlatformOnly user={user} fallbackPath={allowedFallbackPath}>{isPlatformContext ? <PlatformDashboardPage /> : <DashboardPage user={user} />}</PlatformOnly>} />
              <Route path="/platform/modules/:moduleName" element={<PlatformOnly user={user} fallbackPath={allowedFallbackPath}><PlatformModulePage /></PlatformOnly>} />
              <Route path="/platform/widgets" element={<Navigate to="/platform?workspace=modules" replace />} />
              <Route path="/admin/clients" element={<Navigate to="/platform?workspace=clients" replace />} />
              <Route path="/admin/clients/create" element={<Navigate to="/platform?workspace=clients" replace />} />
              <Route path="/admin/clients/:clientId/edit" element={<Navigate to="/platform?workspace=clients" replace />} />
              <Route path="/admin/clients/:clientId/health" element={<Navigate to="/platform?workspace=clients" replace />} />
              <Route path="/admin/users" element={<Navigate to="/platform?workspace=users" replace />} />
              <Route path="/admin/users/create" element={<Navigate to="/platform?workspace=users" replace />} />
              <Route path="/workspace/dashboards" element={<UnifiedDashboardsPage user={user} />} />
              <Route path="/workspace/dashboards/:dashboardKey" element={<UnifiedDashboardsPage user={user} />} />
              <Route path="/dashboard/business-impact" element={<Navigate to="/workspace/dashboards/business-impact" replace />} />
              <Route path="/dashboard/:focus" element={<Navigate to="/workspace/dashboards/executive" replace />} />
              <Route path="/admin" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><Navigate to="/admin/company" replace /></ProtectedRoute>} />
              <Route path="/admin/company" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="company" user={user} /></ProtectedRoute>} />
              <Route path="/admin/roles" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="roles" user={user} /></ProtectedRoute>} />
              <Route path="/admin/access" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="access" user={user} /></ProtectedRoute>} />
              <Route path="/admin/modules" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="modules" user={user} /></ProtectedRoute>} />
              <Route path="/admin/dashboards" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="dashboards" user={user} /></ProtectedRoute>} />
              <Route path="/admin/data-scope" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="data-scope" user={user} /></ProtectedRoute>} />
              <Route path="/admin/audit" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="audit" user={user} /></ProtectedRoute>} />
              <Route path="/admin/recommendations" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="recommendations" user={user} /></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><AdminCenterPage section="settings" user={user} /></ProtectedRoute>} />
              <Route path="/admin/performance" element={<ProtectedRoute user={user} section="admin" fallbackPath={allowedFallbackPath}><PerformancePage /></ProtectedRoute>} />
              <Route path="/data-hub" element={<ProtectedRoute user={user} section="data-hub" fallbackPath={allowedFallbackPath}><DataHubPage user={user} /></ProtectedRoute>} />
              <Route path="/operations" element={<ProtectedRoute user={user} section="operations" fallbackPath={allowedFallbackPath}><OperationsPage user={user} /></ProtectedRoute>} />
              <Route path="/intelligence" element={<ProtectedRoute user={user} section="intelligence" fallbackPath={allowedFallbackPath}><IntelligencePage /></ProtectedRoute>} />
              <Route path="/planning/*" element={<ModuleRoute user={user} moduleName="Planning" fallbackPath={allowedFallbackPath}><PlanningModulePage user={user} /></ModuleRoute>} />
              <Route path="/inventory/*" element={<ModuleRoute user={user} moduleName="Inventory" fallbackPath={allowedFallbackPath}><InventoryModulePage user={user} /></ModuleRoute>} />
              <Route path="/warehouse/*" element={<ModuleRoute user={user} moduleName="Warehouse" fallbackPath={allowedFallbackPath}><WarehouseModulePage user={user} /></ModuleRoute>} />
              <Route path="/production/*" element={<ModuleRoute user={user} moduleName="Production" fallbackPath={allowedFallbackPath}><ProductionModulePage user={user} /></ModuleRoute>} />
              <Route path="/maintenance/*" element={<ModuleRoute user={user} moduleName="Maintenance" fallbackPath={allowedFallbackPath}><MaintenanceModulePage user={user} /></ModuleRoute>} />
              <Route path="/quality" element={<ModuleRoute user={user} moduleName="Quality" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="quality" user={user} /></ModuleRoute>} />
              <Route path="/procurement" element={<ModuleRoute user={user} moduleName="Procurement" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="procurement" user={user} /></ModuleRoute>} />
              <Route path="/sales" element={<ModuleRoute user={user} moduleName="Sales & Distribution" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="sales" user={user} /></ModuleRoute>} />
              <Route path="/costing" element={<ModuleRoute user={user} moduleName="Costing & Profitability" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="costing" user={user} /></ModuleRoute>} />
              <Route path="/compliance" element={<ModuleRoute user={user} moduleName="Compliance" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="compliance" user={user} /></ModuleRoute>} />
              <Route path="/customer-portal" element={<ModuleRoute user={user} moduleName="Customer Portal" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="customer-portal" user={user} /></ModuleRoute>} />
              <Route path="/supplier-portal" element={<ModuleRoute user={user} moduleName="Supplier Portal" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="supplier-portal" user={user} /></ModuleRoute>} />
              <Route path="/reports" element={<Navigate to="/workspace/dashboards/business-impact" replace />} />
              <Route path="/documents" element={<ModuleRoute user={user} moduleName="Document Management" fallbackPath={allowedFallbackPath}><ModuleWorkspacePage moduleKey="documents" user={user} /></ModuleRoute>} />
              <Route path="/impact/:module/:metric" element={<ProtectedRoute user={user} section="operations" fallbackPath={allowedFallbackPath}><ImpactDrilldownPage /></ProtectedRoute>} />
              </Routes>
            </Suspense>
          </LazyChunkBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({
  user,
  section,
  fallbackPath,
  children,
}: {
  user: RuntimeUser;
  section: 'admin' | 'data-hub' | 'operations' | 'intelligence';
  fallbackPath: string;
  children: ReactNode;
}) {
  if (!canAccessSection(user, section)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
}

function ModuleRoute({ user, moduleName, fallbackPath, children }: { user: RuntimeUser; moduleName: string; fallbackPath: string; children: ReactNode }) {
  const { selectedClient, platformUser, isPlatformContext } = usePlatform();

  if (!canAccessModule({ user, selectedClient, platformUser, isPlatformContext }, moduleName)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
}

function PlatformOnly({ user, fallbackPath, children }: { user: RuntimeUser; fallbackPath: string; children: ReactNode }) {
  if (user.role !== 'super_admin') {
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
}

function LoginScreen({ onLogin, baseUrl }: { onLogin: () => void; baseUrl: string }) {
  const resetToken = new URLSearchParams(window.location.search).get('token');
  const isResetPath = window.location.pathname.includes('reset-password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [demoSubmittingRole, setDemoSubmittingRole] = useState<RuntimeUser['role'] | null>(null);
  const demoConfig = useQuery({
    queryKey: ['public-demo-config'],
    queryFn: backend.demoConfig,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isResetPath && resetToken) {
    return <ResetPasswordScreen token={resetToken} onComplete={() => { window.history.replaceState({}, '', '/'); setForgotMode(false); }} />;
  }

  if (forgotMode) {
    return <ForgotPasswordScreen onBack={() => setForgotMode(false)} />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await backend.login(email, password);
      onLogin();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function startDemo(role: RuntimeUser['role']) {
    setDemoSubmittingRole(role);
    setError('');
    try {
      await backend.demoLogin(role);
      onLogin();
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : 'Unable to start the role demo');
    } finally {
      setDemoSubmittingRole(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={`w-full rounded-[36px] border border-white/12 bg-white/8 p-7 shadow-[0_30px_90px_rgba(15,23,42,0.24)] backdrop-blur-2xl ${demoConfig.data?.enabled ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/15 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.24)]">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Metam Services</h1>
            <p className="text-sm text-slate-300">Full-stack runtime: {baseUrl}</p>
          </div>
        </div>

        {demoConfig.data?.enabled && demoConfig.data.roles.length ? (
          <section className="mb-6 rounded-3xl border border-cyan-300/20 bg-slate-950/35 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Passwordless role preview</p>
                <p className="mt-1 text-xs text-slate-400">Choose a role to document its real navigation and data. All changes are blocked by the backend.</p>
              </div>
              <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">Read-only · {demoConfig.data.session_minutes} min</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {demoConfig.data.roles.map((item) => (
                <button
                  key={item.role}
                  type="button"
                  className="focus-ring rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-400/10 disabled:opacity-60"
                  disabled={demoSubmittingRole !== null}
                  onClick={() => startDemo(item.role)}
                >
                  <span className="block text-sm font-semibold text-white">{demoSubmittingRole === item.role ? 'Opening...' : item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{item.description}</span>
                  <span className="mt-2 block truncate text-xs text-cyan-200">{item.username}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <form className="space-y-4" onSubmit={submit}>
          {demoConfig.data?.enabled ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Authorized user sign in</p> : null}
          <label className="block text-sm font-medium text-slate-200">
            Email
            <input className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-slate-500" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-slate-500" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
          <button className="focus-ring w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.2)] disabled:opacity-60" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
          <button type="button" className="w-full text-center text-sm font-medium text-cyan-200 hover:text-cyan-100" onClick={() => setForgotMode(true)}>
            Forgot password?
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/8 p-4 text-xs text-slate-300">Passwords are never displayed. Documentation visitors should use the read-only role preview.</div>
      </div>
    </div>
  );
}

function PasswordChangeGate({ user, onChanged, onSkip }: { user: RuntimeUser; onChanged: () => void; onSkip: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generated, setGenerated] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const criteria = loginPasswordCriteria(newPassword);
  const force = Boolean(user.force_password_change);

  async function generate() {
    try {
      const response = await backend.generatePassword();
      setNewPassword(response.password);
      setConfirmPassword(response.password);
      setGenerated(response.password);
    } catch {
      const fallback = generateBrowserPassword();
      setNewPassword(fallback);
      setConfirmPassword(fallback);
      setGenerated(fallback);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await backend.changePassword({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword });
      setMessage('Password updated successfully.');
      onChanged();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Password update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-[36px] border border-white/12 bg-white/8 p-7 shadow-[0_30px_90px_rgba(15,23,42,0.24)] backdrop-blur-2xl">
        <h1 className="text-xl font-semibold text-white">{force ? 'Create a new password to continue' : 'Your password expires soon'}</h1>
        <p className="mt-2 text-sm text-slate-300">
          {force ? 'Your administrator requires a password change before entering the platform.' : `Your password expires in ${user.password_days_to_expiry ?? 'a few'} days. You can update it now or skip this reminder.`}
        </p>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <input className="form-input w-full" type="password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input className="form-input w-full" type="password" placeholder="New password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <button type="button" className="form-button-subtle" onClick={generate}>Auto Generate</button>
          </div>
          <input className="form-input w-full" type="password" placeholder="Re-enter new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          {generated ? <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">Generated password: <span className="font-mono font-semibold">{generated}</span></div> : null}
          <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">{criteria.map((item) => <span key={item.label} className={item.met ? 'text-emerald-200' : 'text-slate-500'}>{item.met ? '[OK]' : '[ ]'} {item.label}</span>)}</div>
          {error ? <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
          {message ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {!force ? <button type="button" className="form-button-subtle" onClick={onSkip}>Skip for now</button> : null}
            <button className="form-button-primary" disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const response = await backend.forgotPassword(email);
      setResult(response.reset_link ? `Demo reset link: ${window.location.origin}${response.reset_link}` : 'If this email exists, a reset link will be sent.');
    } catch (forgotError) {
      setError(forgotError instanceof Error ? forgotError.message : 'Unable to request password reset');
    }
  }

  return (
    <AuthCard title="Forgot Password" subtitle="Enter your email. A secure reset link is sent to the registered mailbox.">
      <form className="space-y-4" onSubmit={submit}>
        <input className="form-input w-full" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} />
        {result ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{result}</div> : null}
        {error ? <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        <button className="form-button-primary w-full">Send Reset Link</button>
        <button type="button" className="form-button-subtle w-full" onClick={onBack}>Back to Sign In</button>
      </form>
    </AuthCard>
  );
}

function ResetPasswordScreen({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await backend.resetPassword({ token, new_password: newPassword, confirm_password: confirmPassword });
      setMessage('Password updated. Return to sign in with your new password.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password');
    }
  }

  return (
    <AuthCard title="Create New Password" subtitle="Use the reset link to create a protected password.">
      <form className="space-y-4" onSubmit={submit}>
        <input className="form-input w-full" type="password" placeholder="New password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        <input className="form-input w-full" type="password" placeholder="Re-enter new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">{loginPasswordCriteria(newPassword).map((item) => <span key={item.label} className={item.met ? 'text-emerald-200' : 'text-slate-500'}>{item.met ? '[OK]' : '[ ]'} {item.label}</span>)}</div>
        {message ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
        {error ? <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        <button className="form-button-primary w-full">Update Password</button>
        {message ? <button type="button" className="form-button-subtle w-full" onClick={onComplete}>Back to Sign In</button> : null}
      </form>
    </AuthCard>
  );
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-[36px] border border-white/12 bg-white/8 p-7 shadow-[0_30px_90px_rgba(15,23,42,0.24)] backdrop-blur-2xl">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function loginPasswordCriteria(password: string) {
  return [
    { label: 'At least 12 characters', met: password.length >= 12 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /\d/.test(password) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function generateBrowserPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%^&*';
  const all = upper + lower + numbers + special;
  const chars = [upper, lower, numbers, special].map((set) => set[Math.floor(Math.random() * set.length)]);
  while (chars.length < 16) chars.push(all[Math.floor(Math.random() * all.length)]);
  return chars.sort(() => Math.random() - 0.5).join('');
}
