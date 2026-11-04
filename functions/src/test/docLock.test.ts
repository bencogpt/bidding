// Which Google Doc permissions the final approval downgrades (plan B4):  node --test functions/lib/test/docLock.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionsToLock } from '../services/docLock.js';

test('writers and commenters drop to reader; the owner and readers are left alone', () => {
  const ids = permissionsToLock([
    { id: 'o', role: 'owner', type: 'user', emailAddress: 'system@x' },
    { id: 'w', role: 'writer', type: 'user', emailAddress: 'manager@x' },
    { id: 'c1', role: 'commenter', type: 'user', emailAddress: 'legal@x' },
    { id: 'c2', role: 'commenter', type: 'user', emailAddress: 'finance@x' },
    { id: 'r', role: 'reader', type: 'user', emailAddress: 'viewer@x' },
  ]);
  assert.deepEqual(ids, ['w', 'c1', 'c2']);
});

test('groups and domains are narrowed too; a link share is never touched', () => {
  assert.deepEqual(
    permissionsToLock([
      { id: 'g', role: 'writer', type: 'group' },
      { id: 'd', role: 'commenter', type: 'domain' },
      { id: 'a', role: 'writer', type: 'anyone' },
    ]),
    ['g', 'd'],
  );
});

test('nothing to do for an empty or id-less list', () => {
  assert.deepEqual(permissionsToLock([]), []);
  assert.deepEqual(permissionsToLock([{ role: 'writer', type: 'user' }]), []);
});
