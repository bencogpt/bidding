// Verify real Claude on the deployed project: publish a tender, submit a proposal, run the
// AI comparison, and check the report is NOT the stub.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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
const login = (e) => signInWithEmailAndPassword(auth, e, 'password');

await login('manager@obms.test');
const { data: request } = await call('createBidRequest')({ brief: 'בקשת בדיקה' });
const { data: created } = await call('createTender')({
  bidRequestId: request.serial,
  title: 'בדיקת Claude חיה',
  type: 'goods',
  params: { org: 'בדיקה', description: 'מצלמות אבטחה IP66', quantity: 8, budget: 400000 },
});
const tenderId = created.id;
await call('transitionTender')({ tenderId, to: 'internal_review' });
await call('transitionTender')({ tenderId, to: 'ready' });
await call('transitionTender')({ tenderId, to: 'published' });
// Suppliers can only be shared after publication (supervisor gate).
await call('grantAccess')({ tenderId, supplierIds: ['sup_aegis', 'sup_meridian'], internalUids: [] });

await signOut(auth);
await login('a@aegis.test');
await call('saveSubmission')({
  tenderId,
  files: [],
  summary:
    'מצלמות IP66 עם אחריות 3 שנים, אספקה תוך 6 חודשים, תמיכה 24/7, עמידה בכל תקני האבטחה.',
});
await signOut(auth);
await login('b@meridian.test');
await call('saveSubmission')({
  tenderId,
  files: [],
  summary: 'הצעת מחיר נמוכה במיוחד אך ללא תקן IP66, אספקה תוך 4 חודשים, תמיכה בשעות העבודה בלבד.',
});

await signOut(auth);
await login('manager@obms.test');
const { data: report } = await call('runComparison')({ tenderId });
console.log('isStub:', report.isStub);
console.log('model:', report.model);
console.log('preferred:', report.preferredSupplierId);
console.log('ranking count:', report.ranking.length);
console.log('sample rationale:', report.ranking[0]?.rationaleHe?.slice(0, 120));
console.log(report.isStub ? '\n⚠ STUB (Claude not used — check key/model)' : '\n✅ REAL CLAUDE comparison');
process.exit(0);
