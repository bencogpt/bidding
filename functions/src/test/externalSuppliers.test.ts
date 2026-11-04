// External supplier search: government track record first, grounded in pages the search returned.
//   node --test functions/lib/test/externalSuppliers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExternalSuppliers } from '../services/aiService.js';

const GOV = 'https://mr.gov.il/ilgstorefront/he/p/4000123456';
const SITE = 'https://www.cyberco.co.il/contact';

// Step 1: a web-search turn that returned two pages; step 2: the structured list.
const fakeClient = (suppliers: unknown[]) => {
  let n = 0;
  return {
    messages: {
      create: async () => {
        n += 1;
        if (n === 1) {
          return {
            stop_reason: 'end_turn',
            content: [
              { type: 'web_search_tool_result', tool_use_id: 't', content: [{ type: 'web_search_result', url: GOV }, { type: 'web_search_result', url: SITE }] },
              { type: 'text', text: 'ממצאים: סייברקו זכתה במכרז מרכזי של מינהל הרכש הממשלתי.' },
            ],
          };
        }
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'return_suppliers', input: { suppliers } }] };
      },
    },
  } as never;
};

test('government record counts only with a page the search returned; such suppliers come first', async () => {
  const r = await suggestExternalSuppliers(['סייבר'], 'service', fakeClient([
    { name: 'זרה בע"מ', domain: 'סייבר', isIsraeli: false, rationaleHe: 'x' },
    { name: 'מומצאת', domain: 'סייבר', isIsraeli: true, rationaleHe: 'x', govRecordHe: 'זכתה במכרז', govSourceUrl: 'https://invented.example' },
    { name: 'סייברקו', domain: 'סייבר', isIsraeli: true, rationaleHe: 'x', govRecordHe: 'זכתה במכרז מרכזי', govSourceUrl: GOV, contactEmail: 'info@cyberco.co.il', sourceUrl: SITE },
  ]));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.suppliers.map((s) => s.name), ['סייברקו', 'מומצאת', 'זרה בע"מ']);
  assert.equal(r.suppliers[0].hasGovRecord, true);
  assert.equal(r.suppliers[1].hasGovRecord, false, 'an invented page is not evidence');
  assert.equal(r.suppliers[1].govSourceUrl, undefined);
});

test('no domain tags / no client / a failure are reported, not silent', async () => {
  assert.equal((await suggestExternalSuppliers([], 'service', fakeClient([]))).status, 'no_tags');
  assert.equal((await suggestExternalSuppliers(['x'], 'service', null)).status, 'failed');
  const boom = { messages: { create: async () => { throw new Error('boom'); } } } as never;
  assert.equal((await suggestExternalSuppliers(['x'], 'service', boom)).status, 'failed');
});
