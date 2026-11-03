// Hebrew labels for template placeholders whose label is still the raw key:  node --test functions/lib/test/fieldLabels.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hebrewLabel, fieldType, resolveParam, detectPlaceholders, mergeSyncedParams } from '@obms/shared';

test('a raw English key gets its Hebrew label, whatever the letter case', () => {
  assert.equal(hebrewLabel('tender_title', 'tender_title'), 'כותרת המכרז');
  assert.equal(hebrewLabel('BID_LEAD_EMAIL', 'BID_LEAD_EMAIL'), 'דוא"ל מנהל המכרז');
  assert.equal(hebrewLabel('Bank_Name', ''), 'שם הבנק');
});

test('an approved Hebrew label, or a key with no known label, is left alone', () => {
  assert.equal(hebrewLabel('tender_title', 'שם המכרז שלנו'), 'שם המכרז שלנו');
  assert.equal(hebrewLabel('SOMETHING_NEW', 'SOMETHING_NEW'), 'SOMETHING_NEW');
});

test('detected placeholders and re-synced fields show Hebrew labels', () => {
  const detected = detectPlaceholders('כותרת: {{tender_title}} דוא"ל: {{BID_LEAD_EMAIL}} {{גוף_מזמין}}');
  assert.deepEqual(detected.map((p) => p.labelHe), ['כותרת המכרז', 'דוא"ל מנהל המכרז', 'גוף_מזמין']);
  const stored = [{ key: 'tender_title', labelHe: 'tender_title', type: 'text' as const, required: true }];
  const merged = mergeSyncedParams(detectPlaceholders('{{tender_title}}'), stored);
  assert.equal(merged[0].labelHe, 'כותרת המכרז');
});

test('fields that hold a date are dates, not text', () => {
  assert.equal(fieldType('gathering_date', 'תאריך כנס ספקים', 'text'), 'date');
  assert.equal(fieldType('GATHERING_DATE', 'GATHERING_DATE', 'text'), 'date');
  assert.equal(fieldType('x', 'תוקף ערבות ההצעה (תאריך)', 'text'), 'date');
  assert.equal(fieldType('x', 'שם הבנק', 'text'), 'text');
  assert.equal(fieldType('x', 'תאריך', 'textarea'), 'textarea', 'only plain text fields are upgraded');
  assert.equal(fieldType('x', 'תאריך', 'number'), 'number');
  const p = resolveParam({ key: 'gathering_date', labelHe: 'gathering_date', type: 'text' as const, required: true });
  assert.deepEqual([p.labelHe, p.type], ['תאריך כנס הספקים', 'date']);
  assert.deepEqual(detectPlaceholders('{{gathering_date}} {{bank_name}}').map((d) => d.type), ['date', 'text']);
  const merged = mergeSyncedParams(detectPlaceholders('{{x}}'), [{ key: 'x', labelHe: 'תאריך חתימה', type: 'text', required: true }]);
  assert.equal(merged[0].type, 'date');
});
