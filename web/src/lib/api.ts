import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type {
  CreateTenderInput,
  CreateBidRequestInput,
  AssistRequestInput,
  AssistRequestResult,
  RecommendationsInput,
  RecommendationsResult,
  GrantAccessInput,
  SupplierTenderView,
  CreateSubmissionUploadInput,
  SubmissionDoc,
  SetPendingSuppliersInput,
  AskQuestionInput,
  AnswerQuestionsInput,
  TransitionTenderInput,
  UpsertSupplierInput,
  CreateSupplierAccountInput,
  BindTemplateInput,
  CreateTemplateDocInput,
  SyncTemplateFieldsInput,
  UpdateTemplateMetaInput,
  TemplateParam,
  SaveSubmissionInput,
  RunComparisonInput,
  AwardTenderInput,
  ComparisonReport,
  DraftBidInput,
  SearchSuppliersInput,
  BidDraft,
  ExternalSupplierSuggestion,
  CreateInternalUserInput,
  DeleteInternalUserInput,
  RefreshTenderDocumentInput,
  RunSupervisionInput,
  DecideFindingInput,
  SetTemplateInternalFieldsInput,
  RecomputeCaseScoreInput,
  UpdateScoringTargetsInput,
  CaseScore,
  SubmitFeedbackInput,
  DeclineFeedbackInput,
  GenerateSkillTipsInput,
  FeedbackDoc,
  SkillTipsRun,
  SkillsCatalog,
  AssignTeamMemberInput,
  ClaimTeamSlotInput,
  UnitQueueItem,
  AnalyzeTemplateFieldsInput,
  ApplyTemplateConversionInput,
  ConversionRun,
  ConversionReport,
  SetRequiredRolesInput,
  ApproveTenderInput,
  TeamRole,
  SupervisionReport,
  SupervisionVerdict,
  UpdateTenderDraftInput,
  GenerateDocumentInput,
  RerunRequestResearchInput,
  ResearchDraftInput,
  ResearchDraftResult,
  ResearchStatus,
  ExternalSearchStatus,
} from '@obms/shared';

/** What a supplier receives for one case (safe projection; see supplierGetTender). */
export interface SupplierCase {
  tender: SupplierTenderView;
  questions: { id: string; text: string; answered: boolean; clusterId: string | null; createdAt: number }[];
  answers: { id: string; clusterId: string; questionIds: string[]; text: string; createdAt: number }[];
  myQuestionIds: string[];
  mySubmission: Pick<SubmissionDoc, 'files' | 'summary' | 'status' | 'submittedAt'> | null;
}

// The Firebase client gives up after 70 s by default and reports an error — while the server keeps
// going (creating a case runs the supervisor + Claude and takes ~1.5 min). Wait as long as the
// longest server timeout (540 s); each function still enforces its own limit.
const CALL_TIMEOUT_MS = 540_000;

const call = <I, O>(name: string) => {
  const fn = httpsCallable<I, O>(functions, name, { timeout: CALL_TIMEOUT_MS });
  return async (data: I): Promise<O> => (await fn(data)).data;
};

export const api = {
  createBidRequest: call<CreateBidRequestInput, { serial: string; duplicate: boolean }>('createBidRequest'),
  assistRequest: call<AssistRequestInput, AssistRequestResult>('assistRequest'),
  requestRecommendations: call<RecommendationsInput, RecommendationsResult>('requestRecommendations'),
  createTender: call<
    CreateTenderInput,
    {
      id: string;
      serial: string;
      docsSkipped: string[];
      verdict: SupervisionVerdict | null;
      missingRoles: TeamRole[];
      duplicate: boolean; // a retried submission — the case created the first time
    }
  >('createTender'),
  assignTeamMember: call<AssignTeamMemberInput, { ok: true; docsSkipped: string[] }>('assignTeamMember'),
  // A unit's cases waiting for its contact, and assigning one (plan D3).
  unitQueue: call<Record<string, never>, { items: UnitQueueItem[] }>('unitQueue'),
  claimTeamSlot: call<ClaimTeamSlotInput, { ok: true; docsSkipped: string[] }>('claimTeamSlot'),
  setRequiredRoles: call<SetRequiredRolesInput, { requiredRoles: TeamRole[] }>('setRequiredRoles'),
  approveTender: call<ApproveTenderInput, { ok: true }>('approveTender'),
  backfillSerials: call<Record<string, never>, { assigned: number; total: number }>('backfillSerials'),
  migrateTeams: call<Record<string, never>, { migrated: number }>('migrateTeams'),
  analyzeTemplateFields: call<AnalyzeTemplateFieldsInput, ConversionRun>('analyzeTemplateFields'),
  applyTemplateConversion: call<ApplyTemplateConversionInput, ConversionReport>('applyTemplateConversion'),
  transitionTender: call<TransitionTenderInput, { ok: true; verdict: SupervisionVerdict | null }>(
    'transitionTender',
  ),
  refreshTenderDocument: call<RefreshTenderDocumentInput, { ok: true; cached: boolean }>(
    'refreshTenderDocument',
  ),
  runSupervision: call<RunSupervisionInput, SupervisionReport | { skipped: true }>('runSupervision'),
  // Incorporate / leave as is a warning of the latest check (plan B2).
  decideFinding: call<DecideFindingInput, { ok: true }>('decideFinding'),
  recomputeCaseScore: call<RecomputeCaseScoreInput, CaseScore>('recomputeCaseScore'),
  backfillCaseScores: call<Record<string, never>, { scored: number; failed: string[] }>(
    'backfillCaseScores',
  ),
  updateScoringTargets: call<UpdateScoringTargetsInput, { ok: true }>('updateScoringTargets'),
  submitFeedback: call<SubmitFeedbackInput, FeedbackDoc>('submitFeedback'),
  declineFeedback: call<DeclineFeedbackInput, { ok: true }>('declineFeedback'),
  generateSkillTips: call<GenerateSkillTipsInput, SkillTipsRun>('generateSkillTips'),
  getSkillsCatalog: call<Record<string, never>, SkillsCatalog>('getSkillsCatalog'),
  grantAccess: call<GrantAccessInput, { ok: true; docsSkipped: string[] }>('grantAccess'),
  setPendingSuppliers: call<SetPendingSuppliersInput, { ok: true; supplierIds: string[] }>('setPendingSuppliers'),
  getTenderDocument: call<
    { tenderId: string },
    { kind: 'html'; content: string; title: string } | { kind: 'none'; title: string }
  >('getTenderDocument'),
  updateTenderDraft: call<UpdateTenderDraftInput, { ok: true; draftDataHash: string; changed: string[] }>(
    'updateTenderDraft',
  ),
  generateDocument: call<GenerateDocumentInput, { ok: true }>('generateDocument'),
  regenerateDocument: call<GenerateDocumentInput, { ok: true; draftDataHash: string }>('regenerateDocument'),
  researchDraftRequest: call<ResearchDraftInput, ResearchDraftResult>('researchDraftRequest'),
  rerunRequestResearch: call<RerunRequestResearchInput, { status: ResearchStatus; runId: string }>(
    'rerunRequestResearch',
  ),
  askQuestion: call<AskQuestionInput, { id: string }>('askQuestion'),
  // The supplier's side: functions only (suppliers have no direct database or storage access).
  supplierListTenders: call<Record<string, never>, { tenders: SupplierTenderView[] }>('supplierListTenders'),
  supplierGetTender: call<{ tenderId: string }, SupplierCase>('supplierGetTender'),
  createSubmissionUpload: call<
    CreateSubmissionUploadInput,
    { url: string; method: 'PUT' | 'POST'; headers: Record<string, string>; path: string; name: string }
  >('createSubmissionUpload'),
  clusterTenderQuestions: call<
    { tenderId: string },
    { clusters: { clusterId: string; questionIds: string[]; representativeText: string }[] }
  >('clusterTenderQuestions'),
  answerQuestions: call<AnswerQuestionsInput, { id: string }>('answerQuestions'),
  upsertSupplier: call<UpsertSupplierInput, { id: string }>('upsertSupplier'),
  createSupplierAccount: call<
    CreateSupplierAccountInput,
    { email: string; tempPassword: string | null }
  >('createSupplierAccount'),
  bindTemplateGoogleDoc: call<
    BindTemplateInput,
    { docId: string; params: TemplateParam[]; warning: string | null }
  >('bindTemplateGoogleDoc'),
  createTemplateDoc: call<CreateTemplateDocInput, { docId: string; url: string }>(
    'createTemplateDoc',
  ),
  syncTemplateFields: call<SyncTemplateFieldsInput, { params: TemplateParam[] }>(
    'syncTemplateFields',
  ),
  updateTemplateMeta: call<UpdateTemplateMetaInput, { ok: true }>('updateTemplateMeta'),
  setTemplateInternalFields: call<SetTemplateInternalFieldsInput, { params: TemplateParam[] }>(
    'setTemplateInternalFields',
  ),
  saveSubmission: call<SaveSubmissionInput, { ok: true }>('saveSubmission'),
  runComparison: call<RunComparisonInput, ComparisonReport>('runComparison'),
  awardTender: call<AwardTenderInput, { ok: true }>('awardTender'),
  draftBid: call<DraftBidInput, BidDraft>('draftBid'),
  searchSuppliers: call<
    SearchSuppliersInput,
    {
      registered: { supplierId: string; name: string; isIsraeli: boolean; matchedTags: string[] }[];
      external: ExternalSupplierSuggestion[];
      externalStatus: ExternalSearchStatus;
    }
  >('searchSuppliers'),
  createInternalUser: call<CreateInternalUserInput, { email: string; tempPassword: string | null }>(
    'createInternalUser',
  ),
  deleteInternalUser: call<DeleteInternalUserInput, { ok: true }>('deleteInternalUser'),
};
