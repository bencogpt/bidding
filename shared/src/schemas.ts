import { z } from 'zod';
import { TENDER_STATUSES } from './tender.js';
import { SYSTEM_FORMULAS } from './templates.js';
import type { SupervisionSummary, ValueSource, BidDraftRecord } from './supervision.js';
import { createTenderTeamFields, type CaseTeam, type TeamRole } from './team.js';

// Inline string-literal tuples so z.enum infers a literal union (passing values from a
// const object widens to a non-tuple and fails tsc).
export const roleSchema = z.enum([
  'tender_manager',
  'requester',
  'legal',
  'security',
  'finance',
  'supplier',
]);

export const tenderTypeSchema = z.enum(['goods', 'service', 'project']);

export const tenderStatusSchema = z.enum(TENDER_STATUSES);
export const accessLevelSchema = z.enum(['view', 'comment', 'edit']);

// ---- Firestore documents ----

export const userDocSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: roleSchema,
  googleEmail: z.string().email().optional(),
  phone: z.string().optional(), // the requester's contact number on the tender document
  supplierId: z.string().optional(), // present for supplier accounts
  createdAt: z.number(), // epoch ms
});
export type UserDoc = z.infer<typeof userDocSchema>;

export const supplierDocSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  // Optional: a supplier may be added to the registry from AI sourcing before a contact address
  // is known. Required only when creating their login (see createSupplierAccount).
  contactEmail: z.string().email().optional(),
  country: z.string().default('IL'),
  isIsraeli: z.boolean().default(true),
  status: z.enum(['active', 'inactive']).default('active'),
  domainTags: z.array(z.string()).optional(), // free-text domains the supplier can serve
  createdAt: z.number(),
});
export type SupplierDoc = z.infer<typeof supplierDocSchema>;

export const templateDocSchema = z.object({
  type: tenderTypeSchema,
  title: z.string(),
  googleTemplateDocId: z.string().nullable(), // bound Google Doc id (used when USE_GOOGLE_DOCS)
  sourceUrl: z.string().nullable().optional(), // original Google Doc link the manager pasted
  bodyTemplate: z.string(), // text template with {{param}} placeholders (used by dev docs service)
  // param schema is described declaratively so the UI can render a dynamic form
  params: z.array(
    z.object({
      key: z.string(),
      labelHe: z.string(),
      type: z.enum(['text', 'number', 'date', 'textarea']),
      required: z.boolean().default(true),
      internal: z.boolean().optional(),
      order: z.number().optional(),
      hidden: z.boolean().optional(),
      defaultFrom: z.enum(['guarantee_pct']).optional(),
      fill: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('fixed'), value: z.string() }),
          z.object({ kind: z.literal('copy'), from: z.string() }),
          z.object({ kind: z.literal('formula'), formula: z.enum(SYSTEM_FORMULAS) }),
        ])
        .optional(),
    }),
  ),
  // reference "good example" bid documents for this type (manager-curated links)
  examples: z
    .array(z.object({ title: z.string().min(1), url: z.string().min(1) }))
    .optional(),
  // per-type "bid manager skill" guidance, authored in Markdown
  skillMd: z.string().optional(),
  // Conversion of Word-based documents into real templates (templateConverter).
  fieldsStatus: z.enum(['ready', 'needs_conversion']).optional(),
  unresolvedSpots: z.number().optional(),
  supplierFillQuotes: z.array(z.string()).optional(), // spots the supplier fills — left as-is
  backupDocIds: z.array(z.string()).optional(),
});
export type TemplateDoc = z.infer<typeof templateDocSchema>;

export const comparisonReportSchema = z.object({
  generatedAt: z.number(),
  model: z.string(),
  isStub: z.boolean(),
  note: z.string(),
  preferredSupplierId: z.string().nullable(),
  ranking: z.array(
    z.object({
      supplierId: z.string(),
      score: z.number(),
      strengthsHe: z.array(z.string()),
      weaknessesHe: z.array(z.string()),
      rationaleHe: z.string(),
    }),
  ),
});
export type ComparisonReport = z.infer<typeof comparisonReportSchema>;

export const tenderDocSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  type: tenderTypeSchema,
  params: z.record(z.union([z.string(), z.number()])),
  status: tenderStatusSchema,
  googleDocId: z.string().nullable(),
  docExportPath: z.string().nullable(), // Storage path of exported PDF (dev/in-system view)
  ownerUid: z.string(),
  submissionDeadline: z.number().nullable(), // epoch ms
  awardDate: z.number().nullable(),
  awardedSupplierId: z.string().nullable(),
  comparisonReport: comparisonReportSchema.nullable().optional(),
  domainTags: z.array(z.string()).optional(), // for supplier matching
  evaluationCriteria: z
    .array(z.object({ name: z.string(), weight: z.number() }))
    .optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type TenderDoc = z.infer<typeof tenderDocSchema> & {
  lastSupervision?: SupervisionSummary;
  publishedDocHash?: string | null;
  serial?: string; // BID-2026-0042
  team?: CaseTeam; // role → uid (one user per required role)
  requiredRoles?: TeamRole[];
  memberUids?: string[]; // owner + team: the only internal users (besides managers) who see the case
};

export const accessDocSchema = z.object({
  principalId: z.string(), // supplierId or internal uid
  kind: z.enum(['supplier', 'internal']),
  level: accessLevelSchema,
  displayName: z.string(),
  grantedBy: z.string(),
  grantedAt: z.number(),
});
export type AccessDoc = z.infer<typeof accessDocSchema>;

// ANONYMOUS by construction. The asker's identity deliberately lives in a sibling collection
// (questionAuthorDocSchema) and must never be added here: every authorized supplier can read
// these documents, and Firestore rules cannot hide individual fields from a read. Knowing who
// asked would tell a bidder who else is bidding, which is exactly what enables collusion.
export const questionDocSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  clusterId: z.string().nullable(),
  answered: z.boolean().default(false),
  createdAt: z.number(),
});
export type QuestionDoc = z.infer<typeof questionDocSchema>;

// Identity of a question's asker. Readable by internal users, and by a supplier only for their
// own questions (so the UI can mark "השאלה שלך"). Never readable by a competing supplier.
export const questionAuthorDocSchema = z.object({
  questionId: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  createdAt: z.number(),
});
export type QuestionAuthorDoc = z.infer<typeof questionAuthorDocSchema>;

export const answerDocSchema = z.object({
  id: z.string(),
  clusterId: z.string(),
  questionIds: z.array(z.string()),
  text: z.string().min(1),
  answeredBy: z.string(),
  createdAt: z.number(),
});
export type AnswerDoc = z.infer<typeof answerDocSchema>;

export const submissionFileSchema = z.object({
  name: z.string(),
  size: z.number(),
  path: z.string(), // Storage path under tenders/{id}/submissions/{supplierId}/
});

export const submissionDocSchema = z.object({
  supplierId: z.string(),
  supplierName: z.string(),
  files: z.array(submissionFileSchema),
  summary: z.string(), // proposal summary text — the basis for AI comparison
  status: z.enum(['editable', 'locked']),
  submittedAt: z.number(),
});
export type SubmissionDoc = z.infer<typeof submissionDocSchema>;

export const auditDocSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  actorUid: z.string(),
  actorName: z.string(),
  action: z.string(),
  prevState: z.string().nullable(),
  newState: z.string().nullable(),
  detail: z.string().optional(),
  tenderId: z.string().nullable().optional(), // related bid, when the action concerns a tender
  at: z.number(),
});
export type AuditDoc = z.infer<typeof auditDocSchema>;

// ---- Callable function payloads ----

export const createTenderInput = z.object({
  title: z.string().optional(), // blank: the system names the case from its type and serial
  brief: z.string().optional(), // the requester's summary (also the AI draft's input)
  type: tenderTypeSchema,
  params: z.record(z.union([z.string(), z.number()])),
  submissionDeadline: z.number().nullable().optional(),
  awardDate: z.number().nullable().optional(),
  domainTags: z.array(z.string()).optional(),
  evaluationCriteria: z.array(z.object({ name: z.string(), weight: z.number() })).optional(),
  // AI draft this tender was built from (provenance for the supervisor). Omitted when typed by hand.
  draftId: z.string().optional(),
  // One id per form submission: a retried submission returns the case already created, never a copy.
  requestId: z.string().min(8).max(100).optional(),
  ...createTenderTeamFields,
});
export type CreateTenderInput = z.infer<typeof createTenderInput>;

export const draftBidInput = z.object({
  type: tenderTypeSchema,
  brief: z.string().min(3),
});
export type DraftBidInput = z.infer<typeof draftBidInput>;

export const searchSuppliersInput = z.object({
  type: tenderTypeSchema,
  domainTags: z.array(z.string()).default([]),
});
export type SearchSuppliersInput = z.infer<typeof searchSuppliersInput>;

export const grantAccessInput = z.object({
  tenderId: z.string(),
  // suppliers to share with (view) + internal reviewers to assign (comment)
  supplierIds: z.array(z.string()).default([]),
  internalUids: z.array(z.string()).default([]),
});
export type GrantAccessInput = z.infer<typeof grantAccessInput>;

export const askQuestionInput = z.object({
  tenderId: z.string(),
  text: z.string().min(3),
});
export type AskQuestionInput = z.infer<typeof askQuestionInput>;

export const answerQuestionsInput = z.object({
  tenderId: z.string(),
  clusterId: z.string(),
  questionIds: z.array(z.string()).min(1),
  text: z.string().min(1),
});
export type AnswerQuestionsInput = z.infer<typeof answerQuestionsInput>;

export const setUserRoleInput = z.object({
  uid: z.string(),
  role: roleSchema,
  supplierId: z.string().optional(),
});
export type SetUserRoleInput = z.infer<typeof setUserRoleInput>;

export const transitionTenderInput = z.object({
  tenderId: z.string(),
  to: tenderStatusSchema,
  // Manager override of a BLOCK supervisor verdict at publish. Audited.
  overrideReason: z.string().trim().min(10).optional(),
});
export type TransitionTenderInput = z.infer<typeof transitionTenderInput>;

export const upsertSupplierInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  // '' (untouched field) is normalised to undefined rather than rejected.
  contactEmail: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  country: z.string().min(1),
  isIsraeli: z.boolean(),
  status: z.enum(['active', 'inactive']),
  domainTags: z.array(z.string()).optional(),
});
export type UpsertSupplierInput = z.infer<typeof upsertSupplierInput>;

// Shape returned by the brief→draft agent (non-binding suggestions for the create form).
export interface BidDraft {
  title: string;
  params: Record<string, string | number>;
  domainTags: string[];
  submissionDeadlineDays: number | null;
  awardDays: number | null;
  evaluationCriteria: { name: string; weight: number }[];
  // Supervisor provenance: saved draft id, per-param sources (G11), values the brief didn't give.
  draftId: string | null;
  status: BidDraftRecord['status'];
  sources: Record<string, ValueSource>;
  missing: string[];
  model: string | null;
}

export interface ExternalSupplierSuggestion {
  name: string;
  domain: string;
  isIsraeli: boolean;
  rationaleHe: string;
  website?: string;
  // Discovered by the sourcing agent via web search. Unverified — the manager confirms before use.
  contactEmail?: string;
  country?: string;
  sourceUrl?: string;
}

export const createSupplierAccountInput = z.object({
  supplierId: z.string(),
});
export type CreateSupplierAccountInput = z.infer<typeof createSupplierAccountInput>;

// Internal (non-supplier) roles only.
export const internalRoleSchema = z.enum([
  'tender_manager',
  'requester',
  'legal',
  'security',
  'finance',
]);
export const createInternalUserInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: internalRoleSchema,
  // Real Google account used for Google Docs permissions. Without it the user gets no Doc access
  // (the @obms.test login is not a Google identity and Google silently rejects it).
  googleEmail: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type CreateInternalUserInput = z.infer<typeof createInternalUserInput>;

export const deleteInternalUserInput = z.object({ uid: z.string() });
export type DeleteInternalUserInput = z.infer<typeof deleteInternalUserInput>;

export const bindTemplateInput = z.object({
  type: tenderTypeSchema,
  urlOrId: z.string().min(1),
  title: z.string().optional(),
});
export type BindTemplateInput = z.infer<typeof bindTemplateInput>;

export const saveSubmissionInput = z.object({
  tenderId: z.string(),
  files: z.array(submissionFileSchema),
  summary: z.string(),
});
export type SaveSubmissionInput = z.infer<typeof saveSubmissionInput>;

export const runComparisonInput = z.object({ tenderId: z.string() });

export const refreshTenderDocumentInput = z.object({
  tenderId: z.string(),
  overrideReason: z.string().trim().min(10).optional(),
});
export type RefreshTenderDocumentInput = z.infer<typeof refreshTenderDocumentInput>;

export const runSupervisionInput = z.object({
  tenderId: z.string(),
  // The first check right after creation (started by the case page); skipped if one already ran.
  initial: z.boolean().optional(),
});

export const recomputeCaseScoreInput = z.object({ tenderId: z.string() });
export type RecomputeCaseScoreInput = z.infer<typeof recomputeCaseScoreInput>;

const metricTargetSchema = z
  .object({ good: z.number().finite(), bad: z.number().finite() })
  .refine((t) => t.good !== t.bad, 'יעד ותקרה חייבים להיות שונים');
export const updateScoringTargetsInput = z.object({
  targets: z.object({
    dci: metricTargetSchema,
    daysToPublish: metricTargetSchema,
    backSteps: metricTargetSchema,
    firstCheck: metricTargetSchema,
    blockRuns: metricTargetSchema,
    blockersAtPublish: metricTargetSchema,
    overrides: metricTargetSchema,
    acceptance: metricTargetSchema,
    editSize: metricTargetSchema,
    questionsPerSupplier: metricTargetSchema,
    addenda: metricTargetSchema,
    responseRate: metricTargetSchema,
    participantRating: metricTargetSchema,
  }),
  dci: z
    .object({
      targetSessions: z.number().positive(),
      reworkWeight: z.number().min(0).max(1),
    })
    .optional(),
});
export type UpdateScoringTargetsInput = z.infer<typeof updateScoringTargetsInput>;
export type RunSupervisionInput = z.infer<typeof runSupervisionInput>;
export type RunComparisonInput = z.infer<typeof runComparisonInput>;

export const awardTenderInput = z.object({
  tenderId: z.string(),
  supplierId: z.string(),
});
export type AwardTenderInput = z.infer<typeof awardTenderInput>;

export const createTemplateDocInput = z.object({
  type: tenderTypeSchema,
  title: z.string().optional(),
});
export type CreateTemplateDocInput = z.infer<typeof createTemplateDocInput>;

export const syncTemplateFieldsInput = z.object({ type: tenderTypeSchema });
export type SyncTemplateFieldsInput = z.infer<typeof syncTemplateFieldsInput>;

export const updateTemplateMetaInput = z.object({
  type: tenderTypeSchema,
  examples: z.array(z.object({ title: z.string().min(1), url: z.string().min(1) })).optional(),
  skillMd: z.string().optional(),
});
export type UpdateTemplateMetaInput = z.infer<typeof updateTemplateMetaInput>;

// Internal-only template fields (never placeholders in the document): replaces the full set.
export const setTemplateInternalFieldsInput = z.object({
  type: tenderTypeSchema,
  fields: z.array(
    z.object({
      key: z.string().trim().regex(/^[\p{L}\p{N}_]+$/u, 'מפתח: אותיות, ספרות וקו תחתון בלבד'),
      labelHe: z.string().trim().min(1),
      type: z.enum(['text', 'number']),
    }),
  ),
});
export type SetTemplateInternalFieldsInput = z.infer<typeof setTemplateInternalFieldsInput>;
