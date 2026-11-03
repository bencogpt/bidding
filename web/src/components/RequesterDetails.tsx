import { useTranslation } from 'react-i18next';
import { REQUESTER_FIELDS, type RequesterDetails as Details } from '@obms/shared';

// The requester's phase 1 answers, read-only, for the procurement manager. The internal budget is shown
// here too (the manager may see it) but labelled — it never goes to the AI draft or the document.
export default function RequesterDetails({ details }: { details?: Partial<Details> }) {
  const { t } = useTranslation();
  const rows = REQUESTER_FIELDS.filter((f) => String(details?.[f.key] ?? '').trim() !== '');
  if (!rows.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-black/5 p-4">
      <h2 className="font-semibold">{t('create.requesterDetails')}</h2>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-tx-soft">
              {f.labelHe}
              {f.internal && <span className="text-red-600"> ({t('create.internalOnly')})</span>}
            </dt>
            <dd>{String(details?.[f.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
