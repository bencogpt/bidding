// Verify the supervisor agent on the deployed project: AI draft → create (provenance) →
// manual supervision run → publish gate. Prints the report so the findings can be inspected.
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

const brief = 'רכש 12 מצלמות אבטחה IP66 עבור משרד הביטחון';
const { data: draft } = await call('draftBid')({ type: 'goods', brief });
console.log('draftBid →', draft.status, '| draftId', draft.draftId, '| missing', draft.missing);

const { data: created } = await call('createTender')({
  title: draft.title || 'בדיקת סוכן מפקח',
  type: 'goods',
  params: { org: 'משרד הביטחון', description: 'מצלמות אבטחה IP66', quantity: 12, ...draft.params, budget: 750000 },
  draftId: draft.draftId,
});
console.log('createTender →', created.id, '| verdict at creation:', created.verdict);

const { data: report } = await call('runSupervision')({ tenderId: created.id });
console.log(`runSupervision → ${report.verdict} (model: ${report.aiModel ?? 'rules only'})`);
for (const f of report.findings) {
  console.log(`  [${f.severity}] ${f.code} @ ${f.location}: ${f.message}${f.evidence ? ` — “${f.evidence}”` : ''}`);
}

await call('transitionTender')({ tenderId: created.id, to: 'internal_review' });
await call('transitionTender')({ tenderId: created.id, to: 'ready' });
try {
  const { data } = await call('transitionTender')({ tenderId: created.id, to: 'published' });
  console.log(`\n✅ published (supervisor verdict ${data.verdict})`);
} catch (e) {
  console.log('\n⛔ publish blocked by the supervisor:', e.message);
  console.log('   flags:', JSON.stringify(e.details?.flags ?? [], null, 2));
}

const { data: score } = await call('recomputeCaseScore')({ tenderId: created.id });
console.log(`\ncase score → ${score.total} (${score.grade}) · cohort ${score.cohort}`);
for (const c of score.components) {
  console.log(`  ${c.key}: ${c.score} (weight ${Math.round(c.weight * 100)}%) — ` +
    c.metrics.map((m) => `${m.key}=${m.value}`).join(', '));
}
process.exit(0);
