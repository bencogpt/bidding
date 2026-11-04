import { useTranslation } from 'react-i18next';
import { BUDGET_MIN } from '@obms/shared';
import type { Fields } from '../lib/useRequestAgent';

interface Row {
  key: string;
  label: string;
  present: boolean;
}

// "פרטי חובה בבקשה": the five mandatory details, each with its state and an editable value.
export default function RequestPanel({
  rows,
  fields,
  onField,
}: {
  rows: Row[];
  fields: Fields;
  onField: (k: keyof Fields, v: string) => void;
}) {
  const { t } = useTranslation();
  const done = rows.filter((r) => r.present).length;
  return (
    <aside className="self-start rounded-[10px] border border-black/5 bg-paper px-4 py-3.5">
      <h2 className="mb-2.5 flex items-center justify-between gap-2 text-[13px] font-semibold">
        {t('req.panelTitle')}
        <span className="rounded-full border border-black/10 bg-surface px-3 py-0.5 text-xs font-normal text-tx-soft">{done}/{rows.length}</span>
      </h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`rq-${r.key}`}>{r.label}</label>
              <span
                className={
                  'rounded-full px-3 py-0.5 text-xs transition-colors ' +
                  (r.present ? 'bg-green-600 text-white' : 'bg-black/[.07] text-tx-soft')
                }
              >
                {r.present ? t('req.found') : t('req.missing')}
              </span>
            </div>
            {r.key === 'scope' ? (
              r.present && <small className="text-tx-soft">{t('req.fromText')}</small>
            ) : (
              <input
                id={`rq-${r.key}`}
                className="input"
                value={fields[r.key as keyof Fields]}
                inputMode={r.key === 'annual_budget' || r.key === 'contract_years' ? 'numeric' : undefined}
                onChange={(e) => onField(r.key as keyof Fields, e.target.value)}
                maxLength={r.key === 'document_classification' ? 40 : 200}
              />
            )}
            {r.key === 'annual_budget' && fields.annual_budget.trim() !== '' && !r.present && (
              <small className="block text-red-600">{t('req.budgetMin', { min: BUDGET_MIN.toLocaleString('en-US') })}</small>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
