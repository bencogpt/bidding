// Actors in the tender process (mirrors the Hebrew spec).
export const ROLES = {
  tender_manager: 'tender_manager', // מנהל המכרז — super-user
  requester: 'requester', // מזמין
  legal: 'legal', // יועץ משפטי
  security: 'security', // אחראי בטחון
  finance: 'finance', // איש כספים
  supplier: 'supplier', // ספק (external)
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const INTERNAL_ROLES: Role[] = [
  ROLES.tender_manager,
  ROLES.requester,
  ROLES.legal,
  ROLES.security,
  ROLES.finance,
];

export const isInternalRole = (r: string | undefined): boolean =>
  !!r && (INTERNAL_ROLES as string[]).includes(r);

// Hebrew display labels for roles.
export const ROLE_LABELS_HE: Record<Role, string> = {
  tender_manager: 'מנהל המכרז',
  requester: 'מזמין',
  legal: 'יועץ משפטי',
  security: 'אחראי ביטחון',
  finance: 'איש כספים',
  supplier: 'ספק',
};

// Access levels on a tender document.
export const ACCESS_LEVELS = ['view', 'comment', 'edit'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

// Which document permission each internal role gets when assigned as a reviewer.
// Only the tender manager edits; everyone else comments; suppliers view in-system.
export const DEFAULT_INTERNAL_ACCESS: Record<Role, AccessLevel> = {
  tender_manager: 'edit',
  requester: 'comment',
  legal: 'comment',
  security: 'comment',
  finance: 'comment',
  supplier: 'view',
};
