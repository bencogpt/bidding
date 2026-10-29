// Unit tests for serial numbers and case-team rules (no network):
//   node --test functions/lib/test/team.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSerial, memberUidsOf, missingRoles, requiredRolesFor, REQUIRED_ROLES_BY_TYPE } from '@obms/shared';
import { canAccessCase } from '../lib/context.js';

test('formatSerial pads to four digits and keeps larger numbers', () => {
  assert.equal(formatSerial(2026, 42), 'BID-2026-0042');
  assert.equal(formatSerial(2026, 1), 'BID-2026-0001');
  assert.equal(formatSerial(2027, 12345), 'BID-2027-12345');
});

test('required roles per type, extras added in canonical order without duplicates', () => {
  assert.deepEqual(REQUIRED_ROLES_BY_TYPE.goods, ['requester', 'legal', 'finance']);
  assert.deepEqual(requiredRolesFor('goods'), ['requester', 'legal', 'finance']);
  assert.deepEqual(requiredRolesFor('goods', ['security', 'legal']), ['requester', 'legal', 'finance', 'security']);
  assert.deepEqual(requiredRolesFor('project'), ['requester', 'legal', 'finance', 'security']);
});

test('missingRoles lists empty required slots', () => {
  assert.deepEqual(missingRoles(['requester', 'legal', 'finance'], { legal: 'u1' }), ['requester', 'finance']);
  assert.deepEqual(missingRoles(['legal'], { legal: 'u1' }), []);
  assert.deepEqual(missingRoles(['legal'], undefined), ['legal']);
});

test('memberUidsOf = owner + team, deduplicated', () => {
  assert.deepEqual(memberUidsOf('m', { legal: 'a', finance: 'b' }), ['m', 'a', 'b']);
  assert.deepEqual(memberUidsOf('m', { legal: 'm' }), ['m']);
  assert.deepEqual(memberUidsOf('m', undefined), ['m']);
});

test('canAccessCase: managers always, team members only their cases, suppliers never', () => {
  const tender = { ownerUid: 'm', memberUids: ['m', 'legal1'] };
  const caller = (uid: string, role: string) => ({ uid, role, name: uid }) as Parameters<typeof canAccessCase>[0];
  assert.ok(canAccessCase(caller('other-mgr', 'tender_manager'), tender));
  assert.ok(canAccessCase(caller('legal1', 'legal'), tender));
  assert.ok(!canAccessCase(caller('legal2', 'legal'), tender));
  assert.ok(!canAccessCase(caller('fin', 'finance'), { ownerUid: 'm' }));
  assert.ok(!canAccessCase(caller('legal1', 'supplier'), tender));
});
