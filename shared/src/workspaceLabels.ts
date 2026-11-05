// Fixed Hebrew texts and colours of the tender workspace, as in the UX prototype (docs/blm-prototype 19.html).
// Plan: docs/superpowers/plans/2026-11-04-draft-flow-prototype-parity.md (task A6). Prototype line numbers
// are noted next to each table; the prototype wins over docs/design-specs.md when they disagree.
import type { FindingCode } from './supervision.js';
import type { TeamRole } from './team.js';

/** The stages of a בל"מ (prototype v22). The stage bar shows the first STAGE_BAR_COUNT of them. */
export const STAGES_HE = [
  'אפיון',
  'עריכה',
  'פרסום לספקים',
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
  security: 'יחידת אבטחת המידע', // UX answer 4.6 (the prototype asks only legal and finance)
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

/** Role colours of the inputs panel (v22 ROLE_COLOR). */
export const ROLE_COLOR: Record<ApprovalRole, string> = {
  requester: '#7c5cff',
  manager: '#0e9aa7',
  legal: '#e08a2e',
  finance: '#2f6fe0',
  security: '#8a8fa3',
};

/**
 * Who is expected to give input on which section (plan G-D10): the default until templates define it — v22
 * SEC_ROLES. Section numbers as the document numbers them.
 */
export const INPUT_REQUIRED_DEFAULT: Readonly<Record<string, readonly QuartetRole[]>> = {
  '1': ['manager'],
  '2': ['manager'],
  '6': ['requester', 'legal'],
  '9': ['finance', 'legal'],
};

/**
 * The final check's steps (v22 AG_STEPS_FINAL). Step 1 is adapted: v22 says "מאמת שהמסמך ננעל אחרי אישור כל
 * הרביעייה", but the check now runs before the lock (plan G-D3) — new text, UX to confirm.
 */
export const AGENT_STEPS_FINAL_HE = [
  'מאמת שכל הרביעייה אישרה',
  'משווה לגרסה שאושרה על ידי כל אחד מהם',
  'בודק שלא נוספו שינויים אחרי האישורים',
  'מריץ שוב את המיומנויות הנדרשות',
  'מוודא שאין ממצא חוסם',
] as const;

/**
 * Texts of the v22 approval flow (plan Phase G). Most are v22's own; the UX pack items 2.1–2.3 and 2.6.8–2.6.9
 * are held for the designer's numbered answers, so every text of those areas lives here, to swap in one place.
 * "new" = not in v22, UX to confirm.
 */
export const FLOW_HE = {
  // header button (v22 renderApr / syncNext, spec §5.2–5.3)
  send: 'שליחה לאישור',
  waitingFor: (roles: string) => `ממתין ל: ${roles}`,
  sent: 'נשלח לאישור',
  waitingForSend: 'ממתין לשליחה מהרכש',
  waitingForSendTitle: 'האישור ייפתח אחרי שהרכש ישלח את המסמך לאישור',
  approve: 'אישור מסמך',
  approveExtra: 'אישור מסמך (משתתף נוסף)',
  legalWaits: (roles: string) => `הכפתור שלך יפעל אחרי שהדורש, הרכש והכספים יאשרו. נותר: ${roles}.`,
  yourApproval: 'האישור שלך נרשם',
  finalRunning: 'בדיקה סופית של הסוכן…',
  finalRunningTitle: 'הסוכן המפקח בודק את המסמך לפני הפרסום לספקים',
  publish: 'פרסום לספקים',
  waitingForPublish: 'ממתין לפרסום מהרכש',
  waitingForPublishTitle: 'הרכש מפרסם לספקים אחרי שכל הרביעייה אישרה',
  blockedTitle: 'ממצא חוסם מונע שליחה לאישור ופרסום', // UX answer 2.9.5
  continueWithoutAi: 'המשך בלי בדיקת AI', // new
  continueWithoutAiTitle: 'בדיקת ה-AI אינה זמינה. אפשר להמשיך לפרסום לספקים עם סיבה מתועדת.', // new
  // approvals card (v22 renderApr)
  cardTitle: 'אישור מסמך',
  noteLocked: 'המסמך נעול ומוכן לפרסום.',
  noteLockedOthers: ' רק הרכש יכול לפתוח מחדש.',
  noteSent: (at: string) => `נשלח לאישור · ${at}`,
  noteYours: (at: string) => `האישור שלך נרשם · ${at}`,
  noteLegalLast: 'כולם אישרו. אחרי האישור שלך תתבצע בדיקה סופית של הסוכן המפקח.', // v22's "…ינעל את המסמך" contradicts G-D3; the designer's 2.2.2 wording
  noteExtra: 'משתתף נוסף: האישור נרשם ואינו חוסם נעילה.',
  noteSendHint: 'לחצו על "שליחה לאישור" כשסיימתם לעבוד על המסמך.', // v22, plural per UX answer 4.4
  noteApproveHint: 'לחצו על "אישור מסמך" כשסיימתם לעבוד על המסמך.', // v22, plural per UX answer 4.4
  noteAllApproved: 'כולם אישרו. הסוכן המפקח מבצע בדיקה סופית לפני הפרסום לספקים.', // v22 chat text
  noteFinalBlocked: 'הבדיקה הסופית מצאה ממצא חוסם. המכרז לא עבר לפרסום לספקים', // v22 chat text
  noteAiUnavailable: 'בדיקת ה-AI אינה זמינה, ולכן הבדיקה הסופית לא הושלמה.', // new
  noteCancelled: (roles: string) => `המסמך השתנה אחרי האישור, ולכן בוטלו האישורים של: ${roles}.`, // new
  withdraw: 'בטל את האישור שלי',
  reopen: 'פתח מחדש (שכפול)',
  // the document banner after the send (v22 renderDoc)
  bannerSent: 'המסמך נשלח לאישור. אפשר לערוך אותו, להעיר ולהציע שינויים.',
  bannerFinal: 'כל הרביעייה אישרה. הסוכן המפקח מבצע בדיקה סופית לפני הפרסום לספקים…',
  // "לטיפולך" rows (v22 stateActs; the final-check and cancelled rows have no v22 text — new)
  piDraftChecked: (n: number) =>
    n ? `${n} ממצאים ממתינים להחלטתך, ואפשר גם ליצור את המסמך` : 'אין ממצאים, אפשר ליצור את המסמך',
  piDocBlocked: 'מונע שליחה לאישור ופרסום', // v22 "מונע אישור סופי ופרסום"; "אישור סופי" is gone (UX 2.9.5)
  piDocCreated: 'המסמך נוצר:',
  piCanSend: 'אפשר לשלוח לאישור',
  piWaitingForSend: 'ממתין לשליחת הרכש לאישור',
  piSent: 'נשלח לאישור:',
  piWaitingForApprovals: (roles: string) => `ממתין לאישור של ${roles}`,
  piReadyForYou: 'המסמך מוכן לעיון, לעריכה ולאישור שלך',
  piPreparing: 'הרכש מכין את המסמך:',
  piPreparingText: (agent: 'none' | 'running' | 'done', n: number) =>
    agent === 'done' ? (n ? `הסוכן המפקח מצא ${n} ממצאים להחלטת הרכש` : 'הטיוטה נבדקה') : 'הטיוטה בבדיקה',
  piFinalRunning: 'כל הרביעייה אישרה:', // new
  piFinalRunningText: 'הסוכן המפקח מבצע בדיקה סופית', // new
  piFinalPassed: 'הבדיקה הסופית עברה:', // new
  piFinalPassedText: 'אפשר לפרסם לספקים', // new
  piAiUnavailable: 'הבדיקה הסופית לא הושלמה:', // new
  piAiUnavailableText: 'בדיקת ה-AI אינה זמינה', // new
  piCancelled: 'המסמך השתנה אחרי האישור שלך:', // new
  piCancelledText: 'נדרש אישור מחדש', // new
  piOnBehalf: 'אושר בשמך:', // new (UX answer 1.1.C)
  piOnBehalfText: (by: string) => `${by} אישר את המסמך בשמך`, // new
} as const;

/**
 * What to do next per stage, its button label and the tab it opens (prototype NEXT_ACT, line 2261).
 * The header shows `${text} ←` from stage פרסום on; the overview card shows the text and the button.
 */
export const NEXT_ACTION_HE: readonly { text: string; button: string; tab: WorkspaceTabKey }[] = [
  { text: 'השלמת קלט הדורש', button: 'פתח את המסמך', tab: 'document' },
  { text: 'אישור מסמך', button: 'פתח את המסמך', tab: 'document' },
  { text: 'פרסום לספקים', button: 'פתח את המסמך', tab: 'document' },
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
  | 'timelines'
  | 'agent'
  | 'conference'
  | 'questions'
  | 'bids'
  | 'activity'
  | 'versions';
