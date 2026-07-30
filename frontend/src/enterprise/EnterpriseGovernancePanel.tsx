import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, FileKey2, ShieldCheck, UserRoundCog } from 'lucide-react';

import { LoadingState } from '../components/LoadingState';
import { enterpriseQueryKeys } from '../lib/queryKeys';
import { backend } from '../services/api';
import { useEnterpriseAccess } from './EnterpriseAccessContext';

export type GovernanceTab = 'assignments' | 'entitlements' | 'policies' | 'temporary' | 'audit';

const classifications = [
  'public',
  'internal',
  'confidential',
  'restricted',
  'personal',
  'financial',
  'security_sensitive',
  'medical_or_safety_sensitive',
];

export function EnterpriseGovernancePanel({ tab }: { tab: GovernanceTab }) {
  const queryClient = useQueryClient();
  const { activeEnterpriseId, activeScope, canAny } = useEnterpriseAccess();
  const context = { enterpriseId: activeEnterpriseId, scopeType: activeScope?.type, scopeId: activeScope?.id };
  const members = useQuery({
    queryKey: enterpriseQueryKeys.members(context),
    queryFn: () => backend.enterpriseMembers(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'assignments' && canAny('users.view', 'users.assign_roles')),
    retry: false,
  });
  const templates = useQuery({
    queryKey: enterpriseQueryKeys.roleTemplates(context),
    queryFn: () => backend.roleTemplates(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'assignments'),
    retry: false,
  });
  const hierarchy = useQuery({
    queryKey: enterpriseQueryKeys.hierarchy(context),
    queryFn: () => backend.enterpriseHierarchy(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'assignments'),
    retry: false,
  });
  const entitlements = useQuery({
    queryKey: enterpriseQueryKeys.entitlements(context),
    queryFn: () => backend.moduleEntitlements(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'entitlements'),
    retry: false,
  });
  const policies = useQuery({
    queryKey: enterpriseQueryKeys.dataPolicies(context),
    queryFn: () => backend.dataPolicies(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'policies'),
    retry: false,
  });
  const temporary = useQuery({
    queryKey: enterpriseQueryKeys.temporaryAccess(context),
    queryFn: () => backend.temporaryAccess(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'temporary'),
    retry: false,
  });
  const support = useQuery({
    queryKey: enterpriseQueryKeys.supportSessions(context),
    queryFn: () => backend.supportAccessSessions(activeEnterpriseId!),
    enabled: Boolean(activeEnterpriseId && tab === 'temporary'),
    retry: false,
  });
  const audit = useQuery({
    queryKey: enterpriseQueryKeys.audit(context),
    queryFn: () => backend.enterpriseAuditEvents(activeEnterpriseId!, 150),
    enabled: Boolean(activeEnterpriseId && tab === 'audit'),
    retry: false,
  });

  if (!activeEnterpriseId) return null;

  if (tab === 'assignments') {
    return (
      <RoleAssignmentsPanel
        enterpriseId={activeEnterpriseId}
        members={members.data ?? []}
        templates={templates.data ?? []}
        scopes={hierarchy.data?.nodes ?? []}
        loading={members.isLoading || templates.isLoading || hierarchy.isLoading}
        invalidate={() => queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.members(context) })}
      />
    );
  }
  if (tab === 'entitlements') {
    return (
      <EntitlementsPanel
        enterpriseId={activeEnterpriseId}
        rows={entitlements.data ?? []}
        loading={entitlements.isLoading}
        canManage={canAny('settings.manage')}
        refresh={() => queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.entitlements(context) })}
      />
    );
  }
  if (tab === 'policies') {
    return (
      <DataPoliciesPanel
        enterpriseId={activeEnterpriseId}
        rows={policies.data ?? []}
        loading={policies.isLoading}
        canManage={canAny('settings.manage')}
        refresh={() => queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.dataPolicies(context) })}
      />
    );
  }
  if (tab === 'temporary') {
    return (
      <AccessSessionsPanel
        temporary={temporary.data ?? []}
        support={support.data ?? []}
        loading={temporary.isLoading || support.isLoading}
      />
    );
  }
  return <AuditPanel rows={audit.data ?? []} loading={audit.isLoading} />;
}

function RoleAssignmentsPanel({
  enterpriseId,
  members,
  templates,
  scopes,
  loading,
  invalidate,
}: {
  enterpriseId: string;
  members: Awaited<ReturnType<typeof backend.enterpriseMembers>>;
  templates: Awaited<ReturnType<typeof backend.roleTemplates>>;
  scopes: Awaited<ReturnType<typeof backend.enterpriseHierarchy>>['nodes'];
  loading: boolean;
  invalidate: () => void;
}) {
  const queryClient = useQueryClient();
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [form, setForm] = useState({
    role_template_id: '',
    scope_id: enterpriseId,
    include_descendants: false,
    valid_until: '',
    reason: '',
  });
  const [capability, setCapability] = useState('dashboard.view');
  const visibleMembers = useMemo(() => {
    const normalized = memberSearch.trim().toLowerCase();
    return members.filter(({ user }) => !normalized || `${user.name} ${user.email}`.toLowerCase().includes(normalized));
  }, [memberSearch, members]);
  useEffect(() => {
    if (!selectedUserId && visibleMembers[0]) setSelectedUserId(visibleMembers[0].user.id);
  }, [selectedUserId, visibleMembers]);
  useEffect(() => {
    if (!form.role_template_id && templates[0]) setForm((current) => ({ ...current, role_template_id: templates[0].id }));
  }, [form.role_template_id, templates]);
  const assignments = useQuery({
    queryKey: enterpriseQueryKeys.assignments({ enterpriseId }, selectedUserId),
    queryFn: () => backend.roleAssignments(selectedUserId, enterpriseId),
    enabled: Boolean(selectedUserId),
    retry: false,
  });
  const createAssignment = useMutation({
    mutationFn: () => {
      const selectedScope = scopes.find((scope) => scope.id === form.scope_id);
      return backend.createRoleAssignment(selectedUserId, {
        enterprise_id: enterpriseId,
        role_template_id: form.role_template_id,
        scope_type: selectedScope?.node_type ?? 'enterprise',
        scope_id: selectedScope?.id ?? enterpriseId,
        include_descendants: form.include_descendants,
        domains: [],
        allowed_modules: [],
        capability_overrides: [],
        denied_capabilities: [],
        allowed_classifications: [],
        record_ownership: 'scope',
        valid_from: new Date().toISOString(),
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
        reason: form.reason,
      });
    },
    onSuccess: () => {
      setForm((current) => ({ ...current, valid_until: '', reason: '' }));
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.assignments({ enterpriseId }, selectedUserId) });
      invalidate();
    },
  });
  const revokeAssignment = useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason: string }) =>
      backend.revokeRoleAssignment(selectedUserId, assignmentId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: enterpriseQueryKeys.assignments({ enterpriseId }, selectedUserId) });
      invalidate();
    },
  });
  const explain = useMutation({
    mutationFn: () => {
      const selectedScope = scopes.find((scope) => scope.id === form.scope_id);
      return backend.explainPermission(selectedUserId, {
        enterprise_id: enterpriseId,
        scope_type: selectedScope?.node_type ?? 'enterprise',
        scope_id: selectedScope?.id ?? enterpriseId,
        capability,
        data_classification: 'internal',
      });
    },
  });

  if (loading) return <LoadingState label="Loading enterprise users and roles" />;
  return (
    <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-4">
        <h2 className="font-semibold text-white">Enterprise members</h2>
        <p className="mt-1 text-sm text-slate-400">Search by name or email. Internal database IDs stay out of the selection label.</p>
        <input className="form-input mt-4 w-full" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search people..." />
        <div className="mt-3 max-h-[410px] space-y-1 overflow-auto">
          {visibleMembers.map(({ user, membership }) => (
            <button
              key={user.id}
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left ${selectedUserId === user.id ? 'border-cyan-300/45 bg-cyan-400/10' : 'border-transparent hover:bg-slate-800/70'}`}
              onClick={() => setSelectedUserId(user.id)}
            >
              <span className="block font-semibold text-white">{user.name}</span>
              <span className="block truncate text-xs text-slate-400">{user.email}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-cyan-200">{membership.identity_type}</span>
            </button>
          ))}
          {!visibleMembers.length ? <p className="p-4 text-center text-sm text-slate-500">No members match.</p> : null}
        </div>
      </aside>
      <div className="space-y-4">
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-4">
          <h2 className="font-semibold text-white">Assign scoped role</h2>
          <p className="mt-1 text-sm text-slate-400">Role, scope, descendant inheritance, dates, and reason are evaluated together.</p>
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createAssignment.mutate();
            }}
          >
            <label className="text-sm text-slate-300">Role template<select className="form-input mt-1 w-full" value={form.role_template_id} onChange={(event) => setForm({ ...form, role_template_id: event.target.value })}>{templates.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label className="text-sm text-slate-300">Scope<select className="form-input mt-1 w-full" value={form.scope_id} onChange={(event) => setForm({ ...form, scope_id: event.target.value })}><option value={enterpriseId}>Entire enterprise</option>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name} ({scope.node_type.replace('_', ' ')})</option>)}</select></label>
            <label className="text-sm text-slate-300">Valid until (optional)<input className="form-input mt-1 w-full" type="datetime-local" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} /></label>
            <label className="flex items-end gap-2 rounded-lg border border-slate-700/45 p-3 text-sm text-slate-300"><input type="checkbox" checked={form.include_descendants} onChange={(event) => setForm({ ...form, include_descendants: event.target.checked })} />Include descendant scopes</label>
            <label className="text-sm text-slate-300 md:col-span-2">Business reason<input className="form-input mt-1 w-full" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} minLength={5} required placeholder="Why is this access required?" /></label>
            <button className="form-button-primary md:col-span-2" disabled={!selectedUserId || !form.role_template_id || createAssignment.isPending}>Assign role</button>
          </form>
        </section>
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-4">
          <h2 className="font-semibold text-white">Current and historical assignments</h2>
          {assignments.isLoading ? <LoadingState label="Loading assignments" /> : (
            <div className="mt-3 space-y-2">
              {(assignments.data ?? []).map((assignment) => (
                <article key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/45 bg-slate-950/25 p-3">
                  <div><p className="font-semibold text-white">{templates.find((role) => role.id === assignment.role_template_id)?.name ?? 'Role'}</p><p className="text-xs text-slate-400">{assignment.scope_type.replace('_', ' ')} · {assignment.scope_id} · {assignment.status}</p><p className="mt-1 text-xs text-slate-500">Expires: {assignment.valid_until ? new Date(assignment.valid_until).toLocaleString() : 'No expiry'}</p></div>
                  {assignment.status === 'active' ? <button className="form-button-subtle border-red-300/25 text-red-100" onClick={() => revokeAssignment.mutate({ assignmentId: assignment.id, reason: 'Revoked by enterprise administrator' })}>Revoke</button> : null}
                </article>
              ))}
              {!assignments.data?.length ? <p className="rounded-lg border border-slate-700/45 p-4 text-sm text-slate-500">No assignments for this member.</p> : null}
            </div>
          )}
        </section>
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-4">
          <h2 className="font-semibold text-white">Permission explanation</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className="form-input flex-1" value={capability} onChange={(event) => setCapability(event.target.value)} placeholder="quality.view" /><button className="form-button-subtle" onClick={() => explain.mutate()} disabled={!selectedUserId}>Explain access</button></div>
          {explain.data ? <div className={`mt-3 rounded-lg border p-3 text-sm ${explain.data.allowed ? 'border-emerald-300/25 bg-emerald-400/[0.06]' : 'border-amber-300/25 bg-amber-400/[0.06]'}`}><p className="font-semibold text-white">{explain.data.summary}</p>{explain.data.reasons.map((reason) => <p key={reason} className="mt-1 text-slate-300">• {reason}</p>)}</div> : null}
        </section>
      </div>
    </section>
  );
}

function EntitlementsPanel({
  enterpriseId,
  rows,
  loading,
  canManage,
  refresh,
}: {
  enterpriseId: string;
  rows: Awaited<ReturnType<typeof backend.moduleEntitlements>>;
  loading: boolean;
  canManage: boolean;
  refresh: () => void;
}) {
  const [reason, setReason] = useState('');
  const update = useMutation({
    mutationFn: ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) =>
      backend.updateModuleEntitlement(enterpriseId, moduleKey, { enabled, rules: {}, reason }),
    onSuccess: () => {
      setReason('');
      refresh();
    },
  });
  if (loading) return <LoadingState label="Loading module entitlements" />;
  return (
    <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
      <h2 className="font-semibold text-white">Module Entitlements</h2>
      <p className="mt-1 text-sm text-slate-400">Enterprise licensing is intersected with every user assignment and backend request.</p>
      {canManage ? <input className="form-input mt-4 w-full" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} placeholder="Reason required before changing an entitlement..." /> : null}
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/45 bg-slate-950/25 p-3">
            <div><p className="font-semibold capitalize text-white">{row.module_key.replaceAll('_', ' ')}</p><p className={`text-xs ${row.enabled ? 'text-emerald-200' : 'text-amber-200'}`}>{row.enabled ? 'Enabled' : 'Disabled'}</p></div>
            {canManage ? <button className="form-button-subtle" disabled={reason.trim().length < 5 || update.isPending} onClick={() => update.mutate({ moduleKey: row.module_key, enabled: !row.enabled })}>{row.enabled ? 'Disable' : 'Enable'}</button> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function DataPoliciesPanel({
  enterpriseId,
  rows,
  loading,
  canManage,
  refresh,
}: {
  enterpriseId: string;
  rows: Awaited<ReturnType<typeof backend.dataPolicies>>;
  loading: boolean;
  canManage: boolean;
  refresh: () => void;
}) {
  const [form, setForm] = useState({ resource_pattern: '', classification: 'confidential', masked_fields: '', hidden_fields: '', reason: '' });
  const create = useMutation({
    mutationFn: () => backend.createDataPolicy(enterpriseId, {
      resource_pattern: form.resource_pattern,
      classification: form.classification,
      masked_fields: form.masked_fields.split(',').map((item) => item.trim()).filter(Boolean),
      hidden_fields: form.hidden_fields.split(',').map((item) => item.trim()).filter(Boolean),
      reason: form.reason,
    }),
    onSuccess: () => {
      setForm({ resource_pattern: '', classification: 'confidential', masked_fields: '', hidden_fields: '', reason: '' });
      refresh();
    },
  });
  if (loading) return <LoadingState label="Loading data access policies" />;
  return (
    <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
      <h2 className="font-semibold text-white">Data Access Policies</h2>
      <p className="mt-1 text-sm text-slate-400">Classify datasets and remove or mask sensitive fields before returning them.</p>
      {canManage ? (
        <form className="mt-4 grid gap-2 lg:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }}>
          <input className="form-input" value={form.resource_pattern} onChange={(event) => setForm({ ...form, resource_pattern: event.target.value })} placeholder="Resource pattern, e.g. workforce.*" required />
          <select className="form-input" value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value })}>{classifications.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
          <input className="form-input" value={form.masked_fields} onChange={(event) => setForm({ ...form, masked_fields: event.target.value })} placeholder="Masked fields, comma-separated" />
          <input className="form-input" value={form.hidden_fields} onChange={(event) => setForm({ ...form, hidden_fields: event.target.value })} placeholder="Hidden fields, comma-separated" />
          <input className="form-input lg:col-span-2" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Reason for policy" minLength={5} required />
          <button className="form-button-primary lg:col-span-2" disabled={create.isPending}>Create policy</button>
        </form>
      ) : null}
      <div className="mt-4 overflow-auto rounded-lg border border-slate-700/45">
        <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#0d1929] text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Resource</th><th>Classification</th><th>Masked</th><th>Hidden</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-700/40"><td className="px-4 py-3 font-semibold text-white">{row.resource_pattern}</td><td className="capitalize text-amber-100">{row.classification.replaceAll('_', ' ')}</td><td className="text-slate-300">{row.masked_fields.join(', ') || 'None'}</td><td className="text-slate-300">{row.hidden_fields.join(', ') || 'None'}</td><td className="text-emerald-200">{row.status}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function AccessSessionsPanel({
  temporary,
  support,
  loading,
}: {
  temporary: Awaited<ReturnType<typeof backend.temporaryAccess>>;
  support: Awaited<ReturnType<typeof backend.supportAccessSessions>>;
  loading: boolean;
}) {
  if (loading) return <LoadingState label="Loading time-bound access" />;
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <AccessList title="Temporary role assignments" icon={Clock3} empty="No temporary assignments.">
        {temporary.map((row) => <AccessRow key={row.id} title={row.user.name} detail={`${row.assignment.scope_type.replace('_', ' ')} · expires ${new Date(row.valid_until).toLocaleString()}`} active={row.effective} />)}
      </AccessList>
      <AccessList title="Platform support sessions" icon={UserRoundCog} empty="No support sessions.">
        {support.map((row) => <AccessRow key={row.id} title={row.reason} detail={`Expires ${new Date(row.valid_until).toLocaleString()} · ${row.capabilities.length} capabilities`} active={!row.revoked_at && new Date(row.valid_until) > new Date()} />)}
      </AccessList>
    </section>
  );
}

function AuditPanel({ rows, loading }: { rows: Awaited<ReturnType<typeof backend.enterpriseAuditEvents>>; loading: boolean }) {
  if (loading) return <LoadingState label="Loading governed audit history" />;
  return (
    <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5">
      <div className="flex items-center gap-3"><FileKey2 className="h-5 w-5 text-cyan-200" /><div><h2 className="font-semibold text-white">Enterprise Audit Log</h2><p className="text-sm text-slate-400">Actor, acting identity, scope, reason, and before/after evidence.</p></div></div>
      <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-slate-700/45">
        <table className="w-full min-w-[980px] text-left text-sm"><thead className="sticky top-0 bg-[#0d1929] text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Time</th><th>Action</th><th>Actor</th><th>Acting as</th><th>Scope</th><th>Resource</th><th>Reason</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-700/40"><td className="px-4 py-3 text-slate-400">{new Date(row.created_at).toLocaleString()}</td><td className="font-semibold text-white">{row.action}</td><td className="text-cyan-100">{row.actor_id}</td><td className="text-amber-100">{row.acting_as_id ?? 'Self'}</td><td className="text-slate-300">{row.scope_type ?? 'platform'} · {row.scope_id ?? 'platform'}</td><td className="text-slate-300">{row.resource_type}</td><td className="max-w-[260px] truncate text-slate-400">{row.reason ?? 'Not supplied'}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function AccessList({ title, icon: Icon, empty, children }: { title: string; icon: typeof ShieldCheck; empty: string; children: ReactNode }) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return <section className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-5"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-200" /><h2 className="font-semibold text-white">{title}</h2></div><div className="mt-4 space-y-2">{count ? children : <p className="rounded-lg border border-slate-700/45 p-4 text-sm text-slate-500">{empty}</p>}</div></section>;
}

function AccessRow({ title, detail, active }: { title: string; detail: string; active: boolean }) {
  const Icon = active ? CheckCircle2 : AlertTriangle;
  return <article className="flex items-start gap-3 rounded-lg border border-slate-700/45 bg-slate-950/25 p-3"><Icon className={`mt-0.5 h-4 w-4 ${active ? 'text-emerald-300' : 'text-amber-300'}`} /><div><p className="font-semibold text-white">{title}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div></article>;
}
