import { useState } from 'react';
import {
  PENDING_VISIBLE,
  STAGE_BAR_COUNT,
  STAGE_COLORS,
  STAGES_HE,
  pendingStageCounts,
  type PendingItem,
  type PendingTone,
} from '@obms/shared';

// v22 PI_IC: r = blocking / urgent (a warning sign), w = waiting for you (a clock), g = information (a check).
const ICON_PATHS: Record<PendingTone, string[]> = {
  r: ['M8 1.5l7 12.5H1z', 'M8 6v3.5M8 11.5v.5'],
  w: ['M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z', 'M8 4.5V8l2.5 1.5'],
  g: ['M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z', 'M5.2 8.2l2 2 3.6-4'],
};

function ToneIcon({ tone }: { tone: PendingTone }) {
  return (
    <span className={`pi-ic ${tone}`} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[tone].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

/**
 * "לטיפולך" on the home (prototype v22 renderHome; CSS lines 276–303): a count, a collapse button, the stage
 * pills with counts, and the rows — an urgency icon, the tender, what is waiting, one pill action (the first
 * one filled). Three rows show, then "הצג עוד N". A unit's contact assignment row has a select of the unit's
 * colleagues.
 */
export default function PendingList({
  items,
  candidates,
  busy,
  onOpen,
  onAssign,
}: {
  items: PendingItem[];
  candidates: Record<string, { uid: string; name: string }[]>;
  busy?: boolean;
  onOpen: (item: PendingItem) => void;
  onAssign: (item: PendingItem, uid: string) => void;
}) {
  const [closed, setClosed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const counts = pendingStageCounts(items);
  const filtered = stage === null ? items : items.filter((i) => i.stageIdx === stage);
  const shown = stage !== null || expanded ? filtered : filtered.slice(0, PENDING_VISIBLE);
  const more = items.length - PENDING_VISIBLE;

  const pill = (key: number | null, label: string, n: number, color?: string) => (
    <button
      key={key ?? 'all'}
      type="button"
      className={`${stage === key ? 'on' : ''} ${n || key === null ? '' : 'zero'}`}
      onClick={() => setStage(stage === key ? null : key)}
    >
      {color && <i className="sd" style={{ background: color }} />}
      {label}
      <em className="n">{n}</em>
    </button>
  );

  return (
    <div className="pending min-w-0">
      <div className="p-head">
        <h2 className="m-0 flex items-center font-semibold">
          לטיפולך
          <span className="count">{items.length}</span>
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => setClosed((c) => !c)}>
          {closed ? 'הצג' : 'סגור'}
        </button>
      </div>
      {!closed && (
        <>
          <div className="seg-row">
            <div className="seg">
              {pill(null, 'הכול', items.length)}
              {STAGES_HE.slice(0, STAGE_BAR_COUNT).map((label, i) => pill(i, label, counts[i], STAGE_COLORS[i]))}
            </div>
          </div>
          {shown.length === 0 && (
            <div className="px-6 py-4 text-sm" style={{ color: 'var(--muted)' }}>
              אין כרגע פריטים לטיפולך.
            </div>
          )}
          {shown.map((item, i) => (
            <div key={item.key} className="pitem">
              <ToneIcon tone={item.tone} />
              <div className="pi-main">
                <div className="pi-t">
                  <b>{item.name}</b>
                  <span className="ref" dir="ltr">
                    {item.ref}
                  </span>
                </div>
                <div className="pi-s">
                  <b>{item.bold}</b> {item.text}
                  {item.select && (
                    <select
                      className="input ms-2 inline-block w-48 !py-1 text-[13px]"
                      value={picked[item.key] ?? ''}
                      onChange={(e) => setPicked((p) => ({ ...p, [item.key]: e.target.value }))}
                    >
                      <option value="">בחר איש קשר…</option>
                      {(candidates[item.target.kind === 'assign' ? item.target.tenderId : ''] ?? []).map((c) => (
                        <option key={c.uid} value={c.uid}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="pi-m">{item.meta}</div>
              </div>
              <button
                type="button"
                className={`pi-go ${i === 0 ? 'first' : ''}`}
                disabled={busy || (!!item.select && !picked[item.key])}
                onClick={() => (item.select ? onAssign(item, picked[item.key]) : onOpen(item))}
              >
                {item.button}
              </button>
            </div>
          ))}
          {stage === null && more > 0 && (
            <div className="pmore">
              <button type="button" onClick={() => setExpanded((e) => !e)}>
                {expanded ? 'הצג פחות' : `הצג עוד ${more}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
