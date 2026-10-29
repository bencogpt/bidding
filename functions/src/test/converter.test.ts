// Unit tests for template conversion (pure; real excerpts from the live goods document):
//   node --test functions/lib/test/converter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFillSpots, templateFieldsStatus, mergeSyncedParams, detectPlaceholders } from '@obms/shared';
import {
  applyToText,
  fieldsAsParams,
  mergeFields,
  remainingSpots,
  replaceRequests,
  validateProposals,
} from '../services/conversionCalc.js';

const DOC = [
  'משרד ראש הממשלה',
  'טל:    פקס:    דוא"ל: XX',
  'הנדון: בל"ם מס\' XXXX בקשה להצעת מחיר לXXXX',
  '1. משרד ראש הממשלה (להלן: "המזמין") מבקש בזאת לקבל הצעת מחיר ל -XXXX בהתאם למפרט',
  'כמפורט בסעיף XXX להלן',
  'שם הבנק/חברת הביטוח ________',
  'מס\' הטלפון  ________________',
  'אומדן ההתקשרות: XXXX ש"ח',
].join('\n');

test('findFillSpots finds XXXX and ____ markers with their line', () => {
  const spots = findFillSpots(DOC);
  assert.equal(spots.length, 8); // XX, XXXX×2, XXXX, XXX, ____, ____, XXXX
  assert.ok(spots.some((s) => s.line.startsWith('הנדון') && s.marker === 'XXXX'));
  assert.equal(spots.filter((s) => s.line.startsWith('הנדון')).length, 2, 'two spots on one line');
});

test('findFillSpots skips supplier-filled lines', () => {
  const spots = findFillSpots(DOC, ['שם הבנק/חברת הביטוח', "מס' הטלפון"]);
  assert.equal(spots.length, 6);
  assert.ok(!spots.some((s) => s.line.includes('הבנק')));
});

test('a word-less supplier quote exempts only lines that are exactly that blank', () => {
  const text = ['לכבוד', '_______________', 'תוקף עד _______________ ימים'].join('\n');
  const spots = findFillSpots(text, ['_______________']);
  assert.equal(spots.length, 1, 'the manager line with the same blank is still a spot');
  assert.ok(spots[0].line.startsWith('תוקף'));
  const v = validateProposals(text, [], ['_______________', '_______']);
  assert.deepEqual(v.supplierFill, ['_______________'], 'full blank line accepted');
  assert.ok(v.dropped.some((d) => d.reason === 'supplier_quote_too_generic'), 'partial blank rejected');
  // a tab-separated signature row, sent whitespace-collapsed by the UI, still matches
  const row = 'חתימה\t\t____\t____';
  assert.deepEqual(validateProposals(row, [], ['חתימה ____ ____']).supplierFill, ['חתימה ____ ____']);
  assert.equal(findFillSpots(row, ['חתימה ____ ____']).length, 0);
});

test('templateFieldsStatus: needs conversion until fields exist and no spots remain', () => {
  assert.equal(templateFieldsStatus(DOC).status, 'needs_conversion');
  assert.equal(templateFieldsStatus('גוף מזמין: {{org}}').status, 'ready');
  assert.equal(templateFieldsStatus('ללא שדות כלל').status, 'needs_conversion', 'no fields at all');
  assert.equal(templateFieldsStatus('{{org}} ____').status, 'needs_conversion');
  assert.equal(templateFieldsStatus('{{org}}\nחתימה ____', ['חתימה']).status, 'ready');
});

const proposal = [
  {
    key: 'tender_number',
    labelHe: 'מספר הבל"ם',
    type: 'text' as const,
    required: true,
    occurrences: [{ quote: 'בל"ם מס\' XXXX', replace: 'XXXX' }],
  },
  {
    key: 'subject',
    labelHe: 'נושא הרכש',
    type: 'text' as const,
    required: true,
    occurrences: [
      { quote: 'להצעת מחיר לXXXX', replace: 'XXXX' },
      { quote: 'הצעת מחיר ל -XXXX', replace: 'XXXX' },
    ],
  },
];

test('validateProposals keeps grounded proposals and drops the rest', () => {
  const v = validateProposals(
    DOC,
    [
      ...proposal,
      { key: 'Bad Key', labelHe: 'x', type: 'text', required: true, occurrences: [{ quote: 'XX', replace: 'XX' }] },
      { key: 'ghost', labelHe: 'x', type: 'text', required: true, occurrences: [{ quote: 'לא קיים במסמך XXXX', replace: 'XXXX' }] },
      { key: 'multi', labelHe: 'x', type: 'text', required: true, occurrences: [{ quote: 'XX\nXX', replace: 'XX' }] },
      { key: 'twice', labelHe: 'x', type: 'text', required: true, occurrences: [{ quote: 'לXXXX', replace: 'X' }] },
      { key: 'budget', labelHe: 'אומדן', type: 'number', required: true, occurrences: [{ quote: 'אומדן ההתקשרות: XXXX', replace: 'XXXX' }] },
    ],
    ['שם הבנק/חברת הביטוח ________', 'לא במסמך', '________'], // '________' isn't a whole line → too generic
  );
  assert.deepEqual(v.fields.map((f) => f.key), ['tender_number', 'subject', 'budget']);
  const budget = v.fields.find((f) => f.key === 'budget')!;
  assert.equal(budget.internal, true, 'estimate forced internal');
  assert.equal(budget.required, false);
  assert.equal(budget.occurrences.length, 0, 'estimate never written into the document (G6)');
  assert.deepEqual(v.supplierFill, ['שם הבנק/חברת הביטוח ________']);
  const reasons = v.dropped.map((d) => d.reason);
  for (const r of ['bad_key', 'quote_not_in_doc', 'quote_multiline', 'replace_not_once_in_quote', 'confidential_not_in_doc', 'supplier_quote_not_in_doc', 'supplier_quote_too_generic']) {
    assert.ok(reasons.includes(r), r);
  }
});

test('applyToText writes {{fields}} exactly as the Docs batch would, longest quote first', () => {
  const v = validateProposals(DOC, proposal, []);
  const out = applyToText(DOC, v.fields);
  assert.ok(out.includes('הנדון: בל"ם מס\' {{tender_number}} בקשה להצעת מחיר ל{{subject}}'));
  assert.ok(out.includes('הצעת מחיר ל -{{subject}} בהתאם'));
  const reqs = replaceRequests(v.fields);
  assert.equal(reqs.length, 3);
  assert.ok(reqs[0].replaceAllText.containsText.text.length >= reqs[2].replaceAllText.containsText.text.length);
  assert.deepEqual(detectPlaceholders(out).map((p) => p.key), ['tender_number', 'subject']);
});

test('remainingSpots drives the agent loop: what the proposals still leave', () => {
  const v = validateProposals(DOC, proposal, ['שם הבנק/חברת הביטוח ________']);
  const left = remainingSpots(DOC, v.fields, v.supplierFill);
  assert.deepEqual(left.map((s) => s.marker).sort(), ['XX', 'XXX', 'XXXX', '________________'].sort());
  // a later round covers more
  const round2 = validateProposals(DOC, [{ key: 'section_ref', labelHe: 'הפניה לסעיף', type: 'text', required: true, occurrences: [{ quote: 'כמפורט בסעיף XXX', replace: 'XXX' }] }], []);
  const merged = mergeFields(v.fields, round2.fields);
  assert.equal(remainingSpots(DOC, merged, v.supplierFill).length, 3);
});

test('sync keeps approved labels and types for converted fields', () => {
  const v = validateProposals(DOC, proposal, []);
  const text = applyToText(DOC, v.fields);
  const params = mergeSyncedParams(detectPlaceholders(text), fieldsAsParams(v.fields));
  assert.equal(params.find((p) => p.key === 'tender_number')!.labelHe, 'מספר הבל"ם');
  // a later plain re-sync must not reset them
  const resynced = mergeSyncedParams(detectPlaceholders(text), params);
  assert.equal(resynced.find((p) => p.key === 'subject')!.labelHe, 'נושא הרכש');
});

test('two fields in one sentence are written by a single replacement', () => {
  const text = "29. נציגת המזמין הינה נעמה, מס' טלפון: 077-4305464.";
  const quote = "הינה נעמה, מס' טלפון: 077-4305464";
  const v = validateProposals(
    text,
    [
      { key: 'contact_name', labelHe: 'שם', type: 'text', required: true, occurrences: [{ quote, replace: 'נעמה' }] },
      { key: 'contact_phone', labelHe: 'טלפון', type: 'text', required: true, occurrences: [{ quote, replace: '077-4305464' }] },
    ],
    [],
  );
  const reqs = replaceRequests(v.fields);
  assert.equal(reqs.length, 1, 'one request for the shared quote');
  assert.equal(reqs[0].replaceAllText.replaceText, "הינה {{contact_name}}, מס' טלפון: {{contact_phone}}");
  assert.equal(applyToText(text, v.fields), "29. נציגת המזמין הינה {{contact_name}}, מס' טלפון: {{contact_phone}}.");
});
