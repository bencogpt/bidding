// Live verify: agentic brief→draft + supplier sourcing (registered + Claude external).
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

// 1) brief → AI draft
const { data: draft } = await call('draftBid')({
  type: 'goods',
  brief: 'רכש 12 מצלמות אבטחה חיצוניות בתקן IP66, תקציב כ-400 אלף ש"ח, אספקה תוך חצי שנה',
});
console.log('1) draftBid title:', draft.title);
console.log('   domainTags:', JSON.stringify(draft.domainTags));
console.log('   params keys:', Object.keys(draft.params || {}).join(', '));
console.log('   criteria:', (draft.evaluationCriteria || []).map((c) => `${c.name}:${c.weight}`).join(', '));
console.log('   deadlineDays:', draft.submissionDeadlineDays);

// 2) supplier sourcing (registered + external Claude)
const { data: src } = await call('searchSuppliers')({ type: 'goods', domainTags: ['אבטחה', 'מצלמות'] });
console.log('\n2) registered matches:', src.registered.length, '| external AI suggestions:', src.external.length);
if (src.external[0]) console.log('   e.g.:', src.external[0].name, '| isIsraeli:', src.external[0].isIsraeli);

const ok = !!draft.title && (draft.domainTags?.length || draft.evaluationCriteria?.length) && src.external.length > 0;
console.log(ok ? '\n✅ AGENTIC LIVE OK (real Claude draft + external suppliers)' : '\n⚠ AI may have fallen back — check ANTHROPIC secret binding');
process.exit(0);
