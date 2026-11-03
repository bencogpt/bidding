// Unit tests for the phase 1 requester fields (no network):  node --test functions/lib/test/requesterFields.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUESTER_FIELDS,
  requesterDetailsSchema,
  createBidRequestInput,
  draftBidInput,
  publicDetails,
  briefWithDetails,
  fillFromRequestDetails,
  normalizeDetailsInput,
  askedParams,
  isRequesterAnswered,
  isFormHidden,
  requesterDetailsInputSchema,
} from '@obms/shared';

const REQ = { service_name: 'שירותי תמיכה', document_classification: 'בלמ"ס', annual_budget: 900000, option_periods: 2 };

test('the field list: 13 unique keys, only the budget is internal, three defaults', () => {
  const keys = REQUESTER_FIELDS.map((f) => f.key);
  assert.equal(keys.length, 13);
  assert.equal(new Set(keys).size, 13);
  assert.deepEqual(REQUESTER_FIELDS.filter((f) => f.internal).map((f) => f.key), ['annual_budget']);
  const defaults = Object.fromEntries(REQUESTER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default]));
  assert.deepEqual(defaults, { document_classification: 'בלמ"ס', work_days: "ימים א' עד ה'", work_hours: 'משרה מלאה - 170 שעות' });
  assert.equal(REQUESTER_FIELDS.find((f) => f.key === 'service_providers_total')?.labelHe, 'כמות נותני השירות');
});

test('details schema accepts valid answers and an empty object', () => {
  assert.ok(requesterDetailsSchema.safeParse({}).success);
  assert.ok(
    requesterDetailsSchema.safeParse({ service_location: 'תל אביב', service_providers_total: 5, annual_budget: 900000 })
      .success,
  );
});

test('details schema rejects unknown keys, bad numbers, empty and over-long text, and {{placeholders}}', () => {
  const bad = (d: unknown) => assert.equal(requesterDetailsSchema.safeParse(d).success, false, JSON.stringify(d));
  bad({ estimate: 5 });
  bad({ __proto__: { x: 1 }, estimate: 1 });
  bad({ service_providers_total: -1 });
  bad({ service_providers_total: 0 });
  bad({ service_providers_total: '5' });
  bad({ annual_budget: Number.NaN });
  bad({ service_location: '' });
  bad({ service_location: 'x'.repeat(201) });
  bad({ provider_responsibilities: 'x'.repeat(1001) });
  bad({ service_location: 'תל אביב {{MAP_TARGET}}' });
});

test('createBidRequestInput and draftBidInput take the new optional fields', () => {
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה', details: REQ }).success);
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה', details: { ...REQ, work_days: 'א-ה' } }).success);
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
    publicDetails({ annual_budget: 900000, service_location: 'חיפה', other: 'x', work_days: '  ' }),
    { service_location: 'חיפה' },
  );
});

test('briefWithDetails appends labelled answers in table order and never the budget', () => {
  const out = briefWithDetails('שירותי תמיכה', {
    work_hours: 'משרה מלאה - 170 שעות',
    annual_budget: 900000,
    service_location: 'חיפה',
  });
  assert.ok(out.startsWith('שירותי תמיכה\n\nפרטים מהדורש:\n'));
  assert.ok(out.indexOf('מקום אספקת השירות: חיפה') < out.indexOf('מס\' שעות עבודה: משרה מלאה - 170 שעות'));
  assert.ok(!out.includes('900000'));
  assert.ok(!out.includes('אומדן'));
});

test('briefWithDetails leaves the brief alone when there is nothing to add', () => {
  assert.equal(briefWithDetails('שירותי תמיכה', undefined), 'שירותי תמיכה');
  assert.equal(briefWithDetails('שירותי תמיכה', { annual_budget: 5 }), 'שירותי תמיכה');
});

test('fillFromRequestDetails fills blank fields, the manager wins, whitespace counts as blank', () => {
  const params = [{ key: 'service_providers_total' }, { key: 'service_location' }, { key: 'work_days' }, { key: 'annual_budget' }];
  const out = fillFromRequestDetails(
    params,
    { service_providers_total: 7, service_location: '   ' },
    { service_providers_total: 5, service_location: 'חיפה', work_days: 'א-ה', annual_budget: 900000 },
  );
  assert.equal(out.service_providers_total, 7); // the manager's value wins
  assert.equal(out.service_location, 'חיפה'); // blank → filled
  assert.equal(out.work_days, 'א-ה'); // absent → filled
  assert.ok(!('annual_budget' in out)); // never, even if the template has such a field
});

test('fillFromRequestDetails ignores answers the template has no field for, and missing details', () => {
  assert.deepEqual(fillFromRequestDetails([{ key: 'a' }], { a: 1 }, { work_days: 'x' }), { a: 1 });
  assert.deepEqual(fillFromRequestDetails([{ key: 'work_days' }], {}, undefined), {});
});

test('normalizeDetailsInput trims, drops blanks, converts numbers and reports bad ones', () => {
  const r = normalizeDetailsInput({
    service_location: '  חיפה ',
    team_lead_role: '   ',
    service_providers_total: '5',
    annual_budget: 'abc',
  });
  assert.deepEqual(r.details, { service_location: 'חיפה', service_providers_total: 5 });
  assert.deepEqual(r.badNumbers, ['annual_budget']);
  assert.deepEqual(normalizeDetailsInput({ annual_budget: '-3' }).badNumbers, ['annual_budget']);
  assert.deepEqual(normalizeDetailsInput({ annual_budget: '0' }).badNumbers, ['annual_budget']);
});

test('askedParams leaves out what the requester answers (procurement form), keeps the rest', () => {
  const params = [
    { key: 'service_providers_total' },
    { key: 'work_days' },
    { key: 'annual_budget' }, // internal: not shown to procurement as a requester answer, stays as a template field
    { key: 'option_periods' },
  ];
  assert.deepEqual(askedParams(params).map((p) => p.key), ['annual_budget', 'option_periods']);
  assert.equal(isRequesterAnswered('service_providers_total'), true);
  assert.equal(isRequesterAnswered('annual_budget'), false);
  assert.equal(isRequesterAnswered('estimate'), false);
});

test('the medical approval type is on neither screen', () => {
  assert.ok(!REQUESTER_FIELDS.some((f) => f.labelHe === 'סוג האישור הרפואי הנדרש'));
  // a template field with that label (whatever its key) is not asked on the procurement form, nor required
  const params = [{ key: 'סוג_האישור_הרפואי_הנדרש', labelHe: 'סוג האישור הרפואי הנדרש', required: true }, { key: 'option_periods', labelHe: 'מספר תקופות אופציה' }];
  assert.deepEqual(askedParams(params).map((p) => p.key), ['option_periods']);
  assert.equal(isFormHidden(params[0]), true);
  assert.equal(isFormHidden(params[1]), false);
});

test('the five required answers of the request screen, and nothing else', () => {
  assert.deepEqual(
    REQUESTER_FIELDS.filter((f) => f.required).map((f) => f.labelHe),
    ['שם השירות', 'סיווג המסמך', 'מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות?', 'מספר תקופות אופציה'],
  ); // the fifth, "עיקרי השירות הנדרש (פרק ב')", is the brief itself
  const all = { service_name: 'שירותי תמיכה', document_classification: 'בלמ"ס', annual_budget: 900000, option_periods: 0 };
  assert.ok(requesterDetailsInputSchema.safeParse(all).success, 'zero option periods is a valid answer');
  for (const k of Object.keys(all)) {
    const { [k]: _omit, ...rest } = all as Record<string, string | number>;
    assert.equal(requesterDetailsInputSchema.safeParse(rest).success, false, `${k} is required`);
  }
  assert.equal(requesterDetailsInputSchema.safeParse({ ...all, option_periods: 1.5 }).success, false);
  assert.equal(requesterDetailsInputSchema.safeParse({ ...all, option_periods: -1 }).success, false);
  // an older request without these answers must still parse as a stored document
  assert.ok(requesterDetailsSchema.safeParse({}).success);
});

test('createBidRequestInput needs the required answers', () => {
  const all = { service_name: 'שירותי תמיכה', document_classification: 'בלמ"ס', annual_budget: 900000, option_periods: 2 };
  assert.ok(createBidRequestInput.safeParse({ brief: 'עיקרי השירות', details: all }).success);
  assert.equal(createBidRequestInput.safeParse({ brief: 'עיקרי השירות' }).success, false);
});

test('normalizeDetailsInput reports missing required answers and accepts a zero option count', () => {
  const r = normalizeDetailsInput({ service_name: '  ', option_periods: '0', annual_budget: '5' });
  assert.deepEqual(r.missing, ['service_name', 'document_classification']);
  assert.equal(r.details.option_periods, 0);
  assert.deepEqual(normalizeDetailsInput({ option_periods: '1.5' }).badNumbers, ['option_periods']);
});

test('option periods stay on the procurement form, the other answers leave it', () => {
  assert.equal(isRequesterAnswered('option_periods'), false);
  assert.equal(isRequesterAnswered('service_name'), true);
  assert.equal(isRequesterAnswered('work_days'), true);
});
