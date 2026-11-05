// Who may approve a tender, when, and in which order — the v22 flow (plan Phase G, decisions G-D1 to G-D5):
// - procurement sends the document for approval ("שליחה לאישור"); that is procurement's own approval, and
//   nobody else can approve before it;
// - requester and finance approve the document ("אישור מסמך") in any order, legal after both;
// - when all have approved, the supervising agent's final check runs before the lock: it passes → locked,
//   stage "פרסום לספקים"; it fails → the case stays open and procurement fixes it;
// - a change in the document's content after an approval cancels the approvals given before it;
// - the case owner may approve on behalf of an assigned participant, with a reason;
// - an open blocking finding stops the send and every approval.
// Pure rules: the callables apply them; tests run without Firestore.
import type { TenderStatus } from './tender.js';
import type { CaseApprovals, CaseTeam, TeamApproval, TeamRole } from './team.js';
import type { SupervisionFinding } from './supervision.js';

/** Approvals are given only once the document was sent for approval (status `internal_review`). */
export const APPROVAL_OPEN_STATUSES: readonly TenderStatus[] = ['internal_review'];

/** Minimum length of a recorded reason: approval on someone's behalf, or continuing without the AI check. */
export const ON_BEHALF_REASON_MIN = 10;

export type ApprovalDenial =
  | 'not_open'
  | 'blocked'
  | 'no_slot'
  | 'not_required'
  | 'legal_too_early'
  | 'not_owner'
  | 'slot_empty'
  | 'own_slot'
  | 'reason_required'
  | 'not_on_behalf';

export const APPROVAL_DENIAL_HE: Record<ApprovalDenial, string> = {
  not_open: 'ניתן לאשר רק אחרי שהמסמך נשלח לאישור ולפני הנעילה.',
  blocked: 'ממצא חוסם מונע שליחה לאישור ופרסום.',
  no_slot: 'אינך משובץ בתפקיד שנדרש לאשר את המכרז.',
  not_required: 'התפקיד אינו נדרש לאישור במכרז זה.',
  legal_too_early: 'המשפטי מאשר אחרי שהדורש והכספים אישרו.',
  not_owner: 'רק מנהל המכרז יכול לאשר בשם משתתף.',
  slot_empty: 'יש לשייך איש קשר לפני אישור בשמו.',
  own_slot: 'את התפקיד שלך מאשרים בכפתור הראשי.',
  reason_required: `יש לציין סיבה (${ON_BEHALF_REASON_MIN} תווים לפחות) לאישור בשם משתתף.`,
  not_on_behalf: 'אפשר לבטל בשם משתתף רק אישור שניתן בשמו.',
};

/** Denials that are about who the caller is (HTTP permission-denied); the rest are preconditions. */
export const APPROVAL_PERMISSION_DENIALS: readonly ApprovalDenial[] = ['no_slot', 'not_owner'];

export interface ApprovalCase {
  status: TenderStatus;
  hasDocument: boolean;
  ownerUid: string;
  team?: CaseTeam;
  approvals?: CaseApprovals;
  /** The type's required roles: they may approve (security too, as a non-blocking participant — plan D2). */
  requiredRoles: readonly TeamRole[];
  /** Open blocking findings of the latest check of the document. */
  blockers: number;
}

export interface ApprovalCall {
  uid: string;
  name: string;
  approve: boolean;
  onBehalfOf?: TeamRole;
  reason?: string;
  /** Display name of the slot holder, for an approval given on their behalf. */
  holderName?: string;
  /** Fingerprint of the document's content as approved (G-D4); null when it couldn't be read. */
  docHash?: string | null;
}

export type ApprovalAudit = 'approve_tender' | 'withdraw_approval' | 'approve_on_behalf' | 'withdraw_on_behalf';

export type ApprovalPlan =
  | { ok: false; denial: ApprovalDenial }
  | { ok: true; audit: ApprovalAudit; writes: { role: TeamRole; approval: TeamApproval | null }[] };

/** An approval counts only from the slot's current holder (same rule as missingApprovals). */
const approvedByHolder = (c: Pick<ApprovalCase, 'team' | 'approvals'>, r: TeamRole) =>
  !!c.approvals?.[r] && !!c.team?.[r] && c.approvals[r]!.uid === c.team[r];

/** Legal waits for requester and finance; a role the same caller holds doesn't make them wait. */
function legalWaits(c: ApprovalCase, callerRoles: readonly TeamRole[]): boolean {
  return (['requester', 'finance'] as TeamRole[]).some(
    (r) => c.requiredRoles.includes(r) && !approvedByHolder(c, r) && !callerRoles.includes(r),
  );
}

const withHash = (a: TeamApproval, docHash: string | null | undefined): TeamApproval =>
  docHash ? { ...a, docHash } : a;

export function planApproval(c: ApprovalCase, call: ApprovalCall, at: number): ApprovalPlan {
  if (!APPROVAL_OPEN_STATUSES.includes(c.status) || !c.hasDocument) return { ok: false, denial: 'not_open' };
  if (call.approve && c.blockers > 0) return { ok: false, denial: 'blocked' };

  // On someone's behalf: only the case owner, only for an assigned slot that isn't the owner's own (D1d).
  if (call.onBehalfOf) {
    const role = call.onBehalfOf;
    if (c.ownerUid !== call.uid) return { ok: false, denial: 'not_owner' };
    if (!c.requiredRoles.includes(role)) return { ok: false, denial: 'not_required' };
    const holder = c.team?.[role];
    if (!holder) return { ok: false, denial: 'slot_empty' };
    if (holder === call.uid) return { ok: false, denial: 'own_slot' };
    if (!call.approve) {
      const current = c.approvals?.[role];
      if (!current) return { ok: true, audit: 'withdraw_on_behalf', writes: [] };
      if (!current.onBehalf) return { ok: false, denial: 'not_on_behalf' };
      return { ok: true, audit: 'withdraw_on_behalf', writes: [{ role, approval: null }] };
    }
    const reason = (call.reason ?? '').trim();
    if (reason.length < ON_BEHALF_REASON_MIN) return { ok: false, denial: 'reason_required' };
    if (role === 'legal' && legalWaits(c, [])) return { ok: false, denial: 'legal_too_early' };
    return {
      ok: true,
      audit: 'approve_on_behalf',
      writes: [
        {
          role,
          // uid = the holder, so missingApprovals counts it like their own approval.
          approval: withHash(
            { uid: holder, name: call.holderName ?? '', at, onBehalf: true, byUid: call.uid, byName: call.name, reason },
            call.docHash,
          ),
        },
      ],
    };
  }

  // The caller's own slots (every required slot they hold, approved or withdrawn together).
  const roles = c.requiredRoles.filter((r) => c.team?.[r] === call.uid);
  if (!roles.length) return { ok: false, denial: 'no_slot' };
  if (!call.approve) {
    return { ok: true, audit: 'withdraw_approval', writes: roles.map((role) => ({ role, approval: null })) };
  }
  if (roles.includes('legal') && legalWaits(c, roles)) return { ok: false, denial: 'legal_too_early' };
  return {
    ok: true,
    audit: 'approve_tender',
    writes: roles.map((role) => ({ role, approval: withHash({ uid: call.uid, name: call.name, at }, call.docHash) })),
  };
}

// ───────────────────────── the send ("שליחה לאישור", G-D1, G-D7) ─────────────────────────

export type SendDenial = 'no_document' | 'team_incomplete' | 'blocked' | 'dates_missing' | 'not_draft';

export interface SendCase {
  status: TenderStatus;
  hasDocument: boolean;
  /** Required team roles that have no holder yet. */
  missingRoles: readonly TeamRole[];
  /** Open blocking findings of the latest check of the document. */
  blockers: number;
  /** Required timeline dates that are still empty (G-D7). */
  missingDates: readonly string[];
}

/** Why procurement can't send the document for approval yet, or null when it can. In this order. */
export function sendDenial(c: SendCase): SendDenial | null {
  if (c.status !== 'draft') return 'not_draft';
  if (!c.hasDocument) return 'no_document';
  if (c.blockers > 0) return 'blocked';
  if (c.missingRoles.length) return 'team_incomplete';
  if (c.missingDates.length) return 'dates_missing';
  return null;
}

export const SEND_DENIAL_HE: Record<SendDenial, string> = {
  not_draft: 'המסמך כבר נשלח לאישור.',
  no_document: 'יש ליצור את המסמך לפני השליחה לאישור.',
  blocked: 'ממצא חוסם מונע שליחה לאישור ופרסום.',
  team_incomplete: 'יש לשבץ את כל התפקידים לפני השליחה לאישור.', // new — UX to confirm
  dates_missing: 'יש להזין את שלושת תאריכי החובה בלשונית "לוחות זמנים" לפני השליחה לאישור.', // new — UX to confirm
};

// ───────────────────────── content changes after an approval (G-D4) ─────────────────────────

/**
 * Roles whose approval was given on an earlier version of the document: their fingerprint differs from the
 * current one. Approvals without a fingerprint (given before fingerprints existed, or when the document
 * couldn't be read) are kept: there is nothing to compare. Unknown current content (null) cancels nothing.
 */
export function staleApprovals(approvals: CaseApprovals | undefined, currentHash: string | null): TeamRole[] {
  if (!currentHash || !approvals) return [];
  return (Object.keys(approvals) as TeamRole[]).filter((r) => {
    const h = approvals[r]?.docHash;
    return !!h && h !== currentHash;
  });
}

// ───────────────────────── the final check (G-D3, G-D5) ─────────────────────────

/** Everyone the lock waits for has approved: the send (procurement) and the blocking roles. */
export function allApproved(
  c: Pick<ApprovalCase, 'status' | 'team' | 'approvals'>,
  blockingRoles: readonly TeamRole[],
): boolean {
  return c.status === 'internal_review' && blockingRoles.every((r) => approvedByHolder(c, r));
}

export type FinalCheckOutcome = 'pass' | 'blocked' | 'ai_unavailable';

/**
 * The verdict of the final check. A check whose only blocking findings say the AI review couldn't run is
 * `ai_unavailable`: procurement may continue with a recorded reason (G-D5). Any other blocker can't be
 * overridden.
 */
export function finalCheckOutcome(findings: readonly Pick<SupervisionFinding, 'severity' | 'code'>[]): FinalCheckOutcome {
  const blocking = findings.filter((f) => f.severity === 'block');
  if (!blocking.length) return 'pass';
  return blocking.every((f) => f.code === 'SUPERVISOR_UNAVAILABLE') ? 'ai_unavailable' : 'blocked';
}

/**
 * Open blocking findings that count against approvals: those of the latest check of the document.
 * A check of the draft (before the document existed) doesn't block the document's approvals.
 */
export function documentBlockers(t: {
  hasDocument: boolean;
  lastSupervision?: { blockers: number; basis?: 'draft' | 'document' } | null;
}): number {
  if (!t.hasDocument || !t.lastSupervision) return 0;
  return t.lastSupervision.basis === 'draft' ? 0 : t.lastSupervision.blockers;
}
