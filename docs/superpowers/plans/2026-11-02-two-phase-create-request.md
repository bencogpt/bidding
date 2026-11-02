# Two-phase tender creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A requester opens a request with only תקציר המכרז and gets a bid number `[year]-[n]`; procurement (the tender manager) opens the request, picks סוג המכרז, the LLM drafts, and the tender is created under that bid number.

**Architecture:** A new function-owned Firestore collection `bidRequests/{serial}` (doc id = bid number = uniqueness lock). `createBidRequest` allocates the number with a pure, dependency-injected allocator. `createTender` takes `bidRequestId` and converts the request to a tender in one transaction (serial and brief come from the request). The web gets a phase-1 page, a "pending requests" list, and the existing create page becomes phase 2.

**Tech Stack:** TypeScript, Firebase Functions v2 (callable), Firestore + rules, Zod (`@obms/shared`), React + Vite + react-i18next, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-02-two-phase-create-request-design.md`

## Global Constraints

- Bid number format: `` `${year}-${n}` ``, n integer 1..999, **no leading zeros** (031 → `2026-31`); year is the **Israel-time** year.
- Phase 1 field: only תקציר המכרז, required, trimmed length ≥ 3 and ≤ `BRIEF_MAX_LENGTH`.
- Roles: `createBidRequest` = `requester` or `tender_manager`; `createTender`, `draftBid` stay `tender_manager` only.
- Screen titles (exact): `שלב 1 — פתיחת בקשה (הדורש)` and `שלב 2 — השלמת הבל"מ (איש רכש)`.
- `bidRequests` is function-write-only (`allow write: if false`); requester reads only own requests, managers read all.
- Existing cases keep their `BID-YYYY-NNNN` serials; `formatSerial`, `backfillSerials` and the old counter stay.
- All UI strings in Hebrew via `web/src/i18n/he.json`; JSON-escape `"` in `בל\"מ`.
- Never push to `main`; work on branch `spec/two-phase-create-request` (or a feature branch cut from it), merge only via PR.
- Tests that need no network run with: `npm run build:shared && npm run build:functions && node --test $(ls functions/lib/test/*.test.js | grep -v rules)` (rules tests need the Firestore emulator).

## Review Focus

- Year rollover: a request created 2026-12-31 22:30 UTC is already 2027 in Israel → number must start `2027-`.
- Collisions and a full year: all 999 numbers taken → clear Hebrew `resource-exhausted`, never an infinite loop.
- Double conversion: the same request converted twice (or two managers at once) → exactly one tender; the second gets `failed-precondition`.
- A requester must not read another requester's request, and must not be able to call `createTender`/`draftBid`.
- Whitespace-only, 1–2 character, or over-long briefs are rejected server-side (not only by the form).
- Opening phase 2 for an unknown or already-converted serial shows a clear message instead of an empty form.
- Changing סוג המכרז after a draft discards the old draft values and redrafts (no stale params or `draftId`).

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/src/team.ts` (modify) | `BID_NUMBER_MAX`, `formatBidNumber` |
| `shared/src/schemas.ts` (modify) | `bidRequestDocSchema`, `createBidRequestInput`, `createTenderInput.bidRequestId` |
| `functions/src/services/bidNumber.ts` (create) | `israelYear`, `allocateBidNumber` (pure, injected deps) |
| `functions/src/repositories.ts` (modify) | `bidRequestsRepo`; `caseCreationRepo.commit` converts the request in a transaction |
| `functions/src/index.ts` (modify) | `createBidRequest` callable; `createTender` uses the request |
| `firestore.rules` (modify) | `bidRequests` rules |
| `functions/src/test/bidNumber.test.ts` (create) | allocator + format tests |
| `functions/src/test/rules.test.ts`, `e2e.ts` (modify) | rules + conversion tests |
| `web/src/lib/api.ts`, `hooks.ts` (modify) | `createBidRequest`, `useBidRequests`, `useBidRequest` |
| `web/src/pages/RequestCreate.tsx` (create) | phase 1 screen |
| `web/src/pages/TenderCreate.tsx` (modify) | becomes phase 2 |
| `web/src/pages/Dashboard.tsx`, `App.tsx`, `layouts/InternalLayout.tsx`, `i18n/he.json` (modify) | list, routes, nav, strings |

---

### Task 1: Shared bid-number format and schemas

**Files:**
- Modify: `shared/src/team.ts` (after `formatSerial`, ~line 24)
- Modify: `shared/src/schemas.ts` (`createTenderInput` ~line 215; add new schemas after it)
- Test: `functions/src/test/bidNumber.test.ts` (create)

**Interfaces:**
- Produces: `BID_NUMBER_MAX = 999`; `formatBidNumber(year: number, n: number): string`; `BidRequestDoc`; `createBidRequestInput` / `CreateBidRequestInput`; `createTenderInput.bidRequestId: string`.

- [ ] **Step 1: Write the failing test** — create `functions/src/test/bidNumber.test.ts`:

```ts
// Unit tests for the bid number (no network):  node --test functions/lib/test/bidNumber.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBidNumber, BID_NUMBER_MAX, createBidRequestInput, createTenderInput } from '@obms/shared';

test('formatBidNumber drops leading zeros', () => {
  assert.equal(formatBidNumber(2026, 31), '2026-31');
  assert.equal(formatBidNumber(2026, 7), '2026-7');
  assert.equal(formatBidNumber(2027, 999), '2027-999');
});

test('formatBidNumber rejects numbers outside 1..999', () => {
  for (const n of [0, -1, 1000, 1.5, NaN]) assert.throws(() => formatBidNumber(2026, n), RangeError);
  assert.equal(BID_NUMBER_MAX, 999);
});

test('createBidRequestInput needs a real brief', () => {
  assert.ok(createBidRequestInput.safeParse({ brief: 'שירותי אבטחה לאתר' }).success);
  assert.equal(createBidRequestInput.safeParse({ brief: '   ' }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'ab' }).success, false);
  assert.equal(createBidRequestInput.safeParse({ brief: 'x'.repeat(5001) }).success, false);
});

test('createTenderInput requires a well-formed bidRequestId', () => {
  const base = { type: 'service', params: {} };
  assert.equal(createTenderInput.safeParse(base).success, false);
  assert.equal(createTenderInput.safeParse({ ...base, bidRequestId: 'BID-2026-0042' }).success, false);
  assert.ok(createTenderInput.safeParse({ ...base, bidRequestId: '2026-31' }).success);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build:shared && npm run build:functions 2>&1 | tail -5`
Expected: compile FAIL — `formatBidNumber`, `createBidRequestInput`, `BID_NUMBER_MAX` not exported.

- [ ] **Step 3: Implement** — in `shared/src/team.ts` after `formatSerial`:

```ts
/** Largest n of a bid number: three random digits, 1..999. */
export const BID_NUMBER_MAX = 999;

/** 2026-31 — the bid number: the year, then n without leading zeros (031 is written 31). */
export function formatBidNumber(year: number, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > BID_NUMBER_MAX) throw new RangeError(`bid number out of range: ${n}`);
  return `${year}-${n}`;
}
```

In `shared/src/schemas.ts`, add to `createTenderInput` after `title` (the `brief` line stays until Task 4):

```ts
  bidRequestId: z.string().regex(/^\d{4}-\d{1,3}$/), // the request being turned into this tender (its bid number)
```

and after `export type CreateTenderInput …` add:

```ts
// ---- bid requests (phase 1: the requester's summary + bid number) ----
export const bidRequestDocSchema = z.object({
  serial: z.string(), // 2026-31 — also the document id
  year: z.number(),
  n: z.number(),
  brief: z.string(),
  requesterUid: z.string(),
  requesterName: z.string(),
  status: z.enum(['open', 'converted']),
  tenderId: z.string().nullable(),
  clientRequestId: z.string().optional(),
  createdAt: z.number(),
  convertedAt: z.number().nullable(),
});
export type BidRequestDoc = z.infer<typeof bidRequestDocSchema>;

export const createBidRequestInput = z.object({
  brief: z.string().trim().min(3).max(BRIEF_MAX_LENGTH),
  requestId: z.string().min(8).max(100).optional(), // one per form: a retried submit returns the same request
});
export type CreateBidRequestInput = z.infer<typeof createBidRequestInput>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build:shared && npm run build:functions 2>&1 | tail -5 && node --test functions/lib/test/bidNumber.test.js`
Expected: build succeeds; 4 tests PASS. (Existing `createTender` callers are fixed in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add shared/src/team.ts shared/src/schemas.ts functions/src/test/bidNumber.test.ts
git commit -m "feat: bid number format and bid request schemas"
```

---

### Task 2: Bid number allocator

**Files:**
- Create: `functions/src/services/bidNumber.ts`
- Modify: `functions/src/test/bidNumber.test.ts` (append)

**Interfaces:**
- Consumes: `formatBidNumber`, `BID_NUMBER_MAX` (Task 1).
- Produces:
  - `israelYear(ms: number): number`
  - `allocateBidNumber(year: number, deps: { random(): number; claim(serial: string, n: number): Promise<boolean> }): Promise<string>` — `claim` returns `true` when it newly took that number, `false` when it was already taken. Throws `HttpsError('resource-exhausted', …)` when all 999 are taken.

- [ ] **Step 1: Write the failing tests** — append to `bidNumber.test.ts`:

```ts
import { allocateBidNumber, israelYear } from '../services/bidNumber.js';

const fakeClaims = (taken: Set<string> = new Set()) => {
  const attempts: number[] = [];
  return {
    attempts,
    claim: async (serial: string, n: number) => {
      attempts.push(n);
      if (taken.has(serial)) return false;
      taken.add(serial);
      return true;
    },
  };
};

test('allocateBidNumber turns a draw of 031 into 2026-31', async () => {
  const c = fakeClaims();
  // random() → 30/999 maps to n = 31
  const serial = await allocateBidNumber(2026, { random: () => 30 / 999, claim: c.claim });
  assert.equal(serial, '2026-31');
});

test('allocateBidNumber draws again when the number is taken', async () => {
  const c = fakeClaims(new Set(['2026-31']));
  const draws = [30 / 999, 30 / 999, 40 / 999]; // 31, 31 (taken again), 41
  const serial = await allocateBidNumber(2026, { random: () => draws.shift() ?? 0.5, claim: c.claim });
  assert.equal(serial, '2026-41');
});

test('allocateBidNumber finds the last free number when nearly full', async () => {
  const taken = new Set(Array.from({ length: 998 }, (_, i) => `2026-${i + 1}`)); // only 999 is free
  const c = fakeClaims(taken);
  assert.equal(await allocateBidNumber(2026, { random: () => 0, claim: c.claim }), '2026-999');
});

test('allocateBidNumber fails clearly when the year is full, trying each number once', async () => {
  const taken = new Set(Array.from({ length: 999 }, (_, i) => `2026-${i + 1}`));
  const c = fakeClaims(taken);
  await assert.rejects(
    allocateBidNumber(2026, { random: () => 0.3, claim: c.claim }),
    (e: { code?: string }) => e.code === 'resource-exhausted',
  );
  assert.equal(new Set(c.attempts).size, 999);
  assert.equal(c.attempts.length, 999);
});

test('israelYear uses Israel time at the new-year boundary', () => {
  assert.equal(israelYear(Date.parse('2026-12-31T21:30:00Z')), 2026); // 23:30 IST
  assert.equal(israelYear(Date.parse('2026-12-31T22:30:00Z')), 2027); // 00:30 IST
  assert.equal(israelYear(Date.parse('2026-06-30T22:30:00Z')), 2026); // 01:30 IDT, same year
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build:functions 2>&1 | tail -3`
Expected: FAIL — cannot find module `../services/bidNumber.js`.

- [ ] **Step 3: Implement** — create `functions/src/services/bidNumber.ts`:

```ts
// Bid-number allocation: a random n in 1..999 per year, claimed atomically by the caller's `claim`.
// Pure apart from the injected dependencies, so it is unit-tested without Firestore.
import { HttpsError } from 'firebase-functions/v2/https';
import { BID_NUMBER_MAX, formatBidNumber } from '@obms/shared';

export interface BidNumberDeps {
  random(): number; // [0, 1)
  /** Take this bid number; true if newly taken, false if it already existed. */
  claim(serial: string, n: number): Promise<boolean>;
}

/** The calendar year in Israel (the server runs in UTC). */
export function israelYear(ms: number): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(new Date(ms)));
}

const draw = (random: () => number) => 1 + Math.floor(random() * BID_NUMBER_MAX);

const RANDOM_TRIES = 20;

export async function allocateBidNumber(year: number, deps: BidNumberDeps): Promise<string> {
  const tried = new Set<number>();
  const attempt = async (n: number): Promise<string | null> => {
    tried.add(n);
    const serial = formatBidNumber(year, n);
    return (await deps.claim(serial, n)) ? serial : null;
  };
  for (let i = 0; i < RANDOM_TRIES; i++) {
    const n = draw(deps.random);
    if (tried.has(n)) continue;
    const got = await attempt(n);
    if (got) return got;
  }
  // Nearly full year: sweep every number not yet tried, starting at a random point.
  const start = draw(deps.random);
  for (let k = 0; k < BID_NUMBER_MAX; k++) {
    const n = ((start - 1 + k) % BID_NUMBER_MAX) + 1;
    if (tried.has(n)) continue;
    const got = await attempt(n);
    if (got) return got;
  }
  throw new HttpsError('resource-exhausted', `כל מספרי הבל"מ של שנת ${year} נוצלו.`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build:functions 2>&1 | tail -3 && node --test functions/lib/test/bidNumber.test.js`
Expected: all bidNumber tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/services/bidNumber.ts functions/src/test/bidNumber.test.ts
git commit -m "feat: bid number allocator with collision handling"
```

---

### Task 3: bidRequests storage, `createBidRequest` and rules

**Files:**
- Modify: `functions/src/repositories.ts` (add `bidRequestsRepo` after `countersRepo`)
- Modify: `functions/src/index.ts` (add callable before `createTender`, ~line 340; add imports)
- Modify: `firestore.rules` (new `match` block after `tenders`/before `auditLog`, anywhere top-level)
- Modify: `functions/src/test/rules.test.ts`

**Interfaces:**
- Consumes: `allocateBidNumber`, `israelYear` (Task 2); `BidRequestDoc`, `createBidRequestInput` (Task 1).
- Produces: `bidRequestsRepo.tryCreate(doc: BidRequestDoc): Promise<boolean>`, `.get(serial): Promise<BidRequestDoc | null>`, `.byClientRequestId(uid, id): Promise<BidRequestDoc | null>`; callable `createBidRequest({ brief, requestId? }) → { serial: string; duplicate: boolean }`.

- [ ] **Step 1: Write the failing rules test** — in `rules.test.ts`, in the seeding block add:

```ts
    await setDoc(doc(db, 'bidRequests/2026-31'), { serial: '2026-31', brief: 'א', requesterUid: 'ur', status: 'open' });
    await setDoc(doc(db, 'bidRequests/2026-32'), { serial: '2026-32', brief: 'ב', requesterUid: 'other', status: 'open' });
```

and at the end of the file (before any trailing `after(...)` is fine; place with the other tests):

```ts
const requester = () => env.authenticatedContext('ur', { role: 'requester' }).firestore();

test('requester reads only their own bid requests', async () => {
  await assertSucceeds(getDoc(doc(requester(), 'bidRequests/2026-31')));
  await assertFails(getDoc(doc(requester(), 'bidRequests/2026-32')));
  await assertSucceeds(getDocs(query(collection(requester(), 'bidRequests'), where('requesterUid', '==', 'ur'))));
  await assertFails(getDocs(collection(requester(), 'bidRequests')));
});

test('manager reads every bid request; nobody writes from the client', async () => {
  await assertSucceeds(getDoc(doc(manager(), 'bidRequests/2026-32')));
  await assertFails(setDoc(doc(requester(), 'bidRequests/2026-99'), { serial: '2026-99', requesterUid: 'ur' }));
  await assertFails(setDoc(doc(manager(), 'bidRequests/2026-99'), { serial: '2026-99' }));
  await assertFails(getDoc(doc(supplierA(), 'bidRequests/2026-31')));
});
```

(Use the file's existing helper names for the supplier context — `supplierA`/similar at `rules.test.ts:103-107`; adjust the call to match.)

- [ ] **Step 2: Run to verify it fails**

Run (emulator): `npx firebase emulators:exec --only firestore "npm run test --workspace functions"`
Expected: the new tests FAIL (reads denied for managers, because no rule exists).

- [ ] **Step 3: Implement the rules** — in `firestore.rules`, as a sibling of the `tenders` match:

```
    // ---- bid requests (phase 1) ----
    // The requester sees their own; managers see all. Created and converted by functions only.
    match /bidRequests/{serial} {
      allow read: if isManager() || (isInternal() && resource.data.requesterUid == request.auth.uid);
      allow write: if false;
    }
```

- [ ] **Step 4: Implement the repository** — in `functions/src/repositories.ts` add `BidRequestDoc` to the type import and:

```ts
// ---- bid requests (the requester's summary; doc id = the bid number, which is the uniqueness lock) ----
export const bidRequestsRepo = {
  /** Create the request; false (nothing written) if this bid number already exists. */
  async tryCreate(r: BidRequestDoc): Promise<boolean> {
    try {
      await db.collection('bidRequests').doc(r.serial).create(stripUndefined(r));
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 6) return false; // gRPC ALREADY_EXISTS
      throw err;
    }
  },
  async get(serial: string): Promise<BidRequestDoc | null> {
    const s = await db.collection('bidRequests').doc(serial).get();
    return s.exists ? (s.data() as BidRequestDoc) : null;
  },
  /** The request a previous submit of the same form already created (same user only). */
  async byClientRequestId(uid: string, clientRequestId: string): Promise<BidRequestDoc | null> {
    const q = await db
      .collection('bidRequests')
      .where('requesterUid', '==', uid)
      .where('clientRequestId', '==', clientRequestId)
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0].data() as BidRequestDoc);
  },
};
```

- [ ] **Step 5: Implement the callable** — in `functions/src/index.ts` add `createBidRequestInput` to the `@obms/shared` import, `bidRequestsRepo` to the repositories import, `import { allocateBidNumber, israelYear } from './services/bidNumber.js';`, and before `createTender`:

```ts
// Phase 1: the requester's summary becomes a request with its bid number. No AI, no document yet.
export const createBidRequest = onCall(async (req) => {
  const caller = requireRole(req, 'requester', 'tender_manager');
  const input = parseInput(createBidRequestInput, req.data);
  if (input.requestId) {
    const prev = await bidRequestsRepo.byClientRequestId(caller.uid, input.requestId);
    if (prev) return { serial: prev.serial, duplicate: true };
  }
  const createdAt = now();
  const serial = await allocateBidNumber(israelYear(createdAt), {
    random: Math.random,
    claim: (serial, n) =>
      bidRequestsRepo.tryCreate({
        serial,
        year: Number(serial.split('-')[0]),
        n,
        brief: input.brief,
        requesterUid: caller.uid,
        requesterName: caller.name,
        status: 'open',
        tenderId: null,
        clientRequestId: input.requestId,
        createdAt,
        convertedAt: null,
      }),
  });
  await auditRepo.append({
    entityType: 'bidRequest',
    entityId: serial,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'create_request',
    prevState: null,
    newState: 'open',
  });
  return { serial, duplicate: false };
});
```

(Check that `requireRole` is imported from `./lib/context.js` in `index.ts`; add it if not.)

- [ ] **Step 6: Run to verify**

Run: `npm run build:shared && npm run build:functions` (must compile), then the emulator rules command from Step 2.
Expected: the two new rules tests PASS, the rest unchanged.

- [ ] **Step 7: Commit**

```bash
git add functions/src/repositories.ts functions/src/index.ts firestore.rules functions/src/test/rules.test.ts
git commit -m "feat: createBidRequest callable, bidRequests repo and rules"
```

---

### Task 4: `createTender` converts the request

**Files:**
- Modify: `functions/src/repositories.ts` (`caseCreationRepo.commit`)
- Modify: `functions/src/index.ts` (`createTender`, ~lines 351–540)
- Modify: `functions/src/test/e2e.ts` and `functions/{claudelive,livesmoke,verifyall,verifycache,verifydocs,verifysupervisor}.mjs`

**Interfaces:**
- Consumes: `bidRequestsRepo.get` (Task 3), `createTenderInput.bidRequestId` (Task 1).
- Produces: `createTender` unchanged return shape; the tender's `serial` is the request's bid number; the request becomes `{ status: 'converted', tenderId, convertedAt }` in the same transaction.

- [ ] **Step 1: Write the failing e2e checks** — in `e2e.ts` add a helper after `login`:

```ts
const newRequest = async (brief = 'דרישה לבדיקה'): Promise<string> =>
  ((await call('createBidRequest')({ brief })) as { data: { serial: string } }).data.serial;
```

Add `bidRequestId: await newRequest(),` to **every** `createTender` call (lines ~48, 61, 178, 565, 596, 603, and the `svcInput` object at ~624 — build it once so the retry at ~630 reuses the same id). Change the serial assertion at line ~54 to:

```ts
  assert.match(created.data.serial, /^\d{4}-\d{1,3}$/, 'bid number assigned');
```

and append a conversion block after the service-case retry check (~line 635):

```ts
  // A request converts to exactly one tender.
  const reqId = await newRequest('בקשה להמרה');
  const input = { title: '', type: 'goods', params: { org: 'א', description: 'ב', quantity: 1, budget: 1 }, team: goodsTeam, bidRequestId: reqId };
  const first = (await call('createTender')({ ...input })) as { data: { id: string; serial: string } };
  assert.equal(first.data.serial, reqId, 'the tender keeps the request bid number');
  const reqDoc = await getDoc(doc(db, 'bidRequests', reqId));
  assert.equal(reqDoc.data()?.status, 'converted');
  assert.equal(reqDoc.data()?.tenderId, first.data.id);
  let secondFailed = false;
  try {
    await call('createTender')({ ...input });
  } catch {
    secondFailed = true;
  }
  assert.ok(secondFailed, 'a converted request cannot be converted again');
  let unknownFailed = false;
  try {
    await call('createTender')({ ...input, bidRequestId: '2026-998' });
  } catch {
    unknownFailed = true;
  }
  assert.ok(unknownFailed, 'an unknown request is rejected');
```

(The `params` for goods must match the goods template; copy the shape used at line ~48.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore,functions,storage "npm run seed && node functions/lib/test/e2e.js"` (after `npm run build:functions`)
Expected: FAIL — `createTender` ignores `bidRequestId` / the build fails on `input.brief`.

- [ ] **Step 3: Implement `createTender`** — in `index.ts`:
  1. Remove `countersRepo` use for the serial: replace
     ```ts
     const serial = await countersRepo.nextSerial(new Date(now()).getFullYear());
     ```
     with `const serial = bidReq.serial;`
  2. After the template checks (before the draft lookup) add:
     ```ts
     const bidReq = await bidRequestsRepo.get(input.bidRequestId);
     if (!bidReq) throw new HttpsError('not-found', 'הבקשה לא נמצאה.');
     if (bidReq.status !== 'open') throw new HttpsError('failed-precondition', 'הבקשה כבר הומרה למכרז.');
     ```
  3. In the provenance replace `brief: draft?.brief ?? (input.brief?.trim() || null),` with `brief: draft?.brief ?? bidReq.brief,`.
  4. In `shared/src/schemas.ts` remove the now-unused `brief` line from `createTenderInput`.
  5. Pass the serial to the commit: `await caseCreationRepo.commit({ tender, access, provenance, internalParams, requestId, uid: caller.uid, bidRequestSerial: bidReq.serial });`

- [ ] **Step 4: Implement the transactional commit** — in `repositories.ts` import `HttpsError` (`import { HttpsError } from 'firebase-functions/v2/https';`) and replace the body of `commit` (and add `bidRequestSerial: string` to its parameter type):

```ts
    const ref = db.collection('tenders').doc(c.tender.id);
    const reqRef = db.collection('bidRequests').doc(c.bidRequestSerial);
    await db.runTransaction(async (tx) => {
      // Read first: the request must still be open, or a second manager would create a twin.
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists || reqSnap.get('status') !== 'open') {
        throw new HttpsError('failed-precondition', 'הבקשה כבר הומרה למכרז.');
      }
      tx.create(ref, c.tender);
      for (const a of c.access) tx.set(ref.collection('access').doc(a.principalId), a);
      tx.set(ref.collection('internal').doc('provenance'), c.provenance);
      if (Object.keys(c.internalParams).length) tx.set(ref.collection('internal').doc('params'), c.internalParams);
      if (c.requestId) {
        // create() fails if this request already committed — a concurrent duplicate can't slip in.
        tx.create(db.collection('createRequests').doc(c.requestId), {
          tenderId: c.tender.id,
          serial: c.tender.serial,
          uid: c.uid,
          at: now(),
        });
      }
      tx.update(reqRef, { status: 'converted', tenderId: c.tender.id, convertedAt: now() });
    });
```

- [ ] **Step 5: Update the dev scripts** — in each of `claudelive.mjs`, `livesmoke.mjs`, `verifyall.mjs`, `verifycache.mjs`, `verifydocs.mjs`, `verifysupervisor.mjs`, add directly above the `createTender` call (same `call`/`httpsCallable` helper the file already uses, signed in as the manager):

```js
const { data: request } = await call('createBidRequest')({ brief: 'בקשת בדיקה' });
```

and add `bidRequestId: request.serial,` as a property of the `createTender` payload. (`livesmoke.mjs` uses `httpsCallable(fns, 'createTender')` — use `httpsCallable(fns, 'createBidRequest')` the same way.)

- [ ] **Step 6: Run to verify it passes**

Run: `npm run build:shared && npm run build:functions`, then the e2e command from Step 2, then `node --test $(ls functions/lib/test/*.test.js | grep -v rules)`.
Expected: e2e completes without assertion errors (including the new conversion block); unit tests PASS.

- [ ] **Step 7: Commit**

```bash
git add functions/src functions/*.mjs
git commit -m "feat: createTender converts a bid request atomically and keeps its bid number"
```

---

### Task 5: Phase 1 screen

**Files:**
- Modify: `web/src/lib/api.ts` (`api` object)
- Modify: `web/src/lib/hooks.ts` (add hooks at the end of the tenders hooks)
- Create: `web/src/pages/RequestCreate.tsx`
- Modify: `web/src/App.tsx`, `web/src/layouts/InternalLayout.tsx`, `web/src/i18n/he.json`

**Interfaces:**
- Consumes: callable `createBidRequest` (Task 3).
- Produces: `api.createBidRequest`; `useBidRequests(): { requests: BidRequestDoc[]; loading: boolean }` (manager: all open; others: own); `useBidRequest(serial?: string): { request: BidRequestDoc | null | undefined }` (`undefined` = loading, `null` = not found); route `/requests/new`.

- [ ] **Step 1: API + hooks** — in `api.ts` add `CreateBidRequestInput` to the shared type import and, in the `api` object:

```ts
  createBidRequest: call<CreateBidRequestInput, { serial: string; duplicate: boolean }>('createBidRequest'),
```

In `hooks.ts` add `BidRequestDoc` to the type imports and:

```ts
// The manager sees every open request (procurement's inbox); anyone else only their own.
// Sorted in the browser — filtering on status/requester plus ordering would need a composite index.
export function useBidRequests() {
  const { user, role } = useAuth();
  const [requests, setRequests] = useState<BidRequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const base = collection(db, 'bidRequests');
    const q =
      role === 'tender_manager' ? query(base, where('status', '==', 'open')) : query(base, where('requesterUid', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        setRequests(snap.docs.map((d) => d.data() as BidRequestDoc).sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      },
      (e) => {
        console.error('useBidRequests: query error', e);
        setRequests([]);
        setLoading(false);
      },
    );
  }, [user, role]);
  return { requests, loading };
}

/** undefined while loading, null when it does not exist. */
export function useBidRequest(serial: string | undefined) {
  const [request, setRequest] = useState<BidRequestDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!serial) return;
    return onSnapshot(
      doc(db, 'bidRequests', serial),
      (s) => setRequest(s.exists() ? (s.data() as BidRequestDoc) : null),
      () => setRequest(null),
    );
  }, [serial]);
  return { request };
}
```

- [ ] **Step 2: Strings** — add to `he.json`:

```json
  "nav.newRequest": "בקשה חדשה",
  "req.phase1Title": "שלב 1 — פתיחת בקשה (הדורש)",
  "req.phase1Hint": "תאר בקצרה מה נדרש. איש הרכש ישלים את שאר הפרטים בשלב הבא.",
  "req.submit": "פתח בקשה",
  "req.creating": "פותח בקשה…",
  "req.created": "הבקשה נפתחה. מספר הבל\"מ: {{serial}}",
  "req.createdHint": "שמור את המספר — באמצעותו ניתן לעקוב אחר הבקשה.",
  "req.another": "פתח בקשה נוספת",
  "req.briefTooShort": "יש למלא תקציר מכרז (לפחות 3 תווים).",
```

- [ ] **Step 3: Page** — create `web/src/pages/RequestCreate.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH } from '@obms/shared';
import { api } from '../lib/api';

// Phase 1 (the requester): only the tender brief. The system answers with the bid number.
export default function RequestCreate() {
  const { t } = useTranslation();
  const [brief, setBrief] = useState('');
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
    setBusy(true);
    setError('');
    try {
      const r = await api.createBidRequest({ brief, requestId: requestId.current });
      setSerial(r.serial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBrief('');
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

- [ ] **Step 4: Route + nav** — in `App.tsx` import `RequestCreate` and add (inside the internal `Routes`, before `/tenders/:id`; requesters and managers only):

```tsx
        <Route path="/requests/new" element={<RequestCreate />} />
```

In `InternalLayout.tsx` replace the `isManager` new-tender nav item (line 45) with:

```tsx
          {(isManager || role === 'requester') && <NavItem to="/requests/new" label={t('nav.newRequest')} />}
```

- [ ] **Step 5: Verify**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. Manual (emulators + `npm run dev:web`): log in as `requester@obms.test`, open **בקשה חדשה**, submit → success view shows `מספר הבל"מ: 2026-<n>`; re-submitting the same form (e.g. after a reload of the response) does not create a second request.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): phase 1 screen - the requester opens a request and gets a bid number"
```

---

### Task 6: Phase 2 screen and pending-requests list

**Files:**
- Modify: `web/src/pages/TenderCreate.tsx`
- Modify: `web/src/pages/Dashboard.tsx`, `web/src/App.tsx`, `web/src/i18n/he.json`

**Interfaces:**
- Consumes: `useBidRequest`, `useBidRequests` (Task 5), `createTender({ bidRequestId, … })` (Task 4).
- Produces: route `/requests/:serial` (manager only); the old `/tenders/new` route is removed.

- [ ] **Step 1: Strings** — add to `he.json`:

```json
  "req.phase2Title": "שלב 2 — השלמת הבל\"מ (איש רכש)",
  "req.phase2Hint": "בחר את סוג המכרז — המערכת תייצר טיוטה ראשונית מהתבנית. עבור על הערכים והשלם את החסר.",
  "req.bidNumber": "מספר הבל\"מ",
  "req.requestedBy": "הדורש",
  "req.pickType": "בחר סוג מכרז…",
  "req.notFound": "הבקשה לא נמצאה.",
  "req.alreadyConverted": "הבקשה כבר הומרה למכרז.",
  "req.openCase": "פתח את המכרז",
  "req.pendingTitle": "בקשות ממתינות לאיש הרכש",
  "req.pendingEmpty": "אין בקשות ממתינות.",
  "req.myRequests": "הבקשות שלי",
  "req.statusOpen": "ממתינה",
  "req.statusConverted": "הומרה למכרז",
  "req.handle": "טפל בבקשה",
```

and change `create.autoSerial` to `"יוקצה אוטומטית — מספר הבל\"מ של הבקשה"`.

- [ ] **Step 2: Phase 2 page** — edit `web/src/pages/TenderCreate.tsx`:
  1. Imports: change `import { useNavigate } from 'react-router-dom';` to `import { Link, useNavigate, useParams } from 'react-router-dom';`; add `useBidRequest` to the `../lib/hooks` import; remove `BRIEF_MAX_LENGTH` from the shared import.
  2. State: replace `const [type, setType] = useState<TenderType>(TENDER_TYPES.service);` with `const [type, setType] = useState<TenderType | ''>('');`, delete `const [brief, setBrief] = useState('');`, and after `const nav = useNavigate();` add:
     ```tsx
     const { serial } = useParams();
     const { request } = useBidRequest(serial);
     const brief = request?.brief ?? '';
     ```
  3. `const template = useTemplate(type);` → `useTemplate(type || undefined);` and `requiredRolesFor(type, extraRoles)` → `requiredRolesFor(type || TENDER_TYPES.service, extraRoles)`.
  4. Replace `runDraft` with a version that takes the type (it runs when the type is picked):
     ```tsx
     const runDraft = async (forType: TenderType) => {
       if (brief.trim().length < 3) return;
       setDrafting(true);
       setError('');
       try {
         const d = await api.draftBid({ type: forType, brief });
         setDraftId(d.draftId);
         // labels come from the template of the type just picked
         const labelOf = (k: string) => (forType === type ? template : undefined)?.params.find((p) => p.key === k)?.labelHe ?? k;
         setDraftNote(
           d.status === 'FAILED'
             ? t('create.draftFailed')
             : d.missing.length
               ? t('create.draftMissing', { fields: d.missing.map(labelOf).join(', ') })
               : '',
         );
         if (d.title) setTitle(d.title);
         setParams(Object.fromEntries(Object.entries(d.params ?? {}).map(([k, v]) => [k, String(v)])));
         setDomainTags(d.domainTags ?? []);
         setCriteria(d.evaluationCriteria ?? []);
         if (d.submissionDeadlineDays) setDeadline(toLocalInput(Date.now() + d.submissionDeadlineDays * 86400000));
       } catch (err) {
         setError(err instanceof Error ? err.message : String(err));
       } finally {
         setDrafting(false);
       }
     };

     // Picking (or changing) the type discards the previous draft and drafts again from that template.
     const pickType = (next: TenderType | '') => {
       setType(next);
       setParams({});
       setTitle('');
       setDomainTags([]);
       setCriteria([]);
       setDeadline('');
       setDraftId(null); // a draft is bound to the template type it was made for
       setDraftNote('');
       if (next) void runDraft(next);
     };
     ```
  5. In `submit`: delete the `ordered && brief.trim().length < 3` block; in the `api.createTender({...})` payload delete `brief,` and add `bidRequestId: serial!,`; change `type,` to `type: type as TenderType,` and guard at the top of `submit`: `if (!type || !serial) return;`.
  6. JSX: replace the header + the whole "Agentic brief → AI draft" card (from `<h1 …>{t('create.title')}</h1>` through the card's closing `</div>`) with:
     ```tsx
     if (request === undefined) return <div className="p-6 text-tx-soft">{t('common.loading')}</div>;
     if (request === null) return <div className="p-6 text-red-600">{t('req.notFound')}</div>;
     if (request.status === 'converted')
       return (
         <div className="mx-auto max-w-2xl card space-y-3 p-6">
           <div>{t('req.alreadyConverted')}</div>
           {request.tenderId && (
             <Link to={`/tenders/${request.tenderId}`} className="btn btn-gold">
               {t('req.openCase')}
             </Link>
           )}
         </div>
       );
     ```
     placed immediately before the `return (` of the component (hooks above must all run before these early returns — they do, since the early returns come after every hook call), and inside the main `return` start with:
     ```tsx
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-2 font-display text-2xl font-bold">{t('req.phase2Title')}</h1>
          <p className="mb-6 text-sm text-tx-soft">{t('req.phase2Hint')}</p>
          <div className="card mb-5 space-y-2 p-6">
            <div className="text-sm">
              <span className="text-tx-soft">{t('req.bidNumber')}: </span>
              <span className="font-semibold">{request.serial}</span>
              <span className="mr-4 text-tx-soft">{t('req.requestedBy')}: </span>
              {request.requesterName}
            </div>
            <div className="whitespace-pre-wrap rounded bg-paper-2 p-3 text-sm">{request.brief}</div>
          </div>
     ```
  7. The type `<select>`: `value={type}`, `onChange={(e) => pickType(e.target.value as TenderType | '')}`, add a first option `<option value="">{t('req.pickType')}</option>`.
  8. Render everything after the type select (title input, params, team, tags, criteria, deadline, submit button) only when `type` is set: wrap it in `{type && ( <> … </> )}`; while `drafting`, show `{drafting && <div className="text-sm text-tx-soft">{t('create.drafting')}</div>}` under the select. The submit button keeps `disabled={busy || drafting || notConverted}`.
  9. Delete the now-unused `requestId`-independent pieces only if the compiler flags them (keep the `requestId` ref — it still gives retry safety).

- [ ] **Step 3: Routes + dashboard** — in `App.tsx` replace `<Route path="/tenders/new" … />` with:

```tsx
        <Route path="/requests/:serial" element={managerOnly(<TenderCreate />)} />
```

(`/requests/new` from Task 5 must be declared **before** it so `new` is not read as a serial.) In `Dashboard.tsx`: import `useBidRequests`; replace the `role === 'tender_manager'` "+ מכרז חדש" link with a "+ בקשה חדשה" link to `/requests/new` for managers **and** requesters (`t('nav.newRequest')`); and add below the header, before the feedback block:

```tsx
      {requests.length > 0 || role === 'tender_manager' ? (
        <div className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold">{role === 'tender_manager' ? t('req.pendingTitle') : t('req.myRequests')}</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-tx-mute">{t('req.pendingEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.serial} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{r.serial}</span>
                  <span className="flex-1 truncate text-tx-soft">{r.brief}</span>
                  <span className="text-tx-mute">{r.requesterName}</span>
                  {role === 'tender_manager' ? (
                    <Link to={`/requests/${r.serial}`} className="btn btn-gold">
                      {t('req.handle')}
                    </Link>
                  ) : (
                    <span className="chip">{r.status === 'open' ? t('req.statusOpen') : t('req.statusConverted')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
```

with `const { requests } = useBidRequests();` near the other hooks. Search the web app for remaining links to `/tenders/new` (`grep -rn "tenders/new" web/src`) and point them at `/requests/new`.

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit` — expected: no errors. Manual with emulators running and `npm run seed`:
1. As `requester@obms.test` open a request (Task 5) and note the number.
2. As `manager@obms.test` the dashboard lists it under **בקשות ממתינות לאיש הרכש** → **טפל בבקשה** opens `/requests/<serial>` titled `שלב 2 — השלמת הבל"מ (איש רכש)` with the number and brief read-only and the form hidden.
3. Pick **מכרז שירות** → "יוצר טיוטה…" then the ordered services form appears prefilled; change the type to **מכרז טובין** → values reset and redraft.
4. Complete and submit → the new case opens and its number equals the request's number; reopening `/requests/<serial>` shows "הבקשה כבר הומרה למכרז." with a link to the case.
5. `/requests/2026-998` shows "הבקשה לא נמצאה."; as the requester `/requests/<serial>` redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): phase 2 screen - procurement picks the type, drafts and creates the tender"
```

---

### Task 7: Final verification

- [ ] **Step 1:** `npm run build:shared && npm run build:functions && npm run build:web` — expected: all succeed.
- [ ] **Step 2:** `node --test $(ls functions/lib/test/*.test.js | grep -v rules)` — expected: all pass (previous 90 + the new bid-number tests).
- [ ] **Step 3:** Emulator suites: `npx firebase emulators:exec --only firestore "npm run test --workspace functions"` (rules) and the e2e command from Task 4 — expected: pass.
- [ ] **Step 4:** Walk the manual flow in Task 6 Step 4 once end to end; confirm the generated document and the dashboard show the new bid number.
- [ ] **Step 5:** Push the branch and open a PR (never push to `main`); note in the PR that existing cases keep their `BID-…` serials.

## Self-review notes
- Spec coverage: data model (T1, T3), bid number rules (T1–T2), `createBidRequest` (T3), conversion + atomicity (T4), phase 1/2 screens and titles (T5–T6), dashboard list (T6), rules + tests (T3, T4, T7), single-step create removed (T6 Step 3).
- Out of scope per spec: new roles, notifications, editing/reopening requests, legacy-serial migration.
