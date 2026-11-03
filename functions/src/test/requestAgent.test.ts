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
  assert.equal(t4.asking, 'service_location', 'after the mandatory details come the optional questions');
  assert.equal(t4.ready, true);
  const allOptional = { ...all, service_location: 'חיפה', service_providers_total: 12, work_hours: 'משרה מלאה' };
  const t4b = scriptTurn(base({ details: allOptional, brief: LONG }));
  assert.equal(t4b.asking, 'quality');
  assert.ok(t4b.message.includes(QUALITY_QUESTIONS[0].q));
  const t5 = scriptTurn(base({ details: allOptional, brief: LONG, qualityAsked: 3 }));
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

test('the agent knows the seven optional answers: schema, extraction, sanitiser and panel text', () => {
  const ok = { service_location: 'חיפה', provider_responsibilities: 'פיתוח', team_lead_role: 'מנהל צוות', min_pool_candidates: 5, service_providers_total: 12, supplier_equipment: 'מחשב', work_hours: 'משרה מלאה' };
  assert.ok(assistRequestInput.safeParse(base({ details: ok })).success);
  for (const bad of [{ min_pool_candidates: 0 }, { service_providers_total: 1.5 }, { service_location: 'a {{b}}' }, { work_hours: 'x'.repeat(201) }, { annual_budget: 1 }]) {
    assert.equal(assistRequestInput.safeParse(base({ details: bad as never })).success, false, JSON.stringify(bad));
  }
  assert.deepEqual(
    scriptExtract('צוות של 12 נותני שירות. מקום אספקת השירות: חיפה, היקף משרה: משרה מלאה, לפחות 5 מועמדים'),
    { service_providers_total: 12, service_location: 'חיפה', work_hours: 'משרה מלאה', min_pool_candidates: 5 },
  );
  const clean = sanitizeModelOutput({ details: { service_location: ' חיפה ', service_providers_total: 12.5, min_pool_candidates: 7, team_lead_role: 'x {{y}}', work_hours: 'ש'.repeat(500), annual_budget: 9 } });
  assert.deepEqual(clean.details, { service_location: 'חיפה', min_pool_candidates: 7, work_hours: 'ש'.repeat(200) });
  assert.deepEqual(
    agentDetailsFromFields({ service_name: '', document_classification: 'בלמ"ס', annual_budget: '5', contract_years: '', service_location: ' חיפה ', service_providers_total: '12', min_pool_candidates: 'x', work_hours: '', supplier_equipment: 'מחשב', team_lead_role: '', provider_responsibilities: '' }, new Set()),
    { service_location: 'חיפה', service_providers_total: 12, supplier_equipment: 'מחשב' },
  );
});

test('the chat asks the three optional questions once each, skippable, and does not repeat a skipped one', () => {
  const all = { service_name: 'תמיכה', document_classification: 'בלמ"ס', contract_years: 3 };
  const a1 = scriptTurn(base({ details: all, brief: LONG }));
  assert.equal(a1.asking, 'service_location');
  assert.ok(a1.message.includes('קיבלתי את כל מה שצריך'), 'the intro is said once, at the first extra question');
  assert.ok(a1.chips.includes('דלג'));
  // skipping the location moves on to the provider count (it was found in the text, so this goes on to hours)
  const h1 = [{ role: 'agent' as const, text: a1.message }, { role: 'user' as const, text: 'דלג' }];
  const a2 = scriptTurn(base({ details: all, brief: LONG, history: h1 }));
  assert.equal(a2.asking, 'work_hours', 'the provider count came from the text; the location was skipped');
  assert.ok(!a2.message.includes('קיבלתי את כל מה שצריך'), 'the intro is not repeated');
  // answering the hours question fills it
  const h2 = [...h1, { role: 'agent' as const, text: a2.message }, { role: 'user' as const, text: 'משרה מלאה + כוננות' }];
  const a3 = scriptTurn(base({ details: all, brief: LONG, history: h2 }));
  assert.equal(a3.details.work_hours, 'משרה מלאה + כוננות');
  assert.equal(a3.asking, 'quality');
  assert.equal(a3.ready, true);
  // an answer to the location question fills it
  const withAnswer = scriptTurn(base({ details: all, brief: LONG, history: [{ role: 'agent', text: a1.message }, { role: 'user', text: 'תל אביב' }] }));
  assert.equal(withAnswer.details.service_location, 'תל אביב');
});
