// Who may approve a tender, when, and in which order (plan B4, decisions D1, D1a, D1b, D1d):
// - approvals open as soon as the document exists (no "send for approval" step);
// - requester and finance approve in any order, legal after both;
// - the tender manager acts last: the final approval ("ready") locks the case;
// - the case owner may approve on behalf of an assigned participant, with a reason;
// - an open blocking finding stops every approval.
// Pure rules: the approveTender / transitionTender callables apply them; tests run without Firestore.
import type { TenderStatus } from './tender.js';
import type { CaseApprovals, CaseTeam, TeamApproval, TeamRole } from './team.js';

/** Statuses in which approvals are given (with a document). `internal_review` stays for older cases. */
export const APPROVAL_OPEN_STATUSES: readonly TenderStatus[] = ['draft', 'internal_review'];

/** Minimum length of the reason for an approval given on someone's behalf (like the publish override). */
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
  not_open: 'ניתן לאשר רק אחרי שהמסמך נוצר ולפני האישור הסופי.',
  blocked: 'ממצא חוסם מונע אישור סופי ופרסום.',
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
}

export type ApprovalAudit = 'approve_tender' | 'withdraw_approval' | 'approve_on_behalf' | 'withdraw_on_behalf';

export type ApprovalPlan =
  | { ok: false; denial: ApprovalDenial }
  | { ok: true; audit: ApprovalAudit; writes: { role: TeamRole; approval: TeamApproval | null }[] };

/** An approval counts only from the slot's current holder (same rule as missingApprovals). */
const approvedByHolder = (c: ApprovalCase, r: TeamRole) =>
  !!c.approvals?.[r] && !!c.team?.[r] && c.approvals[r]!.uid === c.team[r];

/** Legal waits for requester and finance; a role the same caller holds doesn't make them wait. */
function legalWaits(c: ApprovalCase, callerRoles: readonly TeamRole[]): boolean {
  return (['requester', 'finance'] as TeamRole[]).some(
    (r) => c.requiredRoles.includes(r) && !approvedByHolder(c, r) && !callerRoles.includes(r),
  );
}

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
          approval: {
            uid: holder,
            name: call.holderName ?? '',
            at,
            onBehalf: true,
            byUid: call.uid,
            byName: call.name,
            reason,
          },
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
    writes: roles.map((role) => ({ role, approval: { uid: call.uid, name: call.name, at } })),
  };
}

export type FinalApprovalDenial = 'no_document' | 'blocked';

export const FINAL_APPROVAL_DENIAL_HE: Record<FinalApprovalDenial, string> = {
  no_document: 'יש ליצור את מסמך המכרז לפני האישור הסופי.',
  blocked: 'ממצא חוסם מונע אישור סופי ופרסום.',
};

/**
 * The manager's final approval (the move to "ready"), on top of the approvals check the callable already
 * makes: the document must exist and nothing may block. Returns null when allowed.
 */
export function finalApprovalDenial(c: Pick<ApprovalCase, 'hasDocument' | 'blockers'>): FinalApprovalDenial | null {
  if (!c.hasDocument) return 'no_document';
  if (c.blockers > 0) return 'blocked';
  return null;
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
