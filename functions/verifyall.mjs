// Full live verification: cache/speed + multi-file upload + case-view data.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

const app = initializeApp({
  apiKey: 'AIzaSyAIL6Hv9ql1_eUt-4JS9Nm69XJ-IQ56CVI',
  authDomain: 'biding-system.firebaseapp.com',
  projectId: 'biding-system',
  storageBucket: 'biding-system.firebasestorage.app',
  appId: '1:45053660863:web:f829e4b858c4d8d6a6400a',
});
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');
const storage = getStorage(app);
const call = (n) => httpsCallable(fns, n);
const login = (e) => signInWithEmailAndPassword(auth, e, 'password');
const enc = (s) => new TextEncoder().encode(s);

// 1) manager: create + share + publish (caches PDF)
await login('manager@obms.test');
const { data: created } = await call('createTender')({
  title: 'בדיקה מקיפה חיה',
  type: 'goods',
  params: { org: 'משרד הביטחון', description: 'מצלמות IP66', quantity: 6, budget: 300000 },
});
const id = created.id;
await call('transitionTender')({ tenderId: id, to: 'internal_review' });
await call('transitionTender')({ tenderId: id, to: 'ready' });
await call('transitionTender')({ tenderId: id, to: 'published' });
// Suppliers can only be shared after publication (supervisor gate).
await call('grantAccess')({ tenderId: id, supplierIds: ['sup_aegis'], internalUids: [] });
const cached = (await getDoc(doc(db, 'tenders', id))).data()?.docExportPath;
console.log('1) publish → docExportPath:', cached ?? '(none)');

// 2) supplier: upload MULTIPLE files to Storage + record submission
await signOut(auth);
await login('a@aegis.test');
const files = [
  { name: 'technical.txt', body: 'Technical response IP66' },
  { name: 'pricing.txt', body: 'Pricing 300000' },
  { name: 'compliance.txt', body: 'Compliance matrix' },
];
const recorded = [];
for (const f of files) {
  const path = `tenders/${id}/submissions/sup_aegis/${f.name}`;
  const bytes = enc(f.body);
  await uploadBytes(ref(storage, path), bytes, { contentType: 'text/plain' });
  recorded.push({ name: f.name, size: bytes.length, path });
}
await call('saveSubmission')({ tenderId: id, files: recorded, summary: 'הצעה עם 3 קבצים.' });
const mySub = (await getDoc(doc(db, 'tenders', id, 'submissions', 'sup_aegis'))).data();
console.log('2) supplier submission files:', mySub?.files?.length, '(expected 3)');

// 3) speed: cached PDF served fast
let t = Date.now();
const { data: view } = await call('getTenderDocument')({ tenderId: id });
console.log(`3) getTenderDocument: kind=${view.kind}, ${Date.now() - t}ms`);

// 4) case-view data (manager): submissions list + bid audit trail
await signOut(auth);
await login('manager@obms.test');
const subs = await getDocs(collection(db, 'tenders', id, 'submissions'));
const audit = await getDocs(query(collection(db, 'auditLog'), where('tenderId', '==', id)));
console.log('4) case: submissions=', subs.size, ' auditEntries=', audit.size);

const ok =
  !!cached &&
  mySub?.files?.length === 3 &&
  view.kind === 'pdf' &&
  subs.size >= 1 &&
  audit.size >= 1;
console.log(ok ? '\n✅ ALL VERIFIED (cache + multi-file + case data)' : '\n⚠ something off');
process.exit(ok ? 0 : 1);
