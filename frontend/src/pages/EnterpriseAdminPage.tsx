import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, KeyRound, Network, Search, ShieldCheck, Users } from 'lucide-react';

import { LoadingState } from '../components/LoadingState';
import { useEnterpriseAccess } from '../enterprise/EnterpriseAccessContext';
import { EnterpriseGovernancePanel, type GovernanceTab } from '../enterprise/EnterpriseGovernancePanel';
import { enterpriseQueryKeys } from '../lib/queryKeys';
import { backend } from '../services/api';
import type { RuntimeUser } from '../types';

const nodeTypes = ['legal_entity', 'business_unit', 'region', 'country', 'site_group', 'plant', 'department', 'area', 'line', 'shift', 'team'];
type EnterpriseAdminTab = 'structure' | 'roles' | 'access' | GovernanceTab;

export function EnterpriseAdminPage({ user }: { user: RuntimeUser }) {
  const queryClient = useQueryClient();
  const {
    enterprises,
    activeEnterprise,
    activeEnterpriseId,
    activeScope,
    effectiveAccess,
    selectEnterprise,
    canAny,
  } = useEnterpriseAccess();
  const [tab, setTab] = useState<EnterpriseAdminTab>('structure');
  const [search, setSearch] = useState('');
  const [supportReason, setSupportReason] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [nodeForm, setNodeForm] = useState<{
    node_type: string;
    code: string;
    name: string;
    parent_node_id: string;
    dimension: 'geography' | 'business' | 'legal' | 'operational';
  }>({ node_type: 'region', code: '', name: '', parent_node_id: '', dimension: 'geography' });
  const [relationshipForm, setRelationshipForm] = useState<{
    parent_node_id: string;
    child_node_id: string;
    dimension: 'geography' | 'business' | 'legal' | 'operational';
    reason: string;
  }>({ parent_node_id: '', child_node_id: '', dimension: 'business', reason: '' });
  const hierarchy = useQuery({
    queryKey: enterpriseQueryKeys.hierarchy({ enterpriseId: activeEnterpriseId, scopeType: activeScope?.type, scopeId: activeScope?.id }),
    queryFn: () => backend.enterpriseHierarchy(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && (canAny('organization.view', 'organization.manage') || user.role === 'super_admin')),
    retry: false,
  });
  const templates = useQuery({
    queryKey: enterpriseQueryKeys.roleTemplates({ enterpriseId: activeEnterpriseId }),
    queryFn: () => backend.roleTemplates(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && canAny('organization.view', 'roles.manage')),
    retry: false,
  });
  const createNode = useMutation({
    mutationFn: () => backend.createHierarchyNode(activeEnterpriseId!, {
      node_type: nodeForm.node_type,
      code: nodeForm.code,
      name: nodeForm.name,
      parent_node_id: nodeForm.parent_node_id || undefined,
      dimension: nodeForm.parent_node_id ? nodeForm.dimension : undefined,
    }),
    onSuccess: () => {
      setNodeForm({ node_type: 'region', code: '', name: '', parent_node_id: '', dimension: 'geography' });
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.hierarchy({ enterpriseId: activeEnterpriseId }) });
    },
  });
  const createRelationship = useMutation({
    mutationFn: () => backend.createHierarchyRelationship(activeEnterpriseId!, relationshipForm),
    onSuccess: () => {
      setRelationshipForm({ parent_node_id: '', child_node_id: '', dimension: 'business', reason: '' });
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.hierarchy({ enterpriseId: activeEnterpriseId }) });
    },
  });
  const supportAccess = useMutation({
    mutationFn: () => backend.createSupportAccess({
      enterprise_id: activeEnterpriseId!,
      reason: supportReason,
      duration_minutes: 60,
      capabilities: ['enterprise.view', 'organization.view', 'dashboard.view', 'audit.view', 'support.impersonate'],
      allowed_modules: [],
    }),
    onSuccess: () => {
      setSupportMessage('Support access is active for 60 minutes. Every action is audited.');
      setSupportReason('');
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.effectiveAccess(user.id, activeEnterpriseId) });
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.availableScopes(user.id, activeEnterpriseId) });
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.navigation(user.id, activeEnterpriseId) });
      void hierarchy.refetch();
    },
  });
  const normalizedSearch = search.trim().toLowerCase();
  const filteredNodes = useMemo(
    () => (hierarchy.data?.nodes ?? []).filter((node) => !normalizedSearch || `${node.name} ${node.code} ${node.node_type}`.toLowerCase().includes(normalizedSearch)),
    [hierarchy.data?.nodes, normalizedSearch],
  );

  if (!activeEnterprise) {
    return (
      <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
        <h1 className="text-xl font-semibold text-white">Enterprise Administration</h1>
        <p className="mt-1 text-sm text-slate-400">Select a customer enterprise. Platform access does not automatically expose its operational data.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {enterprises.map((enterprise) => (
            <button key={enterprise.id} className="rounded-lg border border-slate-600/45 bg-slate-950/30 p-4 text-left hover:border-cyan-300/45 hover:bg-cyan-400/[0.06]" onClick={() => selectEnterprise(enterprise.id)}>
              <p className="font-semibold text-white">{enterprise.name}</p>
              <p className="mt-1 text-xs text-slate-500">{enterprise.code} · {enterprise.default_currency}</p>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Global enterprise</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">{activeEnterprise.name}</h1>
          <p className="mt-1 text-sm text-slate-400">Parallel geography, business, legal, and operational scopes with effective-access explanations.</p>
        </div>
        <select className="form-input min-w-60" value={activeEnterprise.id} onChange={(event) => selectEnterprise(event.target.value)}>
          {enterprises.map((enterprise) => <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>)}
        </select>
      </section>

      {user.role === 'super_admin' && hierarchy.isError ? (
        <section className="rounded-lg border border-amber-300/25 bg-amber-400/[0.06] p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-amber-200" />
            <div className="flex-1">
              <h2 className="font-semibold text-white">Explicit support access required</h2>
              <p className="mt-1 text-sm text-slate-300">Platform administrators do not inherit customer-data access. Enter a business reason to open a visible, revocable, time-limited session.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input className="form-input flex-1" value={supportReason} onChange={(event) => setSupportReason(event.target.value)} placeholder="Reason for customer support access..." />
                <button className="form-button-primary" disabled={supportReason.trim().length < 10 || supportAccess.isPending} onClick={() => supportAccess.mutate()}>
                  Open 60-minute session
                </button>
              </div>
              {supportMessage ? <p className="mt-3 text-sm text-emerald-200">{supportMessage}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Network} label="Permitted scopes" value={hierarchy.data?.nodes.length ?? 0} />
        <Stat icon={ShieldCheck} label="Effective roles" value={effectiveAccess?.role_keys.length ?? 0} />
        <Stat icon={KeyRound} label="Capabilities" value={effectiveAccess?.capabilities.length ?? 0} />
        <Stat icon={Clock3} label="Expiring assignments" value={effectiveAccess?.assignments.filter((assignment) => assignment.valid_until).length ?? 0} />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-slate-700/45 bg-slate-900/45 p-2">
        {[
          ['structure', 'Enterprise Structure'],
          ['roles', 'Role Templates'],
          ['assignments', 'Role Assignments'],
          ['entitlements', 'Module Entitlements'],
          ['policies', 'Data Policies'],
          ['temporary', 'Temporary Access'],
          ['audit', 'Audit Log'],
          ['access', 'Effective Access'],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'form-button-primary min-w-max' : 'form-button-subtle min-w-max'} onClick={() => setTab(key as EnterpriseAdminTab)}>{label}</button>
        ))}
      </div>

      {tab === 'structure' ? (
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-white">Enterprise Structure</h2>
              <p className="text-sm text-slate-400">Nodes may participate in more than one dimension.</p>
            </div>
            <label className="relative md:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input className="form-input w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search structure..." /></label>
          </div>
          {canAny('organization.manage') ? (
            <div className="mt-4 space-y-3">
              <form
                className="grid gap-2 rounded-lg border border-slate-700/45 bg-slate-950/25 p-3 md:grid-cols-2 xl:grid-cols-[160px_160px_1fr_1fr_160px_auto]"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  createNode.mutate();
                }}
              >
                <select className="form-input" value={nodeForm.node_type} onChange={(event) => setNodeForm({ ...nodeForm, node_type: event.target.value })}>{nodeTypes.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select>
                <input className="form-input" placeholder="Code" value={nodeForm.code} onChange={(event) => setNodeForm({ ...nodeForm, code: event.target.value })} required />
                <input className="form-input" placeholder="Name" value={nodeForm.name} onChange={(event) => setNodeForm({ ...nodeForm, name: event.target.value })} required />
                <select className="form-input" value={nodeForm.parent_node_id} onChange={(event) => setNodeForm({ ...nodeForm, parent_node_id: event.target.value })}>
                  <option value="">No parent yet</option>
                  {(hierarchy.data?.nodes ?? []).map((node) => <option key={node.id} value={node.id}>{node.name} ({node.node_type.replace('_', ' ')})</option>)}
                </select>
                <select className="form-input" value={nodeForm.dimension} disabled={!nodeForm.parent_node_id} onChange={(event) => setNodeForm({ ...nodeForm, dimension: event.target.value as typeof nodeForm.dimension })}>
                  <option value="geography">Geography</option><option value="business">Business</option><option value="legal">Legal</option><option value="operational">Operational</option>
                </select>
                <button className="form-button-primary" disabled={createNode.isPending}>Add node</button>
              </form>
              <form
                className="grid gap-2 rounded-lg border border-slate-700/45 bg-slate-950/25 p-3 md:grid-cols-2 xl:grid-cols-[160px_1fr_1fr_1fr_auto]"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  createRelationship.mutate();
                }}
              >
                <select className="form-input" value={relationshipForm.dimension} onChange={(event) => setRelationshipForm({ ...relationshipForm, dimension: event.target.value as typeof relationshipForm.dimension })}>
                  <option value="geography">Geography</option><option value="business">Business</option><option value="legal">Legal</option><option value="operational">Operational</option>
                </select>
                <select className="form-input" required value={relationshipForm.parent_node_id} onChange={(event) => setRelationshipForm({ ...relationshipForm, parent_node_id: event.target.value })}><option value="">Parent node</option>{(hierarchy.data?.nodes ?? []).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select>
                <select className="form-input" required value={relationshipForm.child_node_id} onChange={(event) => setRelationshipForm({ ...relationshipForm, child_node_id: event.target.value })}><option value="">Child node</option>{(hierarchy.data?.nodes ?? []).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select>
                <input className="form-input" required minLength={5} placeholder="Relationship reason" value={relationshipForm.reason} onChange={(event) => setRelationshipForm({ ...relationshipForm, reason: event.target.value })} />
                <button className="form-button-subtle" disabled={createRelationship.isPending}>Link nodes</button>
              </form>
            </div>
          ) : null}
          {hierarchy.isLoading ? <LoadingState label="Loading permitted structure" /> : (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-700/45">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-[#0d1929] text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Name</th><th>Type</th><th>Code</th><th>Source</th><th>Status</th></tr></thead>
                <tbody>{filteredNodes.map((node) => <tr key={node.id} className="border-t border-slate-700/40"><td className="px-4 py-3 font-semibold text-white">{node.name}</td><td className="capitalize text-slate-300">{node.node_type.replace('_', ' ')}</td><td className="text-cyan-200">{node.code}</td><td className="text-slate-400">{node.source_entity_type ?? 'Native'}</td><td className="text-emerald-200">{node.status}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'roles' ? (
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
          <h2 className="font-semibold text-white">Role Templates</h2>
          <p className="text-sm text-slate-400">Capabilities, domains, modules, classifications, and read-only behavior are configured independently.</p>
          {templates.isLoading ? <LoadingState label="Loading role templates" /> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{(templates.data ?? []).map((role) => <article key={role.id} className="rounded-lg border border-slate-700/45 bg-slate-950/25 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{role.name}</h3><p className="mt-1 text-xs text-slate-500">{role.role_level} · {role.capabilities.length} capabilities</p></div>{role.read_only ? <span className="rounded-md border border-amber-300/25 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">Read only</span> : null}</div><p className="mt-3 text-sm text-slate-400">{role.description}</p><p className="mt-3 text-xs text-cyan-100">{role.default_domains.join(' · ') || 'Custom domains'}</p></article>)}</div>}
        </section>
      ) : null}

      {['assignments', 'entitlements', 'policies', 'temporary', 'audit'].includes(tab) ? (
        <EnterpriseGovernancePanel tab={tab as GovernanceTab} />
      ) : null}

      {tab === 'access' ? (
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
          <h2 className="font-semibold text-white">Why this user has access</h2>
          <p className="text-sm text-slate-400">Human-readable effective access for the signed-in identity.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(effectiveAccess?.assignments ?? []).map((assignment) => (
              <article key={`${assignment.scope_type}-${assignment.scope_id}`} className="rounded-lg border border-slate-700/45 bg-slate-950/25 p-4">
                <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /><div><p className="font-semibold capitalize text-white">{assignment.scope_type.replace('_', ' ')}</p><p className="text-xs text-slate-500">{assignment.scope_id}</p></div></div>
                <p className="mt-3 text-sm text-slate-300">Descendant access: {assignment.include_descendants ? 'Enabled' : 'Disabled'}</p>
                <p className="mt-1 text-sm text-slate-400">Domains: {assignment.domains.join(', ') || 'Role defaults'}</p>
                <p className="mt-1 text-sm text-slate-400">Valid until: {assignment.valid_until ?? 'No expiry'}</p>
              </article>
            ))}
            {!effectiveAccess?.assignments.length ? <div className="rounded-lg border border-slate-700/45 p-4 text-sm text-slate-400">Legacy compatibility mapping is active. Assign explicit scoped roles to complete migration.</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <div className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p><Icon className="h-4 w-4 text-cyan-200" /></div><p className="mt-3 text-2xl font-semibold text-white">{value}</p></div>;
}
