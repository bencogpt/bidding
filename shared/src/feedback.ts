// Participant feedback — each internal participant rates a bid case at publication and at award.
// Stored for analytics and turned into skill-improvement tips for bid managers.
import { z } from 'zod';
import { tenderTypeSchema } from './schemas.js';
import type { SkillId } from './supervision.js';

export const FEEDBACK_ROUNDS = ['publish', 'award'] as const;
export type FeedbackRound = (typeof FEEDBACK_ROUNDS)[number];

// 1–5 ratings. reviewEffort: 5 = little effort was needed. aiAccuracy only for AI-drafted tenders;
// outcomeFit only at award.
export const RATING_KEYS = [
  'draftQuality',
  'clarity',
  'completeness',
  'reviewEffort',
  'aiAccuracy',
  'outcomeFit',
] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const ROUND_RATINGS: Record<FeedbackRound, RatingKey[]> = {
  publish: ['draftQuality', 'clarity', 'completeness', 'reviewEffort', 'aiAccuracy'],
  award: ['clarity', 'completeness', 'outcomeFit'],
};

export const FEEDBACK_ISSUES = [
  'missing_info',
  'invented_value',
  'legal_wording',
  'ambiguity',
  'wrong_template_section',
  'formatting',
  'too_many_rounds',
  'supervisor_false_alarm',
  'other',
] as const;
export type FeedbackIssue = (typeof FEEDBACK_ISSUES)[number];

// Skill areas a participant can point at, mapped to the skill that owns them.
export const SKILL_AREAS: Record<string, SkillId> = {
  spec: 's01-requester-spec',
  sla: 's02-procurement-sla',
  thresholds: 's03-procurement-strategy-thresholds',
  style: 's04-procurement-merge-and-style',
  legal: 's11-legal-compliance',
  pricing: 's12-finance-pricing-table',
  payment: 's13-finance-milestones-payment',
  guarantees: 's15-finance-guarantees',
  security: 's17-security-requirements',
  risk: 's08-risk-analysis',
};
export type SkillArea = keyof typeof SKILL_AREAS;

const rating = z.number().int().min(1).max(5);

export const submitFeedbackInput = z.object({
  tenderId: z.string(),
  round: z.enum(FEEDBACK_ROUNDS),
  ratings: z.object(Object.fromEntries(RATING_KEYS.map((k) => [k, rating.optional()])) as Record<
    RatingKey,
    z.ZodOptional<typeof rating>
  >),
  issues: z.array(z.enum(FEEDBACK_ISSUES)).default([]),
  skillAreas: z.array(z.string()).default([]),
  comment: z.string().max(4000).default(''),
});
export type SubmitFeedbackInput = z.input<typeof submitFeedbackInput>;

export const declineFeedbackInput = z.object({
  tenderId: z.string(),
  round: z.enum(FEEDBACK_ROUNDS),
});
export type DeclineFeedbackInput = z.infer<typeof declineFeedbackInput>;

export const generateSkillTipsInput = z.object({ type: tenderTypeSchema });
export type GenerateSkillTipsInput = z.infer<typeof generateSkillTipsInput>;

/** feedbackRequests/{tenderId}_{round}_{uid} */
export interface FeedbackRequest {
  id: string;
  tenderId: string;
  tenderTitle: string;
  tenderType: string;
  aiDrafted: boolean;
  round: FeedbackRound;
  uid: string;
  role: string;
  status: 'pending' | 'done' | 'declined';
  createdAt: number;
  answeredAt: number | null;
}

/** tenders/{id}/feedback/{round}_{uid} */
export interface FeedbackDoc {
  id: string;
  tenderId: string;
  tenderType: string;
  round: FeedbackRound;
  uid: string;
  name: string;
  role: string;
  ratings: Partial<Record<RatingKey, number>>;
  issues: FeedbackIssue[];
  skillAreas: string[];
  comment: string;
  submittedAt: number;
}

export interface FeedbackAggregate {
  responses: number;
  ratingAvg: Partial<Record<RatingKey, number>>;
  ratingAvgByRole: Record<string, Partial<Record<RatingKey, number>>>;
  issueCounts: Partial<Record<FeedbackIssue, number>>;
  skillAreaCounts: Record<string, number>;
}

export interface SkillTip {
  target: SkillId | 'skillMd';
  problemHe: string;
  suggestionHe: string;
  proposedSkillMdText: string | null; // only for target 'skillMd'
  evidence: { feedbackIds: string[]; counts: string };
}

/** skillTips/{type}/runs/{runId} */
export interface SkillTipsRun {
  runId: string;
  type: string;
  model: string;
  windowDays: number;
  aggregate: FeedbackAggregate;
  topFindings: { code: string; count: number }[];
  tips: SkillTip[];
  createdBy: string;
  createdAt: number;
}
