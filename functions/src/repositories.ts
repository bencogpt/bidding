// Repository layer: the ONLY place that touches Firestore directly (constitution:
// Repository Pattern — no raw firestore.collection(...).set(...) outside this file).
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, now } from './lib/admin.js';
import { nextUsage, type UsageWindow } from './lib/rateWindow.js';
import { isInternalRole, formatSerial, withBuiltinFills, SUPERVISION_RUN_STALE_MS } from '@obms/shared';
import type { TeamRole, TeamApproval, SupervisionRunState, FindingDecisionRecord } from '@obms/shared';
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
  ConversionRun,
  BidRequestDoc,
  RequestResearch,
  ComparisonReport,
  ResearchDraft,
  ResearchSummary,
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
  /** Users holding one role (a unit's colleagues, for its contact assignment). */
  async listByRole(role: string): Promise<UserDoc[]> {
    const q = await db.collection('users').where('role', '==', role).get();
    return q.docs.map((d) => d.data() as UserDoc);
  },
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
  /** The template as cases use it: with the built-in fill rules (by field name) attached. Not for saving. */
  async getForCase(type: string): Promise<TemplateDoc | null> {
    const t = await templatesRepo.get(type);
    return t ? { ...t, params: withBuiltinFills(t.params ?? []) } : null;
  },
  async patch(type: string, data: Partial<TemplateDoc>): Promise<void> {
    assertTemplateFits(data);
    await db.collection('templates').doc(type).set(stripUndefined(data), { merge: true });
  },
};

// ---- counters (gapless serial numbers) ----
export const countersRepo = {
  /** Next BID-{year}-NNNN, allocated atomically so two concurrent creates never share a number. */
  async nextSerial(year: number): Promise<string> {
    const ref = db.collection('counters').doc(`bidSerial-${year}`);
    const n = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = ((snap.data()?.last as number | undefined) ?? 0) + 1;
      tx.set(ref, { last: next, year }, { merge: true });
      return next;
    });
    return formatSerial(year, n);
  },
  /** Raise the counter to at least `n` (used by the serial backfill). */
  async ensureAtLeast(year: number, n: number): Promise<void> {
    const ref = db.collection('counters').doc(`bidSerial-${year}`);
    await db.runTransaction(async (tx) => {
      const last = ((await tx.get(ref)).data()?.last as number | undefined) ?? 0;
      if (n > last) tx.set(ref, { last: n, year }, { merge: true });
    });
  },
};

// ---- bid requests (the requester's summary; doc id = the bid number, which is the uniqueness lock) ----
export const bidRequestsRepo = {
  /** Create the request; false (nothing written) if this bid number already exists. */
  async tryCreate(r: BidRequestDoc): Promise<boolean> {
    try {
      await db.collection('bidRequests').doc(r.serial).create(stripUndefined(r));
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 6) return false; // gRPC ALREADY_EXISTS
      throw err;
    }
  },
  async get(serial: string): Promise<BidRequestDoc | null> {
    const s = await db.collection('bidRequests').doc(serial).get();
    return s.exists ? (s.data() as BidRequestDoc) : null;
  },
  /** The request a previous submit of the same form already created (same user only). */
  async byClientRequestId(uid: string, clientRequestId: string): Promise<BidRequestDoc | null> {
    const q = await db
      .collection('bidRequests')
      .where('requesterUid', '==', uid)
      .where('clientRequestId', '==', clientRequestId)
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0].data() as BidRequestDoc);
  },
  /** The request's research summary (status + latest run). */
  async setResearch(serial: string, research: ResearchSummary): Promise<void> {
    await db.collection('bidRequests').doc(serial).set({ research }, { merge: true });
  },
};

// ---- requirement research runs (bidRequests/{serial}/research/{runId}; function-only writes) ----
export const researchRepo = {
  newId(serial: string): string {
    return db.collection('bidRequests').doc(serial).collection('research').doc().id;
  },
  async save(r: RequestResearch): Promise<void> {
    await db
      .collection('bidRequests')
      .doc(r.serial)
      .collection('research')
      .doc(r.runId)
      .set(JSON.parse(JSON.stringify(r)));
  },
};

// ---- research run before its request existed (Admin SDK only; clients never read it) ----
export const researchDraftsRepo = {
  newId(): string {
    return db.collection('researchDrafts').doc().id;
  },
  async save(r: ResearchDraft): Promise<void> {
    await db.collection('researchDrafts').doc(r.runId).set(JSON.parse(JSON.stringify(r)));
  },
  async get(runId: string): Promise<ResearchDraft | null> {
    const s = await db.collection('researchDrafts').doc(runId).get();
    return s.exists ? (s.data() as ResearchDraft) : null;
  },
};

// ---- per-user call counter for the request agent (one document per user; the Admin SDK only) ----
export const agentUsageRepo = {
  /** Count one call; false (nothing counted) when the user is over the limit for the current window. */
  async take(uid: string, limit: number, windowMs: number, nowMs: number, bucket?: string): Promise<boolean> {
    // A separate bucket (e.g. the costlier web research) has its own window.
    const ref = db.collection('agentUsage').doc(bucket ? `${uid}__${bucket}` : uid);
    return db.runTransaction(async (tx) => {
      const prev = (await tx.get(ref)).data() as UsageWindow | undefined;
      const { allowed, next } = nextUsage(prev, nowMs, limit, windowMs);
      if (allowed) tx.set(ref, next);
      return allowed;
    });
  },
};

// ---- atomic case creation (all-or-nothing, retry-safe) ----
export const caseCreationRepo = {
  /** The case a previous submission with this request id already created (same user only). */
  async existing(requestId: string, uid: string): Promise<{ tenderId: string; serial: string } | null> {
    const s = await db.collection('createRequests').doc(requestId).get();
    const d = s.data() as { tenderId: string; serial: string; uid: string } | undefined;
    return d && d.uid === uid ? { tenderId: d.tenderId, serial: d.serial } : null;
  },
  /**
   * Write the case and everything it needs in ONE batch: the tender, team access, provenance,
   * confidential params and the request marker. Either all of it exists or none of it does.
   */
  async commit(c: {
    tender: TenderDoc;
    access: AccessDoc[];
    provenance: TenderProvenance;
    internalParams: Record<string, string | number>;
    requestId: string | null;
    uid: string;
    bidRequestSerial: string;
  }): Promise<void> {
    const ref = db.collection('tenders').doc(c.tender.id);
    const reqRef = db.collection('bidRequests').doc(c.bidRequestSerial);
    await db.runTransaction(async (tx) => {
      // Read first: the request must still be open, or a second manager would create a twin.
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists || reqSnap.get('status') !== 'open') {
        throw new HttpsError('failed-precondition', 'הבקשה כבר הומרה למכרז.');
      }
      tx.create(ref, c.tender);
      for (const a of c.access) tx.set(ref.collection('access').doc(a.principalId), a);
      tx.set(ref.collection('internal').doc('provenance'), c.provenance);
      if (Object.keys(c.internalParams).length) tx.set(ref.collection('internal').doc('params'), c.internalParams);
      if (c.requestId) {
        // create() fails if this request already committed — a concurrent duplicate can't slip in.
        tx.create(db.collection('createRequests').doc(c.requestId), {
          tenderId: c.tender.id,
          serial: c.tender.serial,
          uid: c.uid,
          at: now(),
        });
      }
      tx.update(reqRef, { status: 'converted', tenderId: c.tender.id, convertedAt: now() });
    });
  },
};

// ---- tenders ----
export const tendersRepo = {
  /**
   * Claim document creation for a draft (documentStatus none → generating) in a transaction, so two
   * concurrent requests can't both create a document. Returns false if not claimable.
   */
  async claimDocumentGeneration(id: string): Promise<boolean> {
    const ref = db.collection('tenders').doc(id);
    return db.runTransaction(async (tx) => {
      const t = (await tx.get(ref)).data() as TenderDoc | undefined;
      if (!t || (t.documentStatus ?? 'none') !== 'none' || t.googleDocId || t.docExportPath) return false;
      tx.update(ref, { documentStatus: 'generating', updatedAt: now() });
      return true;
    });
  },
  /**
   * Start the agent's run on the case (plan B1). With `exclusive`, refuses (returns false) while another run
   * is still going — two people pressing "הרץ בדיקה" don't start two runs. A run older than
   * SUPERVISION_RUN_STALE_MS is treated as dead. Checkpoints (approvals, publish) run regardless.
   */
  async claimSupervisionRun(id: string, run: SupervisionRunState, exclusive: boolean): Promise<boolean> {
    const ref = db.collection('tenders').doc(id);
    return db.runTransaction(async (tx) => {
      const t = (await tx.get(ref)).data() as TenderDoc | undefined;
      if (!t) return false;
      const cur = t.supervisionRun;
      if (exclusive && cur?.state === 'running' && run.startedAt - cur.startedAt < SUPERVISION_RUN_STALE_MS) return false;
      tx.update(ref, { supervisionRun: run });
      return true;
    });
  },
  /** Move the run's thinking step forward, or close it — only if it is still the same run. */
  async updateSupervisionRun(id: string, runId: string, patch: Partial<Pick<SupervisionRunState, 'step' | 'state'>>): Promise<void> {
    const ref = db.collection('tenders').doc(id);
    await db.runTransaction(async (tx) => {
      const t = (await tx.get(ref)).data() as TenderDoc | undefined;
      if (t?.supervisionRun?.runId !== runId) return;
      tx.update(ref, Object.fromEntries(Object.entries(patch).map(([k, v]) => [`supervisionRun.${k}`, v])));
    });
  },
  /** Replace the decisions on findings outright (resolved ones disappear — a merge would keep them). */
  async setFindingDecisions(id: string, decisions: Record<string, FindingDecisionRecord>): Promise<void> {
    await db.collection('tenders').doc(id).update({ findingDecisions: decisions });
  },
  /** Replace draft data fields outright (params is a full map — a cleared value must disappear). */
  async replaceDraftData(id: string, patch: Partial<TenderDoc>): Promise<void> {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await db.collection('tenders').doc(id).update({ ...clean, updatedAt: now() });
  },
  /** Cases that asked a unit to assign its contact (plan D3); the caller filters those already assigned. */
  async listUnitRequests(role: string): Promise<TenderDoc[]> {
    const q = await db.collection('tenders').where('unitRequests', 'array-contains', role).get();
    return q.docs.map((d) => d.data() as TenderDoc);
  },
  async listAll(): Promise<TenderDoc[]> {
    const q = await db.collection('tenders').get();
    return q.docs.map((d) => d.data() as TenderDoc);
  },
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
  /** Record (or, with null, withdraw) one role's approval. Written by path so the others stay. */
  async setApproval(id: string, role: TeamRole, approval: TeamApproval | null): Promise<void> {
    await db
      .collection('tenders')
      .doc(id)
      .update({
        [`approvals.${role}`]: approval ?? FieldValue.delete(),
        updatedAt: now(),
      });
  },
  /** Start a clean round of approvals (a review begins). */
  async clearApprovals(id: string): Promise<void> {
    await db.collection('tenders').doc(id).update({ approvals: FieldValue.delete() });
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
  /** The tender ids a principal (supplier) has access to. */
  async tenderIdsFor(principalId: string): Promise<string[]> {
    const q = await db.collectionGroup('access').where('principalId', '==', principalId).get();
    return q.docs.map((d) => d.ref.parent.parent?.id).filter((id): id is string => !!id);
  },
  /** Questions a supplier asked on a tender (their own authorship records only). */
  async questionIdsBy(tenderId: string, supplierId: string): Promise<string[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('questionAuthors').where('supplierId', '==', supplierId).get();
    return q.docs.map((d) => d.id);
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
  async list(tenderId: string): Promise<AnswerDoc[]> {
    const q = await db.collection('tenders').doc(tenderId).collection('answers').get();
    return q.docs.map((d) => d.data() as AnswerDoc);
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
  async get(tenderId: string, supplierId: string): Promise<SubmissionDoc | null> {
    const s = await db.collection('tenders').doc(tenderId).collection('submissions').doc(supplierId).get();
    return s.exists ? (s.data() as SubmissionDoc) : null;
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
  /** The AI comparison report (internal: never on the supplier-readable tender doc). */
  async getComparison(tenderId: string): Promise<ComparisonReport | null> {
    const s = await db.collection('tenders').doc(tenderId).collection('internal').doc('comparison').get();
    return s.exists ? (s.data() as ComparisonReport) : null;
  },
  async setComparison(tenderId: string, report: ComparisonReport): Promise<void> {
    await db.collection('tenders').doc(tenderId).collection('internal').doc('comparison').set(JSON.parse(JSON.stringify(report)));
  },
  /** Suppliers picked before publication (internal; they get access when the case is published). */
  async getPendingSuppliers(tenderId: string): Promise<string[]> {
    const s = await db.collection('tenders').doc(tenderId).collection('internal').doc('suppliers').get();
    return s.exists ? ((s.data()?.supplierIds as string[]) ?? []) : [];
  },
  async setPendingSuppliers(tenderId: string, supplierIds: string[], by: string): Promise<void> {
    await db
      .collection('tenders')
      .doc(tenderId)
      .collection('internal')
      .doc('suppliers')
      .set({ supplierIds, updatedAt: now(), updatedBy: by });
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
  async get(tenderId: string, runId: string): Promise<SupervisionReport | null> {
    const s = await db.collection('tenders').doc(tenderId).collection('supervision').doc(runId).get();
    return s.exists ? (s.data() as SupervisionReport) : null;
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

// ---- template conversion proposals (templates/{type}/conversions/{runId}) ----
export const conversionsRepo = {
  newId(type: string): string {
    return db.collection('templates').doc(type).collection('conversions').doc().id;
  },
  async save(r: ConversionRun): Promise<void> {
    await db
      .collection('templates')
      .doc(r.type)
      .collection('conversions')
      .doc(r.runId)
      .set(JSON.parse(JSON.stringify(r)));
  },
  async get(type: string, runId: string): Promise<ConversionRun | null> {
    const s = await db.collection('templates').doc(type).collection('conversions').doc(runId).get();
    return s.exists ? (s.data() as ConversionRun) : null;
  },
  async markApplied(type: string, runId: string, at: number): Promise<void> {
    await db.collection('templates').doc(type).collection('conversions').doc(runId).set({ appliedAt: at }, { merge: true });
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
