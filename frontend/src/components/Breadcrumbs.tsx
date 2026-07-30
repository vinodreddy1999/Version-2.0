import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { usePlatform } from '../platform/PlatformContext';

const labels: Record<string, string> = {
  platform: 'Platform View',
  dashboards: 'Unified Dashboards',
  admin: 'Administration',
  'data-hub': 'Data Hub',
  planning: 'Planning',
  inventory: 'Inventory',
  warehouse: 'Warehouse',
  production: 'Production',
  maintenance: 'Maintenance',
  quality: 'Quality',
  procurement: 'Procurement',
  sales: 'Sales & Distribution',
  costing: 'Costing & Profitability',
  compliance: 'Compliance',
  reports: 'Reports & Analytics',
  documents: 'Document Management',
  executive: 'Executive Dashboard',
  'business-impact': 'Business Impact Dashboard',
  integration: 'Integration Dashboard',
  custom: 'Custom Dashboards',
};

function title(value: string) {
  return labels[value] ?? value.split('-').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

export function Breadcrumbs() {
  const location = useLocation();
  const { selectedClient } = usePlatform();
  const segments = location.pathname.split('/').filter(Boolean);
  if (!segments.length) return null;

  const crumbs = segments.map((segment, index) => ({
    label: title(segment),
    to: `/${segments.slice(0, index + 1).join('/')}`,
  }));
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (workspace) crumbs.push({ label: title(workspace), to: `${location.pathname}?workspace=${workspace}` });

  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex min-h-6 flex-wrap items-center gap-2 text-xs text-slate-500">
      {selectedClient ? <span className="text-slate-400">{selectedClient.clientName}</span> : null}
      {selectedClient ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {crumbs.map((crumb, index) => {
        const current = index === crumbs.length - 1;
        return (
          <span key={`${crumb.to}-${index}`} className="inline-flex items-center gap-1.5">
            {current ? <span aria-current="page" className="text-slate-300">{crumb.label}</span> : <Link className="hover:text-cyan-200" to={crumb.to}>{crumb.label}</Link>}
            {!current ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /> : null}
          </span>
        );
      })}
    </nav>
  );
}
