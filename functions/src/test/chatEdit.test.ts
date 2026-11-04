// Unit tests for editing an earlier chat answer (pure logic, no network):  node --test functions/lib/test/chatEdit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditMessage, rewindSnapshots, type ChatEditMsg } from '@obms/shared';

const chat: ChatEditMsg[] = [
  { role: 'agent' }, // 0 greeting
  { role: 'user' }, // 1 scope answer
  { role: 'agent' }, // 2
  { role: 'user', local: true }, // 3 the frame amount, kept in the browser
  { role: 'agent', local: true }, // 4
  { role: 'user' }, // 5
];

test('canEditMessage: only server-visible user answers that have a snapshot, while the agent is idle', () => {
  const snaps = new Map<number, string>([
    [1, 's1'],
    [5, 's5'],
  ]);
  assert.equal(canEditMessage(chat, 1, snaps, false), true);
  assert.equal(canEditMessage(chat, 5, snaps, false), true);
  assert.equal(canEditMessage(chat, 0, snaps, false), false); // an agent message
  assert.equal(canEditMessage(chat, 3, snaps, false), false); // the local budget answer
  assert.equal(canEditMessage(chat, 1, snaps, true), false); // the agent is typing
  assert.equal(canEditMessage(chat, 1, new Map(), false), false); // no snapshot to return to
});

test('rewindSnapshots returns the snapshot at the index and forgets it and everything after', () => {
  const snaps = new Map<number, string>([
    [1, 's1'],
    [3, 's3'],
    [5, 's5'],
  ]);
  assert.equal(rewindSnapshots(snaps, 3), 's3');
  assert.deepEqual([...snaps.keys()], [1]);
});

test('rewindSnapshots on an unknown index changes nothing', () => {
  const snaps = new Map<number, string>([[1, 's1']]);
  assert.equal(rewindSnapshots(snaps, 4), undefined);
  assert.deepEqual([...snaps.keys()], [1]);
});
