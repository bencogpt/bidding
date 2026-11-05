import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import {
  createTenderInput,
  createBidRequestInput,
  assistRequestInput,
  recommendationsInput,
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
  decideFindingInput,
  withFindingKeys,
  withEmptyFieldsPrinted,
  recomputeCaseScoreInput,
  updateScoringTargetsInput,
  submitFeedbackInput,
  declineFeedbackInput,
  generateSkillTipsInput,
  assignTeamMemberInput,
  setRequiredRolesInput,
  approveTenderInput,
  claimTeamSlotInput,
  autoRunOnCreate,
  documentBecameReady,
  isUnitRole,
  unitRequestsFor,
  type UnitQueueItem,
  planApproval,
  APPROVAL_DENIAL_HE,
  APPROVAL_PERMISSION_DENIALS,
  sendDenial,
  SEND_DENIAL_HE,
  illegalTransitionHe,
  CHAT_MAX_LENGTH,
  missingTimelineDates,
  checkTimelineDay,
  timelineOf,
  timelineParamValues,
  formatDocDate,
  TIMELINE_DAY_HE,
  continueWithoutAiInput,
  rerunFinalCheckInput,
  setTimelineInput,
  documentBlockers,
  REQUIRE_APPROVALS,
  requiredRolesFor,
  TENDER_TYPE_LABELS_HE,
  missingRoles,
  missingApprovals,
  blockingApproverRoles,
  memberUidsOf,
  REQUIRED_ROLES_BY_TYPE,
  TEAM_ROLES,
  ROLE_LABELS_HE,
  isSupplierVisible,
  canTransition,
  manualTransitionDenial,
  templateIdFor,
  toG9Flag,
  parseDocId,
  detectPlaceholders,
  mergeSyncedParams,
  templateFieldsStatus,
  hasPlaceholder,
  isAutoSerialParam,
  briefWithDetails,
  isFormHidden,
  isConfidentialParam,
  BLANK_LINE,
  isOmittedParam,
  fillFromRequestDetails,
  isSystemParam,
  resolveSystemFills,
  SERVICE_KEYS,
  guaranteeDefault,
  isAutoDeadlineParam,
  hasDocument,
  updateTenderDraftInput,
  generateDocumentInput,
  reopenTenderInput,
  getVersionViewInput,
  type VersionView,
  rerunRequestResearchInput,
  researchDraftInput,
  RESEARCH_DRAFT_MAX_AGE_MS,
  type BidRequestDoc,
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
  type UpdateTenderDraftInput,
  setPendingSuppliersInput,
  type TenderProvenance,
  type SupervisionReport,
  type CaseTeam,
  type TeamRole,
  hebrewLabel,
  stripMarkup,
  supplierTenderInput,
  injectionSignals,
  createSubmissionUploadInput,
  type SupplierTenderView,
} from '@obms/shared';
import { randomBytes } from 'node:crypto';
import { auth, db, now, storage } from './lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, requireRole, requireManager, requireInternal, requireCaseAccess, type Caller } from './lib/context.js';
import { parseInput } from './lib/validate.js';
import {
  tendersRepo,
  templatesRepo,
  accessRepo,
  questionsRepo,
  answersRepo,
  auditRepo,
  usersRepo,
  supervisionRepo,
  versionsRepo,
  suppliersRepo,
  submissionsRepo,
  bidDraftsRepo,
  internalRepo,
  settingsRepo,
  countersRepo,
  bidRequestsRepo,
  agentUsageRepo,
  researchDraftsRepo,
  researchRepo,
  caseCreationRepo,
} from './repositories.js';
import { allocateBidNumber, israelYear } from './services/bidNumber.js';
import { transition } from './stateMachines/tenderFsm.js';
import { cancelStaleApprovals, currentContentHash } from './services/approvalGuard.js';
import { continueWithoutAi, readyForFinalCheck, runFinalCheck } from './services/finalCheck.js';
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
  readTenderDocText,
  replaceOnceInDocument,
  lockDocument,
  copyTenderDocument,
  readVersionSnapshot,
  type GeneratedDoc,
} from './services/docsService.js';
import {
  clusterQuestions,
  compareResponses,
  draftBidContent,
  suggestExternalSuppliers,
  getClient,
} from './services/aiService.js';
import { requestAgentTurn } from './services/requestAgent.js';
import { recommendationsFor } from './services/requestRecommendations.js';
import { findCandidates } from './services/supplierSearch.js';
import { requiredSkillsFor, skillsCatalog } from './services/skillsRegistry.js';
import {
  superviseTender,
  SupervisionBusyError,
  splitConfidential,
  currentDraftDataHash,
  recordVersion,
} from './services/supervisorService.js';
import { documentGate, DOCUMENT_GATE_MESSAGE_HE } from './services/draftCalc.js';
import { contextDiff } from './services/versionDiff.js';
import { runDraftResearch, runRequestResearch } from './services/requestResearch.js';
import { publicServiceSummary } from './services/publicSummary.js';
import { docHash } from './services/supervisorChecks.js';
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
  annualEstimate?: unknown, // a blank guarantee takes its default from it (see resolveSystemFills)
): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  const stillPlaceholders = template.params
    .filter((p) => !isSystemParam(p) && !isFormHidden(p) && hasPlaceholder(params[p.key]))
    .map((p) => hebrewLabel(p.key, p.labelHe));
  if (stillPlaceholders.length) {
    throw new HttpsError(
      'invalid-argument',
      `יש להזין ערך במקום מציין המקום שהשאירה הטיוטה בשדות: ${stillPlaceholders.join(', ')}`,
    );
  }
  for (const p of template.params) {
    if (isSystemParam(p) || isFormHidden(p)) continue; // filled by the system / the requester (or not asked at all)
    const v = params[p.key];
    const blank = v === undefined || String(v).trim() === '';
    // A blank field — required or not — is completed in the draft (plan D4/D7): the supervisor lists it, the
    // document prints a blank line (a required one with its label) and the publish gate blocks while it stays.
    if (blank) continue;
    if (p.type === 'number' && !Number.isFinite(Number(v))) {
      throw new HttpsError('invalid-argument', `השדה "${hebrewLabel(p.key, p.labelHe)}" חייב להיות מספר.`);
    }
    if (p.key === SERVICE_KEYS.economicPct && (Number(v) < 0 || Number(v) > 100)) {
      throw new HttpsError('invalid-argument', `השדה "${hebrewLabel(p.key, p.labelHe)}" חייב להיות בין 0 ל-100.`);
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

/**
 * A case's field values from what was asked: calculated and fixed fields (guarantee default and
 * words, total months, manager and requester details, …) completed before the confidential split
 * (the guarantee default reads the estimate); then the bid number = the case serial and the
 * submission-date fields = the deadline. Shared by createTender and updateTenderDraft.
 */
function buildCaseParams(
  template: TemplateDoc,
  asked: Record<string, string | number>,
  ctx: {
    serial: string;
    submissionDeadline: number | null;
    owner: UserDoc | null;
    requester?: UserDoc;
    request?: BidRequestDoc | null; // its confidential annual estimate is the guarantee default's base
    publicBrief?: string; // the supplier-facing service description (publicSummary.ts), never the raw request
  },
): { publicParams: Record<string, string | number>; internalParams: Record<string, string | number> } {
  const details = (ctx.request?.details ?? {}) as Record<string, unknown>;
  const annual = Number(details.annual_budget);
  const years = Number(details.contract_years);
  const params = resolveSystemFills(template.params, asked, {
    submissionDeadline: ctx.submissionDeadline,
    annualEstimate: Number.isFinite(annual) && annual > 0 ? annual : undefined,
    contractYears: Number.isInteger(years) && years > 0 ? years : undefined,
    optionPeriods: Number.isInteger(Number(details.option_periods_count)) ? Number(details.option_periods_count) : undefined,
    requestBrief: ctx.publicBrief,
    serial: ctx.serial,
    manager: ctx.owner
      ? { displayName: ctx.owner.displayName, email: ctx.owner.email, phone: ctx.owner.phone }
      : undefined,
    requester: ctx.requester ? { displayName: ctx.requester.displayName, phone: ctx.requester.phone } : undefined,
  });
  // Confidential values (the estimate, G6) never go on the supplier-readable tender doc.
  const { publicParams, internalParams } = splitConfidential(template, params);
  for (const p of template.params) if (isAutoSerialParam(p)) publicParams[p.key] = ctx.serial;
  for (const p of template.params) {
    if (isAutoDeadlineParam(p) && ctx.submissionDeadline) {
      publicParams[p.key] = formatDeadlineFor(p.key, ctx.submissionDeadline);
    }
  }
  // A field the form doesn't ask and nothing filled is printed as a blank line to complete in the
  // document (the inspector lists them as a warning) — not left as a {{placeholder}} that blocks.
  for (const p of template.params) {
    const notAsked = isSystemParam(p) || isFormHidden(p);
    const blank = String(publicParams[p.key] ?? '').trim() === '';
    if (isOmittedParam(p)) publicParams[p.key] = ''; // removed from the system: printed as nothing
    else if (notAsked && blank && !isConfidentialParam(p)) publicParams[p.key] = BLANK_LINE;
  }
  return { publicParams, internalParams };
}

// Phase 1: the requester's summary becomes a request with its bid number. No AI, no document yet.
export const createBidRequest = onCall(async (req) => {
  const caller = requireRole(req, 'requester', 'tender_manager');
  const parsed = parseInput(createBidRequestInput, req.data);
  // Plain text only: tags typed into the request never reach documents or prompts as markup.
  const input = {
    ...parsed,
    brief: stripMarkup(parsed.brief).trim(),
    details: Object.fromEntries(
      Object.entries(parsed.details).map(([k, v]) => [k, typeof v === 'string' ? stripMarkup(v).trim() : v]),
    ) as typeof parsed.details,
  };
  if (input.brief.length < 3) throw new HttpsError('invalid-argument', 'תיאור הבקשה קצר מדי.');
  if (input.requestId) {
    const prev = await bidRequestsRepo.byClientRequestId(caller.uid, input.requestId);
    if (prev) return { serial: prev.serial, duplicate: true };
  }
  const createdAt = now();
  // Web research the requester already ran on the summary step is linked, not searched again. The
  // summary is on the request from its creation, so the background trigger skips it.
  const draftRun = input.researchRunId ? await researchDraftsRepo.get(input.researchRunId) : null;
  const linkRun =
    draftRun && draftRun.createdBy === caller.uid && createdAt - draftRun.createdAt < RESEARCH_DRAFT_MAX_AGE_MS
      ? draftRun
      : null;
  const serial = await allocateBidNumber(israelYear(createdAt), {
    random: Math.random,
    claim: (serial, n) =>
      bidRequestsRepo.tryCreate({
        serial,
        year: Number(serial.split('-')[0]),
        n,
        brief: input.brief,
        details: input.details,
        requesterUid: caller.uid,
        requesterName: caller.name,
        status: 'open',
        tenderId: null,
        clientRequestId: input.requestId,
        createdAt,
        convertedAt: null,
        ...(linkRun ? { research: { status: linkRun.status, runId: linkRun.runId, at: createdAt } } : {}),
      }),
  });
  if (linkRun) {
    const { createdBy: _by, ...run } = linkRun;
    await researchRepo.save({ ...run, serial });
  }
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

// Requirement research: starts by itself when a request is opened (the request itself is created
// instantly; the research is ready a minute or two later). Ideas only — generic queries, sourced.
export const researchOnRequestCreated = onDocumentCreated(
  { document: 'bidRequests/{serial}', secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 540 },
  async (event) => {
    const data = event.data?.data() as BidRequestDoc | undefined;
    if (!data || data.research) return; // already researched (event redelivery)
    try {
      await runRequestResearch(event.params.serial, SYSTEM);
    } catch (err) {
      console.error(`researchOnRequestCreated ${event.params.serial} failed`, err);
    }
  },
);

// Web research on the request while it is still being written (the summary step): ideas from similar
// procurements, shown with the recommendations. Its own, smaller hourly budget — web search costs more.
const RESEARCH_DRAFTS_PER_HOUR = 5;
export const researchDraftRequest = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
  async (req) => {
    const caller = requireRole(req, 'requester', 'tender_manager');
    const input = parseInput(researchDraftInput, req.data);
    const allowed = await agentUsageRepo.take(caller.uid, RESEARCH_DRAFTS_PER_HOUR, 3_600_000, Date.now(), 'research');
    if (!allowed) {
      throw new HttpsError('resource-exhausted', 'הגעת למספר החיפושים ברשת המותר לשעה. נסה שוב מאוחר יותר.');
    }
    return runDraftResearch(input, caller);
  },
);

// Re-run the research (failed / outdated): the request's owner or a manager.
export const rerunRequestResearch = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 540 },
  async (req) => {
    const caller = requireInternal(req);
    const input = parseInput(rerunRequestResearchInput, req.data);
    const bidReq = await bidRequestsRepo.get(input.serial);
    if (!bidReq) throw new HttpsError('not-found', 'הבקשה לא נמצאה.');
    if (caller.role !== 'tender_manager' && bidReq.requesterUid !== caller.uid) {
      throw new HttpsError('permission-denied', 'רק פותח הבקשה או מנהל מכרז יכולים להריץ את המחקר.');
    }
    return runRequestResearch(input.serial, caller);
  },
);

// The "בל"מ חדש" screen's assistant: extracts the mandatory details from the requester's text and asks the
// next question. At most AGENT_CALLS_PER_HOUR model calls per user per hour; over that the scripted answer is
// returned instead of an error. The budget is not part of the input (strict schema).
const AGENT_CALLS_PER_HOUR = 30;
export const assistRequest = onCall({ secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 60 }, async (req) => {
  const caller = requireRole(req, 'requester', 'tender_manager');
  const input = parseInput(assistRequestInput, req.data);
  const allowed = await agentUsageRepo.take(caller.uid, AGENT_CALLS_PER_HOUR, 3_600_000, Date.now());
  return requestAgentTurn(input, allowed ? getClient() : null);
});

// Notes and ideas that sharpen a request before it is sent to procurement ("המלצות לשיפור ודיוק"). Counts against
// the same hourly limit as the request agent; over it, the fixed suggestions are returned instead of an error.
export const requestRecommendations = onCall({ secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 90 }, async (req) => {
  const caller = requireRole(req, 'requester', 'tender_manager');
  const input = parseInput(recommendationsInput, req.data);
  const allowed = await agentUsageRepo.take(caller.uid, AGENT_CALLS_PER_HOUR, 3_600_000, Date.now());
  return recommendationsFor(input, allowed ? getClient() : null);
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
  const template = await templatesRepo.getForCase(input.type);
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
  const bidReq = await bidRequestsRepo.get(input.bidRequestId);
  if (!bidReq) throw new HttpsError('not-found', 'הבקשה לא נמצאה.');
  const asked = validateParams(template, input.params, (bidReq.details as Record<string, unknown> | undefined)?.annual_budget);

  if (bidReq.status !== 'open') throw new HttpsError('failed-precondition', 'הבקשה כבר הומרה למכרז.');
  // What the requester already answered in phase 1 fills the matching fields the manager left blank.
  const askedWithDetails = fillFromRequestDetails(template.params, asked, bidReq.details);

  const draft = input.draftId ? await bidDraftsRepo.get(input.draftId) : null;
  if (input.draftId && (!draft || draft.createdBy !== caller.uid)) {
    throw new HttpsError('invalid-argument', 'טיוטת ה-AI לא נמצאה.');
  }

  // The submission deadline (which fills the template's date fields) may still be empty in the draft
  // (plan D4/D7): it is set in the draft editor, and publishing requires it.

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

  const requester = teamUsers.find((u) => u.role === 'requester');
  const serial = bidReq.serial;
  // The service description in the document is public: rewritten for suppliers, never the raw request.
  const publicBrief = needsPublicBrief(template) ? (await publicServiceSummary(bidReq.brief)).summary : undefined;
  const { publicParams, internalParams } = buildCaseParams(template, askedWithDetails, {
    serial,
    request: bidReq,
    publicBrief,
    submissionDeadline: input.submissionDeadline ?? null,
    owner,
    requester,
  });

  // ---- 2. the draft case (no document yet — draft-first) ----
  const id = tendersRepo.newId();
  // A blank title is named by the system: the type and the case serial.
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
    documentStatus: 'none',
    ownerUid: caller.uid,
    submissionDeadline: input.submissionDeadline ?? null,
    awardDate: input.awardDate ?? null,
    awardedSupplierId: null,
    domainTags: input.domainTags ?? [],
    evaluationCriteria: input.evaluationCriteria ?? [],
    // Legal and finance (and security if asked) assign their own contact from their home (plan D3).
    unitRequests: unitRequestsFor(team, input.unitRequests ?? []),
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
    brief: draft?.brief ?? briefWithDetails(bidReq.brief, bidReq.details),
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

  // ---- 3. one atomic write (the document is created later, after the inspector passes) ----
  tender.draftDataHash = currentDraftDataHash(tender, template, internalParams);
  try {
    await caseCreationRepo.commit({ tender, access, provenance, internalParams, requestId, uid: caller.uid, bidRequestSerial: bidReq.serial });
  } catch (err) {
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

  // Docs permissions are granted when the document is created (generateDocument).
  const skipped = splitDocsRecipients(teamUsers).skipped;
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

/** Whether the template prints the requester's service description (the request_brief rule). */
const needsPublicBrief = (template: TemplateDoc) =>
  template.params.some((p) => p.fill?.kind === 'formula' && p.fill.formula === 'request_brief');

/** The public service description already on a draft (from its request_brief field). */
function currentPublicBrief(template: TemplateDoc, params: Record<string, string | number>): string | undefined {
  const p = template.params.find((x) => x.fill?.kind === 'formula' && x.fill.formula === 'request_brief');
  const v = p ? params[p.key] : undefined;
  return v !== undefined && v !== BLANK_LINE && String(v).trim() ? String(v) : undefined;
}

// Draft-first: edit a case's data in the app while it has no document (manager). Same checks as
// creation; any change makes earlier inspector checks stale (a new fingerprint).
export const updateTenderDraft = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(updateTenderDraftInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (hasDocument(tender)) {
    throw new HttpsError('failed-precondition', 'למכרז כבר נוצר מסמך — יש לערוך את המסמך עצמו.');
  }
  if (tender.status !== 'draft') throw new HttpsError('failed-precondition', 'ניתן לערוך רק מכרז בטיוטה.');
  const template = await templatesRepo.getForCase(tender.type);
  if (!template) throw new HttpsError('failed-precondition', `אין תבנית לסוג המכרז: ${tender.type}`);
  // The public service description already on the draft is kept (it is regenerated only on request).
  const { draftDataHash, changed } = await applyDraftData(caller, tender, template, input, currentPublicBrief(template, tender.params));
  // The rules check the new data at once (plan B3), so what blocks is always current and no full re-run is
  // needed before "יצירת מסמך". Only once a first check ran, and not while a run is going.
  const after = await tendersRepo.get(tender.id);
  if (changed.length && after?.lastSupervision?.basis === 'draft' && after.supervisionRun?.state !== 'running') {
    await superviseTender(caller, tender.id, 'edit').catch((e) => console.error('edit re-check failed', e));
  }
  return { ok: true, draftDataHash, changed };
});

/**
 * Rebuild a draft's data from the asked values + edits (same checks as creation) and save it. Any change
 * gives a new fingerprint, so earlier inspector checks become stale.
 */
async function applyDraftData(
  caller: Caller,
  tender: TenderDoc,
  template: TemplateDoc,
  input: UpdateTenderDraftInput,
  publicBrief: string | undefined,
): Promise<{ draftDataHash: string; changed: string[] }> {

  // The deadline may stay empty while drafting (plan D4/D7); publishing requires it.
  const submissionDeadline =
    input.submissionDeadline !== undefined ? input.submissionDeadline : tender.submissionDeadline;
  const internalBefore = await internalRepo.getParams(tender.id);
  // The edit overlays the current values (public + confidential); validation is the create form's.
  const asked = validateParams(template, { ...tender.params, ...internalBefore, ...(input.params ?? {}) });
  const owner = await usersRepo.get(tender.ownerUid);
  const requester = tender.team?.requester ? await usersRepo.get(tender.team.requester) : null;
  const bidReq = tender.serial ? await bidRequestsRepo.get(tender.serial) : null;
  const { publicParams, internalParams } = buildCaseParams(template, asked, {
    serial: tender.serial ?? '',
    request: bidReq,
    publicBrief,
    submissionDeadline,
    owner,
    requester: requester ?? undefined,
  });
  const next: TenderDoc = {
    ...tender,
    title: input.title ?? tender.title,
    params: publicParams,
    submissionDeadline,
    awardDate: input.awardDate !== undefined ? input.awardDate : tender.awardDate,
    domainTags: input.domainTags ?? tender.domainTags ?? [],
    evaluationCriteria: input.evaluationCriteria ?? tender.evaluationCriteria ?? [],
  };
  const draftDataHash = currentDraftDataHash(next, template, internalParams);
  const changed = [...new Set([...Object.keys(tender.params), ...Object.keys(publicParams)])].filter(
    (k) => String(tender.params[k] ?? '') !== String(publicParams[k] ?? ''),
  );
  await tendersRepo.replaceDraftData(tender.id, {
    title: next.title,
    params: next.params,
    submissionDeadline: next.submissionDeadline,
    awardDate: next.awardDate,
    domainTags: next.domainTags,
    evaluationCriteria: next.evaluationCriteria,
    draftDataHash,
  });
  await internalRepo.setParams(tender.id, internalParams);

  // Provenance: which values now differ from the AI draft (G11).
  const provenance = await internalRepo.getProvenance(tender.id);
  if (provenance?.draftId) {
    const draft = await bidDraftsRepo.get(provenance.draftId);
    if (draft) {
      const systemKeys = new Set(template.params.filter(isSystemParam).map((p) => p.key));
      provenance.editedByManager = Object.keys(publicParams).filter(
        (k) => !systemKeys.has(k) && String(draft.params[k] ?? '') !== String(publicParams[k] ?? ''),
      );
      await internalRepo.setProvenance(tender.id, provenance);
    }
  }
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'draft_updated',
    prevState: null,
    newState: `${changed.length} fields`,
    detail: changed.slice(0, 20).join(', ') || undefined,
  });
  return { draftDataHash, changed };
}

/**
 * Share a case's Google Doc: the owner writes, the rest of the case team comments or writes by role. Best-effort —
 * a bad address must not fail the action. Returns the team members without a Google account (skipped).
 */
async function grantCaseDocPermissions(
  tender: TenderDoc,
  googleDocId: string | null,
  caller: Pick<Caller, 'uid' | 'email'>,
): Promise<string[]> {
  try {
    const owner = await usersRepo.get(tender.ownerUid);
    const ownerAddress = googleIdentityOf(owner ?? {}) ?? (caller.uid === tender.ownerUid ? caller.email : undefined);
    if (ownerAddress) await setDocumentPermissions(googleDocId, { writerEmails: [ownerAddress] });
    const teamUsers = (await Promise.all(Object.values(tender.team ?? {}).map((uid) => usersRepo.get(uid!)))).filter(
      (u): u is UserDoc => !!u,
    );
    const recipients = splitDocsRecipients(teamUsers);
    if (recipients.writerEmails.length || recipients.commenterEmails.length) {
      await setDocumentPermissions(googleDocId, {
        writerEmails: recipients.writerEmails,
        commenterEmails: recipients.commenterEmails,
      });
    }
    return recipients.skipped;
  } catch (err) {
    console.error(`Docs permissions failed for ${tender.serial}`, err);
    return [];
  }
}

// Draft-first: create the case's document — manager only, and only when the latest inspector check
// covered exactly the current draft data with no blocking finding (no override).
export const generateDocument = onCall({ secrets: DOCS_SECRETS, timeoutSeconds: 120 }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(generateDocumentInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const template = await templatesRepo.getForCase(tender.type);
  if (!template) throw new HttpsError('failed-precondition', `אין תבנית לסוג המכרז: ${tender.type}`);
  const internalParams = await internalRepo.getParams(tender.id);
  const reason = documentGate(tender, currentDraftDataHash(tender, template, internalParams));
  if (reason) throw new HttpsError('failed-precondition', DOCUMENT_GATE_MESSAGE_HE[reason]);
  if (!(await tendersRepo.claimDocumentGeneration(tender.id))) {
    throw new HttpsError('failed-precondition', 'המסמך כבר נוצר או נמצא ביצירה.');
  }

  // Fields still empty are printed as blank lines to complete in the document (plan D7); a required one
  // carries its label, so the publish gate blocks until it is completed.
  const printed = withEmptyFieldsPrinted(tender.params, template.params);
  const toPrint: TenderDoc = { ...tender, params: printed };
  let gen: GeneratedDoc | null = null;
  try {
    if (JSON.stringify(printed) !== JSON.stringify(tender.params)) {
      await tendersRepo.replaceDraftData(tender.id, { params: printed });
    }
    gen = await generateTenderDocument(toPrint, template);
    await tendersRepo.update(tender.id, {
      googleDocId: gen.googleDocId,
      docExportPath: gen.exportPath,
      documentStatus: 'generated',
      documentGeneratedAt: now(),
      documentGeneratedBy: caller.uid,
    });
  } catch (err) {
    if (gen) await discardGeneratedDocument(tender.id, gen);
    // Back to the draft as it was: blank lines are only for the created document.
    await tendersRepo.replaceDraftData(tender.id, { params: tender.params });
    await tendersRepo.update(tender.id, { documentStatus: 'none' });
    console.error(`generateDocument failed for ${tender.serial}`, err);
    throw new HttpsError('internal', 'יצירת המסמך נכשלה — הטיוטה לא השתנתה. ניתן לנסות שוב.');
  }
  const withDoc: TenderDoc = { ...toPrint, googleDocId: gen.googleDocId, docExportPath: gen.exportPath, documentStatus: 'generated' };

  // Docs permissions: owner (writer) + the case team (writer/commenter by role). Best-effort.
  const skipped = await grantCaseDocPermissions(tender, gen.googleDocId, caller);
  // Version 1 = the document as created (the baseline for document-change scoring).
  try {
    const text = await readTenderDocText(withDoc);
    await recordVersion(withDoc, text, docHash(text), 'created', caller.name);
  } catch (err) {
    console.error(`generateDocument ${tender.serial}: version 1 not recorded`, err);
  }
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'document_generated',
    prevState: tender.lastSupervision?.runId ?? null,
    newState: gen.googleDocId ?? gen.exportPath,
    detail: skipped.length ? `ללא חשבון Google: ${skipped.join(', ')}` : undefined,
  });
  await refreshCaseScore(SYSTEM, tender.id);
  return { ok: true, googleDocId: gen.googleDocId, docsSkipped: skipped };
});

// A draft whose document was created but not yet sent to review can be regenerated (e.g. after a fix to
// how values are filled): the data is rebuilt — the public service description rewritten afresh — and the
// case goes back to draft-first: the inspector checks it again before a new document is created. The old
// document is kept and listed, never deleted (edits made in it are not carried over).
export const regenerateDocument = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 120 },
  async (req) => {
    const caller = requireManager(req);
    const input = parseInput(generateDocumentInput, req.data);
    const tender = await tendersRepo.get(input.tenderId);
    if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
    if (!hasDocument(tender)) throw new HttpsError('failed-precondition', 'למכרז עדיין אין מסמך.');
    if (tender.status !== 'draft') {
      throw new HttpsError('failed-precondition', 'ניתן ליצור מסמך מחדש רק לפני האישור הסופי.');
    }
    const template = await templatesRepo.getForCase(tender.type);
    if (!template) throw new HttpsError('failed-precondition', `אין תבנית לסוג המכרז: ${tender.type}`);
    const bidReq = tender.serial ? await bidRequestsRepo.get(tender.serial) : null;
    const publicBrief =
      needsPublicBrief(template) && bidReq ? (await publicServiceSummary(bidReq.brief)).summary : currentPublicBrief(template, tender.params);
    const { draftDataHash } = await applyDraftData(caller, tender, template, { tenderId: tender.id }, publicBrief);
    const old = tender.googleDocId ?? tender.docExportPath;
    await tendersRepo.update(tender.id, {
      documentStatus: 'none',
      googleDocId: null,
      docExportPath: null,
      replacedDocuments: [...(tender.replacedDocuments ?? []), ...(old ? [old] : [])],
    });
    // Approvals were given on the old document; the new one starts without them.
    await tendersRepo.clearApprovals(tender.id);
    await auditRepo.append({
      entityType: 'tender',
      entityId: tender.id,
      tenderId: tender.id,
      actorUid: caller.uid,
      actorName: caller.name,
      action: 'document_reset',
      prevState: old,
      newState: 'draft',
      detail: 'המסמך יווצר מחדש לאחר בדיקת הסוכן המפקח',
    });
    return { ok: true, draftDataHash };
  },
);

export const transitionTender = onCall(SUPERVISED, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(transitionTenderInput, req.data);
  const current = await tendersRepo.get(input.tenderId);
  if (!current) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  // Only the workflow up to publication is the manager's to move; responses, evaluated and awarded follow from
  // their own actions (a submission, the comparison, choosing the winner).
  const denial = manualTransitionDenial(current.status, input.to);
  if (denial) throw new HttpsError('failed-precondition', denial);

  if (current.status === input.to) return { ok: true, verdict: null };
  if (input.to === 'internal_review') return sendForApproval(caller, current);
  if (input.to === 'draft') {
    // Procurement takes the send back (v22 cancelApproval): the case is a draft again, dates editable.
    await transition(caller, current.id, 'draft', { sentForApproval: null, finalCheck: null });
    await refreshCaseScore(SYSTEM, current.id);
    return { ok: true, verdict: null };
  }
  return publishToSuppliers(caller, current, input.supplierIds);
});

/** "שליחה לאישור" (plan G-D1, G-D7): procurement's approval, which opens everyone else's. */
async function sendForApproval(caller: Caller, t: TenderDoc) {
  const doc = hasDocument(t);
  const denial = sendDenial({
    status: t.status,
    hasDocument: doc,
    missingRoles: missingRoles(t.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[t.type], t.team),
    blockers: documentBlockers({ hasDocument: doc, lastSupervision: t.lastSupervision }),
    missingDates: missingTimelineDates(t),
  });
  if (denial) throw new HttpsError('failed-precondition', SEND_DENIAL_HE[denial]);
  const hash = await currentContentHash(t);
  await transition(caller, t.id, 'internal_review', {
    sentForApproval: { uid: caller.uid, name: caller.name, at: now(), ...(hash ? { docHash: hash } : {}) },
    finalCheck: null,
  });
  // Approvals kept from an earlier send stand only if the content is unchanged (plan G-D4).
  const sent = await tendersRepo.get(t.id);
  if (sent) await cancelStaleApprovals(sent, hash);
  const verdict = (await supervisorCheckpoint(caller, t.id, 'review'))?.verdict ?? null;
  await refreshCaseScore(SYSTEM, t.id);
  return { ok: true, verdict };
}

/**
 * "פרסום לספקים" (plan G-D6): the final check already ran, so publishing only verifies the document is the one
 * it passed. The suppliers picked in the dialog are saved and published in the same call.
 */
async function publishToSuppliers(caller: Caller, t: TenderDoc, supplierIds: string[] | undefined) {
  if (t.status !== 'ready') throw new HttpsError('failed-precondition', illegalTransitionHe(t.status, 'published'));
  // Every required role has signed off (security doesn't block — plan D2).
  if (REQUIRE_APPROVALS) {
    const waiting = missingApprovals(blockingApproverRoles(t.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[t.type]), t.team, t.approvals);
    if (waiting.length) {
      throw new HttpsError('failed-precondition', `לא ניתן לפרסם — ממתין לאישור: ${waiting.map(roleLabel).join(', ')}.`);
    }
  }
  // A template whose date fields come from the submission deadline can't be published without one.
  if (!t.submissionDeadline) {
    const tpl = await templatesRepo.getForCase(t.type);
    if (tpl?.params.some(isAutoDeadlineParam)) {
      throw new HttpsError('failed-precondition', 'יש לקבוע מועד הגשת הצעות לפני הפרסום לספקים.');
    }
  }
  // The document is the one the final check passed (locked since; this catches a change behind the lock).
  const hash = await currentContentHash(t);
  if (t.finalCheck?.docHash && hash && hash !== t.finalCheck.docHash) {
    throw new HttpsError('failed-precondition', 'המסמך השתנה מאז הבדיקה הסופית. יש לפתוח אותו מחדש לפני הפרסום.'); // new
  }
  // One button saves the suppliers and publishes (at least one).
  if (supplierIds) await savePendingSuppliers(caller, t, supplierIds);
  const pending = await internalRepo.getPendingSuppliers(t.id);
  if (!pending.length) throw new HttpsError('failed-precondition', 'יש לבחור לפחות ספק אחד לפני הפרסום.');

  await transition(caller, t.id, 'published', { publishedAt: now() });
  // Cache the exported HTML at publish so suppliers load it fast (no live Google export).
  const published = (await tendersRepo.get(t.id)) ?? t;
  const path = await cacheTenderHtml(published);
  await tendersRepo.update(t.id, { ...(path ? { docExportPath: path } : {}), publishedDocHash: hash ?? t.finalCheck?.docHash ?? null });
  // The picked suppliers get access now that the document is public to them.
  await grantSupplierAccess(caller, t.id, pending);
  await internalRepo.setPendingSuppliers(t.id, [], caller.uid);
  // Ask every internal participant how the drafting/review went.
  await requestFeedback(caller, t.id, 'publish');
  await refreshCaseScore(SYSTEM, t.id);
  return { ok: true, verdict: null };
}

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
/** Suppliers → view access (in-system only, no Google Docs permission), one audit entry each. */
async function grantSupplierAccess(caller: Caller, tenderId: string, supplierIds: readonly string[]): Promise<string[]> {
  const granted: string[] = [];
  for (const supplierId of supplierIds) {
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
    await accessRepo.grant(tenderId, a);
    await auditRepo.append({
      entityType: 'tender',
      entityId: tenderId,
      tenderId,
      actorUid: caller.uid,
      actorName: caller.name,
      action: 'share_supplier',
      prevState: null,
      newState: supplier.name,
    });
    granted.push(supplier.name);
  }
  return granted;
}

// The suppliers the case will be published to. Picked in review / once ready, kept internal (suppliers
// can't see it or each other); "פרסם לספקים" gives exactly these access.
export const setPendingSuppliers = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(setPendingSuppliersInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const ids = await savePendingSuppliers(caller, tender, input.supplierIds);
  return { ok: true, supplierIds: ids };
});

/** The suppliers the case will be published to: checked, saved (internal) and audited. */
async function savePendingSuppliers(caller: Caller, tender: TenderDoc, supplierIds: readonly string[]): Promise<string[]> {
  if (tender.status !== 'internal_review' && tender.status !== 'ready') {
    throw new HttpsError('failed-precondition', 'ניתן לבחור ספקים לפרסום אחרי השליחה לאישור ולפני הפרסום.');
  }
  const ids = [...new Set(supplierIds)];
  const known = (await Promise.all(ids.map((id) => suppliersRepo.get(id)))).filter((s): s is SupplierDoc => !!s);
  if (known.length !== ids.length) throw new HttpsError('invalid-argument', 'ספק לא מוכר ברשימה.');
  await internalRepo.setPendingSuppliers(tender.id, ids, caller.uid);
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'suppliers_selected',
    prevState: null,
    newState: `${ids.length} ספקים`,
    detail: known.map((s) => s.name).join(', ') || undefined,
  });
  return ids;
}

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

  await grantSupplierAccess(caller, input.tenderId, input.supplierIds ?? []);

  return { ok: true, docsSkipped: [] as string[] };
});

// Assign (or clear) the user holding one role slot of the case team. The previous holder loses
// access to the case, its document and its chat. Allowed in any status (people get replaced).
/**
 * Put one user in a case's team slot (or empty it): access, Docs permission and audit. Shared by the manager's
 * team edit and a unit assigning its own contact (plan D3).
 */
async function setTeamSlot(
  caller: Caller,
  tender: TenderDoc,
  role: TeamRole,
  uid: string | null,
): Promise<{ docsSkipped: string[] }> {
  const team: CaseTeam = { ...(tender.team ?? {}) };
  const prevUid = team[role] ?? null;
  if (prevUid === uid) return { docsSkipped: [] };

  let newUser: UserDoc | null = null;
  if (uid) {
    ({
      users: [newUser],
    } = await resolveTeam({ [role]: uid }));
    team[role] = uid;
  } else {
    delete team[role];
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
    newState: newUser ? `${role}:${newUser.displayName}` : role,
  });
  return { docsSkipped: skipped };
}

export const assignTeamMember = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(assignTeamMemberInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  const { docsSkipped } = await setTeamSlot(caller, tender, input.role, input.uid);
  return { ok: true, docsSkipped };
});

// The cases waiting for a contact from the caller's unit (plan D3): legal, finance or security users see
// them on their home with the colleagues who can take each one.
export const unitQueue = onCall(async (req) => {
  const caller = requireInternal(req);
  if (!isUnitRole(caller.role)) return { items: [] as UnitQueueItem[] };
  const role = caller.role;
  const open = (await tendersRepo.listUnitRequests(role)).filter(
    (t) => !t.team?.[role] && (t.status === 'draft' || t.status === 'internal_review'),
  );
  if (!open.length) return { items: [] as UnitQueueItem[] };
  const colleagues = (await usersRepo.listByRole(role)).map((u) => ({ uid: u.uid, name: u.displayName }));
  const owners = new Map<string, string>();
  for (const t of open) {
    if (!owners.has(t.ownerUid)) owners.set(t.ownerUid, (await usersRepo.get(t.ownerUid))?.displayName ?? '');
  }
  const items: UnitQueueItem[] = open
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => ({
      tenderId: t.id,
      ref: t.serial ?? t.id,
      name: t.title,
      ownerName: owners.get(t.ownerUid) ?? '',
      createdAt: t.createdAt,
      role,
      candidates: colleagues,
    }));
  return { items };
});

// A unit assigns its contact on a case that asked for one (plan D3): the caller's own role only, a colleague
// from the same unit (or themselves), and only while the slot is empty or theirs.
export const claimTeamSlot = onCall({ secrets: DOCS_SECRETS }, async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(claimTeamSlotInput, req.data);
  if (caller.role !== input.role) {
    throw new HttpsError('permission-denied', 'אפשר לשייך איש קשר רק מטעם היחידה שלך.');
  }
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (!tender.unitRequests?.includes(input.role)) {
    throw new HttpsError('failed-precondition', 'המכרז לא ביקש איש קשר מהיחידה שלך.');
  }
  const current = tender.team?.[input.role];
  if (current && current !== caller.uid) {
    throw new HttpsError('failed-precondition', 'כבר שויך איש קשר מהיחידה שלך למכרז זה.');
  }
  const target = await usersRepo.get(input.uid);
  if (!target || target.role !== input.role) {
    throw new HttpsError('invalid-argument', 'איש הקשר חייב להיות מאותה יחידה.');
  }
  const { docsSkipped } = await setTeamSlot(caller, tender, input.role, input.uid);
  return { ok: true, docsSkipped };
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

// A case-team member approves (or withdraws approval of) the tender during internal review. The
// approval belongs to the role slot the caller holds; the manager's own sign-off is the final approval.
export const approveTender = onCall(async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(approveTenderInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  // The rules (order, on-behalf, blocking) live in shared/approvalRules.ts — plan B4, decisions D1/D1a/D1d.
  const doc = hasDocument(tender);
  const holderUid = input.onBehalfOf ? tender.team?.[input.onBehalfOf] : undefined;
  const holderName = holderUid ? (await usersRepo.get(holderUid))?.displayName : undefined;
  // The content being approved (plan G-D4); approvals given on an earlier version are cancelled first.
  const docHash = input.approve && tender.status === 'internal_review' && doc ? await currentContentHash(tender) : null;
  const cancelled = docHash ? await cancelStaleApprovals(tender, docHash) : [];
  const fresh = cancelled.length ? ((await tendersRepo.get(tender.id)) ?? tender) : tender;
  const plan = planApproval(
    {
      status: fresh.status,
      hasDocument: doc,
      ownerUid: fresh.ownerUid,
      team: fresh.team,
      approvals: fresh.approvals,
      requiredRoles: fresh.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[fresh.type],
      blockers: documentBlockers({ hasDocument: doc, lastSupervision: fresh.lastSupervision }),
    },
    {
      uid: caller.uid,
      name: caller.name,
      approve: input.approve,
      ...(input.onBehalfOf ? { onBehalfOf: input.onBehalfOf } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(holderName ? { holderName } : {}),
      docHash,
    },
    now(),
  );
  if (plan.ok && tender.finalCheck?.state === 'running') {
    throw new HttpsError('failed-precondition', 'הסוכן המפקח מבצע בדיקה סופית. אפשר לשנות אישורים אחרי שהבדיקה תסתיים.'); // new
  }
  if (!plan.ok) {
    throw new HttpsError(
      APPROVAL_PERMISSION_DENIALS.includes(plan.denial) ? 'permission-denied' : 'failed-precondition',
      APPROVAL_DENIAL_HE[plan.denial],
    );
  }
  for (const w of plan.writes) {
    await tendersRepo.setApproval(tender.id, w.role, w.approval);
    await auditRepo.append({
      entityType: 'tender',
      entityId: tender.id,
      tenderId: tender.id,
      actorUid: caller.uid,
      actorName: caller.name,
      action: plan.audit,
      prevState: null,
      newState: w.role,
      // On behalf: whose approval it stands for and why (shown in the activity tab).
      ...(input.onBehalfOf
        ? { detail: `${holderName ?? w.role}${w.approval?.reason ? ` · ${w.approval.reason}` : ''}` }
        : {}),
    });
  }
  // Approved again after a content change: the "approval cancelled" mark goes.
  const reapproved = plan.writes.filter((w) => w.approval && fresh.cancelledApprovals?.[w.role]).map((w) => w.role);
  await tendersRepo.clearCancelled(tender.id, reapproved);
  // The participant is told, in the case chat and in "לטיפולך" (UX answer 1.1.C).
  if (plan.audit === 'approve_on_behalf' && input.onBehalfOf) {
    const reason = plan.writes[0]?.approval?.reason ?? '';
    await postSystemChat(
      tender.id,
      `אישור בשם: ${caller.name} אישר בשם ${holderName ?? roleLabel(input.onBehalfOf)} · ${roleLabel(input.onBehalfOf)} · סיבה: ${reason}`,
    );
  }
  return { ok: true, cancelled };
});

/** A system line in the case's team chat (plan G-D2): immutable like every message, written by the server. */
async function postSystemChat(tenderId: string, text: string): Promise<void> {
  const ref = db.collection('tenders').doc(tenderId).collection('chat').doc();
  await ref.set({
    id: ref.id,
    uid: SYSTEM.uid,
    name: SYSTEM.name,
    role: 'system',
    text: text.slice(0, CHAT_MAX_LENGTH),
    createdAt: FieldValue.serverTimestamp(),
  });
}

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
  // Draft-first: no document yet — say so instead of failing to read one.
  if (!hasDocument(tender)) return { kind: 'none' as const, title: tender.title };
  return getViewable(tender, caller.role !== 'supplier');
});

// ---- Clarification Q&A ----
export const askQuestion = onCall(async (req) => {
  const caller = requireAuth(req);
  if (caller.role !== 'supplier' || !caller.supplierId) {
    throw new HttpsError('permission-denied', 'רק ספק יכול לשאול שאלות.');
  }
  const parsed = parseInput(askQuestionInput, req.data);
  const input = { ...parsed, text: stripMarkup(parsed.text).trim() };
  if (input.text.length < 3) throw new HttpsError('invalid-argument', 'השאלה קצרה מדי.');
  const { tender: qTender } = await supplierCase(caller, input.tenderId);
  if (qTender.submissionDeadline && now() > qTender.submissionDeadline) {
    throw new HttpsError('failed-precondition', 'מועד ההגשה חלף — לא ניתן לשאול שאלות.');
  }
  // A supplier can't flood the case (or the AI clustering) with questions.
  const allowed = await agentUsageRepo.take(caller.uid, QUESTIONS_PER_HOUR, 3_600_000, Date.now(), `q_${input.tenderId}`);
  if (!allowed) throw new HttpsError('resource-exhausted', 'הגעת למספר השאלות המותר לשעה. נסה שוב מאוחר יותר.');

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

// ---- the supplier's side: suppliers reach data only through these functions (no direct database or
// storage access; see firestore.rules / storage.rules). Each returns a safe projection only.

const QUESTIONS_PER_HOUR = 20;

/** A supplier's access to a published case: access granted and the case visible to suppliers. */
async function supplierCase(caller: Caller, tenderId: string): Promise<{ tender: TenderDoc; supplierId: string }> {
  if (caller.role !== 'supplier' || !caller.supplierId) throw new HttpsError('permission-denied', 'גישה לספקים בלבד.');
  const [tender, access] = await Promise.all([tendersRepo.get(tenderId), accessRepo.get(tenderId, caller.supplierId)]);
  if (!tender || !access || !isSupplierVisible(tender.status)) {
    throw new HttpsError('permission-denied', 'אין הרשאה למכרז זה.');
  }
  return { tender, supplierId: caller.supplierId };
}

function supplierView(t: TenderDoc, supplierId: string): SupplierTenderView {
  return {
    id: t.id,
    serial: t.serial ?? null,
    title: t.title,
    type: t.type,
    status: t.status,
    submissionDeadline: t.submissionDeadline ?? null,
    awardDate: t.awardDate ?? null,
    domainTags: t.domainTags ?? [],
    evaluationCriteria: t.evaluationCriteria ?? [],
    awarded: t.status === 'awarded' ? t.awardedSupplierId === supplierId : null,
  };
}

export const supplierListTenders = onCall(async (req) => {
  const caller = requireAuth(req);
  if (caller.role !== 'supplier' || !caller.supplierId) throw new HttpsError('permission-denied', 'גישה לספקים בלבד.');
  const ids = await accessRepo.tenderIdsFor(caller.supplierId);
  const tenders = (await Promise.all(ids.map((id) => tendersRepo.get(id)))).filter(
    (t): t is TenderDoc => !!t && isSupplierVisible(t.status),
  );
  return { tenders: tenders.map((t) => supplierView(t, caller.supplierId!)) };
});

export const supplierGetTender = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(supplierTenderInput, req.data);
  const { tender, supplierId } = await supplierCase(caller, input.tenderId);
  const [questions, answers, mine, submission] = await Promise.all([
    questionsRepo.list(tender.id),
    answersRepo.list(tender.id),
    accessRepo.questionIdsBy(tender.id, supplierId),
    submissionsRepo.get(tender.id, supplierId),
  ]);
  return {
    tender: supplierView(tender, supplierId),
    // Questions are anonymous; answers carry no author.
    questions: questions.map((q) => ({ id: q.id, text: q.text, answered: q.answered, clusterId: q.clusterId, createdAt: q.createdAt })),
    answers: answers.map((a) => ({ id: a.id, clusterId: a.clusterId, questionIds: a.questionIds, text: a.text, createdAt: a.createdAt })),
    myQuestionIds: mine,
    mySubmission: submission
      ? { files: submission.files, summary: submission.summary, status: submission.status, submittedAt: submission.submittedAt }
      : null,
  };
});

// One file of a proposal: a short-lived signed upload link for exactly this supplier's folder.
export const createSubmissionUpload = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(createSubmissionUploadInput, req.data);
  const { tender, supplierId } = await supplierCase(caller, input.tenderId);
  if (tender.submissionDeadline && now() > tender.submissionDeadline) {
    throw new HttpsError('failed-precondition', 'מועד ההגשה חלף — ההגשה נעולה.');
  }
  const safeName = input.fileName.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_').replace(/^\.+/, '_').slice(0, 150);
  const path = `tenders/${tender.id}/submissions/${supplierId}/${safeName}`;
  const file = storage.bucket().file(path);
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    // The Storage emulator can't verify signed URLs; tests upload through its admin endpoint.
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
    return {
      url: `http://${host}/upload/storage/v1/b/${storage.bucket().name}/o?uploadType=media&name=${encodeURIComponent(path)}`,
      method: 'POST',
      headers: { 'Content-Type': input.contentType, Authorization: 'Bearer owner' },
      path,
      name: safeName,
    };
  }
  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60_000,
      contentType: input.contentType,
    });
    return { url, method: 'PUT', headers: { 'Content-Type': input.contentType }, path, name: safeName };
  } catch (err) {
    console.error('createSubmissionUpload: signing failed', err);
    throw new HttpsError('failed-precondition', 'העלאת קבצים אינה זמינה כרגע (הרשאת חתימה חסרה). פנה למנהל המכרז.');
  }
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
    // Questions carrying instructions were kept away from the AI; the manager is told (never suppliers).
    const flagged = questions
      .map((q) => ({ id: q.id, signal: injectionSignals(q.text)[0] }))
      .filter((f) => f.signal)
      .map((f) => ({ id: f.id, evidence: f.signal!.evidence }));
    if (flagged.length) {
      await auditRepo.append({
        entityType: 'tender',
        entityId: input.tenderId,
        tenderId: input.tenderId,
        actorUid: caller.uid,
        actorName: caller.name,
        action: 'prompt_injection_suspected',
        prevState: null,
        newState: `${flagged.length} שאלות`,
        detail: flagged.map((f) => f.evidence).join(' | ').slice(0, 500),
      });
    }
    return { clusters, flagged };
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
  const parsed = parseInput(saveSubmissionInput, req.data);
  const input = { ...parsed, summary: stripMarkup(parsed.summary) };
  const { tender } = await supplierCase(caller, input.tenderId);
  if (tender.submissionDeadline && now() > tender.submissionDeadline) {
    throw new HttpsError('failed-precondition', 'מועד ההגשה חלף — ההגשה נעולה.');
  }
  // Files must be the supplier's own uploads (uploaded through createSubmissionUpload).
  const folder = `tenders/${input.tenderId}/submissions/${caller.supplierId}/`;
  for (const f of input.files) {
    if (!f.path.startsWith(folder) || f.path.includes('..')) {
      throw new HttpsError('permission-denied', 'קובץ שאינו שייך להגשה שלך.');
    }
    const [exists] = await storage.bucket().file(f.path).exists();
    if (!exists) throw new HttpsError('invalid-argument', `הקובץ ${f.name} לא הועלה.`);
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
    // Internal only: the report never goes on the supplier-readable tender doc.
    await internalRepo.setComparison(input.tenderId, report);
    await tendersRepo.update(input.tenderId, { comparisonReport: null });
    const flagged = report.ranking.filter((r) => r.injection);
    if (flagged.length) {
      await auditRepo.append({
        entityType: 'tender',
        entityId: input.tenderId,
        tenderId: input.tenderId,
        actorUid: SYSTEM.uid,
        actorName: SYSTEM.name,
        action: 'prompt_injection_suspected',
        prevState: null,
        newState: `${flagged.length} הצעות`,
        detail: flagged.map((r) => `${r.supplierId}: ${r.injection!.evidence}`).join(' | ').slice(0, 500),
      });
    }
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

// One-time, idempotent: move comparison reports off the supplier-readable tender docs (manager).
export const migrateComparisonReports = onCall(async (req) => {
  const caller = requireManager(req);
  const snap = await db.collection('tenders').where('comparisonReport', '!=', null).get();
  let moved = 0;
  for (const d of snap.docs) {
    const report = d.data().comparisonReport;
    if (!report) continue;
    if (!(await internalRepo.getComparison(d.id))) await internalRepo.setComparison(d.id, report);
    await tendersRepo.update(d.id, { comparisonReport: null });
    moved++;
  }
  await auditRepo.append({
    entityType: 'system',
    entityId: 'comparisonReports',
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'migrate_comparison_reports',
    prevState: null,
    newState: `${moved} moved`,
  });
  return { moved };
});

// Manager awards the tender to a supplier (final decision).
export const awardTender = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(awardTenderInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  // Everything is checked before anything is written: a refused award leaves no winner behind.
  if (tender.status === 'awarded') throw new HttpsError('failed-precondition', 'כבר נבחר זוכה במכרז הזה.');
  if (!canTransition(tender.status, 'awarded')) {
    throw new HttpsError('failed-precondition', 'ניתן לבחור זוכה רק לאחר השוואת ההצעות.');
  }
  const supplier = await suppliersRepo.get(input.supplierId);
  if (!supplier) throw new HttpsError('not-found', 'ספק לא נמצא.');
  // The winner is one of the bidders.
  if (!(await submissionsRepo.get(input.tenderId, input.supplierId))) {
    throw new HttpsError('failed-precondition', 'הספק לא הגיש הצעה במכרז הזה.');
  }

  // The winner and the status are written together, in the transaction that checks the move once more.
  await transition(caller, input.tenderId, 'awarded', {
    awardedSupplierId: input.supplierId,
    awardDate: now(),
  });
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
    const [registered, ext] = await Promise.all([findCandidates(tags), suggestExternalSuppliers(tags, input.type)]);
    return { registered, external: ext.suppliers, externalStatus: ext.status };
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
    const template = await templatesRepo.getForCase(input.type);
    if (!template) throw new HttpsError('failed-precondition', `אין תבנית לסוג: ${input.type}`);
    const skills = requiredSkillsFor(input.type);
    // The requester's phase 1 answers (never the internal budget) ride along with the brief.
    const bidReq = input.bidRequestId ? await bidRequestsRepo.get(input.bidRequestId) : null;
    if (input.bidRequestId && !bidReq) throw new HttpsError('not-found', 'הבקשה לא נמצאה.');
    const brief = briefWithDetails(input.brief, bidReq?.details);
    const draft = await draftBidContent(input.type, brief, template, skills);

    // Keep the raw draft so the supervisor can later tell AI-written values from manager edits.
    const draftId = bidDraftsRepo.newId();
    await bidDraftsRepo.save({
      draftId,
      type: input.type,
      brief,
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
  if (input.initial && (tender.lastSupervision || tender.supervisionRun?.state === 'running')) {
    return { skipped: true as const };
  }
  let report: SupervisionReport;
  try {
    report = await superviseTender(caller, input.tenderId, input.initial ? 'created' : 'manual');
  } catch (e) {
    // Someone else's run is still going (plan B1): the initial check is then simply not needed.
    if (e instanceof SupervisionBusyError) {
      if (input.initial) return { skipped: true as const };
      throw new HttpsError('failed-precondition', e.message);
    }
    throw e;
  }
  await refreshCaseScore(SYSTEM, input.tenderId);
  return report;
});

// A stored version of the document: its text ("צפה"), or its comparison with the current version
// ("השווה לנוכחית") — internal case members only (plan B6).
export const getVersionView = onCall(async (req) => {
  const caller = requireInternal(req);
  const input = parseInput(getVersionViewInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  requireCaseAccess(caller, tender);
  const list = await versionsRepo.list(tender.id);
  const version = list.find((v) => v.n === input.n);
  if (!version) throw new HttpsError('not-found', 'הגרסה לא נמצאה.');
  const text = await readVersionSnapshot(version.path);
  if (!input.compare) return { n: version.n, at: version.at, text } satisfies VersionView;
  const current = list[list.length - 1];
  const currentText = current.n === version.n ? text : await readVersionSnapshot(current.path);
  return { n: version.n, currentN: current.n, rows: contextDiff(text, currentText) } satisfies VersionView;
});

// Reopen a locked case (plan B5): a new, editable copy of its document and a clean round of approvals. The
// locked original stays as approved (listed in `lockedDocuments`). Only the case owner, and only before
// publication — a published document is amended, not reopened.
export const reopenTender = onCall({ ...SUPERVISED, secrets: [...DOCS_SECRETS, 'ANTHROPIC_API_KEY'] }, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(reopenTenderInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (tender.status !== 'ready') {
    throw new HttpsError('failed-precondition', 'ניתן לפתוח מחדש רק מסמך נעול, לפני הפרסום לספקים.');
  }
  const copy = await copyTenderDocument(tender);
  try {
    // ready → draft (audited): a new approval round starts with procurement's send (plan Phase G).
    await transition(caller, tender.id, 'draft', { sentForApproval: null, finalCheck: null, cancelledApprovals: {} });
    await tendersRepo.clearApprovals(tender.id);
    await tendersRepo.update(tender.id, {
      googleDocId: copy.googleDocId,
      docExportPath: copy.exportPath,
      documentGeneratedAt: now(),
      documentGeneratedBy: caller.uid,
      lockedAt: null,
      lockedDocuments: [
        ...(tender.lockedDocuments ?? []),
        {
          googleDocId: tender.googleDocId,
          docExportPath: tender.docExportPath,
          lockedAt: tender.lockedAt ?? null,
          reopenedAt: now(),
          reopenedBy: caller.uid,
          approvals: tender.approvals ?? {},
        },
      ],
    });
  } catch (err) {
    await discardGeneratedDocument(tender.id, copy); // the copy is not used: undo it, the case stays locked
    throw err;
  }
  const reopened = (await tendersRepo.get(tender.id)) ?? tender;
  const skipped = await grantCaseDocPermissions(reopened, copy.googleDocId, caller);
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'tender_reopened',
    prevState: 'ready',
    newState: 'draft',
    detail: 'נוצרה גרסה חדשה מקושרת. המקור נשאר נעול',
  });
  await autoSupervise(tender.id); // the agent checks the new document right away
  return { ok: true as const, docsSkipped: skipped };
});

// The supervising agent starts by itself (plan B1): the first check of a new draft, and the check of its
// document once created — exactly once, whoever opens the case and even with no browser open. A run someone
// already started covers it (this one then skips). "↻ הרץ בדיקה" stays for manual runs.
async function autoSupervise(tenderId: string): Promise<void> {
  try {
    await superviseTender(SYSTEM, tenderId, 'created');
    await refreshCaseScore(SYSTEM, tenderId);
  } catch (err) {
    if (err instanceof SupervisionBusyError) return;
    console.error(`auto supervision ${tenderId} failed`, err);
  }
}

export const superviseOnTenderCreated = onDocumentCreated(
  { document: 'tenders/{tenderId}', ...SUPERVISED },
  async (event) => {
    const data = event.data?.data() as TenderDoc | undefined;
    if (!data || !autoRunOnCreate(data)) return; // already checked (event redelivery)
    await autoSupervise(event.params.tenderId);
  },
);

export const superviseOnDocumentReady = onDocumentUpdated(
  { document: 'tenders/{tenderId}', ...SUPERVISED },
  async (event) => {
    const before = event.data?.before.data() as TenderDoc | undefined;
    const after = event.data?.after.data() as TenderDoc | undefined;
    if (!before || !after || !documentBecameReady(before, after)) return; // any other update: nothing to do
    await autoSupervise(event.params.tenderId);
  },
);

// The final check (plan G-D3) starts by itself: when the last approval lands, and again after a final check
// that found a blocker, once a newer agent check of the document finds none (everyone still approved).
export const finalCheckOnApprovals = onDocumentUpdated(
  { document: 'tenders/{tenderId}', ...SUPERVISED },
  async (event) => {
    const before = event.data?.before.data() as TenderDoc | undefined;
    const after = event.data?.after.data() as TenderDoc | undefined;
    if (!before || !after || !readyForFinalCheck(after)) return;
    // Stopped on the AI being unavailable: procurement decides (continue with a reason, or run it again).
    if (after.finalCheck?.state === 'ai_unavailable') return;
    const becameReady = !readyForFinalCheck(before);
    const fixed =
      after.finalCheck?.state === 'blocked' &&
      !!after.lastSupervision &&
      after.lastSupervision.runId !== before.lastSupervision?.runId &&
      after.lastSupervision.stage !== 'final' &&
      after.lastSupervision.blockers === 0;
    if (becameReady || fixed) await runFinalCheck(event.params.tenderId);
  },
);

const CONTINUE_DENIAL_HE = {
  not_waiting: 'אפשר להמשיך בלי בדיקת AI רק כשהבדיקה הסופית לא הושלמה כי בדיקת ה-AI אינה זמינה.', // new
  reason_required: 'יש לציין סיבה (10 תווים לפחות).', // new
  changed: 'המסמך השתנה אחרי האישורים, ולכן בוטלו האישורים שניתנו לפני השינוי.', // new
} as const;

// Procurement continues to "פרסום לספקים" without the AI review when it was unavailable (plan G-D5). Audited.
export const continueWithoutAiCheck = onCall(SUPERVISED, async (req) => {
  const caller = requireManager(req);
  const input = parseInput(continueWithoutAiInput, req.data);
  const t = await tendersRepo.get(input.tenderId);
  if (!t) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (t.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'רק מנהל המכרז יכול להמשיך בלי בדיקת AI.'); // new
  const denial = await continueWithoutAi(t, caller, input.reason);
  if (denial) throw new HttpsError('failed-precondition', CONTINUE_DENIAL_HE[denial]);
  await refreshCaseScore(SYSTEM, t.id);
  return { ok: true };
});

// The final check again, after it failed to complete or found a blocker that is fixed now.
export const rerunFinalCheck = onCall(SUPERVISED, async (req) => {
  requireManager(req);
  const input = parseInput(rerunFinalCheckInput, req.data);
  const t = await tendersRepo.get(input.tenderId);
  if (!t) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (!readyForFinalCheck(t) || !['error', 'blocked', 'ai_unavailable'].includes(t.finalCheck?.state ?? '')) {
    throw new HttpsError('failed-precondition', 'אפשר להריץ שוב את הבדיקה הסופית רק אחרי שכל הרביעייה אישרה.'); // new
  }
  await runFinalCheck(t.id);
  return { ok: true };
});

/** Epoch of a date at a time of day in Israel ("12:00"), whichever offset (+2 / +3) applies that day. */
function israelDateTimeMs(iso: string, hm: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  for (const offset of [2, 3]) {
    const ms = Date.UTC(y!, m! - 1, d!, h! - offset, mi!);
    const shown = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
    if (shown === `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`) return ms;
  }
  return Date.UTC(y!, m! - 1, d!, h! - 2, mi!);
}

// "לוחות זמנים" (plan G-D7, G-D9): procurement sets the four dates until the send; a blocked day is refused.
export const setTimeline = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(setTimelineInput, req.data);
  const t = await tendersRepo.get(input.tenderId);
  if (!t) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (t.status !== 'draft') {
    throw new HttpsError('failed-precondition', 'אפשר לשנות תאריכים עד השליחה לאישור. אחר כך נדרשת פתיחה מחדש.'); // new
  }
  for (const [, iso] of Object.entries(input.dates)) {
    if (!iso) continue;
    const day = checkTimelineDay(iso);
    if (!day.ok) throw new HttpsError('invalid-argument', TIMELINE_DAY_HE[day.error]);
  }
  const timeline = { ...t.timeline, ...input.dates };
  // The submission date is the deadline suppliers see: keep its time of day (noon when there was none).
  let submissionDeadline = t.submissionDeadline ?? null;
  if (input.dates.submit !== undefined) {
    const hm = t.submissionDeadline
      ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(t.submissionDeadline)
      : '12:00';
    submissionDeadline = input.dates.submit ? israelDateTimeMs(input.dates.submit, hm) : null;
  }
  await tendersRepo.update(t.id, { timeline, submissionDeadline });

  // The dates go into the document's fields (G-D7): through the draft data before the document exists (the
  // rules re-check it like any edit); once it exists, each changed value is replaced in it if it appears once.
  const template = await templatesRepo.getForCase(t.type);
  const before = timelineOf(t);
  const after = timelineOf({ timeline, submissionDeadline });
  const mapped = template ? timelineParamValues(template.params, after) : {};
  let docUpdated: boolean | null = null;
  if (template && !hasDocument(t)) {
    if (Object.keys(mapped).length) {
      const dated = { ...t, timeline, submissionDeadline };
      await applyDraftData(caller, dated, template, { tenderId: t.id, params: mapped }, currentPublicBrief(template, t.params));
      const fresh = await tendersRepo.get(t.id);
      if (fresh?.lastSupervision?.basis === 'draft' && fresh.supervisionRun?.state !== 'running') {
        await superviseTender(caller, t.id, 'edit').catch((e) => console.error('timeline re-check failed', e));
      }
    }
  } else if (template) {
    const replacements: [string, string][] = Object.entries(mapped)
      .filter(([k, v]) => t.params[k] !== undefined && String(t.params[k]) !== String(v))
      .map(([k, v]) => [String(t.params[k]), String(v)]);
    if (before.submit && after.submit && before.submit !== after.submit) {
      replacements.push([formatDocDate(before.submit), formatDocDate(after.submit)]);
    }
    let all = true;
    for (const [from, to] of replacements) {
      all = (await replaceOnceInDocument(t, from, to).catch(() => false)) && all;
    }
    if (Object.keys(mapped).length) await tendersRepo.update(t.id, { params: { ...t.params, ...mapped } });
    docUpdated = replacements.length ? all : null;
  }

  await auditRepo.append({
    entityType: 'tender',
    entityId: t.id,
    tenderId: t.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'timeline_updated',
    prevState: null,
    newState: Object.keys(input.dates).join(','),
  });
  // docUpdated: null = nothing to change in a document; false = left for the user to update in Google Docs.
  return { ok: true, timeline, submissionDeadline, docUpdated };
});

// The manager decides on findings of the latest check (plan B2): incorporated — the next check verifies it —
// or left as is. Warnings only: a blocking finding goes away when a check no longer finds it, never by a mark.
export const decideFinding = onCall(async (req) => {
  const caller = requireManager(req);
  const input = parseInput(decideFindingInput, req.data);
  const tender = await tendersRepo.get(input.tenderId);
  if (!tender) throw new HttpsError('not-found', 'מכרז לא נמצא.');
  if (!['draft', 'internal_review', 'ready'].includes(tender.status)) {
    throw new HttpsError('failed-precondition', 'ניתן להחליט על ממצאים רק לפני הפרסום.');
  }
  const last = tender.lastSupervision ? await supervisionRepo.get(tender.id, tender.lastSupervision.runId) : null;
  if (!last) throw new HttpsError('failed-precondition', 'הסוכן המפקח טרם בדק את המכרז.');
  const findings = withFindingKeys(last.findings, last.basis ?? 'document');
  const decisions = { ...(tender.findingDecisions ?? {}) };
  for (const key of input.keys) {
    const f = findings.find((x) => x.key === key);
    if (!f) throw new HttpsError('failed-precondition', 'הממצא אינו בבדיקה האחרונה. יש לרענן את הדף.');
    if (f.severity === 'block') throw new HttpsError('failed-precondition', 'ממצא חוסם מטופל בתיקון, לא בסימון.');
    decisions[key] = { action: input.action, by: caller.uid, byName: caller.name, at: now() };
  }
  await tendersRepo.setFindingDecisions(tender.id, decisions);
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: caller.uid,
    actorName: caller.name,
    action: input.action === 'applied' ? 'finding_applied' : 'finding_skipped',
    prevState: null,
    newState: String(input.keys.length),
    detail: input.keys.slice(0, 10).join(', '),
  });
  return { ok: true as const };
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
    phone: input.phone, // the bid manager's phone fills BID_MANAGER_PHONE in documents
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
