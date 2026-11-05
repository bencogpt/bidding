import { useState } from 'react';
import {
  PENDING_VISIBLE,
  STAGE_BAR_COUNT,
  STAGE_COLORS,
  STAGES_HE,
  pendingStageCounts,
  type PendingItem,
} from '@obms/shared';

/**
 * "לטיפולך" on the home (prototype renderHome, lines 1953–1975; CSS 843–910, 1093–1095): a count, a collapse
 * button, stage chips with counts, and the rows — the tender, what is waiting, one action. Three rows show,
 * then "הצג עוד N". A unit's contact assignment row has a select of the unit's colleagues.
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

  const chip = (key: number | null, label: string, n: number, color?: string) => {
    const on = stage === key;
    return (
      <button
        key={key ?? 'all'}
        type="button"
        className="-mb-px flex items-center border-b-2 px-0.5 py-[11px] text-[13px]"
        style={{
          color: on ? 'var(--text)' : 'var(--muted)',
          fontWeight: on ? 600 : 400,
          borderBottomColor: on ? 'var(--brand)' : 'transparent',
          opacity: n || key === null ? 1 : 0.45,
        }}
        onClick={() => setStage(on ? null : key)}
      >
        {color && <i className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
        <em className="ms-1.5 not-italic tabular-nums" style={{ color: on ? 'var(--accent)' : 'var(--muted)', fontWeight: on ? 600 : 400 }}>
          {n}
        </em>
      </button>
    );
  };

  return (
    <div className="min-w-0 border" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
      <div className="flex items-center justify-between px-[22px] pb-1 pt-3">
        <h2 className="m-0 flex items-center text-lg font-semibold">
          לטיפולך
          <span
            className="ms-1.5 inline-block min-w-[22px] rounded-full px-[7px] text-center text-xs font-semibold"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
          >
            {items.length}
          </span>
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => setClosed((c) => !c)}>
          {closed ? 'הצג' : 'סגור'}
        </button>
      </div>
      {!closed && (
        <>
          <div className="flex gap-[26px] px-[22px]" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            {chip(null, 'הכול', items.length)}
            {STAGES_HE.slice(0, STAGE_BAR_COUNT).map((label, i) => chip(i, label, counts[i], STAGE_COLORS[i]))}
          </div>
          {shown.length === 0 && (
            <div className="px-[22px] py-4 text-sm" style={{ color: 'var(--muted)' }}>
              אין כרגע פריטים לטיפולך.
            </div>
          )}
          {shown.map((item) => (
            <div key={item.key} className="px-[22px] py-3.5 hover:bg-[#f7f8fa]" style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <div className="mb-0.5 flex items-center gap-2">
                <b className="font-semibold">{item.name}</b>
                <span className="text-xs tabular-nums" style={{ color: 'var(--accent)' }} dir="ltr">
                  {item.ref}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  <b className="font-semibold">{item.bold}</b> {item.text}
                </span>
                {item.select && (
                  <select
                    className="input w-48 !py-1 text-[13px]"
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
                <button
                  type="button"
                  className="ms-1 rounded-full px-3.5 py-[3px] text-xs font-semibold transition-colors hover:!bg-[var(--brand)] hover:!text-white disabled:opacity-50"
                  style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                  disabled={busy || (!!item.select && !picked[item.key])}
                  onClick={() => (item.select ? onAssign(item, picked[item.key]) : onOpen(item))}
                >
                  {item.button} ←
                </button>
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                {item.meta}
              </div>
            </div>
          ))}
          {stage === null && more > 0 && (
            <div className="px-4 py-2">
              <button type="button" className="text-xs" style={{ color: 'var(--muted)' }} onClick={() => setExpanded((e) => !e)}>
                {expanded ? 'הצג פחות' : `הצג עוד ${more}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
