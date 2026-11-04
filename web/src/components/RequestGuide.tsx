import { useEffect, useState } from 'react';
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

// Free writing: once the person pauses, the agent points at what is still missing, with a ready start for each
// detail, or says everything was found. Appears after a short idle (UX prototype).
export default function RequestGuide({
  brief,
  rows,
  ready,
  onChat,
  onAppend,
  onSummary,
}: {
  brief: string;
  rows: Row[];
  ready: boolean; // the five details are there and the agent has nothing left to ask
  onChat: () => void;
  onAppend: (key: string) => void;
  onSummary: () => void;
}) {
  const { t } = useTranslation();
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    const id = setTimeout(() => setIdle(true), 1200);
    return () => clearTimeout(id);
  }, [brief]);
  if (!brief.trim() || !idle) return null;

  const missing = rows.filter((r) => !r.present);
  const names = missing.map((r) => SHORT[r.key] ?? r.label).join(', ');
  const done = missing.length === 0 && ready;
  return (
    <div
      className={
        'mt-3 flex items-start gap-3 rounded-[10px] border px-4 py-3 text-[13px] leading-7 ' +
        (done ? 'border-green-600 bg-green-600/10' : 'border-accent/20 bg-accent-soft')
      }
    >
      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full border-[1.5px] border-accent bg-accent-soft text-accent">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[55%] w-[55%]">
          <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".8" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        {missing.length > 0 ? (
          <>
            {missing.length === 1
              ? t('req.guideMissingOne', { names })
              : t('req.guideMissing', { n: missing.length, names })}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn btn-gold btn-sm !rounded-full" onClick={onChat}>
                {t('req.guideChat')}
              </button>
            </div>
            <div className="mt-2.5 text-xs text-tx-soft">{t('req.guideOnly')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {missing.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className="rounded-full border border-accent bg-surface px-3 py-[3px] text-xs text-accent transition-colors hover:bg-accent hover:text-white"
                  onClick={() => onAppend(r.key)}
                >
                  {r.key === 'scope' ? t('req.guideMore') : `+ ${SHORT[r.key] ?? r.label}`}
                </button>
              ))}
            </div>
          </>
        ) : done ? (
          <>
            {t('req.guideDone')}
            <div className="mt-2">
              <button type="button" className="btn btn-gold btn-sm !rounded-full" onClick={onSummary}>
                {t('req.toSummary')}
              </button>
            </div>
          </>
        ) : (
          t('req.guideAgent')
        )}
      </div>
    </div>
  );
}
