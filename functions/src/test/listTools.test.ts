// The large writing window's list buttons (pure):  node --test functions/lib/test/listTools.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleList } from '@obms/shared';

test('bullets: the touched lines get "- ", untouched lines stay, and a second press removes them', () => {
  const text = 'ראשון\nשני\nשלישי';
  const r = toggleList(text, 7, 9, 'bullet'); // inside "שני"
  assert.deepEqual([r.from, r.to, r.text], [6, 9, '- שני']);
  const all = toggleList(text, 0, text.length, 'bullet');
  assert.equal(all.text, '- ראשון\n- שני\n- שלישי');
  const back = toggleList(all.text, 0, all.text.length, 'bullet');
  assert.equal(back.text, 'ראשון\nשני\nשלישי');
});

test('numbers: counted from 1 over the non-empty lines, blank lines kept, switching from bullets', () => {
  const r = toggleList('א\n\nב\nג', 0, 6, 'number');
  assert.equal(r.text, '1. א\n\n2. ב\n3. ג');
  const swap = toggleList('- א\n- ב', 0, 7, 'number');
  assert.equal(swap.text, '1. א\n2. ב');
});

test('an empty text or a caret on an empty line does not crash', () => {
  assert.equal(toggleList('', 0, 0, 'bullet').text, '');
  assert.equal(toggleList('א\n\nב', 2, 2, 'number').text, '');
});
