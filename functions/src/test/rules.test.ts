// Firestore Security Rules tests (constitution Gate 2). Run against the Firestore emulator:
//   firebase emulators:exec --only firestore "npm run test --workspace functions"
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rulesPath = resolve(here, '../../../firestore.rules');

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'biding-system',
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  // Seed a tender + an access grant for supplier "sup_a" using admin (bypasses rules).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenders/t1'), { id: 't1', title: 'T1', status: 'published' });
    // An unpublished tender the supplier somehow holds access to (defense in depth).
    await setDoc(doc(db, 'tenders/t2'), { id: 't2', title: 'T2', status: 'ready' });
    await setDoc(doc(db, 'tenders/t2/access/sup_a'), {
      principalId: 'sup_a',
      kind: 'supplier',
      level: 'view',
    });
    await setDoc(doc(db, 'tenders/t1/internal/provenance'), { templateType: 'goods' });
    await setDoc(doc(db, 'tenders/t1/supervision/r1'), { runId: 'r1', verdict: 'PASS' });
    await setDoc(doc(db, 'caseScores/t1'), { tenderId: 't1', total: 80 });
    await setDoc(doc(db, 'tenders/t1/access/sup_a'), {
      principalId: 'sup_a',
      kind: 'supplier',
      level: 'view',
    });
    // An anonymous question asked by sup_b, with its identity in the sibling collection.
    await setDoc(doc(db, 'tenders/t1/questions/qb'), {
      id: 'qb',
      text: 'שאלה של ספק ב',
      clusterId: null,
      answered: false,
      createdAt: 1,
    });
    await setDoc(doc(db, 'tenders/t1/questionAuthors/qb'), {
      questionId: 'qb',
      supplierId: 'sup_b',
      supplierName: 'ספק ב',
      createdAt: 1,
    });
    // ...and one asked by sup_a, who may resolve their own.
    await setDoc(doc(db, 'tenders/t1/questions/qa'), {
      id: 'qa',
      text: 'שאלה של ספק א',
      clusterId: null,
      answered: false,
      createdAt: 2,
    });
    await setDoc(doc(db, 'tenders/t1/questionAuthors/qa'), {
      questionId: 'qa',
      supplierId: 'sup_a',
      supplierName: 'ספק א',
      createdAt: 2,
    });
  });
});

after(async () => {
  await env?.cleanup();
});

const manager = () => env.authenticatedContext('mgr', { role: 'tender_manager' }).firestore();
const supplierA = () =>
  env.authenticatedContext('ua', { role: 'supplier', supplierId: 'sup_a' }).firestore();
const supplierB = () =>
  env.authenticatedContext('ub', { role: 'supplier', supplierId: 'sup_b' }).firestore();
// A non-manager internal role, to exercise the isInternal() branch rather than isManager().
const legal = () => env.authenticatedContext('ul', { role: 'legal' }).firestore();

test('unauthenticated cannot read a tender', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'tenders/t1')));
});

test('internal manager can read any tender', async () => {
  await assertSucceeds(getDoc(doc(manager(), 'tenders/t1')));
});

test('supplier WITH access can read the tender', async () => {
  await assertSucceeds(getDoc(doc(supplierA(), 'tenders/t1')));
});

test('supplier WITH access cannot read a tender before it is published', async () => {
  await assertFails(getDoc(doc(supplierA(), 'tenders/t2')));
});

test('supplier cannot read internal provenance or supervisor reports', async () => {
  await assertFails(getDoc(doc(supplierA(), 'tenders/t1/internal/provenance')));
  await assertFails(getDoc(doc(supplierA(), 'tenders/t1/supervision/r1')));
});

test('internal user can read provenance and supervisor reports; nobody writes them', async () => {
  await assertSucceeds(getDoc(doc(legal(), 'tenders/t1/internal/provenance')));
  await assertSucceeds(getDoc(doc(legal(), 'tenders/t1/supervision/r1')));
  await assertFails(setDoc(doc(manager(), 'tenders/t1/supervision/r2'), { verdict: 'PASS' }));
});

test('case scores are internal-only and function-written', async () => {
  await assertFails(getDoc(doc(supplierA(), 'caseScores/t1')));
  await assertSucceeds(getDoc(doc(legal(), 'caseScores/t1')));
  await assertFails(setDoc(doc(manager(), 'caseScores/t1'), { total: 100 }));
});

test('supplier WITHOUT access is denied (isolation)', async () => {
  await assertFails(getDoc(doc(supplierB(), 'tenders/t1')));
});

test('client cannot write tender status directly (function-only)', async () => {
  await assertFails(setDoc(doc(manager(), 'tenders/t1'), { status: 'published' }, { merge: true }));
});

// Questions are function-only now: client creation was the one path by which a supplier could
// write identity fields back into an anonymous question document.
test('supplier cannot create a question document directly (function-only)', async () => {
  await assertFails(
    setDoc(doc(supplierA(), 'tenders/t1/questions/q1'), {
      text: 'מה תנאי הסף?',
    }),
  );
});

test('authorized supplier reads a question and it carries NO asker identity', async () => {
  const snap = await assertSucceeds(getDoc(doc(supplierA(), 'tenders/t1/questions/qb')));
  const data = (snap as { data: () => Record<string, unknown> }).data();
  assert.equal(data.text, 'שאלה של ספק ב');
  assert.equal(data.supplierId, undefined, 'question must not expose supplierId');
  assert.equal(data.supplierName, undefined, 'question must not expose supplierName');
});

test('supplier CANNOT read another supplier\'s question author', async () => {
  await assertFails(getDoc(doc(supplierA(), 'tenders/t1/questionAuthors/qb')));
});

test('supplier CAN read the author record of their own question', async () => {
  await assertSucceeds(getDoc(doc(supplierA(), 'tenders/t1/questionAuthors/qa')));
});

test('internal user can read any question author', async () => {
  await assertSucceeds(getDoc(doc(legal(), 'tenders/t1/questionAuthors/qb')));
});
