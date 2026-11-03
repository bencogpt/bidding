import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recommendationTextError, replaceChosen, type AgentDetails, type Recommendation } from '@obms/shared';
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
}: {
  brief: string;
  details: AgentDetails;
  active: boolean;
  locked: boolean;
  chosen: string[];
  onChosen: (texts: string[]) => void;
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

  const load = async () => {
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

  const stale = items !== null && loadedFor.current !== key && !locked;
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
          <button type="button" className="text-xs text-gold-deep underline" onClick={() => void load()}>
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
              'rounded-lg border px-4 py-3 text-sm ' + (on ? 'border-gold bg-gold-soft/40' : 'border-black/10');
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
                      <button type="button" className="text-xs text-gold-deep underline" onClick={() => restore(r)}>
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
                    <em className="mr-2 rounded-full border border-gold px-2 text-xs not-italic text-gold-deep">
                      {t('req.recEdited')}
                    </em>
                  )}
                </span>
                {!locked && (
                  <button type="button" className="flex-none text-xs text-gold-deep underline" onClick={() => startEdit(r)}>
                    {t('req.recEdit')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
