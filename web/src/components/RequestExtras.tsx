import { useTranslation } from 'react-i18next';
import { REQUESTER_FIELDS, REQUESTER_TEXTAREA_MAX, REQUESTER_TEXT_MAX } from '@obms/shared';
import type { Fields } from '../lib/useRequestAgent';

// The optional questions of the request: the more the requester fills, the fewer questions procurement asks.
export default function RequestExtras({ fields, onField }: { fields: Fields; onField: (k: keyof Fields, v: string) => void }) {
  const { t } = useTranslation();
  const optional = REQUESTER_FIELDS.filter((f) => !f.required);
  return (
    <section>
      <h2 className="font-semibold">{t('req.extrasTitle')}</h2>
      <p className="mb-3 text-sm text-tx-soft">{t('req.extrasHint')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {optional.map((f) => {
          const key = f.key as keyof Fields;
          return (
            <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
              <label className="label" htmlFor={`rq-${f.key}`}>
                {f.labelHe}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  id={`rq-${f.key}`}
                  className="input min-h-20"
                  maxLength={REQUESTER_TEXTAREA_MAX}
                  value={fields[key]}
                  onChange={(e) => onField(key, e.target.value)}
                />
              ) : (
                <input
                  id={`rq-${f.key}`}
                  className="input"
                  type={f.type === 'number' ? 'number' : 'text'}
                  {...(f.type === 'number' ? { min: 1, step: 1 } : { maxLength: REQUESTER_TEXT_MAX })}
                  value={fields[key]}
                  onChange={(e) => onField(key, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
