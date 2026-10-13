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
import {
  changeRatio,
  computeScore,
  documentChange,
  groupSessions,
  sampleSessions,
  type ScoreInput,
} from '../services/scoreCalc.js';
import type { DocChange, FeedbackDoc } from '@obms/shared';

const docChange = (over: Partial<DocChange> = {}): DocChange => ({
  source: 'checkpoints',
  sampled: false,
  sessions: 1,
  netChange: 0.05,
  churn: 0.05,
  rework: 0,
  dci: 95,
  timeline: [],
  ...over,
});

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
  docChange: docChange(),
  feedback: [],
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
      docChange: docChange({ sessions: 9, netChange: 0.4, churn: 1.2, rework: 0.67, dci: 21 }),
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
  assert.equal(s.raw.dci, 21);
  assert.ok(comp(s, 'efficiency')!.score < 30);
});

test('versions after publication count as addenda', () => {
  const s = computeScore(base({ versions: [version(1, T0), version(2, T0 + 6 * DAY), version(3, T0 + 7 * DAY)] }));
  assert.equal(s.raw.addenda, 2);

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

// ---- Document Change Index ----
const A = 'גוף מזמין משרד הביטחון כמות 10 מצלמות אבטחה לאספקה מיידית עם אחריות יצרן מלאה';
const B = A.replace('10', '12'); // small edit
const Z = 'טקסט אחר לגמרי ללא שום קשר למקור כלל ועיקר והוא שונה בכל מילה ומילה';

test('DCI: one edition → no change, DCI 100', () => {
  const r = documentChange([A]);
  assert.deepEqual([r.sessions, r.netChange, r.churn, r.rework, r.dci], [0, 0, 0, 0, 100]);
});

test('DCI: identical editions → DCI 100', () => {
  assert.equal(documentChange([A, A, A]).dci, 100);
});

test('DCI: a single clean edit has no rework', () => {
  const r = documentChange([A, B]);
  assert.equal(r.rework, 0);
  assert.ok(r.dci > 85 && r.dci < 100, String(r.dci));
});

test('DCI: edit-then-revert is pure rework and scores lower than the clean edit', () => {
  const revert = documentChange([A, Z, A]);
  assert.equal(revert.netChange, 0);
  assert.equal(revert.rework, 1);
  assert.ok(revert.dci < documentChange([A, B]).dci);
  assert.equal(revert.dci, 50); // (1 − 0) × (1 − 0.5·1) × 1
});

test('DCI: many sessions beyond the target are penalized by √(N₀/N)', () => {
  const twelve = documentChange(Array(13).fill(A)); // N = 12, no change
  assert.equal(twelve.dci, 50); // √(3/12) = 0.5
  const tuned = documentChange(Array(13).fill(A), { targetSessions: 12, reworkWeight: 0.5 });
  assert.equal(tuned.dci, 100);
});

test('DCI: the worked example from the plan (D≈0.1, R≈0.2, N=4 → ≈70)', () => {
  // Pure check of the formula itself.
  const dci = 100 * (1 - 0.1) * (1 - 0.5 * 0.2) * Math.sqrt(3 / 4);
  assert.equal(Math.round(dci), 70);
});

test('groupSessions: same editor within 30 min merges; different editor or long gap splits', () => {
  const m = 60_000;
  const s = groupSessions([
    { id: 'r1', at: 0, editor: 'sys' },
    { id: 'r2', at: 1 * m, editor: 'sys' },
    { id: 'r3', at: 10 * m, editor: 'mgr' },
    { id: 'r4', at: 35 * m, editor: 'mgr' },
    { id: 'r5', at: 120 * m, editor: 'mgr' },
    { id: 'r6', at: 121 * m, editor: 'legal' },
  ]);
  assert.deepEqual(s.map((x) => x.id), ['r2', 'r4', 'r5', 'r6']);
});

test('sampleSessions keeps first and last and caps the count', () => {
  const xs = Array.from({ length: 200 }, (_, i) => i);
  const { kept, sampled } = sampleSessions(xs, 60);
  assert.ok(sampled);
  assert.equal(kept.length, 60);
  assert.equal(kept[0], 0);
  assert.equal(kept[59], 199);
  assert.deepEqual(sampleSessions([1, 2, 3], 60), { kept: [1, 2, 3], sampled: false });
});

test('participant feedback becomes the participantRating outcome metric', () => {
  const fb = (ratings: FeedbackDoc['ratings']): FeedbackDoc => ({
    id: 'x', tenderId: 't1', tenderType: 'goods', round: 'publish', uid: 'u', name: 'n', role: 'legal',
    ratings, issues: [], skillAreas: [], comment: '', submittedAt: T0,
  });
  const s = computeScore(base({ feedback: [fb({ clarity: 4, draftQuality: 5 }), fb({ clarity: 3 })] }));
  assert.equal(s.raw.participantRating, 4);
  assert.ok(comp(s, 'outcome')!.metrics.some((m) => m.key === 'participantRating'));
});
