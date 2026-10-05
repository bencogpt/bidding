// Unit tests for the supervisor agent's deterministic layer (no network, no emulator):
//   node --test functions/lib/test/supervisor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_SKILLS,
  verdictOf,
  type TemplateDoc,
  type TenderDoc,
  type TenderProvenance,
} from '@obms/shared';
import {
  runDeterministicChecks,
  templateHash,
  htmlToText,
  type DeterministicInput,
} from '../services/supervisorChecks.js';

const goods: TemplateDoc = {
  type: 'goods',
  title: 'תבנית מכרז טובין',
  googleTemplateDocId: null,
  bodyTemplate: [
    '## פרטי המכרז',
    'גוף מזמין: {{org}}',
    'תיאור הטובין הנדרשים: {{description}}',
    'כמות: {{quantity}}',
    '## תנאי סף',
    'על המציע לעמוד בכל דרישות התקן הרלוונטיות ולספק אחריות יצרן.',
    '## אופן ההגשה',
    'יש להגיש הצעת מחיר מפורטת בצירוף מפרט טכני מלא עד למועד ההגשה.',
  ].join('\n'),
  params: [
    { key: 'org', labelHe: 'גוף מזמין', type: 'text', required: true },
    { key: 'description', labelHe: 'תיאור הטובין', type: 'textarea', required: true },
    { key: 'quantity', labelHe: 'כמות', type: 'number', required: true },
    { key: 'budget', labelHe: 'אומדן', type: 'number', required: false, internal: true },
  ],
};

const service: TemplateDoc = {
  type: 'service',
  title: 'תבנית מכרז שירות וכוח-אדם',
  googleTemplateDocId: null,
  bodyTemplate: [
    '## פרטי המכרז',
    'גוף מזמין: {{org}}',
    'היקף כוח אדם נדרש: {{headcount}} אנשי צוות',
    '## דרישות מקצועיות',
    'על נותן השירות להציג ניסיון מוכח וכוח אדם מוסמך לתחום.',
    'נותן השירות יעמיד מנהל תיק ייעודי לכל תקופת ההתקשרות.',
  ].join('\n'),
  params: [
    { key: 'org', labelHe: 'גוף מזמין', type: 'text', required: true },
    { key: 'headcount', labelHe: 'היקף כוח אדם', type: 'number', required: true },
  ],
};

const tender: TenderDoc = {
  id: 't1',
  title: 'מכרז מצלמות',
  type: 'goods',
  params: { org: 'משרד הביטחון', description: 'מצלמות אבטחה', quantity: 10 },
  status: 'ready',
  googleDocId: null,
  docExportPath: null,
  ownerUid: 'm',
  submissionDeadline: null,
  awardDate: null,
  awardedSupplierId: null,
  evaluationCriteria: [
    { name: 'מחיר', weight: 60 },
    { name: 'איכות', weight: 40 },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const fill = (body: string, p: Record<string, string | number>) =>
  body.replace(/\{\{\s*([^}\n]+?)\s*\}\}/g, (m, k: string) => (p[k] !== undefined ? String(p[k]) : m));

const cleanDoc = fill(goods.bodyTemplate, tender.params);
const skillHash = (id: string) => `h-${id}`;

const provenance: TenderProvenance = {
  templateType: 'goods',
  templateId: 'T-A',
  templateHash: templateHash(goods),
  googleTemplateDocId: null,
  draftId: 'd1',
  draftType: 'goods',
  brief: 'רכש 10 מצלמות אבטחה עבור משרד הביטחון',
  aiModel: 'claude',
  aiStatus: 'COMPLETE',
  skillsUsed: [
    { id: 'GLOBAL_RULES', hash: skillHash('GLOBAL_RULES') },
    ...REQUIRED_SKILLS.goods.map((id) => ({ id, hash: skillHash(id) })),
  ],
  paramSources: {
    org: { source_type: 'BID_MANAGER', source_ref: 'brief' },
    description: { source_type: 'BID_MANAGER', source_ref: 'brief' },
    quantity: { source_type: 'BID_MANAGER', source_ref: 'brief' },
  },
  editedByManager: [],
  recordedAt: 0,
};

const base = (over: Partial<DeterministicInput> = {}): DeterministicInput => ({
  tender,
  template: goods,
  otherTemplates: [service],
  provenance,
  internalParams: { budget: 500000 },
  docText: cleanDoc,
  currentSkillHash: skillHash,
  ...over,
});

const codes = (i: DeterministicInput) => runDeterministicChecks(i).map((f) => `${f.code}:${f.severity}`);
const verdict = (i: DeterministicInput) => verdictOf(runDeterministicChecks(i));

test('clean document drafted with the right template + skills → PASS', () => {
  assert.deepEqual(codes(base()), []);
  assert.equal(verdict(base()), 'PASS');
});

test('leftover placeholder in the document → BLOCK', () => {
  const r = codes(base({ docText: cleanDoc + '\nאחריות: {{WARRANTY_YEARS}}' }));
  assert.ok(r.includes('MISSING_INFO:block'), r.join());
});

test('confidential estimate appears in the document → BLOCK (G6)', () => {
  const r = codes(base({ docText: cleanDoc + '\nתקציב: 500,000 ₪' }));
  assert.ok(r.includes('CONFIDENTIAL_LEAK:block'), r.join());
});

test('number param missing from (edited) document → BLOCK', () => {
  const r = codes(base({ docText: cleanDoc.replace('כמות: 10', 'כמות: 12') }));
  assert.ok(r.includes('PARAM_NOT_IN_DOC:block'), r.join());
});

test('criteria weights not summing to 100 → BLOCK', () => {
  const t = { ...tender, evaluationCriteria: [{ name: 'מחיר', weight: 70 }, { name: 'איכות', weight: 40 }] };
  assert.ok(codes(base({ tender: t })).includes('CRITERIA_WEIGHTS:block'));
});

test('AI draft without a required skill → BLOCK', () => {
  const p = { ...provenance, skillsUsed: provenance.skillsUsed.filter((s) => s.id !== 's11-legal-compliance') };
  assert.ok(codes(base({ provenance: p })).includes('SKILL_MISSING:block'));
});

test('skill updated since drafting → WARN', () => {
  const r = codes(base({ currentSkillHash: (id) => (id === 's05-procurement-quality-check' ? 'new' : skillHash(id)) }));
  assert.deepEqual(r, ['SKILL_VERSION_CHANGED:warn']);
});

test('template edited after creation → WARN', () => {
  const edited = { ...goods, skillMd: 'הנחיה חדשה' };
  assert.deepEqual(codes(base({ template: edited })), ['TEMPLATE_CHANGED:warn']);
});

test('provenance recorded for another template type → BLOCK', () => {
  const p = { ...provenance, templateType: 'service' as const };
  assert.ok(codes(base({ provenance: p })).includes('TEMPLATE_MISMATCH:block'));
});

test('document generated from the wrong template → BLOCK', () => {
  const wrongDoc = fill(service.bodyTemplate, { org: 'משרד הביטחון', headcount: 5 }) + '\nמצלמות אבטחה 10';
  const r = codes(base({ docText: wrongDoc }));
  assert.ok(r.includes('TEMPLATE_STRUCTURE_MISSING:block'), r.join());
  assert.ok(r.includes('TEMPLATE_MISMATCH:block'), r.join());
});

test('AI-invented number not in the brief → BLOCK', () => {
  const t = { ...tender, params: { ...tender.params, description: 'מצלמות אבטחה עם אחריות 36 חודשים' } };
  const doc = fill(goods.bodyTemplate, t.params);
  const r = codes(base({ tender: t, docText: doc }));
  assert.ok(r.includes('UNSOURCED_VALUE:block'), r.join());
});

test('a manager-edited value is not flagged as AI-invented', () => {
  const t = { ...tender, params: { ...tender.params, description: 'מצלמות אבטחה עם אחריות 36 חודשים' } };
  const doc = fill(goods.bodyTemplate, t.params);
  const p = { ...provenance, editedByManager: ['description'] };
  assert.equal(verdict(base({ tender: t, docText: doc, provenance: p })), 'PASS');
});

test('manual tender (no AI draft) → info only, PASS', () => {
  const p = { ...provenance, draftId: null, draftType: null, brief: null, skillsUsed: [], paramSources: {} };
  assert.deepEqual(codes(base({ provenance: p })), ['NO_AI_DRAFT:info']);
});

test('unreadable document → BLOCK', () => {
  assert.ok(codes(base({ docText: null })).includes('DOC_UNREADABLE:block'));
});

test('htmlToText extracts the dev-mode document text', () => {
  const text = htmlToText('<html><style>p{}</style><body><h1>כותרת</h1><p>כמות: 10</p></body></html>');
  assert.ok(text.includes('כמות: 10'));
  assert.ok(!text.includes('p{}'));
});
