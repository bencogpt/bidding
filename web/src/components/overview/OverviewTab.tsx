import type { CSSProperties } from 'react';
import {
  NEXT_ACTION_HE,
  agentChip,
  progressPct,
  type AgentRunState,
  type ApprovalRow,
  type DraftState,
  type FindingsView,
  type TemplateDoc,
  type TenderDoc,
  type WorkspaceTabKey,
} from '@obms/shared';
import Avatar from '../Avatar';
import DatesCard from '../DatesCard';
import { AgentChip, ApprovalTag } from '../agent/Chips';

/** The agent's state in one line, on the draft and on the document (prototype draftStrip / agentStrip). */
function agentLine(ds: DraftState, agent: AgentRunState, fv: FindingsView): string {
  if (ds === 'creating') return 'יוצר את המסמך…';
  if (agent === 'none') return ds === 'doc' ? 'הסוכן המפקח טרם בדק את המסמך' : 'הסוכן המפקח טרם בדק את הטיוטה';
  if (agent === 'running') return ds === 'doc' ? 'בודק את המסמך החדש…' : 'הסוכן המפקח בודק את הטיוטה…';
  const n = fv.open.length;
  if (ds === 'doc') {
    return fv.blocking.length ? `ממצא חוסם מונע פרסום לספקים. נמצאו ${n} ממצאים.` : `${n} אזהרות, אין ממצא חוסם.`;
  }
  if (fv.blocking.length) return 'ממצא חוסם: חובה להטמיע אותו לפני יצירת המסמך';
  return n ? `${n} ממצאים ממתינים להחלטה` : 'הטיוטה נבדקה, אפשר ליצור את המסמך';
}

const CARD = 'border p-[22px]';
const cardStyle: CSSProperties = { background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 8 };

/**
 * The overview tab (prototype renderOv, lines 2707–2723; CSS 345–348, 835–836, 884–886, 1220–1223): the
 * agent's state in one line, then three cards — the next action with the progress, the quartet and the
 * dates.
 */
export default function OverviewTab({
  tender,
  template,
  ds,
  stageIdx,
  agent,
  fv,
  rows,
  onTab,
}: {
  tender: TenderDoc;
  template: TemplateDoc | null;
  ds: DraftState;
  stageIdx: number;
  agent: AgentRunState;
  fv: FindingsView;
  rows: ApprovalRow[];
  onTab: (tab: WorkspaceTabKey) => void;
}) {
  const chip = agentChip(agent, fv);
  const pct = progressPct(stageIdx, ds);
  // While drafting, the next step is the agent's decisions and then the document (prototype line 2710).
  const next =
    ds !== 'doc'
      ? { text: 'הרצת הסוכן המפקח והחלטה על הממצאים, ואז יצירת המסמך', button: 'עבור למסמך', tab: 'document' as WorkspaceTabKey }
      : NEXT_ACTION_HE[stageIdx];

  return (
    <div>
      <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3.5 border px-[18px] py-3"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 10 }}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {ds === 'doc' ? (
              <>
                <AgentChip tone={chip.tone}>{chip.label}</AgentChip>
                <b className="font-medium">הסוכן המפקח</b>
              </>
            ) : (
              <>
                <AgentChip tone="neutral">טיוטה</AgentChip>
                <b className="font-medium">טרם נוצר מסמך</b>
              </>
            )}
            <span className="text-[13px]" style={{ color: 'var(--muted)' }}>
              {agentLine(ds, agent, fv)}
            </span>
          </div>
          {ds === 'doc' ? (
            <button type="button" className="btn btn-sm" onClick={() => onTab('agent')}>
              לדוח הסוכן
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onTab('document')}>
              למסמך
            </button>
          )}
        </div>

      <div className="grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className={CARD} style={cardStyle}>
          <h3 className="m-0 mb-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            הפעולה הבאה
          </h3>
          <div className="mb-4 text-lg font-semibold">{next.text}</div>
          <button type="button" className="btn btn-primary" onClick={() => onTab(next.tab)}>
            {next.button}
          </button>
          <div className="mt-[18px]">
            <span className="inline-flex items-center gap-[7px] text-xs" style={{ color: 'var(--muted)' }}>
              <span
                className="inline-block h-4 w-4 rounded-full"
                style={{ background: `conic-gradient(var(--brand) ${pct}%, var(--line) 0)` }}
                aria-hidden="true"
              />
              {pct}% התקדמות
            </span>
          </div>
        </div>

        <div className={CARD} style={cardStyle}>
          <h3 className="m-0 mb-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            הרביעייה
          </h3>
          {rows.map((r) => (
            <div
              key={r.role}
              className="flex items-center justify-between gap-2 py-1.5 last:border-0"
              style={{ borderBottom: '1px solid var(--line-soft)' }}
            >
              <span className="flex min-w-0 items-center gap-2">
                {r.name && <Avatar name={r.name} size={22} />}
                <span>
                  {r.roleHe} ·{' '}
                  {r.name ?? <span style={{ color: 'var(--warn)' }}>לא משובץ</span>}
                  {r.nonBlocking && (
                    <small className="ms-1.5" style={{ color: 'var(--muted)' }}>
                      לא חוסם
                    </small>
                  )}
                </span>
              </span>
              <ApprovalTag tag={r.tag} title={r.tagTitle}>
                {r.tagLabel}
              </ApprovalTag>
            </div>
          ))}
        </div>

        <DatesCard tender={tender} template={template} stageIdx={stageIdx} />
      </div>
    </div>
  );
}
