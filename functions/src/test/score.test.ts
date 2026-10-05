// Unit tests for the per-case success score (no network, no emulator):
//   node --test functions/lib/test/score.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCORE_TARGETS,
  scaleMetric,
  gradeOf,
  type AuditDoc,
  type DocVersion,
  type SupervisionReport,
  type TenderDoc,
  type TenderProvenance,
} from '@obms/shared';
import { changeRatio, computeScore, type ScoreInput } from '../services/scoreCalc.js';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

const tender: TenderDoc = {
  id: 't1',
  title: 'מכרז',
  type: 'goods',
  params: { org: 'משרד', description: 'מצלמות', quantity: 10 },
  status: 'published',
  googleDocId: null,
  docExportPath: null,
  ownerUid: 'm',
  submissionDeadline: T0 + 30 * DAY,
  awardDate: null,
  awardedSupplierId: null,
  createdAt: T0,
  updatedAt: T0,
};

let auditId = 0;
const status = (prev: string, next: string, at: number): AuditDoc => ({
  id: String(++auditId),
  entityType: 'tender',
  entityId: 't1',
  tenderId: 't1',
  actorUid: 'm',
  actorName: 'm',
  action: 'status_change',
  prevState: prev,
  newState: next,
  at,
});

const run = (stage: SupervisionReport['stage'], verdict: SupervisionReport['verdict'], at: number, blockers = 0): SupervisionReport => ({
  runId: `r${at}`,
  tenderId: 't1',
  stage,
  verdict,
  findings: Array.from({ length: blockers }, () => ({
    code: 'MISSING_INFO' as const,
    severity: 'block' as const,
    location: 'document',
    message: 'x',
    source: 'rules' as const,
  })),
  docHash: 'h',
  templateType: 'goods',
  requiredSkills: [],
  skillsUsed: [],
  aiModel: null,
  runBy: 'm',
  at,
});

const version = (n: number, at: number): DocVersion => ({
  n,
  hash: `h${n}`,
  stage: 'created',
  status: 'draft',
  at,
  path: `p${n}`,
  changeRatio: null,
});

const aiProvenance: TenderProvenance = {
  templateType: 'goods',
  templateId: 'T-A',
  templateHash: 'x',
  googleTemplateDocId: null,
  draftId: 'd1',
  draftType: 'goods',
  brief: 'b',
  aiModel: 'claude',
  aiStatus: 'COMPLETE',
  skillsUsed: [],
  paramSources: {},
  editedByManager: [],
  recordedAt: T0,
};

// A smooth case: published in 5 days, 2 versions, clean supervisor, no edits.
const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  tender,
  provenance: aiProvenance,
  audit: [
    status('draft', 'internal_review', T0 + 1 * DAY),
    status('internal_review', 'ready', T0 + 3 * DAY),
    status('ready', 'published', T0 + 5 * DAY),
  ],
  supervision: [run('created', 'PASS', T0 + 1000), run('prepublish', 'PASS', T0 + 5 * DAY - 1000)],
  versions: [version(1, T0 + 1000), version(2, T0 + 2 * DAY)],
  editSize: 0.05,
  invitedSuppliers: 4,
  submissions: 0,
  questions: 1,
  driveRevisions: null,
  targets: DEFAULT_SCORE_TARGETS,
  now: T0 + 10 * DAY,
  ...over,
});

const comp = (s: ReturnType<typeof computeScore>, key: string) => s.components.find((c) => c.key === key);

test('scaleMetric is linear between target and limit, in both directions', () => {
  assert.equal(scaleMetric(3, { good: 3, bad: 10 }), 100);
  assert.equal(scaleMetric(10, { good: 3, bad: 10 }), 0);
  assert.equal(scaleMetric(6.5, { good: 3, bad: 10 }), 50);
  assert.equal(scaleMetric(20, { good: 3, bad: 10 }), 0);
  assert.equal(scaleMetric(0.6, { good: 0.6, bad: 0.1 }), 100);
  assert.equal(scaleMetric(0.35, { good: 0.6, bad: 0.1 }), 50);
});

test('grade thresholds', () => {
  assert.deepEqual([90, 75, 55, 20].map(gradeOf), ['A', 'B', 'C', 'D']);
});

test('smooth AI-drafted case scores high on every measured component', () => {
  const s = computeScore(base());
  assert.equal(s.cohort, 'ai');
  assert.deepEqual(s.components.map((c) => c.key), ['efficiency', 'correctness', 'aiBenefit', 'outcome']);
  assert.ok(s.total >= 85, `total ${s.total}`);
  assert.equal(s.grade, 'A');
  const weights = s.components.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(weights - 1) < 0.01);
});

test('manual tender has no AI benefit component; weights rescale', () => {
  const s = computeScore(base({ provenance: { ...aiProvenance, draftId: null } }));
  assert.equal(s.cohort, 'manual');
  assert.ok(!comp(s, 'aiBenefit'));
  assert.equal(s.raw.editSize, 0.05, 'edit size still reported for the cohort comparison');
  assert.ok(Math.abs(s.components.reduce((a, c) => a + c.weight, 0) - 1) < 0.01);
});

test('outcome is not measured before publication', () => {
  const s = computeScore(base({ audit: [status('draft', 'internal_review', T0 + DAY)], tender: { ...tender, status: 'internal_review' } }));
  assert.ok(!comp(s, 'outcome'));
  assert.equal(s.raw.daysToPublish, undefined);
});

test('BLOCK runs and an override lower correctness', () => {
  const clean = comp(computeScore(base()), 'correctness')!.score;
  const overridden = computeScore(
    base({
      supervision: [run('created', 'BLOCK', T0 + 1000, 2), run('prepublish', 'BLOCK', T0 + 5 * DAY - 1000, 1)],
      audit: [
        ...base().audit,
        { ...status('BLOCK', 'prepublish', T0 + 5 * DAY - 500), action: 'supervisor_override' },
      ],
    }),
  );
  const c = comp(overridden, 'correctness')!;
  assert.ok(c.score < clean - 40, `${c.score} vs ${clean}`);
  assert.equal(overridden.raw.overrides, 1);
  assert.equal(overridden.raw.blockersAtPublish, 1);
});

test('many versions, slow publication and loop-backs lower efficiency', () => {
  const s = computeScore(
    base({
      versions: Array.from({ length: 9 }, (_, i) => version(i + 1, T0 + i * DAY)),
      audit: [
        status('draft', 'internal_review', T0 + DAY),
        status('internal_review', 'draft', T0 + 2 * DAY),
        status('draft', 'internal_review', T0 + 10 * DAY),
        status('internal_review', 'ready', T0 + 20 * DAY),
        status('ready', 'internal_review', T0 + 25 * DAY),
        status('internal_review', 'ready', T0 + 30 * DAY),
        status('ready', 'published', T0 + 40 * DAY),
      ],
    }),
  );
  assert.equal(s.raw.backSteps, 2);
  assert.equal(s.raw.versions, 9);
  assert.ok(comp(s, 'efficiency')!.score < 30);
});

test('versions after publication count as addenda', () => {
  const s = computeScore(base({ versions: [version(1, T0), version(2, T0 + 6 * DAY), version(3, T0 + 7 * DAY)] }));
  assert.equal(s.raw.addenda, 2);
  assert.equal(s.raw.versions, 1);
});

test('response rate is measured only after the deadline', () => {
  assert.equal(computeScore(base({ submissions: 2 })).raw.responseRate, undefined);
  const after = computeScore(base({ submissions: 2, now: T0 + 40 * DAY }));
  assert.equal(after.raw.responseRate, 0.5);
});

test('AI acceptance reflects fields the manager changed', () => {
  const s = computeScore(base({ provenance: { ...aiProvenance, editedByManager: ['org'] } }));
  assert.ok(Math.abs(s.raw.acceptance! - 2 / 3) < 1e-9);
});

test('changeRatio: identical, small edit, full rewrite', () => {
  const a = 'גוף מזמין משרד הביטחון כמות 10 מצלמות אבטחה לאספקה מיידית';
  assert.equal(changeRatio(a, a), 0);
  const small = changeRatio(a, a.replace('10', '12'));
  assert.ok(small > 0 && small < 0.2, String(small));
  assert.ok(changeRatio(a, 'טקסט אחר לגמרי ללא שום קשר למקור כלל ועיקר') > 0.8);
});
