// Unit tests for template helpers (no network). Run via `npm run test --workspace functions`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocId, detectPlaceholders, mergeSyncedParams } from '@obms/shared';

test('parseDocId extracts id from a full Google Docs URL', () => {
  assert.equal(
    parseDocId('https://docs.google.com/document/d/1AbC_def-GhIjkLmnOpqrStuv/edit?usp=sharing'),
    '1AbC_def-GhIjkLmnOpqrStuv',
  );
});

test('parseDocId accepts a raw id', () => {
  assert.equal(parseDocId('1AbC_def-GhIjkLmnOpqrStuv'), '1AbC_def-GhIjkLmnOpqrStuv');
});

test('parseDocId rejects junk', () => {
  assert.equal(parseDocId('not a link'), null);
  assert.equal(parseDocId(''), null);
});

test('detectPlaceholders finds unique keys in order', () => {
  const params = detectPlaceholders('Hello {{org}}, qty {{quantity}}, again {{org}}.');
  assert.deepEqual(
    params.map((p) => p.key),
    ['org', 'quantity'],
  );
  assert.equal(params[0].type, 'text');
  assert.equal(params[0].required, true);
});

test('detectPlaceholders supports Hebrew keys and uses them as labels', () => {
  const params = detectPlaceholders('גוף מזמין: {{גוף_מזמין}} תקציב: {{תקציב}}');
  assert.deepEqual(
    params.map((p) => p.key),
    ['גוף_מזמין', 'תקציב'],
  );
  assert.equal(params[0].labelHe, 'גוף_מזמין');
});

test('mergeSyncedParams keeps internal-only fields that have no placeholder', () => {
  const estimate = { key: 'budget', labelHe: 'אומדן', type: 'number' as const, required: false, internal: true };
  const merged = mergeSyncedParams(detectPlaceholders('{{org}} {{quantity}}'), [
    { key: 'org', labelHe: 'org', type: 'text', required: true },
    estimate,
  ]);
  assert.deepEqual(merged.map((p) => p.key), ['org', 'quantity', 'budget']);
  assert.deepEqual(merged[2], estimate);
});

test('mergeSyncedParams keeps a confidential key internal if it reappears in the doc', () => {
  const merged = mergeSyncedParams(detectPlaceholders('{{org}} {{budget}}'), [
    { key: 'budget', labelHe: 'אומדן', type: 'number', required: false, internal: true },
  ]);
  assert.equal(merged.find((p) => p.key === 'budget')?.internal, true);
  assert.equal(merged.length, 2);
});

test('hasPlaceholder: AI-draft {{PLACEHOLDER}} values are not filled values', async () => {
  const { hasPlaceholder } = await import('@obms/shared');
  assert.equal(hasPlaceholder('{{TENDER_NUMBER}}'), true);
  assert.equal(hasPlaceholder('ערבות {{GUARANTEE_AMOUNT_WORDS}} ₪'), true);
  assert.equal(hasPlaceholder('2026-07'), false);
  assert.equal(hasPlaceholder(12), false);
  assert.equal(hasPlaceholder(undefined), false);
});

test('auto fields: bid number and submission-date fields are filled by the system', async () => {
  const { isAutoParam, isAutoDeadlineParam, formatDeadlineFor } = await import('@obms/shared');
  assert.ok(isAutoParam({ key: 'tender_number' }) && isAutoParam({ key: 'submission_day_date' }));
  assert.ok(isAutoDeadlineParam({ key: 'submission_date' }) && !isAutoDeadlineParam({ key: 'clarifications_deadline' }));
  const deadline = Date.parse('2026-12-16T14:52:00Z'); // Wednesday 16/12/2026, 16:52 in Israel
  assert.equal(formatDeadlineFor('submission_date', deadline), '16/12/2026');
  assert.equal(formatDeadlineFor('submission_day_date', deadline), 'יום רביעי, 16/12/2026');
  assert.equal(formatDeadlineFor('submission_day', deadline), 'רביעי');
});

test('placeholderSpellings covers hand-typed spaces inside the braces', async () => {
  const { placeholderSpellings } = await import('../services/docsService.js');
  assert.ok(placeholderSpellings('guarantee_duration').includes('{{guarantee_duration }}'));
  assert.equal(placeholderSpellings('x').length, 4);
});
