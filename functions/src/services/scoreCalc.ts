// scoreCalc — pure computation of the per-case success score (no I/O; unit tested).
// scoreService gathers the inputs from Firestore/Storage and stores the result.
import { diffWords } from 'diff';
import {
  DEFAULT_DCI_PARAMS,
  SCORE_COMPONENT_METRICS,
  SCORE_WEIGHTS,
  gradeOf,
  scaleMetric,
  type AuditDoc,
  type CaseScore,
  type DciParams,
  type DocChange,
  type DocVersion,
  type FeedbackDoc,
  type RawExtraKey,
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
  versions: DocVersion[]; // checkpoint snapshots (addenda after publication)
  docChange: DocChange | null; // edit-session analysis (DCI, net change D = edit size)
  feedback: FeedbackDoc[];
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

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Document Change Index over a document's editions (first → last, one text per edit session).
 * See DciParams in shared/src/score.ts for the formula.
 */
export function documentChange(
  texts: string[],
  params: DciParams = DEFAULT_DCI_PARAMS,
): Pick<DocChange, 'sessions' | 'netChange' | 'churn' | 'rework' | 'dci'> & { steps: number[] } {
  if (texts.length === 0) throw new Error('documentChange needs at least one edition');
  const steps = texts.slice(1).map((t, i) => changeRatio(texts[i], t));
  const N = steps.length;
  const D = N ? changeRatio(texts[0], texts[N]) : 0;
  const C = steps.reduce((a, b) => a + b, 0);
  const R = C > 0 ? Math.max(0, 1 - D / C) : 0;
  const iterations = N > params.targetSessions ? Math.sqrt(params.targetSessions / N) : 1;
  const dci = 100 * (1 - D) * (1 - params.reworkWeight * R) * iterations;
  return { sessions: N, netChange: round3(D), churn: round3(C), rework: round3(R), dci: Math.round(dci), steps };
}

export interface RevisionMeta {
  id: string;
  at: number;
  editor: string | null;
}

/**
 * Group Google Docs revisions into edit sessions: consecutive revisions by the same editor with
 * no gap above `gapMs` are one session, represented by its last revision.
 */
export function groupSessions(revs: RevisionMeta[], gapMs = 30 * 60_000): RevisionMeta[] {
  const sorted = [...revs].sort((a, b) => a.at - b.at);
  const sessions: RevisionMeta[] = [];
  for (const r of sorted) {
    const last = sessions[sessions.length - 1];
    if (last && last.editor === r.editor && r.at - last.at <= gapMs) sessions[sessions.length - 1] = r;
    else sessions.push(r);
  }
  return sessions;
}

/** Keep first, last and an even sample when there are more than `max` sessions. */
export function sampleSessions<T>(sessions: T[], max = 60): { kept: T[]; sampled: boolean } {
  if (sessions.length <= max) return { kept: sessions, sampled: false };
  const idx = new Set<number>([0, sessions.length - 1]);
  for (let k = 1; idx.size < max; k++) idx.add(Math.round((k * (sessions.length - 1)) / (max - 1)));
  return { kept: [...idx].sort((a, b) => a - b).map((i) => sessions[i]), sampled: true };
}

/** Raw metric values; a metric that can't be measured yet is absent. */
export function rawMetrics(i: ScoreInput): Partial<Record<ScoreMetricKey | RawExtraKey, number>> {
  const m: Partial<Record<ScoreMetricKey | RawExtraKey, number>> = {};
  const statusRows = i.audit
    .filter((a) => a.action === 'status_change')
    .sort((a, b) => a.at - b.at);
  const publishedAt = statusRows.find((a) => a.newState === 'published')?.at ?? null;
  const beforePublish = (at: number) => publishedAt === null || at <= publishedAt;
  const runs = [...i.supervision].sort((a, b) => a.at - b.at);

  // ---- efficiency ----
  if (i.docChange) {
    m.dci = i.docChange.dci;
    m.versions = i.docChange.sessions;
    m.churn = i.docChange.churn;
    m.rework = i.docChange.rework;
  }
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
  if (i.docChange) m.editSize = i.docChange.netChange;

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
  const ratings = i.feedback.flatMap((f) => Object.values(f.ratings).filter((v): v is number => typeof v === 'number'));
  if (ratings.length) m.participantRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
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
      .filter((mk) => raw[mk] !== undefined && i.targets[mk])
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
    docChange: i.docChange,
  };
}
