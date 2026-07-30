import { LockKeyhole } from 'lucide-react';

type AccessDeniedStateProps = {
  title?: string;
  description?: string;
};

export function AccessDeniedState({
  title = 'Access restricted',
  description = 'Your role can sign in successfully, but this section is reserved for broader platform permissions.',
}: AccessDeniedStateProps) {
  return (
    <section className="rounded-xl border border-amber-400/30 bg-amber-500/[0.08] p-5 shadow-panel" role="status">
      <div className="flex items-start gap-4">
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2.5 text-amber-300">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-amber-100">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-amber-200/80">{description}</p>
        </div>
      </div>
    </section>
  );
}
