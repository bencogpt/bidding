import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLANK_LINE, REQUIRED_BLANK_RE, draftLines, draftParts, fillTemplate, requiredBlank, withEmptyFieldsPrinted } from '@obms/shared';

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

test('withEmptyFieldsPrinted (plan D7): empty fields print as blank lines, required ones with their label', () => {
  const out = withEmptyFieldsPrinted({ a: 'x', b: '', d: 5 }, [
    { key: 'a', labelHe: 'א', required: true },
    { key: 'b', labelHe: 'מועד הגשה', required: true },
    { key: 'c', labelHe: 'ג', required: false },
    { key: 'budget', labelHe: 'אומדן', required: true, internal: true },
  ]);
  assert.deepEqual(out, { a: 'x', b: requiredBlank('מועד הגשה'), c: BLANK_LINE, d: 5 });
  assert.equal([...String(out.b).matchAll(REQUIRED_BLANK_RE)][0][1], 'מועד הגשה', 'the publish gate can read the label back');
});
