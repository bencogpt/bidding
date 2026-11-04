// Phase 1 (the requester) asks these questions besides the brief. One list drives the request form,
// the server-side validation and what procurement sees in phase 2. No template is involved.
import { z } from 'zod';

export interface RequesterField {
  key: string;
  labelHe: string;
  type: 'text' | 'textarea' | 'number';
  default?: string; // pre-filled on the form, editable
  internal?: boolean; // confidential (G6): stays on the request, never reaches the AI draft or the tender
  required?: boolean; // must be answered to open the request
  wholeNumber?: boolean; // a number field that must be a whole number
  max?: number; // upper bound of a whole-number field
  min?: number; // lower bound of a number field
}

/** The smallest maximum frame amount (₪) a request may state. */
export const BUDGET_MIN = 240000;

export const REQUESTER_TEXT_MAX = 200;
export const REQUESTER_TEXTAREA_MAX = 1000;

// Order and wording follow the procurement spreadsheet ("add to the requester as follow-up questions").
export const REQUESTER_FIELDS: readonly RequesterField[] = [
  { key: 'service_name', labelHe: 'שם השירות', type: 'text', required: true },
  { key: 'document_classification', labelHe: 'סיווג המסמך', type: 'text', required: true, default: 'בלמ"ס' },
  // Optional: the more the requester fills, the fewer questions procurement has to ask.
  { key: 'service_location', labelHe: 'מקום אספקת השירות', type: 'text' },
  { key: 'provider_responsibilities', labelHe: 'תחומי אחריות נותני השירות', type: 'textarea' },
  { key: 'team_lead_role', labelHe: 'תפקיד ראש הצוות', type: 'textarea' },
  { key: 'min_pool_candidates', labelHe: 'מספר מועמדים מינימלי למאגר', type: 'number', wholeNumber: true, max: 100000 },
  { key: 'service_providers_total', labelHe: 'כמות נותני השירות', type: 'number', wholeNumber: true, max: 100000 },
  { key: 'supplier_equipment', labelHe: 'ציוד שהספק מספק לנותני השירות', type: 'textarea' },
  { key: 'work_hours', labelHe: 'היקף משרה והאם נדרש גם שעות כוננות', type: 'text' },
  { key: 'option_periods_count', labelHe: 'מספר תקופות אופציה', type: 'number', wholeNumber: true, max: 10 },
  {
    key: 'annual_budget',
    labelHe: 'מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות?',
    type: 'number',
    internal: true,
    required: true,
    min: BUDGET_MIN,
  },
  { key: 'contract_years', labelHe: 'משך תקופת התקשרות בשנים', type: 'number', required: true, wholeNumber: true, max: 30 },
];

export type RequesterDetails = Record<string, string | number>;

const byKey = new Map(REQUESTER_FIELDS.map((f) => [f.key, f]));

// How a template spells a question the requester answers, when its words differ from the request screen's.
// An alias may be a template field's key or its Hebrew label.
const LABEL_ALIASES: Record<string, string[]> = {
  // the bid's title, and the service's name in the bidder's offer heading, are the service's name
  service_name: ['tender_title', 'כותרת המכרז', 'service_type_summary', 'שם השירות בכותרת הצעת המציע'],
  service_providers_total: ["פה יבוא מס' נותני השירות", "מס' נותני השירות"],
  work_hours: ["מס' שעות עבודה"],
  team_lead_role: ['תפקיד ראש צוות'],
};
const byLabel = new Map<string, RequesterField>();
for (const f of REQUESTER_FIELDS) {
  byLabel.set(f.labelHe, f);
  for (const alias of LABEL_ALIASES[f.key] ?? []) byLabel.set(alias, f);
}

/** The requester question a template field stands for: matched by its key, else by its key or Hebrew label as an alias. */
function requesterFieldFor(p: { key: string; labelHe?: string }): RequesterField | undefined {
  return byKey.get(p.key) ?? byLabel.get(p.key) ?? (p.labelHe !== undefined ? byLabel.get(p.labelHe.trim()) : undefined);
}

function valueSchema(f: RequesterField) {
  if (f.type === 'number') {
    return f.wholeNumber
      ? z.number().int().min(1).max(f.max ?? 1_000_000)
      : z.number().finite().positive().min(f.min ?? 0);
  }
  // A {{…}} would be pasted into the document as an unfilled placeholder.
  return z
    .string()
    .trim()
    .min(1)
    .max(f.type === 'textarea' ? REQUESTER_TEXTAREA_MAX : REQUESTER_TEXT_MAX)
    .refine((s) => !s.includes('{{'), 'placeholder text is not allowed');
}

/** The answers as stored on a request: known keys only, every one optional (earlier requests may hold `option_periods`). */
export const requesterDetailsSchema = z
  .object({
    ...Object.fromEntries(REQUESTER_FIELDS.map((f) => [f.key, valueSchema(f).optional()])),
    option_periods: z.number().optional(), // legacy: an earlier screen asked it; no longer read
  })
  .strict();

/** The same answers when a request is opened: the required ones must be there (stored older requests may lack them). */
export const requesterDetailsInputSchema = z
  .object(
    Object.fromEntries(
      REQUESTER_FIELDS.map((f) => [f.key, f.required ? valueSchema(f) : valueSchema(f).optional()]),
    ),
  )
  .strict();

const isBlank = (v: unknown) => String(v ?? '').trim() === '';

/** The answers procurement and the AI draft may see: known, non-internal and not blank. */
export function publicDetails(details?: Partial<RequesterDetails> | null): RequesterDetails {
  return Object.fromEntries(
    Object.entries(details ?? {}).filter(([k, v]) => byKey.has(k) && !byKey.get(k)?.internal && !isBlank(v)),
  ) as RequesterDetails;
}

/** The brief with the requester's answers appended (what the model and the supervisor both read). */
export function briefWithDetails(brief: string, details?: Partial<RequesterDetails> | null): string {
  const pub = publicDetails(details);
  const lines = REQUESTER_FIELDS.filter((f) => pub[f.key] !== undefined).map((f) => `${f.labelHe}: ${pub[f.key]}`);
  return lines.length ? `${brief}\n\nפרטים מהדורש:\n${lines.join('\n')}` : brief;
}

/** Fill the template fields the manager left blank from the requester's answers (the manager's value wins). */
export function fillFromRequestDetails(
  params: readonly { key: string; labelHe?: string }[],
  values: Record<string, string | number>,
  details?: Partial<RequesterDetails> | null,
): Record<string, string | number> {
  const out = { ...values };
  const pub = publicDetails(details);
  for (const p of params) {
    const field = requesterFieldFor(p);
    const v = field ? pub[field.key] : undefined; // the budget is not public, so it is never matched
    if (v !== undefined && isBlank(out[p.key])) out[p.key] = v;
  }
  // The contract length in years is procurement's initial period (in months) unless they typed one.
  const years = Number(pub.contract_years);
  if (
    params.some((p) => p.key === 'initial_period_months') &&
    isBlank(out.initial_period_months) &&
    Number.isInteger(years) &&
    years >= 1
  ) {
    out.initial_period_months = years * 12;
  }
  return out;
}

/** The request form's text boxes → the payload: blanks dropped, numbers converted, bad numbers reported. */
export function normalizeDetailsInput(
  raw: Record<string, string>,
): { details: RequesterDetails; badNumbers: string[]; missing: string[] } {
  const details: RequesterDetails = {};
  const badNumbers: string[] = [];
  const missing: string[] = [];
  for (const f of REQUESTER_FIELDS) {
    const s = (raw[f.key] ?? '').trim();
    if (!s) {
      if (f.required) missing.push(f.key);
      continue;
    }
    if (f.type === 'number') {
      const n = Number(s);
      const ok = f.wholeNumber
        ? Number.isInteger(n) && n >= 1 && n <= (f.max ?? 1_000_000)
        : Number.isFinite(n) && n > 0 && n >= (f.min ?? 0);
      if (ok) details[f.key] = n;
      else badNumbers.push(f.key);
    } else {
      details[f.key] = s;
    }
  }
  return { details, badNumbers, missing };
}

/** Fields the requester answers in phase 1 (all but the internal budget): procurement's form does not ask them again. */
export const isRequesterAnswered = (key: string): boolean => {
  const f = byKey.get(key);
  return !!f && !f.internal;
};

// Fields removed from procurement's form (the spreadsheet's "remove from the procurement form" column): matched by key and by Hebrew label.
const HIDDEN_LABELS_HE = new Set([
  'תוקף אחריות',
  'סוג האישור הרפואי הנדרש',
  'מקום אספקת השירות',
  'תחומי אחריות נותני השירות',
  'תפקיד ראש הצוות',
  'כמות נותני השירות',
  "פה יבוא מס' נותני השירות", // the template's own label for the provider count
  'מספר מועמדים מינימלי למאגר',
  'ציוד שהספק מספק לנותני השירות',
  "מס' ימי עבודה",
  "מס' שעות עבודה",
  'חודש תשלום מענק מצוינות',
  'מקום פרסום אמות מידה למענק מצוינות',
]);
const HIDDEN_KEYS = new Set([
  'medical_approval_type',
  ...['service_location', 'provider_responsibilities', 'team_lead_role', 'service_providers_total', 'supplier_equipment', 'work_days', 'work_hours', 'excellence_bonus_month', 'excellence_criteria_place'],
]);

/** Not asked on procurement's form: hidden by the template, answered by the requester, or removed by label. */
export const isFormHidden = (p: { key: string; labelHe?: string; hidden?: boolean }): boolean => {
  const asked = requesterFieldFor(p);
  return (
    !!p.hidden ||
    (!!asked && !asked.internal) ||
    HIDDEN_KEYS.has(p.key) ||
    HIDDEN_LABELS_HE.has(p.key) || // fields typed into the doc in Hebrew: the key is the label
    (p.labelHe !== undefined && HIDDEN_LABELS_HE.has(p.labelHe))
  );
};
