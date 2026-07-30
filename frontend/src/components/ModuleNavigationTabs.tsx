import type { ElementType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

type ModuleNavigationItem = {
  label: string;
  path: string;
  icon: ElementType<{ className?: string }>;
};

type ModuleNavigationTabsProps = {
  items: ModuleNavigationItem[];
  dashboardPath: string;
  moduleName?: string;
  description?: string;
};

export function ModuleNavigationTabs({ items, dashboardPath, moduleName, description }: ModuleNavigationTabsProps) {
  const location = useLocation();
  const showControlTower = location.pathname === dashboardPath && moduleName && description;

  return (
    <>
      {showControlTower ? (
        <header className="border-b border-slate-700/50 pb-5">
          <h1 className="text-h1 text-white">{moduleName} Control Tower</h1>
          <p className="mt-2 max-w-5xl text-body-sm text-slate-300">{description}</p>
        </header>
      ) : null}
      <nav
        className="sticky top-16 z-10 -mx-4 border-y border-slate-700/50 bg-[#091523] px-4 py-2 sm:-mx-6 sm:px-6 2xl:-mx-8 2xl:px-8"
        aria-label="Module sections"
      >
        <div className="flex w-full gap-1.5 overflow-x-auto [scrollbar-width:thin] [scrollbar-color:#475569_#0b1726]">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === dashboardPath}
              className={({ isActive }) =>
                `flex min-h-11 min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold transition ${
                  isActive
                    ? 'border-cyan-400/35 bg-cyan-500/15 text-white'
                    : 'border-transparent text-slate-400 hover:border-slate-600/50 hover:bg-slate-800/55 hover:text-white'
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
