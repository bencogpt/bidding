// Unit tests for the services create-form calculations (no network, no emulator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  askedParams,
  guaranteeDefault,
  isSystemParam,
  numberToHebrewWords,
  resolveSystemFills,
  shekelsInWords,
  totalMonths,
  type TemplateParam,
} from '@obms/shared';

test('guaranteeDefault: 2% of the annual estimate, rounded to the shekel', () => {
  assert.equal(guaranteeDefault(1_000_000), 20_000);
  assert.equal(guaranteeDefault('1234567'), 24_691);
  assert.equal(guaranteeDefault(''), null);
  assert.equal(guaranteeDefault(0), null);
  assert.equal(guaranteeDefault('abc'), null);
});

test('numberToHebrewWords: units, teens, tens, hundreds', () => {
  assert.equal(numberToHebrewWords(0), 'אפס');
  assert.equal(numberToHebrewWords(5), 'חמישה');
  assert.equal(numberToHebrewWords(12), 'שנים עשר');
  assert.equal(numberToHebrewWords(25), 'עשרים וחמישה');
  assert.equal(numberToHebrewWords(100), 'מאה');
  assert.equal(numberToHebrewWords(250), 'מאתיים וחמישים');
  assert.equal(numberToHebrewWords(999), 'תשע מאות תשעים ותשעה');
});

test('numberToHebrewWords: thousands and millions', () => {
  assert.equal(numberToHebrewWords(1000), 'אלף');
  assert.equal(numberToHebrewWords(2000), 'אלפיים');
  assert.equal(numberToHebrewWords(3000), 'שלושת אלפים');
  assert.equal(numberToHebrewWords(10_000), 'עשרת אלפים');
  assert.equal(numberToHebrewWords(25_000), 'עשרים וחמישה אלף');
  assert.equal(numberToHebrewWords(125_500), 'מאה עשרים וחמישה אלף וחמש מאות');
  assert.equal(numberToHebrewWords(1_000_000), 'מיליון');
  assert.equal(numberToHebrewWords(2_000_001), 'שני מיליון ואחד');
});

test('numberToHebrewWords rejects what it cannot spell', () => {
  assert.throws(() => numberToHebrewWords(-1), RangeError);
  assert.throws(() => numberToHebrewWords(1.5), RangeError);
  assert.throws(() => numberToHebrewWords(1e9), RangeError);
});

test('shekelsInWords: shekels, one shekel, agorot', () => {
  assert.equal(shekelsInWords(25_000), 'עשרים וחמישה אלף שקלים');
  assert.equal(shekelsInWords(1), 'שקל אחד');
  assert.equal(shekelsInWords(100.5), 'מאה שקלים וחמישים אגורות');
  assert.equal(shekelsInWords(99.999), 'מאה שקלים');
});

test('totalMonths: first period + option periods; blank options count as none', () => {
  assert.equal(totalMonths(24, 2), 26);
  assert.equal(totalMonths('24', ''), 24);
  assert.equal(totalMonths('', 2), null);
});

const params: TemplateParam[] = [
  { key: 'estimate', labelHe: 'אומדן', type: 'number', required: true, internal: true, order: 4 },
  { key: 'guarantee_amount', labelHe: 'ערבות', type: 'number', required: false, order: 5, defaultFrom: 'guarantee_pct' },
  { key: 'initial_period_months', labelHe: 'תקופה', type: 'number', required: false, order: 7 },
  { key: 'option_periods', labelHe: 'אופציות', type: 'number', required: false, order: 8 },
  { key: 'bid_number', labelHe: 'מספר', type: 'text', required: false },
  { key: 'guarantee_amount_words', labelHe: 'במילים', type: 'text', required: false, fill: { kind: 'formula', formula: 'guarantee_words' } },
  { key: 'total_months', labelHe: 'סך', type: 'number', required: false, fill: { kind: 'formula', formula: 'total_months' } },
  { key: 'validity', labelHe: 'תוקף', type: 'number', required: false, order: 6 },
  { key: 'offer_validity_days', labelHe: 'תוקף ההצעה', type: 'number', required: false, fill: { kind: 'copy', from: 'validity' } },
  { key: 'envelope_addressee', labelHe: 'נמען', type: 'text', required: false, fill: { kind: 'formula', formula: 'manager_name' } },
  { key: 'submission_day', labelHe: 'יום', type: 'text', required: false, fill: { kind: 'formula', formula: 'submission_day' } },
  { key: 'requester_phone', labelHe: 'טלפון', type: 'text', required: false, fill: { kind: 'formula', formula: 'requester_phone' } },
  { key: 'bid_box_location', labelHe: 'תיבה', type: 'text', required: false, fill: { kind: 'fixed', value: 'מרכז למורשת מודיעין' } },
  { key: 'damages_cap', labelHe: 'פיצוי', type: 'number', required: false, hidden: true },
];

// Sunday 2026-11-01 08:00 Israel time (UTC+2 in winter).
const SUNDAY = Date.UTC(2026, 10, 1, 6, 0);
const ctx = {
  submissionDeadline: SUNDAY,
  manager: { displayName: 'דנה מנהלת', email: 'manager@obms.test' },
  requester: { displayName: 'מרקוס מזמין', phone: '03-5550123' },
};

test('resolveSystemFills: default guarantee, words, totals, copies, fixed and context fields', () => {
  const out = resolveSystemFills(
    params,
    { estimate: 1_000_000, initial_period_months: 24, option_periods: 2, validity: 90 },
    ctx,
  );
  assert.equal(out.guarantee_amount, 20_000);
  assert.equal(out.guarantee_amount_words, 'עשרים אלף שקלים');
  assert.equal(out.total_months, 26);
  assert.equal(out.offer_validity_days, 90);
  assert.equal(out.envelope_addressee, 'דנה מנהלת');
  assert.equal(out.submission_day, 'יום ראשון');
  assert.equal(out.requester_phone, '03-5550123');
  assert.equal(out.bid_box_location, 'מרכז למורשת מודיעין');
  assert.equal('damages_cap' in out, false, 'hidden fields without a rule stay blank');
});

test('resolveSystemFills: a typed guarantee is kept and spelled out', () => {
  const out = resolveSystemFills(params, { estimate: 1_000_000, guarantee_amount: 40_000 }, ctx);
  assert.equal(out.guarantee_amount, 40_000);
  assert.equal(out.guarantee_amount_words, 'ארבעים אלף שקלים');
});

test('resolveSystemFills: missing inputs leave the field absent instead of guessing', () => {
  const out = resolveSystemFills(params, {}, { submissionDeadline: null });
  for (const k of ['guarantee_amount', 'guarantee_amount_words', 'total_months', 'offer_validity_days', 'envelope_addressee', 'submission_day', 'requester_phone']) {
    assert.equal(k in out, false, k);
  }
  assert.equal(out.bid_box_location, 'מרכז למורשת מודיעין');
});

test('askedParams: ordered by `order`, without system-filled, hidden or serial fields', () => {
  assert.deepEqual(
    askedParams(params).map((p) => p.key),
    ['estimate', 'guarantee_amount', 'validity', 'initial_period_months', 'option_periods'],
  );
  assert.equal(isSystemParam(params.find((p) => p.key === 'bid_number')!), true);
  assert.equal(isSystemParam(params.find((p) => p.key === 'estimate')!), false);
});

test('askedParams: fields without an order keep their stored order after the ordered ones', () => {
  const legacy: TemplateParam[] = [
    { key: 'a', labelHe: 'א', type: 'text', required: true },
    { key: 'b', labelHe: 'ב', type: 'text', required: true, order: 1 },
    { key: 'c', labelHe: 'ג', type: 'text', required: true },
  ];
  assert.deepEqual(askedParams(legacy).map((p) => p.key), ['b', 'a', 'c']);
});

test('mergeSyncedParams keeps form order, hidden and fill rules across a re-sync', async () => {
  const { mergeSyncedParams } = await import('@obms/shared');
  const existing: TemplateParam[] = [
    { key: 'guarantee_amount', labelHe: 'ערבות', type: 'number', required: false, order: 5, defaultFrom: 'guarantee_pct' },
    { key: 'total_months', labelHe: 'סך', type: 'number', required: false, fill: { kind: 'formula', formula: 'total_months' } },
    { key: 'damages_cap', labelHe: 'פיצוי', type: 'number', required: false, hidden: true },
    { key: 'removed_from_doc', labelHe: 'הוסר', type: 'text', required: true, order: 6 },
  ];
  // the doc still mentions the first two, and a brand-new field
  const detected: TemplateParam[] = [
    { key: 'guarantee_amount', labelHe: 'guarantee_amount', type: 'text', required: true },
    { key: 'total_months', labelHe: 'total_months', type: 'text', required: true },
    { key: 'new_field', labelHe: 'new_field', type: 'text', required: true },
  ];
  const merged = mergeSyncedParams(detected, existing);
  const by = (k: string) => merged.find((p) => p.key === k)!;
  assert.equal(by('guarantee_amount').order, 5);
  assert.equal(by('guarantee_amount').defaultFrom, 'guarantee_pct');
  assert.deepEqual(by('total_months').fill, { kind: 'formula', formula: 'total_months' });
  assert.equal(by('new_field').order, undefined);
  assert.ok(by('damages_cap').hidden, 'hidden field without a placeholder is carried over');
  assert.equal(merged.some((p) => p.key === 'removed_from_doc'), false, 'an ordinary field gone from the doc is dropped');
});

test('a brief longer than BRIEF_MAX_LENGTH is rejected by createBidRequest and the AI draft', async () => {
  const { createBidRequestInput, draftBidInput, BRIEF_MAX_LENGTH } = await import('@obms/shared');
  const ok = 'א'.repeat(BRIEF_MAX_LENGTH);
  const tooLong = ok + 'א';
  const details = { service_name: 'שירות', document_classification: 'בלמ"ס', annual_budget: 1, contract_years: 1 };
  assert.equal(createBidRequestInput.safeParse({ brief: ok, details }).success, true);
  assert.equal(createBidRequestInput.safeParse({ brief: tooLong, details }).success, false);
  assert.equal(draftBidInput.safeParse({ type: 'service', brief: ok }).success, true);
  assert.equal(draftBidInput.safeParse({ type: 'service', brief: tooLong }).success, false);
});

test('quality share is 100 minus the economic share, and absent for a bad value', () => {
  const params: TemplateParam[] = [
    { key: 'quality_pct', labelHe: 'איכותי', type: 'number', required: false, fill: { kind: 'formula', formula: 'quality_pct' } },
  ];
  const ctx = { submissionDeadline: null };
  assert.equal(resolveSystemFills(params, { economic_pct: 70 }, ctx).quality_pct, 30);
  assert.equal(resolveSystemFills(params, { economic_pct: 100 }, ctx).quality_pct, 0);
  assert.equal('quality_pct' in resolveSystemFills(params, { economic_pct: 130 }, ctx), false);
  assert.equal('quality_pct' in resolveSystemFills(params, {}, ctx), false);
});

// The service template as typed into the Google Doc: Hebrew placeholders, no fill metadata.
const typed: TemplateParam[] = [
  { key: 'tender_title', labelHe: 'tender_title', type: 'text', required: true },
  { key: 'כתובת מייל של מנהל המכרז', labelHe: 'כתובת מייל של מנהל המכרז', type: 'text', required: true },
  { key: 'סכום ערבות להצעה', labelHe: 'סכום ערבות להצעה', type: 'text', required: true },
  { key: 'bid_guarantee_amount', labelHe: 'סכום ערבות ההצעה (בש"ח)', type: 'number', required: true },
  { key: 'bid_guarantee_amount_words', labelHe: 'סכום ערבות ההצעה במילים', type: 'text', required: true },
  { key: 'bid_guarantee_validity_date', labelHe: 'תוקף ערבות ההצעה', type: 'date', required: true },
  { key: 'guarantee_duration', labelHe: 'guarantee_duration', type: 'text', required: true },
  { key: 'bid_validity_date', labelHe: 'תוקף ההצעה', type: 'date', required: true },
  { key: 'סכום ערבות ביצוע', labelHe: 'סכום ערבות ביצוע', type: 'text', required: true },
  { key: 'תוקף אחריות', labelHe: 'תוקף אחריות', type: 'text', required: true },
  { key: 'service_field_summary', labelHe: "עיקרי השירות הנדרש (פרק ב')", type: 'textarea', required: true },
  { key: 'agreement_service_field', labelHe: 'תחום השירות (בהסכם)', type: 'text', required: true },
  { key: 'gathering_hour', labelHe: 'gathering_hour', type: 'text', required: true },
  { key: 'bank_name', labelHe: 'bank_name', type: 'text', required: true },
  { key: 'phone_number', labelHe: 'phone_number', type: 'text', required: true },
  { key: 'clarifications_email', labelHe: 'כתובת דוא"ל לשאלות הבהרה', type: 'text', required: true },
  { key: 'clarifications_reference', labelHe: 'מזהה הבל"ם לפנייה בשאלות', type: 'text', required: true },
  { key: "מס' שעות עבודה", labelHe: "מס' שעות עבודה", type: 'text', required: true },
  { key: 'framework_max_amount', labelHe: 'סכום המסגרת המקסימלי (בש"ח)', type: 'number', required: true },
  { key: 'option_periods_count', labelHe: 'מספר תקופות אופציה', type: 'number', required: true },
  { key: 'option_period_months', labelHe: 'מספר חודשים לכל תקופת אופציה', type: 'number', required: true },
  { key: 'option_total_months', labelHe: 'סך מצטבר של חודשי אופציה', type: 'number', required: true },
  { key: 'gathering_date', labelHe: 'gathering_date', type: 'date', required: true },
  { key: 'הוראות ביטחון', labelHe: 'הוראות ביטחון', type: 'text', required: true },
];

test('procurement form: step 2 asks only what the spreadsheet leaves to procurement', async () => {
  const { withBuiltinFills, askedParams } = await import('@obms/shared');
  const asked = askedParams(withBuiltinFills(typed)).map((p) => p.key);
  assert.deepEqual(asked, ['option_period_months', 'הוראות ביטחון']);
});

test('procurement form: calculated, fixed and context values', async () => {
  const { withBuiltinFills } = await import('@obms/shared');
  const all = withBuiltinFills(typed);
  const out = resolveSystemFills(
    all,
    { option_periods_count: 2, option_period_months: 12, "מס' שעות עבודה": 'חצי משרה' },
    {
      ...ctx,
      manager: { ...ctx.manager, phone: '03-1234567' },
      annualEstimate: 4_367_200,
      contractYears: 2,
      requestBrief: 'שירותי ניקיון למבנה משרדים',
      serial: '2026-31',
    },
  );
  assert.equal(out['סכום ערבות להצעה'], '87,000', '2% floored to thousands (87,344 → 87,000)');
  assert.equal(out.bid_guarantee_amount, '87,000');
  assert.equal(out.bid_guarantee_amount_words, 'שמונים ושבעה אלף שקלים');
  assert.equal(out['סכום ערבות ביצוע'], '218,360', '5% of the annual estimate');
  assert.equal(out.framework_max_amount, '4,367,200', 'the annual estimate, published as the framework amount');
  assert.equal(out['כתובת מייל של מנהל המכרז'], 'manager@obms.test');
  assert.equal(out.clarifications_email, 'manager@obms.test');
  assert.equal(out.phone_number, '03-1234567');
  assert.equal(out.clarifications_reference, '2026-31');
  assert.equal(out.service_field_summary, 'שירותי ניקיון למבנה משרדים');
  assert.equal(out.agreement_service_field, 'שירותי ניקיון למבנה משרדים', "copied from פרק ב'");
  assert.equal(out.gathering_hour, 'בין 08:00-13:00');
  assert.equal(out.bank_name, 'אוצר החייל');
  assert.equal(out["מס' שעות עבודה"], 'חצי משרה', "the requester's answer beats the fixed default");
  assert.equal(out.option_total_months, 48, '2 years + 2 × 12 option months');
  // Sunday 1/11/2026: +60 days = 31/12/2026; +90 days = Sat 30/1/2027 → Sun 31/1/2027.
  assert.equal(out.bid_guarantee_validity_date, '31/12/2026');
  assert.equal(out.bid_validity_date, '31/01/2027');
  assert.equal('gathering_date' in out, false, 'not asked, nothing fills it');
});

test('procurement form: no bid guarantee under ₪1M', async () => {
  const { withBuiltinFills, bidGuarantee } = await import('@obms/shared');
  assert.equal(bidGuarantee(999_999), null);
  assert.equal(bidGuarantee(1_000_000), 20_000);
  const out = resolveSystemFills(withBuiltinFills(typed), {}, { ...ctx, annualEstimate: 800_000 });
  assert.equal(out['סכום ערבות להצעה'], undefined);
  assert.equal(out.bid_guarantee_amount_words, undefined);
});

test('built-in rules: explicit field metadata wins; keys match case-insensitively', async () => {
  const { withBuiltinFills } = await import('@obms/shared');
  const fixedEmail: TemplateParam = { key: 'manager_email', labelHe: 'מייל', type: 'text', required: false, fill: { kind: 'fixed', value: 'x@y' } };
  assert.deepEqual(withBuiltinFills([fixedEmail])[0].fill, { kind: 'fixed', value: 'x@y' });
  const lead: TemplateParam = { key: 'BID_LEAD_EMAIL', labelHe: 'BID_LEAD_EMAIL', type: 'text', required: true };
  assert.deepEqual(withBuiltinFills([lead])[0].fill, { kind: 'formula', formula: 'manager_email' });
});

test('Israeli working days: weekends and holidays move the date forward', async () => {
  const { isIsraeliWorkingDay, addDaysToWorkingDay } = await import('@obms/shared');
  const at = (d: string) => new Date(`${d}T10:00:00Z`);
  assert.equal(isIsraeliWorkingDay(at('2026-11-03')), true, 'a Tuesday');
  assert.equal(isIsraeliWorkingDay(at('2026-11-06')), false, 'Friday');
  assert.equal(isIsraeliWorkingDay(at('2026-09-12')), false, 'Rosh Hashana');
  assert.equal(isIsraeliWorkingDay(at('2026-09-21')), false, 'Yom Kippur');
  assert.equal(isIsraeliWorkingDay(at('2026-04-02')), false, 'Pesach');
  assert.equal(isIsraeliWorkingDay(at('2026-04-22')), false, 'Independence Day 2026');
  assert.equal(isIsraeliWorkingDay(at('2026-05-22')), false, 'Shavuot');
  assert.equal(isIsraeliWorkingDay(at('2026-04-23')), true, 'the day after Independence Day');
  // 90 days after 16/6/2026 is Mon 14/9 — the day after Rosh Hashana (12–13/9): a working day.
  assert.equal(new Date(addDaysToWorkingDay(at('2026-06-16').getTime(), 90)).toISOString().slice(0, 10), '2026-09-14');
  // 90 days after 14/6/2026 is Sat 12/9 (Rosh Hashana), then Sun 13/9 (its second day) → Mon 14/9.
  assert.equal(new Date(addDaysToWorkingDay(at('2026-06-14').getTime(), 90)).toISOString().slice(0, 10), '2026-09-14');
});

test('bid manager phone and removed tags', async () => {
  const { withBuiltinFills, askedParams, createInternalUserInput } = await import('@obms/shared');
  const params: TemplateParam[] = [
    { key: 'BID_MANAGER_PHONE', labelHe: 'BID_MANAGER_PHONE', type: 'text', required: true },
    { key: 'SECURITY_APPENDIX', labelHe: 'SECURITY_APPENDIX', type: 'text', required: true },
  ];
  const all = withBuiltinFills(params);
  assert.deepEqual(askedParams(all), [], 'neither is asked in step 2');
  const out = resolveSystemFills(all, {}, { ...ctx, manager: { ...ctx.manager, phone: '050-0000001' } });
  assert.equal(out.BID_MANAGER_PHONE, '050-0000001');
  assert.equal(out.SECURITY_APPENDIX, undefined);
  const base = { name: 'מנהל', email: 'm@x.test' };
  assert.equal(createInternalUserInput.safeParse({ ...base, role: 'tender_manager' }).success, false, 'a bid manager needs a phone');
  assert.equal(createInternalUserInput.safeParse({ ...base, role: 'tender_manager', phone: '050-1234567' }).success, true);
  assert.equal(createInternalUserInput.safeParse({ ...base, role: 'legal' }).success, true, 'other roles may omit it');
  assert.equal(createInternalUserInput.safeParse({ ...base, role: 'legal', phone: 'abc' }).success, false);
});
