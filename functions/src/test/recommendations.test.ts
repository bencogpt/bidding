// Recommendations for a new request (no network):  node --test functions/lib/test/recommendations.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import {
  BRIEF_MAX_LENGTH,
  recommendationsInput,
  sanitizeRecommendations,
  scriptRecommendations,
  type RecommendationsInput,
} from '@obms/shared';
import { recommendationsFor } from '../services/requestRecommendations.js';

const LONG = 'פיתוח ותחזוקה של מערכת מידע ארגונית, צוות של 12 נותני שירות, זמינות 99.9% ועמידה בדרישות אבטחה.';
const input = (over: Partial<RecommendationsInput> = {}): RecommendationsInput => ({ brief: LONG, details: {}, ...over });
const fake = (create: (body: unknown) => Promise<unknown>) => ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;
const toolUse = (inputObj: unknown, stop = 'tool_use') => ({ stop_reason: stop, content: [{ type: 'tool_use', input: inputObj }] });

test('the input never accepts the budget or unknown keys, and needs a real brief', () => {
  assert.ok(recommendationsInput.safeParse(input()).success);
  assert.equal(recommendationsInput.safeParse(input({ details: { annual_budget: 5 } as never })).success, false);
  assert.equal(recommendationsInput.safeParse({ ...input(), annual_budget: 5 }).success, false);
  assert.equal(recommendationsInput.safeParse(input({ brief: 'ab' })).success, false);
  assert.equal(recommendationsInput.safeParse(input({ brief: 'x'.repeat(BRIEF_MAX_LENGTH + 1) })).success, false);
});

test('sanitizeRecommendations keeps at most six clean, bounded, distinct items', () => {
  const out = sanitizeRecommendations({
    items: [
      { kind: 'רעיון', text: '  סעיף החלפת איש צוות  ' },
      { kind: 'הערה', text: 'סעיף החלפת איש צוות' }, // duplicate text
      { kind: 'אחר', text: 'סוג לא מוכר הופך להערה' },
      { kind: 'הערה', text: 'x {{y}}' },
      { kind: 'הערה', text: '' },
      { kind: 'הערה', text: 'ש'.repeat(900) },
      ...Array.from({ length: 10 }, (_, i) => ({ kind: 'רעיון', text: `המלצה מספר ${i}` })),
    ],
  });
  assert.ok(out.length <= 6);
  assert.deepEqual(out[0], { kind: 'רעיון', text: 'סעיף החלפת איש צוות' });
  assert.equal(out[1].kind, 'הערה');
  assert.ok(out.every((r) => r.text.length >= 3 && r.text.length <= 300 && !r.text.includes('{{')));
  assert.equal(new Set(out.map((r) => r.text)).size, out.length);
  assert.deepEqual(sanitizeRecommendations(null), []);
  assert.deepEqual(sanitizeRecommendations({ items: 'no' }), []);
});

test('the script fallback gives only what the request does not already say', () => {
  const plain = scriptRecommendations(input());
  assert.ok(plain.length >= 1 && plain.length <= 5);
  assert.ok(plain.some((r) => /ניסיון/.test(r.text)), 'the text has no experience requirement');
  assert.ok(plain.some((r) => /SLA|זמן תגובה/.test(r.text)) === false, 'it already speaks of availability');
  const full = scriptRecommendations(input({ brief: LONG + ' נדרש ניסיון מוכח, זמן תגובה לתקלה קריטית 30 דקות, אופציה להארכה.', details: { contract_years: 1 } }));
  assert.ok(!full.some((r) => /ניסיון/.test(r.text)));
  assert.ok(!full.some((r) => /אופצי/.test(r.text)));
  assert.ok(scriptRecommendations(input({ details: { contract_years: 5 } })).some((r) => /הצמדה|מדד/.test(r.text)));
  assert.ok(scriptRecommendations(input({ brief: 'ממש קצר אבל מספיק' })).length >= 1, 'never an empty answer');
});

test('with no client, an error or a truncated answer the script answers', async () => {
  for (const client of [
    null,
    fake(async () => {
      throw new Error('down');
    }),
    fake(async () => toolUse({ items: [] }, 'max_tokens')),
    fake(async () => ({ stop_reason: 'end_turn', content: [] })),
  ]) {
    const r = await recommendationsFor(input(), client);
    assert.equal(r.source, 'script');
    assert.ok(r.items.length >= 1);
  }
});

test('a model answer is sanitised, flagged as the model, and never sees the budget', async () => {
  let sent: unknown;
  const client = fake(async (body) => {
    sent = body;
    return toolUse({ items: [{ kind: 'רעיון', text: 'דרישת רישוי מקצועי לצוות' }, { kind: 'הערה', text: 'x {{bad}}' }] });
  });
  const r = await recommendationsFor(input({ details: { service_name: 'תמיכה' } }), client);
  assert.equal(r.source, 'model');
  assert.deepEqual(r.items, [{ kind: 'רעיון', text: 'דרישת רישוי מקצועי לצוות' }]);
  assert.ok(!JSON.stringify(sent).includes('annual_budget'));
  assert.deepEqual((sent as { tool_choice: unknown }).tool_choice, { type: 'tool', name: 'return_recommendations' });
});

test('a model that returns nothing usable falls back to the script', async () => {
  const r = await recommendationsFor(input(), fake(async () => toolUse({ items: [{ kind: 'הערה', text: '' }] })));
  assert.equal(r.source, 'script');
});

test('composeRequestBrief appends the notes and the chosen recommendations, and nothing when there are none', async () => {
  const { composeRequestBrief } = await import('@obms/shared');
  assert.equal(composeRequestBrief('הבקשה', '', []), 'הבקשה');
  assert.equal(composeRequestBrief('הבקשה', '   ', ['  ']), 'הבקשה');
  const out = composeRequestBrief('הבקשה', ' הערה חשובה ', ['סעיף א', 'סעיף ב']);
  assert.equal(out, 'הבקשה\n\nהערות נוספות:\nהערה חשובה\n\nהמלצות שנבחרו:\n- סעיף א\n- סעיף ב');
  assert.equal(composeRequestBrief('הבקשה', '', ['סעיף א']), 'הבקשה\n\nהמלצות שנבחרו:\n- סעיף א');
});
