// Unit tests for the request agent's pure logic (no network):  node --test functions/lib/test/requestAgent.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assistRequestInput,
  mergeExtracted,
  scriptExtract,
  sanitizeModelOutput,
  finishTurn,
  scriptTurn,
  scopeOk,
  requestChecklist,
  agentDetailsFromFields,
  QUALITY_QUESTIONS,
  type AssistRequestInput,
} from '@obms/shared';

const LONG = 'פיתוח ותחזוקה של מערכת מידע ארגונית, צוות של 12 נותני שירות, זמינות 99.9% ועמידה בדרישות אבטחה.';
const base = (over: Partial<AssistRequestInput> = {}): AssistRequestInput => ({
  mode: 'chat',
  brief: '',
  details: {},
  history: [],
  qualityAsked: 0,
  ...over,
});

test('assistRequestInput rejects the budget and any unknown key, long history and long text', () => {
  assert.ok(assistRequestInput.safeParse(base()).success);
  assert.equal(assistRequestInput.safeParse(base({ details: { annual_budget: 900000 } as never })).success, false);
  assert.equal(assistRequestInput.safeParse({ ...base(), annual_budget: 900000 }).success, false);
  assert.equal(assistRequestInput.safeParse(base({ details: { estimate: 1 } as never })).success, false);
  const turn = { role: 'user' as const, text: 'x' };
  assert.equal(assistRequestInput.safeParse(base({ history: Array(21).fill(turn) })).success, false);
  assert.equal(assistRequestInput.safeParse(base({ history: [{ role: 'user', text: 'x'.repeat(1001) }] })).success, false);
  assert.equal(assistRequestInput.safeParse(base({ details: { contract_years: 99 } })).success, false);
  assert.equal(assistRequestInput.safeParse(base({ details: { service_name: 'a {{b}}' } })).success, false);
});

test('mergeExtracted: what the person typed wins, extraction only fills the gaps', () => {
  const out = mergeExtracted({ service_name: 'שלי' }, { service_name: 'של המודל', contract_years: 3 });
  assert.deepEqual(out, { service_name: 'שלי', contract_years: 3 });
  assert.deepEqual(mergeExtracted({ service_name: undefined }, { service_name: 'x' }), { service_name: 'x' });
});

test('scriptExtract reads name, classification and years from Hebrew text', () => {
  assert.deepEqual(scriptExtract('שם השירות: תמיכה טכנית, סיווג סודי, ל-3 שנים'), {
    service_name: 'תמיכה טכנית',
    document_classification: 'סודי',
    contract_years: 3,
  });
  assert.equal(scriptExtract('התקשרות לשנתיים').contract_years, 2);
  assert.equal(scriptExtract('התקשרות לשנה').contract_years, 1);
  assert.deepEqual(scriptExtract('בלי פרטים'), {});
  assert.equal(scriptExtract('התקשרות ל-99 שנים').contract_years, undefined, 'out of range is ignored');
});

test('sanitizeModelOutput keeps only known, clean, bounded values', () => {
  const out = sanitizeModelOutput({
    details: {
      service_name: '  תמיכה  ',
      document_classification: 'x'.repeat(100),
      contract_years: 99,
      annual_budget: 900000,
      evil: 'x',
    },
    asking: 'scope',
    message: 'ש'.repeat(5000),
    chips: Array.from({ length: 20 }, (_, i) => `צ'יפ ${i}`).concat(['{{bad}}', '']),
  });
  assert.deepEqual(out.details, { service_name: 'תמיכה', document_classification: 'x'.repeat(40) });
  assert.equal(out.message.length, 600);
  assert.equal(out.chips.length, 4);
  assert.ok(out.chips.every((c) => c.length <= 40 && !c.includes('{{')));
  assert.equal(out.asking, 'scope');
  assert.deepEqual(sanitizeModelOutput({ details: { service_name: 'a {{b}}' } }).details, {});
  assert.deepEqual(sanitizeModelOutput(null), { details: {}, message: '', chips: [] });
  assert.equal(sanitizeModelOutput({ asking: 'hack' }).asking, undefined);
});

test('scopeOk needs 60 characters', () => {
  assert.equal(scopeOk('קצר'), false);
  assert.equal(scopeOk(LONG), true);
});

test('scriptTurn asks the missing details in order, one per turn, then the quality questions, then is done', () => {
  const t1 = scriptTurn(base());
  assert.equal(t1.asking, 'service_name');
  assert.ok(t1.message.startsWith('שלום'));
  assert.equal(t1.ready, false);
  assert.equal(t1.source, 'script');

  const t2 = scriptTurn(base({ details: { service_name: 'תמיכה' }, history: [{ role: 'agent', text: t1.message }, { role: 'user', text: 'תמיכה' }] }));
  assert.equal(t2.asking, 'document_classification');
  assert.deepEqual(t2.chips, ['רגיל', 'שמור', 'סודי', 'בלמ"ס']);

  const all = { service_name: 'תמיכה', document_classification: 'בלמ"ס', contract_years: 3 };
  const t3 = scriptTurn(base({ details: all }));
  assert.equal(t3.asking, 'scope');
  const t4 = scriptTurn(base({ details: all, brief: LONG }));
  assert.equal(t4.asking, 'quality');
  assert.equal(t4.ready, true);
  assert.ok(t4.message.includes(QUALITY_QUESTIONS[0].q));
  const t5 = scriptTurn(base({ details: all, brief: LONG, qualityAsked: 3 }));
  assert.equal(t5.asking, 'done');
  assert.deepEqual(t5.chips, []);
});

test('scriptTurn applies the answer to the question it just asked', () => {
  const asked = scriptTurn(base({ details: { service_name: 'תמיכה' } }));
  assert.equal(asked.asking, 'document_classification');
  const after = scriptTurn(base({ details: { service_name: 'תמיכה' }, history: [{ role: 'agent', text: asked.message }, { role: 'user', text: 'סודי' }] }));
  assert.equal(after.details.document_classification, 'סודי');
  assert.equal(after.asking, 'scope');
  const years = scriptTurn(base({
    details: { service_name: 'תמיכה', document_classification: 'שמור' },
    brief: LONG,
    history: [{ role: 'agent', text: 'מה משך תקופת ההתקשרות בשנים?' }, { role: 'user', text: '5' }],
  }));
  assert.equal(years.details.contract_years, 5);
});

test('extract mode returns no message; finishTurn prefers the model wording only when it asks the same thing', () => {
  const ex = scriptTurn(base({ mode: 'extract', brief: 'שם השירות: תמיכה' }));
  assert.equal(ex.message, '');
  assert.equal(ex.details.service_name, 'תמיכה');
  const same = finishTurn(base(), {}, 'model', { asking: 'service_name', message: 'איך קוראים לשירות?', chips: ['א'] });
  assert.equal(same.message, 'איך קוראים לשירות?');
  assert.equal(same.source, 'model');
  const other = finishTurn(base(), {}, 'model', { asking: 'contract_years', message: 'כמה שנים?', chips: [] });
  assert.ok(other.message.includes('מה שם השירות'), 'the model asked about something else: use the canonical question');
});

test('requestChecklist reports the five mandatory details and when sending is possible', () => {
  const rows = (brief: string, f: Record<string, string>) => requestChecklist(brief, f);
  const empty = rows('', { service_name: '', document_classification: '', annual_budget: '', contract_years: '' });
  assert.equal(empty.length, 5);
  assert.ok(empty.every((r) => !r.present));
  const full = rows(LONG, { service_name: 'תמיכה', document_classification: 'בלמ"ס', annual_budget: '900000', contract_years: '3' });
  assert.ok(full.every((r) => r.present));
  const badNumbers = rows(LONG, { service_name: 'תמיכה', document_classification: 'בלמ"ס', annual_budget: '-5', contract_years: '1.5' });
  assert.deepEqual(badNumbers.filter((r) => !r.present).map((r) => r.key), ['annual_budget', 'contract_years']);
});

test('agentDetailsFromFields sends only what the person typed or what is valid; the untouched default classification is not "typed"', () => {
  const f = { service_name: ' תמיכה ', document_classification: 'בלמ"ס', annual_budget: '900000', contract_years: '3' };
  assert.deepEqual(agentDetailsFromFields(f, new Set(['service_name'])), { service_name: 'תמיכה', contract_years: 3 });
  assert.deepEqual(agentDetailsFromFields(f, new Set(['document_classification'])), {
    document_classification: 'בלמ"ס',
    service_name: 'תמיכה',
    contract_years: 3,
  });
  assert.deepEqual(agentDetailsFromFields({ ...f, contract_years: '1.5', service_name: 'a {{b}}' }, new Set()), {});
  assert.ok(!('annual_budget' in agentDetailsFromFields(f, new Set(['annual_budget']))), 'the budget is never part of it');
});
