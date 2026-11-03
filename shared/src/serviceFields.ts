// Calculated and system-filled fields of the services tender form. Pure functions, no I/O: used by
// createTender on the server and by the create form for the guarantee default.
import type { SystemFill, TemplateParam } from './templates.js';
import { addDaysToWorkingDay, formatIsraelDate } from './israelCalendar.js';
import { GUARANTEE_AMOUNT_NAMES, OPTION_KEYS, procurementRuleFor, ruleNamed } from './procurementForm.js';

/** Keys of the services template that the formulas read. */
export const SERVICE_KEYS = {
  estimate: 'estimate',
  guaranteeAmount: 'guarantee_amount',
  initialMonths: 'initial_period_months',
  optionPeriods: 'option_periods',
  economicPct: 'economic_pct',
} as const;

/** The bid guarantee defaults to this share of the annual estimate (editable by the manager). */
export const GUARANTEE_PCT = 0.02;

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
  annualEstimate?: number; // the requester's annual estimate (confidential except where a rule publishes it)
  contractYears?: number; // the requester's contract length in years
  requestBrief?: string; // the requester's description of the service
  serial?: string; // the case's bid number
  manager?: { displayName: string; email: string; phone?: string };
  requester?: { displayName: string; phone?: string };
}

type Values = Record<string, string | number>;

const num = (v: unknown): number => (typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v));
/** 87000 → "87,000" (amounts as the document prints them). */
const amount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** The bid guarantee: 2% of the annual estimate, floored to whole thousands; none under ₪1M. */
export const GUARANTEE_MIN_ESTIMATE = 1_000_000;
export function bidGuarantee(annualEstimate: unknown): number | null {
  const n = num(annualEstimate);
  if (!Number.isFinite(n) || n < GUARANTEE_MIN_ESTIMATE) return null;
  return Math.floor((n * GUARANTEE_PCT) / 1000) * 1000;
}
export const PERFORMANCE_GUARANTEE_PCT = 0.05;

/** Contract months + option periods × months per period (none when an input is missing). */
export function optionTotalMonths(contractYears: unknown, periods: unknown, monthsPerPeriod: unknown): number | null {
  const y = num(contractYears);
  const c = num(periods);
  const m = num(monthsPerPeriod);
  if (![y, c, m].every((x) => Number.isFinite(x) && x >= 0) || !(y > 0)) return null;
  if (periods === '' || periods == null || monthsPerPeriod === '' || monthsPerPeriod == null) return null;
  return y * 12 + c * m;
}

const DAY_MS = 86_400_000;

function formulaValue(
  formula: string,
  values: Values,
  ctx: FillContext,
  guaranteeKey: string,
): string | number | undefined {
  switch (formula) {
    case 'guarantee_words': {
      const raw = values[guaranteeKey] ?? bidGuarantee(ctx.annualEstimate) ?? undefined;
      const n = num(raw);
      return raw !== undefined && Number.isFinite(n) && n >= 0 && n <= 999_999_999 ? shekelsInWords(n) : undefined;
    }
    case 'total_months':
      return totalMonths(values[SERVICE_KEYS.initialMonths], values[SERVICE_KEYS.optionPeriods]) ?? undefined;
    case 'quality_pct': {
      const e = Number(values[SERVICE_KEYS.economicPct]);
      return values[SERVICE_KEYS.economicPct] !== undefined && Number.isFinite(e) && e >= 0 && e <= 100 ? 100 - e : undefined;
    }
    case 'submission_day':
      return ctx.submissionDeadline ? hebrewWeekday(ctx.submissionDeadline) : undefined;
    case 'manager_name':
      return ctx.manager?.displayName;
    case 'manager_email':
      return ctx.manager?.email;
    case 'manager_phone':
      return ctx.manager?.phone;
    case 'requester_name':
      return ctx.requester?.displayName;
    case 'requester_phone':
      return ctx.requester?.phone;
    case 'bid_guarantee': {
      const g = bidGuarantee(ctx.annualEstimate);
      return g === null ? undefined : amount(g);
    }
    case 'performance_guarantee': {
      const n = num(ctx.annualEstimate);
      return Number.isFinite(n) && n > 0 ? amount(Math.round(n * PERFORMANCE_GUARANTEE_PCT)) : undefined;
    }
    case 'annual_estimate': {
      const n = num(ctx.annualEstimate);
      return Number.isFinite(n) && n > 0 ? amount(n) : undefined;
    }
    case 'guarantee_validity':
      return ctx.submissionDeadline ? formatIsraelDate(ctx.submissionDeadline + 60 * DAY_MS) : undefined;
    case 'bid_validity':
      return ctx.submissionDeadline ? formatIsraelDate(addDaysToWorkingDay(ctx.submissionDeadline, 90)) : undefined;
    case 'submission_date':
      return ctx.submissionDeadline ? formatIsraelDate(ctx.submissionDeadline) : undefined;
    case 'bid_serial':
      return ctx.serial || undefined;
    case 'request_brief':
      return ctx.requestBrief?.trim() || undefined;
    case 'option_total_months':
      return (
        optionTotalMonths(ctx.contractYears, values[OPTION_KEYS.count], values[OPTION_KEYS.months]) ?? undefined
      );
    default:
      return undefined;
  }
}

function fillValue(fill: SystemFill, values: Values, ctx: FillContext, guaranteeKey: string): string | number | undefined {
  if (fill.kind === 'fixed') return fill.value;
  if (fill.kind === 'copy') return values[fill.from];
  return formulaValue(fill.formula, values, ctx, guaranteeKey);
}

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/**
 * The form values completed by the system: a blank guarantee amount takes its default, then every
 * system-filled field is computed (copies and formulas read the values above, so they run after the
 * defaults). A fixed value never replaces an answer already there (e.g. the requester's). A field whose
 * inputs are missing stays absent.
 */
export function resolveSystemFills(params: readonly TemplateParam[], input: Values, ctx: FillContext): Values {
  const out: Values = { ...input };
  for (const p of params) {
    if (p.defaultFrom === 'guarantee_pct' && String(out[p.key] ?? '').trim() === '') {
      const d = guaranteeDefault(ctx.annualEstimate ?? out[SERVICE_KEYS.estimate]);
      if (d !== null) out[p.key] = d;
    }
  }
  // The amount in words follows the (first) bid-guarantee field.
  const guaranteeKey =
    params.find((p) => isGuaranteeAmountParam(p) && !p.fill)?.key ??
    params.find(isGuaranteeAmountParam)?.key ??
    SERVICE_KEYS.guaranteeAmount;
  // Two passes: copies may read values another rule computes later in the template's order.
  for (let pass = 0; pass < 2; pass++) {
    for (const p of params) {
      if (!p.fill) continue;
      if (p.fill.kind === 'fixed' && !isBlank(out[p.key]) && out[p.key] !== p.fill.value) continue;
      const v = fillValue(p.fill, out, ctx, guaranteeKey);
      if (v !== undefined && String(v) !== '') out[p.key] = v;
    }
  }
  return out;
}

// ---- built-in rules, by field key and Hebrew label ----
// Fields typed into a Google Doc by hand carry no fill metadata, and a re-sync can't add it. These
// rules recognise them by name (the procurement spreadsheet, procurementForm.ts), the way the bid-number
// and deadline fields are recognised, so they survive any re-sync. Explicit metadata always wins.

/** The bid-guarantee amount (not the performance guarantee "סכום ערבות ביצוע", not its validity). */
export const isGuaranteeAmountParam = (p: { key: string; labelHe?: string }): boolean =>
  ruleNamed(p, GUARANTEE_AMOUNT_NAMES);

/** The template's fields with the procurement form's rules attached (for creating and checking cases). */
export function withBuiltinFills(params: readonly TemplateParam[]): TemplateParam[] {
  return params.map((p) => {
    if (p.fill) return p;
    const rule = procurementRuleFor(p, params);
    if (!rule) return p;
    if (rule.hide) return { ...p, hidden: true };
    return rule.fill ? { ...p, fill: rule.fill } : p;
  });
}
