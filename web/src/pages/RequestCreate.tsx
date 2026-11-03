import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH, REQUESTER_FIELDS, normalizeDetailsInput, requestChecklist } from '@obms/shared';
import { api } from '../lib/api';
import { useRequestAgent } from '../lib/useRequestAgent';
import RequestPanel from '../components/RequestPanel';
import RequestChat from '../components/RequestChat';

// "בל"מ חדש" (the requester): free writing or an AI agent collects the five mandatory details, then the
// request goes to procurement and gets its bid number.
export default function RequestCreate() {
  const { t } = useTranslation();
  const a = useRequestAgent();
  const [serial, setSerial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One id per form: a retried submit returns the request already opened instead of a second one.
  const requestId = useRef(crypto.randomUUID());

  const rows = requestChecklist(a.brief, a.fields as unknown as Record<string, string>);
  const missing = rows.filter((r) => !r.present).length;

  const submit = async () => {
    const { details, badNumbers, missing: missingKeys } = normalizeDetailsInput({ ...a.fields });
    const labelOf = (k: string) => REQUESTER_FIELDS.find((f) => f.key === k)?.labelHe ?? k;
    if (missing || missingKeys.length || badNumbers.length) {
      const k = missingKeys[0] ?? badNumbers[0];
      setError(k ? t(badNumbers.length && !missingKeys.length ? 'req.badNumber' : 'req.missingField', { field: labelOf(k) }) : t('req.briefTooShort'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.createBidRequest({ brief: a.brief, requestId: requestId.current, details });
      setSerial(r.serial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    a.reset();
    setSerial(null);
    setError('');
    requestId.current = crypto.randomUUID();
  };

  if (serial) {
    return (
      <div className="mx-auto max-w-2xl">
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
      </div>
    );
  }

  const modeBtn = (m: 'free' | 'chat', title: string, hint: string) => (
    <button
      type="button"
      onClick={() => a.setMode(m)}
      className={
        'flex flex-1 flex-col rounded-lg border px-4 py-3 text-start ' +
        (a.mode === m ? 'border-gold bg-gold-soft/40 font-semibold' : 'border-black/10 hover:border-gold')
      }
    >
      <span>{title}</span>
      <small className="font-normal text-tx-soft">{hint}</small>
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">{t('req.phase1Title')}</h1>
      <p className="mb-2 text-sm text-tx-soft">{t('req.phase1Hint')}</p>
      <p className="mb-6 text-sm text-tx-soft">{t('req.pageHint')}</p>
      <div className="card grid gap-6 p-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="flex gap-3">
            {modeBtn('free', t('req.modeFree'), t('req.modeFreeHint'))}
            {modeBtn('chat', t('req.modeAi'), t('req.modeAiHint'))}
          </div>

          {a.mode === 'free' ? (
            <div>
              <label className="label" htmlFor="rq-brief">
                {t('req.principalService')}
                <span className="text-red-600"> *</span>
              </label>
              <textarea
                id="rq-brief"
                className="input min-h-40"
                maxLength={BRIEF_MAX_LENGTH}
                placeholder={t('req.briefPlaceholder')}
                value={a.brief}
                onChange={(e) => a.setBrief(e.target.value)}
              />
              {missing > 0 && (
                <p className="mt-2 text-sm text-tx-soft">
                  {t('req.missingHint', { n: missing })}{' '}
                  <button type="button" className="font-semibold text-gold-deep underline" onClick={() => a.setMode('chat')}>
                    {t('req.switchToAi')}
                  </button>
                </p>
              )}
            </div>
          ) : (
            <RequestChat chat={a.chat} chips={a.chips} typing={a.typing} disabled={a.asking === 'done'} onSay={a.say} />
          )}

          {a.limited && a.mode === 'chat' && <p className="text-xs text-tx-soft">{t('req.limited')}</p>}
          {a.error && <p className="text-sm text-red-600">{t('req.agentError')}</p>}
        </div>

        <div className="space-y-4">
          <RequestPanel rows={rows} fields={a.fields} onField={a.setField} />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="button" className="btn btn-gold w-full" disabled={busy || missing > 0} onClick={submit}>
            {busy ? t('req.creating') : t('req.sendToProcurement')}
          </button>
        </div>
      </div>
    </div>
  );
}
