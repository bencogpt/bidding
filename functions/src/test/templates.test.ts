// Unit tests for template helpers (no network). Run via `npm run test --workspace functions`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocId, detectPlaceholders } from '@obms/shared';

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
