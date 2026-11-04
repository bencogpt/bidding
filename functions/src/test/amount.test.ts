// Reading an amount of shekels out of what a person typed (pure):  node --test functions/lib/test/amount.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, detectAmount } from '@obms/shared';

test('parseAmount reads the ways people write a sum', () => {
  const cases: [string, number][] = [
    ['1,200,000', 1200000],
    ['1200000', 1200000],
    ['₪300000', 300000],
    ['עד 240,000 ש"ח', 240000],
    ['240.000', 240000],
    ['1.2 מיליון', 1200000],
    ['2 מיליון', 2000000],
    ['מיליון', 1000000],
    ['חצי מיליון', 500000],
    ['500 אלף', 500000],
    ['כ-750 אלף שקלים', 750000],
  ];
  for (const [text, n] of cases) assert.equal(parseAmount(text), n, text);
});

test('parseAmount gives 0 when there is no amount', () => {
  for (const text of ['', '   ', 'abc', 'הרבה כסף', '-']) assert.equal(parseAmount(text), 0, JSON.stringify(text));
});

test('detectAmount finds a sum in free text only when it carries a unit, and ignores head counts', () => {
  assert.equal(detectAmount('עד 1.2 מיליון ש"ח, 3 שנים'), 1200000);
  assert.equal(detectAmount('תקציב של 300 אלף ₪'), 300000);
  assert.equal(detectAmount('חצי מיליון'), 500000);
  assert.equal(detectAmount('צוות של 12 נותני שירות ל-3 שנים'), 0);
  assert.equal(detectAmount('זמינות 99.9%'), 0);
  assert.equal(detectAmount(''), 0);
});
