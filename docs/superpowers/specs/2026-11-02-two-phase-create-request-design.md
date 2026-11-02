# Two-phase tender creation (request → procurement)

Date: 2026-11-02 · Status: design approved in chat, awaiting spec review

## Goal
Split "create tender" into two screens and two roles:

1. **שלב 1 — פתיחת בקשה (הדורש):** the requester writes only תקציר המכרז. The system assigns a bid number.
2. **שלב 2 — השלמת הבל"מ (איש רכש):** the tender manager opens the request, chooses סוג המכרז, the LLM drafts the initial values from that type's template, the manager completes the form and creates the tender.

The bid number from phase 1 identifies the case everywhere and appears in the resulting בל"מ document.

## Decisions (from the brainstorm)
- New bid number **replaces** the `BID-YYYY-NNNN` serial for new cases. Existing cases keep theirs.
- Phase 1 = existing `requester` role (can create requests); phase 2 = `tender_manager`. No new role.
- The LLM drafts **after** the type is chosen (phase 2), not in phase 1.
- Request data lives in a **separate `bidRequests` collection**, not a new tender status; the tender FSM, supplier visibility and dashboard are untouched.
- The current single-step create screen is removed; every tender starts from a request.

## Data model
`bidRequests/{serial}` (doc id = the bid number, e.g. `2026-31`, which doubles as the uniqueness lock):

| field | notes |
|---|---|
| `serial` | `"[year]-[n]"`, n = 1..999, no leading zeros |
| `year`, `n` | numbers |
| `brief` | required, ≤ `BRIEF_MAX_LENGTH` |
| `requesterUid`, `requesterName` | who opened it |
| `status` | `open` \| `converted` |
| `tenderId` | set on conversion |
| `createdAt`, `convertedAt` | epoch ms |

`TenderDoc.serial` keeps its field; new cases store the new format. `tenderDocSchema`/`shared` gain a `bidRequestDocSchema`.

## Bid number
- `formatBidNumber(year, n)` → `` `${year}-${n}` `` (n is an integer, so 031 never appears).
- `allocateBidNumber(year)`: pick random n in 1..999; in a transaction create `bidRequests/{year}-{n}` if absent; on collision draw again (bounded retries, then scan remaining free numbers). A full year (999 used) → `HttpsError('resource-exhausted', …)` in Hebrew.
- Replaces `countersRepo.nextSerial` for new cases; the old counter and `backfillSerials` stay for legacy cases.

## Backend (functions)
- `createBidRequest` (callable; requester or tender_manager): validates brief, allocates the number, writes the request, audit entry. Returns `{ serial }`. Retry-safe via a client `requestId` like `createTender`.
- `listBidRequests` (callable or direct read under rules): requester sees own; managers see all `open`.
- `draftBid` unchanged except it is called with the request's brief and the chosen type.
- `createTender` takes `bidRequestId` (the serial): in one transaction it checks the request is `open`, uses its serial and brief, creates the tender and marks the request `converted`. A second call for the same request fails (`failed-precondition`). The auto-serial param fill uses the request's serial.
- `isAutoSerialParam` / `AUTO_SERIAL_KEY_RE` keep working; only the value changes format.

## Web
- **Phase 1** (`/requests/new`, title "שלב 1 — פתיחת בקשה (הדורש)"): one required field, תקציר המכרז (+ submit). Success view shows the bid number and a link back. Requester nav gets "בקשה חדשה".
- **Dashboard (manager):** "בקשות ממתינות" list (bid number, requester, date, brief excerpt) linking to phase 2.
- **Phase 2** (`/requests/:serial`, title "שלב 2 — השלמת הבל"מ (איש רכש)"): bid number + brief read-only at top; סוג המכרז select; choosing a type (and changing it) triggers the AI draft automatically; below is today's ordered services form unchanged; submit calls `createTender` with `bidRequestId`.
- Old `/tenders/new` screen and its brief box are removed; links to it point at the pending-requests list.

## Rules
`bidRequests`: requester may read their own, tender managers read all; **no client writes** (functions only), same as other function-owned collections.

## Out of scope
New roles, notifying procurement (email/push), editing a request after submission, reopening a converted request, migrating legacy serials.

## Tests
- Number: format drops leading zeros; collision redraw; full year error.
- `createTender` from a request: uses the request's serial; second conversion rejected; concurrent conversions create one tender.
- Rules: requester reads only own requests; client writes denied (emulator suite).
- Existing 90 non-emulator tests still pass.
