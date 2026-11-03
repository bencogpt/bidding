import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BRIEF_MAX_LENGTH,
  REQUESTER_FIELDS,
  agentDetailsFromFields,
  composeRequestBrief,
  needsAgent,
  normalizeDetailsInput,
  requestChecklist,
} from '@obms/shared';
import { api } from '../lib/api';
import { useRequestAgent } from '../lib/useRequestAgent';
import RequestPanel from '../components/RequestPanel';
import RequestChat from '../components/RequestChat';
import RequestSummary from '../components/RequestSummary';
import RequestRecommendations from '../components/RequestRecommendations';
import StageBar from '../components/StageBar';
import SectionCard, { StatusChip, SubHead } from '../components/SectionCard';

const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// "בל"מ חדש" (the requester): two phases. א · פרטי הבקשה: free writing or an AI agent collects the details.
// ב · סיכום ושליחה: the requester reviews the request, picks recommendations, adds notes and sends it to procurement,
// which gives it a bid number.
export default function RequestCreate() {
  const { t } = useTranslation();
  const a = useRequestAgent();
  const [serial, setSerial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  // One id per form: a retried submit returns the request already opened instead of a second one.
  const requestId = useRef(crypto.randomUUID());

  const rows = requestChecklist(a.brief, a.fields as unknown as Record<string, string>);
  const missing = rows.filter((r) => !r.present).length;
  // The extra questions are asked only by the agent. In text mode the main button continues to the agent while it
  // still has something to ask; phase ב opens when the five details are there and the agent is done.
  const textMode = a.mode === 'free';
  const goAgent = textMode && a.needsMore;
  const agentDone = a.asking !== null && !needsAgent(a.asking);
  const ready = missing === 0 && (textMode ? !a.needsMore : agentDone || !!a.error);
  const sent = serial !== null;
  const agentView = useMemo(
    () => agentDetailsFromFields({ ...a.fields }, new Set(['document_classification'])),
    [a.fields],
  );

  const submit = async () => {
    const { details, badNumbers, missing: missingKeys } = normalizeDetailsInput({ ...a.fields });
    const labelOf = (k: string) => REQUESTER_FIELDS.find((f) => f.key === k)?.labelHe ?? k;
    if (missing || missingKeys.length || badNumbers.length) {
      const k = missingKeys[0] ?? badNumbers[0];
      setError(
        k
          ? t(badNumbers.length && !missingKeys.length ? 'req.badNumber' : 'req.missingField', { field: labelOf(k) })
          : t('req.briefTooShort'),
      );
      return;
    }
    const brief = composeRequestBrief(a.brief, notes, chosen);
    if (brief.length > BRIEF_MAX_LENGTH) {
      setError(t('req.briefTooLong'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.createBidRequest({ brief, requestId: requestId.current, details });
      setSerial(r.serial);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    setNotes('');
    setChosen([]);
    requestId.current = crypto.randomUUID();
  };

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
      <p className="mb-5 text-sm text-tx-soft">{t('req.phase1Hint')}</p>

      <StageBar
        steps={[
          {
            label: t('req.stageA'),
            state: sent || ready ? 'done' : 'cur',
            onClick: sent ? undefined : () => goTo('step-a'),
          },
          {
            label: t('req.stageB'),
            state: sent ? 'done' : ready ? 'cur' : 'todo',
            onClick: ready && !sent ? () => goTo('step-b') : undefined,
          },
        ]}
      />

      {sent && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-900">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-600 text-white">✓</span>
          <div className="flex-1">
            <div className="font-semibold">{t('req.created', { serial })}</div>
            <p className="mt-1 text-sm">{t('req.sentSub')}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-sm" onClick={reset}>
                {t('req.another')}
              </button>
              <Link to="/" className="btn btn-gold btn-sm">
                {t('nav.dashboard')}
              </Link>
            </div>
          </div>
        </div>
      )}

      <SectionCard
        n={1}
        title={t('req.sectionTitle')}
        owner={
          <>
            <span>{t('req.owner')}</span>
            <StatusChip tone={sent ? 'ok' : 'idle'}>{sent ? t('req.statusSent') : t('req.statusDraft')}</StatusChip>
          </>
        }
      >
        {!sent && (
          <div id="step-a">
            <SubHead letter="א" title={t('req.subA')} hint={t('req.pageHint')} />
            <div className="grid gap-6 md:grid-cols-[1fr_280px]">
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
                        <button
                          type="button"
                          className="font-semibold text-gold-deep underline"
                          onClick={() => a.setMode('chat')}
                        >
                          {t('req.switchToAi')}
                        </button>
                      </p>
                    )}
                  </div>
                ) : (
                  <RequestChat
                    chat={a.chat}
                    chips={a.chips}
                    typing={a.typing}
                    disabled={a.asking === 'done'}
                    onSay={a.say}
                  />
                )}

                {a.mode === 'chat' && agentDone && (
                  <div
                    className={
                      'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ' +
                      (missing
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900')
                    }
                  >
                    <span>
                      {missing
                        ? t('req.chatMissing', { fields: rows.filter((r) => !r.present).map((r) => r.label).join(', ') })
                        : t('req.chatReady')}
                    </span>
                    {missing ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          document.getElementById(`rq-${rows.find((r) => !r.present && r.key !== 'scope')?.key}`)?.focus()
                        }
                      >
                        {t('req.chatGoTo')}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-gold btn-sm" onClick={() => goTo('step-b')}>
                        {t('req.toSummary')}
                      </button>
                    )}
                  </div>
                )}

                {a.limited && a.mode === 'chat' && <p className="text-xs text-tx-soft">{t('req.limited')}</p>}
                {a.error && <p className="text-sm text-red-600">{t('req.agentError')}</p>}
              </div>

              <div className="space-y-4">
                <RequestPanel rows={rows} fields={a.fields} onField={a.setField} />
                {goAgent ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-gold w-full"
                      disabled={a.typing}
                      onClick={a.continueToAgent}
                    >
                      {t('req.continue')}
                    </button>
                    <p className="text-xs text-tx-soft">{t('req.continueHint')}</p>
                  </>
                ) : (
                  <button type="button" className="btn btn-gold w-full" disabled={!ready} onClick={() => goTo('step-b')}>
                    {t('req.toSummary')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div id="step-b" className={(sent ? '' : 'mt-8 border-t border-dashed border-black/10 pt-6 ') + (ready || sent ? '' : 'opacity-60')}>
          <SubHead letter="ב" title={t('req.subB')} hint={sent ? undefined : t('req.subBHint')} />
          {ready || sent ? (
            <div className="space-y-6">
              <RequestSummary brief={a.brief} fields={a.fields} />
              <RequestRecommendations
                brief={a.brief}
                details={agentView}
                active={ready && !sent}
                locked={sent}
                chosen={chosen}
                onChosen={setChosen}
              />
              <div>
                <label className="label" htmlFor="rq-notes">
                  {t('req.notesLabel')}
                </label>
                {sent ? (
                  <p className="whitespace-pre-wrap text-sm">{notes.trim() || '—'}</p>
                ) : (
                  <textarea
                    id="rq-notes"
                    className="input min-h-20"
                    value={notes}
                    maxLength={2000}
                    placeholder={t('req.notesPlaceholder')}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </div>
              {!sent && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-gold" disabled={busy} onClick={submit}>
                    {busy ? t('req.creating') : t('req.sendToProcurement')}
                  </button>
                  {error && <span className="text-sm text-red-600">{error}</span>}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-tx-soft">{t('req.summaryLocked')}</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
