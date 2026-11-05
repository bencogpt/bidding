// Which status changes a manager may ask for directly (transitionTender):  node --test functions/lib/test/manualTransitions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANUAL_TRANSITION_TARGETS, TENDER_TRANSITIONS, manualTransitionDenial, type TenderStatus } from '@obms/shared';

test('procurement sends, takes the send back, and publishes (v22 flow)', () => {
  const allowed: [TenderStatus, TenderStatus][] = [
    ['draft', 'internal_review'], // שליחה לאישור
    ['internal_review', 'draft'], // the send taken back
    ['ready', 'published'], // פרסום לספקים
  ];
  for (const [from, to] of allowed) assert.equal(manualTransitionDenial(from, to), null, `${from} → ${to}`);
});

test('the lock follows only from the final check, and a locked case goes back only by reopening', () => {
  assert.equal(manualTransitionDenial('internal_review', 'ready'), 'המעבר לפרסום לספקים קורה כשהבדיקה הסופית של הסוכן המפקח עוברת.');
  assert.equal(manualTransitionDenial('ready', 'draft'), 'חזרה לעריכה נעשית בפתיחה מחדש.');
});

test('responses, evaluated and awarded follow only from their own action', () => {
  assert.equal(manualTransitionDenial('evaluated', 'awarded'), 'הזכייה נקבעת בבחירת הספק הזוכה.', 'no winner, no award');
  assert.equal(manualTransitionDenial('responses', 'evaluated'), 'שלב ההערכה מתחיל בהרצת השוואת ההצעות.');
  assert.equal(manualTransitionDenial('published', 'responses'), 'שלב ההצעות מתחיל מעצמו עם ההגשה הראשונה של ספק.');
  assert.equal(manualTransitionDenial('evaluated', 'responses'), 'שלב ההצעות מתחיל מעצמו עם ההגשה הראשונה של ספק.');
});

test('every other edge of the state machine is refused', () => {
  const manual = new Set(['draft>internal_review', 'internal_review>draft', 'ready>published']);
  for (const [from, tos] of Object.entries(TENDER_TRANSITIONS) as [TenderStatus, TenderStatus[]][]) {
    for (const to of tos) {
      assert.equal(manualTransitionDenial(from, to) === null, manual.has(`${from}>${to}`), `${from} → ${to}`);
    }
  }
  assert.deepEqual([...MANUAL_TRANSITION_TARGETS], ['draft', 'internal_review', 'published']);
});

test('an illegal move names the statuses in Hebrew (UX 4.5); asking for the current status changes nothing', () => {
  assert.equal(manualTransitionDenial('draft', 'published'), 'מעבר סטטוס לא חוקי: טיוטה ← פורסם');
  assert.equal(manualTransitionDenial('published', 'internal_review'), 'מעבר סטטוס לא חוקי: פורסם ← נשלח לאישור');
  assert.equal(manualTransitionDenial('published', 'published'), null);
  assert.equal(manualTransitionDenial('awarded', 'awarded'), null);
});
