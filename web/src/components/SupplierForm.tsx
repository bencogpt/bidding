import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupplierDoc } from '@obms/shared';
import { api } from '../lib/api';
import TagsInput from './TagsInput';

export default function SupplierForm({
  initial,
  prefill,
  onClose,
}: {
  initial?: SupplierDoc;
  prefill?: {
    name?: string;
    domainTags?: string[];
    isIsraeli?: boolean;
    contactEmail?: string;
    country?: string;
    sourceUrl?: string;
  };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? prefill?.name ?? '');
  const [contactEmail, setContactEmail] = useState(
    initial?.contactEmail ?? prefill?.contactEmail ?? '',
  );
  const [isIsraeli, setIsIsraeli] = useState(initial?.isIsraeli ?? prefill?.isIsraeli ?? true);
  const [status, setStatus] = useState<'active' | 'inactive'>(initial?.status ?? 'active');
  const [domainTags, setDomainTags] = useState<string[]>(
    initial?.domainTags ?? prefill?.domainTags ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.upsertSupplier({
        id: initial?.id,
        name,
        contactEmail,
        country: initial?.country ?? prefill?.country ?? (isIsraeli ? 'IL' : 'OTHER'),
        isIsraeli,
        status,
        domainTags,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={onClose}>
      <form
        className="card w-full max-w-md space-y-4 p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="font-display text-xl font-bold">
          {initial ? t('supplier.edit') : t('supplier.add')}
        </h2>
        <div>
          <label className="label">{t('supplier.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">{t('supplier.contactEmail')}</label>
          <input
            className="input"
            type="email"
            dir="ltr"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
          {prefill?.contactEmail ? (
            <p className="mt-1 text-xs text-amber-700">
              {t('supplier.emailDiscovered')}
              {prefill.sourceUrl && (
                <>
                  {' '}
                  <a
                    className="text-teal-600 underline"
                    href={prefill.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                  >
                    {t('supplier.emailSource')}
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-xs text-tx-mute">{t('supplier.emailOptional')}</p>
          )}
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isIsraeli}
              onChange={(e) => setIsIsraeli(e.target.checked)}
            />
            {t('supplier.isIsraeli')}
          </label>
          <select
            className="input flex-1"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
          >
            <option value="active">{t('supplier.active')}</option>
            <option value="inactive">{t('supplier.inactive')}</option>
          </select>
        </div>
        <div>
          <label className="label">{t('supplier.domainTags')}</label>
          <TagsInput value={domainTags} onChange={setDomainTags} placeholder={t('supplier.domainTagsHint')} />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-gold" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
