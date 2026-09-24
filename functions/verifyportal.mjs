// Live verify: the supplier portal query (collectionGroup access + tender fetch) resolves.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collectionGroup, query, where, getDocs, getDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyAIL6Hv9ql1_eUt-4JS9Nm69XJ-IQ56CVI',
  authDomain: 'biding-system.firebaseapp.com',
  projectId: 'biding-system',
  storageBucket: 'biding-system.firebasestorage.app',
  appId: '1:45053660863:web:f829e4b858c4d8d6a6400a',
});
const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, 'a@aegis.test', 'password');
const claims = (await auth.currentUser.getIdTokenResult()).claims;
console.log('signed in as supplier, supplierId claim =', claims.supplierId);

try {
  const snap = await getDocs(
    query(collectionGroup(db, 'access'), where('principalId', '==', claims.supplierId)),
  );
  console.log('access docs found:', snap.size);
  let tenders = 0;
  for (const d of snap.docs) {
    const ref = d.ref.parent.parent;
    if (ref && (await getDoc(ref)).exists()) tenders++;
  }
  console.log('resolvable tenders:', tenders);
  console.log('\n✅ PORTAL QUERY OK — no permission/index error, resolves (portal will render)');
} catch (e) {
  console.error('\n❌ query failed:', e.code || e.message);
  process.exit(1);
}
process.exit(0);
