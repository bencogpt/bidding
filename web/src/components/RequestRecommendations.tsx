import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  recommendationTextError,
  replaceChosen,
  type AgentDetails,
  type Recommendation,
  type ResearchDraftResult,
} from '@obms/shared';
import { api } from '../lib/api';

// "המלצות לשיפור ודיוק": notes and ideas for the request. Loaded once the request is complete; the requester ticks
// the ones to include and may edit the wording of any of them. The chosen texts (as edited) go up to the page.
// Locked once the request has been sent.
export default function RequestRecommendations({
  brief,
  details,
  active,
  locked,
  chosen,
  onChosen,
  onResearch,
  onStatus,
}: {
  brief: string;
  details: AgentDetails;
  active: boolean;
  locked: boolean;
  chosen: string[];
  onChosen: (texts: string[]) => void;
  onResearch?: (runId: string | null) => void; // the web research run, linked to the request when it is sent
  onStatus?: (status: 'idle' | 'loading' | 'done') => void; // the page waits for the list before the request can go
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}); // original text -> the requester's wording
  const [editing, setEditing] = useState<string | null>(null); // original text of the item being edited
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const key = JSON.stringify([brief, details]);
  const loadedFor = useRef('');
  // Web research on similar procurements runs alongside (a minute or two); its findings are ideas with sources.
  const [research, setResearch] = useState<ResearchDraftResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const searchSeq = useRef(0);

  const search = async () => {
    const mine = ++searchSeq.current;
    setSearching(true);
    setSearchFailed(false);
    setResearch(null);
    onResearch?.(null);
    try {
      const r = await api.researchDraftRequest({ brief, details });
      if (mine !== searchSeq.current) return;
      setResearch(r);
      onResearch?.(r.runId);
    } catch {
      if (mine === searchSeq.current) setSearchFailed(true);
    } finally {
      if (mine === searchSeq.current) setSearching(false);
    }
  };

  const load = async () => {
    void search();
    const mine = ++seq.current;
    loadedFor.current = key;
    setBusy(true);
    setFailed(false);
    try {
      const r = await api.requestRecommendations({ brief, details });
      if (mine !== seq.current) return;
      setItems(r.items);
      setEdits({});
      setEditing(null);
      onChosen([]);
    } catch {
      if (mine === seq.current) setFailed(true);
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };

  // Load once when the request becomes complete; a later edit offers a refresh instead of silently replacing choices.
  useEffect(() => {
    if (active && !locked && items === null && !busy && loadedFor.current === '') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, locked]);

  // Web findings as pickable items: the chosen text names its sources, so it travels with the brief.
  const webItems = [
    ...(research?.suggestedFeatures ?? []).map((f) => ({
      kind: t('req.webIdea'),
      label: f.feature,
      why: f.why,
      priority: f.priority,
      urls: f.sourceUrls,
    })),
    ...(research?.pitfalls ?? []).map((p) => ({ kind: t('req.webNote'), label: p, why: '', priority: null, urls: [] as string[] })),
  ].map((w) => ({
    ...w,
    text: w.urls.length ? `${w.label} (מקור: ${w.urls.map(domainOf).join(', ')})` : w.label,
  }));
  const stale = items !== null && loadedFor.current !== key && !locked;
  const status = busy ? 'loading' : items !== null || failed ? 'done' : 'idle';
  useEffect(() => {
    onStatus?.(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const textOf = (r: Recommendation) => edits[r.text] ?? r.text;
  const toggle = (text: string) =>
    onChosen(chosen.includes(text) ? chosen.filter((c) => c !== text) : [...chosen, text]);

  const startEdit = (r: Recommendation) => {
    setEditing(r.text);
    setDraft(textOf(r));
    setDraftError('');
  };
  const saveEdit = (r: Recommendation) => {
    const text = draft.trim();
    const err = recommendationTextError(text);
    if (err) {
      setDraftError(err);
      return;
    }
    const before = textOf(r);
    // Saving an edit also picks the item; the edit is dropped when it matches the original.
    setEdits((e) => {
      const next = { ...e };
      if (text === r.text) delete next[r.text];
      else next[r.text] = text;
      return next;
    });
    onChosen(replaceChosen(chosen, before, text));
    setEditing(null);
  };
  const restore = (r: Recommendation) => {
    const before = textOf(r);
    setEdits((e) => {
      const next = { ...e };
      delete next[r.text];
      return next;
    });
    if (chosen.includes(before)) onChosen(replaceChosen(chosen, before, r.text));
    setEditing(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t('req.recTitle')}</h4>
        {active && !locked && !busy && (items !== null || failed) && (
          <button type="button" className="text-xs text-accent underline" onClick={() => void load()}>
            {stale ? t('req.recRefreshStale') : t('req.recRefresh')}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-tx-soft">{t('req.recHint')}</p>
      {!active && !locked && items === null && <p className="text-sm text-tx-soft">{t('req.summaryLocked')}</p>}
      {busy && <p className="text-sm text-tx-soft">{t('req.recBusy')}</p>}
      {failed && !busy && <p className="text-sm text-tx-soft">{t('req.recFailed')}</p>}
      {items !== null && !busy && items.length === 0 && <p className="text-sm text-tx-soft">{t('req.recNone')}</p>}
      {items !== null && !busy && (
        <ul className="space-y-2">
          {items.map((r) => {
            const text = textOf(r);
            const on = chosen.includes(text);
            if (locked && !on) return null;
            const box =
              'rounded-lg border px-4 py-3 text-sm ' + (on ? 'border-accent bg-accent-soft' : 'border-black/10');
            if (editing === r.text && !locked) {
              return (
                <li key={r.text} className={box}>
                  <textarea
                    className="input min-h-20"
                    value={draft}
                    maxLength={300}
                    autoFocus
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setDraftError('');
                    }}
                  />
                  {draftError && <div className="mt-1 text-xs text-red-600">{draftError}</div>}
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" className="btn btn-gold btn-sm" onClick={() => saveEdit(r)}>
                      {t('req.recSave')}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                      {t('req.recCancel')}
                    </button>
                    {edits[r.text] && (
                      <button type="button" className="text-xs text-accent underline" onClick={() => restore(r)}>
                        {t('req.recRestore')}
                      </button>
                    )}
                  </div>
                </li>
              );
            }
            return (
              <li key={r.text} className={box + ' flex items-start gap-3'}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={on}
                  disabled={locked}
                  aria-label={text}
                  onChange={() => toggle(text)}
                />
                <span className="flex-none rounded-full border border-black/10 px-2 py-0.5 text-xs text-tx-soft">
                  {r.kind}
                </span>
                <span className="flex-1 leading-relaxed">
                  {text}
                  {edits[r.text] && (
                    <em className="mr-2 rounded-full border border-accent px-2 text-xs not-italic text-accent">
                      {t('req.recEdited')}
                    </em>
                  )}
                </span>
                {!locked && (
                  <button type="button" className="flex-none text-xs text-accent underline" onClick={() => startEdit(r)}>
                    {t('req.recEdit')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(searching || searchFailed || research) && (
        <div className="mt-5">
          <h4 className="mb-1 text-sm font-semibold">{t('req.webTitle')}</h4>
          <p className="mb-3 text-xs text-tx-soft">{t('req.webHint')}</p>
          {searching && <p className="text-sm text-tx-soft">{t('req.webBusy')}</p>}
          {!searching && (searchFailed || (research && research.status !== 'done')) && (
            <p className="text-sm text-tx-soft">{t('req.webUnavailable')}</p>
          )}
          {!searching && research?.status === 'done' && webItems.length === 0 && (
            <p className="text-sm text-tx-soft">{t('req.recNone')}</p>
          )}
          {!searching && research?.status === 'done' && webItems.length > 0 && (
            <ul className="space-y-2">
              {webItems.map((w) => {
                const on = chosen.includes(w.text);
                if (locked && !on) return null;
                return (
                  <li key={w.text}>
                    <label
                      className={
                        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ' +
                        (on ? 'border-accent bg-accent-soft' : 'border-black/10') +
                        (locked ? '' : ' cursor-pointer')
                      }
                    >
                      <input type="checkbox" className="mt-1" checked={on} disabled={locked} onChange={() => toggle(w.text)} />
                      <span className="flex-none rounded-full border border-black/10 px-2 py-0.5 text-xs text-tx-soft">
                        {w.kind}
                      </span>
                      <span className="leading-relaxed">
                        {w.label}
                        {w.priority && <span className="ms-2 text-xs text-tx-soft">· {t(`req.webPriority.${w.priority}`)}</span>}
                        {w.why && <span className="block text-xs text-tx-soft">{w.why}</span>}
                        {w.urls.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-2 text-xs" dir="ltr">
                            {w.urls.map((u) => (
                              <a
                                key={u}
                                href={u}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {domainOf(u)}
                              </a>
                            ))}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
