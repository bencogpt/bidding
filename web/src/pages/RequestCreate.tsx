import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BRIEF_MAX_LENGTH,
  BUDGET_MIN,
  REQUESTER_FIELDS,
  agentDetailsFromFields,
  composeRequestBrief,
  needsAgent,
  normalizeDetailsInput,
  pageCount,
  requestChecklist,
} from '@obms/shared';
import { api } from '../lib/api';
import { useRequestAgent } from '../lib/useRequestAgent';
import RequestPanel from '../components/RequestPanel';
import RequestChat from '../components/RequestChat';
import RequestGuide, { STARTERS } from '../components/RequestGuide';
import BigEditor from '../components/BigEditor';
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
  const nav = useNavigate();
  const a = useRequestAgent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  // The principal service as formatted in the large window: kept here for the summary; the request itself is plain text.
  const [rich, setRich] = useState<{ text: string; html: string } | null>(null);
  const richHtmlFor = (text: string) => (rich && rich.text === text.trim() ? rich.html : undefined);
  const [blurTick, setBlurTick] = useState(0); // goes up when the free-writing box loses focus
  const briefBox = useRef<HTMLTextAreaElement>(null);
  const [recsStatus, setRecsStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [bigText, setBigText] = useState(false); // the large writing window over the free-writing box
  // The web research run on the summary step, linked to the request so it isn't searched again.
  const [researchRunId, setResearchRunId] = useState<string | null>(null);
  // One id per form: a retried submit returns the request already opened instead of a second one.
  const requestId = useRef(crypto.randomUUID());

  const rows = requestChecklist(a.brief, a.fields as unknown as Record<string, string>);
  const missing = rows.filter((r) => !r.present).length;
  // The extra questions are asked only by the agent. In text mode the main button continues to the agent while it
  // still has something to ask; phase ב opens when the five details are there and the agent is done.
  const textMode = a.mode === 'free';
  // The frame amount is asked by the agent too, so a missing amount also sends text mode on to the chat.
  const budgetMissing = rows.some((r) => r.key === 'annual_budget' && !r.present);
  const goAgent = textMode && (a.needsMore || budgetMissing);
  const agentDone = a.asking !== null && !needsAgent(a.asking);
  const ready = missing === 0 && (textMode ? !a.needsMore : agentDone || !!a.error);
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
        k === 'annual_budget' && !missingKeys.length
          ? t('req.budgetMin', { min: BUDGET_MIN.toLocaleString('en-US') })
          : k
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
      const r = await api.createBidRequest({
        brief,
        requestId: requestId.current,
        details,
        ...(researchRunId ? { researchRunId } : {}),
      });
      // Like the prototype: leave for the list, where the new request is shown with a green notice.
      nav('/', { state: { sentSerial: r.serial } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const el = briefBox.current;
    if (!el) return;
    const top = el.scrollTop;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 150), 340)}px`;
    el.scrollTop = top;
  }, [a.brief, a.mode]);

  const pickMode = (m: 'free' | 'chat') => {
    a.setMode(m);
    if (m === 'chat') setTimeout(() => goTo('rq-mode'), 0);
  };
  // Start a line for a missing detail at the end of the text, with the cursor after it.
  const appendStarter = (key: string) => {
    if (key !== 'scope' && STARTERS[key]) {
      const base = a.brief.replace(/\s+$/, '');
      a.setBrief((base ? `${base}\n` : '') + STARTERS[key]);
    }
    setTimeout(() => {
      const box = document.getElementById('rq-brief') as HTMLTextAreaElement | null;
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    }, 0);
  };

  const pickOption = (key: string, option: string) => {
    const base = a.brief.replace(/\s+$/, '');
    a.setBrief((base ? `${base}\n` : '') + (STARTERS[key] ?? '') + option);
    setTimeout(() => {
      const el = briefBox.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  };

  const modeBtn = (m: 'free' | 'chat', title: string, hint: string, icon: ReactNode) => {
    const on = a.mode === m;
    return (
      <button
        type="button"
        onClick={() => pickMode(m)}
        className={
          'flex items-center gap-3 rounded-[10px] border px-4 py-3 text-start transition-colors ' +
          (on
            ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_#5b3fd1]'
            : 'border-black/10 bg-surface hover:border-accent')
        }
      >
        <span className={'flex-none ' + (on ? 'text-accent' : 'text-tx-soft')}>{icon}</span>
        <span>
          <b className={'block text-sm font-medium ' + (on ? 'text-accent' : '')}>{title}</b>
          <small className="mt-0.5 block text-xs font-normal text-tx-soft">{hint}</small>
        </span>
      </button>
    );
  };
  const svg = (children: ReactNode) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">{t('req.phase1Title')}</h1>
      <p className="mb-5 text-sm text-tx-soft">{t('req.phase1Hint')}</p>

      <StageBar
        steps={[
          {
            label: t('req.stageA'),
            state: ready ? 'done' : 'cur',
            onClick: () => goTo('step-a'),
          },
          {
            label: t('req.stageB'),
            state: ready ? 'cur' : 'todo',
            onClick: () => goTo('step-b'),
          },
        ]}
      />

      <SectionCard
        n={1}
        title={t('req.sectionTitle')}
        owner={
          <>
            <span>{t('req.owner')}</span>
            <StatusChip tone="wait">{t('req.statusDraft')}</StatusChip>
          </>
        }
      >
        <div id="step-a">
            <SubHead letter="א" title={t('req.subA')} />
            <div className="grid gap-6 md:grid-cols-[1fr_280px]">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-1.5 text-[15px] font-medium">{t('req.modeQuestion')}</h4>
                  <p className="text-[13px] leading-7 text-tx-soft">{t('req.modeIntro')}</p>
                </div>
                <div id="rq-mode" className="grid scroll-mt-4 gap-2.5 sm:grid-cols-2">
                  {modeBtn(
                    'free',
                    t('req.modeFree'),
                    t('req.modeFreeHint'),
                    svg(
                      <>
                        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
                        <path d="M13.5 6.5l4 4" />
                      </>,
                    ),
                  )}
                  {modeBtn(
                    'chat',
                    t('req.modeAi'),
                    t('req.modeAiHint'),
                    svg(
                      <>
                        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
                        <path d="M9 11h.01M12 11h.01M15 11h.01" />
                      </>,
                    ),
                  )}
                </div>

                {a.mode === 'free' ? (
                  <div>
                    <div className="relative overflow-hidden rounded-[10px] border border-black/10 bg-surface transition-colors focus-within:border-accent">
                      <button
                        type="button"
                        className="absolute end-6 top-2 z-[2] grid h-[30px] w-[30px] place-items-center rounded-full bg-surface text-tx-soft transition-colors hover:bg-accent-soft hover:text-accent"
                        title={t('req.expand')}
                        aria-label={t('req.expand')}
                        onClick={() => setBigText(true)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                      </button>
                      <textarea
                        ref={briefBox}
                        id="rq-brief"
                        className="block min-h-[150px] w-full resize-none overflow-y-auto border-0 bg-transparent px-4 py-3.5 text-sm leading-[1.7] outline-none"
                        maxLength={BRIEF_MAX_LENGTH}
                        placeholder={t('req.briefPlaceholder')}
                        value={a.brief}
                        onChange={(e) => a.setBrief(e.target.value)}
                        onBlur={() => setBlurTick((n) => n + 1)}
                      />
                      <RequestGuide
                        brief={a.brief}
                        rows={rows}
                        nudge={blurTick}
                        onPick={pickOption}
                        onAppend={appendStarter}
                        onChat={() => pickMode('chat')}
                      />
                    </div>
                    {a.brief.length > BRIEF_MAX_LENGTH * 0.8 && (
                      <div className="mt-1 text-xs text-red-600">{t('req.pagesOf', { n: pageCount(a.brief), max: 5 })}</div>
                    )}
                    {a.brief.trim() && missing === 0 && (
                      <div className="mt-3.5 flex flex-wrap items-center gap-3">
                        {goAgent ? (
                          <>
                            <button type="button" className="btn btn-gold" disabled={a.typing} onClick={a.continueToAgent}>
                              {t('req.continueArrow')}
                            </button>
                            <span className="text-xs text-tx-soft">{t('req.continueHint')}</span>
                          </>
                        ) : (
                          <button type="button" className="btn btn-gold" disabled={!ready} onClick={() => goTo('step-b')}>
                            {t('req.toSummaryArrow')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <RequestChat
                    chat={a.chat}
                    chips={a.chips}
                    typing={a.typing}
                    disabled={a.asking === 'done'}
                    asking={a.asking}
                    details={{ n: rows.length - missing, total: rows.length }}
                    onSay={(text, html) => {
                      if (html) setRich({ text: text.trim(), html });
                      a.say(text);
                    }}
                    onEdit={(index, text, html) => {
                      if (html) setRich({ text: text.trim(), html });
                      a.edit(index, text);
                    }}
                    editAsking={a.editAsking}
                    richHtmlFor={richHtmlFor}
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
                        onClick={() => {
                          const first = rows.find((r) => !r.present);
                          a.setMode('free');
                          appendStarter(first?.key ?? 'scope');
                        }}
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
                <RequestPanel rows={rows} fields={a.fields} />
              </div>
            </div>
          </div>

        <div id="step-b" className={'mt-8 border-t border-dashed border-black/10 pt-6 ' + (ready ? '' : 'opacity-60')}>
          <SubHead letter="ב" title={t('req.subB')} hint={t('req.subBHint')} />
          {ready ? (
            <div className="space-y-6">
              <RequestSummary brief={a.brief} fields={a.fields} rich={rich} />
              <RequestRecommendations
                onResearch={setResearchRunId}
                onStatus={setRecsStatus}
                brief={a.brief}
                details={agentView}
                active={ready}
                locked={false}
                chosen={chosen}
                onChosen={setChosen}
              />
              <div>
                <label className="label" htmlFor="rq-notes">
                  {t('req.notesLabel')}
                </label>
                <textarea
                  id="rq-notes"
                  className="input min-h-20"
                  value={notes}
                  maxLength={2000}
                  placeholder={t('req.notesPlaceholder')}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-gold" disabled={busy || recsStatus !== 'done'} onClick={submit}>
                  {busy ? t('req.creating') : t('req.sendToProcurement')}
                </button>
                {recsStatus !== 'done' && !busy && <span className="text-xs text-tx-soft">{t('req.recsPending')}</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-tx-soft">{t('req.summaryLocked')}</p>
          )}
        </div>
      </SectionCard>
      <div className="mt-1">
        <button type="button" className="btn" onClick={() => nav('/')}>
          {t('req.cancel')}
        </button>
      </div>
      {bigText && (
        <BigEditor
          title={t('req.freeTitle')}
          initial={a.brief}
          initialHtml={richHtmlFor(a.brief)}
          submitLabel={t('req.bigSave')}
          closeLabel={t('req.cancel')}
          hint={t('req.freeSaveHint')}
          onClose={() => setBigText(false)}
          onSubmit={(v, html) => {
            a.setBrief(v.slice(0, BRIEF_MAX_LENGTH));
            if (html) setRich({ text: v.slice(0, BRIEF_MAX_LENGTH).trim(), html });
            setBigText(false);
          }}
        />
      )}
    </div>
  );
}
