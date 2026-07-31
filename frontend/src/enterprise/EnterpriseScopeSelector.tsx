import { useMemo, useState } from 'react';
import { Check, ChevronDown, GitCompare, Search } from 'lucide-react';

import { useDismissibleLayer } from '../lib/useDismissibleLayer';
import { useEnterpriseAccess } from './EnterpriseAccessContext';

export function EnterpriseScopeSelector() {
  const {
    activeEnterprise,
    activeScope,
    availableScopes,
    recentScopeIds,
    compareScopeIds,
    selectScope,
    setCompareScopeIds,
  } = useEnterpriseAccess();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [compare, setCompare] = useState(false);
  const selectorRef = useDismissibleLayer<HTMLDivElement>({
    open,
    onDismiss: () => {
      setOpen(false);
      setSearch('');
    },
  });
  const normalized = search.trim().toLowerCase();
  const scopes = useMemo(
    () => availableScopes.filter((scope) => !normalized || `${scope.name} ${scope.code} ${scope.node_type}`.toLowerCase().includes(normalized)),
    [availableScopes, normalized],
  );
  const recent = recentScopeIds
    .map((id) => availableScopes.find((scope) => scope.id === id))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope));
  if (!activeEnterprise || !activeScope) return null;

  function toggleCompare(scopeId: string) {
    setCompareScopeIds(
      compareScopeIds.includes(scopeId)
        ? compareScopeIds.filter((id) => id !== scopeId)
        : [...compareScopeIds, scopeId].slice(-6),
    );
  }

  return (
    <div ref={selectorRef} className="relative min-w-0">
      <button
        type="button"
        className="focus-ring flex min-h-10 max-w-[360px] items-center gap-2 rounded-lg border border-slate-600/45 bg-slate-950/35 px-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">{activeScope.type.replace('_', ' ')}</span>
          <span className="block truncate text-sm font-semibold text-white">{activeScope.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[70] w-[min(440px,88vw)] rounded-lg border border-slate-600/50 bg-[#0a1625] p-3 shadow-enterprise-dialog">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                className="form-input w-full py-2 pl-9 text-sm"
                value={search}
                placeholder="Search permitted scopes..."
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
            </label>
            <button
              type="button"
              className={compare ? 'form-button-primary px-3 py-2' : 'form-button-subtle px-3 py-2'}
              onClick={() => setCompare((value) => !value)}
              title="Compare authorized scopes"
            >
              <GitCompare className="h-4 w-4" />
            </button>
          </div>
          {!normalized && recent.length ? (
            <div className="mt-3">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recent</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {recent.slice(0, 4).map((scope) => (
                  <button key={scope.id} className="rounded-md border border-slate-600/40 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" onClick={() => selectScope(scope)}>
                    {scope.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 max-h-72 overflow-y-auto pr-1 [scrollbar-color:#475569_#07111f]">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
              onClick={() => {
                selectScope(null);
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{activeEnterprise.name}</span>
                <span className="block text-xs text-slate-500">Enterprise scope</span>
              </span>
              {activeScope.type === 'enterprise' ? <Check className="h-4 w-4 text-cyan-300" /> : null}
            </button>
            {scopes.map((scope) => (
              <button
                type="button"
                key={scope.id}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  if (compare) toggleCompare(scope.id);
                  else {
                    selectScope(scope);
                    setOpen(false);
                  }
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{scope.name}</span>
                  <span className="block truncate text-xs capitalize text-slate-500">{scope.node_type.replace('_', ' ')} · {scope.code}</span>
                </span>
                {(compare ? compareScopeIds.includes(scope.id) : activeScope.id === scope.id) ? <Check className="h-4 w-4 text-cyan-300" /> : null}
              </button>
            ))}
            {!scopes.length ? <p className="p-4 text-center text-sm text-slate-500">No permitted scopes match.</p> : null}
          </div>
          {compare ? <p className="mt-2 text-xs text-cyan-200">{compareScopeIds.length} scopes selected for normalized comparison.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
