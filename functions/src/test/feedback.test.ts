// Unit tests for feedback aggregation and skill-tip grounding (no network, no emulator):
//   node --test functions/lib/test/feedback.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FeedbackDoc, SkillTip, SupervisionReport } from '@obms/shared';
import { aggregateFeedback, groundTips, topFindingCodes } from '../services/feedbackCalc.js';

const fb = (id: string, role: string, ratings: FeedbackDoc['ratings'], issues: FeedbackDoc['issues'] = [], skillAreas: string[] = []): FeedbackDoc => ({
  id, tenderId: 't1', tenderType: 'goods', round: 'publish', uid: id, name: id, role,
  ratings, issues, skillAreas, comment: '', submittedAt: 0,
});

test('aggregateFeedback averages ratings overall and per role, and counts issues/areas', () => {
  const a = aggregateFeedback([
    fb('a', 'legal', { clarity: 2, draftQuality: 3 }, ['legal_wording', 'ambiguity'], ['legal']),
    fb('b', 'legal', { clarity: 4 }, ['legal_wording'], ['legal']),
    fb('c', 'finance', { clarity: 5 }, [], ['pricing']),
  ]);
  assert.equal(a.responses, 3);
  assert.equal(a.ratingAvg.clarity, 3.67);
  assert.equal(a.ratingAvg.draftQuality, 3);
  assert.equal(a.ratingAvgByRole.legal.clarity, 3);
  assert.equal(a.ratingAvgByRole.finance.clarity, 5);
  assert.deepEqual(a.issueCounts, { legal_wording: 2, ambiguity: 1 });
  assert.deepEqual(a.skillAreaCounts, { legal: 2, pricing: 1 });
});

test('topFindingCodes counts block/warn findings, ignores info', () => {
  const run = (codes: [string, 'block' | 'warn' | 'info'][]) =>
    ({ findings: codes.map(([code, severity]) => ({ code, severity })) }) as unknown as SupervisionReport;
  const top = topFindingCodes([
    run([['MISSING_INFO', 'block'], ['NO_AI_DRAFT', 'info']]),
    run([['MISSING_INFO', 'block'], ['TEMPLATE_CHANGED', 'warn']]),
  ]);
  assert.deepEqual(top, [
    { code: 'MISSING_INFO', count: 2 },
    { code: 'TEMPLATE_CHANGED', count: 1 },
  ]);
});

test('groundTips drops tips citing no real feedback or unknown skills', () => {
  const tip = (over: Partial<SkillTip>): SkillTip => ({
    target: 'skillMd',
    problemHe: 'בעיה',
    suggestionHe: 'הצעה',
    proposedSkillMdText: '- הוסף X',
    evidence: { feedbackIds: ['t1/publish_a'], counts: '2/3' },
    ...over,
  });
  const kept = groundTips(
    [
      tip({}),
      tip({ evidence: { feedbackIds: ['t9/invented'], counts: '' } }),
      tip({ target: 's99-unknown' as SkillTip['target'] }),
      tip({ target: 's11-legal-compliance', proposedSkillMdText: 'ignored for skill files' }),
    ],
    new Set(['t1/publish_a']),
    new Set(['s11-legal-compliance']),
  );
  assert.equal(kept.length, 2);
  assert.equal(kept[0].proposedSkillMdText, '- הוסף X');
  assert.equal(kept[1].target, 's11-legal-compliance');
  assert.equal(kept[1].proposedSkillMdText, null, 'skill-file tips carry no skillMd text');
});
