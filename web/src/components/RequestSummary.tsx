import { useTranslation } from 'react-i18next';
import { CHECKLIST, REQUESTER_FIELDS } from '@obms/shared';
import type { Fields } from '../lib/useRequestAgent';

const nf = new Intl.NumberFormat('en-US');

// The request in one place before it goes to procurement: the five details, the principal service, and
// whatever else the agent collected. Read-only.
export default function RequestSummary({ brief, fields }: { brief: string; fields: Fields }) {
  const { t } = useTranslation();
  const value = (key: string): string => {
    if (key === 'annual_budget') {
      const n = Number(fields.annual_budget);
      return Number.isFinite(n) && n > 0 ? `₪${nf.format(n)}` : '—';
    }
    return (fields[key as keyof Fields] ?? '').trim() || '—';
  };
  const extras = REQUESTER_FIELDS.filter((f) => !f.required && (fields[f.key as keyof Fields] ?? '').trim() !== '');
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-black/5 bg-paper-2/60 p-4">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
          {CHECKLIST.filter((c) => c.key !== 'scope').map((c) => (
            <div key={c.key} className="min-w-0">
              <div className="text-xs text-tx-soft">{c.label}</div>
              <div className="break-words text-sm font-semibold">
                <bdi>{value(c.key)}</bdi>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-dashed border-black/10 pt-3">
          <div className="text-xs text-tx-soft">{CHECKLIST.find((c) => c.key === 'scope')?.label}</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{brief.trim() || '—'}</div>
        </div>
      </div>
      {extras.length > 0 && (
        <div className="rounded-lg border border-black/5 p-4">
          <h4 className="mb-2 text-sm font-semibold">{t('req.summaryExtras')}</h4>
          <ul className="space-y-1 text-sm">
            {extras.map((f) => (
              <li key={f.key}>
                {f.labelHe}: <b>{fields[f.key as keyof Fields]}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
