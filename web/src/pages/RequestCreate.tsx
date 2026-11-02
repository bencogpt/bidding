import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH } from '@obms/shared';
import { api } from '../lib/api';

// Phase 1 (the requester): only the tender brief. The system answers with the bid number.
export default function RequestCreate() {
  const { t } = useTranslation();
  const [brief, setBrief] = useState('');
  const [serial, setSerial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One id per form: a retried submit returns the request already opened instead of a second one.
  const requestId = useRef(crypto.randomUUID());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (brief.trim().length < 3) {
      setError(t('req.briefTooShort'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.createBidRequest({ brief, requestId: requestId.current });
      setSerial(r.serial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBrief('');
    setSerial(null);
    requestId.current = crypto.randomUUID();
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-2xl font-bold">{t('req.phase1Title')}</h1>
      <p className="mb-6 text-sm text-tx-soft">{t('req.phase1Hint')}</p>
      {serial ? (
        <div className="card space-y-3 p-6">
          <div className="text-lg font-semibold">{t('req.created', { serial })}</div>
          <p className="text-sm text-tx-soft">{t('req.createdHint')}</p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={reset}>
              {t('req.another')}
            </button>
            <Link to="/" className="btn btn-gold">
              {t('nav.dashboard')}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label">
              {t('create.brief')}
              <span className="text-red-600"> *</span>
            </label>
            <textarea
              className="input min-h-32"
              maxLength={BRIEF_MAX_LENGTH}
              placeholder={t('create.briefPlaceholder')}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button className="btn btn-gold" disabled={busy}>
            {busy ? t('req.creating') : t('req.submit')}
          </button>
        </form>
      )}
    </div>
  );
}
