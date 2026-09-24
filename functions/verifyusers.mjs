// Live verify: create internal user (role claim) → sign in → delete.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, getDocs, collection } from 'firebase/firestore';
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
const email = `legal_live_${Date.now()}@obms.test`;

await signInWithEmailAndPassword(auth, 'manager@obms.test', 'password');
const { data: created } = await call('createInternalUser')({ name: 'עו״ד חי', email, role: 'legal' });
console.log('createInternalUser →', created.email, '| tempPassword issued:', !!created.tempPassword);

await signOut(auth);
await signInWithEmailAndPassword(auth, email, created.tempPassword);
const role = (await auth.currentUser.getIdTokenResult()).claims.role;
console.log('new user signed in, role claim =', role);

await signOut(auth);
await signInWithEmailAndPassword(auth, 'manager@obms.test', 'password');
const uid = (await getDocs(collection(db, 'users'))).docs.find((d) => d.data().email === email)?.id;
await call('deleteInternalUser')({ uid });
const gone = !(await getDocs(collection(db, 'users'))).docs.some((d) => d.data().email === email);
console.log('deleted, removed from users =', gone);

console.log(role === 'legal' && gone ? '\n✅ INTERNAL USERS LIVE OK' : '\n⚠ check');
process.exit(0);
