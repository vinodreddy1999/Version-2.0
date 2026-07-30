type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-token-6 border-b border-slate-700/50 pb-token-5">
      <p className="text-caption font-medium text-slate-500">{eyebrow}</p>
      <h1 className="mt-1.5 text-h1 text-white">{title}</h1>
      <p className="mt-2 max-w-4xl text-body-sm text-slate-300">{description}</p>
    </header>
  );
}
