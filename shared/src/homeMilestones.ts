// The home's "מועדים קרובים" panel (prototype milestone / mileHtml, lines 1868–1917): for each active case, the
// next stage it should enter, the date set for it, and who it is still waiting for. Plan task E2.
//
// Real data has fewer dates than the prototype's demo: only the submission deadline (when "הצעות" begins) is
// known. A publish target date and the conference don't exist, so those rows have no date ("טרם נקבע").
import type { TeamRole } from './team.js';
import {
  CONFERENCE_STAGE_IDX,
  QUARTET_ROLES,
  ROLE_HE,
  STAGE_BAR_COUNT,
  STAGES_HE,
  type QuartetRole,
  type WorkspaceTabKey,
} from './workspaceLabels.js';
import { isApproved, type Approvals, type Holders } from './workspaceView.js';

export interface MilestoneInput {
  id: string;
  ref: string;
  name: string;
  kind: 'tender' | 'request';
  stageIdx: number;
  /** Stage עריכה: the team's approvals and who holds each role. */
  holders?: Holders;
  approvals?: Approvals;
  /** The roles whose approval the final approval waits for (requester, legal, finance; security doesn't block). */
  approverRoles?: readonly TeamRole[];
  submissionDeadline?: number | null;
}

export interface Milestone {
  id: string;
  ref: string;
  name: string;
  kind: 'tender' | 'request';
  stageIdx: number;
  nextIdx: number;
  nextLabel: string;
  /** When the next stage is due; null when no date is set for it. */
  at: number | null;
  /** "24.11", or "טרם נקבע". */
  when: string;
  /** Due within 3 days (or overdue): the date shows in red. */
  hot: boolean;
  /** Role labels of whoever still holds it up ("דורש", "רכש"…), in the quartet's order. */
  waiting: string[];
  /** "קיים סיכון: …" lines: a delay when it is due soon and still waits for someone. */
  risks: string[];
  /** The workspace tab a click opens (requests open their own page). */
  tab: WorkspaceTabKey;
}

export const NO_DATE_HE = 'טרם נקבע';
export const DELAY_RISK_HE = 'עיכוב';
/** Rows the panel lists (prototype mileHtml: the first 8). */
export const MILESTONES_SHOWN = 8;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** The next stage, skipping the conference: the backend has none yet (prototype: `if (STAGES[ni] === CONF && !r.conf) ni++`). */
export function nextStageIdx(stageIdx: number): number {
  const n = stageIdx + 1;
  return n === CONFERENCE_STAGE_IDX ? n + 1 : n;
}

const FOR_NEXT_STAGE: Partial<Record<number, WorkspaceTabKey>> = { 4: 'questions', 5: 'bids', 6: 'bids' }; // STAGE_TAB

function waitingFor(r: MilestoneInput): QuartetRole[] {
  if (r.kind === 'request') return ['manager']; // procurement picks the type and completes the request
  if (r.stageIdx === 1) {
    // The team's approvals still missing, in the quartet's order; procurement's own (the final approval) is
    // the last step of this stage, so it is always still to come.
    const roles = new Set<string>(r.approverRoles ?? []);
    return QUARTET_ROLES.filter(
      (q) => q === 'manager' || (roles.has(q) && !isApproved(r.holders ?? {}, r.approvals ?? {}, q as TeamRole)),
    );
  }
  if (r.stageIdx === 2) return ['manager']; // approved and locked: procurement publishes
  if (r.stageIdx === 5) return ['manager']; // bids are in: procurement opens and compares them
  return []; // הבהרות: "הצעות" starts by itself at the submission deadline
}

/**
 * The panel's rows, soonest first; rows without a date follow in the order given. Cases past "הצעות"
 * (evaluation, closed) are left out, as in the prototype (`STAGES.indexOf(r.stage) < NSTEP`).
 */
export function upcomingMilestones(rows: readonly MilestoneInput[], now: number): Milestone[] {
  const out = rows
    .filter((r) => r.stageIdx >= 0 && r.stageIdx < STAGE_BAR_COUNT)
    .map((r): Milestone => {
      const nextIdx = nextStageIdx(r.stageIdx);
      const at = nextIdx === 5 ? (r.submissionDeadline ?? null) : null;
      const waiting = waitingFor(r).map((q) => ROLE_HE[q]);
      const hot = at !== null && at - now <= 3 * DAY_MS;
      const d = at === null ? null : new Date(at);
      return {
        id: r.id,
        ref: r.ref,
        name: r.name,
        kind: r.kind,
        stageIdx: r.stageIdx,
        nextIdx,
        nextLabel: STAGES_HE[nextIdx] ?? '',
        at,
        when: d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : NO_DATE_HE,
        hot,
        waiting,
        risks: hot && waiting.length ? [DELAY_RISK_HE] : [],
        tab: waiting.length ? 'overview' : (FOR_NEXT_STAGE[nextIdx] ?? 'overview'),
      };
    });
  const dated = out.filter((m) => m.at !== null).sort((a, b) => a.at! - b.at!);
  return [...dated, ...out.filter((m) => m.at === null)];
}
