import type { ReactNode } from 'react';

type PanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
};

export function Panel({ title, description, children, action }: PanelProps) {
  return (
    <section className="enterprise-card h-full overflow-hidden p-token-4 sm:p-token-5">
      <header className="flex flex-col gap-3 border-b border-slate-700/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-h5 text-white">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-body-sm text-slate-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0 sm:self-start">{action}</div> : null}
      </header>
      <div className="flex flex-1 flex-col pt-4">{children}</div>
    </section>
  );
}
