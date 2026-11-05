// The "לוחות זמנים" rules (plan G-D7, G-D9; spec §6.7, §8.6):  node --test functions/lib/test/timeline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTimelineDay,
  daysBetween,
  formatShortDate,
  maskTypedDate,
  missingTimelineDates,
  parseTypedDate,
  timelineOf,
  TIMELINE_FIELDS,
} from '@obms/shared';

test('the four fields in v22 order; conf is the only optional one', () => {
  assert.deepEqual(TIMELINE_FIELDS.map((f) => f.key), ['conf', 'qdead', 'submit', 'valid']);
  assert.deepEqual(TIMELINE_FIELDS.filter((f) => !f.required).map((f) => f.key), ['conf']);
});

test('typing digits formats dd/mm/yy as you type (spec §8.6)', () => {
  assert.equal(maskTypedDate('2'), '2');
  assert.equal(maskTypedDate('211'), '21/1');
  assert.equal(maskTypedDate('2112'), '21/12');
  assert.equal(maskTypedDate('211226'), '21/12/26');
  assert.equal(maskTypedDate('21/12/2026'), '21/12/20', 'six digits at most');
  assert.equal(maskTypedDate('ab21x'), '21');
});

test('a typed date is parsed only when it exists', () => {
  assert.equal(parseTypedDate('21/12/26'), '2026-12-21');
  assert.equal(parseTypedDate('1.2.2027'), '2027-02-01');
  assert.equal(parseTypedDate('31/02/26'), null, 'no 31 February');
  assert.equal(parseTypedDate('29/02/28'), '2028-02-29', 'a leap year');
  assert.equal(parseTypedDate('21/12'), null);
  assert.equal(formatShortDate('2026-12-21'), '21/12/26');
});

test('Friday, Saturday and the rest-day holidays are blocked (G-D9)', () => {
  assert.deepEqual(checkTimelineDay('2026-12-21'), { ok: true }, 'a Monday');
  assert.deepEqual(checkTimelineDay('2026-12-25'), { ok: false, error: 'blocked' }, 'Friday');
  assert.deepEqual(checkTimelineDay('2026-12-26'), { ok: false, error: 'blocked' }, 'Saturday');
  for (const [iso, name] of [
    ['2026-09-12', 'Rosh Hashana'],
    ['2026-09-21', 'Yom Kippur'],
    ['2026-09-26', 'Sukkot'],
    ['2026-10-03', 'Shemini Atzeret'],
    ['2026-04-02', 'Pesach, first day'],
    ['2026-04-08', 'Pesach, seventh day'],
    ['2026-05-22', 'Shavuot'],
    ['2026-04-22', 'Independence Day'],
  ]) {
    assert.deepEqual(checkTimelineDay(iso!), { ok: false, error: 'blocked' }, name);
  }
  assert.deepEqual(checkTimelineDay('2026-02-30'), { ok: false, error: 'invalid' });
});

test('holiday eves and Chol HaMoed are allowed with a warning (G-D9)', () => {
  assert.deepEqual(checkTimelineDay('2026-09-20'), { ok: true, warning: 'eve' }, 'Erev Yom Kippur (a Sunday)');
  assert.deepEqual(checkTimelineDay('2026-04-01'), { ok: true, warning: 'eve' }, 'Erev Pesach');
  assert.deepEqual(checkTimelineDay('2026-05-21'), { ok: true, warning: 'eve' }, 'Erev Shavuot');
  assert.deepEqual(checkTimelineDay('2026-09-28'), { ok: true, warning: 'chol_hamoed' }, 'Chol HaMoed Sukkot');
  assert.deepEqual(checkTimelineDay('2026-04-06'), { ok: true, warning: 'chol_hamoed' }, 'Chol HaMoed Pesach');
});

test('the send waits for the three required dates; the submission date may come from the deadline', () => {
  assert.deepEqual(missingTimelineDates({}), ['qdead', 'submit', 'valid']);
  assert.deepEqual(missingTimelineDates({ timeline: { qdead: '2026-12-01', valid: '2027-03-01' } }), ['submit']);
  // 2026-12-21 10:00 in Israel (UTC+2)
  const deadline = Date.UTC(2026, 11, 21, 8, 0);
  assert.deepEqual(missingTimelineDates({ timeline: { qdead: '2026-12-01', valid: '2027-03-01' }, submissionDeadline: deadline }), []);
  assert.equal(timelineOf({ submissionDeadline: deadline }).submit, '2026-12-21');
  assert.deepEqual(missingTimelineDates({ timeline: { conf: null, qdead: '2026-12-01', submit: '2026-12-21', valid: '2027-03-01' } }), []);
});

test('the summary counts days from the submission to the validity date', () => {
  assert.equal(daysBetween('2026-12-21', '2027-02-19'), 60);
  assert.equal(daysBetween('2026-03-20', '2026-03-30'), 10, 'across the change to summer time');
});
