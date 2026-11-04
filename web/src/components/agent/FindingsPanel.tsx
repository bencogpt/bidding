import { useState } from 'react';
import type { AgentRunState, FindingView, FindingsView } from '@obms/shared';
import AgentAvatar from './AgentAvatar';
import ThinkingBox, { usePacedStep } from './ThinkingBox';
import { SeverityChip } from './Chips';

type Filter = '' | 'block' | 'warn';

/**
 * The supervising agent beside the draft and the document (prototype findingsPanel / fpCard, lines
 * 2662–2683; CSS 268–310): its state, the open findings to decide on one by one, and "הטמע הכול".
 * A blocking finding is fixed, not marked: it offers "ערוך שדה" when it names a field.
 */
export default function FindingsPanel({
  agent,
  serverStep,
  on,
  creating,
  view,
  canManage,
  busy,
  onRun,
  onApply,
  onApplyAll,
  onEditField,
  onFocus,
  onShowAll,
}: {
  agent: AgentRunState;
  serverStep?: number | null;
  on: 'draft' | 'document';
  creating: boolean;
  view: FindingsView;
  canManage: boolean;
  busy: boolean;
  onRun: () => void;
  onApply: (f: FindingView) => void;
  onApplyAll: () => void;
  onEditField: (paramKey: string) => void;
  onFocus: (f: FindingView) => void;
  onShowAll: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('');
  const step = usePacedStep(agent === 'running', serverStep);
  const open = view.open;
  const list = open.filter((f) => !filter || f.severity === filter);
  const decided = view.applied.length + view.skipped.length;
  const isDraft = on === 'draft';
  const canApplyAll = canManage && open.some((f) => f.severity !== 'block');
  const disabled = agent === 'running' || creating || busy;

  return (
    <div
      className="flex flex-col border"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 'var(--radius-panel)', maxHeight: 'inherit' }}
    >
      <div className="flex items-center gap-2.5 px-[18px] pb-2.5 pt-4">
        <AgentAvatar size={36} busy={agent === 'running'} />
        <div>
          <h2 className="m-0 text-base font-medium">הסוכן המפקח</h2>
          {agent === 'done' && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {open.length ? `${open.length} ממצאים פתוחים` : 'אין ממצאים פתוחים'}
            </span>
          )}
          {agent === 'running' && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              בודק…
            </span>
          )}
        </div>
        <span className="ms-auto flex gap-1.5">
          <button type="button" className="btn btn-quiet btn-sm" disabled={disabled} onClick={onRun}>
            ↻ הרץ בדיקה
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-[18px] pb-3.5 pt-1.5">
        {agent === 'none' && (
          <div className="py-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            {isDraft ? 'הסוכן טרם בדק את הטיוטה.' : 'הסוכן טרם בדק את המסמך.'}
          </div>
        )}
        {agent === 'running' && <ThinkingBox on={on} step={step} />}
        {agent === 'done' && (
          <>
            {open.length > 4 && (
              <div className="mb-2.5 flex gap-1.5 text-xs">
                {(['', 'block', 'warn'] as Filter[]).map((k) => (
                  <button
                    key={k || 'all'}
                    type="button"
                    className="rounded-full px-3 py-0.5"
                    style={filter === k ? { background: 'var(--brand-soft)', color: 'var(--brand)', fontWeight: 600 } : { color: 'var(--muted)' }}
                    onClick={() => setFilter(k)}
                  >
                    {k === '' ? 'הכול' : k === 'block' ? 'חוסם' : 'אזהרה'}
                  </button>
                ))}
              </div>
            )}
            {list.length ? (
              <div className={`flex flex-col gap-2 ${list.length > 3 ? 'max-h-[340px] overflow-auto pe-1' : ''}`}>
                {list.map((f) => (
                  <FindingCard
                    key={f.key}
                    f={f}
                    canManage={canManage}
                    busy={disabled}
                    onApply={() => onApply(f)}
                    onEditField={() => f.paramKey && onEditField(f.paramKey)}
                    onFocus={() => onFocus(f)}
                  />
                ))}
              </div>
            ) : open.length ? (
              <div className="py-2 text-[13px]" style={{ color: 'var(--muted)' }}>
                אין ממצאים בסינון הזה.
              </div>
            ) : (
              <div className="py-2 text-[13px]" style={{ color: 'var(--ok)' }}>
                כל הממצאים טופלו{decided ? ` (${decided})` : ''}.{isDraft ? ' אפשר ליצור את המסמך.' : ''}
              </div>
            )}
          </>
        )}
      </div>

      {agent === 'done' && (
        <div className="px-[18px] py-3.5" style={{ borderTop: '1px solid var(--line-soft)' }}>
          <div className="flex items-center justify-between gap-2">
            {canApplyAll ? (
              <button type="button" className="btn btn-apply btn-sm" disabled={disabled} onClick={onApplyAll}>
                הטמע הכול
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-quiet btn-sm" onClick={onShowAll}>
              לכל הממצאים ←
            </button>
          </div>
          {view.blocking.length > 0 && isDraft && (
            <small className="mt-2 block text-center text-xs" style={{ color: 'var(--bad)' }}>
              ממצא חוסם
            </small>
          )}
        </div>
      )}
    </div>
  );
}

/** One finding, open by default (prototype fpCard): type, place, text, quote, the agent's proposal, action. */
function FindingCard({
  f,
  canManage,
  busy,
  onApply,
  onEditField,
  onFocus,
}: {
  f: FindingView;
  canManage: boolean;
  busy: boolean;
  onApply: () => void;
  onEditField: () => void;
  onFocus: () => void;
}) {
  const block = f.severity === 'block';
  return (
    <div
      className="border px-3 py-2.5"
      style={{
        borderColor: 'var(--line-soft)',
        borderInlineStartWidth: 3,
        borderInlineStartColor: block ? '#d64545' : '#e0a030',
        background: block ? '#fffafa' : 'var(--panel)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <details open>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px]" onClick={onFocus}>
          <SeverityChip severity={block ? 'block' : 'warn'} />
          <b className="font-semibold">{f.typeHe}</b>
          <small className="basis-full text-[11px]" style={{ color: 'var(--muted)' }}>
            {f.location}
          </small>
        </summary>
        <p className="mb-0 mt-2 text-[12.5px] leading-[1.7]">{f.message}</p>
        {f.evidence && f.source === 'ai' && (
          <blockquote
            className="mx-0 mb-0 mt-2 px-3 py-1.5 text-xs"
            style={{ borderInlineStart: '2px solid var(--line)', color: 'var(--muted)', background: 'var(--bg)' }}
            dir="auto"
          >
            {f.evidence}
          </blockquote>
        )}
        {f.fix && (
          <div className="mt-2.5 px-3 py-2 text-[13px] leading-[1.6]" style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius-card)' }}>
            <span className="mb-0.5 block text-[11px]" style={{ color: 'var(--accent)' }}>
              הצעת הסוכן
            </span>
            {f.fix}
          </div>
        )}
      </details>
      {canManage && (
        <div className="mt-2 flex items-center gap-2">
          {!block ? (
            <button type="button" className="btn btn-apply btn-sm" disabled={busy} onClick={onApply}>
              הטמע
            </button>
          ) : (
            f.paramKey && (
              <button type="button" className="btn btn-apply btn-sm" disabled={busy} onClick={onEditField}>
                ערוך שדה
              </button>
            )
          )}
          {block && (
            <small className="text-xs" style={{ color: 'var(--muted)' }}>
              חובה להטמיע
            </small>
          )}
        </div>
      )}
    </div>
  );
}
