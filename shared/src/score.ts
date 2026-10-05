// Per-case success score — how efficient, correct and beneficial the system was for one bid.
//
// Four components (0–100 each), combined with weights. A component that can't be measured yet
// (e.g. outcome before publication, AI benefit for a manual tender) is left out and the remaining
// weights are rescaled. Each metric maps linearly onto 0–100 between a "good" target and a "bad"
// limit. Targets are editable (settings/scoring); these are the defaults.
//
// Why these signals (not just a raw version count): many versions can mean a poor draft or healthy
// collaboration, and Google's revision list is incomplete for busy Docs. Edit size of the AI draft
// ("post-edit distance") and post-publication clarification questions / addenda are the
// established measures of drafting benefit and document quality.

export type ScoreComponentKey = 'efficiency' | 'correctness' | 'aiBenefit' | 'outcome';

export type ScoreMetricKey =
  | 'versions' // content versions before publication
  | 'daysToPublish'
  | 'backSteps' // review loop-backs: internal_review→draft, ready→internal_review
  | 'firstCheck' // supervisor verdict at the first check after creation (PASS=0, WARN=1, BLOCK=2)
  | 'blockRuns' // BLOCK supervision runs before publication
  | 'blockersAtPublish'
  | 'overrides' // manager overrides of a BLOCK verdict
  | 'acceptance' // share of AI-drafted fields kept unchanged (0–1)
  | 'editSize' // word-level change ratio from v1 (generated) to the published version (0–1)
  | 'questionsPerSupplier'
  | 'addenda' // document changes after publication
  | 'responseRate'; // submissions ÷ invited suppliers (0–1)

export interface MetricTarget {
  good: number;
  bad: number;
}

export type ScoreTargets = Record<ScoreMetricKey, MetricTarget>;

export const DEFAULT_SCORE_TARGETS: ScoreTargets = {
  versions: { good: 3, bad: 10 },
  daysToPublish: { good: 14, bad: 45 },
  backSteps: { good: 0, bad: 3 },
  firstCheck: { good: 0, bad: 2 },
  blockRuns: { good: 0, bad: 4 },
  blockersAtPublish: { good: 0, bad: 3 },
  overrides: { good: 0, bad: 1 },
  acceptance: { good: 0.8, bad: 0.3 },
  editSize: { good: 0.15, bad: 0.6 },
  questionsPerSupplier: { good: 0.5, bad: 3 },
  addenda: { good: 0, bad: 3 },
  responseRate: { good: 0.6, bad: 0.1 },
};

export const SCORE_WEIGHTS: Record<ScoreComponentKey, number> = {
  efficiency: 0.25,
  correctness: 0.3,
  aiBenefit: 0.2,
  outcome: 0.25,
};

export const SCORE_COMPONENT_METRICS: Record<ScoreComponentKey, ScoreMetricKey[]> = {
  efficiency: ['versions', 'daysToPublish', 'backSteps'],
  correctness: ['firstCheck', 'blockRuns', 'blockersAtPublish', 'overrides'],
  aiBenefit: ['acceptance', 'editSize'],
  outcome: ['questionsPerSupplier', 'addenda', 'responseRate'],
};

export interface ScoredMetric {
  key: ScoreMetricKey;
  value: number;
  target: MetricTarget;
  score: number; // 0–100
}

export interface ScoreComponent {
  key: ScoreComponentKey;
  score: number; // 0–100, mean of its measured metrics
  weight: number; // effective weight after rescaling (sums to 1 across components)
  metrics: ScoredMetric[];
}

export type ScoreGrade = 'A' | 'B' | 'C' | 'D';
export type ScoreCohort = 'ai' | 'manual';

/** Stored at caseScores/{tenderId} (internal read only). */
export interface CaseScore {
  tenderId: string;
  title: string;
  type: string;
  status: string;
  cohort: ScoreCohort;
  total: number; // 0–100
  grade: ScoreGrade;
  components: ScoreComponent[];
  // Raw activity shown for context, not scored (Drive's list is incomplete for busy Docs).
  driveRevisions: number | null;
  computedAt: number;
  // Raw metric values for reporting (incl. editSize for manual tenders, used by the cohort view).
  raw: Partial<Record<ScoreMetricKey, number>>;
}

/** One stored content version of the bid document (tenders/{id}/internal/versions). */
export interface DocVersion {
  n: number;
  hash: string;
  stage: string; // supervision stage that observed it
  status: string; // tender status at the time
  at: number;
  path: string; // Storage path of the text snapshot
  changeRatio: number | null; // word-level change vs the previous version (0–1)
}

export function gradeOf(total: number): ScoreGrade {
  if (total >= 85) return 'A';
  if (total >= 70) return 'B';
  if (total >= 50) return 'C';
  return 'D';
}

/** Linear 0–100 between target (good=100) and limit (bad=0); works for either direction. */
export function scaleMetric(value: number, t: MetricTarget): number {
  if (t.good === t.bad) return value === t.good ? 100 : 0;
  const pos = (value - t.bad) / (t.good - t.bad);
  return Math.round(Math.min(1, Math.max(0, pos)) * 100);
}
