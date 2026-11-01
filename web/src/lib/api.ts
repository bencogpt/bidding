import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type {
  CreateTenderInput,
  GrantAccessInput,
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
  AnalyzeTemplateFieldsInput,
  ApplyTemplateConversionInput,
  ConversionRun,
  ConversionReport,
  SetRequiredRolesInput,
  TeamRole,
  SupervisionReport,
  SupervisionVerdict,
} from '@obms/shared';

// The Firebase client gives up after 70 s by default and reports an error — while the server keeps
// going (creating a case runs the supervisor + Claude and takes ~1.5 min). Wait as long as the
// longest server timeout (540 s); each function still enforces its own limit.
const CALL_TIMEOUT_MS = 540_000;

const call = <I, O>(name: string) => {
  const fn = httpsCallable<I, O>(functions, name, { timeout: CALL_TIMEOUT_MS });
  return async (data: I): Promise<O> => (await fn(data)).data;
};

export const api = {
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
  setRequiredRoles: call<SetRequiredRolesInput, { requiredRoles: TeamRole[] }>('setRequiredRoles'),
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
  getTenderDocument: call<
    { tenderId: string },
    | { kind: 'html'; content: string; title: string }
    | { kind: 'pdf'; dataBase64: string; title: string }
  >('getTenderDocument'),
  askQuestion: call<AskQuestionInput, { id: string }>('askQuestion'),
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
    }
  >('searchSuppliers'),
  createInternalUser: call<CreateInternalUserInput, { email: string; tempPassword: string | null }>(
    'createInternalUser',
  ),
  deleteInternalUser: call<DeleteInternalUserInput, { ok: true }>('deleteInternalUser'),
};
