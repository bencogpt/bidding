// End-to-end smoke test of the vertical slice against the Emulator Suite.
// Run via:  firebase emulators:exec --only auth,firestore,functions,storage \
//             "npm run seed && node functions/lib/test/e2e.js"
import assert from 'node:assert/strict';
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
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const app = initializeApp({ projectId: 'biding-system', apiKey: 'demo' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const fns = getFunctions(app, 'europe-west1');
connectFunctionsEmulator(fns, '127.0.0.1', 5001);

const call = (n: string) => httpsCallable(fns, n);
const login = (email: string) => signInWithEmailAndPassword(auth, email, 'password');

async function main() {
  // ---- manager creates a goods tender ----
  await login('manager@obms.test');
  const users = await getDocs(collection(db, 'users'));
  const legalUid = users.docs.find((d) => d.data().role === 'legal')!.id;

  const created = (await call('createTender')({
    title: 'מכרז טובין לבדיקה',
    type: 'goods',
    params: { org: 'משרד הביטחון', description: 'מצלמות אבטחה', quantity: 10, budget: 500000 },
  })) as { data: { id: string } };
  const tenderId = created.data.id;
  assert.ok(tenderId, 'tender id returned');

  const tdoc = await getDoc(doc(db, 'tenders', tenderId));
  assert.ok(tdoc.exists(), 'tender doc persisted');
  assert.equal(tdoc.data()!.status, 'draft');

  // Every internal user gets access to the bid document at creation — nobody has to be
  // assigned by hand (requirement: internal users can comment/suggest on the doc).
  const internalUids = users.docs
    .filter((d) => d.data().role !== 'supplier')
    .map((d) => d.id);
  const accessSnap = await getDocs(collection(db, 'tenders', tenderId, 'access'));
  const accessByPrincipal = new Map(accessSnap.docs.map((d) => [d.id, d.data()]));
  for (const uid of internalUids) {
    assert.ok(accessByPrincipal.has(uid), `internal user ${uid} auto-granted access at creation`);
  }

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
  console.log('✓ all internal users auto-granted; edit access limited to the manager');

  await call('grantAccess')({ tenderId, supplierIds: ['sup_aegis'], internalUids: [legalUid] });
  console.log('✓ manager created tender + shared with aegis + assigned legal');

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
  console.log('✓ internal user created (role claim) + deleted');

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

  // ---- full lifecycle: publish → submit → compare → award ----
  await call('transitionTender')({ tenderId, to: 'internal_review' });
  await call('transitionTender')({ tenderId, to: 'ready' });
  await call('transitionTender')({ tenderId, to: 'published' });

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

  console.log('\n✅ E2E PASSED — full vertical slice works on the emulator');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ E2E FAILED:', e);
  process.exit(1);
});
