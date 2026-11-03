// Unit tests for draft-first cases and requirement research (no network, no emulator):
//   node --test functions/lib/test/draft.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDocument, type ResearchSource } from '@obms/shared';
import { documentGate, draftDataHash } from '../services/draftCalc.js';
import { collectSources, groundResearch, unsafeQueryReason } from '../services/requestResearch.js';

const base = { previewText: 'מכרז טובין · כמות: 10', submissionDeadline: 1, awardDate: null, evaluationCriteria: [], internalParams: {} };

test('draftDataHash changes with any checked datum, not with key order', () => {
  const h = draftDataHash(base);
  assert.equal(h, draftDataHash({ ...base }));
  assert.notEqual(h, draftDataHash({ ...base, previewText: 'מכרז טובין · כמות: 12' }));
  assert.notEqual(h, draftDataHash({ ...base, submissionDeadline: 2 }));
  assert.notEqual(h, draftDataHash({ ...base, evaluationCriteria: [{ name: 'מחיר', weight: 100 }] }));
  assert.notEqual(h, draftDataHash({ ...base, internalParams: { budget: 5 } }));
  assert.equal(
    draftDataHash({ ...base, internalParams: { a: 1, b: 2 } }),
    draftDataHash({ ...base, internalParams: { b: 2, a: 1 } }),
  );
});

const draft = (over: Record<string, unknown> = {}) =>
  ({ status: 'draft', documentStatus: 'none', googleDocId: null, docExportPath: null, lastSupervision: undefined, ...over }) as Parameters<typeof documentGate>[0];
const check = (verdict: 'PASS' | 'WARN' | 'BLOCK', dataHash = 'H', basis: 'draft' | 'document' = 'draft') => ({
  runId: 'r', verdict, stage: 'manual' as const, blockers: verdict === 'BLOCK' ? 1 : 0, at: 1, basis, dataHash,
});

test('documentGate: only the latest check of exactly this draft data, with no blocker, opens it', () => {
  assert.equal(documentGate(draft(), 'H'), 'no_check');
  assert.equal(documentGate(draft({ lastSupervision: check('PASS', 'H', 'document') }), 'H'), 'no_check');
  assert.equal(documentGate(draft({ lastSupervision: check('PASS', 'OLD') }), 'H'), 'stale_check');
  assert.equal(documentGate(draft({ lastSupervision: check('BLOCK') }), 'H'), 'blocked');
  assert.equal(documentGate(draft({ lastSupervision: check('WARN') }), 'H'), null, 'warnings are allowed');
  assert.equal(documentGate(draft({ lastSupervision: check('PASS') }), 'H'), null);
  assert.equal(documentGate(draft({ status: 'internal_review', lastSupervision: check('PASS') }), 'H'), 'not_draft');
  assert.equal(documentGate(draft({ documentStatus: 'generated', lastSupervision: check('PASS') }), 'H'), 'has_document');
});

test('hasDocument: explicit status wins; older cases count by their doc id/path', () => {
  assert.equal(hasDocument({ documentStatus: 'none', googleDocId: null, docExportPath: null }), false);
  assert.equal(hasDocument({ documentStatus: 'generating', googleDocId: null, docExportPath: null }), false);
  assert.equal(hasDocument({ documentStatus: 'generated', googleDocId: 'x', docExportPath: null }), true);
  assert.equal(hasDocument({ googleDocId: 'x', docExportPath: null }), true, 'legacy case with a Google Doc');
  assert.equal(hasDocument({ googleDocId: null, docExportPath: null }), false);
});

test('unsafeQueryReason refuses identifying queries, allows generic ones', () => {
  const sensitive = ['מערכת אורקל', 'קריית שמונה'];
  const ok = ['מפרט רכש מצלמות אבטחה IP66 חוץ', 'ריהוט משרדי ארגונומי דרישות מכרז', 'QA automation services tender requirements'];
  for (const q of ok) assert.equal(unsafeQueryReason(q, sensitive, '2026-31'), null, q);
  const bad = [
    'מכרז משרד הביטחון מצלמות',
    'יחידת 8200 שירותי פיתוח',
    'תחזוקת מערכת אורקל',
    'מצלמות קריית שמונה',
    'בל"מ 2026-31',
    'רכש 500 מחשבים',
    'שירותי QA מסווג',
    'contact procurement@gov.il',
  ];
  for (const q of bad) assert.ok(unsafeQueryReason(q, sensitive, '2026-31'), q);
});

const sources: ResearchSource[] = [
  { url: 'https://a.example/tender', title: 'A' },
  { url: 'https://b.example/spec', title: 'B' },
];

test('groundResearch keeps only items citing pages the search returned', () => {
  const r = groundResearch(
    {
      similarCases: [
        { title: 'real', url: 'https://a.example/tender', relevance: 'x' },
        { title: 'invented', url: 'https://nowhere.example', relevance: 'x' },
      ],
      suggestedFeatures: [
        { feature: 'עמידות IP66', priority: 'must', why: 'נדרש ברוב המכרזים', sourceUrls: ['https://b.example/spec', 'https://fake.example'] },
        { feature: 'ללא מקור', priority: 'should', why: '', sourceUrls: ['https://fake.example'] },
        { feature: 'עדיפות שגויה', priority: 'urgent' as never, why: '', sourceUrls: ['https://a.example/tender'] },
      ],
    },
    sources,
  );
  assert.deepEqual(r.similarCases.map((c) => c.title), ['real']);
  assert.equal(r.suggestedFeatures.length, 2);
  assert.deepEqual(r.suggestedFeatures[0].sourceUrls, ['https://b.example/spec'], 'unknown URLs stripped');
  assert.equal(r.suggestedFeatures[1].priority, 'nice', 'unknown priority normalised');
  assert.equal(r.dropped, 2);
});

test('collectSources reads search results and text citations, deduplicated', () => {
  const content = [
    { type: 'server_tool_use', id: 't', name: 'web_search', input: { query: 'q' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 't',
      content: [
        { type: 'web_search_result', url: 'https://a.example/tender', title: 'A' },
        { type: 'web_search_result', url: 'https://b.example/spec', title: 'B' },
      ],
    },
    { type: 'text', text: 'x', citations: [{ type: 'web_search_result_location', url: 'https://a.example/tender', title: 'A' }, { url: 'https://c.example', title: 'C' }] },
  ];
  const s = collectSources(content as never);
  assert.deepEqual(s.map((x) => x.url).sort(), ['https://a.example/tender', 'https://b.example/spec', 'https://c.example']);
});
