// Pure aggregation helpers for the reports page. No React, no i18n — callers translate keys.
import type {
  TenderDoc,
  AccessDoc,
  SupplierDoc,
  TenderStatus,
  TenderType,
  CaseScore,
  ScoreMetricKey,
  RawExtraKey,
  FeedbackDoc,
  FeedbackIssue,
  RatingKey,
} from '@obms/shared';
import { RATING_KEYS } from '@obms/shared';
import { TENDER_STATUSES } from '@obms/shared';

// Case label for reports/CSVs: "BID-2026-0042 · title" (title only for un-numbered legacy cases).
export const caseLabel = (t: Pick<TenderDoc, 'serial' | 'title'>) => (t.serial ? `${t.serial} · ${t.title}` : t.title);

type AccessRow = AccessDoc & { tenderId: string };
type SubmissionRow = { tenderId: string; supplierId: string };

export function statusCounts(tenders: TenderDoc[]): Record<TenderStatus, number> {
  const out = Object.fromEntries(TENDER_STATUSES.map((s) => [s, 0])) as Record<
    TenderStatus,
    number
  >;
  for (const t of tenders) out[t.status]++;
  return out;
}

export function typeCounts(tenders: TenderDoc[]): Record<TenderType, number> {
  const out: Record<TenderType, number> = { goods: 0, service: 0, project: 0 };
  for (const t of tenders) out[t.type]++;
  return out;
}

export function responseFunnel(
  tenders: TenderDoc[],
  access: AccessRow[],
  submissions: SubmissionRow[],
): { tenderId: string; title: string; withAccess: number; submitted: number }[] {
  return tenders.map((t) => ({
    tenderId: t.id,
    title: caseLabel(t),
    withAccess: access.filter((a) => a.tenderId === t.id && a.kind === 'supplier').length,
    submitted: submissions.filter((s) => s.tenderId === t.id).length,
  }));
}

export function waitTimes(
  tenders: TenderDoc[],
  access: AccessRow[],
  nowMs: number,
): { principalId: string; name: string; tenderTitle: string; hours: number }[] {
  const titleOf = new Map(tenders.map((t) => [t.id, caseLabel(t)]));
  return access
    .filter((a) => a.kind === 'internal' && a.level !== 'edit')
    .map((a) => ({
      principalId: a.principalId,
      name: a.displayName,
      tenderTitle: titleOf.get(a.tenderId) ?? a.tenderId,
      hours: Math.max(0, Math.round((nowMs - a.grantedAt) / 3_600_000)),
    }));
}

export function supplierProfiles(
  access: AccessRow[],
  submissions: SubmissionRow[],
  suppliers: SupplierDoc[],
): { supplierId: string; name: string; shared: number; submitted: number }[] {
  return suppliers.map((s) => ({
    supplierId: s.id,
    name: s.name,
    shared: access.filter((a) => a.kind === 'supplier' && a.principalId === s.id).length,
    submitted: submissions.filter((sub) => sub.supplierId === s.id).length,
  }));
}

export function kpis(tenders: TenderDoc[], access: AccessRow[], suppliers: SupplierDoc[]) {
  const supplierAccess = access.filter((a) => a.kind === 'supplier');
  const published = tenders.filter((t) =>
    ['published', 'responses', 'evaluated', 'awarded'].includes(t.status),
  ).length;
  return {
    totalTenders: tenders.length,
    published,
    totalSuppliers: suppliers.length,
    avgSuppliersPerTender: tenders.length
      ? Math.round((supplierAccess.length / tenders.length) * 10) / 10
      : 0,
  };
}

// ---- AI benefit: AI-drafted vs manual (control group) ----
export const COHORT_METRICS: { key: 'total' | ScoreMetricKey | RawExtraKey; lowerIsBetter: boolean; pct?: boolean }[] = [
  { key: 'total', lowerIsBetter: false },
  { key: 'dci', lowerIsBetter: false },
  { key: 'versions', lowerIsBetter: true },
  { key: 'daysToPublish', lowerIsBetter: true },
  { key: 'blockRuns', lowerIsBetter: true },
  { key: 'questionsPerSupplier', lowerIsBetter: true },
  { key: 'editSize', lowerIsBetter: true, pct: true },
];
export const MIN_COHORT = 5;

export interface CohortRow {
  key: (typeof COHORT_METRICS)[number]['key'];
  lowerIsBetter: boolean;
  pct: boolean;
  ai: number | null;
  manual: number | null;
  aiN: number;
  manualN: number;
}

/** Average of each metric per cohort, over the cases where it was measured. */
export function cohortComparison(scores: CaseScore[]): CohortRow[] {
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  return COHORT_METRICS.map(({ key, lowerIsBetter, pct }) => {
    const values = (cohort: CaseScore['cohort']) =>
      scores
        .filter((s) => s.cohort === cohort)
        .map((s) => (key === 'total' ? s.total : s.raw?.[key]))
        .filter((v): v is number => typeof v === 'number');
    const ai = values('ai');
    const manual = values('manual');
    return { key, lowerIsBetter, pct: !!pct, ai: avg(ai), manual: avg(manual), aiN: ai.length, manualN: manual.length };
  });
}

// ---- participant feedback ----
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/** Average rating per key, overall and per role. */
export function feedbackByRole(feedback: FeedbackDoc[]): { role: string; n: number; ratings: Partial<Record<RatingKey, number>> }[] {
  const roles = [...new Set(feedback.map((f) => f.role))];
  return ['all', ...roles].map((role) => {
    const rows = role === 'all' ? feedback : feedback.filter((f) => f.role === role);
    const ratings: Partial<Record<RatingKey, number>> = {};
    for (const k of RATING_KEYS) {
      const v = mean(rows.map((f) => f.ratings[k]).filter((x): x is number => typeof x === 'number'));
      if (v !== null) ratings[k] = v;
    }
    return { role, n: rows.length, ratings };
  });
}

export function topIssues(feedback: FeedbackDoc[]): { issue: FeedbackIssue; count: number }[] {
  const counts = new Map<FeedbackIssue, number>();
  for (const f of feedback) for (const i of f.issues) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].map(([issue, count]) => ({ issue, count })).sort((a, b) => b.count - a.count);
}

/**
 * Does the Document Change Index agree with people? Pearson correlation between each case's DCI
 * and its participants' mean draftQuality/reviewEffort rating. Null below 3 paired cases.
 */
export function dciFeedbackCorrelation(scores: CaseScore[], feedback: FeedbackDoc[]): { r: number | null; n: number } {
  const pairs: [number, number][] = [];
  for (const s of scores) {
    const dci = s.raw?.dci;
    const ratings = feedback
      .filter((f) => f.tenderId === s.tenderId)
      .flatMap((f) => [f.ratings.draftQuality, f.ratings.reviewEffort])
      .filter((x): x is number => typeof x === 'number');
    if (typeof dci === 'number' && ratings.length) pairs.push([dci, ratings.reduce((a, b) => a + b, 0) / ratings.length]);
  }
  if (pairs.length < 3) return { r: null, n: pairs.length };
  const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length;
  const my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { r: null, n: pairs.length };
  return { r: Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100, n: pairs.length };
}
