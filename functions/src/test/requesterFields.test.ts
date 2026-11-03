// Unit tests for the request screen's answers (no network):  node --test functions/lib/test/requesterFields.test.js
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

const REQ = { service_name: 'שירותי תמיכה', document_classification: 'בלמ"ס', annual_budget: 900000, contract_years: 3 };

test('the request screen asks four questions besides the brief, all required, only the budget internal', () => {
  assert.deepEqual(
    REQUESTER_FIELDS.map((f) => f.labelHe),
    ['שם השירות', 'סיווג המסמך', 'מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות?', 'משך תקופת התקשרות בשנים'],
  );
  assert.ok(REQUESTER_FIELDS.every((f) => f.required));
  assert.deepEqual(REQUESTER_FIELDS.filter((f) => f.internal).map((f) => f.key), ['annual_budget']);
  const defaults = Object.fromEntries(REQUESTER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default]));
  assert.deepEqual(defaults, { document_classification: 'בלמ"ס' });
});

test('details schema accepts the answers, an empty stored object and a legacy option_periods; the input schema does not', () => {
  assert.ok(requesterDetailsSchema.safeParse({}).success);
  assert.ok(requesterDetailsSchema.safeParse(REQ).success);
  assert.ok(requesterDetailsSchema.safeParse({ option_periods: 2 }).success, 'stored earlier requests still parse');
  assert.ok(requesterDetailsInputSchema.safeParse(REQ).success);
  assert.equal(requesterDetailsInputSchema.safeParse({ ...REQ, option_periods: 2 }).success, false);
});

test('details schema rejects unknown keys, bad numbers, empty and over-long text, and {{placeholders}}', () => {
  const bad = (d: unknown) => assert.equal(requesterDetailsSchema.safeParse(d).success, false, JSON.stringify(d));
  bad({ estimate: 5 });
  bad(JSON.parse('{"__proto__":{"x":1}}'));
  bad({ annual_budget: -1 });
  bad({ annual_budget: 0 });
  bad({ annual_budget: '5' });
  bad({ annual_budget: Number.NaN });
  bad({ contract_years: 0 });
  bad({ contract_years: 1.5 });
  bad({ contract_years: 31 });
  bad({ service_name: '' });
  bad({ service_name: 'x'.repeat(201) });
  bad({ service_name: 'שירות {{MAP_TARGET}}' });
});

test('every required answer must be there to open a request', () => {
  assert.ok(requesterDetailsInputSchema.safeParse(REQ).success);
  for (const k of Object.keys(REQ)) {
    const { [k]: _omit, ...rest } = REQ as Record<string, string | number>;
    assert.equal(requesterDetailsInputSchema.safeParse(rest).success, false, `${k} is required`);
  }
});

test('createBidRequestInput needs the answers; draftBidInput takes the request id', () => {
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
  assert.ok(out.indexOf('שם השירות: שירותי תמיכה') < out.indexOf('משך תקופת התקשרות בשנים: 3'));
  assert.ok(!out.includes('900000'));
  assert.ok(!out.includes('אומדן'));
});

test('briefWithDetails leaves the brief alone when there is nothing to add', () => {
  assert.equal(briefWithDetails('שירותי תמיכה', undefined), 'שירותי תמיכה');
  assert.equal(briefWithDetails('שירותי תמיכה', { annual_budget: 5 }), 'שירותי תמיכה');
});

test('fillFromRequestDetails fills blank fields, the manager wins, whitespace counts as blank', () => {
  const params = [{ key: 'service_name' }, { key: 'document_classification' }, { key: 'annual_budget' }];
  const out = fillFromRequestDetails(params, { service_name: '   ' }, REQ);
  assert.equal(out.service_name, 'שירותי תמיכה'); // blank → filled
  assert.equal(out.document_classification, 'בלמ"ס'); // absent → filled
  assert.ok(!('annual_budget' in out)); // never, even if the template has such a field
  assert.equal(fillFromRequestDetails(params, { service_name: 'שלי' }, REQ).service_name, 'שלי'); // the manager's value wins
});

test('fillFromRequestDetails turns the contract years into the initial period, only when the template has it and it is blank', () => {
  const withPeriod = [{ key: 'initial_period_months' }];
  assert.equal(fillFromRequestDetails(withPeriod, {}, REQ).initial_period_months, 36);
  assert.equal(fillFromRequestDetails(withPeriod, { initial_period_months: 24 }, REQ).initial_period_months, 24);
  assert.equal(fillFromRequestDetails(withPeriod, { initial_period_months: ' ' }, REQ).initial_period_months, 36);
  assert.ok(!('initial_period_months' in fillFromRequestDetails([{ key: 'other' }], {}, REQ)));
  assert.ok(!('initial_period_months' in fillFromRequestDetails(withPeriod, {}, { service_name: 'x' })), 'older request: nothing to derive');
});

test('fillFromRequestDetails ignores answers the template has no field for, and missing details', () => {
  assert.deepEqual(fillFromRequestDetails([{ key: 'a' }], { a: 1 }, { service_name: 'x' }), { a: 1 });
  assert.deepEqual(fillFromRequestDetails([{ key: 'service_name' }], {}, undefined), {});
});

test('normalizeDetailsInput trims, converts numbers, reports bad and missing answers', () => {
  const r = normalizeDetailsInput({ service_name: '  חיפה ', document_classification: ' ', annual_budget: 'abc', contract_years: '3' });
  assert.deepEqual(r.details, { service_name: 'חיפה', contract_years: 3 });
  assert.deepEqual(r.badNumbers, ['annual_budget']);
  assert.deepEqual(r.missing, ['document_classification']);
  for (const bad of ['-3', '0']) assert.deepEqual(normalizeDetailsInput({ annual_budget: bad }).badNumbers, ['annual_budget']);
  for (const bad of ['1.5', '0', '31', 'x']) assert.deepEqual(normalizeDetailsInput({ contract_years: bad }).badNumbers, ['contract_years'], bad);
});

test('procurement form: the requester answers leave it, removed fields never show, option periods is an ordinary field again', () => {
  assert.equal(isRequesterAnswered('service_name'), true);
  assert.equal(isRequesterAnswered('contract_years'), true);
  assert.equal(isRequesterAnswered('annual_budget'), false);
  assert.equal(isRequesterAnswered('option_periods'), false);
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

test("the bid's title is the requester's service name, and step 2 doesn't ask it", async () => {
  const { fillFromRequestDetails, isFormHidden } = await import('@obms/shared');
  const params = [{ key: 'tender_title', labelHe: 'tender_title' }, { key: 'כותרת המכרז', labelHe: 'כותרת המכרז' }];
  const out = fillFromRequestDetails(params, {}, REQ);
  assert.equal(out.tender_title, 'שירותי תמיכה');
  assert.equal(out['כותרת המכרז'], 'שירותי תמיכה');
  assert.equal(fillFromRequestDetails(params, { tender_title: 'כותרת אחרת' }, REQ).tender_title, 'כותרת אחרת', 'a typed title wins');
  assert.ok(params.every((p) => isFormHidden(p)));
  assert.ok(isFormHidden({ key: 'תוקף אחריות', labelHe: 'תוקף אחריות' }));
  assert.ok(!isFormHidden({ key: 'תקופת האחריות', labelHe: 'תקופת האחריות' }));
});
