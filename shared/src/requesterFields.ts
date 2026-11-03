// Phase 1 (the requester) asks these questions besides the brief. One list drives the request form,
// the server-side validation and what procurement sees in phase 2. No template is involved.
import { z } from 'zod';

export interface RequesterField {
  key: string;
  labelHe: string;
  type: 'text' | 'textarea' | 'number';
  default?: string; // pre-filled on the form, editable
  internal?: boolean; // confidential (G6): stays on the request, never reaches the AI draft or the tender
}

export const REQUESTER_TEXT_MAX = 200;
export const REQUESTER_TEXTAREA_MAX = 1000;

// Order and wording follow the procurement spreadsheet ("add to the requester as follow-up questions").
export const REQUESTER_FIELDS: readonly RequesterField[] = [
  { key: 'service_location', labelHe: 'מקום אספקת השירות', type: 'text' },
  { key: 'provider_responsibilities', labelHe: 'תחומי אחריות נותני השירות', type: 'textarea' },
  { key: 'team_lead_role', labelHe: 'תפקיד ראש הצוות', type: 'textarea' },
  { key: 'service_providers_total', labelHe: 'כמות נותני השירות', type: 'number' },
  { key: 'supplier_equipment', labelHe: 'ציוד שהספק מספק לנותני השירות', type: 'textarea' },
  { key: 'work_days', labelHe: "מס' ימי עבודה", type: 'text', default: "ימים א' עד ה'" },
  { key: 'work_hours', labelHe: "מס' שעות עבודה", type: 'text', default: 'משרה מלאה - 170 שעות' },
  { key: 'excellence_bonus_month', labelHe: 'חודש תשלום מענק מצוינות', type: 'text' },
  { key: 'excellence_criteria_place', labelHe: 'מקום פרסום אמות מידה למענק מצוינות', type: 'text' },
  { key: 'medical_approval_type', labelHe: 'סוג האישור הרפואי הנדרש', type: 'text' },
  {
    key: 'annual_budget',
    labelHe: 'מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות?',
    type: 'number',
    internal: true,
  },
];

export type RequesterDetails = Record<string, string | number>;

const byKey = new Map(REQUESTER_FIELDS.map((f) => [f.key, f]));

function valueSchema(f: RequesterField) {
  if (f.type === 'number') return z.number().finite().positive();
  // A {{…}} would be pasted into the document as an unfilled placeholder.
  return z
    .string()
    .trim()
    .min(1)
    .max(f.type === 'textarea' ? REQUESTER_TEXTAREA_MAX : REQUESTER_TEXT_MAX)
    .refine((s) => !s.includes('{{'), 'placeholder text is not allowed');
}

/** The answers on a request: known keys only, every one optional. */
export const requesterDetailsSchema = z
  .object(Object.fromEntries(REQUESTER_FIELDS.map((f) => [f.key, valueSchema(f).optional()])))
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
  params: readonly { key: string }[],
  values: Record<string, string | number>,
  details?: Partial<RequesterDetails> | null,
): Record<string, string | number> {
  const out = { ...values };
  const pub = publicDetails(details);
  for (const p of params) {
    const v = pub[p.key];
    if (v !== undefined && isBlank(out[p.key])) out[p.key] = v;
  }
  return out;
}

/** The request form's text boxes → the payload: blanks dropped, numbers converted, bad numbers reported. */
export function normalizeDetailsInput(raw: Record<string, string>): { details: RequesterDetails; badNumbers: string[] } {
  const details: RequesterDetails = {};
  const badNumbers: string[] = [];
  for (const f of REQUESTER_FIELDS) {
    const s = (raw[f.key] ?? '').trim();
    if (!s) continue;
    if (f.type === 'number') {
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) details[f.key] = n;
      else badNumbers.push(f.key);
    } else {
      details[f.key] = s;
    }
  }
  return { details, badNumbers };
}

/** Fields the requester answers in phase 1 (all but the internal budget): procurement's form does not ask them again. */
export const isRequesterAnswered = (key: string): boolean => {
  const f = byKey.get(key);
  return !!f && !f.internal;
};
