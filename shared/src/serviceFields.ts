// Calculated and system-filled fields of the services tender form. Pure functions, no I/O: used by
// createTender on the server and by the create form for the guarantee default.
import type { SystemFill, TemplateParam } from './templates.js';

/** Keys of the services template that the formulas read. */
export const SERVICE_KEYS = {
  estimate: 'estimate',
  guaranteeAmount: 'guarantee_amount',
  initialMonths: 'initial_period_months',
  optionPeriods: 'option_periods',
} as const;

/** The bid guarantee defaults to this share of the estimate (editable by the manager). */
export const GUARANTEE_PCT = 0.025;

export function guaranteeDefault(estimate: unknown): number | null {
  const n = Number(estimate);
  if (estimate === '' || estimate == null || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * GUARANTEE_PCT);
}

// ---- Hebrew number → words (shekels, masculine) ----

const ONES = ['', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה'];
const TEENS = ['עשרה', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר', 'חמישה עשר', 'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר'];
const TENS = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
const HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות'];
// Construct state before "אלפים" (שלושת אלפים … עשרת אלפים).
const THOUSANDS_CONSTRUCT = ['', '', '', 'שלושת', 'ארבעת', 'חמשת', 'ששת', 'שבעת', 'שמונת', 'תשעת', 'עשרת'];

/** Join number words the Hebrew way: "a b ו-c" — the conjunction goes on the last part only. */
function joinAnd(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p.join('');
  return `${p.slice(0, -1).join(' ')} ו${p[p.length - 1]}`;
}

/** 1..999 in words. */
function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [HUNDREDS[h]];
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    parts.push(TENS[Math.floor(rest / 10)]);
    parts.push(ONES[rest % 10]);
  }
  return joinAnd(parts);
}

function thousandsWords(n: number): string {
  if (n === 1) return 'אלף';
  if (n === 2) return 'אלפיים';
  if (n <= 10) return `${THOUSANDS_CONSTRUCT[n]} אלפים`;
  return `${under1000(n)} אלף`;
}

function millionsWords(n: number): string {
  if (n === 1) return 'מיליון';
  if (n === 2) return 'שני מיליון';
  return `${under1000(n)} מיליון`;
}

/** Whole number 0..999,999,999 in Hebrew words. */
export function numberToHebrewWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) throw new RangeError(`unsupported amount: ${n}`);
  if (n === 0) return 'אפס';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  return joinAnd([
    millions ? millionsWords(millions) : '',
    thousands ? thousandsWords(thousands) : '',
    rest ? under1000(rest) : '',
  ]);
}

/** "עשרים וחמישה אלף שקלים" — for the bid-guarantee amount; agorot are spelled out when present. */
export function shekelsInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`unsupported amount: ${amount}`);
  let shekels = Math.floor(amount);
  let agorot = Math.round((amount - shekels) * 100);
  if (agorot === 100) {
    shekels += 1;
    agorot = 0;
  }
  const shekelPart = shekels === 1 ? 'שקל אחד' : `${numberToHebrewWords(shekels)} שקלים`;
  if (!agorot) return shekelPart;
  const agorotPart = agorot === 1 ? 'אגורה אחת' : `${numberToHebrewWords(agorot)} אגורות`;
  return `${shekelPart} ו${agorotPart}`;
}

// ---- other calculations ----

/** "יום ראשון" — weekday of a moment in Israel time (the server runs in UTC). */
export function hebrewWeekday(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date(ms));
}

/** First contract period (months) + the number of optional periods. */
export function totalMonths(initialMonths: unknown, optionPeriods: unknown): number | null {
  const a = Number(initialMonths);
  if (initialMonths === '' || initialMonths == null || !Number.isFinite(a)) return null;
  const b = optionPeriods === '' || optionPeriods == null ? 0 : Number(optionPeriods);
  return Number.isFinite(b) ? a + b : null;
}

// ---- resolving the system-filled fields ----

export interface FillContext {
  submissionDeadline: number | null;
  manager?: { displayName: string; email: string };
  requester?: { displayName: string; phone?: string };
}

type Values = Record<string, string | number>;

function formulaValue(formula: string, values: Values, ctx: FillContext): string | number | undefined {
  switch (formula) {
    case 'guarantee_words': {
      const n = Number(values[SERVICE_KEYS.guaranteeAmount]);
      return values[SERVICE_KEYS.guaranteeAmount] !== undefined && Number.isFinite(n) && n >= 0 && n <= 999_999_999
        ? shekelsInWords(n)
        : undefined;
    }
    case 'total_months':
      return totalMonths(values[SERVICE_KEYS.initialMonths], values[SERVICE_KEYS.optionPeriods]) ?? undefined;
    case 'submission_day':
      return ctx.submissionDeadline ? hebrewWeekday(ctx.submissionDeadline) : undefined;
    case 'manager_name':
      return ctx.manager?.displayName;
    case 'manager_email':
      return ctx.manager?.email;
    case 'requester_name':
      return ctx.requester?.displayName;
    case 'requester_phone':
      return ctx.requester?.phone;
    default:
      return undefined;
  }
}

function fillValue(fill: SystemFill, values: Values, ctx: FillContext): string | number | undefined {
  if (fill.kind === 'fixed') return fill.value;
  if (fill.kind === 'copy') return values[fill.from];
  return formulaValue(fill.formula, values, ctx);
}

/**
 * The form values completed by the system: a blank guarantee amount takes its default, then every
 * system-filled field is computed (copies and formulas read the values above, so they run after the
 * defaults). A field whose inputs are missing stays absent — the document then shows the gap.
 */
export function resolveSystemFills(params: readonly TemplateParam[], input: Values, ctx: FillContext): Values {
  const out: Values = { ...input };
  for (const p of params) {
    if (p.defaultFrom === 'guarantee_pct' && String(out[p.key] ?? '').trim() === '') {
      const d = guaranteeDefault(out[SERVICE_KEYS.estimate]);
      if (d !== null) out[p.key] = d;
    }
  }
  for (const p of params) {
    if (!p.fill) continue;
    const v = fillValue(p.fill, out, ctx);
    if (v !== undefined && String(v) !== '') out[p.key] = v;
  }
  return out;
}
