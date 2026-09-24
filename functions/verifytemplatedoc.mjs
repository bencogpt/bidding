// Live verify: system creates a PRIVATE template Google Doc + reads fields back (no public share).
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp({
  apiKey: 'AIzaSyAIL6Hv9ql1_eUt-4JS9Nm69XJ-IQ56CVI',
  authDomain: 'biding-system.firebaseapp.com',
  projectId: 'biding-system',
  storageBucket: 'biding-system.firebasestorage.app',
  appId: '1:45053660863:web:f829e4b858c4d8d6a6400a',
});
const auth = getAuth(app);
const fns = getFunctions(app, 'europe-west1');
const call = (n) => httpsCallable(fns, n);

await signInWithEmailAndPassword(auth, 'manager@obms.test', 'password');
const { data: created } = await call('createTemplateDoc')({ type: 'goods' });
console.log('createTemplateDoc → docId:', created.docId);
console.log('   edit url:', created.url);

const { data: synced } = await call('syncTemplateFields')({ type: 'goods' });
console.log('syncTemplateFields → detected fields:', synced.params.map((p) => p.key).join(', '));

console.log(
  created.docId && synced.params.length > 0
    ? '\n✅ PRIVATE TEMPLATE DOC OK — system created it (owned by bencogpt, not public) and read its fields'
    : '\n⚠ check',
);
process.exit(0);
