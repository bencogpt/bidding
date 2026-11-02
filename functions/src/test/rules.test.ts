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
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

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
    // Case team of t1: the manager (owner) and legal 'ul'. Finance 'uf' is NOT on the team.
    await setDoc(doc(db, 'tenders/t1'), {
      id: 't1',
      title: 'T1',
      status: 'published',
      createdAt: 1,
      memberUids: ['mgr', 'ul'],
    });
    await setDoc(doc(db, 'tenders/t1/access/ul'), { principalId: 'ul', kind: 'internal', level: 'comment' });
    await setDoc(doc(db, 'bidRequests/2026-31'), { serial: '2026-31', brief: 'א', requesterUid: 'ur', status: 'open' });
    await setDoc(doc(db, 'bidRequests/2026-32'), { serial: '2026-32', brief: 'ב', requesterUid: 'other', status: 'open' });
    await setDoc(doc(db, 'auditLog/a1'),{ id: 'a1', tenderId: 't1', action: 'create', at: 1 });
    await setDoc(doc(db, 'tenders/t1/chat/m0'), { id: 'm0', uid: 'mgr', name: 'M', role: 'tender_manager', text: 'שלום', createdAt: 1 });
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
    await setDoc(doc(db, 'feedbackRequests/t1_publish_ul'), { uid: 'ul', tenderId: 't1', status: 'pending' });
    await setDoc(doc(db, 'tenders/t1/feedback/publish_ul'), { uid: 'ul', tenderId: 't1', ratings: { clarity: 4 } });
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
const requester = () => env.authenticatedContext('ur', { role: 'requester' }).firestore();

test('requester reads only their own bid requests', async () => {
  await assertSucceeds(getDoc(doc(requester(), 'bidRequests/2026-31')));
  await assertFails(getDoc(doc(requester(), 'bidRequests/2026-32')));
  await assertSucceeds(getDocs(query(collection(requester(), 'bidRequests'), where('requesterUid', '==', 'ur'))));
  await assertFails(getDocs(collection(requester(), 'bidRequests')));
});

test('manager reads every bid request; nobody writes from the client', async () => {
  await assertSucceeds(getDoc(doc(manager(), 'bidRequests/2026-32')));
  await assertFails(setDoc(doc(requester(), 'bidRequests/2026-99'), { serial: '2026-99', requesterUid: 'ur' }));
  await assertFails(setDoc(doc(manager(), 'bidRequests/2026-99'), { serial: '2026-99' }));
  await assertFails(getDoc(doc(supplierA(), 'bidRequests/2026-31')));
});
// A non-manager internal role, to exercise the isInternal() branch rather than isManager().
const legal = () => env.authenticatedContext('ul', { role: 'legal' }).firestore();
// An internal user who is NOT on t1's team.
const finance = () => env.authenticatedContext('uf', { role: 'finance' }).firestore();

test('strict teams: an unassigned internal user sees nothing of the case', async () => {
  const f = finance();
  await assertFails(getDoc(doc(f, 'tenders/t1')));
  await assertFails(getDoc(doc(f, 'tenders/t1/internal/provenance')));
  await assertFails(getDoc(doc(f, 'tenders/t1/supervision/r1')));
  await assertFails(getDoc(doc(f, 'tenders/t1/questions/qb')));
  await assertFails(getDoc(doc(f, 'tenders/t1/questionAuthors/qb')));
  await assertFails(getDoc(doc(f, 'caseScores/t1')));
  await assertFails(getDoc(doc(f, 'tenders/t1/chat/m0')));
  await assertFails(getDocs(query(collection(f, 'auditLog'), where('tenderId', '==', 't1'))));
});

test('strict teams: list queries are scoped to the user\'s cases', async () => {
  const mine = await assertSucceeds(getDocs(query(collection(legal(), 'tenders'), where('memberUids', 'array-contains', 'ul'))));
  assert.equal((mine as { size: number }).size, 1);
  const none = await assertSucceeds(getDocs(query(collection(finance(), 'tenders'), where('memberUids', 'array-contains', 'uf'))));
  assert.equal((none as { size: number }).size, 0);
  await assertFails(getDocs(collection(finance(), 'tenders'))); // unscoped list is denied
  await assertSucceeds(getDocs(collection(manager(), 'tenders'))); // managers see every case
  await assertSucceeds(getDocs(query(collection(legal(), 'auditLog'), where('tenderId', '==', 't1'))));
  await assertFails(getDocs(collection(legal(), 'auditLog'))); // not the whole log
  await assertSucceeds(getDocs(query(collectionGroup(legal(), 'access'), where('principalId', '==', 'ul'))));
  await assertFails(getDocs(collectionGroup(legal(), 'access')));
});

test('chat: members read and post with enforced identity + server time; immutable; no suppliers', async () => {
  await assertSucceeds(getDoc(doc(legal(), 'tenders/t1/chat/m0')));
  await assertSucceeds(getDoc(doc(manager(), 'tenders/t1/chat/m0')));
  await assertFails(getDoc(doc(supplierA(), 'tenders/t1/chat/m0')));
  const msg = (over: Record<string, unknown>) => ({
    id: 'm1', uid: 'ul', name: 'עו"ד', role: 'legal', text: 'נבדק', createdAt: serverTimestamp(), ...over,
  });
  await assertSucceeds(setDoc(doc(legal(), 'tenders/t1/chat/m1'), msg({})));
  await assertFails(setDoc(doc(legal(), 'tenders/t1/chat/m2'), msg({ id: 'm2', uid: 'mgr' }))); // impersonation
  await assertFails(setDoc(doc(legal(), 'tenders/t1/chat/m3'), msg({ id: 'm3', createdAt: 5 }))); // client time
  await assertFails(setDoc(doc(legal(), 'tenders/t1/chat/m4'), msg({ id: 'm4', role: 'tender_manager' })));
  await assertFails(setDoc(doc(legal(), 'tenders/t1/chat/m5'), msg({ id: 'm5', text: '' })));
  await assertFails(setDoc(doc(finance(), 'tenders/t1/chat/m6'), msg({ id: 'm6', uid: 'uf', role: 'finance' })));
  await assertFails(setDoc(doc(legal(), 'tenders/t1/chat/m1'), msg({ text: 'נערך' }))); // no edits
  await assertSucceeds(setDoc(doc(legal(), 'tenders/t1/chatReads/ul'), { lastReadAt: serverTimestamp() }));
  await assertFails(setDoc(doc(legal(), 'tenders/t1/chatReads/mgr'), { lastReadAt: serverTimestamp() }));
});

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

test('feedback: owner and managers read; other internal users and suppliers do not; no client writes', async () => {
  const finance = env.authenticatedContext('uf', { role: 'finance' }).firestore();
  await assertSucceeds(getDoc(doc(legal(), 'feedbackRequests/t1_publish_ul')));
  await assertSucceeds(getDoc(doc(legal(), 'tenders/t1/feedback/publish_ul')));
  await assertSucceeds(getDoc(doc(manager(), 'tenders/t1/feedback/publish_ul')));
  await assertFails(getDoc(doc(finance, 'feedbackRequests/t1_publish_ul')));
  await assertFails(getDoc(doc(finance, 'tenders/t1/feedback/publish_ul')));
  await assertFails(getDoc(doc(supplierA(), 'tenders/t1/feedback/publish_ul')));
  await assertFails(setDoc(doc(legal(), 'tenders/t1/feedback/publish_ul'), { ratings: { clarity: 5 } }));
  await assertFails(setDoc(doc(legal(), 'feedbackRequests/t1_publish_ul'), { status: 'done' }, { merge: true }));
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
