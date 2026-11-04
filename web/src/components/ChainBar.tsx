import type { Step } from './StageBar';

export interface ChainStep extends Omit<Step, 'label'> {
  title: string;
  sub?: string;
  /** shown after the title of the current step ("כרגע") */
  nowLabel?: string;
}

// The hand-off chain of a request: a thin bar per step in the accent colour, the title and a
// one-line caption underneath, and a small pill on the step that is current.
export default function ChainBar({ steps, caption }: { steps: ChainStep[]; caption?: string }) {
  return (
    <div className="mb-5">
      {caption && <div className="mb-1.5 text-xs text-tx-soft">{caption}</div>}
      <div className="grid gap-3.5 sm:grid-cols-3" role="list">
        {steps.map((s, i) => (
          <button
            key={i}
            type="button"
            role="listitem"
            onClick={s.onClick}
            disabled={!s.onClick}
            className="text-start disabled:cursor-default"
          >
            <span className={'mb-2.5 block h-1 rounded ' + (s.state === 'todo' ? 'bg-black/10' : 'bg-accent')} />
            <span
              className={
                'block text-sm ' +
                (s.state === 'cur' ? 'font-medium text-accent' : s.state === 'done' ? 'text-tx' : 'text-tx-soft')
              }
            >
              {s.state === 'done' && <span className="text-green-600">✓ </span>}
              {s.title}
              {s.state === 'cur' && s.nowLabel && (
                <em className="ms-2 rounded-full bg-accent-soft px-2 text-[11px] font-normal not-italic text-accent">
                  {s.nowLabel}
                </em>
              )}
            </span>
            {s.sub && <small className="mt-0.5 block text-xs text-tx-soft">{s.sub}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
