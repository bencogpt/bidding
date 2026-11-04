import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Row {
  key: string;
  label: string;
  present: boolean;
}

// Short names and the line a person can start writing for each mandatory detail.
const SHORT: Record<string, string> = {
  service_name: 'שם השירות',
  document_classification: 'סיווג',
  scope: 'עיקרי השירות',
  annual_budget: 'סכום מסגרת',
  contract_years: 'משך ההתקשרות',
};
export const STARTERS: Record<string, string> = {
  service_name: 'שם השירות: ',
  document_classification: 'סיווג: ',
  annual_budget: 'סכום מסגרת: ',
  contract_years: 'משך ההתקשרות: ',
};
// Details that are one of a few usual answers get them as buttons.
const OPTIONS: Record<string, string[]> = {
  document_classification: ['בלמ"ס', 'שמור', 'סודי'],
  annual_budget: ['עד 500 אלף', 'מיליון', '2 מיליון', '5 מיליון'],
  contract_years: ['שנה', 'שנתיים', '3 שנים', '5 שנים'],
};

const pill =
  'rounded-full border border-accent bg-surface px-3 py-[3px] text-xs text-accent transition-colors hover:bg-accent hover:text-white';

// Free writing: after a pause the agent "reads" what was written (three dots), then answers inside the writing box as
// a chat bubble: what is still missing, with one-click answers where there are usual ones; or that everything was found.
// Typing hides it again. `nudge` goes up when the box loses focus, which skips the wait (UX prototype).
export default function RequestGuide({
  brief,
  rows,
  nudge,
  onPick,
  onAppend,
  onChat,
}: {
  brief: string;
  rows: Row[];
  nudge: number;
  onPick: (key: string, option: string) => void;
  onAppend: (key: string) => void;
  onChat: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'off' | 'reading' | 'shown'>('off');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPhase('off');
    if (!brief.trim()) return;
    const id = setTimeout(() => setPhase((p) => (p === 'off' ? 'reading' : p)), 1200);
    return () => clearTimeout(id);
  }, [brief]);
  useEffect(() => {
    if (nudge > 0 && brief.trim()) setPhase((p) => (p === 'off' ? 'reading' : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge]);
  useEffect(() => {
    if (phase !== 'reading') return;
    const id = setTimeout(() => setPhase('shown'), 700);
    return () => clearTimeout(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'shown') box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [phase]);

  if (phase === 'off' || !brief.trim()) return null;
  const missing = rows.filter((r) => !r.present);
  const done = missing.length === 0;
  const name = (r: Row) => SHORT[r.key] ?? r.label;
  const message = done
    ? t('req.guideDone')
    : missing.length === 1
      ? t('req.guideOne')
      : t('req.guideSome', { found: rows.length - missing.length, total: rows.length, n: missing.length });

  return (
    // Clicking here must not take the focus away from the text.
    <div ref={box} onMouseDown={(e) => e.preventDefault()} className="flex flex-col gap-2.5 border-t border-black/5 bg-surface px-4 py-3.5">
      <div className="flex max-w-[92%] items-start gap-2 self-start">
        <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full border-[1.5px] border-accent bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[55%] w-[55%]">
            <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
            <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".8" />
          </svg>
        </span>
        <div
          className={
            'rounded-[14px] rounded-ss-[4px] border bg-paper px-3.5 py-[9px] text-sm leading-relaxed ' +
            (phase === 'shown' && done ? 'border-green-600' : 'border-black/5')
          }
        >
          {phase === 'reading' ? (
            <span className="inline-flex items-center gap-1 px-0.5 py-1" aria-label="…">
              {[0, 150, 300].map((d) => (
                <i key={d} className="h-1.5 w-1.5 animate-rcdot rounded-full bg-tx-soft" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          ) : (
            message
          )}
        </div>
      </div>
      {phase === 'shown' && !done && (
        <div className="flex flex-col gap-2 ps-[34px]">
          {missing.map((r) =>
            OPTIONS[r.key] ? (
              <div key={r.key} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[78px] text-xs text-tx-soft">{name(r)}</span>
                {OPTIONS[r.key].map((o) => (
                  <button key={o} type="button" className={pill} onClick={() => onPick(r.key, o)}>
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <div key={r.key} className="flex flex-wrap items-center gap-2">
                <button type="button" className={pill} onClick={() => onAppend(r.key)}>
                  {r.key === 'scope' ? t('req.guideMore') : `+ ${name(r)}`}
                </button>
              </div>
            ),
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-accent bg-accent px-3 py-[3px] text-xs text-white transition hover:brightness-110"
              onClick={onChat}
            >
              {t('req.guideChat')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
