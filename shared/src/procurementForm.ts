// The procurement manager's form (step 2 of a new bid), per the procurement spreadsheet "שדות בל"מ":
// which template fields the form asks, which it doesn't, and the fixed and calculated values.
//
// Template fields are matched by key (case-insensitive) or by Hebrew label, because fields typed into the
// Google Doc by hand carry no metadata and a re-sync can't add it. Fields the requester answers are
// handled in requesterFields.ts; the bid number and submission date by templates.ts.
//
// A field the form doesn't ask and nothing fills is printed as a blank line (BLANK_LINE) for the
// manager to complete in the document; the inspector lists those as a warning, not a blocker.
import type { SystemFill } from './templates.js';

export const BLANK_LINE = '__________';

/** Keys the formulas read. */
export const OPTION_KEYS = { count: 'option_periods_count', months: 'option_period_months' } as const;

type Named = { key: string; labelHe?: string };
type Names = ReadonlySet<string>;
const names = (...n: string[]): Names => new Set(n.map((x) => x.trim().toLowerCase()));

/** Keys case-insensitively ({{BID_LEAD_EMAIL}}), labels as typed. */
export const ruleNamed = (p: Named, set: Names): boolean =>
  set.has(p.key.trim().toLowerCase()) || (p.labelHe !== undefined && set.has(p.labelHe.trim().toLowerCase()));

const formula = (f: Extract<SystemFill, { kind: 'formula' }>['formula']): SystemFill => ({ kind: 'formula', formula: f });
const fixed = (value: string): SystemFill => ({ kind: 'fixed', value });

export const GUARANTEE_AMOUNT_NAMES = names(
  'guarantee_amount',
  'bid_guarantee_amount',
  'סכום ערבות להצעה',
  'סכום ערבות ההצעה (בש"ח)',
);

export interface ProcurementRule {
  match: Names;
  hide?: true; // not asked on the form (printed as a blank line unless something fills it)
  fill?: SystemFill; // filled by the system (so not asked either)
  // filled with a copy of another template field, found by these names
  copyOf?: Names;
}

// Order matters: the first matching rule wins (e.g. guarantee_duration before "תוקף ערבות ההצעה").
export const PROCUREMENT_RULES: readonly ProcurementRule[] = [
  // 1 — the tender manager's email (internal users)
  { match: names('email', 'bid_lead_email', 'manager_email', 'tender_manager_email', 'כתובת מייל של מנהל המכרז', 'דוא"ל מנהל המכרז'), fill: formula('manager_email') },
  // the bid manager's phone, from their user record (required when a bid manager is defined)
  { match: names('bid_manager_phone', 'tender_manager_phone', 'manager_phone', 'טלפון מנהל המכרז', "מס' הטלפון של המזמין כפי שמוגדר"), fill: formula('manager_phone') },
  // 2 — the bid number (generated); also its other spellings and the reference for questions (35)
  { match: names('מספר הבל"ם', 'מספר מכרז', 'clarifications_reference', 'מזהה הבל"ם לפנייה בשאלות'), fill: formula('bid_serial') },
  // 6 — bid guarantee: 2% of the annual estimate from ₪1M, floored to thousands; 42 — in words
  { match: GUARANTEE_AMOUNT_NAMES, fill: formula('bid_guarantee') },
  { match: names('guarantee_amount_words', 'bid_guarantee_amount_words', 'סכום ערבות ההצעה במילים'), fill: formula('guarantee_words') },
  // 19 — not asked (checked before 7, whose Hebrew label it shares)
  { match: names('guarantee_duration'), hide: true },
  // 7 — bid-guarantee validity: 60 days after the submission deadline
  { match: names('bid_guarantee_validity_date', 'תוקף ערבות ההצעה'), fill: formula('guarantee_validity') },
  // 20 — bid validity: 90 days after submission, moved past weekends and holidays
  { match: names('bid_validity_date', 'תוקף ההצעה'), fill: formula('bid_validity') },
  // 21 — performance guarantee: 5% of the annual contract amount. The Doc prints the rate ("בגובה {{…}}%
  // מגובה ערך הזכייה השנתי"), so the field holds the percentage itself.
  { match: names('performance_guarantee_amount', 'סכום ערבות ביצוע', 'פה יבוא סכום ערבות ביצוע'), fill: fixed('5') },
  // 9 — the requester's description of the service (פרק ב'); 57/58 — repeated in the agreement
  { match: names('service_field_summary', "עיקרי השירות הנדרש (פרק ב')"), fill: formula('request_brief') },
  { match: names('agreement_service_field', 'תחום השירות (בהסכם)'), copyOf: names('service_field_summary', "עיקרי השירות הנדרש (פרק ב')") },
  { match: names('service_location_agreement', 'מתקני ביצוע השירות (בהסכם)'), copyOf: names('service_location', 'מקום אספקת השירות') },
  // 26, 28 — fixed
  { match: names('route_map', 'מפת הגעה (נספח 2)'), fill: fixed('נספח 2- מפת הגעה') },
  { match: names('gathering_hour', 'שעת כנס הספקים', 'שעת התכנסות'), fill: fixed('בין 08:00-13:00') },
  // 31 — the last date for bids is the submission deadline
  { match: names('תאריך אחרון להגשת הצעות'), fill: formula('submission_date') },
  // 33 — clarification questions go to the bid manager
  { match: names('clarifications_email', 'כתובת דוא"ל לשאלות הבהרה'), fill: formula('manager_email') },
  // 37–39, 44–46 — fixed details on the guarantee form; the phone is the bid manager's. Matched by key
  // only: their Hebrew labels (fieldLabels.ts) are too generic to match on.
  { match: names('bank_name'), fill: fixed('אוצר החייל') },
  { match: names('insurance_company'), fill: fixed('ענבל') },
  { match: names('phone_number'), fill: formula('manager_phone') },
  { match: names('bank_num'), fill: fixed('14') },
  { match: names('branch_num'), fill: fixed('349666') },
  { match: names('addr'), fill: fixed('צהלה') },
  // 50 — the ordering ministry in the insurance appendix
  { match: names('ordering_ministry_name', 'שם המשרד המזמין (בנספח ביטוח)'), fill: fixed('משרד ראש הממשלה') },
  // 60–62 — fixed (a requester's answer, where asked, is kept)
  { match: names('events_amount_per_employee', 'סכום השתתפות באירועים לעובד (בש"ח)'), fill: fixed('1,200') },
  { match: names('work_days', "מס' ימי עבודה"), fill: fixed("ימים א' עד ה'") },
  { match: names('work_hours', "מס' שעות עבודה"), fill: fixed('משרה מלאה - 170 שעות') },
  // 67 — the framework maximum is the requester's annual estimate (published by decision)
  { match: names('framework_max_amount', 'סכום המסגרת המקסימלי (בש"ח)'), fill: formula('annual_estimate') },
  // 72 — the template prints this field as months ("ועד לסך מצטבר של {{option_periods_count}} חודשים
  // נוספים"): the requester's number of option periods × OPTION_MONTHS_PER_PERIOD.
  { match: names('option_periods_count'), fill: formula('option_months_total') },
  // 74 — contract months + option months
  { match: names('option_total_months', 'סך מצטבר של חודשי אופציה'), fill: formula('option_total_months') },
  // Removed from the form, no value (the "remove from procurement's form" column): a blank line to
  // complete in the document.
  {
    hide: true,
    match: names(
      'tender_title',
      'תחום האחריות המקצועית של הספק',
      'השירות שבאחריות הספק',
      'service_delivery_means',
      'אמצעי אספקת השירות',
      'service_location',
      'מקום אספקת השירות',
      'service_providers_responsibilities',
      'תחומי אחריות נותני השירות',
      'team_lead_role',
      'תפקיד ראש הצוות',
      'תפקיד ראש צוות',
      'min_candidates_pool',
      'מספר מועמדים מינימלי למאגר',
      'insurance_appendix_number',
      'מספר נספח הביטוחים',
      "פה יבוא מס' נותני השירות",
      'approved_order_days',
      'מספר ימים לעמידה בתנאי הזמנה מאושרת',
      'approved_suppliers_list_section',
      'סעיף רשימת הספקים המאושרים',
      '90 יום ממועד תחילת מתן ההתקשרות',
      'טקסט רכש על המעטפה',
      'mail_box',
      'תיבת דוא"ל',
      'gathering_date',
      'תאריך כנס ספקים',
      'תאריך כנס הספקים',
      'תאריך אחרון למועד שאלות הבהרה',
      'תאריך אחרון למועד מענה לשאלות הבהרה',
      'contact_representative',
      'נציג/ת המזמין האחראי להזמנה',
      'clarifications_deadline',
      'מועד אחרון לשאלות הבהרה',
      'procurement_unit_signatory',
      'שם החותם מטעם יחידת הרכש',
      'fax_number',
      "מס' של הספק מהבנק",
      'ימולא על ידי הספק',
      'sign_date',
      'full_name',
      'auth_sign',
      'insurance_consulting_field',
      'תחום הייעוץ בביטוח אחריות מקצועית',
      'insurance_contracting_ministry',
      'שם המשרד המתקשר (ביטוח אחריות מקצועית)',
      'price_submission_box',
      'תיבת ההצעות בהצעת המציע',
      'monthly_price_unit',
      'יחידה לסה"כ מחיר חודשי',
      'ministry_authorized_signatories',
      'מורשי החתימה מטעם המזמין (בהסכם)',
      'equipment_to_provide',
      'ציוד שהספק מספק לנותני השירות',
      'excellence_bonus_month',
      'חודש תשלום מענק מצוינות',
      'excellence_criteria_publication',
      'מקום פרסום אמות מידה למענק מצוינות',
      'retention_bonus_amount',
      'סכום מענק התמדה (בש"ח)',
      'medical_certificate_type',
      'סוג האישור הרפואי הנדרש',
      'order_representative',
      'נציג המזמין לצורך ההזמנה (בהסכם)',
      "מס' הטלפון של המזמין",
      'travel_payment_reference',
      'אסמכתה לתשלום הוצאות נסיעה',
      'contract_end_date',
      'תאריך סיום תקופת ההתקשרות',
      'service_providers_count_meal',
      'מספר נותני שירות (הצהרת חדר אוכל)',
      'תוקף אחריות',
      'הוראות ביטחון', // not on the create form (completed in the document)
    ),
  },
];

/** Option periods are of this many months each (the user's rule). */
export const OPTION_MONTHS_PER_PERIOD = 12;

// The bid manager's details always come from the creating user's internal-user record, under any field
// name: BID_MANAGER_NAME, tender_manager_email, "טלפון מנהל המכרז", "שם מנהל הבל"מ", …
const MANAGER_KEY_RE = /(?:^|_)(?:bid|tender)_?(?:manager|lead)_?(name|email|mail|phone|tel)(?:$|_)/i;
// "מנהל המכרז / מנהל הבל"מ", "נציג הרכש", or "… כפי שמוגדר" (as defined in the system) — all the bid manager.
const MANAGER_LABEL_RE = /מנהל\s+(?:ה)?(?:מכרז|בל["״]?[מם])|נציג(?:\/ת)?\s+(?:ה)?רכש|כפי\s+שמוגדר/;
export function managerDetailKind(p: Named): 'manager_name' | 'manager_email' | 'manager_phone' | null {
  const k = p.key.trim().match(MANAGER_KEY_RE)?.[1]?.toLowerCase();
  if (k) return k === 'name' ? 'manager_name' : k === 'phone' || k === 'tel' ? 'manager_phone' : 'manager_email';
  const label = `${p.key} ${p.labelHe ?? ''}`;
  if (!MANAGER_LABEL_RE.test(label)) return null;
  if (/טלפון|נייד/.test(label)) return 'manager_phone';
  if (/מייל|דוא["״]?ל|email/i.test(label)) return 'manager_email';
  if (/שם/.test(label)) return 'manager_name';
  return null;
}

// Tags removed from the system: never asked, and printed as nothing (not a blank line).
export const OMITTED_NAMES = names('security_appendix');
export const isOmittedParam = (p: Named): boolean => ruleNamed(p, OMITTED_NAMES);

/** The rule for a template field, with a copy resolved to the field it copies (or null). */
export function procurementRuleFor(
  p: Named,
  all: readonly Named[],
): { hide?: true; fill?: SystemFill } | null {
  const manager = managerDetailKind(p);
  if (manager) return { fill: formula(manager) };
  const rule = PROCUREMENT_RULES.find((r) => ruleNamed(p, r.match));
  if (!rule) return null;
  if (rule.copyOf) {
    const src = all.find((q) => q.key !== p.key && ruleNamed(q, rule.copyOf!));
    return src ? { fill: { kind: 'copy', from: src.key } } : { hide: true };
  }
  return { hide: rule.hide, fill: rule.fill };
}
