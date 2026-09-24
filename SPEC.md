# OBMS — Organizational Bid Management System
## Consolidated Requirements Specification (as-built + known intent)

**Status:** baseline for revision · **Compiled:** 2026-09-24
**Source of truth:** the live code in this repo (`shared/`, `functions/`, `web/`, `firestore.rules`,
`storage.rules`), plus `README.md` (original v1.0 PRD coverage table), `RUNNING.md`, and the
approved plan `~/.claude/plans/rustling-drifting-squid.md`.

> **Maintenance rule — this file is the single running record.**
> Every **new requirement, decision, or task** that comes up during the revision is recorded here
> before or alongside the work. New functional requirements go into the relevant `6.x` section with
> the next free ID and a status tag; anything not yet slotted into a section goes into
> **§12 Revision log** with a date. Completed work flips its tag from `[D]` to `[B]` rather than
> being deleted, so the history of what was decided stays readable.

Every requirement below is tagged:
- **[B]** Built and verified in the deployed system.
- **[P]** Partially built — works, but with a stated limitation.
- **[D]** Designed/decided but **not** implemented.
- **[L]** Legacy requirement from the static v1.0 prototype that was **not** carried into the
  Firebase rebuild. These are the biggest candidates for the revision.

---

## 1. Purpose and scope

OBMS is a Hebrew (RTL) tender/bid management system for an organization that issues tenders
(מכרזים) and receives proposals from external suppliers. It covers the full lifecycle: drafting a
tender document from a per-type template, internal review, publication to a controlled supplier
list, clarification Q&A, proposal intake, AI-assisted comparative evaluation, and award — all with
an immutable audit trail.

The current build is a **vertical slice**: one coherent end-to-end path through the whole lifecycle,
deliberately narrow rather than feature-complete.

**Locked product decisions**
- **PD-1 [B]** Frontend: React 18 + Vite + Firebase Web SDK. Hebrew-only UI, RTL, i18next.
- **PD-2 [B]** Tender documents live in **Google Docs**; suppliers **never** see the raw Doc — they
  see a system-rendered PDF/HTML inside the app.
- **PD-3 [B]** AI is **Claude (Anthropic)**, called **only** from Cloud Functions, never the client,
  and is **always non-binding** — the tender manager decides.
- **PD-4 [B]** Privileged writes never happen from the client. Security rules are a hard gate;
  all state change goes through callable Cloud Functions using the Admin SDK.
- **PD-5 [B]** Israeli suppliers are preferred/ranked first in all supplier discovery.

---

## 2. Glossary

| Hebrew | English | Code identifier |
|---|---|---|
| מכרז | tender / bid | `tenders/{id}` |
| מנהל המכרז | tender manager (super-user) | `tender_manager` |
| מזמין | requester | `requester` |
| יועץ משפטי | legal counsel | `legal` |
| אחראי ביטחון | security officer | `security` |
| איש כספים | finance | `finance` |
| ספק | supplier (external) | `supplier` |
| מכרז טובין | goods tender | `goods` |
| מכרז שירות וכוח-אדם | services & manpower tender | `service` |
| מכרז פרויקטלי | project tender (scope + service) | `project` |
| שאלות הבהרה | clarification questions | `questions` |
| תיק מכרז | case file | CasePanel |
| יומן פעולות | audit trail | `auditLog` |

---

## 3. Actors and roles

**R-1 [B]** Exactly six roles exist: `tender_manager`, `requester`, `legal`, `security`, `finance`,
`supplier`. The first five are *internal*; `supplier` is *external*.
(`shared/src/roles.ts`)

**R-2 [B]** `tender_manager` is the super-user and the **only** role that may create, transition,
share, answer, evaluate, or award a tender, and the only editor of the tender document.

**R-3 [B]** All other internal roles are **reviewers**: read access to everything internal, and
**comment + suggest** access on the tender document (Google `commenter`). They have no write path
in OBMS, and cannot accept their own suggestions in the Doc — see FR-A6.

**R-4 [B]** Suppliers are isolated: they see only tenders explicitly shared with them, only their
own submission, and never any peer's submission.

**R-5 [B]** Role is carried as a Firebase Auth **custom claim** (`role`, plus `supplierId` for
suppliers) and mirrored into `users/{uid}`. Claims are set only by Cloud Functions.

**R-6 [B]** Internal user provisioning: the manager creates internal users by name / OBMS login /
optional **Google account** / role (`createInternalUser`) → creates the Auth login with a generated
temp password, sets the claim, writes `users/{uid}`. Deletion (`deleteInternalUser`) removes both the Auth account and the doc;
a manager cannot delete themselves.

**R-7 [B]** Supplier account provisioning: the manager creates a supplier record first, then
`createSupplierAccount` creates/links an email-password login bound to that `supplierId`.

### Authentication

**A-1 [B]** Internal users sign in with **Google SSO** or email/password; suppliers with
**email/password only**. (`web/src/pages/Login.tsx`)

**A-2 [P]** **Only registered users may sign in.** Two layers were designed; only one is live:
- Client guard: authenticated but no role → `Unauthorized` page, forced sign-out. **[B]**
- Server guard: `beforeUserSignedIn` blocking function rejecting any email with no `users` doc —
  **[D] disabled**, requires Identity Platform (GCIP) on the project. Code is commented out at
  `functions/src/index.ts:618` because its presence aborts every functions deploy.

**A-3 [B]** Google Docs permissions map to roles: manager → `writer`, internal reviewers →
`commenter`, suppliers → **no Google permission at all**.

---

## 4. Domain model

All documents are validated with Zod in `shared/src/schemas.ts`. Timestamps are **epoch
milliseconds** (numbers), never Firestore Timestamps.

| Collection | Key fields | Notes |
|---|---|---|
| `users/{uid}` | `email`, `displayName`, `role`, `googleEmail?`, `supplierId?` | function-write only |
| `suppliers/{id}` | `name`, `contactEmail?`, `country`, `isIsraeli`, `status`, `domainTags[]` | master data; email optional (FR-A9) |
| `templates/{type}` | `title`, `googleTemplateDocId`, `sourceUrl`, `bodyTemplate`, `params[]`, `examples[]`, `skillMd` | one per tender type |
| `tenders/{id}` | `title`, `type`, `params{}`, `status`, `googleDocId`, `docExportPath`, `ownerUid`, `submissionDeadline`, `awardDate`, `awardedSupplierId`, `comparisonReport`, `domainTags[]`, `evaluationCriteria[]` | |
| `tenders/{id}/access/{principalId}` | `principalId`, `kind` (supplier\|internal), `level` (view\|comment\|edit), `displayName`, `grantedBy`, `grantedAt` | one doc per grantee |
| `tenders/{id}/questions/{qid}` | `text`, `clusterId`, `answered`, `createdAt` | **anonymous** — no asker identity (FR-Q6) |
| `tenders/{id}/questionAuthors/{qid}` | `questionId`, `supplierId`, `supplierName` | identity; internal + own-supplier read only |
| `tenders/{id}/answers/{aid}` | `clusterId`, `questionIds[]`, `text`, `answeredBy` | one answer serves a cluster |
| `tenders/{id}/submissions/{supplierId}` | `supplierName`, `files[]`, `summary`, `status` (editable\|locked), `submittedAt` | doc id **is** the supplier id |
| `auditLog/{id}` | `entityType`, `entityId`, `tenderId?`, `actorUid`, `actorName`, `action`, `prevState`, `newState`, `detail?`, `at` | append-only |

**DM-1 [B]** A template's `params[]` is a declarative field schema (`key`, `labelHe`,
`type: text|number|date|textarea`, `required`) so the create form renders dynamically per tender type.

**DM-2 [B]** `templates.examples[]` (reference "good bid" links) and `templates.skillMd` (per-type
"bid manager skill" guidance in Markdown) exist to feed the AI drafting agent.

---

## 5. Tender lifecycle (finite state machine)

**FSM-1 [B]** Statuses, in order: `draft` → `internal_review` → `ready` → `published` →
`responses` → `evaluated` → `awarded`.

**FSM-2 [B]** Legal transitions only (`shared/src/tender.ts`):
```
draft            → internal_review
internal_review  → ready | draft
ready            → published | internal_review
published        → responses
responses        → evaluated
evaluated        → awarded | responses
awarded          → (terminal)
```

**FSM-3 [B]** `transition()` in `functions/src/stateMachines/tenderFsm.ts` is the **only** writer of
`status`. It validates legality, persists, and appends an audit entry. No client may set status;
Firestore rules deny all writes to `tenders/*`.

**FSM-4 [B]** Automatic transitions: the **first** supplier submission moves `published → responses`;
`runComparison` moves `responses → evaluated`; `awardTender` moves `evaluated → awarded`.

**FSM-5 [B]** Manual transitions (manager buttons in the workspace): send to review, mark ready,
publish.

---

## 6. Functional requirements

### 6.1 Templates (תבניות)

**FR-T1 [B]** One template per tender type (`goods`, `service`, `project`). A tender cannot be
created for a type with no template.

**FR-T2 [B]** The system can **create a private, system-owned Google Doc** as the template for a type
(`createTemplateDoc`), owned by the OAuth account, never publicly shared. The manager opens it in
Google Docs and edits it natively.

**FR-T3 [B]** **Field auto-detection**: `syncTemplateFields` reads the template Doc back via the Docs
API and extracts `{{placeholder}}` tokens (Unicode-aware, so Hebrew placeholders like `{{גוף_מזמין}}`
work) into `params[]`, which drive the create form.

**FR-T4 [B]** The manager curates per-type **reference examples** (title + URL) and a **skill
markdown** guidance document (`updateTemplateMeta`), with in-app Markdown preview and `.md` upload.

**FR-T6 [B]** **Template size limit.** A `templates/{type}` document holds the full bid body plus
the skill file, against Firestore's hard 1 MiB per-document cap. `assertTemplateFits`
(`functions/src/repositories.ts`) rejects writes above a 900 KB budget with an actionable Hebrew
message instead of an opaque Firestore rejection. Measured headroom: an 80-page Hebrew template is
~160 KB (15% of the limit); Hebrew costs ~1.8 bytes/char in UTF-8, so the ceiling lands near
500 pages of template + skill combined.

**FR-T7 [D]** **Previous bid documents are links only, never ingested.** `templates.examples[]`
stores `{title, url}` and `draftBidContent` passes `JSON.stringify(examples)` into the prompt — so
the model sees titles and URLs it has no tool to open. Reference bids currently contribute
**nothing** to a draft. Inlining them raw is not viable: measured at ~62k tokens for one 80-page
document, three reference bids plus the template overflow the 200k context (~279k). Ingestion
would need distillation at upload time (store a summary, not the raw text).

**FR-T5 [D]** **Link an existing Google Doc as the template** (paste a URL instead of letting the
system create one). Fully planned in `rustling-drifting-squid.md` — requires upgrading the OAuth
account to the restricted full `drive` scope, reworking `bindTemplateGoogleDoc` to read via
`readTemplateDocText` instead of the public `/export?format=txt` endpoint, and a paste-URL UI.
**Not implemented**: the callable still uses the public export path and the Templates UI still
offers only "create doc". Accepted tradeoff was a weekly refresh-token re-consent while the OAuth
app stays in Testing.

### 6.2 Tender creation

**FR-C1 [B]** Manager-only. Choose type → dynamic form from the template's `params` → create.
Status starts at `draft`.

**FR-C2 [B]** On create the system generates the tender document from the type's template:
**copies** `googleTemplateDocId` (preserving Google Docs formatting) and `replaceAllText` for each
`{{param}}`; falls back to creating a Doc from `bodyTemplate` text when no template Doc exists.

**FR-C3 [B]** The creating manager is granted `edit` access and Google Docs `writer` automatically.

**FR-C4 [B]** **AI draft from a brief** (`draftBid`): the manager types a free-text brief → Claude
returns title, filled `params`, `domainTags[]`, `submissionDeadlineDays`, `awardDays`, and
`evaluationCriteria[]` (weights summing to 100) — grounded in the type's template structure,
`skillMd`, and `examples`. The result **prefills the form**; it is non-binding and fully editable.

**FR-C5 [B]** `evaluationCriteria[]` captured at creation becomes the rubric later fed to
`runComparison`.

**FR-C6 [B]** **Context budget for AI drafting.** Large templates are handled explicitly rather
than by luck:
- The template body + skill file + examples are sent as a **cache-controlled prefix**; the brief
  and param keys follow as the variable tail. Verified: a second draft of the same bid type reuses
  30,702 cached tokens with only 420 uncached input tokens.
- Output ceilings raised (`draftBid` 16000, comparison/clustering 8000). Verified failure at the
  old limit: a template with only **32 unique placeholders** hit `stop_reason: max_tokens` at 2000
  tokens and **silently lost `evaluationCriteria`** — the rubric that later feeds `runComparison` —
  because `draftBidContent` coerces missing fields with `?? []`.
- `toolInput` now **rejects** any response with `stop_reason === 'max_tokens'` rather than
  returning a half-built object, so truncation surfaces as the labelled fallback instead of
  silent data loss.
- Timeouts raised to 300s on `draftBid`, `runComparison`, `clusterTenderQuestions` and
  `searchSuppliers`. Measured: 33–51s for an 80-page template at 32 params, against the 60s
  default.

Measured reference points (real tokenizer, `claude-opus-4-8`): 80-page Hebrew template ≈ **62k
tokens** / ~160 KB; 10-page skill file ≈ **7.7k tokens**; full draft prompt ≈ **70k tokens**, ~35%
of the 200k context.

### 6.3 Document handling

**FR-D1 [B]** Two document modes behind a flag:
- **Dev/emulator mode** (default): renders `bodyTemplate` to styled RTL HTML stored in Storage,
  served through a Cloud Function. No Google Workspace needed.
- **Real Google Docs mode**: active when `GOOGLE_OAUTH_REFRESH_TOKEN` is present or
  `USE_GOOGLE_DOCS=true`. Authenticates as a dedicated Google account via OAuth refresh token
  (a service account has no Drive quota, so OAuth is required).

**FR-D2 [B]** Real mode is **force-disabled under the emulator** (`FUNCTIONS_EMULATOR === 'true'`)
so local tests stay hermetic even if secrets are present.

**FR-D3 [B]** **Suppliers never receive a Google Docs link.** `getTenderDocument` authorizes the
caller and returns the content inline (HTML string in dev, base64 PDF in real mode). Storage stays
private; no public URLs.

**FR-D4 [B]** **PDF caching at publish**: transitioning to `published` exports the Doc to
`tenders/{id}/document.pdf` and sets `docExportPath`; the viewer serves the cached file
(~400 ms warm vs multi-second live export). The manager can re-export after edits via
`refreshTenderDocument`.

**FR-D5 [B]** Internal reviewers get Google Docs `commenter` on the tender doc. Native Google
commenting requires real Google accounts, so each internal user carries a separate `googleEmail`
(FR-A7); users without one are skipped and surfaced in the UI rather than failing silently.

**FR-D6 [B]** Real Google Docs mode is **ON in production**. `realMode()` is satisfied by the
presence of `GOOGLE_OAUTH_REFRESH_TOKEN`, which is bound as a secret to every doc-touching
function (verified against the deployed `createTender`), so `USE_GOOGLE_DOCS` does not need to be
set. *(Corrected 2026-09-24 — this section previously claimed the opposite.)*

**FR-D7 [B]** Internal roles get an **"פתח ב-Google Docs"** link on the document tab so they can
comment and suggest in the Doc itself. The link is gated on `isInternalRole` and is never rendered
for suppliers — they keep the in-system render only (PD-2).

### 6.4 Access, sharing, and supplier sourcing

**FR-A1 [B]** Manager-only `grantAccess` shares a tender with N suppliers (`view`) and N internal
reviewers (level from `DEFAULT_INTERNAL_ACCESS` — manager `edit`, everyone else `comment`), writes
one `access` doc per principal, syncs Google Docs permissions for internal emails, and audits each
grant.

**FR-A2 [B]** **Registered supplier ranking**: candidates are ranked by domain-tag overlap with the
tender's `domainTags`, Israeli-first, with matched tags shown as chips.

**FR-A3 [B]** **AI external sourcing** (`searchSuppliers`): Claude proposes up to 8 real-world
candidate suppliers for the tender's domains, Israeli companies first, each with a Hebrew rationale
and optional website. Results are explicitly **unverified**; the manager can one-click
"add to registry" which opens the supplier form prefilled.

**FR-A4 [D]** **Revoking access.** Rules reserve it (`// function-only (grantAccess / revokeAccess)`)
but no `revokeAccess` callable or UI exists. Access is currently additive only.

**FR-A5 [B]** **Every internal user is granted access to the bid document at creation.**
`createTender` writes an `access` doc for each internal user using `DEFAULT_INTERNAL_ACCESS` and
syncs Docs permissions in one call — no manual assignment step is required first. A single
`auto_grant_internal` audit entry summarises the grant (the `access` docs are the per-user record).

**FR-A6 [B]** **Only the bid manager may accept changes.** Enforced through the Google permission
split: `tender_manager` → Docs `writer`, every other internal role → Docs `commenter`. A commenter
can comment and propose tracked suggestions but cannot accept or reject them; only a writer can.
`splitDocsRecipients` in `functions/src/index.ts` is the single place this split is decided, and
the E2E test asserts no non-manager ever holds `level: 'edit'`.
*Consequence to be aware of: reviewers propose rather than type directly — Google has no
permission level that allows direct editing while withholding accept rights.*

**FR-A7 [B]** **`googleEmail` per internal user.** The internal-user form captures an optional real
Google address alongside the OBMS login. Docs grants resolve **only** from `googleEmail`
(`googleIdentityOf`) — there is deliberately no fallback to the OBMS login, because granting on a
non-Google address always fails and fires a stray notification email. Users without one are
returned in `docsSkipped` and flagged in the users table and the access panel.

**FR-A8 [B]** **AI sourcing discovers supplier contact details.** `suggestExternalSuppliers` runs
two steps: a research call with Anthropic's server-side **web search** tool, then a forced-tool
call that structures the findings. It returns `contactEmail`, `country`, `sourceUrl` and `website`
per candidate. The model is instructed to omit `contactEmail` entirely when no real address was
found — a guessed address would send bid invitations to a stranger. Results stay unverified and are
labelled as such in the UI. `searchSuppliers` runs with `timeoutSeconds: 300` because the research
step routinely exceeds the 60s default.

**FR-A9 [B]** **Contact email is optional for a registry entry, required for a login.**
`supplierDocSchema.contactEmail` and `upsertSupplierInput.contactEmail` are optional (an empty
field normalises to `undefined`), so an AI-sourced supplier with no discoverable address still
saves. `createSupplierAccount` throws `failed-precondition` with a Hebrew message when the address
is missing, and suppliers lacking one show a "חסר דוא״ל" chip.

### 6.5 Clarification Q&A (שאלות הבהרה)

**FR-Q1 [B]** A supplier with access may ask a question. Questions are visible to **all** authorized
suppliers on that tender (deliberate — mirrors public clarification rounds), along with answers,
but **anonymously** — see FR-Q6.

**FR-Q6 [B]** **Clarification questions are anonymous to suppliers.** A bidder who could see who
else is asking would know who else is bidding, and two bidders who know about each other can
coordinate their responses.

Enforced by **data separation, not by the UI**: Firestore rules cannot hide individual fields, so
a supplier reading `tenders/{id}/questions/{qid}` from the SDK would see any identity stored there.
Therefore:
- `questions/{qid}` holds only `id`, `text`, `clusterId`, `answered`, `createdAt`.
- `questionAuthors/{qid}` holds the identity, readable by internal users (all) and by a supplier
  **only for their own** question — authorized on the `supplierId` field, the same pattern as
  `access` docs. This lets the UI mark "השאלה שלך" without leaking anyone else's participation.
- Both documents are written atomically by `questionsRepo.add`, and **client creation of questions
  is denied** (`allow write: if false`) — it was the one path by which a supplier could put
  identity fields back into an anonymous document. `askQuestion` is the only writer.
- The audit log keeps the real asker for accountability; `auditLog` is internal-read-only.
- Clustering sends only `{id, text}` to Claude, so no identity reaches the model.

Accepted residual risk (decided 2026-09-24): a supplier who describes themselves in the question
text self-identifies, and competitors still see in real time *what* is being asked. Manager
moderation before publication was considered and declined.

**FR-Q2 [B]** **AI clustering** (`clusterTenderQuestions`): Claude groups semantically similar
questions into clusters with a merged representative Hebrew question, so the manager answers once.
Each question id lands in exactly one cluster. Falls back to a deterministic local heuristic
without an API key.

**FR-Q3 [B]** The manager answers a **cluster**; the answer is stored once with its `questionIds[]`
and all member questions are marked answered.

**FR-Q4 [D]** **AI-drafted answers** — the manager still writes every answer by hand. Listed on the
roadmap, not built.

**FR-Q5 [D]** No Q&A deadline / cutoff, and no notification to suppliers when an answer is published.

### 6.6 Supplier submissions

**FR-S1 [B]** Each supplier has a **private submission space** per tender: multi-file upload plus a
free-text proposal summary. Files go to `tenders/{id}/submissions/{supplierId}/` in Storage.

**FR-S2 [B]** File upload is hardened in the UI: accumulating selected-files list, per-file remove,
count on the save button, and existing files listed separately.

**FR-S3 [B]** **Deadline enforcement is server-side**: `saveSubmission` rejects with
`failed-precondition` once `submissionDeadline` has passed. The UI additionally shows a live
countdown and locks the form.

**FR-S4 [B]** Submissions are `editable` until the deadline; `status` can never be changed by the
client (rules block any diff touching `status`).

**FR-S5 [B]** Storage rules cap uploads at **50 MB** per file and restrict writes to the supplier's
own folder.

**FR-S6 [D]** No file-type restriction is enforced (the legacy PRD specified PDF/DOCX/XLSX/image/ZIP).

**FR-S7 [D]** No explicit "submit/finalize" action distinct from save, and no auto-lock job — locking
is evaluated at read/write time against the deadline rather than by a scheduled transition.

### 6.7 Evaluation and award

**FR-E1 [B]** `runComparison` (manager-only) feeds all submission summaries plus the tender's
`evaluationCriteria` rubric to Claude and stores a structured `comparisonReport`: per-supplier
score (0–100), Hebrew strengths, weaknesses, rationale, and a `preferredSupplierId`.

**FR-E2 [B]** The report is explicitly labelled non-binding (`note` field rendered as a banner) and
carries `model` + `isStub` so the UI can distinguish real AI output from the fallback.

**FR-E3 [B]** Without an API key or with no proposal text, a clearly-labelled **stub** report is
produced so the flow still runs.

**FR-E4 [B]** The manager awards to **any** supplier from the report — the AI ranking is advisory,
and the award is a separate, deliberate action that sets `awardedSupplierId`/`awardDate` and moves
to `awarded`.

**FR-E5 [D]** **Rubric auto-scoring against criteria** and an **AI-drafted award rationale** document
are on the roadmap, not built.

**FR-E6 [D]** Evaluation reads only the submission `summary` text — **uploaded files are never
parsed**. The AI never sees the actual proposal documents.

### 6.8 Case file, reports, audit

**FR-V1 [B]** **תיק מכרז (case file)** is the first tab of the tender workspace: one consolidated
view of document, parties, submissions + files, Q&A counts, comparison result, and the
tender-scoped audit trail.

**FR-V2 [B]** Workspace tabs: case · overview (raw params) · document · access · questions ·
evaluation (evaluation appears only in `responses`/`evaluated`/`awarded`).

**FR-V3 [B]** **Reports page** with KPI tiles (total tenders, published, total suppliers, average
suppliers per tender) and four charts: status distribution (pie), type distribution (bar), response
funnel (shared vs submitted per tender), reviewer wait times, supplier profile (shared vs submitted).
Each table section exports **CSV**; the whole page prints to PDF.

**FR-V4 [B]** **Audit trail**: every privileged action appends an immutable entry —
`create`, `status_change`, `share_supplier`, `assign_reviewer`, `ask_question`, `answer_questions`,
`submit_proposal`, `run_comparison`, `award`, `set_role`, `create_internal_user`,
`delete_internal_user`, `create_supplier`, `update_supplier`, `create_supplier_account`,
`bind_template`, `create_template_doc`, `sync_template_fields`, `update_template_meta`,
`refresh_document`. Readable by all internal roles, writable only by functions.

**FR-V5 [B]** The dashboard lists all tenders with title, type, and status badge; "new tender" is
manager-only.

**FR-V6 [B]** Supplier portal lists **only** shared tenders, with an explicit isolation banner, an
error state, and an empty state.

---

## 7. Security requirements

**SEC-1 [B]** Firestore rules default-deny everything; every collection is explicitly opened for
narrow reads only. All writes are `if false` except two narrowly-scoped supplier submission paths.

**SEC-2 [B]** A supplier's access to a tender is proven by the **existence** of
`tenders/{id}/access/{supplierId}`, checked inside the rules (`exists()`), not by a client claim.

**SEC-3 [B]** `access` read rules authorize on the `principalId` **field** rather than the doc id, so
the supplier portal's `collectionGroup('access').where('principalId','==',myId)` query is legal.

**SEC-4 [B]** **Collection-group queries need their own `/{path=**}/…` rules** — nested match rules do
not cover `collectionGroup()`. Both `access` and `submissions` have explicit collection-group rules.

**SEC-5 [B]** A collection-group query filtered by a field requires an explicit **COLLECTION_GROUP
index** — `access.principalId` has one via `firestore.indexes.json` fieldOverrides. (Its absence
previously caused an infinite spinner in the supplier portal.)

**SEC-6 [B]** Every client `onSnapshot` must have an **error callback**; hooks use null guards,
`Promise.allSettled`, and `finally setLoading(false)` so a permission error surfaces instead of
hanging.

**SEC-7 [B]** Storage is private by default; only supplier submission folders are client-accessible,
scoped to the owner.

**SEC-8 [B]** Secrets (`ANTHROPIC_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`) live in
**Secret Manager** and are bound per-function via `onCall({ secrets: [...] })`. Nothing is committed.

**SEC-9 [B]** All callable inputs are parsed with Zod (`parseInput`) before use; role checks
(`requireAuth` / `requireInternal` / `requireManager`) run before any side effect.

**SEC-10 [B]** Error messages surfaced to users are in Hebrew.

---

## 8. Non-functional requirements

**NFR-1 [B]** Hebrew-only UI, full RTL, Tailwind + i18next, `he-IL` date formatting.
**NFR-2 [B]** Monorepo with npm workspaces; strict build order `shared → functions → web`.
**NFR-3 [B]** Cloud Functions v2, Node 20, ESM, region **europe-west1**, `maxInstances: 10`.
**NFR-4 [B]** Firestore in **eur3**; Firebase project `biding-system` on the Blaze plan.
**NFR-5 [B]** Live at `https://biding-system.web.app`.
**NFR-6 [B]** Functions are **esbuild-bundled** (`src/index.ts` → `lib/index.js`) with `@obms/shared`
inlined, and `@obms/shared` is deliberately absent from `functions/package.json` — Cloud Build runs
`npm install` and would 404 on the unpublished workspace package.
**NFR-7 [B]** The tender-document hot path for suppliers must serve a cached PDF, not a live export.
**NFR-8 [B]** Tests: 7 Firestore-rules tests + a full E2E callable flow (create → share → supplier
in-system view → isolation → cluster → answer) runnable on the emulator suite.
**NFR-9 [B]** Live verification scripts exist per feature: `livesmoke.mjs`, `claudelive.mjs`,
`verifydocs.mjs`, `verifycache.mjs`, `verifyagentic.mjs`, `verifyusers.mjs`, `verifyportal.mjs`,
`verifytemplatedoc.mjs`, `oauth-bootstrap.mjs`.
**NFR-10 [B]** Models: clustering `claude-sonnet-4-6`, comparison/draft/sourcing `claude-opus-4-8`,
both overridable by env var.

---

## 9. Legacy v1.0 PRD requirements NOT carried into the rebuild

These were demonstrated in the original static prototype (`index.html` / `supplier.html`, see the
coverage table in `README.md`) and are absent from the Firebase system. They are the most likely
scope for a revision.

| Legacy ref | Requirement | Status |
|---|---|---|
| FR-03 | **Artifact versioning** — version history strip for bid documents | **[L]** no versioning of tenders, docs, or submissions |
| FR-04 | **Structured internal feedback** — per-reviewer comments with a *Blocking* flag and *Complete* status | **[L]** replaced by Google Docs comments; no in-system review board, no blocking gate |
| FR-05 | **Per-department review queue/dashboard** | **[L]** reviewers see the same dashboard as everyone |
| FR-08 | **Supplier self-registration + approval workflow** | **[L]** suppliers are created manually by the manager only |
| FR-11 | Deadline **auto-lock** as an event | **[P]** enforced at write time, no scheduled lock |
| FR-15 | **Notifications** (publish, assignment, answer published, deadline approaching) | **[L]** nothing exists — no email, no in-app inbox |
| §6.2 | **Blind review / anonymization** (suppliers shown as A–D until de-anonymized) | **[L]** not implemented |
| §5.5 | Human oversight of AI | **[B]** carried over (non-binding banner + manual award) |

Explicitly **out of scope** in v1.0 and still out: contract management, payments, ERP integration,
native mobile.

---

## 10. Known gaps, blockers, and environment constraints

**G-1 [D]** `beforesignin` blocking function disabled — needs Identity Platform (GCIP) enabled by the
project owner. While it is exported, *every* full functions deploy aborts, so deploys must be scoped
(`--only functions:<name>,hosting`).

**G-2 ~~[D]~~ resolved/incorrect** — Google Docs real mode is **on** in production; see FR-D6.
The remaining Google risk is token durability: `GOOGLE_OAUTH_REFRESH_TOKEN` is still at secret
version 1 (2026-06-29) and was working on 2026-07-25, which implies the OAuth consent screen is
published rather than in Testing. If Docs calls start failing, re-run `functions/oauth-bootstrap.mjs`.

**G-3 [D]** The "link an existing Google Doc template" plan (FR-T5) is unimplemented.

**G-4 ~~[P]~~ resolved** by FR-A7 — internal users now carry a real `googleEmail`. Residual: a user
without one still gets no Doc access (surfaced in the UI, not silent).

**G-5** Roadmap items never built: AI-drafted Q&A answers, rubric auto-scoring, AI award rationale,
approval-gated orchestrator, example-bid content ingestion.

**G-6 (ops)** `~/.npm` contains root-owned files → `npm install` fails with EACCES. Workaround:
`--cache /tmp/obms-npm-cache`. Permanent fix needs `sudo chown -R 501:20 ~/.npm`.

**G-7 (ops)** No system Java → emulators require the no-sudo Temurin JDK at
`~/.local/jdk/jdk-21.0.11+10/Contents/Home` with `JAVA_HOME`/`PATH` exported.

**G-8 (ops)** The Firebase CLI prefers the logged-in user over `GOOGLE_APPLICATION_CREDENTIALS`;
deploys effectively run as the project Owner. `firebase login` needs a real TTY + browser and must be
run by the user in their own terminal. Deploying as the service account additionally requires
`roles/iam.serviceAccountUser` on both the appspot and compute service accounts plus
`roles/firebase.admin`.

**G-9 (ops)** Callables deployed by a service account are not publicly invokable; the Owner must
grant `allUsers` `roles/run.invoker` per function or calls 403.

**G-10 (repo)** This project is **not under version control** — `/Users/amiramcto/Documents/bid-system`
is untracked inside the `~/Documents` git repo, whose `origin` points at an unrelated repository.
Nothing here is backed up or diffable.

---

## 11. Verification baseline

```bash
# build order matters
npm run build:shared && npm run build:functions && npm run build

# security rules (7 tests)
npx firebase emulators:exec --only firestore "npm run test --workspace functions"

# full end-to-end callable flow
npx firebase emulators:exec --only auth,firestore,functions,storage \
  "npm run seed && node functions/lib/test/e2e.js"

# local app
npm run dev:web        # emulator-targeted
VITE_USE_EMULATOR=false npm run dev:web   # against live
```

Seeded demo accounts (emulator): `manager@obms.test`, `legal@obms.test`, `finance@obms.test`,
`security@obms.test`, `requester@obms.test`, suppliers `a@aegis.test`, `b@meridian.test` —
all with password `password`.

---

## 12. Revision log — new requirements, decisions, and tasks

Append-only. Newest entries at the top. Each entry gets a date, an ID, and a status tag; once a
requirement is settled it also gets promoted into the matching `6.x` / `7` / `8` section above.

| Date | ID | Type | Status | Description |
|---|---|---|---|---|
| 2026-09-24 | REV-015 | task | [D] | **Migration pending.** `functions/migrate-anonymize-questions.mjs` must run (with `--apply`) before the new rules deploy. Dry run against live found **4 existing questions still carrying asker names**, from two suppliers on the same tender — the exact exposure this change closes. |
| 2026-09-24 | REV-014 | requirement | [B] | Clarification questions are anonymous to suppliers (FR-Q6). Identity split into `questionAuthors`; client-side question creation denied; manager retains full visibility. |
| 2026-09-24 | REV-013 | task | [D] | **Previous bid documents are not actually used** (FR-T7). Decide how to ingest them: distil each reference bid to a summary at upload time, or attach them only to a dedicated retrieval step. Inlining raw overflows context (measured ~279k tokens for 3 bids + template vs a 200k window). |
| 2026-09-24 | REV-012 | requirement | [B] | Template writes are size-guarded against Firestore's 1 MiB document cap (FR-T6). |
| 2026-09-24 | REV-011 | requirement | [B] | AI output truncation is now detected rather than silently absorbed — `toolInput` rejects `stop_reason: max_tokens` (FR-C6). |
| 2026-09-24 | REV-010 | requirement | [B] | Prompt caching for the template/skill prefix, and AI callable timeouts raised to 300s (FR-C6). |
| 2026-09-24 | REV-009 | bug | [B] | **Silent rubric loss.** With an 80-page template, `draftBid` hit its 2000-token output ceiling and dropped `evaluationCriteria` without error — the rubric that feeds `runComparison`. Found by measuring the real 80-page case rather than the seed templates (which are 264 chars). Ceilings raised and truncation now throws. |
| 2026-09-24 | REV-008 | task | [D] | Confirm with real reviewers that "comment + suggest" is acceptable in place of direct editing (the trade-off accepted in REV-003). |
| 2026-09-24 | REV-007 | correction | [B] | Corrected FR-D6 / G-2: Google Docs real mode is **on** in production, not off. The earlier claim came from stale notes; verified against the deployed `createTender` secret bindings. |
| 2026-09-24 | REV-006 | decision | [B] | AI calls are now **hermetic under the emulator** (`getClient()` returns null unless `ALLOW_REAL_AI_IN_EMULATOR=true`). The emulator was pulling the real `ANTHROPIC_API_KEY` from Secret Manager and hitting the live API during tests — slow, billable, non-deterministic, and it timed out `searchSuppliers` once web search was added. |
| 2026-09-24 | REV-005 | requirement | [B] | Adding an AI-suggested supplier no longer asks for an email: the sourcing agent discovers it via web search (FR-A8) and the field is optional (FR-A9). Root cause of the reported save failure confirmed — `prefill` never carried `contactEmail` while `upsertSupplierInput` required a valid one, so the callable rejected with `invalid-argument`. |
| 2026-09-24 | REV-004 | requirement | [B] | Internal users carry a real `googleEmail` for Docs permissions (FR-A7); Docs grants no longer fall back to the non-Google OBMS login. |
| 2026-09-24 | REV-003 | decision | [B] | **Only the bid manager accepts changes** is implemented as the Google writer/commenter split (FR-A6). Google has no permission level allowing direct editing while withholding accept rights, so reviewers *suggest* rather than type directly. Chosen over giving everyone Editor (unenforceable) or building an in-system redline layer (large build). |
| 2026-09-24 | REV-002 | requirement | [B] | Every internal user is granted bid-document access at creation (FR-A5), with an internal-only link into the Doc (FR-D7). |
| 2026-09-24 | REV-001 | decision | [B] | `SPEC.md` established as the single running record for this project. All new requirements and tasks are recorded here (see the maintenance rule at the top). |

### Open tasks

- **REV-015** — run the question-anonymisation migration before deploying the new rules; until
  then existing questions still expose their asker.
- **REV-013** — decide how previous bid documents should feed the drafting agent (FR-T7). They are
  stored as links today and contribute nothing.
- **REV-008** — validate the suggest-don't-edit trade-off with real reviewers.
- Deploy REV-002…REV-006 to production (scoped deploy; see §10 G-1).
- Live-verify Docs permissions with a real Google account and live-verify web-search sourcing —
  neither can be exercised on the emulator (AI is hermetic there, and Docs runs in dev/HTML mode).

