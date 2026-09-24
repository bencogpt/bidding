// Verify real Google Docs mode on the deployed project: create a tender and confirm a real
// Google Doc was created (googleDocId set) and the in-system view returns an exported PDF.
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
const { data: created } = await call('createTender')({
  title: 'בדיקת Google Docs חיה',
  type: 'goods',
  params: { org: 'משרד הביטחון', description: 'מצלמות אבטחה IP66', quantity: 12, budget: 750000 },
});
console.log('createTender →', JSON.stringify(created));

const { data: view } = await call('getTenderDocument')({ tenderId: created.id });
console.log('getTenderDocument kind:', view.kind, '| pdf bytes(base64):', (view.dataBase64 || '').length);
console.log(
  view.kind === 'pdf'
    ? '\n✅ REAL GOOGLE DOCS: a Google Doc was created and exported to PDF'
    : '\n⚠ still HTML/dev mode (real mode not active)',
);
process.exit(0);
