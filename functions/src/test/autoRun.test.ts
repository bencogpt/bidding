// When the supervising agent starts by itself (plan B1):  node --test functions/lib/test/autoRun.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_RUN_GRACE_MS, autoRunOnCreate, autoRunPending, documentBecameReady } from '@obms/shared';

const NOW = 1_800_000_000_000;
const draft = (o = {}) => ({
  createdAt: NOW - 5_000,
  documentStatus: 'none' as const,
  googleDocId: null,
  docExportPath: null,
  lastSupervision: null,
  supervisionRun: null,
  ...o,
});

test('a new case is checked once', () => {
  assert.equal(autoRunOnCreate({ lastSupervision: null, supervisionRun: null }), true);
  assert.equal(autoRunOnCreate({ lastSupervision: { at: 1 } }), false, 'already checked (event redelivery)');
  assert.equal(autoRunOnCreate({ supervisionRun: { state: 'running' } }), false, 'a run is going');
});

test('the document is checked in the update where it became ready', () => {
  assert.equal(documentBecameReady({ documentStatus: 'generating' }, { documentStatus: 'generated' }), true);
  assert.equal(documentBecameReady({ documentStatus: 'generated' }, { documentStatus: 'generated' }), false, 'any later update');
  assert.equal(documentBecameReady({ documentStatus: 'none' }, { documentStatus: 'generating' }), false);
});

test('the browser shows the agent starting until the server claims the run', () => {
  assert.equal(autoRunPending(draft(), NOW), true, 'a new draft, never checked');
  assert.equal(autoRunPending(draft({ createdAt: NOW - AUTO_RUN_GRACE_MS - 1 }), NOW), false, 'grace over: the run failed');
  assert.equal(autoRunPending(draft({ lastSupervision: { at: NOW - 1000, basis: 'draft' } }), NOW), false, 'checked');
  assert.equal(autoRunPending(draft({ supervisionRun: { state: 'running' } }), NOW), false, "the server's own state shows it");
  const doc = draft({
    documentStatus: 'generated',
    documentGeneratedAt: NOW - 3_000,
    lastSupervision: { at: NOW - 60_000, basis: 'draft' },
  });
  assert.equal(autoRunPending(doc, NOW), true, 'a document created after the last check');
  assert.equal(autoRunPending({ ...doc, lastSupervision: { at: NOW - 1000, basis: 'document' as const } }, NOW), false, 'the document was checked');
  assert.equal(autoRunPending({ ...doc, documentGeneratedAt: NOW - AUTO_RUN_GRACE_MS - 1 }, NOW), false);
});
