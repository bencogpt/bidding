# OBMS — Organizational Bid Management System (Static Demo)

A clickable, self-contained HTML/CSS/JS prototype of the OBMS described in `OBMS_PRD_v1.0`.
No build step, no backend — open `index.html` in any modern browser.

```
bid-system/
├── index.html        # Internal portal (Bid Manager + internal actors)
├── supplier.html     # Isolated external supplier portal
└── assets/
    ├── styles.css     # Design system (enterprise "command center")
    ├── data.js        # Mock data layer
    └── app.js         # Rendering + interactions
```

## Run

```bash
open index.html          # macOS
# or just double-click the file
```

The **role switcher** (sidebar, bottom-left) re-renders the workspace for each
internal actor to demonstrate RBAC. The **Supplier Portal ↗** nav link opens the
isolated external view.

## Demo flows

1. **Dashboard** → lifecycle pipeline + KPIs across all bids.
2. Open **BID-2026-0151** (Internal Review) → switch role to *Legal / Finance /
   Inspection* → add feedback, flag *Blocking*, mark *Complete*.
3. As *Bid Manager*, **Mark as Ready** → **Publish to Suppliers** (deadline,
   approved supplier list, blind-review toggle).
4. Open **supplier.html** → isolated submission, live countdown, Q&A bot.
5. Open **BID-2026-0148** (Responses Received) → **Run AI Evaluation** → animated
   pipeline → full **AI Comparison Report**.
6. **Audit Trail** → immutable action log with CSV/PDF export.

## Requirement coverage (PRD → demo)

| Area | PRD ref | Where in demo |
| --- | --- | --- |
| Bid creation + auto ID | FR-01 | Dashboard → *New Bid* modal |
| Document upload (PDF/DOCX/XLSX/img/ZIP) | FR-02 | Workspace → *Bid Documents* / upload modal |
| Artifact versioning | FR-03 | Workspace → version history strip |
| Internal feedback + status flag | FR-04 | Workspace → *Internal Review* board |
| Review dashboard per department | FR-05 | *Review Queue* + workspace overview |
| Status lifecycle enforcement | FR-06 | Lifecycle stepper + gated actions |
| Public publishing (Bid Mgr only) | FR-07 | *Publish to Suppliers* modal |
| Supplier registration + approval | FR-08 | *Suppliers* view |
| **Supplier isolation** | FR-09 / §6 | `supplier.html` isolation banner, no peer data |
| Supplier submission (editable→locked) | FR-10 | Supplier portal dropzone + status |
| Deadline enforcement + countdown | FR-11 | Supplier portal live countdown → auto-lock |
| AI comparison engine | FR-12 / §5 | *Run AI Evaluation* pipeline |
| Comparison report (scores/SWOT/rank) | FR-13 | *AI Evaluation* view |
| Audit trail | FR-14 | *Audit Trail* view |
| Notifications | FR-15 | Toasts on publish/assign (simulated) |
| Human oversight of AI | §5.5 | Advisory banner + manual award override |
| Blind review / anonymization | §6.2 | Supplier A–D codes + de-anonymize action |

## Firebase app — what has been built so far

The static demo above is the original prototype. The real Hebrew (RTL) system lives in
`shared/`, `functions/` and `web/` (Firebase project `biding-system`); see `RUNNING.md` to run it
on the emulators. Work done so far on the tender-creation flow:

- **Services create form reordered** to the agreed field table: required flags, system-filled
  fields (guarantee amount in words, total months, submission weekday, manager/requester details,
  fixed texts such as the bid box location), a "qualitative bid" checkbox and an
  economic/quality score split (quality = 100 − economic).
- **Two-phase creation** — requester opens a request, procurement completes it. See the next section.
- **Tests:** unit tests for the bid-number format and allocator, Firestore rules tests for
  `bidRequests`, and e2e checks for conversion (single, double and concurrent).
- **Not yet done:** a manual browser click-through of both phases; the AI draft needs an Anthropic
  API key to run (it cannot in the emulator).

### Two-phase tender creation

Creating a tender is split into two screens and two roles. Design:
`docs/superpowers/specs/2026-11-02-two-phase-create-request-design.md`; implementation plan:
`docs/superpowers/plans/2026-11-02-two-phase-create-request.md`.

```
requester ──► Phase 1: open a request ──► bidRequests/{bid number}  (status: open)
                                                    │
tender manager ◄── dashboard "בקשות ממתינות" ◄──────┘
      │
      └──► Phase 2: pick סוג המכרז ─► LLM drafts from that type's template
                  ─► manager completes the form ─► createTender
                  ─► tender (same bid number)  +  request marked converted (one transaction)
```

**Phase 1 — "שלב 1 — פתיחת בקשה (הדורש)"** (`/requests/new`, requester or tender manager)
- The only field is תקציר המכרז (required, 3 to 5000 characters after trimming).
- Submitting creates the request and shows its bid number. The number is kept with the case and
  appears in the generated בל"מ document. No AI call and no document are produced at this step.
- A retried submit (same form) returns the request already opened instead of creating a second one.

**Bid number** — `[year]-[n]`, for example `2026-31`
- `n` is a random number from 1 to 999. Leading zeros are dropped (031 becomes 31).
- The year is the Israel-time year, so a request created at 00:30 on 1 January is already next year.
- The number is the document id of the request, so it is unique per year. On a collision the
  system draws again; if all 999 numbers of a year are used it fails with a clear Hebrew error.
- It replaces the old `BID-YYYY-NNNN` serial for new cases only; existing cases keep theirs.

**Phase 2 — "שלב 2 — השלמת הבל"מ (איש רכש)"** (`/requests/:serial`, tender manager only)
- The manager opens a request from the "בקשות ממתינות" list on the dashboard. The bid number and
  the requester's summary are shown read-only at the top.
- Choosing סוג המכרז triggers the LLM draft from that type's template. Changing the type discards
  the previous draft and drafts again; a slow earlier draft can never overwrite a newer one.
- The rest is the ordered form for that type. The case requester defaults to the person who
  opened the request.
- An unknown request, or one that was already converted, shows a clear message (the converted one
  links to its case) instead of an empty form.

**Backend**
- `createBidRequest` callable: requester or tender manager. Validates the summary, allocates the
  number, writes `bidRequests/{serial}`, adds an audit entry.
- `createTender` now takes `bidRequestId` (the request's bid number) instead of a summary. It
  creates the tender, its access and provenance, and marks the request `converted` in a single
  Firestore transaction, so a request becomes exactly one tender even if two managers try at once.
  `createTender` and `draftBid` remain tender-manager only.
- Firestore rules: a requester reads only their own requests, managers read all, and nobody writes
  from the client.

**Try it** (emulators and `npm run seed` running, see `RUNNING.md`)
1. Log in as `requester@obms.test` / `password`, open **בקשה חדשה**, enter a summary and submit.
2. Log in as `manager@obms.test` / `password`, open the request under **בקשות ממתינות**, pick a
   type, complete the form and create the case. The case carries the request's bid number.

ןמ ## Notes

- Static prototype: all data is mocked in `data.js`; state changes live in-memory
  for the session and reset on reload.
- Out of scope per PRD v1 (contract mgmt, payments, ERP/SSO, native mobile,
  v2+ agentic workflows) is not implemented; the *Supplier Q&A Bot* appears as a
  v2 preview.
