// Tests for the request agent's server side (no network, a fake client):  node --test functions/lib/test/requestAgentServer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import type { AssistRequestInput } from '@obms/shared';
import { requestAgentTurn } from '../services/requestAgent.js';
import { nextUsage } from '../lib/rateWindow.js';

const input = (over: Partial<AssistRequestInput> = {}): AssistRequestInput => ({
  mode: 'chat',
  brief: '',
  details: {},
  history: [],
  qualityAsked: 0,
  ...over,
});

const fake = (create: (body: unknown, opts?: unknown) => Promise<unknown>) => ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;
const toolUse = (inputObj: unknown, stop = 'tool_use') => ({ stop_reason: stop, content: [{ type: 'tool_use', input: inputObj }] });

test('no client: the script answers', async () => {
  const r = await requestAgentTurn(input(), null);
  assert.equal(r.source, 'script');
  assert.equal(r.asking, 'service_name');
});

test('a model answer is sanitised and merged under what the person typed', async () => {
  let sent: any;
  const client = fake(async (body) => {
    sent = body;
    return toolUse({
      details: { service_name: 'של המודל', contract_years: 99, document_classification: 'סודי', annual_budget: 5 },
      asking: 'scope',
      message: 'תארו את עיקרי השירות.',
      chips: [],
    });
  });
  const r = await requestAgentTurn(input({ details: { service_name: 'שלי' } }), client);
  assert.equal(r.source, 'model');
  assert.deepEqual(r.details, { service_name: 'שלי', document_classification: 'סודי' }); // typed wins, junk dropped
  assert.equal(r.asking, 'scope');
  assert.equal(r.message, 'תארו את עיקרי השירות.');
  // the prompt never carries a budget and forces the tool
  const payload = JSON.stringify(sent);
  assert.ok(!payload.includes('annual_budget'));
  assert.deepEqual(sent.tool_choice, { type: 'tool', name: 'return_request_turn' });
});

test('a model that asks about the wrong thing is replaced by the canonical question', async () => {
  const client = fake(async () => toolUse({ details: {}, asking: 'contract_years', message: 'כמה שנים?', chips: [] }));
  const r = await requestAgentTurn(input(), client);
  assert.equal(r.asking, 'service_name');
  assert.ok(r.message.includes('מה שם השירות'));
});

test('an error, a timeout and a truncated answer all fall back to the script', async () => {
  const boom = fake(async () => {
    throw new Error('network down');
  });
  const truncated = fake(async () => toolUse({ details: {} }, 'max_tokens'));
  const empty = fake(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text' }] }));
  for (const client of [boom, truncated, empty]) {
    const r = await requestAgentTurn(input(), client);
    assert.equal(r.source, 'script');
    assert.equal(r.asking, 'service_name');
  }
});

test('extract mode asks the model but returns no message', async () => {
  const client = fake(async () => toolUse({ details: { service_name: 'תמיכה' }, asking: 'document_classification', message: 'x', chips: [] }));
  const r = await requestAgentTurn(input({ mode: 'extract', brief: 'שירותי תמיכה' }), client);
  assert.equal(r.message, '');
  assert.equal(r.details.service_name, 'תמיכה');
});

test('nextUsage allows up to the limit inside a window, then refuses, then opens a new window', () => {
  const H = 3_600_000;
  let w = nextUsage(undefined, 1000, 2, H);
  assert.deepEqual(w, { allowed: true, next: { start: 1000, count: 1 } });
  w = nextUsage(w.next, 2000, 2, H);
  assert.equal(w.allowed, true);
  const third = nextUsage(w.next, 3000, 2, H);
  assert.equal(third.allowed, false);
  assert.deepEqual(third.next, w.next, 'a refused call is not counted');
  const later = nextUsage(w.next, 1000 + H, 2, H);
  assert.deepEqual(later, { allowed: true, next: { start: 1000 + H, count: 1 } });
});
