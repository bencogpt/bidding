// Tender types — each has its own template + rules (Hebrew spec).
export const TENDER_TYPES = {
  goods: 'goods', // מכרז טובין
  service: 'service', // מכרז שירות וכוח-אדם
  project: 'project', // מכרז פרויקטלי (תכולה + שירות)
} as const;

export type TenderType = (typeof TENDER_TYPES)[keyof typeof TENDER_TYPES];

export const TENDER_TYPE_LABELS_HE: Record<TenderType, string> = {
  goods: 'מכרז טובין',
  service: 'מכרז שירות וכוח-אדם',
  project: 'מכרז פרויקטלי',
};

// Tender lifecycle — a finite state machine. No client may set these directly.
export const TENDER_STATUSES = [
  'draft',
  'internal_review',
  'ready',
  'published',
  'responses',
  'evaluated',
  'awarded',
] as const;

export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const TENDER_STATUS_LABELS_HE: Record<TenderStatus, string> = {
  draft: 'טיוטה',
  internal_review: 'נשלח לאישור',
  ready: 'מוכן לפרסום לספקים',
  published: 'פורסם',
  responses: 'התקבלו הצעות',
  evaluated: 'הוערך',
  awarded: 'הוכרז זוכה',
};

// Allowed transitions for the tender FSM.
export const TENDER_TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  // The v22 flow (plan Phase G): draft → internal_review is "שליחה לאישור"; internal_review → ready happens
  // only when the final check passes (the system, or procurement continuing without the AI check); reopening a
  // locked case goes back to the draft (not sent).
  draft: ['internal_review'],
  internal_review: ['ready', 'draft'],
  ready: ['published', 'draft'],
  published: ['responses'],
  responses: ['evaluated'],
  evaluated: ['awarded', 'responses'],
  awarded: [],
};

export function canTransition(from: TenderStatus, to: TenderStatus): boolean {
  return TENDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * The statuses a manager may ask for directly (transitionTender). The later ones follow only from their own
 * action, which checks what the step needs: the first supplier submission (→ responses), the bid comparison
 * (→ evaluated) and choosing the winner (→ awarded). So no case reaches "awarded" without a winner.
 */
export const MANUAL_TRANSITION_TARGETS: readonly TenderStatus[] = ['draft', 'internal_review', 'published'];

const ACTION_ONLY_STATUS_HE: Partial<Record<TenderStatus, string>> = {
  draft: 'חזרה לעריכה נעשית בפתיחה מחדש.', // new — UX to confirm
  ready: 'המעבר לפרסום לספקים קורה כשהבדיקה הסופית של הסוכן המפקח עוברת.', // new — UX to confirm
  responses: 'שלב ההצעות מתחיל מעצמו עם ההגשה הראשונה של ספק.',
  evaluated: 'שלב ההערכה מתחיל בהרצת השוואת ההצעות.',
  awarded: 'הזכייה נקבעת בבחירת הספק הזוכה.',
};

/** "מעבר סטטוס לא חוקי: טיוטה ← פורסם": status names in Hebrew, never the codes (UX answer 4.5). */
export function illegalTransitionHe(from: TenderStatus, to: TenderStatus): string {
  return `מעבר סטטוס לא חוקי: ${TENDER_STATUS_LABELS_HE[from]} ← ${TENDER_STATUS_LABELS_HE[to]}`;
}

/** Why a manager can't move the case from `from` to `to` directly, or null when the move is allowed. */
export function manualTransitionDenial(from: TenderStatus, to: TenderStatus): string | null {
  if (from === to) return null; // nothing changes
  // Back to the draft only takes the send back (v22); a locked case goes back by reopening it.
  if (to === 'draft' && from !== 'internal_review') return ACTION_ONLY_STATUS_HE.draft!;
  if (!MANUAL_TRANSITION_TARGETS.includes(to)) return ACTION_ONLY_STATUS_HE[to] ?? illegalTransitionHe(from, to);
  return canTransition(from, to) ? null : illegalTransitionHe(from, to);
}

// Statuses in which the bid document is public to (granted) suppliers.
export const SUPPLIER_VISIBLE_STATUSES: TenderStatus[] = ['published', 'responses', 'evaluated', 'awarded'];

export function isSupplierVisible(status: TenderStatus): boolean {
  return SUPPLIER_VISIBLE_STATUSES.includes(status);
}
