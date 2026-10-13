// feedbackCalc — pure aggregation of participant feedback + grounding of AI skill tips.
import {
  RATING_KEYS,
  type FeedbackAggregate,
  type FeedbackDoc,
  type RatingKey,
  type SkillTip,
  type SupervisionReport,
} from '@obms/shared';

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : undefined);

function ratingAverages(feedback: FeedbackDoc[]): Partial<Record<RatingKey, number>> {
  const out: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    const v = avg(feedback.map((f) => f.ratings[k]).filter((x): x is number => typeof x === 'number'));
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function aggregateFeedback(feedback: FeedbackDoc[]): FeedbackAggregate {
  const byRole: Record<string, FeedbackDoc[]> = {};
  const issueCounts: FeedbackAggregate['issueCounts'] = {};
  const skillAreaCounts: Record<string, number> = {};
  for (const f of feedback) {
    (byRole[f.role] ??= []).push(f);
    for (const i of f.issues) issueCounts[i] = (issueCounts[i] ?? 0) + 1;
    for (const a of f.skillAreas) skillAreaCounts[a] = (skillAreaCounts[a] ?? 0) + 1;
  }
  return {
    responses: feedback.length,
    ratingAvg: ratingAverages(feedback),
    ratingAvgByRole: Object.fromEntries(Object.entries(byRole).map(([r, fs]) => [r, ratingAverages(fs)])),
    issueCounts,
    skillAreaCounts,
  };
}

/** Most frequent blocking/warning supervisor finding codes. */
export function topFindingCodes(runs: SupervisionReport[], limit = 8): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of runs) {
    for (const f of r.findings) {
      if (f.severity === 'info') continue;
      counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Keep only tips grounded in real feedback: every cited feedback id must exist, and at least one
 * must be cited. A tip may target only the editable skill guidance or a known skill.
 */
export function groundTips(tips: SkillTip[], knownFeedbackIds: Set<string>, knownSkills: Set<string>): SkillTip[] {
  return tips
    .map((t) => ({
      ...t,
      evidence: {
        ...t.evidence,
        feedbackIds: (t.evidence?.feedbackIds ?? []).filter((id) => knownFeedbackIds.has(id)),
      },
      proposedSkillMdText: t.target === 'skillMd' ? t.proposedSkillMdText?.trim() || null : null,
    }))
    .filter(
      (t) =>
        t.evidence.feedbackIds.length > 0 &&
        (t.target === 'skillMd' || knownSkills.has(t.target)) &&
        t.problemHe?.trim() &&
        t.suggestionHe?.trim(),
    );
}
