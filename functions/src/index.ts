import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import {
  createTenderInput,
  createBidRequestInput,
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
  setTemplateInternalFieldsInput,
  saveSubmissionInput,
  runComparisonInput,
  awardTenderInput,
  draftBidInput,
  searchSuppliersInput,
  refreshTenderDocumentInput,
  runSupervisionInput,
  recomputeCaseScoreInput,
  updateScoringTargetsInput,
  submitFeedbackInput,
  declineFeedbackInput,
  generateSkillTipsInput,
  assignTeamMemberInput,
  setRequiredRolesInput,
  requiredRolesFor,
  TENDER_TYPE_LABELS_HE,
  missingRoles,
  memberUidsOf,
  REQUIRED_ROLES_BY_TYPE,
  TEAM_ROLES,
  ROLE_LABELS_HE,
  isSupplierVisible,
  canTransition,
  templateIdFor,
  toG9Flag,
  parseDocId,
  detectPlaceholders,
  mergeSyncedParams,
  templateFieldsStatus,
  hasPlaceholder,
  isAutoSerialParam,
  isSystemParam,
  resolveSystemFills,
  SERVICE_KEYS,
  isAutoDeadlineParam,
  isAutoParam,
  formatDeadlineFor,
  analyzeTemplateFieldsInput,
  applyTemplateConversionInput,
  docExportTxtUrl,
  DEFAULT_INTERNAL_ACCESS,
  type TenderDoc,
  type AccessDoc,
  type QuestionDoc,
  type AnswerDoc,
  type SupplierDoc,
  type SubmissionDoc,
  type UserDoc,
  type TemplateDoc,
  type TenderProvenance,
  type SupervisionReport,
  type CaseTeam,
  type TeamRole,
} from '@obms/shared';
import { randomBytes } from 'node:crypto';
import { auth, db, now } from './lib/admin.js';
import { requireAuth, requireRole, requireManager, requireInternal, requireCaseAccess } from './lib/context.js';
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
  bidDraftsRepo,
  internalRepo,
  settingsRepo,
  countersRepo,
  bidRequestsRepo,
  caseCreationRepo,
} from './repositories.js';
import { allocateBidNumber, israelYear } from './services/bidNumber.js';
import { transition } from './stateMachines/tenderFsm.js';
import {
  generateTenderDocument,
  getViewable,
  setDocumentPermissions,
  cacheTenderHtml,
  createTemplateDoc as createTemplateDocInDrive,
  readTemplateDocText,
  googleIdentityOf,
  removeDocumentPermission,
  discardGeneratedDocument,
  type GeneratedDoc,
} from './services/docsService.js';
import {
  clusterQuestions,
  compareResponses,
  draftBidContent,
  suggestExternalSuppliers,
} from './services/aiService.js';
import { findCandidates } from './services/supplierSearch.js';
import { requiredSkillsFor, skillsCatalog } from './services/skillsRegistry.js';
import { superviseTender, splitConfidential } from './services/supervisorService.js';
import { templateHash } from './services/supervisorChecks.js';
import { computeCaseScore, refreshCaseScore } from './services/scoreService.js';
import { analyzeTemplate, applyConversion } from './services/templateConverter.js';
import {
  requestFeedback,
  submitFeedback as submitFeedbackSvc,
  declineFeedback as declineFeedbackSvc,
  generateSkillTips as generateSkillTipsSvc,
} from './services/feedbackService.js';

// Actor for automatic score recomputes (keeps supplier names out of score audit rows).
const SYSTEM = { uid: 'system', name: 'מערכת' };

// 1 GiB: creating/transitioning a case reads the whole bid document (service template ≈150K chars),
// runs the supervisor, snapshots versions and diffs them for the score — 256 MiB ran out of memory.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '1GiB' });

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
// Functions that run the supervisor read the document (Docs) and call Claude.
const SUPERVISED = {
  secrets: [...DOCS_SECRETS, 'ANTHROPIC_API_KEY'],
  timeoutSeconds: 300,
};

/** Server-side check of form params against the template (the browser `required` is not a gate). */
function validateParams(
  template: TemplateDoc,
  params: Record<string, string | number>,
): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  const stillPlaceholders = template.params
    .filter((p) => !isSystemParam(p) && !p.hidden && hasPlaceholder(params[p.key]))
    .map((p) => p.labelHe);
  if (stillPlaceholders.length) {
    throw new HttpsError(
      'invalid-argument',
      `יש להזין ערך במקום מציין המקום שהשאירה הטיוטה בשדות: ${stillPlaceholders.join(', ')}`,
    );
  }
  for (const p of template.params) {
    if (isSystemParam(p) || p.hidden) continue; // filled by the system (or not asked at all)
    const v = params[p.key];
    const blank = v === undefined || String(v).trim() === '';
    if (blank) {
      if (p.required) throw new HttpsError('invalid-argument', `שדה חובה חסר: ${p.labelHe}`);
      continue;
    }
    if (p.type === 'number' && !Number.isFinite(Number(v))) {
      throw new HttpsError('invalid-argument', `השדה "${p.labelHe}" חייב להיות מספר.`);
    }
    if (p.key === SERVICE_KEYS.economicPct && (Number(v) < 0 || Number(v) > 100)) {
      throw new HttpsError('invalid-argument', `השדה "${p.labelHe}" חייב להיות בין 0 ל-100.`);
    }
    clean[p.key] = p.type === 'number' ? Number(v) : v;
  }
  return clean; // unknown keys are dropped — the template defines the document
}

/** Short Hebrew summary of a BLOCK report for the HttpsError message. */
function blockMessage(report: SupervisionReport): string {
  const blockers = report.findings.filter((f) => f.severity === 'block');
  return (
    `הסוכן המפקח חסם את הפרסום (${blockers.length} ממצאים חוסמים): ` +
    blockers
      .slice(0, 5)
      .map((f) => f.message)
      .join(' · ')
  );
}

/**
 * Run the supervisor as a hard gate. Returns the report when it may proceed; throws on BLOCK
 * unless the manager gave an override reason (audited).
 */
async function supervisorGate(
  caller: { uid: string; name: string },
  tenderId: string,
  stage: 'prepublish' | 'refresh',
  overrideReason: string | undefined,
): Promise<SupervisionReport> {
  const report = await superviseTender(caller, tenderId, stage);
  if (report.verdict !== 'BLOCK') return report;
  if (!overrideReason) {
    throw new HttpsError('failed-precondition', blockMessage(report), {
      runId: report.runId,
      verdict: report.verdict,
      flags: report.findings.filter((f) => f.severity === 'block').map(toG9Flag),
    });
  }
  await auditRepo.append({
    entityType: 'tender',
    entityId: tenderId,
    tenderId,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'supervisor_override',
    prevState: 'BLOCK',
    newState: stage,
    detail: `${overrideReason} (run ${report.runId})`,
  });
  return report;
}

/** Non-blocking checkpoint: a supervisor failure must never break the manager's action. */
async function supervisorCheckpoint(
  caller: { uid: string; name: string },
  tenderId: string,
  stage: 'created' | 'review' | 'ready',
): Promise<SupervisionReport | null> {
  try {
    return await superviseTender(caller, tenderId, stage);
  } catch (err) {
    console.error(`supervisor checkpoint ${stage} failed for ${tenderId}`, err);
    return null;
  }
}

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

// ---- Case team (strict role-based assignment) ----
const roleLabel = (r: TeamRole) => ROLE_LABELS_HE[r];

/** Each slot must hold an existing user with exactly that role. */
async function resolveTeam(team: CaseTeam | undefined): Promise<{ team: CaseTeam; users: UserDoc[] }> {
  const clean: CaseTeam = {};
  const users: UserDoc[] = [];
  for (const role of TEAM_ROLES) {
    const uid = team?.[role];
    if (!uid) continue;
    const user = await usersRepo.get(uid);
    if (!user || user.role !== role) {
      throw new HttpsError('invalid-argument', `המשתמש שנבחר ל"${roleLabel(role)}" אינו בעל תפקיד זה.`);
    }
    clean[role] = uid;
    users.push(user);
  }
  return { team: clean, users };
}

/** Access docs + Google Docs comment permissions for team members. Returns users without Google. */
async function grantTeamAccess(
  tenderId: string,
  googleDocId: string | null,
  users: UserDoc[],
  grantedBy: string,
): Promise<string[]> {
  for (const u of users) {
    await accessRepo.grant(tenderId, {
      principalId: u.uid,
      kind: 'internal',
      level: DEFAULT_INTERNAL_ACCESS[u.role] ?? 'comment',
      displayName: u.displayName,
      grantedBy,
      grantedAt: now(),
    });
  }
  const { writerEmails, commenterEmails, skipped } = splitDocsRecipients(users);
  if (writerEmails.length || commenterEmails.length) {
    await setDocumentPermissions(googleDocId, { writerEmails, commenterEmails });
  }
  return skipped;
}

// Phase 1: the requester's summary becomes a request with its bid number. No AI, no document yet.
export const createBidRequest = onCall(async (req) => {
  const caller = requireRole(req, 'requester', 'tender_manager');
  const input = parseInput(createBidRequestInput, req.data);
  if (input.requestId) {
    const prev = await bidRequestsRepo.byClientRequestId(caller.uid, input.requestId);
    if (prev) return { serial: prev.serial, duplicate: true };
  }
  const createdAt = now();
  const serial = await allocateBidNumber(israelYear(createdAt), {
    random: Math.random,
    claim: (serial, n) =>
      bidRequestsRepo.tryCreate({
        serial,
        year: Number(serial.split('-')[0]),
        n,
        brief: input.brief,
        requesterUid: caller.uid,
        requesterName: caller.name,
        status: 'open',
        tenderId: null,
        clientRequestId: input.requestId,
        createdAt,
        convertedAt: null,
      }),
  });
  await auditRepo.append({
    entityType: 'bidRequest',
    entityId: serial,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create_request',
    prevState: null,
    newState: 'open',
  });
  return { serial, duplicate: false };
});

// ---- Tenders ----
// Creating a case is all-or-nothing and retry-safe:
//  1. validate everything (template, fields, team, AI draft) — nothing written yet;
//  2. generate the document;
//  3. write the case, team access, provenance and the request marker in ONE batch.
// If anything fails, the generated document is discarded and nothing remains. A retried submission
// (same requestId) returns the case it already created instead of making a copy. The supervisor
// check runs right after, from the case page — creation itself takes seconds, not minutes.
export const createTender = onCall({ secrets: DOCS_SECRETS, timeoutSeconds: 120 }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(createTenderInput, req.data);
  const requestId = input.requestId ?? null;

  const alreadyCreated = async () => {
    const prev = requestId ? await caseCreationRepo.existing(requestId, caller.uid) : null;
    if (!prev) return null;
    const t = await tendersRepo.get(prev.tenderId);
    return {
      id: prev.tenderId,
      serial: prev.serial,
      docsSkipped: [] as string[],
      verdict: t?.lastSupervision?.verdict ?? null,
      missingRoles: t ? missingRoles(t.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[t.type], t.team) : [],
      duplicate: true,
    };
  };
  const prior = await alreadyCreated();
  if (prior) return prior;

  // ---- 1. validate (no writes) ----
  const template = await templatesRepo.get(input.type);
  if (!template) {
    throw new HttpsError('failed-precondition', `אין תבנית לסוג המכרז: ${input.type}`);
  }
  // A template still carrying Word-style fill-in spots (XXXX / ____) or no {{fields}} would produce
  // a document with blanks the form never asked for — convert it first (Templates page).
  if (templateFieldsStatus(template.bodyTemplate, template.supplierFillQuotes).status === 'needs_conversion') {
    throw new HttpsError(
      'failed-precondition',
      'התבנית טרם הומרה — יש להשלים את שדות התבנית בעמוד התבניות לפני יצירת מכרז.',
    );
  }
  const asked = validateParams(template, input.params);

  const bidReq = await bidRequestsRepo.get(input.bidRequestId);
  if (!bidReq) throw new HttpsError('not-found', 'הבקשה לא נמצאה.');
  if (bidReq.status !== 'open') throw new HttpsError('failed-precondition', 'הבקשה כבר הומרה למכרז.');

  const draft = input.draftId ? await bidDraftsRepo.get(input.draftId) : null;
  if (input.draftId && (!draft || draft.createdBy !== caller.uid)) {
    throw new HttpsError('invalid-argument', 'טיוטת ה-AI לא נמצאה.');
  }

  // Template fields that are the submission date come from the form's deadline — one source.
  if (template.params.some(isAutoDeadlineParam) && !input.submissionDeadline) {
    throw new HttpsError('invalid-argument', 'יש לקבוע מועד הגשה — הוא ממולא אוטומטית במסמך המכרז.');
  }

  // The case team: one user per required role, validated against the users' actual roles.
  const requiredRoles = requiredRolesFor(input.type, input.extraRoles ?? []);
  // The person who opened the request is the case requester unless the manager chose someone else;
  // the default applies only if that user still holds the requester role.
  let teamInput = input.team;
  if (!teamInput?.requester) {
    const opener = await usersRepo.get(bidReq.requesterUid);
    if (opener?.role === 'requester') teamInput = { ...(teamInput ?? {}), requester: opener.uid };
  }
  const { team, users: teamUsers } = await resolveTeam(teamInput);
  const owner = await usersRepo.get(caller.uid);

  // Calculated and fixed fields (guarantee default and words, total months, manager and requester
  // details, …) are completed from what was asked, before the confidential split: the guarantee
  // default reads the estimate.
  const requester = teamUsers.find((u) => u.role === 'requester');
  const params = resolveSystemFills(template.params, asked, {
    submissionDeadline: input.submissionDeadline ?? null,
    manager: owner ? { displayName: owner.displayName, email: owner.email } : undefined,
    requester: requester ? { displayName: requester.displayName, phone: requester.phone } : undefined,
  });
  // Confidential values (the estimate, G6) never go on the supplier-readable tender doc.
  const { publicParams, internalParams } = splitConfidential(template, params);

  // ---- 2. serial + document ----
  const id = tendersRepo.newId();
  const serial = bidReq.serial;
  // The bid number is the case serial — filled by the system, never typed or guessed.
  for (const p of template.params) if (isAutoSerialParam(p)) publicParams[p.key] = serial;
  // A blank title is named by the system: the type and the case serial.
  // ...and the submission-date fields are the form's deadline.
  for (const p of template.params) {
    if (isAutoDeadlineParam(p) && input.submissionDeadline) {
      publicParams[p.key] = formatDeadlineFor(p.key, input.submissionDeadline);
    }
  }
  const systemKeys = new Set(template.params.filter(isSystemParam).map((p) => p.key));
  const title = input.title?.trim() || `${TENDER_TYPE_LABELS_HE[input.type]} ${serial}`;
  const tender: TenderDoc = {
    id,
    serial,
    team,
    requiredRoles,
    memberUids: memberUidsOf(caller.uid, team),
    title,
    type: input.type,
    params: publicParams,
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
  // Provenance (G11): exactly which template version, AI draft and skills built this tender.
  const provenance: TenderProvenance = {
    templateType: input.type,
    templateId: templateIdFor(input.type),
    templateHash: templateHash(template),
    googleTemplateDocId: template.googleTemplateDocId ?? null,
    draftId: draft?.draftId ?? null,
    draftType: draft?.type ?? null,
    brief: draft?.brief ?? bidReq.brief,
    aiModel: draft?.model ?? null,
    aiStatus: draft?.status ?? null,
    skillsUsed: draft?.status === 'FAILED' ? [] : draft?.skillsUsed ?? [],
    paramSources: draft?.sources ?? {},
    editedByManager: draft
      ? Object.keys(publicParams).filter(
          (k) => !systemKeys.has(k) && String(draft.params[k] ?? '') !== String(publicParams[k] ?? ''),
        )
      : [],
    recordedAt: now(),
  };
  // Strict assignment: only the owning manager (edit) and the case team (comment) get access.
  const access: AccessDoc[] = [
    {
      principalId: caller.uid,
      kind: 'internal',
      level: 'edit',
      displayName: owner?.displayName ?? caller.name,
      grantedBy: caller.uid,
      grantedAt: now(),
    },
    ...teamUsers
      .filter((u) => u.uid !== caller.uid)
      .map((u) => ({
        principalId: u.uid,
        kind: 'internal' as const,
        level: DEFAULT_INTERNAL_ACCESS[u.role] ?? 'comment',
        displayName: u.displayName,
        grantedBy: caller.uid,
        grantedAt: now(),
      })),
  ];

  // ---- 3. one atomic write ----
  let gen: GeneratedDoc | null = null;
  try {
    gen = await generateTenderDocument(tender, template);
    tender.googleDocId = gen.googleDocId;
    tender.docExportPath = gen.exportPath;
    await caseCreationRepo.commit({ tender, access, provenance, internalParams, requestId, uid: caller.uid, bidRequestSerial: bidReq.serial });
  } catch (err) {
    if (gen) await discardGeneratedDocument(id, gen);
    // A concurrent duplicate of this submission committed first — return that case.
    const raced = await alreadyCreated();
    if (raced) return raced;
    console.error(`createTender failed (${serial}); nothing was saved`, err);
    await auditRepo
      .append({
        entityType: 'tender',
        entityId: id,
        actorUid: caller.uid,
        actorName: caller.name,
        action: 'create_failed',
        prevState: serial,
        newState: null,
        detail: `${title} — ${(err as Error).message}`.slice(0, 300),
      })
      .catch(() => undefined);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', 'יצירת המכרז נכשלה ולא נשמר דבר. ניתן לנסות שוב.');
  }

  // ---- after commit: best-effort extras (never undo the case) ----
  let skipped: string[] = [];
  try {
    // The caller's own token email is a real Google address when they signed in with SSO, so it
    // is an acceptable fallback for the owner only.
    const callerAddress = googleIdentityOf(owner ?? {}) ?? caller.email;
    if (callerAddress) await setDocumentPermissions(gen.googleDocId, { writerEmails: [callerAddress] });
    const recipients = splitDocsRecipients(teamUsers);
    skipped = recipients.skipped;
    if (recipients.writerEmails.length || recipients.commenterEmails.length) {
      await setDocumentPermissions(gen.googleDocId, {
        writerEmails: recipients.writerEmails,
        commenterEmails: recipients.commenterEmails,
      });
    }
  } catch (err) {
    console.error(`createTender ${serial}: Docs permissions failed`, err);
  }
  const missing = missingRoles(requiredRoles, team);
  await auditRepo.append({
    entityType: 'tender',
    entityId: id,
    tenderId: id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create',
    prevState: null,
    newState: 'draft',
    detail: `${serial} · ${input.type}: ${title}`,
  });
  await auditRepo.append({
    entityType: 'tender',
    entityId: id,
    tenderId: id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'provenance_recorded',
    prevState: null,
    newState: provenance.templateId,
    detail: draft
      ? `draft ${draft.draftId} · ${provenance.skillsUsed.length} skills · ${provenance.editedByManager.length} edited`
      : 'manual',
  });
  await auditRepo.append({
    entityType: 'tender',
    entityId: id,
    tenderId: id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'team_assigned',
    prevState: null,
    newState: teamUsers.map((u) => `${u.role}:${u.displayName}`).join(', ') || null,
    detail:
      [
        missing.length ? `חסרים: ${missing.map(roleLabel).join(', ')}` : '',
        skipped.length ? `ללא חשבון Google: ${skipped.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
  });
  return { id, serial, docsSkipped: skipped, verdict: null, missingRoles: missing, duplicate: false };
});

export const transitionTender = onCall(SUPERVISED, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(transitionTenderInput, req.data);
  const current = await tendersRepo.get(input.tenderId);
  if (!current) throw new HttpsError('not-found', 'מכרז לא נמצא.');

  // The case team must be complete before internal review.
  if (input.to === 'internal_review' && canTransition(current.status, 'internal_review')) {
    const missing = missingRoles(current.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[current.type], current.team);
    if (missing.length) {
      throw new HttpsError(
        'failed-precondition',
        `לא ניתן לשלוח לבדיקה פנימית — יש לשבץ: ${missing.map(roleLabel).join(', ')}.`,
      );
    }
  }

  // Publish gate: the supervisor inspects the live document before suppliers can see it.
  let gate: SupervisionReport | null = null;
  if (input.to === 'published' && canTransition(current.status, 'published')) {
    gate = await supervisorGate(caller, input.tenderId, 'prepublish', input.overrideReason);
  }
  await transition(caller, input.tenderId, input.to);

  if (input.to === 'published' && gate) {
    // Cache the exported HTML at publish so suppliers load it fast (no live Google export).
    const tender = await tendersRepo.get(input.tenderId);
    const path = tender ? await cacheTenderHtml(tender) : null;
    await tendersRepo.update(input.tenderId, {
      ...(path ? { docExportPath: path } : {}),
      publishedDocHash: gate.docHash,
    });
    // Ask every internal participant how the drafting/review went.
    await requestFeedback(caller, input.tenderId, 'publish');
  }
  let verdict = gate?.verdict ?? null;
  if (input.to === 'internal_review' || input.to === 'ready') {
    const stage = input.to === 'ready' ? 'ready' : 'review';
    verdict = (await supervisorCheckpoint(caller, input.tenderId, stage))?.verdict ?? null;
  }
  await refreshCaseScore(SYSTEM, input.tenderId);
  return { ok: true, verdict };
});

// Manager re-exports + re-caches the bid document after editing the Google Doc. Once suppliers can
// see the document, the edited version goes through the supervisor gate again.
export const refreshTenderDocument = onCall(SUPERVISED, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(refreshTenderDocumentInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (isSupplierVisible(tender.status)) {
    const gate = await supervisorGate(caller, input.tenderId, 'refresh', input.overrideReason);
    await tendersRepo.update(input.tenderId, { publishedDocHash: gate.docHash });
  }
  const path = await cacheTenderHtml(tender);
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
  await refreshCaseScore(SYSTEM, input.tenderId);
  return { ok: true, cached: !!path };
});

// ---- Access & sharing ----
export const grantAccess = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(grantAccessInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  // Internal users are assigned through the case team (assignTeamMember), never ad hoc.
  if ((input.internalUids ?? []).length) {
    throw new HttpsError('invalid-argument', 'שיבוץ משתמשים פנימיים נעשה דרך צוות המכרז.');
  }
  // Suppliers only see a document the supervisor has passed, i.e. after publication.
  if ((input.supplierIds ?? []).length && !isSupplierVisible(tender.status)) {
    throw new HttpsError(
      'failed-precondition',
      'ניתן לשתף ספקים רק לאחר פרסום המכרז (לאחר בדיקת הסוכן המפקח).',
    );
  }

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

  return { ok: true, docsSkipped: [] as string[] };
});

// Assign (or clear) the user holding one role slot of the case team. The previous holder loses
// access to the case, its document and its chat. Allowed in any status (people get replaced).
export const assignTeamMember = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(assignTeamMemberInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const team: CaseTeam = { ...(tender.team ?? {}) };
  const prevUid = team[input.role] ?? null;
  if (prevUid === input.uid) return { ok: true, docsSkipped: [] as string[] };

  let newUser: UserDoc | null = null;
  if (input.uid) {
    ({
      users: [newUser],
    } = await resolveTeam({ [input.role]: input.uid }));
    team[input.role] = input.uid;
  } else {
    delete team[input.role];
  }
  const memberUids = memberUidsOf(tender.ownerUid, team);

  // Revoke the previous holder unless they still hold another slot (or own the case).
  if (prevUid && !memberUids.includes(prevUid)) {
    const prev = await usersRepo.get(prevUid);
    await accessRepo.revoke(tender.id, prevUid);
    await removeDocumentPermission(tender.googleDocId, prev ? googleIdentityOf(prev) : null);
  }
  await tendersRepo.update(tender.id, { team, memberUids });
  const skipped = newUser ? await grantTeamAccess(tender.id, tender.googleDocId, [newUser], caller.uid) : [];
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: newUser ? 'team_assigned' : 'team_unassigned',
    prevState: prevUid,
    newState: newUser ? `${input.role}:${newUser.displayName}` : input.role,
  });
  return { ok: true, docsSkipped: skipped };
});

// The manager may require additional roles on a case; the type's default roles always stay.
export const setRequiredRoles = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(setRequiredRolesInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const requiredRoles = requiredRolesFor(tender.type, input.roles);
  await tendersRepo.update(tender.id, { requiredRoles });
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'set_required_roles',
    prevState: (tender.requiredRoles ?? []).join(',') || null,
    newState: requiredRoles.join(','),
  });
  return { requiredRoles };
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
    if (!isSupplierVisible(tender.status)) {
      throw new HttpsError('permission-denied', 'המכרז טרם פורסם.');
    }
  } else {
    requireCaseAccess(caller, tender);
  }
  return getViewable(tender, caller.role !== 'supplier');
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
  await refreshCaseScore(SYSTEM, input.tenderId);
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
  await refreshCaseScore(SYSTEM, input.tenderId);
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
    await refreshCaseScore(SYSTEM, input.tenderId);
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
  await requestFeedback(caller, input.tenderId, 'award');
  await refreshCaseScore(SYSTEM, input.tenderId);
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
    const caller = requireManager(req);
    const input = parseInput(draftBidInput, req.data);
    const template = await templatesRepo.get(input.type);
    if (!template) throw new HttpsError('failed-precondition', `אין תבנית לסוג: ${input.type}`);
    const skills = requiredSkillsFor(input.type);
    const draft = await draftBidContent(input.type, input.brief, template, skills);

    // Keep the raw draft so the supervisor can later tell AI-written values from manager edits.
    const draftId = bidDraftsRepo.newId();
    await bidDraftsRepo.save({
      draftId,
      type: input.type,
      brief: input.brief,
      model: draft.model ?? 'none',
      status: draft.status,
      params: draft.params,
      sources: draft.sources,
      missing: draft.missing,
      templateHash: templateHash(template),
      skillsUsed: skills.map((s) => ({ id: s.id, hash: s.hash })),
      createdBy: caller.uid,
      createdAt: now(),
    });
    await auditRepo.append({
      entityType: 'bidDraft',
      entityId: draftId,
      actorUid: caller.uid,
      actorName: caller.name,
      action: 'ai_draft',
      prevState: input.type,
      newState: draft.status,
      detail: `${skills.length} skills · ${draft.missing.length} missing`,
    });
    return { ...draft, draftId };
  },
);

// Manually re-run the supervisor (full rules + AI review) on the current document.
export const runSupervision = onCall(SUPERVISED, async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(runSupervisionInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  requireCaseAccess(caller, tender);
  // Two tabs opening a new case must not run the initial check twice.
  if (input.initial && tender.lastSupervision) return { skipped: true as const };
  const report = await superviseTender(caller, input.tenderId, input.initial ? 'created' : 'manual');
  await refreshCaseScore(SYSTEM, input.tenderId);
  return report;
});

// Read-only catalog of the skills framework the system enforces (Templates page).
export const getSkillsCatalog = onCall(async (req) => {
  requireInternal(req);
  return skillsCatalog();
});

// ---- Case success score ----
export const recomputeCaseScore = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(recomputeCaseScoreInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  requireCaseAccess(caller, tender);
  return computeCaseScore(caller, input.tenderId);
});

// One-time / on-demand: score every tender (e.g. tenders created before scoring existed).
export const backfillCaseScores = onCall(
  { secrets: DOCS_SECRETS, timeoutSeconds: 540 },
  async (req) => {
    const caller = requireManager(req);
    const ids = await tendersRepo.listIds();
    let scored = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await computeCaseScore(caller, id);
        scored++;
      } catch (err) {
        console.error(`backfill score failed for ${id}`, err);
        failed.push(id);
      }
    }
    return { scored, failed };
  },
);

// ---- Participant feedback + skill tips ----
export const submitFeedback = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(submitFeedbackInput, req.data);
  const fb = await submitFeedbackSvc(caller, input);
  await refreshCaseScore(SYSTEM, input.tenderId);
  return fb;
});

export const declineFeedback = onCall(async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(declineFeedbackInput, req.data);
  await declineFeedbackSvc(caller, input);
  return { ok: true };
});

export const generateSkillTips = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
  async (req) => {
    const caller = requireManager(req);
    const input = parseInput(generateSkillTipsInput, req.data);
    return generateSkillTipsSvc(caller, input.type);
  },
);

// One-time: number tenders created before serials existed (by creation date within each year).
export const backfillSerials = onCall({ timeoutSeconds: 300 }, async (req) => {
  const caller = requireManager(req);
  const all = (await tendersRepo.listAll()).sort((a, b) => a.createdAt - b.createdAt);
  const byYear = new Map<number, TenderDoc[]>();
  for (const t of all) {
    const y = new Date(t.createdAt).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), t]);
  }
  let assigned = 0;
  for (const [year, tenders] of byYear) {
    // Continue after the highest number already used this year (existing serials are kept).
    const used = tenders
      .map((t) => Number(t.serial?.match(/^BID-\d{4}-(\d+)$/)?.[1] ?? 0))
      .reduce((a, b) => Math.max(a, b), 0);
    await countersRepo.ensureAtLeast(year, used);
    for (const t of tenders) {
      if (t.serial) continue;
      await tendersRepo.update(t.id, { serial: await countersRepo.nextSerial(year) });
      assigned++;
    }
  }
  await auditRepo.append({
    entityType: 'settings',
    entityId: 'serials',
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'backfill_serials',
    prevState: null,
    newState: `${assigned} assigned`,
  });
  return { assigned, total: all.length };
});

// One-time: move tenders created before strict assignment onto case teams. Keeps everyone who has
// access today (members = owner + internal access principals), fills a role slot only where exactly
// one user of that role has access; managers then trim the team in the Team panel.
export const migrateTeams = onCall({ timeoutSeconds: 300 }, async (req) => {
  const caller = requireManager(req);
  let migrated = 0;
  for (const t of await tendersRepo.listAll()) {
    if (t.memberUids && t.requiredRoles) continue;
    const internal = (await accessRepo.list(t.id)).filter((a) => a.kind === 'internal');
    const users = (await Promise.all(internal.map((a) => usersRepo.get(a.principalId)))).filter(
      (u): u is UserDoc => !!u,
    );
    const team: CaseTeam = {};
    for (const role of TEAM_ROLES) {
      const holders = users.filter((u) => u.role === role);
      if (holders.length === 1) team[role] = holders[0].uid;
    }
    const memberUids = [...new Set([t.ownerUid, ...internal.map((a) => a.principalId)])];
    await tendersRepo.update(t.id, {
      team: t.team ?? team,
      requiredRoles: t.requiredRoles ?? requiredRolesFor(t.type),
      memberUids,
    });
    migrated++;
  }
  await auditRepo.append({
    entityType: 'settings',
    entityId: 'teams',
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'migrate_teams',
    prevState: null,
    newState: `${migrated} tenders`,
  });
  return { migrated };
});

export const updateScoringTargets = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(updateScoringTargetsInput, req.data);
  await settingsRepo.setScoring(input.targets, input.dci);
  await auditRepo.append({
    entityType: 'settings',
    entityId: 'scoring',
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'update_scoring_targets',
    prevState: null,
    newState: null,
    detail: JSON.stringify(input.targets),
  });
  return { ok: true };
});

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
      params = mergeSyncedParams(detectPlaceholders(text), existing?.params ?? []);
    } else {
      warning = 'doc-not-readable';
    }
  } catch {
    warning = 'doc-not-readable';
  }

  const st = templateFieldsStatus(bodyTemplate, existing?.supplierFillQuotes);
  await templatesRepo.upsert({
    type: input.type,
    title: input.title || existing?.title || DEFAULT_TEMPLATE_TITLE[input.type] || input.type,
    googleTemplateDocId: docId,
    sourceUrl: input.urlOrId,
    bodyTemplate,
    params,
    fieldsStatus: st.status,
    unresolvedSpots: st.unresolved,
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
  return { docId, params, warning, fieldsStatus: st.status, unresolvedSpots: st.unresolved };
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
  const params = mergeSyncedParams(detectPlaceholders(text), existing.params ?? []);
  const st = templateFieldsStatus(text, existing.supplierFillQuotes);
  await templatesRepo.patch(input.type, {
    bodyTemplate: text,
    params,
    fieldsStatus: st.status,
    unresolvedSpots: st.unresolved,
  });
  await auditRepo.append({
    entityType: 'template',
    entityId: input.type,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'sync_template_fields',
    prevState: null,
    newState: `${params.length} fields · ${st.status}`,
  });
  return { params, fieldsStatus: st.status, unresolvedSpots: st.unresolved };
});

// Template conversion: an agent loop proposes {{fields}} for a Word-based document (draft only).
export const analyzeTemplateFields = onCall(
  { secrets: [...DOCS_SECRETS, 'ANTHROPIC_API_KEY'], timeoutSeconds: 540, memory: '1GiB' },
  async (req) => {
    const caller = requireManager(req);
    const input = parseInput(analyzeTemplateFieldsInput, req.data);
    return analyzeTemplate(caller, input.type);
  },
);

// After manager review: back up the Doc, write the {{fields}}, re-sync params with their labels.
export const applyTemplateConversion = onCall({ secrets: DOCS_SECRETS, timeoutSeconds: 300 }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(applyTemplateConversionInput, req.data);
  return applyConversion(caller, input);
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

// Manager defines internal-only fields for a bid type (e.g. the estimate, G6). They appear on the
// create form, are stored in tenders/{id}/internal/params, and never reach the document.
export const setTemplateInternalFields = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(setTemplateInternalFieldsInput, req.data);
  const existing = await templatesRepo.get(input.type);
  if (!existing) throw new HttpsError('failed-precondition', `אין תבנית לסוג: ${input.type}`);

  const inBody = new Set(detectPlaceholders(existing.bodyTemplate).map((p) => p.key));
  const leaking = input.fields.filter((f) => inBody.has(f.key));
  if (leaking.length) {
    throw new HttpsError(
      'failed-precondition',
      `השדות ${leaking.map((f) => f.key).join(', ')} מופיעים כמציין מקום במסמך התבנית — הסר אותם מהמסמך לפני שתגדיר אותם כפנימיים.`,
    );
  }
  const keys = input.fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) {
    throw new HttpsError('invalid-argument', 'מפתחות כפולים.');
  }
  const params = [
    ...existing.params.filter((p) => !p.internal),
    ...input.fields.map((f) => ({ ...f, required: false, internal: true })),
  ];
  await templatesRepo.patch(input.type, { params });
  await auditRepo.append({
    entityType: 'template',
    entityId: input.type,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'set_internal_fields',
    prevState: existing.params.filter((p) => p.internal).map((p) => p.key).join(',') || null,
    newState: keys.join(',') || null,
  });
  return { params };
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
  // A deleted user leaves every case team (their slots become empty and must be refilled).
  for (const t of await tendersRepo.listAll()) {
    const roles = (Object.keys(t.team ?? {}) as TeamRole[]).filter((r) => t.team?.[r] === input.uid);
    if (!roles.length && !(t.memberUids ?? []).includes(input.uid)) continue;
    const team: CaseTeam = { ...(t.team ?? {}) };
    for (const r of roles) delete team[r];
    await tendersRepo.update(t.id, { team, memberUids: memberUidsOf(t.ownerUid, team) });
    await accessRepo.revoke(t.id, input.uid);
  }
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
