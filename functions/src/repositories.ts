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
  BidDraftRecord,
  TenderProvenance,
  SupervisionReport,
  DocVersion,
  CaseScore,
  ScoreTargets,
  DciParams,
  FeedbackRequest,
  FeedbackDoc,
  SkillTipsRun,
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
  async listIds(): Promise<string[]> {
    const q = await db.collection('tenders').select().get();
    return q.docs.map((d) => d.id);
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

// ---- AI drafts (function-only; provenance source for the supervisor) ----
export const bidDraftsRepo = {
  newId(): string {
    return db.collection('bidDrafts').doc().id;
  },
  async save(d: BidDraftRecord): Promise<void> {
    await db.collection('bidDrafts').doc(d.draftId).set(d);
  },
  async get(id: string): Promise<BidDraftRecord | null> {
    const s = await db.collection('bidDrafts').doc(id).get();
    return s.exists ? (s.data() as BidDraftRecord) : null;
  },
};

// ---- internal-only tender data (subcollection; suppliers can never read it) ----
// provenance: what the tender was built from. params: confidential values (estimate, G6).
export const internalRepo = {
  async setProvenance(tenderId: string, p: TenderProvenance): Promise<void> {
    await db.collection('tenders').doc(tenderId).collection('internal').doc('provenance').set(p);
  },
  async getProvenance(tenderId: string): Promise<TenderProvenance | null> {
    const s = await db.collection('tenders').doc(tenderId).collection('internal').doc('provenance').get();
    return s.exists ? (s.data() as TenderProvenance) : null;
  },
  async setParams(tenderId: string, params: Record<string, string | number>): Promise<void> {
    await db.collection('tenders').doc(tenderId).collection('internal').doc('params').set(params);
  },
  async getParams(tenderId: string): Promise<Record<string, string | number>> {
    const s = await db.collection('tenders').doc(tenderId).collection('internal').doc('params').get();
    return s.exists ? (s.data() as Record<string, string | number>) : {};
  },
};

// ---- supervisor reports (append-only, one doc per run) ----
export const supervisionRepo = {
  newId(tenderId: string): string {
    return db.collection('tenders').doc(tenderId).collection('supervision').doc().id;
  },
  async add(r: SupervisionReport): Promise<void> {
    await db
      .collection('tenders')
      .doc(r.tenderId)
      .collection('supervision')
      .doc(r.runId)
      .set(JSON.parse(JSON.stringify(r))); // deep-drops undefined (e.g. finding.evidence)
  },
  async list(tenderId: string): Promise<SupervisionReport[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('supervision').get();
    return q.docs.map((d) => d.data() as SupervisionReport);
  },
};

// ---- document content versions (internal; snapshots live in Storage) ----
export const versionsRepo = {
  async list(tenderId: string): Promise<DocVersion[]> {
    const s = await db.collection('tenders').doc(tenderId).collection('internal').doc('versions').get();
    return s.exists ? ((s.data() as { list: DocVersion[] }).list ?? []) : [];
  },
  async set(tenderId: string, list: DocVersion[]): Promise<void> {
    await db
      .collection('tenders')
      .doc(tenderId)
      .collection('internal')
      .doc('versions')
      .set({ list: JSON.parse(JSON.stringify(list)) });
  },
};

// ---- per-case success scores (internal read only) ----
export const caseScoresRepo = {
  async set(s: CaseScore): Promise<void> {
    await db.collection('caseScores').doc(s.tenderId).set(JSON.parse(JSON.stringify(s)));
  },
};

// ---- settings ----
export const settingsRepo = {
  async getScoring(): Promise<{ targets: Partial<ScoreTargets>; dci: Partial<DciParams> }> {
    const s = await db.collection('settings').doc('scoring').get();
    const d = (s.data() ?? {}) as { targets?: Partial<ScoreTargets>; dci?: Partial<DciParams> };
    return { targets: d.targets ?? {}, dci: d.dci ?? {} };
  },
  async setScoring(targets: ScoreTargets, dci?: DciParams): Promise<void> {
    await db.collection('settings').doc('scoring').set(stripUndefined({ targets, dci }));
  },
};

// ---- participant feedback ----
export const feedbackRepo = {
  /** Creates missing pending requests (existing ones — answered or not — are left untouched). */
  async createRequests(requests: FeedbackRequest[]): Promise<number> {
    let created = 0;
    for (const r of requests) {
      try {
        await db.collection('feedbackRequests').doc(r.id).create(r);
        created++;
      } catch {
        /* already exists */
      }
    }
    return created;
  },
  async getRequest(id: string): Promise<FeedbackRequest | null> {
    const s = await db.collection('feedbackRequests').doc(id).get();
    return s.exists ? (s.data() as FeedbackRequest) : null;
  },
  async answerRequest(id: string, status: 'done' | 'declined', at: number): Promise<void> {
    await db.collection('feedbackRequests').doc(id).set({ status, answeredAt: at }, { merge: true });
  },
  async listRequests(tenderId: string): Promise<FeedbackRequest[]> {
    const q = await db.collection('feedbackRequests').where('tenderId', '==', tenderId).get();
    return q.docs.map((d) => d.data() as FeedbackRequest);
  },
  async save(f: FeedbackDoc): Promise<void> {
    await db.collection('tenders').doc(f.tenderId).collection('feedback').doc(f.id).set(f);
  },
  async listForTender(tenderId: string): Promise<FeedbackDoc[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('feedback').get();
    return q.docs.map((d) => d.data() as FeedbackDoc);
  },
  async listSince(type: string, since: number): Promise<FeedbackDoc[]> {
    const q = await db.collectionGroup('feedback').where('submittedAt', '>=', since).get();
    return q.docs.map((d) => d.data() as FeedbackDoc).filter((f) => f.tenderType === type);
  },
};

export const skillTipsRepo = {
  newId(type: string): string {
    return db.collection('skillTips').doc(type).collection('runs').doc().id;
  },
  async save(r: SkillTipsRun): Promise<void> {
    await db
      .collection('skillTips')
      .doc(r.type)
      .collection('runs')
      .doc(r.runId)
      .set(JSON.parse(JSON.stringify(r)));
  },
};

/** All supervision runs since a time (for tips: most frequent finding codes). */
export async function supervisionSince(since: number): Promise<SupervisionReport[]> {
  const q = await db.collectionGroup('supervision').where('at', '>=', since).get();
  return q.docs.map((d) => d.data() as SupervisionReport);
}

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
