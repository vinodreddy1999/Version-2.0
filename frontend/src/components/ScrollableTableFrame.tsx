import { useState, type MouseEvent, type ReactNode } from 'react';

export function ScrollableTableFrame({ children, count, rowHeight = 54 }: { children: ReactNode; count: number; rowHeight?: number }) {
  const [scrollPosition, setScrollPosition] = useState(1);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const current = count ? Math.min(hoverPosition ?? scrollPosition, count) : 0;

  function trackRow(event: MouseEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest('tbody tr');
    if (!row?.parentElement) return;
    setHoverPosition(Array.from(row.parentElement.children).indexOf(row) + 1);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/50 bg-[#091523]">
      <div
        className="max-h-[321px] overflow-auto [scrollbar-color:#475569_#0b1726] [&_tbody_tr]:h-[54px] [&_tbody_tr]:transition [&_tbody_tr:hover]:bg-slate-700/20 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.1em] [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-[#0b1726]"
        onScroll={(event) => setScrollPosition(Math.floor(event.currentTarget.scrollTop / rowHeight) + 1)}
        onMouseOver={trackRow}
        onMouseLeave={() => setHoverPosition(null)}
      >
        {children}
      </div>
      <div className="sticky left-0 flex h-8 items-center border-t border-slate-700/50 bg-[#0b1726] px-3 text-xs font-medium text-slate-400" aria-live="polite">{current} of {count}</div>
    </div>
  );
}
