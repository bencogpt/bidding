import { useTranslation } from 'react-i18next';
import { BUDGET_MIN } from '@obms/shared';
import type { Fields } from '../lib/useRequestAgent';

interface Row {
  key: string;
  label: string;
  present: boolean;
}

const nf = new Intl.NumberFormat('en-US');

// "פרטי חובה בבקשה": the five mandatory details, each with its state and the value that was found. Display only:
// the values come from the free text or the agent's conversation, not from typing here.
export default function RequestPanel({ rows, fields }: { rows: Row[]; fields: Fields }) {
  const { t } = useTranslation();
  const done = rows.filter((r) => r.present).length;
  const shown = (key: string): string => {
    const v = (fields[key as keyof Fields] ?? '').trim();
    if (key === 'annual_budget') {
      const n = Number(v);
      return v && Number.isFinite(n) ? `₪${nf.format(n)}` : v;
    }
    return v;
  };
  return (
    <aside className="self-start rounded-[10px] border border-black/5 bg-paper px-4 py-3.5">
      <h2 className="mb-2.5 flex items-center justify-between gap-2 text-[13px] font-semibold">
        {t('req.panelTitle')}
        <span className="rounded-full border border-black/10 bg-surface px-3 py-0.5 text-xs font-normal text-tx-soft">
          {done}/{rows.length}
        </span>
      </h2>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const value = r.key === 'scope' ? (r.present ? t('req.fromText') : '') : shown(r.key);
          return (
            <li key={r.key} className="flex flex-col gap-0.5 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <span>{r.label}</span>
                <span
                  className={
                    'rounded-full px-3 py-0.5 text-xs transition-colors ' +
                    (r.present ? 'bg-green-600 text-white' : 'bg-black/[.07] text-tx-soft')
                  }
                >
                  {r.present ? t('req.found') : t('req.missing')}
                </span>
              </div>
              {value && (
                <small className="truncate text-[11px] text-tx-soft" title={value}>
                  <bdi>{value}</bdi>
                </small>
              )}
              {r.key === 'annual_budget' && fields.annual_budget.trim() !== '' && !r.present && (
                <small className="block text-[11px] text-red-600">
                  {t('req.budgetMin', { min: BUDGET_MIN.toLocaleString('en-US') })}
                </small>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
