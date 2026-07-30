import { Clock3, Coins, Globe2 } from 'lucide-react';

import { useEnterpriseAccess } from './EnterpriseAccessContext';

export function EnterpriseContextIndicator() {
  const { activeEnterprise, activeScope, compareScopeIds } = useEnterpriseAccess();
  if (!activeEnterprise || !activeScope) return null;
  const dataThrough = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-700/45 bg-slate-950/25 px-3 py-2 text-xs text-slate-400">
      <span className="inline-flex items-center gap-1.5 text-slate-200">
        <Globe2 className="h-3.5 w-3.5 text-cyan-300" />
        Viewing: <strong className="font-semibold text-white">{activeScope.label}</strong>
      </span>
      <span>Enterprise: {activeEnterprise.name}</span>
      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Data through: {dataThrough}</span>
      <span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" />{activeEnterprise.default_currency} · {activeEnterprise.default_timezone}</span>
      {compareScopeIds.length ? <span className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-cyan-100">Comparing {compareScopeIds.length} normalized scopes</span> : null}
    </div>
  );
}
