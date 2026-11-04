import { useState, type ReactNode } from 'react';

// One section of the create flow: a numbered round badge, a title (with an optional line under it),
// who owns it, and the body below. A collapsible section shows a chevron and folds away on click.
export default function SectionCard({
  n,
  title,
  subtitle,
  owner,
  id,
  collapsible,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  owner?: ReactNode;
  id?: string;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section id={id} className="card mb-5 scroll-mt-4 overflow-hidden">
      <header
        className={
          'flex items-center gap-3.5 px-6 py-4 ' +
          (open ? 'border-b border-black/5 ' : '') +
          (collapsible ? 'cursor-pointer hover:bg-paper' : '')
        }
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        aria-expanded={collapsible ? open : undefined}
      >
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <small className="mt-0.5 block truncate text-xs text-tx-soft">{subtitle}</small>}
        </div>
        {owner && <div className="flex items-center gap-2 text-xs text-tx-soft">{owner}</div>}
        {collapsible && (
          <svg
            className={'flex-none text-tx-soft transition-transform ' + (open ? '' : 'rotate-90')}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        )}
      </header>
      <div className={'p-6 ' + (open ? '' : 'hidden')}>{children}</div>
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
        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft text-xs text-accent">{letter}</span>
        {title}
      </h3>
      {hint && <p className="mt-1 text-xs text-tx-soft">{hint}</p>}
    </div>
  );
}
