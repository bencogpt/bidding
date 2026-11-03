// Unit tests for the bid number (no network):  node --test functions/lib/test/bidNumber.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBidNumber, BID_NUMBER_MAX, BRIEF_MAX_LENGTH, createBidRequestInput, createTenderInput } from '@obms/shared';

test('formatBidNumber drops leading zeros', () => {
  assert.equal(formatBidNumber(2026, 31), '2026-31');
  assert.equal(formatBidNumber(2026, 7), '2026-7');
  assert.equal(formatBidNumber(2027, 999), '2027-999');
});

test('formatBidNumber rejects numbers outside 1..999', () => {
  for (const n of [0, -1, 1000, 1.5, NaN]) assert.throws(() => formatBidNumber(2026, n), RangeError);
  assert.equal(BID_NUMBER_MAX, 999);
});

test('createBidRequestInput needs a real brief', () => {
  const details = { service_name: 'שירות', document_classification: 'בלמ"ס', annual_budget: 1, contract_years: 1 };
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי אבטחה לאתר', details }).success);
  assert.equal(createBidRequestInput.safeParse({ brief: '   ', details }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'ab', details }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'x'.repeat(BRIEF_MAX_LENGTH + 1), details }).success, false);
});

test('createTenderInput requires a well-formed bidRequestId', () => {
  const base = { type: 'service', params: {} };
  assert.equal(createTenderInput.safeParse(base).success, false);
  assert.equal(createTenderInput.safeParse({ ...base, bidRequestId: 'BID-2026-0042' }).success, false);
  assert.ok(createTenderInput.safeParse({ ...base, bidRequestId: '2026-31' }).success);
});

import { allocateBidNumber, israelYear } from '../services/bidNumber.js';

const fakeClaims = (taken: Set<string> = new Set()) => {
  const attempts: number[] = [];
  return {
    attempts,
    claim: async (serial: string, n: number) => {
      attempts.push(n);
      if (taken.has(serial)) return false;
      taken.add(serial);
      return true;
    },
  };
};

test('allocateBidNumber turns a draw of 031 into 2026-31', async () => {
  const c = fakeClaims();
  // random() → 30/999 maps to n = 31
  const serial = await allocateBidNumber(2026, { random: () => 30 / 999, claim: c.claim });
  assert.equal(serial, '2026-31');
});

test('allocateBidNumber draws again when the number is taken', async () => {
  const c = fakeClaims(new Set(['2026-31']));
  const draws = [30 / 999, 30 / 999, 40 / 999]; // 31, 31 (taken again), 41
  const serial = await allocateBidNumber(2026, { random: () => draws.shift() ?? 0.5, claim: c.claim });
  assert.equal(serial, '2026-41');
});

test('allocateBidNumber finds the last free number when nearly full', async () => {
  const taken = new Set(Array.from({ length: 998 }, (_, i) => `2026-${i + 1}`)); // only 999 is free
  const c = fakeClaims(taken);
  assert.equal(await allocateBidNumber(2026, { random: () => 0, claim: c.claim }), '2026-999');
});

test('allocateBidNumber fails clearly when the year is full, trying each number once', async () => {
  const taken = new Set(Array.from({ length: 999 }, (_, i) => `2026-${i + 1}`));
  const c = fakeClaims(taken);
  await assert.rejects(
    allocateBidNumber(2026, { random: () => 0.3, claim: c.claim }),
    (e: { code?: string }) => e.code === 'resource-exhausted',
  );
  assert.equal(new Set(c.attempts).size, 999);
  assert.equal(c.attempts.length, 999);
});

test('israelYear uses Israel time at the new-year boundary', () => {
  assert.equal(israelYear(Date.parse('2026-12-31T21:30:00Z')), 2026); // 23:30 IST
  assert.equal(israelYear(Date.parse('2026-12-31T22:30:00Z')), 2027); // 00:30 IST
  assert.equal(israelYear(Date.parse('2026-06-30T22:30:00Z')), 2026); // 01:30 IDT, same year
});
