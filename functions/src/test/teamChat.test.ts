// The case team chat's view rules (plan D12):  node --test functions/lib/test/teamChat.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatDayLabel, chatTime, splitMentions, withDaySeparators } from '@obms/shared';

const at = (d: number, h = 10, min = 0) => new Date(2026, 10, d, h, min).getTime(); // November 2026, local time
const NOW = at(5, 15, 30);

test('@mentions are split out of the text, the way the prototype marks them', () => {
  assert.deepEqual(splitMentions('צריך לאשר. @דנה אפשר אומדן סופי?'), [
    { text: 'צריך לאשר. ', mention: false },
    { text: '@דנה', mention: true },
    { text: ' אפשר אומדן סופי?', mention: false },
  ]);
  // A mention stops at punctuation, which stays plain text.
  assert.deepEqual(splitMentions('@אורי, תוכל?'), [
    { text: '@אורי', mention: true },
    { text: ', תוכל?', mention: false },
  ]);
  assert.deepEqual(splitMentions('@דנה @יעל'), [
    { text: '@דנה', mention: true },
    { text: ' ', mention: false },
    { text: '@יעל', mention: true },
  ]);
});

test('text without a mention stays one piece, and a lone "@" is not a mention', () => {
  assert.deepEqual(splitMentions('הנספח בדרך'), [{ text: 'הנספח בדרך', mention: false }]);
  assert.deepEqual(splitMentions('כתובת @ ריקה'), [{ text: 'כתובת @ ריקה', mention: false }]);
  assert.deepEqual(splitMentions(''), []);
});

test('the pieces always join back to the message', () => {
  for (const s of ['a@b.c', '@@x', 'שלום @דני\nשורה שנייה', '@x!']) {
    assert.equal(splitMentions(s).map((p) => p.text).join(''), s);
  }
});

test('day labels: today, yesterday, then the date', () => {
  assert.equal(chatDayLabel(at(5, 0, 1), NOW), 'היום');
  assert.equal(chatDayLabel(at(5, 23, 59), NOW), 'היום');
  assert.equal(chatDayLabel(at(4, 23, 59), NOW), 'אתמול');
  assert.equal(chatDayLabel(at(4, 0, 0), NOW), 'אתמול');
  assert.equal(chatDayLabel(at(3, 12), NOW), '03.11.2026');
  assert.equal(chatDayLabel(new Date(2025, 11, 31, 9).getTime(), NOW), '31.12.2025');
});

test('a separator goes before the first message of each day', () => {
  const msgs = [
    { id: 'a', at: at(3, 9) },
    { id: 'b', at: at(3, 17) },
    { id: 'c', at: at(5, 9) },
    { id: 'd', at: at(5, 10) },
  ];
  const log = withDaySeparators(msgs, NOW);
  assert.deepEqual(
    log.map((i) => (i.kind === 'day' ? `[${i.label}]` : i.m.id)),
    ['[03.11.2026]', 'a', 'b', '[היום]', 'c', 'd'],
  );
  assert.equal(new Set(log.map((i) => i.key)).size, log.length, 'keys are unique');
  assert.deepEqual(withDaySeparators([], NOW), []);
});

test('the bubble shows hours and minutes', () => {
  assert.equal(chatTime(at(5, 9, 5)), '09:05');
  assert.equal(chatTime(at(5, 23, 59)), '23:59');
});
