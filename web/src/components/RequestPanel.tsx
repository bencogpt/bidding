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
    <aside className="rounded-lg border border-black/5 bg-paper-2/60 p-4">
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
        {t('req.panelTitle')}
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-tx-soft">{done}/{rows.length}</span>
      </h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`rq-${r.key}`}>{r.label}</label>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs ' +
                  (r.present ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5 text-tx-soft')
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
