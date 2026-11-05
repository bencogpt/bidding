// Which status changes a manager may ask for directly (transitionTender):  node --test functions/lib/test/manualTransitions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANUAL_TRANSITION_TARGETS, TENDER_TRANSITIONS, manualTransitionDenial, type TenderStatus } from '@obms/shared';

test('the workflow up to publication is the manager’s to move', () => {
  const allowed: [TenderStatus, TenderStatus][] = [
    ['draft', 'ready'],
    ['draft', 'internal_review'],
    ['internal_review', 'ready'],
    ['internal_review', 'draft'],
    ['ready', 'published'],
    ['ready', 'internal_review'],
  ];
  for (const [from, to] of allowed) assert.equal(manualTransitionDenial(from, to), null, `${from} → ${to}`);
});

test('responses, evaluated and awarded follow only from their own action', () => {
  assert.equal(manualTransitionDenial('evaluated', 'awarded'), 'הזכייה נקבעת בבחירת הספק הזוכה.', 'no winner, no award');
  assert.equal(manualTransitionDenial('responses', 'evaluated'), 'שלב ההערכה מתחיל בהרצת השוואת ההצעות.');
  assert.equal(manualTransitionDenial('published', 'responses'), 'שלב ההצעות מתחיל מעצמו עם ההגשה הראשונה של ספק.');
  // Even the backward edge after the comparison is not a manual move.
  assert.equal(manualTransitionDenial('evaluated', 'responses'), 'שלב ההצעות מתחיל מעצמו עם ההגשה הראשונה של ספק.');
});

test('every post-publication edge of the state machine is refused', () => {
  for (const [from, tos] of Object.entries(TENDER_TRANSITIONS) as [TenderStatus, TenderStatus[]][]) {
    for (const to of tos) {
      const manual = MANUAL_TRANSITION_TARGETS.includes(to);
      assert.equal(manualTransitionDenial(from, to) === null, manual, `${from} → ${to}`);
    }
  }
});

test('an illegal move is still refused, and asking for the current status changes nothing', () => {
  assert.equal(manualTransitionDenial('draft', 'published'), 'מעבר סטטוס לא חוקי: draft → published');
  assert.equal(manualTransitionDenial('published', 'draft'), 'מעבר סטטוס לא חוקי: published → draft');
  assert.equal(manualTransitionDenial('published', 'published'), null);
  assert.equal(manualTransitionDenial('awarded', 'awarded'), null);
});
