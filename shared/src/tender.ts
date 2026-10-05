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
  draft: ['internal_review'],
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

// Statuses in which the bid document is public to (granted) suppliers.
export const SUPPLIER_VISIBLE_STATUSES: TenderStatus[] = ['published', 'responses', 'evaluated', 'awarded'];

export function isSupplierVisible(status: TenderStatus): boolean {
  return SUPPLIER_VISIBLE_STATUSES.includes(status);
}
