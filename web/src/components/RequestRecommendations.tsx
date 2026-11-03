import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentDetails, Recommendation } from '@obms/shared';
import { api } from '../lib/api';

// "המלצות לשיפור ודיוק": notes and ideas for the request. Loaded once the request is complete; the requester ticks
// the ones to include, and the chosen texts go up to the page. Locked once the request has been sent.
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
  const toggle = (text: string) =>
    onChosen(chosen.includes(text) ? chosen.filter((c) => c !== text) : [...chosen, text]);

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
            const on = chosen.includes(r.text);
            if (locked && !on) return null;
            return (
              <li key={r.text}>
                <label
                  className={
                    'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ' +
                    (on ? 'border-gold bg-gold-soft/40' : 'border-black/10') +
                    (locked ? '' : ' cursor-pointer')
                  }
                >
                  <input type="checkbox" className="mt-1" checked={on} disabled={locked} onChange={() => toggle(r.text)} />
                  <span className="flex-none rounded-full border border-black/10 px-2 py-0.5 text-xs text-tx-soft">
                    {r.kind}
                  </span>
                  <span className="leading-relaxed">{r.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
