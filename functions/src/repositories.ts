// Repository layer: the ONLY place that touches Firestore directly (constitution:
// Repository Pattern — no raw firestore.collection(...).set(...) outside this file).
import { db, now } from './lib/admin.js';
import { isInternalRole } from '@obms/shared';
import type {
  TenderDoc,
  AccessDoc,
  QuestionDoc,
  AnswerDoc,
  AuditDoc,
  TemplateDoc,
  SupplierDoc,
  UserDoc,
  SubmissionDoc,
  QuestionAuthorDoc,
} from '@obms/shared';

const stripUndefined = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---- users ----
export const usersRepo = {
  async upsert(u: UserDoc): Promise<void> {
    await db.collection('users').doc(u.uid).set(stripUndefined(u), { merge: true });
  },
  async get(uid: string): Promise<UserDoc | null> {
    const s = await db.collection('users').doc(uid).get();
    return s.exists ? (s.data() as UserDoc) : null;
  },
  async remove(uid: string): Promise<void> {
    await db.collection('users').doc(uid).delete();
  },
  async byEmail(email: string): Promise<UserDoc | null> {
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    return q.empty ? null : (q.docs[0].data() as UserDoc);
  },
  /** All internal (non-supplier) users. Small collection — filtered in memory, no index needed. */
  async listInternal(): Promise<UserDoc[]> {
    const q = await db.collection('users').get();
    return q.docs.map((d) => d.data() as UserDoc).filter((u) => isInternalRole(u.role));
  },
};

// ---- suppliers ----
export const suppliersRepo = {
  async upsert(s: SupplierDoc): Promise<void> {
    await db.collection('suppliers').doc(s.id).set(stripUndefined(s), { merge: true });
  },
  async list(): Promise<SupplierDoc[]> {
    const q = await db.collection('suppliers').get();
    return q.docs.map((d) => d.data() as SupplierDoc);
  },
  async get(id: string): Promise<SupplierDoc | null> {
    const s = await db.collection('suppliers').doc(id).get();
    return s.exists ? (s.data() as SupplierDoc) : null;
  },
};

// ---- templates ----
// Firestore caps a document at 1 MiB. A template holds the full bid body plus the skill file,
// and Hebrew costs ~1.8 bytes/char in UTF-8, so the ceiling lands around 500 pages. Guard below
// the hard limit so an oversized import fails with an actionable Hebrew message rather than an
// opaque write rejection. (Measured: an 80-page Hebrew template is ~160 KB ≈ 15% of the limit.)
const FIRESTORE_DOC_LIMIT = 1_048_576;
const TEMPLATE_SIZE_BUDGET = 900_000;

export function assertTemplateFits(data: Partial<TemplateDoc>): void {
  const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (bytes > TEMPLATE_SIZE_BUDGET) {
    const mb = (bytes / 1_048_576).toFixed(2);
    throw new Error(
      `התבנית גדולה מדי (${mb}MB). המגבלה היא ${(TEMPLATE_SIZE_BUDGET / 1_048_576).toFixed(2)}MB ` +
        `למסמך (מגבלת Firestore: ${(FIRESTORE_DOC_LIMIT / 1_048_576).toFixed(0)}MB). ` +
        'קצר את מסמך התבנית או את קובץ ההנחיות.',
    );
  }
}

export const templatesRepo = {
  async upsert(t: TemplateDoc): Promise<void> {
    assertTemplateFits(t);
    await db.collection('templates').doc(t.type).set(t, { merge: true });
  },
  async get(type: string): Promise<TemplateDoc | null> {
    const s = await db.collection('templates').doc(type).get();
    return s.exists ? (s.data() as TemplateDoc) : null;
  },
  async patch(type: string, data: Partial<TemplateDoc>): Promise<void> {
    assertTemplateFits(data);
    await db.collection('templates').doc(type).set(stripUndefined(data), { merge: true });
  },
};

// ---- tenders ----
export const tendersRepo = {
  newId(): string {
    return db.collection('tenders').doc().id;
  },
  async create(t: TenderDoc): Promise<void> {
    await db.collection('tenders').doc(t.id).set(t);
  },
  async get(id: string): Promise<TenderDoc | null> {
    const s = await db.collection('tenders').doc(id).get();
    return s.exists ? (s.data() as TenderDoc) : null;
  },
  async update(id: string, patch: Partial<TenderDoc>): Promise<void> {
    await db.collection('tenders').doc(id).set(stripUndefined({ ...patch, updatedAt: now() }), {
      merge: true,
    });
  },
};

// ---- access (subcollection of tenders) ----
export const accessRepo = {
  async grant(tenderId: string, a: AccessDoc): Promise<void> {
    await db.collection('tenders').doc(tenderId).collection('access').doc(a.principalId).set(a);
  },
  async revoke(tenderId: string, principalId: string): Promise<void> {
    await db.collection('tenders').doc(tenderId).collection('access').doc(principalId).delete();
  },
  async list(tenderId: string): Promise<AccessDoc[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('access').get();
    return q.docs.map((d) => d.data() as AccessDoc);
  },
  async get(tenderId: string, principalId: string): Promise<AccessDoc | null> {
    const s = await db
      .collection('tenders')
      .doc(tenderId)
      .collection('access')
      .doc(principalId)
      .get();
    return s.exists ? (s.data() as AccessDoc) : null;
  },
};

// ---- questions / answers ----
export const questionsRepo = {
  newId(tenderId: string): string {
    return db.collection('tenders').doc(tenderId).collection('questions').doc().id;
  },
  /**
   * Write the anonymous question and its (separately secured) author record atomically — the two
   * must never diverge, or a question would exist with no recoverable author for the manager.
   */
  async add(tenderId: string, q: QuestionDoc, author: QuestionAuthorDoc): Promise<void> {
    const tender = db.collection('tenders').doc(tenderId);
    const batch = db.batch();
    batch.set(tender.collection('questions').doc(q.id), q);
    batch.set(tender.collection('questionAuthors').doc(q.id), author);
    await batch.commit();
  },
  async list(tenderId: string): Promise<QuestionDoc[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('questions').get();
    return q.docs.map((d) => d.data() as QuestionDoc);
  },
  /** Manager-side lookup of who asked what. Never exposed to suppliers. */
  async listAuthors(tenderId: string): Promise<QuestionAuthorDoc[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('questionAuthors').get();
    return q.docs.map((d) => d.data() as QuestionAuthorDoc);
  },
  async setCluster(tenderId: string, questionId: string, clusterId: string): Promise<void> {
    await db
      .collection('tenders')
      .doc(tenderId)
      .collection('questions')
      .doc(questionId)
      .set({ clusterId }, { merge: true });
  },
  async markAnswered(tenderId: string, questionIds: string[]): Promise<void> {
    const batch = db.batch();
    for (const qid of questionIds) {
      batch.set(
        db.collection('tenders').doc(tenderId).collection('questions').doc(qid),
        { answered: true },
        { merge: true },
      );
    }
    await batch.commit();
  },
};

export const answersRepo = {
  async add(tenderId: string, a: AnswerDoc): Promise<void> {
    await db.collection('tenders').doc(tenderId).collection('answers').doc(a.id).set(a);
  },
  newId(tenderId: string): string {
    return db.collection('tenders').doc(tenderId).collection('answers').doc().id;
  },
};

// ---- submissions (subcollection of tenders) ----
export const submissionsRepo = {
  async upsert(tenderId: string, s: SubmissionDoc): Promise<void> {
    await db
      .collection('tenders')
      .doc(tenderId)
      .collection('submissions')
      .doc(s.supplierId)
      .set(s, { merge: true });
  },
  async list(tenderId: string): Promise<SubmissionDoc[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('submissions').get();
    return q.docs.map((d) => d.data() as SubmissionDoc);
  },
};

// ---- audit (immutable, append-only) ----
export const auditRepo = {
  async append(entry: Omit<AuditDoc, 'id' | 'at'>): Promise<void> {
    const ref = db.collection('auditLog').doc();
    const doc: AuditDoc = { ...entry, id: ref.id, at: now() };
    await ref.set(stripUndefined(doc as unknown as Record<string, unknown>) as AuditDoc);
  },
  async forEntity(entityId: string): Promise<AuditDoc[]> {
    const q = await db.collection('auditLog').where('entityId', '==', entityId).get();
    return q.docs.map((d) => d.data() as AuditDoc).sort((a, b) => b.at - a.at);
  },
  async forTender(tenderId: string): Promise<AuditDoc[]> {
    const q = await db.collection('auditLog').where('tenderId', '==', tenderId).get();
    return q.docs.map((d) => d.data() as AuditDoc).sort((a, b) => b.at - a.at);
  },
};
