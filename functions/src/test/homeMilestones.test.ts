// The home's "מועדים קרובים" panel (plan E2):  node --test functions/lib/test/homeMilestones.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATE_HE, nextStageIdx, upcomingMilestones, type MilestoneInput } from '@obms/shared';

const NOW = new Date(2026, 10, 5, 9, 0).getTime();
const DAY = 86_400_000;
const holders = {
  requester: { uid: 'r', name: 'מרקוס' },
  legal: { uid: 'l', name: 'פריה' },
  finance: { uid: 'f', name: 'סבן' },
  security: { uid: 's', name: 'לנה' },
};
const approved = (uid: string) => ({ uid, name: '', at: 1 });
const row = (o: Partial<MilestoneInput>): MilestoneInput => ({
  id: o.id ?? 'x',
  ref: o.ref ?? '2026-1',
  name: o.name ?? 'בל"מ',
  kind: 'tender',
  stageIdx: 1,
  holders,
  approvals: {},
  approverRoles: ['requester', 'legal', 'finance'],
  ...o,
});

test('the next stage skips the conference (no backend for it)', () => {
  assert.equal(nextStageIdx(0), 1);
  assert.equal(nextStageIdx(1), 2);
  assert.equal(nextStageIdx(2), 4, 'פרסום → הבהרות');
  assert.equal(nextStageIdx(4), 5);
  assert.equal(nextStageIdx(5), 6);
});

test('a request waits for procurement and opens its own page', () => {
  const [m] = upcomingMilestones([row({ kind: 'request', stageIdx: 0 })], NOW);
  assert.equal(m.nextLabel, 'עריכה');
  assert.deepEqual(m.waiting, ['רכש']);
  assert.equal(m.when, NO_DATE_HE);
  assert.equal(m.at, null);
});

test('in עריכה it waits for procurement to send, then for the team members who have not approved', () => {
  const [unsent] = upcomingMilestones([row({})], NOW);
  assert.equal(unsent.nextLabel, 'פרסום לספקים');
  assert.deepEqual(unsent.waiting, ['רכש'], 'procurement sends first (v22)');
  assert.equal(unsent.tab, 'overview');

  const [none] = upcomingMilestones([row({ sent: true })], NOW);
  assert.deepEqual(none.waiting, ['דורש', 'משפטי', 'כספים']);

  const [some] = upcomingMilestones([row({ sent: true, approvals: { requester: approved('r'), finance: approved('f') } })], NOW);
  assert.deepEqual(some.waiting, ['משפטי']);

  // An approval from someone who no longer holds the role does not count.
  const [stale] = upcomingMilestones([row({ sent: true, approvals: { requester: approved('old') } })], NOW);
  assert.deepEqual(stale.waiting, ['דורש', 'משפטי', 'כספים']);
});

test('security is not waited for, and once everyone approved the final check runs by itself', () => {
  const [m] = upcomingMilestones(
    [row({ sent: true, approvals: { requester: approved('r'), legal: approved('l'), finance: approved('f') } })],
    NOW,
  );
  assert.deepEqual(m.waiting, []);
});

test('after the final approval procurement publishes; in הבהרות nobody holds it up', () => {
  const [ready] = upcomingMilestones([row({ stageIdx: 2 })], NOW);
  assert.equal(ready.nextLabel, 'הבהרות');
  assert.deepEqual(ready.waiting, ['רכש']);

  const [pub] = upcomingMilestones([row({ stageIdx: 4, submissionDeadline: NOW + 10 * DAY })], NOW);
  assert.equal(pub.nextLabel, 'הצעות');
  assert.deepEqual(pub.waiting, []);
  assert.equal(pub.when, '15.11', 'the submission deadline is when bids begin');
  assert.equal(pub.hot, false);
  assert.equal(pub.tab, 'bids', 'nothing waits: open the tab of the next stage');

  const [bids] = upcomingMilestones([row({ stageIdx: 5 })], NOW);
  assert.equal(bids.nextLabel, 'הערכה');
  assert.deepEqual(bids.waiting, ['רכש']);
});

test('a date within 3 days (or past) is hot; a delay risk needs someone to wait for', () => {
  const [soon] = upcomingMilestones([row({ stageIdx: 4, submissionDeadline: NOW + 2 * DAY })], NOW);
  assert.equal(soon.hot, true);
  assert.deepEqual(soon.risks, [], 'nobody holds it up');
  const [late] = upcomingMilestones([row({ stageIdx: 4, submissionDeadline: NOW - DAY })], NOW);
  assert.equal(late.hot, true);
  const [none] = upcomingMilestones([row({ stageIdx: 1 })], NOW);
  assert.equal(none.hot, false, 'no date, not hot');
});

test('soonest first, rows without a date after them in the given order; past הצעות left out', () => {
  const list = upcomingMilestones(
    [
      row({ id: 'draft', stageIdx: 1 }),
      row({ id: 'late', stageIdx: 4, submissionDeadline: NOW + 9 * DAY }),
      row({ id: 'req', kind: 'request', stageIdx: 0 }),
      row({ id: 'soon', stageIdx: 4, submissionDeadline: NOW + 2 * DAY }),
      row({ id: 'eval', stageIdx: 6 }),
      row({ id: 'closed', stageIdx: 7 }),
    ],
    NOW,
  );
  assert.deepEqual(
    list.map((m) => m.id),
    ['soon', 'late', 'draft', 'req'],
  );
});
