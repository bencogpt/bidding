// One-off migration: make existing clarification questions anonymous.
//
// Until this runs, every question written before the anonymity change still carries
// `supplierId` / `supplierName` inside `tenders/*/questions/*`, which any authorized supplier
// on that tender can read directly through the SDK. Rules cannot hide fields, so the data
// itself has to be fixed.
//
// For each question: copy the identity into `tenders/{id}/questionAuthors/{qid}`, then delete
// the two fields from the question document. Idempotent — re-running it is a no-op.
//
// Run BEFORE deploying the new rules:
//   GOOGLE_APPLICATION_CREDENTIALS=... node functions/migrate-anonymize-questions.mjs [--apply]
// Without --apply it is a dry run and writes nothing.
import admin from 'firebase-admin';

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ projectId: 'biding-system' });
const db = admin.firestore();

const tenders = await db.collection('tenders').get();
let scanned = 0;
let migrated = 0;
let alreadyClean = 0;

for (const tender of tenders.docs) {
  const questions = await tender.ref.collection('questions').get();
  for (const q of questions.docs) {
    scanned++;
    const data = q.data();
    const hasIdentity = data.supplierId !== undefined || data.supplierName !== undefined;
    if (!hasIdentity) {
      alreadyClean++;
      continue;
    }
    console.log(
      `${APPLY ? 'migrating' : 'would migrate'}  ${tender.id}/${q.id}  asker=${data.supplierName ?? data.supplierId}`,
    );
    if (APPLY) {
      const batch = db.batch();
      // merge:true so a re-run cannot clobber an author record written by the new code path.
      batch.set(
        tender.ref.collection('questionAuthors').doc(q.id),
        {
          questionId: q.id,
          supplierId: data.supplierId ?? 'unknown',
          supplierName: data.supplierName ?? 'לא ידוע',
          createdAt: data.createdAt ?? Date.now(),
        },
        { merge: true },
      );
      batch.update(q.ref, {
        supplierId: admin.firestore.FieldValue.delete(),
        supplierName: admin.firestore.FieldValue.delete(),
      });
      await batch.commit();
    }
    migrated++;
  }
}

console.log(
  `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — scanned ${scanned}, ${APPLY ? 'migrated' : 'to migrate'} ${migrated}, already anonymous ${alreadyClean}`,
);
if (!APPLY && migrated > 0) console.log('Re-run with --apply to write the changes.');
process.exit(0);
