import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftLines, draftParts, fillTemplate } from '@obms/shared';

test('draftParts: filled, empty and omitted fields', () => {
  const parts = draftParts('עד {{deadline}} או {{missing}} {{SECURITY_APPENDIX}}', { deadline: '24.11.2026', SECURITY_APPENDIX: '' });
  const fields = parts.filter((p) => p.kind === 'field');
  assert.deepEqual(fields, [
    { kind: 'field', key: 'deadline', value: '24.11.2026' },
    { kind: 'field', key: 'missing', value: null },
  ]);
});

test('draftParts prints what fillTemplate prints', () => {
  const body = 'א {{x}} ב {{y}} ג';
  const params = { x: 5 };
  const printed = draftParts(body, params)
    .map((p) => (p.kind === 'text' ? p.text : (p.value ?? `{{${p.key}}}`)))
    .join('');
  assert.equal(printed, fillTemplate(body, params));
});

test('draftLines: headings by level, blank lines dropped', () => {
  assert.deepEqual(draftLines('# א\n\ntext\n### ב'), [
    { kind: 'heading', level: 2, text: 'א' },
    { kind: 'paragraph', text: 'text' },
    { kind: 'heading', level: 4, text: 'ב' },
  ]);
});
