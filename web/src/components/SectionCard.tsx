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
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
          {n}
        </span>
        <h2 className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
        {owner && <div className="flex items-center gap-2 text-xs text-tx-soft">{owner}</div>}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function StatusChip({ tone, children }: { tone: 'ok' | 'wait' | 'idle'; children: ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-green-600 text-white'
      : tone === 'wait'
        ? 'bg-green-600/20 text-green-600'
        : 'bg-black/5 text-tx-soft';
  return <span className={'rounded-full px-3 py-0.5 text-xs ' + cls}>{children}</span>;
}

export function SubHead({ letter, title, hint }: { letter: string; title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{letter}</span>
        {title}
      </h3>
      {hint && <p className="mt-1 text-xs text-tx-soft">{hint}</p>}
    </div>
  );
}
