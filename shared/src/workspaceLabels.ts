// Fixed Hebrew texts and colours of the tender workspace, as in the UX prototype (docs/blm-prototype 19.html).
// Plan: docs/superpowers/plans/2026-11-04-draft-flow-prototype-parity.md (task A6). Prototype line numbers
// are noted next to each table; the prototype wins over docs/design-specs.md when they disagree.
import type { FindingCode } from './supervision.js';
import type { TeamRole } from './team.js';

/** The stages of a בל"מ (prototype line 1741). The stage bar shows the first STAGE_BAR_COUNT of them. */
export const STAGES_HE = [
  'אפיון',
  'עריכה',
  'פרסום',
  'פרוטוקול כנס ספקים',
  'הבהרות',
  'הצעות',
  'הערכה',
  'סגור',
] as const;
export type StageHe = (typeof STAGES_HE)[number];
export const STAGE_BAR_COUNT = 6; // NSTEP
export const CONFERENCE_STAGE_IDX = 3; // optional per tender; the backend has no conference yet

/** One colour per stage, violet at the start to green at the end (prototype line 1744). */
export const STAGE_COLORS = ['#8a5cf0', '#5a4fe0', '#2f6fe0', '#0a8fc2', '#0a9a8e', '#1f9d5f', '#177a4a', '#0f5f3b'] as const;

export const NO_CONFERENCE_NOTE_HE = 'ללא כנס ספקים בבל"מ זה';

/** The quartet plus the extra participant. 'manager' is the case owner (procurement, "רכש"). */
export type QuartetRole = 'requester' | 'manager' | 'legal' | 'finance';
export type ApprovalRole = QuartetRole | 'security';
export const QUARTET_ROLES: readonly QuartetRole[] = ['requester', 'manager', 'legal', 'finance'];
/** Team roles whose approval comes before the manager's final action (security is not one of them). */
export const TEAM_APPROVER_ROLES: readonly TeamRole[] = ['requester', 'legal', 'finance'];

export const ROLE_HE: Record<ApprovalRole, string> = {
  requester: 'דורש',
  manager: 'רכש',
  legal: 'משפטי',
  finance: 'כספים',
  security: 'אבטחת מידע',
};

/**
 * Who approves at each stage, listed in the stage bar's hover card (prototype STAGE_APPR, line 2293; stages
 * it doesn't list show the quartet). Security appears only on cases that involve it.
 */
export const STAGE_APPROVERS: Record<number, readonly ApprovalRole[]> = {
  0: ['requester', 'manager'],
  1: ['requester', 'manager', 'legal', 'finance', 'security'],
  2: ['manager'],
  3: QUARTET_ROLES,
  4: QUARTET_ROLES,
  5: ['manager', 'finance', 'requester'],
};

/** The unit a role's contact is assigned from (prototype ASG_BODY, line 1921). */
export const ROLE_UNIT_HE: Partial<Record<TeamRole, string>> = {
  legal: 'היחידה המשפטית',
  finance: 'גוף הכספים',
  security: 'גוף אבטחת המידע', // new — the prototype asks only legal and finance
};

/** Finding type labels. The first six are the prototype's (line 2519); the rest are proposals (plan §9, D12). */
export const FINDING_TYPE_HE: Record<FindingCode, string> = {
  CONFIDENTIAL_LEAK: 'חשיפת מידע חסוי',
  MISSING_INFO: 'מידע חסר',
  CONTRADICTION: 'סתירה',
  MISSING_MANDATORY_SECTION: 'סעיף חובה חסר',
  UNFAIR_REQUIREMENT: 'דרישה מצמצמת תחרות',
  LEGAL_ELEMENT_MISSING: 'רכיב משפטי חסר',
  // proposed — pending UX / legal review
  NO_PROVENANCE: 'מקור התבנית לא תועד',
  TEMPLATE_MISMATCH: 'תבנית לא תואמת',
  TEMPLATE_CHANGED: 'התבנית השתנתה',
  TEMPLATE_DOC_CHANGED: 'מסמך התבנית השתנה',
  TEMPLATE_STRUCTURE_MISSING: 'מבנה התבנית חסר',
  WRONG_TEMPLATE_SECTION: 'סעיף מתבנית אחרת',
  SKILL_MISSING: 'מיומנות חסרה',
  SKILL_VERSION_CHANGED: 'גרסת מיומנות השתנתה',
  NO_AI_DRAFT: 'אין טיוטת AI',
  AI_DRAFT_FAILED: 'טיוטת ה-AI נכשלה',
  PARAM_INVALID: 'ערך לא תקין',
  PARAM_NOT_IN_DOC: 'ערך חסר במסמך',
  UNSOURCED_PARAM: 'שדה ללא מקור',
  UNSOURCED_VALUE: 'ערך ללא מקור',
  CRITERIA_WEIGHTS: 'משקלי הערכה שגויים',
  LEGAL_SECTION_MISSING: 'סעיף משפטי חסר',
  LEGAL_SECTION_ALTERED: 'סעיף משפטי שונה',
  DOC_UNREADABLE: 'המסמך לא נקרא',
  AI_REVIEW_SKIPPED: 'בדיקת ה-AI לא בוצעה',
  SUPERVISOR_UNAVAILABLE: 'הסוכן המפקח לא זמין',
};

export const SEVERITY_HE = { block: 'חוסם', warn: 'אזהרה' } as const;

/**
 * "הצעת הסוכן" for findings of the rules layer, which have no proposal of their own (the AI writes its own).
 * New texts — pending UX review.
 */
export const RULE_FIX_HE: Partial<Record<FindingCode, string>> = {
  MISSING_INFO: 'להשלים את השדות בנתוני הטיוטה, או להשאיר אותם כקו ריק להשלמה במסמך.',
  CONFIDENTIAL_LEAK: 'להסיר את הערך החסוי (אומדן או תקציב) ולהשאיר ניסוח כללי.',
  TEMPLATE_MISMATCH: 'ליצור את המסמך מהתבנית של סוג הבל"מ.',
  TEMPLATE_CHANGED: 'לבדוק את המסמך מול הנוסח העדכני של התבנית.',
  TEMPLATE_DOC_CHANGED: 'לבדוק את המסמך מול הנוסח העדכני של התבנית.',
  TEMPLATE_STRUCTURE_MISSING: 'להחזיר את המבנה כפי שהוא בתבנית.',
  WRONG_TEMPLATE_SECTION: 'להסיר את הסעיף שאינו שייך לסוג הבל"מ.',
  SKILL_MISSING: 'להפיק מחדש את טיוטת ה-AI כדי שתכלול את המיומנות.',
  SKILL_VERSION_CHANGED: 'להפיק מחדש את טיוטת ה-AI לפי הגרסה העדכנית של המיומנות.',
  NO_AI_DRAFT: 'להפיק את טיוטת ה-AI לפני יצירת המסמך.',
  AI_DRAFT_FAILED: 'להפיק מחדש את טיוטת ה-AI.',
  PARAM_INVALID: 'לתקן את הערך בשדה.',
  PARAM_NOT_IN_DOC: 'לוודא שהערך מופיע במסמך.',
  UNSOURCED_PARAM: 'לעדכן את הערך מנתוני הבקשה או לציין את מקורו.',
  UNSOURCED_VALUE: 'לעדכן את הערך מנתוני הבקשה או לציין את מקורו.',
  CONTRADICTION: 'ליישר את הערכים כך שיתאימו זה לזה.',
  CRITERIA_WEIGHTS: 'לעדכן את משקלי ההערכה כך שיסתכמו ל-100.',
  MISSING_MANDATORY_SECTION: 'להוסיף את הסעיף מנוסח התבנית.',
  LEGAL_SECTION_MISSING: 'להוסיף את הסעיף המשפטי מנוסח התבנית.',
  LEGAL_SECTION_ALTERED: 'להחזיר את הנוסח המשפטי כלשונו מהתבנית.',
  LEGAL_ELEMENT_MISSING: 'להוסיף את הרכיב המשפטי מנוסח התבנית.',
  UNFAIR_REQUIREMENT: 'לשקול ניסוח רחב יותר של הדרישה.',
  DOC_UNREADABLE: 'לבדוק את הגישה למסמך ולהריץ את הבדיקה שוב.',
  AI_REVIEW_SKIPPED: 'להריץ את הבדיקה שוב.',
  SUPERVISOR_UNAVAILABLE: 'להריץ את הבדיקה שוב.',
};

/** The agent's thinking steps (prototype AG_STEPS, line 2512). The server reports which one it reached. */
export const AGENT_STEPS_HE = [
  'קורא את נתוני הבקשה והטיוטה',
  'מאמת מול התבנית של סוג הבל"מ',
  'עובר על 12 המיומנויות הנדרשות',
  'בודק שדות חסרים וערכים ללא מקור',
  'מחפש סתירות ודרישות מצמצמות תחרות',
  'מכין הצעות תיקון',
] as const;

/**
 * What to do next per stage, its button label and the tab it opens (prototype NEXT_ACT, line 2261).
 * The header shows `${text} ←` from stage פרסום on; the overview card shows the text and the button.
 */
export const NEXT_ACTION_HE: readonly { text: string; button: string; tab: WorkspaceTabKey }[] = [
  { text: 'השלמת קלט הדורש', button: 'פתח את המסמך', tab: 'document' },
  { text: 'אישור סופי של המכרז', button: 'פתח את המסמך', tab: 'document' },
  { text: 'אישור סופי ופרסום לספקים', button: 'פתח את המסמך', tab: 'document' },
  { text: 'העלאה ופרסום של פרוטוקול כנס הספקים', button: 'עבור לפרוטוקול', tab: 'conference' },
  { text: 'אישור איחוד שאלות הבהרה', button: 'עבור לשאלות הבהרה', tab: 'questions' },
  { text: 'השוואת הצעות הספקים', button: 'עבור להשוואה', tab: 'bids' },
  { text: 'בחירת ספק זוכה', button: 'עבור להשוואה', tab: 'bids' },
  { text: 'הבל"מ הושלם', button: 'צפה בפעילות', tab: 'activity' },
];

/** Workspace tabs, in the prototype's order (HTML line 1598). */
export type WorkspaceTabKey =
  | 'overview'
  | 'document'
  | 'agent'
  | 'conference'
  | 'questions'
  | 'bids'
  | 'activity'
  | 'versions';
