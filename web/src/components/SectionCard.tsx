import type { ReactNode } from 'react';

// One section of the create flow: a numbered round badge, a title, who owns it, and the body below.
export default function SectionCard({
  n,
  title,
  owner,
  children,
}: {
  n: number;
  title: string;
  owner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card mb-5 overflow-hidden">
      <header className="flex items-center gap-3 border-b border-black/5 px-6 py-4">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gold-soft text-sm font-semibold text-gold-deep">
          {n}
        </span>
        <h2 className="flex-1 text-base font-semibold">{title}</h2>
        {owner && <div className="flex items-center gap-2 text-xs text-tx-soft">{owner}</div>}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function StatusChip({ tone, children }: { tone: 'ok' | 'wait' | 'idle'; children: ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-600 text-white'
      : tone === 'wait'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-black/5 text-tx-soft';
  return <span className={'rounded-full px-3 py-0.5 text-xs ' + cls}>{children}</span>;
}

export function SubHead({ letter, title, hint }: { letter: string; title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-gold-soft text-xs text-gold-deep">{letter}</span>
        {title}
      </h3>
      {hint && <p className="mt-1 text-xs text-tx-soft">{hint}</p>}
    </div>
  );
}
