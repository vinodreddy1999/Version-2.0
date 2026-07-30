import { useState, type ReactNode } from 'react';

import { EmptyState } from './EmptyState';
import { useVirtualRows } from '../lib/performance';

type DataTableProps<T extends Record<string, unknown>> = {
  rows: T[];
  columns: Array<{
    key: keyof T;
    label: string;
    render?: (value: T[keyof T], row: T) => ReactNode;
  }>;
  emptyTitle: string;
  getRowKey?: (row: T, index: number) => string;
};

function stableRowKey<T extends Record<string, unknown>>(row: T, index: number) {
  const preferredKeys = ['id', 'ID', 'code', 'Code', 'clientId', 'client_id', 'item_code', 'connection_id', 'name', 'Name'];
  const matchedKey = preferredKeys.find((key) => row[key] !== undefined && row[key] !== null && String(row[key]).trim().length > 0);
  if (matchedKey) return `${matchedKey}:${String(row[matchedKey])}`;
  return `row:${index}:${Object.values(row).slice(0, 4).map((value) => String(value ?? '')).join('|')}`;
}

export function DataTable<T extends Record<string, unknown>>({ rows, columns, emptyTitle, getRowKey }: DataTableProps<T>) {
  const [scrollPosition, setScrollPosition] = useState(1);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const shouldVirtualize = rows.length > 80;
  const virtual = useVirtualRows(rows);
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description="The backend returned an empty collection for this view." />;
  }

  const visibleRows = shouldVirtualize ? virtual.visibleRows : rows;
  const startIndex = shouldVirtualize ? virtual.startIndex : 0;
  const topSpacerHeight = shouldVirtualize ? virtual.startIndex * 54 : 0;
  const bottomSpacerHeight = shouldVirtualize ? Math.max(0, virtual.totalHeight - topSpacerHeight - visibleRows.length * 54) : 0;

  return (
    <div className="enterprise-table-frame">
      <div
        className="max-h-[321px] overflow-auto [scrollbar-color:#475569_#0b1726]"
        onScroll={(event) => {
          setScrollPosition(Math.floor(event.currentTarget.scrollTop / 54) + 1);
          if (shouldVirtualize) virtual.onScroll(event);
        }}
      >
        <table className="min-w-[760px] w-full table-fixed divide-y divide-border text-body-sm">
          <thead className="enterprise-sticky-header">
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {topSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: topSpacerHeight, padding: 0 }} />
              </tr>
            ) : null}
            {visibleRows.map((row, rowIndex) => (
              <tr
                key={getRowKey ? getRowKey(row, startIndex + rowIndex) : stableRowKey(row, startIndex + rowIndex)}
                className="h-[54px] transition hover:bg-slate-700/20"
                onMouseEnter={() => setHoverPosition(startIndex + rowIndex + 1)}
                onMouseLeave={() => setHoverPosition(null)}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className="max-w-0 align-middle px-4 py-3 text-body-sm text-slate-200">
                    <div className="truncate" title={String(row[column.key] ?? '')}>
                      {column.render ? column.render(row[column.key], row) : String(row[column.key] ?? '')}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {bottomSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: bottomSpacerHeight, padding: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex h-8 items-center border-t border-slate-700/50 bg-[#0b1726] px-3 text-caption font-medium text-slate-400" aria-live="polite">{Math.min(hoverPosition ?? scrollPosition, rows.length)} of {rows.length}</div>
    </div>
  );
}
