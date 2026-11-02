// Live end-to-end smoke test against the deployed biding-system project (NOT emulator).
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

try {
  await signInWithEmailAndPassword(auth, 'manager@obms.test', 'password');
  console.log('✓ signed in as manager (email/password live auth works)');
} catch (e) {
  console.error('✗ sign-in FAILED — enable Email/Password provider:', e.code || e.message);
  process.exit(2);
}

try {
  const r = await httpsCallable(fns, 'createTender')({
    title: 'בדיקת פריסה חיה',
    type: 'goods',
    params: { org: 'בדיקה', description: 'מצלמות אבטחה', quantity: 5, budget: 100000 },
  });
  console.log('✓ createTender live →', JSON.stringify(r.data));
  const doc = await httpsCallable(fns, 'getTenderDocument')({ tenderId: r.data.id });
  // Both dev and real Google Docs mode return HTML in `content`.
  const payload = doc.data.content;
  console.log('✓ getTenderDocument live → kind:', doc.data.kind, '| length:', (payload || '').length);
  console.log('\n✅ LIVE STACK OK (auth + functions + firestore + storage)');
  process.exit(0);
} catch (e) {
  console.error('✗ callable FAILED:', e.code || e.message, e.details || '');
  process.exit(3);
}
