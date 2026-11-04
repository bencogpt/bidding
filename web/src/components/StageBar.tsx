import { useTranslation } from 'react-i18next';

export interface Step {
  label: string;
  state: 'done' | 'cur' | 'todo';
  onClick?: () => void;
}

// The phases of creating a bid: a thin bar per step, the label underneath, a tick when done and "כרגע" on the
// step in progress.
export default function StageBar({ steps }: { steps: Step[] }) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex gap-1.5" role="list">
      {steps.map((s, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          onClick={s.onClick}
          disabled={!s.onClick}
          className="group flex-1 pb-0.5 text-start disabled:cursor-default"
        >
          <span
            className={
              'mb-2 block h-1 rounded transition-colors ' +
              (s.state === 'done'
                ? 'bg-accent'
                : s.state === 'cur'
                  ? 'bg-gradient-to-l from-accent from-55% to-black/10 to-55%'
                  : 'bg-black/10')
            }
          />
          <span
            className={
              'whitespace-nowrap text-xs transition-colors ' +
              (s.state === 'cur'
                ? 'font-semibold text-accent'
                : s.state === 'done'
                  ? 'text-tx'
                  : 'text-tx-soft group-enabled:group-hover:text-tx')
            }
          >
            {s.state === 'done' && <span className="text-green-600">✓ </span>}
            {s.label}
            {s.state === 'cur' && <em className="ms-1.5 text-[11px] font-normal not-italic text-tx-soft">{t('req.stageNow')}</em>}
          </span>
        </button>
      ))}
    </div>
  );
}
