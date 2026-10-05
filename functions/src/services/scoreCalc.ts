// scoreCalc — pure computation of the per-case success score (no I/O; unit tested).
// scoreService gathers the inputs from Firestore/Storage and stores the result.
import { diffWords } from 'diff';
import {
  SCORE_COMPONENT_METRICS,
  SCORE_WEIGHTS,
  gradeOf,
  scaleMetric,
  type AuditDoc,
  type CaseScore,
  type DocVersion,
  type ScoreComponent,
  type ScoreComponentKey,
  type ScoreMetricKey,
  type ScoreTargets,
  type SupervisionReport,
  type TenderDoc,
  type TenderProvenance,
} from '@obms/shared';

const DAY = 86_400_000;
const VERDICT_CODE = { PASS: 0, WARN: 1, BLOCK: 2 } as const;
const AFTER_DEADLINE_STATUSES = ['responses', 'evaluated', 'awarded'];

export interface ScoreInput {
  tender: TenderDoc;
  provenance: TenderProvenance | null;
  audit: AuditDoc[]; // this tender's audit rows (any order)
  supervision: SupervisionReport[]; // this tender's runs (any order)
  versions: DocVersion[];
  editSize: number | null; // v1 → published (or latest) word change ratio
  invitedSuppliers: number;
  submissions: number;
  questions: number;
  driveRevisions: number | null;
  targets: ScoreTargets;
  now: number;
}

/**
 * Word-level change ratio between two texts (0 = identical, 1 = fully rewritten): changed words
 * ÷ words in the larger text. Bounded so a huge rewrite of an 80-page doc can't hang the function
 * — past the bound it is treated as fully changed.
 */
export function changeRatio(a: string, b: string): number {
  if (a === b) return 0;
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const total = Math.max(words(a), words(b));
  if (total === 0) return 0;
  const parts = diffWords(a, b, { maxEditLength: 20_000 });
  if (!parts) return 1;
  const changed = parts
    .filter((p) => p.added || p.removed)
    .reduce((n, p) => n + words(p.value), 0);
  // An edit shows up as removed + added; count it once.
  return Math.min(1, changed / 2 / total);
}

/** Raw metric values; a metric that can't be measured yet is absent. */
export function rawMetrics(i: ScoreInput): Partial<Record<ScoreMetricKey, number>> {
  const m: Partial<Record<ScoreMetricKey, number>> = {};
  const statusRows = i.audit
    .filter((a) => a.action === 'status_change')
    .sort((a, b) => a.at - b.at);
  const publishedAt = statusRows.find((a) => a.newState === 'published')?.at ?? null;
  const beforePublish = (at: number) => publishedAt === null || at <= publishedAt;
  const runs = [...i.supervision].sort((a, b) => a.at - b.at);

  // ---- efficiency ----
  if (i.versions.length) m.versions = i.versions.filter((v) => beforePublish(v.at)).length;
  if (publishedAt !== null) m.daysToPublish = (publishedAt - i.tender.createdAt) / DAY;
  m.backSteps = statusRows.filter(
    (a) =>
      (a.prevState === 'internal_review' && a.newState === 'draft') ||
      (a.prevState === 'ready' && a.newState === 'internal_review'),
  ).length;

  // ---- correctness ----
  if (runs.length) {
    m.firstCheck = VERDICT_CODE[runs[0].verdict];
    m.blockRuns = runs.filter((r) => r.verdict === 'BLOCK' && beforePublish(r.at)).length;
    m.overrides = i.audit.filter((a) => a.action === 'supervisor_override').length;
    if (publishedAt !== null) {
      const gate = runs.filter((r) => r.stage === 'prepublish' && r.at <= publishedAt).pop();
      if (gate) m.blockersAtPublish = gate.findings.filter((f) => f.severity === 'block').length;
    }
  }

  // ---- AI benefit / edit size (edit size is reported for both cohorts) ----
  const p = i.provenance;
  if (p?.draftId && p.aiStatus !== 'FAILED') {
    const keys = Object.keys(i.tender.params);
    if (keys.length) m.acceptance = 1 - keys.filter((k) => p.editedByManager.includes(k)).length / keys.length;
  }
  if (i.editSize !== null) m.editSize = i.editSize;

  // ---- outcome (after publication) ----
  if (publishedAt !== null) {
    m.addenda = i.versions.filter((v) => v.at > publishedAt).length;
    if (i.invitedSuppliers > 0) {
      m.questionsPerSupplier = i.questions / i.invitedSuppliers;
      const deadlinePassed =
        (i.tender.submissionDeadline !== null && i.now > i.tender.submissionDeadline) ||
        AFTER_DEADLINE_STATUSES.includes(i.tender.status);
      if (deadlinePassed) m.responseRate = Math.min(1, i.submissions / i.invitedSuppliers);
    }
  }
  return m;
}

export function computeScore(i: ScoreInput): CaseScore {
  const raw = rawMetrics(i);
  const cohort = i.provenance?.draftId ? 'ai' : 'manual';
  const components: ScoreComponent[] = [];
  for (const key of Object.keys(SCORE_COMPONENT_METRICS) as ScoreComponentKey[]) {
    // AI benefit only applies to AI-drafted tenders (manual tenders are the control group).
    if (key === 'aiBenefit' && cohort === 'manual') continue;
    const metrics = SCORE_COMPONENT_METRICS[key]
      .filter((mk) => raw[mk] !== undefined)
      .map((mk) => ({
        key: mk,
        value: Math.round(raw[mk]! * 1000) / 1000,
        target: i.targets[mk],
        score: scaleMetric(raw[mk]!, i.targets[mk]),
      }));
    if (!metrics.length) continue;
    const score = Math.round(metrics.reduce((s, x) => s + x.score, 0) / metrics.length);
    components.push({ key, score, weight: SCORE_WEIGHTS[key], metrics });
  }
  const weightSum = components.reduce((s, c) => s + c.weight, 0) || 1;
  for (const c of components) c.weight = Math.round((c.weight / weightSum) * 1000) / 1000;
  const total = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0));
  return {
    tenderId: i.tender.id,
    title: i.tender.title,
    type: i.tender.type,
    status: i.tender.status,
    cohort,
    total,
    grade: gradeOf(total),
    components,
    driveRevisions: i.driveRevisions,
    computedAt: i.now,
    raw,
  };
}
