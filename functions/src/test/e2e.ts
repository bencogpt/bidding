// End-to-end smoke test of the vertical slice against the Emulator Suite.
// Run via:  firebase emulators:exec --only auth,firestore,functions,storage \
//             "npm run seed && node functions/lib/test/e2e.js"
import assert from 'node:assert/strict';
import { REQUIRE_APPROVALS } from '@obms/shared';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  query,
  where,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { SKILL_IDS } from '@obms/shared';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getStorage as adminStorage } from 'firebase-admin/storage';

const app = initializeApp({ projectId: 'biding-system', apiKey: 'demo' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const fns = getFunctions(app, 'europe-west1');
connectFunctionsEmulator(fns, '127.0.0.1', 5001);

const adminApp = initAdmin({ projectId: 'biding-system', storageBucket: 'biding-system.firebasestorage.app' }, 'e2e-admin');
const call = (n: string) => httpsCallable(fns, n);
const login = (email: string) => signInWithEmailAndPassword(auth, email, 'password');
// The requester's mandatory phase-1 answers.
const REQUEST_DETAILS = { service_name: 'שירות לבדיקה', document_classification: 'בלמ"ס', annual_budget: 240000, contract_years: 2 };
const newRequest = async (brief = 'דרישה לבדיקה'): Promise<string> =>
  ((await call('createBidRequest')({ brief, details: REQUEST_DETAILS })) as { data: { serial: string } }).data.serial;

// Each given role signs off the tender in review, then the manager is signed back in.
async function approveAs(tenderId: string, roles: string[]) {
  for (const role of roles) {
    await signOut(auth);
    await login(role + '@obms.test');
    await call('approveTender')({ tenderId, approve: true });
  }
  await signOut(auth);
  await login('manager@obms.test');
}

async function main() {
  // ---- manager creates a goods tender ----
  await login('manager@obms.test');
  const users = await getDocs(collection(db, 'users'));
  const uidOf = (role: string) => users.docs.find((d) => d.data().role === role)!.id;
  const legalUid = uidOf('legal');
  const goodsTeam = { requester: uidOf('requester'), legal: legalUid, finance: uidOf('finance') };

  const created = (await call('createTender')({
    title: 'מכרז טובין לבדיקה',
    bidRequestId: await newRequest(),
    type: 'goods',
    params: { org: 'משרד הביטחון', description: 'מצלמות אבטחה', quantity: 10, budget: 500000 },
    team: goodsTeam,
  })) as { data: { id: string; serial: string } };
  const tenderId = created.data.id;
  assert.ok(tenderId, 'tender id returned');
  assert.match(created.data.serial, /^\d{4}-\d{1,3}$/, 'bid number assigned');

  // A team slot only accepts a user with exactly that role.
  let wrongRole = false;
  const wrongRoleReq = await newRequest();
  try {
    await call('createTender')({
      title: 'x',
      bidRequestId: wrongRoleReq,
      type: 'goods',
      params: { org: 'o', description: 'd', quantity: 1 },
      team: { legal: uidOf('finance') },
    });
  } catch {
    wrongRole = true;
  }
  assert.ok(wrongRole, 'a finance user cannot fill the legal slot');
  assert.equal((await getDoc(doc(db, 'bidRequests', wrongRoleReq))).data()?.status, 'open', 'a failed create leaves its request open');

  const tdoc = await getDoc(doc(db, 'tenders', tenderId));
  assert.ok(tdoc.exists(), 'tender doc persisted');
  assert.equal(tdoc.data()!.status, 'draft');

  // Strict assignment: only the owner and the case team get access — security is not on it.
  const managerUid = auth.currentUser!.uid;
  const accessSnap = await getDocs(collection(db, 'tenders', tenderId, 'access'));
  const accessByPrincipal = new Map(accessSnap.docs.map((d) => [d.id, d.data()]));
  assert.deepEqual(
    [...accessByPrincipal.keys()].sort(),
    [managerUid, ...Object.values(goodsTeam)].sort(),
    'access = owner + team only',
  );
  assert.deepEqual(
    [...tdoc.data()!.memberUids].sort(),
    [managerUid, ...Object.values(goodsTeam)].sort(),
    'memberUids = owner + team',
  );

  // Only the tender manager may hold 'edit' — this is what keeps "only the bid manager accepts
  // changes" true, since Docs writer (= can accept suggestions) is derived from this role split.
  const roleByUid = new Map(users.docs.map((d) => [d.id, d.data().role]));
  for (const [principalId, a] of accessByPrincipal) {
    if (a.kind !== 'internal') continue;
    if (a.level === 'edit') {
      assert.equal(
        roleByUid.get(principalId) ?? 'tender_manager',
        'tender_manager',
        `only a tender_manager may have edit access (offender: ${principalId})`,
      );
    }
  }
  console.log(`✓ ${created.data.serial}: team-only access; edit access limited to the manager`);

  // An unassigned internal user (security) can't see the case at all.
  await signOut(auth);
  await login('security@obms.test');
  let secDenied = false;
  try {
    await getDoc(doc(db, 'tenders', tenderId));
  } catch {
    secDenied = true;
  }
  assert.ok(secDenied, 'unassigned user cannot read the tender');
  let secDocDenied = false;
  try {
    await call('getTenderDocument')({ tenderId });
  } catch {
    secDocDenied = true;
  }
  assert.ok(secDocDenied, 'unassigned user cannot open the document');
  const secList = await getDocs(
    query(collection(db, 'tenders'), where('memberUids', 'array-contains', auth.currentUser!.uid)),
  );
  assert.ok(!secList.docs.some((d) => d.id === tenderId), 'case not in the unassigned user\'s list');

  // A team member posts in the case chat (server time enforced by rules).
  await signOut(auth);
  await login('legal@obms.test');
  await setDoc(doc(db, 'tenders', tenderId, 'chat', 'e2e-msg-1'), {
    id: 'e2e-msg-1',
    uid: auth.currentUser!.uid,
    name: 'יועץ משפטי',
    role: 'legal',
    text: 'בדקתי את סעיף האחריות.',
    createdAt: serverTimestamp(),
  });
  await signOut(auth);
  await login('manager@obms.test');
  const chat = await getDocs(collection(db, 'tenders', tenderId, 'chat'));
  assert.equal(chat.size, 1, 'manager reads the team chat');
  console.log('✓ unassigned user sees nothing; team chat works');

  // ---- supervisor: provenance, confidentiality, publish gate ----
  assert.equal(tdoc.data()!.params.budget, undefined, 'estimate is not on the supplier-readable tender');
  const internalParams = await getDoc(doc(db, 'tenders', tenderId, 'internal', 'params'));
  assert.equal(internalParams.data()?.budget, 500000, 'estimate kept in internal params (G6)');
  const prov = await getDoc(doc(db, 'tenders', tenderId, 'internal', 'provenance'));
  assert.equal(prov.data()?.templateType, 'goods', 'provenance records the template used');
  assert.equal(prov.data()?.templateId, 'T-A');
  // Creation is fast; the case page starts the first supervisor check right after.
  await call('runSupervision')({ tenderId, initial: true });
  const createdRuns = await getDocs(collection(db, 'tenders', tenderId, 'supervision'));
  assert.equal(createdRuns.size, 1, 'initial supervisor check ran');
  const again = (await call('runSupervision')({ tenderId, initial: true })) as { data: { skipped?: boolean } };
  assert.equal(again.data.skipped, true, 'a second "initial" check (another tab) is skipped');

  let earlyShareDenied = false;
  try {
    await call('grantAccess')({ tenderId, supplierIds: ['sup_aegis'], internalUids: [] });
  } catch {
    earlyShareDenied = true;
  }
  assert.ok(earlyShareDenied, 'suppliers cannot be granted access before publication');

  // Draft-first: the case has no document until the manager creates it after a clean check.
  assert.equal(tdoc.data()!.documentStatus, 'none', 'a new case is a draft without a document');
  let noDocReview = false;
  try {
    await call('transitionTender')({ tenderId, to: 'internal_review' });
  } catch (e) {
    noDocReview = /יש ליצור את מסמך המכרז/.test((e as Error).message);
  }
  assert.ok(noDocReview, 'review is refused before the document exists');
  await call('generateDocument')({ tenderId });
  const generated = (await getDoc(doc(db, 'tenders', tenderId))).data()!;
  assert.equal(generated.documentStatus, 'generated');
  assert.ok(generated.docExportPath, 'document created after the inspector passed the draft');
  let twice = false;
  try {
    await call('generateDocument')({ tenderId });
  } catch {
    twice = true;
  }
  assert.ok(twice, 'the document is created only once');
  console.log('✓ draft-first: document created only after the inspector checked the draft');

  await call('transitionTender')({ tenderId, to: 'internal_review' });
  // With REQUIRE_APPROVALS off, an early "ready" would succeed and end the review round —
  // so only probe the refusal when the gate is on. The approvals themselves are always exercised.
  if (REQUIRE_APPROVALS) {
    let notApproved = false;
    try {
      await call('transitionTender')({ tenderId, to: 'ready' });
    } catch (e) {
      notApproved = /ממתין לאישור/.test((e as Error).message);
    }
    assert.ok(notApproved, 'final approval is refused until every role has approved');
  }
  await approveAs(tenderId, ['requester', 'legal', 'finance']);
  const approved = (await getDoc(doc(db, 'tenders', tenderId))).data()!.approvals ?? {};
  assert.deepEqual(Object.keys(approved).sort(), ['finance', 'legal', 'requester'], 'each role recorded its approval');
  await call('transitionTender')({ tenderId, to: 'ready' });
  const published = (await call('transitionTender')({ tenderId, to: 'published' })) as {
    data: { verdict: string };
  };
  assert.notEqual(published.data.verdict, 'BLOCK', 'clean tender passes the supervisor gate');
  assert.equal((await getDoc(doc(db, 'tenders', tenderId))).data()!.status, 'published');
  console.log(`✓ supervisor: provenance + G6 split + gate passed (${published.data.verdict})`);

  // A document with an unfilled placeholder is blocked; an audited override lets it through.
  // The optional "milestones" field is left empty, so {{milestones}} stays in the document.
  const bad = (await call('createTender')({
    title: 'מכרז עם חוסר',
    bidRequestId: await newRequest(),
    type: 'project',
    params: { org: 'משרד הביטחון', scope: 'הקמת מערכת מצלמות', service: 'תחזוקה שנתית' },
    team: { requester: goodsTeam.requester, legal: legalUid }, // finance + security slots left empty
  })) as { data: { id: string; serial: string; verdict: string | null; missingRoles: string[] } };
  const badCheck = (await call('runSupervision')({ tenderId: bad.data.id, initial: true })) as { data: { verdict: string } };
  assert.equal(badCheck.data.verdict, 'BLOCK', 'supervisor flags the leftover placeholder in the draft');
  assert.deepEqual(bad.data.missingRoles, ['finance', 'security']);
  const refusedWith = async (re: RegExp) => {
    try {
      await call('generateDocument')({ tenderId: bad.data.id });
    } catch (e) {
      return re.test((e as Error).message);
    }
    return false;
  };
  assert.ok(await refusedWith(/חוסמים/), 'no document while the inspector blocks the draft (no override)');
  const edited = (await call('updateTenderDraft')({
    tenderId: bad.data.id,
    params: { milestones: 'אבן דרך 1: תכנון; אבן דרך 2: התקנה' },
  })) as { data: { changed: string[] } };
  assert.deepEqual(edited.data.changed, ['milestones'], 'only the edited field changed');
  assert.ok(await refusedWith(/השתנתה/), 'a check of older draft data does not open the gate');
  const recheck = (await call('runSupervision')({ tenderId: bad.data.id })) as { data: { verdict: string } };
  assert.notEqual(recheck.data.verdict, 'BLOCK', 'the fixed draft passes the inspector');
  await call('generateDocument')({ tenderId: bad.data.id });
  console.log('✓ draft-first: blocked draft fixed in the app, rechecked, then its document created');
  // Simulate a later manual edit that leaves a placeholder in the document (dev mode keeps HTML in Storage).
  const docFile = adminStorage(adminApp).bucket('biding-system.firebasestorage.app').file(`tenders/${bad.data.id}/document.html`);
  const [html] = await docFile.download();
  await docFile.save(html.toString('utf8').replace('</body>', '<p>{{milestones_appendix}}</p></body>'), {
    contentType: 'text/html',
  });
  let gateRefused = false;
  try {
    await call('transitionTender')({ tenderId: bad.data.id, to: 'internal_review' });
  } catch (e) {
    gateRefused = /יש לשבץ/.test((e as Error).message);
  }
  assert.ok(gateRefused, 'review is refused while a required role is empty');
  await call('assignTeamMember')({ tenderId: bad.data.id, role: 'finance', uid: goodsTeam.finance });
  await call('assignTeamMember')({ tenderId: bad.data.id, role: 'security', uid: uidOf('security') });
  await call('transitionTender')({ tenderId: bad.data.id, to: 'internal_review' });
  console.log('✓ review gate: refused with an empty slot, passes once the team is complete');
  await approveAs(bad.data.id, ['requester', 'legal', 'finance', 'security']);
  await call('transitionTender')({ tenderId: bad.data.id, to: 'ready' });
  let blocked = false;
  try {
    await call('transitionTender')({ tenderId: bad.data.id, to: 'published' });
  } catch (e) {
    blocked = /הסוכן המפקח/.test((e as Error).message);
  }
  assert.ok(blocked, 'publish is refused while the supervisor verdict is BLOCK');
  assert.equal((await getDoc(doc(db, 'tenders', bad.data.id))).data()!.status, 'ready');
  await call('transitionTender')({
    tenderId: bad.data.id,
    to: 'published',
    overrideReason: 'אישור חריג לצורך בדיקה אוטומטית',
  });
  const overrideAudit = await getDocs(
    query(collection(db, 'auditLog'), where('tenderId', '==', bad.data.id)),
  );
  assert.ok(
    overrideAudit.docs.some((d) => d.data().action === 'supervisor_override'),
    'override is audited',
  );
  console.log('✓ supervisor: placeholder blocks publish; manager override is audited');

  // Requirement research runs in the background when a request is opened (no AI key in the
  // emulator, so it records 'skipped'); its results are readable by managers only via rules.
  const researched = await newRequest('מצלמות אבטחה לחניון');
  let research: { status?: string; runId?: string | null } | undefined;
  for (let i = 0; i < 40 && !(research?.status && research.status !== 'running'); i++) {
    await new Promise((r) => setTimeout(r, 250));
    research = (await getDoc(doc(db, 'bidRequests', researched))).data()?.research;
  }
  assert.equal(research?.status, 'skipped', 'research trigger ran on the new request');
  const runs = await getDocs(collection(db, 'bidRequests', researched, 'research'));
  assert.equal(runs.size, 1, 'the research run is recorded');
  await call('rerunRequestResearch')({ serial: researched });
  assert.equal((await getDocs(collection(db, 'bidRequests', researched, 'research'))).size, 2, 'rerun recorded');
  console.log('✓ request research: background trigger + rerun recorded');

  // Research on the summary step (before sending) is linked to the request — not searched again.
  const draftRun = (await call('researchDraftRequest')({ brief: 'שירותי ניקיון למשרדים', details: { service_name: 'ניקיון' } })) as {
    data: { runId: string; status: string };
  };
  assert.equal(draftRun.data.status, 'skipped', 'no AI in the emulator');
  const linked = ((await call('createBidRequest')({
    brief: 'שירותי ניקיון למשרדים',
    details: REQUEST_DETAILS,
    researchRunId: draftRun.data.runId,
  })) as { data: { serial: string } }).data.serial;
  const linkedReq = (await getDoc(doc(db, 'bidRequests', linked))).data()!;
  assert.equal(linkedReq.research?.runId, draftRun.data.runId, 'the summary-step run is on the request');
  await new Promise((r) => setTimeout(r, 2000)); // give the trigger time to (not) run
  const linkedRuns = await getDocs(collection(db, 'bidRequests', linked, 'research'));
  assert.deepEqual(linkedRuns.docs.map((d) => d.id), [draftRun.data.runId], 'searched once, not again after sending');
  // Someone else's run is not linked: that request is researched after sending as usual.
  await signOut(auth);
  await login('requester@obms.test');
  const other = ((await call('createBidRequest')({
    brief: 'שירותי ניקיון למשרדים',
    details: REQUEST_DETAILS,
    researchRunId: draftRun.data.runId,
  })) as { data: { serial: string } }).data.serial;
  await signOut(auth);
  await login('manager@obms.test');
  const otherReq = (await getDoc(doc(db, 'bidRequests', other))).data()!;
  assert.notEqual(otherReq.research?.runId, draftRun.data.runId, "another user's run is not linked");
  console.log('✓ summary-step web research linked to the request; no second search');

  // Internal users can no longer be granted ad hoc — only through the team.
  let adHocRefused = false;
  try {
    await call('grantAccess')({ tenderId, supplierIds: [], internalUids: [uidOf('security')] });
  } catch {
    adHocRefused = true;
  }
  assert.ok(adHocRefused, 'ad-hoc internal grants are refused');
  await call('grantAccess')({ tenderId, supplierIds: ['sup_aegis'], internalUids: [] });
  console.log('✓ manager published tender + shared with aegis');

  // Removing legal from a case revokes their access to it.
  await call('assignTeamMember')({ tenderId: bad.data.id, role: 'legal', uid: null });
  await signOut(auth);
  await login('legal@obms.test');
  let revoked = false;
  try {
    await getDoc(doc(db, 'tenders', bad.data.id));
  } catch {
    revoked = true;
  }
  assert.ok(revoked, 'unassigned legal loses access to the case');
  await signOut(auth);
  await login('manager@obms.test');
  console.log('✓ unassigning a team member revokes their access');

  // ---- supplier aegis: sees doc, asks a question ----
  await signOut(auth);
  await login('a@aegis.test');
  const view = (await call('getTenderDocument')({ tenderId })) as {
    data: { kind: string; content?: string };
  };
  assert.equal(view.data.kind, 'html');
  assert.ok((view.data.content ?? '').includes('מצלמות'), 'doc rendered with filled params');
  await call('askQuestion')({ tenderId, text: 'מהו תקן ההגנה הנדרש למצלמות חוץ?' });
  assert.ok((await getDoc(doc(db, 'tenders', tenderId))).exists(), 'aegis can read shared tender');
  console.log('✓ supplier aegis viewed in-system doc + asked a question');

  // ---- isolation: meridian was NOT shared ----
  await signOut(auth);
  await login('b@meridian.test');
  const shared = await getDocs(
    query(collectionGroup(db, 'access'), where('principalId', '==', 'sup_meridian')),
  );
  assert.equal(shared.size, 0, 'meridian sees no shared tenders');
  let denied = false;
  try {
    await getDoc(doc(db, 'tenders', tenderId));
  } catch {
    denied = true;
  }
  assert.ok(denied, 'meridian read of the tender is denied by rules');
  console.log('✓ isolation: meridian sees nothing and is denied direct read');

  // ---- anonymity: a second authorized supplier sees the question but not who asked ----
  await signOut(auth);
  await login('manager@obms.test');
  await call('grantAccess')({ tenderId, supplierIds: ['sup_meridian'], internalUids: [] });
  await signOut(auth);
  await login('b@meridian.test');
  const asSeenByPeer = await getDocs(collection(db, 'tenders', tenderId, 'questions'));
  assert.ok(asSeenByPeer.size >= 1, 'peer supplier sees the clarification question');
  for (const d of asSeenByPeer.docs) {
    const data = d.data();
    assert.equal(data.supplierId, undefined, 'question must not expose supplierId to a peer');
    assert.equal(data.supplierName, undefined, 'question must not expose supplierName to a peer');
  }
  // ...and cannot reach the identity through the sibling collection either.
  let authorDenied = false;
  try {
    await getDocs(collection(db, 'tenders', tenderId, 'questionAuthors'));
  } catch {
    authorDenied = true;
  }
  assert.ok(authorDenied, 'peer supplier cannot list question authors');
  console.log('✓ anonymity: peer sees the question, not the asker');

  // ---- manager clusters + answers ----
  await signOut(auth);
  await login('manager@obms.test');
  // The manager CAN still resolve who asked — accountability is preserved.
  const authors = await getDocs(collection(db, 'tenders', tenderId, 'questionAuthors'));
  assert.ok(authors.size >= 1, 'manager can resolve question authors');
  assert.ok(authors.docs[0].data().supplierName, 'author record carries the supplier name');
  console.log('✓ manager can still resolve the asker');
  const clustered = (await call('clusterTenderQuestions')({ tenderId })) as {
    data: { clusters: { clusterId: string; questionIds: string[] }[] };
  };
  assert.ok(clustered.data.clusters.length >= 1, 'at least one cluster');
  const c0 = clustered.data.clusters[0];
  await call('answerQuestions')({
    tenderId,
    clusterId: c0.clusterId,
    questionIds: c0.questionIds,
    text: 'נדרש תקן IP66 ליחידות חוץ.',
  });
  assert.ok(
    (await getDocs(collection(db, 'tenders', tenderId, 'answers'))).size >= 1,
    'answer persisted',
  );
  console.log('✓ manager clustered questions + published an answer');

  // ---- authorized supplier sees the answer ----
  await signOut(auth);
  await login('a@aegis.test');
  assert.ok(
    (await getDocs(collection(db, 'tenders', tenderId, 'answers'))).size >= 1,
    'authorized supplier sees the answer',
  );
  console.log('✓ supplier aegis sees the manager answer');

  // ---- manager: define a new supplier + create its login ----
  await signOut(auth);
  await login('manager@obms.test');
  const sup = (await call('upsertSupplier')({
    name: 'ספק בדיקה',
    contactEmail: 'newsup@obms.test',
    country: 'IL',
    isIsraeli: true,
    status: 'active',
  })) as { data: { id: string } };
  const acct = (await call('createSupplierAccount')({ supplierId: sup.data.id })) as {
    data: { email: string; tempPassword: string | null };
  };
  assert.ok(acct.data.tempPassword, 'temp password issued for the new account');
  await signOut(auth);
  await signInWithEmailAndPassword(auth, acct.data.email, acct.data.tempPassword!);
  const claims = (await auth.currentUser!.getIdTokenResult()).claims;
  assert.equal(claims.role, 'supplier');
  assert.equal(claims.supplierId, sup.data.id);
  console.log('✓ manager defined a supplier + login; new supplier signs in with supplier claim');

  // ---- internal user: create + sign in with role + delete ----
  await signOut(auth);
  await login('manager@obms.test');
  const iu = (await call('createInternalUser')({
    name: 'עו״ד חדש',
    email: 'legal2@obms.test',
    role: 'legal',
  })) as { data: { tempPassword: string | null } };
  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'legal2@obms.test', iu.data.tempPassword!);
  assert.equal((await auth.currentUser!.getIdTokenResult()).claims.role, 'legal', 'internal role claim set');
  await signOut(auth);
  await login('manager@obms.test');
  const legal2 = (await getDocs(collection(db, 'users'))).docs.find(
    (d) => d.data().email === 'legal2@obms.test',
  );
  await call('deleteInternalUser')({ uid: legal2!.id });
  const gone = (await getDocs(collection(db, 'users'))).docs.some(
    (d) => d.data().email === 'legal2@obms.test',
  );
  assert.ok(!gone, 'internal user removed');
  // A bid manager must be defined with a phone (it fills BID_MANAGER_PHONE in documents).
  let noPhone = false;
  try {
    await call('createInternalUser')({ name: 'מנהל חדש', email: 'mgr2@obms.test', role: 'tender_manager' });
  } catch (e) {
    noPhone = /טלפון/.test((e as Error).message);
  }
  assert.ok(noPhone, 'a bid manager without a phone is refused');
  await call('createInternalUser')({ name: 'מנהל חדש', email: 'mgr2@obms.test', role: 'tender_manager', phone: '050-7654321' });
  const mgr2 = (await getDocs(collection(db, 'users'))).docs.find((d) => d.data().email === 'mgr2@obms.test')!;
  assert.equal(mgr2.data().phone, '050-7654321', 'the phone is stored on the user');
  await call('deleteInternalUser')({ uid: mgr2.id });
  console.log('✓ internal user created (role claim) + deleted; a bid manager needs a phone');

  // ---- audit entries reference the related bid (manager-only reads) ----
  await signOut(auth);
  await login('manager@obms.test');
  const auditSnap = await getDocs(
    query(collection(db, 'auditLog'), where('tenderId', '==', tenderId)),
  );
  assert.ok(auditSnap.size >= 1, 'audit entries carry the related tenderId');
  console.log(`✓ audit log links to the bid (${auditSnap.size} entries with tenderId)`);

  // ---- per-type examples + skill markdown ----
  await call('updateTemplateMeta')({
    type: 'goods',
    examples: [{ title: 'מכרז טובין לדוגמה', url: 'https://example.test/good-bid' }],
    skillMd: '# מיומנות\n- בדוק תקני בטיחות\n- ודא אחריות יצרן',
  });
  const tmpl = await getDoc(doc(db, 'templates', 'goods'));
  assert.equal((tmpl.data() as { examples?: unknown[] }).examples?.length, 1, 'example saved');
  assert.ok(
    (tmpl.data() as { skillMd?: string }).skillMd?.includes('מיומנות'),
    'skill markdown saved',
  );
  console.log('✓ manager saved per-type example link + skill markdown');

  // ---- domain tags + supplier sourcing ----
  await call('upsertSupplier')({
    id: 'sup_aegis',
    name: 'אגיס מערכות',
    contactEmail: 'a@aegis.test',
    country: 'IL',
    isIsraeli: true,
    status: 'active',
    domainTags: ['אבטחה', 'מצלמות'],
  });
  const draft = (await call('draftBid')({ type: 'goods', brief: 'רכש 10 מצלמות אבטחה IP66' })) as {
    data: { title: string };
  };
  console.log('✓ draftBid returned (fallback in emulator):', !!draft.data);
  const sourcing = (await call('searchSuppliers')({ type: 'goods', domainTags: ['אבטחה'] })) as {
    data: { registered: { supplierId: string; matchedTags: string[] }[]; external: unknown[] };
  };
  const aegisMatch = sourcing.data.registered.find((r) => r.supplierId === 'sup_aegis');
  assert.ok(aegisMatch && aegisMatch.matchedTags.includes('אבטחה'), 'sourcing matched aegis by tag');
  console.log('✓ supplier sourcing matched registered supplier by domain tag');

  // ---- full lifecycle: (published above) → submit → compare → award ----
  await signOut(auth);
  await login('a@aegis.test');
  await call('saveSubmission')({
    tenderId,
    files: [],
    summary: 'מצלמות IP66, אספקה ב-6 חודשים, אחריות 3 שנים, תמיכה 24/7.',
  });

  await signOut(auth);
  await login('manager@obms.test');
  assert.equal(
    (await getDoc(doc(db, 'tenders', tenderId))).data()!.status,
    'responses',
    'first submission advances published → responses',
  );
  const cmp = (await call('runComparison')({ tenderId })) as { data: { ranking: unknown[] } };
  assert.ok(cmp.data.ranking.length >= 1, 'comparison produced a ranking');
  assert.equal(
    (await getDoc(doc(db, 'tenders', tenderId))).data()!.status,
    'evaluated',
    'comparison advances → evaluated',
  );
  await call('awardTender')({ tenderId, supplierId: 'sup_aegis' });
  const awarded = (await getDoc(doc(db, 'tenders', tenderId))).data()!;
  assert.equal(awarded.status, 'awarded', 'award advances → awarded');
  assert.equal(awarded.awardedSupplierId, 'sup_aegis', 'winner recorded');
  console.log('✓ lifecycle: published → submitted → compared → awarded');

  // ---- participant feedback (publish + award rounds) ----
  const reqs = await getDocs(query(collection(db, 'feedbackRequests'), where('tenderId', '==', tenderId)));
  const rounds = new Set(reqs.docs.map((d) => d.data().round));
  assert.ok(rounds.has('publish') && rounds.has('award'), 'feedback requested at publish and at award');
  const publishReqUids = reqs.docs.filter((d) => d.data().round === 'publish').map((d) => d.data().uid).sort();
  assert.deepEqual(publishReqUids, [managerUid, ...Object.values(goodsTeam)].sort(), 'only the case team is asked');
  await signOut(auth);
  await login('legal@obms.test');
  const legalUser = auth.currentUser!.uid;
  const mine = await getDocs(
    query(collection(db, 'feedbackRequests'), where('uid', '==', legalUser), where('status', '==', 'pending')),
  );
  assert.ok(mine.docs.some((d) => d.data().tenderId === tenderId), 'legal sees their own pending request');
  await call('submitFeedback')({
    tenderId,
    round: 'publish',
    ratings: { draftQuality: 4, clarity: 3, completeness: 4, reviewEffort: 5 },
    issues: ['legal_wording'],
    skillAreas: ['legal'],
    comment: 'סעיף האחריות דרש תיקון.',
  });
  const done = await getDoc(doc(db, 'feedbackRequests', `${tenderId}_publish_${legalUser}`));
  assert.equal(done.data()!.status, 'done', 'request flips to done');
  await signOut(auth);
  await login('a@aegis.test');
  let fbDenied = false;
  try {
    await getDocs(query(collection(db, 'feedbackRequests'), where('tenderId', '==', tenderId)));
  } catch {
    fbDenied = true;
  }
  assert.ok(fbDenied, 'supplier cannot read feedback requests');
  await signOut(auth);
  await login('manager@obms.test');
  const tips = (await call('generateSkillTips')({ type: 'goods' })) as {
    data: { aggregate: { responses: number }; tips: unknown[]; model: string };
  };
  assert.ok(tips.data.aggregate.responses >= 1, 'tips aggregate the feedback');
  console.log(`✓ feedback: requests at publish + award, legal answered, tips run (${tips.data.model}, ${tips.data.tips.length} tips)`);

  // ---- read-only skills catalog ----
  const catalog = (await call('getSkillsCatalog')({})) as {
    data: { skills: unknown[]; required: { goods: string[] }; legalSections: unknown[] };
  };
  assert.equal(catalog.data.skills.length, SKILL_IDS.length, 'all skills in the catalog');
  assert.ok(catalog.data.required.goods.includes('s11-legal-compliance'), 'goods requires the legal skill');
  assert.equal(catalog.data.legalSections.length, 9, '9 mandatory legal sections');
  console.log('✓ skills catalog served read-only');

  // ---- case success score ----
  type Score = { total: number; cohort: string; raw: Record<string, number>; components: { key: string; score: number }[] };
  const versions = (await getDoc(doc(db, 'tenders', tenderId, 'internal', 'versions'))).data() as
    | { list: { n: number }[] }
    | undefined;
  assert.ok((versions?.list.length ?? 0) >= 1, 'document versions recorded');
  const clean = (await getDoc(doc(db, 'caseScores', tenderId))).data() as Score;
  assert.ok(clean, 'case score stored');
  assert.equal(clean.cohort, 'manual');
  const keys = clean.components.map((c) => c.key);
  for (const k of ['efficiency', 'correctness', 'outcome']) assert.ok(keys.includes(k), `component ${k}`);
  assert.equal(clean.raw.questionsPerSupplier, 0.5, '1 question / 2 invited suppliers');
  assert.equal(clean.raw.participantRating, 4, 'mean of legal\'s ratings');
  const dc = (clean as unknown as { docChange: { source: string; dci: number } }).docChange;
  assert.equal(dc.source, 'checkpoints', 'emulator measures change from checkpoints');
  assert.ok(dc.dci >= 0 && dc.dci <= 100, 'DCI in range');
  const overridden = (await getDoc(doc(db, 'caseScores', bad.data.id))).data() as Score;
  const correctness = (x: Score) => x.components.find((c) => c.key === 'correctness')!.score;
  assert.ok(correctness(overridden) < correctness(clean), 'override lowers correctness');
  assert.equal(overridden.raw.overrides, 1);
  console.log(`✓ case score: clean ${clean.total} vs overridden ${overridden.total}`);

  // suppliers can't read scores
  await signOut(auth);
  await login('a@aegis.test');
  let scoreDenied = false;
  try {
    await getDoc(doc(db, 'caseScores', tenderId));
  } catch {
    scoreDenied = true;
  }
  assert.ok(scoreDenied, 'supplier cannot read case scores');
  let catalogDenied = false;
  try {
    await call('getSkillsCatalog')({});
  } catch {
    catalogDenied = true;
  }
  assert.ok(catalogDenied, 'supplier cannot read the skills catalog');
  await signOut(auth);
  await login('manager@obms.test');
  const backfill = (await call('backfillCaseScores')({})) as { data: { scored: number; failed: string[] } };
  assert.ok(backfill.data.scored >= 2 && backfill.data.failed.length === 0, 'backfill scores every tender');
  console.log(`✓ backfill scored ${backfill.data.scored} tenders`);

  // ---- template conversion: a Word-style document (XXXX / ____, no {{fields}}) ----
  // Loaded through the admin SDK (emulator), as a manager would after pasting a .docx into a Doc.
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  const adminDb = adminFirestore(adminApp);
  await adminDb.collection('templates').doc('service').set(
    {
      bodyTemplate: [
        'הנדון: בל"מ מס\' XXXX למתן שירותי XXXX',
        '## אופן הגשת ההצעה',
        'יש להגיש עד XXXXX',
        'שם הבנק/חברת הביטוח ________',
      ].join('\n'),
      params: [],
      supplierFillQuotes: [],
    },
    { merge: true },
  );
  const svcTeam = { ...goodsTeam, security: uidOf('security') };
  let notConverted = false;
  try {
    await call('createTender')({ title: 'שירות', bidRequestId: await newRequest(), type: 'service', params: {}, team: svcTeam });
  } catch (e) {
    notConverted = /טרם הומרה/.test((e as Error).message);
  }
  assert.ok(notConverted, 'creating from an unconverted template is refused');
  const analysis = (await call('analyzeTemplateFields')({ type: 'service' })) as {
    data: { runId: string; unresolved: unknown[]; fields: unknown[] };
  };
  assert.ok(analysis.data.unresolved.length >= 4, 'emulator analysis lists the fill-in spots (no AI)');
  const report = (await call('applyTemplateConversion')({
    type: 'service',
    runId: analysis.data.runId,
    fields: [
      { key: 'tender_number', labelHe: 'מספר הבל"מ', type: 'text', required: true, occurrences: [{ quote: 'בל"מ מס\' XXXX', replace: 'XXXX' }] },
      { key: 'service_subject', labelHe: 'נושא השירות', type: 'text', required: true, occurrences: [{ quote: 'שירותי XXXX', replace: 'XXXX' }] },
      { key: 'submission_date', labelHe: 'מועד הגשה', type: 'date', required: true, occurrences: [{ quote: 'עד XXXXX', replace: 'XXXXX' }] },
    ],
    supplierFill: ['שם הבנק/חברת הביטוח ________'],
  })) as { data: { status: string; fields: number; unresolved: unknown[] } };
  assert.equal(report.data.status, 'ready', 'template is ready after conversion');
  assert.equal(report.data.unresolved.length, 0);
  const svc = (await getDoc(doc(db, 'templates', 'service'))).data() as {
    bodyTemplate: string;
    params: { key: string; labelHe: string; required: boolean }[];
    fieldsStatus: string;
  };
  assert.ok(svc.bodyTemplate.includes("בל\"מ מס' {{tender_number}}"), '{{fields}} written into the template');
  assert.equal(svc.params.find((p) => p.key === 'tender_number')?.labelHe, 'מספר הבל"מ', 'labels kept');
  assert.equal(svc.fieldsStatus, 'ready');
  let missingRequired = false;
  try {
    await call('createTender')({ title: 'שירות', bidRequestId: await newRequest(), type: 'service', params: { tender_number: '2026-01' }, team: svcTeam });
  } catch (e) {
    missingRequired = /שדה חובה חסר/.test((e as Error).message);
  }
  assert.ok(missingRequired, 'an empty required template field is rejected');
  let placeholderRejected = false;
  try {
    await call('createTender')({
      title: 'שירות',
      bidRequestId: await newRequest(),
      type: 'service',
      params: { service_subject: '{{SERVICE_SUBJECT}}' },
      team: svcTeam,
      submissionDeadline: Date.parse('2026-12-16T14:52:00Z'),
    });
  } catch (e) {
    placeholderRejected = /מציין המקום/.test((e as Error).message);
  }
  assert.ok(placeholderRejected, 'a field still holding an AI-draft {{PLACEHOLDER}} is rejected');
  // The bid number is never asked: the system fills it with the case serial. A retried submission
  // (same requestId) returns the same case — never a copy.
  const svcInput = {
    title: 'מכרז שירותי פיתוח',
    bidRequestId: await newRequest(),
    type: 'service',
    params: { service_subject: 'פיתוח ותחזוקה' },
    team: svcTeam,
    submissionDeadline: Date.parse('2026-12-16T14:52:00Z'),
    requestId: 'e2e-request-0001',
  };
  const svcCase = (await call('createTender')(svcInput)) as { data: { id: string; serial: string; duplicate: boolean } };
  assert.ok(svcCase.data.id, 'case created once every template field is filled');
  assert.equal(svcCase.data.duplicate, false);
  const svcTender = (await getDoc(doc(db, 'tenders', svcCase.data.id))).data()!;
  assert.equal(svcTender.params.tender_number, svcCase.data.serial, 'bid number = case serial, filled by the system');
  assert.equal(svcTender.params.submission_date, '16/12/2026', 'submission date = the form deadline, filled by the system');
  const retried = (await call('createTender')(svcInput)) as { data: { id: string; duplicate: boolean } };
  assert.equal(retried.data.id, svcCase.data.id, 'retry returns the same case');
  assert.equal(retried.data.duplicate, true);
  const copies = await getDocs(query(collection(db, 'tenders'), where('title', '==', 'מכרז שירותי פיתוח')));
  assert.equal(copies.size, 1, 'no duplicate case was created');

  // Step 2 fills the hand-typed service fields itself: the title from the requester's service name,
  // the manager's email from their user record, the bid guarantee as 2% of the annual estimate (both
  // guarantee fields + words); "תוקף אחריות" is not asked.
  const typedFields = ['tender_title', 'כתובת מייל של מנהל המכרז', 'סכום ערבות להצעה', 'bid_guarantee_amount', 'bid_guarantee_amount_words', 'תוקף אחריות', 'BID_MANAGER_PHONE', 'SECURITY_APPENDIX'];
  await adminDb.collection('templates').doc('service').set(
    {
      // …and a supplier's XXXX left in the guarantee form: only {{}} are ours, so it doesn't block.
      bodyTemplate: svc.bodyTemplate + '\n' + typedFields.map((k) => `{{${k}}}`).join('\n') + '\nאשר תדרשו מאת : XXXXX (להלן: "החייב")',
      params: [...svc.params, ...typedFields.map((k) => ({ key: k, labelHe: k, type: 'text', required: true }))],
      fieldsStatus: 'ready',
    },
    { merge: true },
  );
  const autoReq = ((await call('createBidRequest')({
    brief: 'שירותי ניקיון למבנה משרדים',
    details: { ...REQUEST_DETAILS, service_name: 'שירותי ניקיון', annual_budget: 1_000_000 },
  })) as { data: { serial: string } }).data.serial;
  const autoCase = (await call('createTender')({
    title: '',
    bidRequestId: autoReq,
    type: 'service',
    params: { service_subject: 'ניקיון' }, // nothing else typed: the rest is filled by the system
    team: svcTeam,
    submissionDeadline: Date.parse('2026-12-16T14:52:00Z'),
  })) as { data: { id: string } };
  const autoTender = (await getDoc(doc(db, 'tenders', autoCase.data.id))).data()!;
  assert.equal(autoTender.params.tender_title, 'שירותי ניקיון', "title = the requester's service name");
  assert.equal(autoTender.params['כתובת מייל של מנהל המכרז'], 'manager@obms.test', "the creating manager's email");
  assert.equal(autoTender.params['סכום ערבות להצעה'], '20,000', 'guarantee = 2% of the annual estimate');
  assert.equal(autoTender.params.bid_guarantee_amount, '20,000', 'both guarantee fields agree');
  assert.equal(autoTender.params.bid_guarantee_amount_words, 'עשרים אלף שקלים');
  assert.equal(autoTender.params['תוקף אחריות'], '__________', 'not asked in step 2: a blank line to complete in the document');
  const autoCheck = (await call('runSupervision')({ tenderId: autoCase.data.id })) as {
    data: { findings: { severity: string; message: string }[] };
  };
  assert.ok(
    autoCheck.data.findings.some((f) => f.severity === 'warn' && /יושלמו ידנית/.test(f.message)),
    'the inspector lists the blank lines as a warning',
  );
  assert.ok(
    !autoCheck.data.findings.some((f) => f.severity === 'block' && /תוקף אחריות/.test(f.message)),
    'a blank line does not block the document',
  );
  assert.ok(
    !autoCheck.data.findings.some((f) => f.severity === 'block' && /SECURITY_APPENDIX|BID_MANAGER_PHONE/.test(JSON.stringify(f))),
    'neither tag blocks',
  );
  // (the rendering of both tags is unit-tested: the e2e service template has no legal sections, so its
  // draft can't open the document gate here)
  assert.equal(autoTender.params.annual_budget, undefined, 'the annual estimate itself is never published');
  assert.equal(autoTender.params.BID_MANAGER_PHONE, '050-0000001', "the bid manager's phone, from the user record");
  assert.equal(autoTender.params.SECURITY_APPENDIX, '', 'SECURITY_APPENDIX prints nothing');
  console.log('✓ step 2 auto-fill: title, manager email, 2% guarantee (+ words); תוקף אחריות not asked');
  // A request converts to exactly one tender.
  const reqId = await newRequest('בקשה להמרה');
  const input = { title: '', type: 'goods', params: { org: 'א', description: 'ב', quantity: 1, budget: 1 }, team: goodsTeam, bidRequestId: reqId };
  const first = (await call('createTender')({ ...input })) as { data: { id: string; serial: string } };
  assert.equal(first.data.serial, reqId, 'the tender keeps the request bid number');
  const reqDoc = await getDoc(doc(db, 'bidRequests', reqId));
  assert.equal(reqDoc.data()?.status, 'converted');
  assert.equal(reqDoc.data()?.tenderId, first.data.id);
  let secondFailed = false;
  try {
    await call('createTender')({ ...input });
  } catch (e) {
    secondFailed = (e as { code?: string }).code === 'functions/failed-precondition';
  }
  assert.ok(secondFailed, 'a converted request cannot be converted again');
  let unknownFailed = false;
  try {
    await call('createTender')({ ...input, bidRequestId: '2026-998' });
  } catch (e) {
    unknownFailed = (e as { code?: string }).code === 'functions/not-found';
  }
  assert.ok(unknownFailed, 'an unknown request is rejected');
  // Two simultaneous conversions of one request: exactly one tender is created.
  const raceReq = await newRequest('בקשה לתחרות');
  const raceInput = { title: '', type: 'goods', params: { org: 'א', description: 'ב', quantity: 1, budget: 1 }, team: goodsTeam, bidRequestId: raceReq };
  const race = await Promise.allSettled([
    call('createTender')({ ...raceInput, requestId: 'e2e-race-a' }),
    call('createTender')({ ...raceInput, requestId: 'e2e-race-b' }),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one concurrent conversion succeeds');
  const raceLoser = race.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  assert.equal((raceLoser?.reason as { code?: string } | undefined)?.code, 'functions/failed-precondition', 'the other is rejected as already converted');
  const raceTenders = await getDocs(query(collection(db, 'tenders'), where('serial', '==', raceReq)));
  assert.equal(raceTenders.size, 1, 'exactly one tender has the request serial');

  // The person who opened the request becomes the case requester when the manager does not pick one.
  await signOut(auth);
  await login('requester@obms.test');
  const openedReq = await newRequest('בקשה של דורש');
  await signOut(auth);
  await login('manager@obms.test');
  const { requester: _omit, ...teamNoRequester } = goodsTeam;
  void _omit;
  const defaulted = (await call('createTender')({
    title: '',
    type: 'goods',
    params: { org: 'א', description: 'ב', quantity: 1, budget: 1 },
    team: teamNoRequester,
    bidRequestId: openedReq,
  })) as { data: { id: string } };
  const defaultedTender = (await getDoc(doc(db, 'tenders', defaulted.data.id))).data()!;
  assert.equal(defaultedTender.team.requester, uidOf('requester'), 'the request opener is the case requester');
  assert.ok(defaultedTender.memberUids.includes(uidOf('requester')), 'and is a member of the case');
  console.log(`✓ template conversion: refused → analysed → converted (${report.data.fields} fields) → form enforced`);

  // ---- one-time migrations are idempotent ----
  const s1 = (await call('backfillSerials')({})) as { data: { assigned: number } };
  assert.equal(s1.data.assigned, 0, 'all tenders already numbered');
  const m1 = (await call('migrateTeams')({})) as { data: { migrated: number } };
  assert.equal(m1.data.migrated, 0, 'all tenders already on teams');
  console.log('✓ backfillSerials / migrateTeams are no-ops on current data');

  console.log('\n✅ E2E PASSED — full vertical slice works on the emulator');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ E2E FAILED:', e);
  process.exit(1);
});
