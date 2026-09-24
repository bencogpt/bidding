import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import {
  createTenderInput,
  grantAccessInput,
  askQuestionInput,
  answerQuestionsInput,
  setUserRoleInput,
  transitionTenderInput,
  upsertSupplierInput,
  createSupplierAccountInput,
  createInternalUserInput,
  deleteInternalUserInput,
  bindTemplateInput,
  createTemplateDocInput,
  syncTemplateFieldsInput,
  updateTemplateMetaInput,
  saveSubmissionInput,
  runComparisonInput,
  awardTenderInput,
  draftBidInput,
  searchSuppliersInput,
  parseDocId,
  detectPlaceholders,
  docExportTxtUrl,
  DEFAULT_INTERNAL_ACCESS,
  type TenderDoc,
  type AccessDoc,
  type QuestionDoc,
  type AnswerDoc,
  type SupplierDoc,
  type SubmissionDoc,
  type UserDoc,
} from '@obms/shared';
import { randomBytes } from 'node:crypto';
import { auth, db, now } from './lib/admin.js';
import { requireAuth, requireManager, requireInternal } from './lib/context.js';
import { parseInput } from './lib/validate.js';
import {
  tendersRepo,
  templatesRepo,
  accessRepo,
  questionsRepo,
  answersRepo,
  auditRepo,
  usersRepo,
  suppliersRepo,
  submissionsRepo,
} from './repositories.js';
import { transition } from './stateMachines/tenderFsm.js';
import {
  generateTenderDocument,
  getViewable,
  setDocumentPermissions,
  cacheTenderPdf,
  createTemplateDoc as createTemplateDocInDrive,
  readTemplateDocText,
  googleIdentityOf,
} from './services/docsService.js';
import {
  clusterQuestions,
  compareResponses,
  draftBidContent,
  suggestExternalSuppliers,
} from './services/aiService.js';
import { findCandidates } from './services/supplierSearch.js';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/**
 * Split internal users into Google Docs writer/commenter address lists.
 *
 * Only `tender_manager` becomes a writer — a writer is the only Docs role that can accept or
 * reject suggestions, so this split is what enforces "only the bid manager accepts changes".
 * Users with no real Google account are returned in `skipped` so the UI can flag them instead
 * of the grant failing silently.
 */
function splitDocsRecipients(users: UserDoc[]): {
  writerEmails: string[];
  commenterEmails: string[];
  skipped: string[];
} {
  const writerEmails: string[] = [];
  const commenterEmails: string[] = [];
  const skipped: string[] = [];
  for (const u of users) {
    const address = googleIdentityOf(u);
    if (!address) {
      skipped.push(u.displayName || u.email);
      continue;
    }
    if (u.role === 'tender_manager') writerEmails.push(address);
    else commenterEmails.push(address);
  }
  return { writerEmails, commenterEmails, skipped };
}

// Secrets for real Google Docs mode (dedicated account OAuth). Bound to doc-touching functions.
const DOCS_SECRETS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
];

// ---- Auth / roles ----
// Sets a user's role as a custom claim. Manager-only, except the very first bootstrap call
// when no managers exist yet (used by the seed script via the Auth emulator).
export const setUserRole = onCall(async (req) => {
  const input = parseInput(setUserRoleInput, req.data);
  const caller = requireAuth(req);
  if (caller.role !== 'tender_manager') {
    throw new HttpsError('permission-denied', 'רק מנהל מכרז יכול להקצות תפקידים.');
  }
  await auth.setCustomUserClaims(input.uid, {
    role: input.role,
    supplierId: input.supplierId,
  });
  const user = await auth.getUser(input.uid);
  await usersRepo.upsert({
    uid: input.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? user.email ?? input.uid,
    role: input.role,
    supplierId: input.supplierId,
    createdAt: now(),
  });
  await auditRepo.append({
    entityType: 'user',
    entityId: input.uid,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'set_role',
    prevState: null,
    newState: input.role,
  });
  return { ok: true };
});

// ---- Tenders ----
export const createTender = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(createTenderInput, req.data);

  const template = await templatesRepo.get(input.type);
  if (!template) {
    throw new HttpsError('failed-precondition', `אין תבנית לסוג המכרז: ${input.type}`);
  }

  const id = tendersRepo.newId();
  const tender: TenderDoc = {
    id,
    title: input.title,
    type: input.type,
    params: input.params,
    status: 'draft',
    googleDocId: null,
    docExportPath: null,
    ownerUid: caller.uid,
    submissionDeadline: input.submissionDeadline ?? null,
    awardDate: input.awardDate ?? null,
    awardedSupplierId: null,
    domainTags: input.domainTags ?? [],
    evaluationCriteria: input.evaluationCriteria ?? [],
    createdAt: now(),
    updatedAt: now(),
  };
  await tendersRepo.create(tender);

  // System detects type -> generates the document from the matching template.
  const gen = await generateTenderDocument(tender, template);
  await tendersRepo.update(id, {
    googleDocId: gen.googleDocId,
    docExportPath: gen.exportPath,
  });

  // Every internal user gets access to the bid document at creation: the manager edits, all
  // other internal roles comment + suggest. No one has to be assigned by hand first.
  const internalUsers = await usersRepo.listInternal();
  for (const u of internalUsers) {
    const a: AccessDoc = {
      principalId: u.uid,
      kind: 'internal',
      level: DEFAULT_INTERNAL_ACCESS[u.role] ?? 'comment',
      displayName: u.displayName,
      grantedBy: caller.uid,
      grantedAt: now(),
    };
    await accessRepo.grant(id, a);
  }
  // The creating manager, who may not be in `users` yet (e.g. first Google SSO sign-in).
  if (!internalUsers.some((u) => u.uid === caller.uid)) {
    await accessRepo.grant(id, {
      principalId: caller.uid,
      kind: 'internal',
      level: 'edit',
      displayName: caller.name,
      grantedBy: caller.uid,
      grantedAt: now(),
    });
  }

  const { writerEmails, commenterEmails, skipped } = splitDocsRecipients(internalUsers);
  // The caller's own token email is a real Google address when they signed in with SSO, so it is
  // an acceptable fallback for the owner only.
  const callerAddress =
    googleIdentityOf(internalUsers.find((u) => u.uid === caller.uid) ?? {}) ?? caller.email;
  if (callerAddress && !writerEmails.includes(callerAddress)) writerEmails.push(callerAddress);

  await setDocumentPermissions(gen.googleDocId, {
    writerEmails,
    commenterEmails,
  });

  await auditRepo.append({
    entityType: 'tender',
    entityId: id,
    tenderId: id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create',
    prevState: null,
    newState: 'draft',
    detail: `${input.type}: ${input.title}`,
  });
  // One summary entry rather than one per user — the access docs are the record of who got what.
  await auditRepo.append({
    entityType: 'tender',
    entityId: id,
    tenderId: id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'auto_grant_internal',
    prevState: null,
    newState: `${internalUsers.length} internal users`,
    detail: skipped.length ? `ללא חשבון Google: ${skipped.join(', ')}` : undefined,
  });
  return { id, docsSkipped: skipped };
});

export const transitionTender = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(transitionTenderInput, req.data);
  await transition(caller, input.tenderId, input.to);
  // Cache the exported PDF at publish so suppliers load it fast (no live Google export).
  if (input.to === 'published') {
    const tender = await tendersRepo.get(input.tenderId);
    if (tender) {
      const path = await cacheTenderPdf(tender);
      if (path) await tendersRepo.update(input.tenderId, { docExportPath: path });
    }
  }
  return { ok: true };
});

// Manager re-exports + re-caches the bid PDF after editing the Google Doc.
export const refreshTenderDocument = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(runComparisonInput, req.data); // { tenderId }
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const path = await cacheTenderPdf(tender);
  if (path) await tendersRepo.update(input.tenderId, { docExportPath: path });
  await auditRepo.append({
    entityType: 'tender',
    entityId: input.tenderId,
    tenderId: input.tenderId,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'refresh_document',
    prevState: null,
    newState: null,
  });
  return { ok: true, cached: !!path };
});

// ---- Access & sharing ----
export const grantAccess = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(grantAccessInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');

  // Suppliers -> view access (in-system only, no Google Docs permission).
  for (const supplierId of input.supplierIds ?? []) {
    const supplier = await suppliersRepo.get(supplierId);
    if (!supplier) continue;
    const a: AccessDoc = {
      principalId: supplierId,
      kind: 'supplier',
      level: 'view',
      displayName: supplier.name,
      grantedBy: caller.uid,
      grantedAt: now(),
    };
    await accessRepo.grant(input.tenderId, a);
    await auditRepo.append({
      entityType: 'tender',
      entityId: input.tenderId,
      tenderId: input.tenderId,
      actorUid: caller.uid,
      actorName: caller.name,
      action: 'share_supplier',
      prevState: null,
      newState: supplier.name,
    });
  }

  // Internal reviewers -> comment access (Google Docs commenter in prod). Managers -> writer.
  const grantedUsers: UserDoc[] = [];
  for (const uid of input.internalUids ?? []) {
    const user = await usersRepo.get(uid);
    if (!user) continue;
    const a: AccessDoc = {
      principalId: uid,
      kind: 'internal',
      level: DEFAULT_INTERNAL_ACCESS[user.role] ?? 'comment',
      displayName: user.displayName,
      grantedBy: caller.uid,
      grantedAt: now(),
    };
    await accessRepo.grant(input.tenderId, a);
    grantedUsers.push(user);
    await auditRepo.append({
      entityType: 'tender',
      entityId: input.tenderId,
      tenderId: input.tenderId,
      actorUid: caller.uid,
      actorName: caller.name,
      action: 'assign_reviewer',
      prevState: null,
      newState: user.displayName,
    });
  }
  const { writerEmails, commenterEmails, skipped } = splitDocsRecipients(grantedUsers);
  if (writerEmails.length || commenterEmails.length) {
    await setDocumentPermissions(tender.googleDocId, {
      writerEmails,
      commenterEmails,
    });
  }
  return { ok: true, docsSkipped: skipped };
});

// Returns the rendered tender document for the in-system viewer (authorization checked here).
export const getTenderDocument = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(askQuestionInput.pick({ tenderId: true }), req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');

  if (caller.role === 'supplier') {
    if (!caller.supplierId) throw new HttpsError('permission-denied', 'ספק לא מזוהה.');
    const access = await accessRepo.get(input.tenderId, caller.supplierId);
    if (!access) throw new HttpsError('permission-denied', 'אין הרשאת צפייה למכרז זה.');
  }
  return getViewable(tender);
});

// ---- Clarification Q&A ----
export const askQuestion = onCall(async (req) => {
  const caller = requireAuth(req);
  if (caller.role !== 'supplier' || !caller.supplierId) {
    throw new HttpsError('permission-denied', 'רק ספק יכול לשאול שאלות.');
  }
  const input = parseInput(askQuestionInput, req.data);
  const access = await accessRepo.get(input.tenderId, caller.supplierId);
  if (!access) throw new HttpsError('permission-denied', 'אין הרשאה למכרז זה.');

  const supplier = await suppliersRepo.get(caller.supplierId);
  const supplierName = supplier?.name ?? caller.name;
  const id = questionsRepo.newId(input.tenderId);
  // The question itself is anonymous; the asker goes to a separately secured sibling doc.
  const q: QuestionDoc = {
    id,
    text: input.text,
    clusterId: null,
    answered: false,
    createdAt: now(),
  };
  await questionsRepo.add(input.tenderId, q, {
    questionId: id,
    supplierId: caller.supplierId,
    supplierName,
    createdAt: q.createdAt,
  });
  // Audit keeps the real identity for accountability — auditLog is readable by internal roles
  // only, so this is not a route back to the asker for a competing supplier.
  await auditRepo.append({
    entityType: 'tender',
    entityId: input.tenderId,
    tenderId: input.tenderId,
    actorUid: caller.uid,
    actorName: supplierName,
    action: 'ask_question',
    prevState: null,
    newState: null,
  });
  return { id };
});

// Cluster a tender's open questions by similarity (Claude) so the manager answers once.
export const clusterTenderQuestions = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
  async (req) => {
    const caller = requireManager(req);
    const input = parseInput(askQuestionInput.pick({ tenderId: true }), req.data);
    const questions = await questionsRepo.list(input.tenderId);
    const clusters = await clusterQuestions(questions);
    for (const c of clusters) {
      for (const qid of c.questionIds) {
        await questionsRepo.setCluster(input.tenderId, qid, c.clusterId);
      }
    }
    void caller;
    return { clusters };
  },
);

export const answerQuestions = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(answerQuestionsInput, req.data);
  const id = answersRepo.newId(input.tenderId);
  const answer: AnswerDoc = {
    id,
    clusterId: input.clusterId,
    questionIds: input.questionIds,
    text: input.text,
    answeredBy: caller.name,
    createdAt: now(),
  };
  await answersRepo.add(input.tenderId, answer);
  await questionsRepo.markAnswered(input.tenderId, input.questionIds);
  await auditRepo.append({
    entityType: 'tender',
    entityId: input.tenderId,
    tenderId: input.tenderId,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'answer_questions',
    prevState: null,
    newState: input.clusterId,
  });
  return { id };
});

// ---- Stubs exposed for the slice ----
// Supplier saves/updates their proposal (files already uploaded to Storage + a summary).
// Enforced server-side: must have access and the deadline must not have passed.
export const saveSubmission = onCall(async (req) => {
  const caller = requireAuth(req);
  if (caller.role !== 'supplier' || !caller.supplierId) {
    throw new HttpsError('permission-denied', 'רק ספק יכול להגיש הצעה.');
  }
  const input = parseInput(saveSubmissionInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const access = await accessRepo.get(input.tenderId, caller.supplierId);
  if (!access) throw new HttpsError('permission-denied', 'אין הרשאה למכרז זה.');
  if (tender.submissionDeadline && now() > tender.submissionDeadline) {
    throw new HttpsError('failed-precondition', 'מועד ההגשה חלף — ההגשה נעולה.');
  }

  const supplier = await suppliersRepo.get(caller.supplierId);
  const submission: SubmissionDoc = {
    supplierId: caller.supplierId,
    supplierName: supplier?.name ?? caller.name,
    files: input.files,
    summary: input.summary,
    status: 'editable',
    submittedAt: now(),
  };
  await submissionsRepo.upsert(input.tenderId, submission);

  // First response moves the tender published -> responses.
  if (tender.status === 'published') {
    await transition(caller, input.tenderId, 'responses');
  }
  await auditRepo.append({
    entityType: 'tender',
    entityId: input.tenderId,
    tenderId: input.tenderId,
    actorUid: caller.uid,
    actorName: submission.supplierName,
    action: 'submit_proposal',
    prevState: null,
    newState: `${input.files.length} files`,
  });
  return { ok: true };
});

// Manager runs the AI comparison over the submitted proposals; stores the report and moves
// the tender to "evaluated". Non-binding — the award decision stays with the manager.
export const runComparison = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
  async (req) => {
    const caller = requireManager(req);
    const input = parseInput(runComparisonInput, req.data);
    const tender = await tendersRepo.get(input.tenderId);
    if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');

    const submissions = await submissionsRepo.list(input.tenderId);
    if (submissions.length === 0) {
      throw new HttpsError('failed-precondition', 'אין הצעות להשוואה.');
    }
    const proposals = submissions.map((s) => ({
      supplierId: s.supplierId,
      name: s.supplierName,
      summary: s.summary,
    }));
    const report = await compareResponses(
      input.tenderId,
      proposals,
      tender.evaluationCriteria ?? [],
    );
    await tendersRepo.update(input.tenderId, { comparisonReport: report });
    if (tender.status === 'responses') {
      await transition(caller, input.tenderId, 'evaluated');
    }
    await auditRepo.append({
      entityType: 'tender',
      entityId: input.tenderId,
      tenderId: input.tenderId,
      actorUid: caller.uid,
      actorName: caller.name,
      action: 'run_comparison',
      prevState: null,
      newState: report.isStub ? 'stub' : report.model,
    });
    return report;
  },
);

// Manager awards the tender to a supplier (final decision).
export const awardTender = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(awardTenderInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const supplier = await suppliersRepo.get(input.supplierId);
  if (!supplier) throw new HttpsError('not-found', 'ספק לא נמצא.');

  await tendersRepo.update(input.tenderId, {
    awardedSupplierId: input.supplierId,
    awardDate: now(),
  });
  await transition(caller, input.tenderId, 'awarded');
  await auditRepo.append({
    entityType: 'tender',
    entityId: input.tenderId,
    tenderId: input.tenderId,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'award',
    prevState: null,
    newState: supplier.name,
  });
  return { ok: true };
});

// Offer registered suppliers (ranked by domain-tag overlap, Israeli-first) + AI-suggested
// external candidates (Israeli-first, unverified) for a bid.
// timeoutSeconds: the web-search research step routinely runs past the 60s default.
export const searchSuppliers = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
  async (req) => {
    requireInternal(req);
    const input = parseInput(searchSuppliersInput, req.data);
    const tags = input.domainTags ?? [];
    const [registered, external] = await Promise.all([
      findCandidates(tags),
      suggestExternalSuppliers(tags, input.type),
    ]);
    return { registered, external };
  },
);

// Agentic new-bid draft: brief -> full draft (title/params/tags/deadlines/criteria). Non-binding.
// timeoutSeconds: measured 47s for a template with only 32 placeholders — large templates and
// long param lists push well past the 60s default.
export const draftBid = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
  async (req) => {
    requireManager(req);
    const input = parseInput(draftBidInput, req.data);
    const template = await templatesRepo.get(input.type);
    if (!template) throw new HttpsError('failed-precondition', `אין תבנית לסוג: ${input.type}`);
    return draftBidContent(input.type, input.brief, template);
  },
);

// ---- Templates: bind a Google Doc to a bid type ----
const DEFAULT_TEMPLATE_TITLE: Record<string, string> = {
  goods: 'תבנית מכרז טובין',
  service: 'תבנית מכרז שירות וכוח-אדם',
  project: 'תבנית מכרז פרויקטלי',
};

export const bindTemplateGoogleDoc = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(bindTemplateInput, req.data);
  const docId = parseDocId(input.urlOrId);
  if (!docId) {
    throw new HttpsError('invalid-argument', 'קישור Google Docs לא תקין.');
  }
  const existing = await templatesRepo.get(input.type);

  // Import the doc's text via the public export endpoint (works for link-viewable docs,
  // no service account needed). If it isn't readable, keep the binding + warn.
  let bodyTemplate = existing?.bodyTemplate ?? '';
  let params = existing?.params ?? [];
  let warning: string | null = null;
  try {
    const res = await fetch(docExportTxtUrl(docId), { redirect: 'follow' });
    const contentType = res.headers.get('content-type') ?? '';
    if (res.ok && contentType.includes('text/plain')) {
      const text = await res.text();
      bodyTemplate = text;
      params = detectPlaceholders(text);
    } else {
      warning = 'doc-not-readable';
    }
  } catch {
    warning = 'doc-not-readable';
  }

  await templatesRepo.upsert({
    type: input.type,
    title: input.title || existing?.title || DEFAULT_TEMPLATE_TITLE[input.type] || input.type,
    googleTemplateDocId: docId,
    sourceUrl: input.urlOrId,
    bodyTemplate,
    params,
  });
  await auditRepo.append({
    entityType: 'template',
    entityId: input.type,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'bind_template',
    prevState: existing?.googleTemplateDocId ?? null,
    newState: docId,
  });
  return { docId, params, warning };
});

// Create a private, system-owned Google Doc template for a bid type (seeded from bodyTemplate).
export const createTemplateDoc = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(createTemplateDocInput, req.data);
  const existing = await templatesRepo.get(input.type);
  const title = input.title || existing?.title || DEFAULT_TEMPLATE_TITLE[input.type] || input.type;
  const { docId, url } = await createTemplateDocInDrive(title, existing?.bodyTemplate ?? '');
  await templatesRepo.patch(input.type, {
    title,
    googleTemplateDocId: docId,
    sourceUrl: url,
  });
  await auditRepo.append({
    entityType: 'template',
    entityId: input.type,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create_template_doc',
    prevState: null,
    newState: docId,
  });
  return { docId, url };
});

// Read the (system-owned) template Doc back and auto-detect its {{fields}} — no public sharing.
export const syncTemplateFields = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(syncTemplateFieldsInput, req.data);
  const existing = await templatesRepo.get(input.type);
  if (!existing?.googleTemplateDocId) {
    throw new HttpsError('failed-precondition', 'אין מסמך תבנית לסוג זה. צור מסמך תחילה.');
  }
  const text = await readTemplateDocText(existing.googleTemplateDocId);
  const params = detectPlaceholders(text);
  await templatesRepo.patch(input.type, { bodyTemplate: text, params });
  await auditRepo.append({
    entityType: 'template',
    entityId: input.type,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'sync_template_fields',
    prevState: null,
    newState: `${params.length} fields`,
  });
  return { params };
});

// Manager curates per-type reference examples + the "bid manager skill" markdown.
export const updateTemplateMeta = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(updateTemplateMetaInput, req.data);
  await templatesRepo.patch(input.type, {
    examples: input.examples,
    skillMd: input.skillMd,
  });
  await auditRepo.append({
    entityType: 'template',
    entityId: input.type,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'update_template_meta',
    prevState: null,
    newState: input.type,
  });
  return { ok: true };
});

// NOTE: sign-in blocking (only registered users may sign in) is implemented as a `beforeUserSignedIn`
// blocking function — but it requires the project to be upgraded to Identity Platform (GCIP), which
// isn't enabled yet, and its presence aborts every functions deploy. It's therefore DISABLED here.
// The client-side guard (web Unauthorized page) enforces access meanwhile. To enable: upgrade to
// Identity Platform, restore the export below, and deploy `--only functions:beforesignin`.
//
// export const beforesignin = beforeUserSignedIn(async (event) => {
//   const email = event.data?.email;
//   const registered = email ? await usersRepo.byEmail(email) : null;
//   if (!registered) throw new HttpsError('permission-denied', 'משתמש לא רשום. פנה למנהל המכרז.');
// });

// ---- Internal users (manager defines internal actors with roles) ----
export const createInternalUser = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(createInternalUserInput, req.data);

  let uid: string;
  let tempPassword: string | undefined;
  try {
    const user = await auth.getUserByEmail(input.email);
    uid = user.uid; // link existing account
  } catch {
    tempPassword = randomBytes(9).toString('base64url');
    const user = await auth.createUser({
      email: input.email,
      password: tempPassword,
      displayName: input.name,
    });
    uid = user.uid;
  }
  await auth.setCustomUserClaims(uid, { role: input.role });
  await usersRepo.upsert({
    uid,
    email: input.email,
    displayName: input.name,
    role: input.role,
    googleEmail: input.googleEmail, // stripUndefined drops it when not provided
    createdAt: now(),
  });
  await auditRepo.append({
    entityType: 'user',
    entityId: uid,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create_internal_user',
    prevState: null,
    newState: input.role,
  });
  return { email: input.email, tempPassword: tempPassword ?? null };
});

// Delete an internal user: removes the login + the users doc so they can no longer sign in.
export const deleteInternalUser = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(deleteInternalUserInput, req.data);
  if (input.uid === caller.uid) {
    throw new HttpsError('failed-precondition', 'לא ניתן למחוק את עצמך.');
  }
  const user = await usersRepo.get(input.uid);
  await usersRepo.remove(input.uid);
  try {
    await auth.deleteUser(input.uid);
  } catch {
    /* auth account may already be gone */
  }
  await auditRepo.append({
    entityType: 'user',
    entityId: input.uid,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'delete_internal_user',
    prevState: user?.role ?? null,
    newState: null,
  });
  return { ok: true };
});

// ---- Supplier management (manager defines the supplier database) ----
export const upsertSupplier = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(upsertSupplierInput, req.data);
  const existing = input.id ? await suppliersRepo.get(input.id) : null;
  const id = input.id ?? db.collection('suppliers').doc().id;
  const supplier: SupplierDoc = {
    id,
    name: input.name,
    contactEmail: input.contactEmail,
    country: input.country,
    isIsraeli: input.isIsraeli,
    status: input.status,
    domainTags: input.domainTags ?? existing?.domainTags ?? [],
    createdAt: existing?.createdAt ?? now(),
  };
  await suppliersRepo.upsert(supplier);
  await auditRepo.append({
    entityType: 'supplier',
    entityId: id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: existing ? 'update_supplier' : 'create_supplier',
    prevState: existing?.status ?? null,
    newState: input.status,
    detail: input.name,
  });
  return { id };
});

// Create (or link) a Firebase Auth login for a supplier with the supplier role + claim.
export const createSupplierAccount = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(createSupplierAccountInput, req.data);
  const supplier = await suppliersRepo.get(input.supplierId);
  if (!supplier) throw new HttpsError('not-found', 'ספק לא נמצא.');
  // contactEmail is optional on the registry record (AI-sourced suppliers may not have one yet),
  // but a login cannot be created without it.
  const contactEmail = supplier.contactEmail;
  if (!contactEmail) {
    throw new HttpsError(
      'failed-precondition',
      'לספק זה אין כתובת דוא״ל. הוסף כתובת דוא״ל לספק לפני יצירת חשבון.',
    );
  }

  let uid: string;
  let tempPassword: string | undefined;
  try {
    const user = await auth.getUserByEmail(contactEmail);
    uid = user.uid; // account already exists — just (re)apply the claim
  } catch {
    tempPassword = randomBytes(9).toString('base64url');
    const user = await auth.createUser({
      email: contactEmail,
      password: tempPassword,
      displayName: supplier.name,
    });
    uid = user.uid;
  }
  await auth.setCustomUserClaims(uid, {
    role: 'supplier',
    supplierId: supplier.id,
  });
  await usersRepo.upsert({
    uid,
    email: contactEmail,
    displayName: supplier.name,
    role: 'supplier',
    supplierId: supplier.id,
    createdAt: now(),
  });
  await auditRepo.append({
    entityType: 'supplier',
    entityId: supplier.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create_supplier_account',
    prevState: null,
    newState: contactEmail,
  });
  return { email: contactEmail, tempPassword: tempPassword ?? null };
});
