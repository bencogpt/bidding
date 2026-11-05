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
  internal_review: 'בבדיקה פנימית',
  ready: 'מוכן לפרסום',
  published: 'פורסם',
  responses: 'התקבלו הצעות',
  evaluated: 'הוערך',
  awarded: 'הוכרז זוכה',
};

// Allowed transitions for the tender FSM.
export const TENDER_TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  // 'ready' straight from the draft: the team approves on the document, then the manager's final approval
  // locks the case (plan D1). 'internal_review' stays for older cases and reopened ones.
  draft: ['internal_review', 'ready'],
  internal_review: ['ready', 'draft'],
  ready: ['published', 'internal_review'],
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
export const MANUAL_TRANSITION_TARGETS: readonly TenderStatus[] = ['draft', 'internal_review', 'ready', 'published'];

const ACTION_ONLY_STATUS_HE: Partial<Record<TenderStatus, string>> = {
  responses: 'שלב ההצעות מתחיל מעצמו עם ההגשה הראשונה של ספק.',
  evaluated: 'שלב ההערכה מתחיל בהרצת השוואת ההצעות.',
  awarded: 'הזכייה נקבעת בבחירת הספק הזוכה.',
};

/** Why a manager can't move the case from `from` to `to` directly, or null when the move is allowed. */
export function manualTransitionDenial(from: TenderStatus, to: TenderStatus): string | null {
  if (from === to) return null; // nothing changes
  if (!MANUAL_TRANSITION_TARGETS.includes(to)) return ACTION_ONLY_STATUS_HE[to] ?? `מעבר סטטוס לא חוקי: ${from} → ${to}`;
  return canTransition(from, to) ? null : `מעבר סטטוס לא חוקי: ${from} → ${to}`;
}

// Statuses in which the bid document is public to (granted) suppliers.
export const SUPPLIER_VISIBLE_STATUSES: TenderStatus[] = ['published', 'responses', 'evaluated', 'awarded'];

export function isSupplierVisible(status: TenderStatus): boolean {
  return SUPPLIER_VISIBLE_STATUSES.includes(status);
}
