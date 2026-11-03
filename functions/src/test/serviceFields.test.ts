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

test('guaranteeDefault: 2.5% of the estimate, rounded to the shekel', () => {
  assert.equal(guaranteeDefault(1_000_000), 25_000);
  assert.equal(guaranteeDefault('1234567'), 30_864);
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
  assert.equal(out.guarantee_amount, 25_000);
  assert.equal(out.guarantee_amount_words, 'עשרים וחמישה אלף שקלים');
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
  const details = { service_name: 'שירות', document_classification: 'בלמ"ס', annual_budget: 1, option_periods: 0 };
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
