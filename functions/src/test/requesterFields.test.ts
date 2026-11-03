// Unit tests for the phase 1 requester fields (no network):  node --test functions/lib/test/requesterFields.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUESTER_FIELDS,
  requesterDetailsSchema,
  requesterDetailsInputSchema,
  createBidRequestInput,
  draftBidInput,
  publicDetails,
  briefWithDetails,
  fillFromRequestDetails,
  normalizeDetailsInput,
  askedParams,
  isRequesterAnswered,
  isFormHidden,
} from '@obms/shared';

const REQ = { service_name: 'שירותי תמיכה', document_classification: 'בלמ"ס', annual_budget: 900000, option_periods: 2 };

test('the request screen asks exactly four questions besides the brief, all required, only the budget internal', () => {
  assert.deepEqual(
    REQUESTER_FIELDS.map((f) => f.labelHe),
    ['שם השירות', 'סיווג המסמך', 'מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות?', 'מספר תקופות אופציה'],
  );
  assert.ok(REQUESTER_FIELDS.every((f) => f.required));
  assert.deepEqual(REQUESTER_FIELDS.filter((f) => f.internal).map((f) => f.key), ['annual_budget']);
  const defaults = Object.fromEntries(REQUESTER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default]));
  assert.deepEqual(defaults, { document_classification: 'בלמ"ס' });
});

test('details schema accepts the answers and an empty stored object', () => {
  assert.ok(requesterDetailsSchema.safeParse({}).success);
  assert.ok(requesterDetailsSchema.safeParse(REQ).success);
  assert.ok(requesterDetailsInputSchema.safeParse(REQ).success);
});

test('details schema rejects unknown keys, bad numbers, empty and over-long text, and {{placeholders}}', () => {
  const bad = (d: unknown) => assert.equal(requesterDetailsSchema.safeParse(d).success, false, JSON.stringify(d));
  bad({ estimate: 5 });
  bad(JSON.parse('{"__proto__":{"x":1}}'));
  bad({ annual_budget: -1 });
  bad({ annual_budget: 0 });
  bad({ annual_budget: '5' });
  bad({ annual_budget: Number.NaN });
  bad({ option_periods: 1.5 });
  bad({ option_periods: -1 });
  bad({ service_name: '' });
  bad({ service_name: 'x'.repeat(201) });
  bad({ service_name: 'שירות {{MAP_TARGET}}' });
});

test('every required answer must be there to open a request; zero option periods is an answer', () => {
  assert.ok(requesterDetailsInputSchema.safeParse({ ...REQ, option_periods: 0 }).success);
  for (const k of Object.keys(REQ)) {
    const { [k]: _omit, ...rest } = REQ as Record<string, string | number>;
    assert.equal(requesterDetailsInputSchema.safeParse(rest).success, false, `${k} is required`);
  }
});

test('createBidRequestInput and draftBidInput take the answers and the request id', () => {
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה', details: REQ }).success);
  assert.equal(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה' }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה', details: { ...REQ, nope: 'x' } }).success, false);
  const base = { type: 'service', brief: 'שירותי תמיכה' };
  assert.ok(draftBidInput.safeParse(base).success);
  assert.ok(draftBidInput.safeParse({ ...base, bidRequestId: '2026-31' }).success);
  assert.equal(draftBidInput.safeParse({ ...base, bidRequestId: 'BID-1' }).success, false);
});

test('publicDetails drops the budget, unknown keys and blanks; tolerates a request with no details', () => {
  assert.deepEqual(publicDetails(undefined), {});
  assert.deepEqual(publicDetails(null), {});
  assert.deepEqual(
    publicDetails({ annual_budget: 900000, service_name: 'שירות', other: 'x', document_classification: '  ' }),
    { service_name: 'שירות' },
  );
});

test('briefWithDetails appends labelled answers in table order and never the budget', () => {
  const out = briefWithDetails('שירותי תמיכה', REQ);
  assert.ok(out.startsWith('שירותי תמיכה\n\nפרטים מהדורש:\n'));
  assert.ok(out.indexOf('שם השירות: שירותי תמיכה') < out.indexOf('מספר תקופות אופציה: 2'));
  assert.ok(!out.includes('900000'));
  assert.ok(!out.includes('אומדן'));
});

test('briefWithDetails leaves the brief alone when there is nothing to add', () => {
  assert.equal(briefWithDetails('שירותי תמיכה', undefined), 'שירותי תמיכה');
  assert.equal(briefWithDetails('שירותי תמיכה', { annual_budget: 5 }), 'שירותי תמיכה');
});

test('fillFromRequestDetails fills blank fields, the manager wins, whitespace counts as blank', () => {
  const params = [{ key: 'option_periods' }, { key: 'service_name' }, { key: 'document_classification' }, { key: 'annual_budget' }];
  const out = fillFromRequestDetails(params, { option_periods: 7, service_name: '   ' }, REQ);
  assert.equal(out.option_periods, 7); // the manager's value wins
  assert.equal(out.service_name, 'שירותי תמיכה'); // blank → filled
  assert.equal(out.document_classification, 'בלמ"ס'); // absent → filled
  assert.ok(!('annual_budget' in out)); // never, even if the template has such a field
});

test('fillFromRequestDetails ignores answers the template has no field for, and missing details', () => {
  assert.deepEqual(fillFromRequestDetails([{ key: 'a' }], { a: 1 }, { service_name: 'x' }), { a: 1 });
  assert.deepEqual(fillFromRequestDetails([{ key: 'service_name' }], {}, undefined), {});
});

test('normalizeDetailsInput trims, converts numbers, reports bad and missing answers', () => {
  const r = normalizeDetailsInput({ service_name: '  חיפה ', document_classification: ' ', annual_budget: 'abc', option_periods: '0' });
  assert.deepEqual(r.details, { service_name: 'חיפה', option_periods: 0 });
  assert.deepEqual(r.badNumbers, ['annual_budget']);
  assert.deepEqual(r.missing, ['document_classification']);
  assert.deepEqual(normalizeDetailsInput({ annual_budget: '-3' }).badNumbers, ['annual_budget']);
  assert.deepEqual(normalizeDetailsInput({ annual_budget: '0' }).badNumbers, ['annual_budget']);
  assert.deepEqual(normalizeDetailsInput({ option_periods: '1.5' }).badNumbers, ['option_periods']);
});

test('procurement form: the requester answers leave it, option periods stays, removed fields never show', () => {
  assert.equal(isRequesterAnswered('service_name'), true);
  assert.equal(isRequesterAnswered('option_periods'), false);
  assert.equal(isRequesterAnswered('annual_budget'), false);
  const params = [
    { key: 'service_name' },
    { key: 'option_periods', labelHe: 'מספר תקופות אופציה' },
    { key: 'סוג_האישור_הרפואי_הנדרש', labelHe: 'סוג האישור הרפואי הנדרש', required: true },
    { key: 'x1', labelHe: 'מקום אספקת השירות' },
    { key: 'work_days' },
    { key: 'estimate', labelHe: 'סכום המסגרת המקסימלי (בש"ח)' },
  ];
  assert.deepEqual(askedParams(params).map((p) => p.key), ['option_periods', 'estimate']);
  assert.equal(isFormHidden(params[2]), true);
  assert.equal(isFormHidden(params[3]), true);
});
