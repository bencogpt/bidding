// Hebrew labels for template placeholders written as English keys ({{tender_title}}, {{BID_LEAD_EMAIL}}…).
// A detected placeholder's label is its raw key until someone names it; these are the known ones.
// Keys are matched case-insensitively. Anything not listed keeps its label as it is.
const LABELS: Record<string, string> = {
  email: 'דוא"ל מנהל המכרז',
  bid_lead_email: 'דוא"ל מנהל המכרז',
  tender_title: 'כותרת המכרז',
  mail_box: 'תיבת דוא"ל',
  route_map: 'מפת הגעה (נספח 2)',
  gathering_date: 'תאריך כנס הספקים',
  gathering_hour: 'שעת כנס הספקים',
  guarantee_duration: 'תוקף ערבות ההצעה',
  bank_name: 'שם הבנק',
  insurance_company: 'חברת הביטוח',
  phone_number: 'מספר טלפון',
  fax_number: 'מספר פקס',
  bank_num: 'מספר הבנק',
  branch_num: 'מספר הסניף',
  addr: 'כתובת',
  sign_date: 'תאריך חתימה',
  full_name: 'שם מלא',
  auth_sign: 'מורשה חתימה',
};

/** The label to show: the Hebrew one for a raw (or empty) English label, otherwise the label as it is. */
export function hebrewLabel(key: string, labelHe: string): string {
  const label = (labelHe ?? '').trim();
  if (label && label.toLowerCase() !== key.trim().toLowerCase()) return labelHe;
  return LABELS[key.trim().toLowerCase()] ?? (label || key);
}

const DATE_KEYS = new Set(['gathering_date', 'sign_date']);

/** A plain text field that is really a date (by its key or by "תאריך" in its label) is a date field. */
export function fieldType<T extends string>(key: string, labelHe: string, type: T): T | 'date' {
  if (type !== 'text') return type;
  return DATE_KEYS.has(key.trim().toLowerCase()) || /תאריך/.test(labelHe ?? '') || /תאריך/.test(hebrewLabel(key, labelHe))
    ? 'date'
    : type;
}

/** A template field as the forms show it: Hebrew label and the right input type. */
export function resolveParam<T extends { key: string; labelHe: string; type: string }>(p: T): T {
  const labelHe = hebrewLabel(p.key, p.labelHe);
  return { ...p, labelHe, type: fieldType(p.key, labelHe, p.type) };
}
