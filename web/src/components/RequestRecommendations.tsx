import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentDetails, Recommendation, ResearchDraftResult } from '@obms/shared';
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
  onResearch,
}: {
  brief: string;
  details: AgentDetails;
  active: boolean;
  locked: boolean;
  chosen: string[];
  onChosen: (texts: string[]) => void;
  onResearch?: (runId: string | null) => void; // the web research run, linked to the request when it is sent
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Recommendation[] | null>(null);
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
                        (on ? 'border-gold bg-gold-soft/40' : 'border-black/10') +
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
                                className="text-gold-deep underline"
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
