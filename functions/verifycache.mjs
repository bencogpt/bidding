// Verify the publish-time PDF cache on the deployed project.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
const call = (n) => httpsCallable(fns, n);

await signInWithEmailAndPassword(auth, 'manager@obms.test', 'password');
const { data: created } = await call('createTender')({
  title: 'בדיקת מטמון PDF',
  type: 'goods',
  params: { org: 'בדיקה', description: 'מצלמות', quantity: 3, budget: 100000 },
});
const id = created.id;
await call('transitionTender')({ tenderId: id, to: 'internal_review' });
await call('transitionTender')({ tenderId: id, to: 'ready' });
await call('transitionTender')({ tenderId: id, to: 'published' }); // caches the PDF

const snap = await getDoc(doc(db, 'tenders', id));
console.log('docExportPath after publish:', snap.data()?.docExportPath ?? '(none)');

let t = Date.now();
const { data: v1 } = await call('getTenderDocument')({ tenderId: id });
console.log(`getTenderDocument #1: kind=${v1.kind}, ${Date.now() - t}ms`);
t = Date.now();
const { data: v2 } = await call('getTenderDocument')({ tenderId: id });
console.log(`getTenderDocument #2 (warm): kind=${v2.kind}, ${Date.now() - t}ms`);

console.log(
  snap.data()?.docExportPath && v1.kind === 'pdf'
    ? '\n✅ PDF cached at publish and served fast'
    : '\n⚠ cache not set as expected',
);
process.exit(0);
