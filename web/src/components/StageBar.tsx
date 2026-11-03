export interface Step {
  label: string;
  state: 'done' | 'cur' | 'todo';
  onClick?: () => void;
}

// The phases of creating a bid: a thin bar per step, the label underneath, a tick when done.
export default function StageBar({ steps }: { steps: Step[] }) {
  return (
    <div className="mb-5 flex gap-2" role="list">
      {steps.map((s, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          onClick={s.onClick}
          disabled={!s.onClick}
          className="group flex-1 text-start disabled:cursor-default"
        >
          <span
            className={
              'mb-2 block h-1 rounded ' +
              (s.state === 'done'
                ? 'bg-gold'
                : s.state === 'cur'
                  ? 'bg-gradient-to-l from-gold from-55% to-black/10 to-55%'
                  : 'bg-black/10')
            }
          />
          <span
            className={
              'text-xs ' +
              (s.state === 'cur' ? 'font-semibold text-gold-deep' : s.state === 'done' ? 'text-tx' : 'text-tx-soft')
            }
          >
            {s.state === 'done' && <span className="text-emerald-600">✓ </span>}
            {s.label}
          </span>
        </button>
      ))}
    </div>
  );
}
