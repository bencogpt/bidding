// Draft-first cases and requirement research.
//
// A new case starts as an in-app DRAFT: its values live on the tender record and no document exists.
// The team runs the inspector (supervisor) on a preview rendered from the template and the draft
// values; only when the latest check covers exactly the current draft data and has no blocking
// finding may the tender manager create the document (generateDocument).
//
// Requirement research: when a request is opened, an agent searches the web — with generic queries
// only, never the organisation's details — for similar procurements and suggests features.
import { z } from 'zod';
import { BRIEF_MAX_LENGTH } from './schemas.js';
import { agentDetailsSchema } from './requestAgent.js';

// 'generating': claimed by one generateDocument call, so a double click can't create two documents.
export type DocumentStatus = 'none' | 'generating' | 'generated';

/** Whether the case has its document. Cases from before draft-first have one if a doc id/path exists. */
export function hasDocument(t: {
  documentStatus?: DocumentStatus;
  googleDocId: string | null;
  docExportPath: string | null;
}): boolean {
  if (t.documentStatus) return t.documentStatus === 'generated';
  return !!(t.googleDocId || t.docExportPath);
}

const valueSchema = z.union([z.string(), z.number()]);

/** Edit a draft's data in the app (manager; only while the case has no document). */
export const updateTenderDraftInput = z.object({
  tenderId: z.string(),
  title: z.string().trim().min(1).optional(),
  params: z.record(valueSchema).optional(), // the asked fields, like the create form
  submissionDeadline: z.number().nullable().optional(),
  awardDate: z.number().nullable().optional(),
  domainTags: z.array(z.string()).optional(),
  evaluationCriteria: z.array(z.object({ name: z.string(), weight: z.number() })).optional(),
});
export type UpdateTenderDraftInput = z.infer<typeof updateTenderDraftInput>;

export const generateDocumentInput = z.object({ tenderId: z.string() });
export type GenerateDocumentInput = z.infer<typeof generateDocumentInput>;

/** Why the document can't be created yet (or null when it can). */
export type DocumentGateReason = 'has_document' | 'not_draft' | 'no_check' | 'stale_check' | 'blocked';

// ---- requirement research (on bid requests) ----

export const rerunRequestResearchInput = z.object({ serial: z.string().regex(/^\d{4}-\d{1,3}$/) });
export type RerunRequestResearchInput = z.infer<typeof rerunRequestResearchInput>;

export type ResearchStatus = 'running' | 'done' | 'skipped' | 'no_safe_queries' | 'failed';

export interface ResearchSource {
  url: string;
  title: string;
}

export interface SuggestedFeature {
  feature: string; // Hebrew
  priority: 'must' | 'should' | 'nice';
  why: string; // Hebrew
  sourceUrls: string[]; // every suggestion cites a page the search actually returned
}

/** bidRequests/{serial}/research/{runId} — ideas for the requester, never requirements (G1). */
export interface RequestResearch {
  runId: string;
  serial: string;
  status: ResearchStatus;
  model: string | null;
  category: string; // generic product/service category
  queries: string[]; // the generic queries actually searched (audit)
  rejectedQueries: string[]; // queries the privacy guard refused
  summary: string;
  similarCases: { title: string; url: string; relevance: string }[];
  suggestedFeatures: SuggestedFeature[];
  typicalRequirements: string[];
  pitfalls: string[];
  questionsForRequester: string[];
  sources: ResearchSource[];
  dropped: number; // suggestions removed for citing no real source
  error?: string;
  createdAt: number;
}

export interface ResearchSummary {
  status: ResearchStatus;
  runId: string | null;
  at: number;
}


// ---- research before the request is sent (the requester's "סיכום ושליחה" step) ----

/** The request as typed so far (never the budget: agentDetailsSchema has none). */
export const researchDraftInput = z
  .object({ brief: z.string().min(3).max(BRIEF_MAX_LENGTH), details: agentDetailsSchema })
  .strict();
export type ResearchDraftInput = z.infer<typeof researchDraftInput>;

/** researchDrafts/{runId}: a run made before the request existed (serial ''); linked on send. */
export interface ResearchDraft extends RequestResearch {
  createdBy: string;
}

/** What the requester's screen shows. */
export type ResearchDraftResult = Pick<
  RequestResearch,
  'runId' | 'status' | 'summary' | 'suggestedFeatures' | 'pitfalls' | 'questionsForRequester' | 'sources'
>;

/** A draft run older than this is not linked to the request (the search runs again after sending). */
export const RESEARCH_DRAFT_MAX_AGE_MS = 24 * 3_600_000;
