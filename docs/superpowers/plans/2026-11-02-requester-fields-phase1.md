# Requester fields on phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The requester answers 11 extra questions when opening a request (phase 1); procurement sees them in phase 2, the AI draft receives them, and matching tender fields are pre-filled.

**Architecture:** One list of fields in `shared` (`REQUESTER_FIELDS`) drives the phase 1 form, the server validation and the phase 2 behavior. Answers are stored in a `details` map on `bidRequests/{serial}`. `draftBid` loads the request and appends the non-internal answers to the brief; `createTender` fills blank template fields from them. The annual budget is internal and never leaves the request document.

**Tech Stack:** TypeScript, zod (`shared`), Firebase Cloud Functions v2 (`functions`), React + Vite + react-i18next (`web`), `node --test` for tests.

**Spec:** `docs/superpowers/specs/2026-11-02-requester-fields-phase1-design.md`

## Global Constraints

- Labels are the spreadsheet's Hebrew wording, verbatim (see the table in Task 1). Row 16 is "כמות נותני השירות".
- All 11 questions are optional. Defaults only for `work_days` ("ימים א' עד ה'") and `work_hours` ("משרה מלאה - 170 שעות"), editable.
- `annual_budget` is confidential (GLOBAL_RULES G6): never in the AI draft prompt, the stored draft/provenance brief, the tender `params`, or any supplier-visible record. It is not copied into `estimate`.
- No new dependencies. Tests run without network (no real AI calls).
- Commits follow Conventional Commits and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push to `main`; never force-push; never merge an MR (a human does).
- Work on branch `feat/requester-fields-phase1`, created from `spec/requester-fields-phase1`.
- **Before Task 1:** the working tree holds unrelated uncommitted changes (`functions/src/services/{aiService,feedbackService,supervisorService,templateConverter}.ts`, `web/src/pages/TenderCreate.tsx`, `README.md`). `TenderCreate.tsx` is also edited in Task 4. Commit the first five on their own branch (`fix/bedrock-tool-choice-and-draft-form`) or stash them first; leave `README.md` alone (it is the user's).

## Review Focus

1. A `details` object with a key that is not in `REQUESTER_FIELDS` (e.g. `"estimate"`, `"__proto__"`) must be rejected, not stored. (Task 1 test)
2. A requester answer containing `{{…}}` must be rejected: it would be pasted into the document and trip the supervisor's placeholder check. (Task 1 test)
3. The budget must not appear in the brief sent to the model, even when the template also has an `annual_budget` field. (Tasks 1 and 2 tests)
4. A request created before this change (no `details`) must still draft and convert. (Tasks 1 and 2 tests)
5. A value the manager typed must win over the requester's answer; a whitespace-only manager value counts as blank. (Task 1 test)

---

### Task 1: Shared field list, schema and pure helpers

**Files:**
- Create: `shared/src/requesterFields.ts`
- Modify: `shared/src/index.ts` (add export), `shared/src/schemas.ts:235-261` (3 schema changes)
- Test: `functions/src/test/requesterFields.test.ts`

**Interfaces:**
- Produces (all exported from `@obms/shared`):
  - `interface RequesterField { key: string; labelHe: string; type: 'text' | 'textarea' | 'number'; default?: string; internal?: boolean }`
  - `const REQUESTER_FIELDS: readonly RequesterField[]`
  - `type RequesterDetails = Record<string, string | number>`
  - `const requesterDetailsSchema` (zod, strict, every key optional)
  - `publicDetails(details?: RequesterDetails | null): RequesterDetails`
  - `briefWithDetails(brief: string, details?: RequesterDetails | null): string`
  - `fillFromRequestDetails(params: readonly { key: string }[], values: Record<string, string | number>, details?: RequesterDetails | null): Record<string, string | number>`
  - `normalizeDetailsInput(raw: Record<string, string>): { details: RequesterDetails; badNumbers: string[] }`
  - `createBidRequestInput` gains `details?`; `bidRequestDocSchema` gains `details?`; `draftBidInput` gains `bidRequestId?`.

- [ ] **Step 1: Write the failing test**

Create `functions/src/test/requesterFields.test.ts`:

```ts
// Unit tests for the phase 1 requester fields (no network):  node --test functions/lib/test/requesterFields.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUESTER_FIELDS,
  requesterDetailsSchema,
  createBidRequestInput,
  draftBidInput,
  publicDetails,
  briefWithDetails,
  fillFromRequestDetails,
  normalizeDetailsInput,
} from '@obms/shared';

test('the field list: 11 unique keys, only the budget is internal, two defaults', () => {
  const keys = REQUESTER_FIELDS.map((f) => f.key);
  assert.equal(keys.length, 11);
  assert.equal(new Set(keys).size, 11);
  assert.deepEqual(REQUESTER_FIELDS.filter((f) => f.internal).map((f) => f.key), ['annual_budget']);
  const defaults = Object.fromEntries(REQUESTER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default]));
  assert.deepEqual(defaults, { work_days: "ימים א' עד ה'", work_hours: 'משרה מלאה - 170 שעות' });
  assert.equal(REQUESTER_FIELDS.find((f) => f.key === 'service_providers_total')?.labelHe, 'כמות נותני השירות');
});

test('details schema accepts valid answers and an empty object', () => {
  assert.ok(requesterDetailsSchema.safeParse({}).success);
  assert.ok(
    requesterDetailsSchema.safeParse({ service_location: 'תל אביב', service_providers_total: 5, annual_budget: 900000 })
      .success,
  );
});

test('details schema rejects unknown keys, bad numbers, empty and over-long text, and {{placeholders}}', () => {
  const bad = (d: unknown) => assert.equal(requesterDetailsSchema.safeParse(d).success, false, JSON.stringify(d));
  bad({ estimate: 5 });
  bad({ __proto__: { x: 1 }, estimate: 1 });
  bad({ service_providers_total: -1 });
  bad({ service_providers_total: 0 });
  bad({ service_providers_total: '5' });
  bad({ annual_budget: Number.NaN });
  bad({ service_location: '' });
  bad({ service_location: 'x'.repeat(201) });
  bad({ provider_responsibilities: 'x'.repeat(1001) });
  bad({ service_location: 'תל אביב {{MAP_TARGET}}' });
});

test('createBidRequestInput and draftBidInput take the new optional fields', () => {
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה' }).success);
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה', details: { work_days: 'א-ה' } }).success);
  assert.equal(createBidRequestInput.safeParse({ brief: 'שירותי תמיכה', details: { nope: 'x' } }).success, false);
  const base = { type: 'service', brief: 'שירותי תמיכה' };
  assert.ok(draftBidInput.safeParse(base).success);
  assert.ok(draftBidInput.safeParse({ ...base, bidRequestId: '2026-31' }).success);
  assert.equal(draftBidInput.safeParse({ ...base, bidRequestId: 'BID-1' }).success, false);
});

test('publicDetails drops the budget, unknown keys and blanks; tolerates a request with no details', () => {
  assert.deepEqual(publicDetails(undefined), {});
  assert.deepEqual(publicDetails(null), {});
  assert.deepEqual(
    publicDetails({ annual_budget: 900000, service_location: 'חיפה', other: 'x', work_days: '  ' }),
    { service_location: 'חיפה' },
  );
});

test('briefWithDetails appends labelled answers in table order and never the budget', () => {
  const out = briefWithDetails('שירותי תמיכה', {
    work_hours: 'משרה מלאה - 170 שעות',
    annual_budget: 900000,
    service_location: 'חיפה',
  });
  assert.ok(out.startsWith('שירותי תמיכה\n\nפרטים מהדורש:\n'));
  assert.ok(out.indexOf('מקום אספקת השירות: חיפה') < out.indexOf('מס\' שעות עבודה: משרה מלאה - 170 שעות'));
  assert.ok(!out.includes('900000'));
  assert.ok(!out.includes('אומדן'));
});

test('briefWithDetails leaves the brief alone when there is nothing to add', () => {
  assert.equal(briefWithDetails('שירותי תמיכה', undefined), 'שירותי תמיכה');
  assert.equal(briefWithDetails('שירותי תמיכה', { annual_budget: 5 }), 'שירותי תמיכה');
});

test('fillFromRequestDetails fills blank fields, the manager wins, whitespace counts as blank', () => {
  const params = [{ key: 'service_providers_total' }, { key: 'service_location' }, { key: 'work_days' }, { key: 'annual_budget' }];
  const out = fillFromRequestDetails(
    params,
    { service_providers_total: 7, service_location: '   ' },
    { service_providers_total: 5, service_location: 'חיפה', work_days: 'א-ה', annual_budget: 900000 },
  );
  assert.equal(out.service_providers_total, 7); // the manager's value wins
  assert.equal(out.service_location, 'חיפה'); // blank → filled
  assert.equal(out.work_days, 'א-ה'); // absent → filled
  assert.ok(!('annual_budget' in out)); // never, even if the template has such a field
});

test('fillFromRequestDetails ignores answers the template has no field for, and missing details', () => {
  assert.deepEqual(fillFromRequestDetails([{ key: 'a' }], { a: 1 }, { work_days: 'x' }), { a: 1 });
  assert.deepEqual(fillFromRequestDetails([{ key: 'work_days' }], {}, undefined), {});
});

test('normalizeDetailsInput trims, drops blanks, converts numbers and reports bad ones', () => {
  const r = normalizeDetailsInput({
    service_location: '  חיפה ',
    team_lead_role: '   ',
    service_providers_total: '5',
    annual_budget: 'abc',
  });
  assert.deepEqual(r.details, { service_location: 'חיפה', service_providers_total: 5 });
  assert.deepEqual(r.badNumbers, ['annual_budget']);
  assert.deepEqual(normalizeDetailsInput({ annual_budget: '-3' }).badNumbers, ['annual_budget']);
  assert.deepEqual(normalizeDetailsInput({ annual_budget: '0' }).badNumbers, ['annual_budget']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (repo root): `npm run build:shared && npm run build:functions`
Expected: FAIL — TypeScript errors, `REQUESTER_FIELDS` (and the other names) are not exported from `@obms/shared`.

- [ ] **Step 3: Write the implementation**

Create `shared/src/requesterFields.ts`:

```ts
// Phase 1 (the requester) asks these questions besides the brief. One list drives the request form,
// the server-side validation and what procurement sees in phase 2. No template is involved.
import { z } from 'zod';

export interface RequesterField {
  key: string;
  labelHe: string;
  type: 'text' | 'textarea' | 'number';
  default?: string; // pre-filled on the form, editable
  internal?: boolean; // confidential (G6): stays on the request, never reaches the AI draft or the tender
}

export const REQUESTER_TEXT_MAX = 200;
export const REQUESTER_TEXTAREA_MAX = 1000;

// Order and wording follow the procurement spreadsheet ("add to the requester as follow-up questions").
export const REQUESTER_FIELDS: readonly RequesterField[] = [
  { key: 'service_location', labelHe: 'מקום אספקת השירות', type: 'text' },
  { key: 'provider_responsibilities', labelHe: 'תחומי אחריות נותני השירות', type: 'textarea' },
  { key: 'team_lead_role', labelHe: 'תפקיד ראש הצוות', type: 'textarea' },
  { key: 'service_providers_total', labelHe: 'כמות נותני השירות', type: 'number' },
  { key: 'supplier_equipment', labelHe: 'ציוד שהספק מספק לנותני השירות', type: 'textarea' },
  { key: 'work_days', labelHe: "מס' ימי עבודה", type: 'text', default: "ימים א' עד ה'" },
  { key: 'work_hours', labelHe: "מס' שעות עבודה", type: 'text', default: 'משרה מלאה - 170 שעות' },
  { key: 'excellence_bonus_month', labelHe: 'חודש תשלום מענק מצוינות', type: 'text' },
  { key: 'excellence_criteria_place', labelHe: 'מקום פרסום אמות מידה למענק מצוינות', type: 'text' },
  { key: 'medical_approval_type', labelHe: 'סוג האישור הרפואי הנדרש', type: 'text' },
  {
    key: 'annual_budget',
    labelHe: 'מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות?',
    type: 'number',
    internal: true,
  },
];

export type RequesterDetails = Record<string, string | number>;

const byKey = new Map(REQUESTER_FIELDS.map((f) => [f.key, f]));

function valueSchema(f: RequesterField) {
  if (f.type === 'number') return z.number().finite().positive();
  // A {{…}} would be pasted into the document as an unfilled placeholder.
  return z
    .string()
    .trim()
    .min(1)
    .max(f.type === 'textarea' ? REQUESTER_TEXTAREA_MAX : REQUESTER_TEXT_MAX)
    .refine((s) => !s.includes('{{'), 'placeholder text is not allowed');
}

/** The answers on a request: known keys only, every one optional. */
export const requesterDetailsSchema = z
  .object(Object.fromEntries(REQUESTER_FIELDS.map((f) => [f.key, valueSchema(f).optional()])))
  .strict();

const isBlank = (v: unknown) => String(v ?? '').trim() === '';

/** The answers procurement and the AI draft may see: known, non-internal and not blank. */
export function publicDetails(details?: RequesterDetails | null): RequesterDetails {
  return Object.fromEntries(
    Object.entries(details ?? {}).filter(([k, v]) => byKey.has(k) && !byKey.get(k)?.internal && !isBlank(v)),
  );
}

/** The brief with the requester's answers appended (what the model and the supervisor both read). */
export function briefWithDetails(brief: string, details?: RequesterDetails | null): string {
  const pub = publicDetails(details);
  const lines = REQUESTER_FIELDS.filter((f) => pub[f.key] !== undefined).map((f) => `${f.labelHe}: ${pub[f.key]}`);
  return lines.length ? `${brief}\n\nפרטים מהדורש:\n${lines.join('\n')}` : brief;
}

/** Fill the template fields the manager left blank from the requester's answers (the manager's value wins). */
export function fillFromRequestDetails(
  params: readonly { key: string }[],
  values: Record<string, string | number>,
  details?: RequesterDetails | null,
): Record<string, string | number> {
  const out = { ...values };
  const pub = publicDetails(details);
  for (const p of params) {
    const v = pub[p.key];
    if (v !== undefined && isBlank(out[p.key])) out[p.key] = v;
  }
  return out;
}

/** The request form's text boxes → the payload: blanks dropped, numbers converted, bad numbers reported. */
export function normalizeDetailsInput(raw: Record<string, string>): { details: RequesterDetails; badNumbers: string[] } {
  const details: RequesterDetails = {};
  const badNumbers: string[] = [];
  for (const f of REQUESTER_FIELDS) {
    const s = (raw[f.key] ?? '').trim();
    if (!s) continue;
    if (f.type === 'number') {
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) details[f.key] = n;
      else badNumbers.push(f.key);
    } else {
      details[f.key] = s;
    }
  }
  return { details, badNumbers };
}
```

Modify `shared/src/index.ts` — add after the `serviceFields` line:

```ts
export * from './requesterFields.js';
```

Modify `shared/src/schemas.ts`. Add at the top with the other imports:

```ts
import { requesterDetailsSchema } from './requesterFields.js';
```

In `bidRequestDocSchema`, after `brief: z.string(),` add:

```ts
  details: requesterDetailsSchema.optional(), // the requester's phase 1 answers (older requests have none)
```

In `createBidRequestInput`, after the `brief` line add:

```ts
  details: requesterDetailsSchema.optional(), // the requester's answers to the phase 1 questions
```

In `draftBidInput`, after the `brief` line add:

```ts
  bidRequestId: z.string().regex(/^\d{4}-\d{1,3}$/).optional(), // its requester answers are added to the brief
```

- [ ] **Step 4: Run the test to verify it passes**

Run (repo root): `npm run build:shared && npm run build:functions && node --test functions/lib/test/requesterFields.test.js`
Expected: 10 tests PASS. Also run `node --test functions/lib/test/bidNumber.test.js` — PASS (the schemas it imports still work).

- [ ] **Step 5: Commit**

```bash
git switch -c feat/requester-fields-phase1
git add shared/src/requesterFields.ts shared/src/index.ts shared/src/schemas.ts functions/src/test/requesterFields.test.ts
git commit -m "feat(shared): requester phase 1 fields, schema and helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — store the answers, feed the draft, pre-fill the tender

**Files:**
- Modify: `functions/src/index.ts` (import list near line 50; `createBidRequest` ~line 358; `draftBid` ~line 1062; `createTender` ~lines 426-462 and 509)

**Interfaces:**
- Consumes: from `@obms/shared` (Task 1): `briefWithDetails`, `fillFromRequestDetails`; `createBidRequestInput.details`, `draftBidInput.bidRequestId`; `BidRequestDoc.details`.
- Produces: `bidRequests/{serial}.details` stored by `createBidRequest`; the draft record's `brief` is the brief with the answers; tender `params` pre-filled from the answers.

- [ ] **Step 1: Wire the three callables**

In `functions/src/index.ts`, add `briefWithDetails,` and `fillFromRequestDetails,` to the existing `@obms/shared` import list (the one containing `isAutoSerialParam`).

`createBidRequest` — in the object passed to `bidRequestsRepo.tryCreate`, after `brief: input.brief,` add:

```ts
        details: input.details,
```

(`tryCreate` already runs `stripUndefined`, so a request without answers stores nothing extra.)

`draftBid` — replace

```ts
    const skills = requiredSkillsFor(input.type);
    const draft = await draftBidContent(input.type, input.brief, template, skills);
```

with

```ts
    const skills = requiredSkillsFor(input.type);
    // The requester's phase 1 answers (never the internal budget) ride along with the brief.
    const bidReq = input.bidRequestId ? await bidRequestsRepo.get(input.bidRequestId) : null;
    if (input.bidRequestId && !bidReq) throw new HttpsError('not-found', 'הבקשה לא נמצאה.');
    const brief = briefWithDetails(input.brief, bidReq?.details);
    const draft = await draftBidContent(input.type, brief, template, skills);
```

and in the same function, in the object given to `bidDraftsRepo.save`, change `brief: input.brief,` to `brief,`. Use Grep for `input.brief` inside `draftBid` to make sure no other use remains (the stored brief is what the supervisor later reads, so it must include the answers).

`createTender` — after the existing

```ts
  if (bidReq.status !== 'open') throw new HttpsError('failed-precondition', 'הבקשה כבר הומרה למכרז.');
```

add:

```ts
  // What the requester already answered in phase 1 fills the matching fields the manager left blank.
  const askedWithDetails = fillFromRequestDetails(template.params, asked, bidReq.details);
```

change `resolveSystemFills(template.params, asked, {` to `resolveSystemFills(template.params, askedWithDetails, {` (Grep `asked` in `createTender` to be sure that is its only other use), and change

```ts
    brief: draft?.brief ?? bidReq.brief,
```

to

```ts
    brief: draft?.brief ?? briefWithDetails(bidReq.brief, bidReq.details),
```

- [ ] **Step 2: Build and run the unit tests**

Run (repo root): `npm run build:shared && npm run build:functions && node --test functions/lib/test/requesterFields.test.js functions/lib/test/bidNumber.test.js functions/lib/test/skills.test.js`
Expected: build succeeds, all PASS.

- [ ] **Step 3: Verify against the emulator**

Start the emulators and seed (RUNNING.md; use `FUNCTIONS_DISCOVERY_TIMEOUT=60 npx firebase emulators:start`, then `npm run seed`). The draft does not need a model key here: a failed draft still stores its brief. Then:

```bash
login() { curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"password\",\"returnSecureToken\":true}" | python -c "import sys,json;print(json.load(sys.stdin)['idToken'])"; }
F=http://127.0.0.1:5001/biding-system/europe-west1
RT=$(login requester@obms.test); MT=$(login manager@obms.test)
# 1. a request with answers (including the budget) is accepted
curl -s -X POST $F/createBidRequest -H "Content-Type: application/json" -H "Authorization: Bearer $RT" \
  -d '{"data":{"brief":"שירותי תמיכה","details":{"service_providers_total":5,"annual_budget":900000,"work_hours":"משרה מלאה - 170 שעות"}}}'
# expect {"result":{"serial":"2026-N", ...}}  — note the serial
# 2. an unknown key is refused
curl -s -X POST $F/createBidRequest -H "Content-Type: application/json" -H "Authorization: Bearer $RT" \
  -d '{"data":{"brief":"שירותי תמיכה","details":{"estimate":1}}}'
# expect an invalid-argument error
# 3. the draft stores the brief WITH the answers and WITHOUT the budget (replace 2026-N)
curl -s -X POST $F/draftBid -H "Content-Type: application/json" -H "Authorization: Bearer $MT" \
  -d '{"data":{"type":"service","brief":"שירותי תמיכה","bidRequestId":"2026-N"}}' > /dev/null
curl -s -H "Authorization: Bearer owner" "http://127.0.0.1:8080/v1/projects/biding-system/databases/(default)/documents/bidDrafts" | grep -o 'כמות נותני השירות: 5' | head -1
curl -s -H "Authorization: Bearer owner" "http://127.0.0.1:8080/v1/projects/biding-system/databases/(default)/documents/bidDrafts" | grep -c 900000
```
Expected: step 1 returns a serial; step 2 an error; the first grep prints `כמות נותני השירות: 5`; the second prints `0`.

- [ ] **Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(functions): store requester answers, feed the draft, pre-fill the tender" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phase 1 form (the requester)

**Files:**
- Modify: `web/src/pages/RequestCreate.tsx`, `web/src/i18n/he.json`

**Interfaces:**
- Consumes: `REQUESTER_FIELDS`, `normalizeDetailsInput` (Task 1); `api.createBidRequest` already accepts `CreateBidRequestInput`, which now has `details`.

- [ ] **Step 1: Add the Hebrew strings**

In `web/src/i18n/he.json`, after the `"req.briefTooShort"` line add:

```json
  "req.detailsTitle": "פרטים נוספים",
  "req.detailsHint": "לא חובה. ככל שתמלא יותר, איש הרכש יצטרך לשאול פחות.",
  "req.badNumber": "הערך בשדה \"{{field}}\" חייב להיות מספר חיובי.",
```

- [ ] **Step 2: Replace `web/src/pages/RequestCreate.tsx`**

```tsx
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH, REQUESTER_FIELDS, REQUESTER_TEXTAREA_MAX, REQUESTER_TEXT_MAX, normalizeDetailsInput } from '@obms/shared';
import { api } from '../lib/api';

// Defaults (work days / hours) start filled in; the requester can change them.
const initialDetails = (): Record<string, string> =>
  Object.fromEntries(REQUESTER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default as string]));

// Phase 1 (the requester): the tender brief and a few follow-up questions. The system answers with the bid number.
export default function RequestCreate() {
  const { t } = useTranslation();
  const [brief, setBrief] = useState('');
  const [details, setDetails] = useState<Record<string, string>>(initialDetails);
  const [serial, setSerial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One id per form: a retried submit returns the request already opened instead of a second one.
  const requestId = useRef(crypto.randomUUID());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (brief.trim().length < 3) {
      setError(t('req.briefTooShort'));
      return;
    }
    const { details: answers, badNumbers } = normalizeDetailsInput(details);
    if (badNumbers.length) {
      const field = REQUESTER_FIELDS.find((f) => f.key === badNumbers[0])?.labelHe ?? badNumbers[0];
      setError(t('req.badNumber', { field }));
      document.getElementById(`detail-${badNumbers[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.createBidRequest({
        brief,
        requestId: requestId.current,
        ...(Object.keys(answers).length ? { details: answers } : {}),
      });
      setSerial(r.serial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBrief('');
    setDetails(initialDetails());
    setSerial(null);
    requestId.current = crypto.randomUUID();
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-2xl font-bold">{t('req.phase1Title')}</h1>
      <p className="mb-6 text-sm text-tx-soft">{t('req.phase1Hint')}</p>
      {serial ? (
        <div className="card space-y-3 p-6">
          <div className="text-lg font-semibold">{t('req.created', { serial })}</div>
          <p className="text-sm text-tx-soft">{t('req.createdHint')}</p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={reset}>
              {t('req.another')}
            </button>
            <Link to="/" className="btn btn-gold">
              {t('nav.dashboard')}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label">
              {t('create.brief')}
              <span className="text-red-600"> *</span>
            </label>
            <textarea
              className="input min-h-32"
              maxLength={BRIEF_MAX_LENGTH}
              placeholder={t('create.briefPlaceholder')}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              required
            />
          </div>

          <div className="border-t pt-4">
            <h2 className="font-semibold">{t('req.detailsTitle')}</h2>
            <p className="mb-3 text-sm text-tx-soft">{t('req.detailsHint')}</p>
            <div className="space-y-4">
              {REQUESTER_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="label" htmlFor={`detail-${f.key}`}>
                    {f.labelHe}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      id={`detail-${f.key}`}
                      className="input min-h-20"
                      maxLength={REQUESTER_TEXTAREA_MAX}
                      value={details[f.key] ?? ''}
                      onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      id={`detail-${f.key}`}
                      className="input"
                      type={f.type === 'number' ? 'number' : 'text'}
                      {...(f.type === 'number' ? { min: 0, step: 'any' } : { maxLength: REQUESTER_TEXT_MAX })}
                      value={details[f.key] ?? ''}
                      onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          <button className="btn btn-gold" disabled={busy}>
            {busy ? t('req.creating') : t('req.submit')}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p web`
Expected: no output (clean).

- [ ] **Step 4: Verify in the browser**

With the emulators and `npm run dev:web` running: sign in as `requester@obms.test` / `password`, open "בקשה חדשה". Expect the 11 questions under the brief, in the table's order; "מס' ימי עבודה" and "מס' שעות עבודה" pre-filled; the number fields reject `abc`/`-3` with the Hebrew message. Submit with only a brief and with several answers: both create a request (bid number shown). In the emulator UI (`localhost:4000`, Firestore), the request holds `details` with only the filled fields plus the two defaults.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/RequestCreate.tsx web/src/i18n/he.json
git commit -m "feat(web): requester follow-up questions on the phase 1 request form" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Phase 2 (procurement) — show and pre-fill the answers

**Files:**
- Create: `web/src/components/RequesterDetails.tsx`
- Modify: `web/src/pages/TenderCreate.tsx` (the `runDraft` function and the area where the brief is shown), `web/src/i18n/he.json`

**Interfaces:**
- Consumes: `REQUESTER_FIELDS`, `publicDetails` (Task 1); `BidRequestDoc.details`; `api.draftBid` input now accepts `bidRequestId`.
- Produces: `RequesterDetails` component, props `{ details?: Record<string, string | number> }`.

- [ ] **Step 1: Add the Hebrew strings**

In `web/src/i18n/he.json`, after the strings added in Task 3 add:

```json
  "create.requesterDetails": "פרטים מהדורש",
  "create.internalOnly": "פנימי — לא יפורסם",
```

- [ ] **Step 2: Create `web/src/components/RequesterDetails.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { REQUESTER_FIELDS, type RequesterDetails as Details } from '@obms/shared';

// The requester's phase 1 answers, read-only, for the procurement manager. The internal budget is shown
// here too (the manager may see it) but labelled — it never goes to the AI draft or the document.
export default function RequesterDetails({ details }: { details?: Details }) {
  const { t } = useTranslation();
  const rows = REQUESTER_FIELDS.filter((f) => String(details?.[f.key] ?? '').trim() !== '');
  if (!rows.length) return null;
  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-semibold">{t('create.requesterDetails')}</h2>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-tx-soft">
              {f.labelHe}
              {f.internal && <span className="text-red-600"> ({t('create.internalOnly')})</span>}
            </dt>
            <dd>{String(details?.[f.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 3: Use it in `web/src/pages/TenderCreate.tsx`**

Add the imports: `import RequesterDetails from '../components/RequesterDetails';` and add `publicDetails` to the `@obms/shared` import list.

Pass the request to the draft: change

```ts
      const d = await api.draftBid({ type: forType, brief });
```

to

```ts
      const d = await api.draftBid({ type: forType, brief, bidRequestId: serial });
```

(`serial` comes from `useParams()` at the top of the component; the early `return` guard `brief.trim().length < 3` already ensures the request is loaded.)

Pre-fill blank fields from the requester's answers: inside the `setParams((prev) => ({ ... }))` call in `runDraft`, wrap the draft part so the answers fill the gaps. The updater becomes:

```ts
      setParams((prev) => {
        const fromDraft = Object.fromEntries(
          Object.entries(d.params ?? {}).map(([k, v]) => [k, hasPlaceholder(v) ? '' : String(v)]),
        );
        // The requester's answers fill what the draft left empty (never the internal budget).
        for (const [k, v] of Object.entries(publicDetails(request?.details))) {
          if (!String(fromDraft[k] ?? '').trim()) fromDraft[k] = String(v);
        }
        return {
          ...fromDraft,
          ...Object.fromEntries([...mine].filter((k) => k in prev).map((k) => [k, prev[k]])),
        };
      });
```

(`mine` is the `edited.current` set already defined just above in `runDraft`. Keys that are not form fields are harmless: the server drops unknown keys.)

Show the panel read-only where the brief is shown at the top of the form: find the JSX that renders `{brief}` (Grep `{brief}` in the file) and add directly after that block:

```tsx
      <RequesterDetails details={request?.details} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p web`
Expected: no output.

- [ ] **Step 5: Verify end to end in the browser**

As `requester@obms.test` open a request with a brief and answers (e.g. כמות נותני השירות = 5, the budget = 900000). Sign in as `manager@obms.test`, open the pending request. Expect: the "פרטים מהדורש" panel lists the answers, the budget marked "(פנימי — לא יפורסם)". Pick the services type: the "סך נותני השירות" field shows 5 even if the draft failed or left it empty; typing a different number during drafting keeps the typed number. Create the tender; open its document and the supplier-visible data in the emulator UI: the budget appears nowhere on the tender or its document, and `service_providers_total` carries 5.

- [ ] **Step 6: Final checks and commit**

Run: `npm run build:shared && npm run build:functions && node --test functions/lib/test/requesterFields.test.js functions/lib/test/bidNumber.test.js functions/lib/test/skills.test.js functions/lib/test/supervisor.test.js && npx tsc --noEmit -p web`
Expected: all PASS, no type errors. (The emulator-based `rules.test.js` has one failure that exists on `main` — the chat rules test — and is not caused by this change; `firestore.rules` is unchanged.)

```bash
git add web/src/components/RequesterDetails.tsx web/src/pages/TenderCreate.tsx web/src/i18n/he.json
git commit -m "feat(web): show the requester's answers to procurement and pre-fill the form" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
