// Unit tests for the bid number (no network):  node --test functions/lib/test/bidNumber.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBidNumber, BID_NUMBER_MAX, createBidRequestInput, createTenderInput } from '@obms/shared';

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
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי אבטחה לאתר' }).success);
  assert.equal(createBidRequestInput.safeParse({ brief: '   ' }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'ab' }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'x'.repeat(5001) }).success, false);
});

test('createTenderInput requires a well-formed bidRequestId', () => {
  const base = { type: 'service', params: {} };
  assert.equal(createTenderInput.safeParse(base).success, false);
  assert.equal(createTenderInput.safeParse({ ...base, bidRequestId: 'BID-2026-0042' }).success, false);
  assert.ok(createTenderInput.safeParse({ ...base, bidRequestId: '2026-31' }).success);
});
