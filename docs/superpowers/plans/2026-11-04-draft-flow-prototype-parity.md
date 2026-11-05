# Draft → document → approvals: prototype parity — Implementation Plan

> **For agentic workers:** work task by task, in phase order. Each task lists the prototype lines to match, the exact Hebrew strings, the backend contract and the tests. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the tender workspace (draft, document, supervising agent, approvals, lock), the "לטיפולך" home list and the procurement completion screen look and behave exactly like `docs/blm-prototype 19.html`, on top of the real Firebase backend.

**Precedence rule (user decision, 2026-11-04):** when the prototype and `docs/design-specs.md` disagree, **the prototype wins**. The spec is used only where the prototype is silent and the spec does not contradict it. Spec-only features that have no counterpart in the prototype are listed in §8 and are **not built** unless confirmed.

**Architecture:** every piece of prototype logic that decides a label, a state or a list (stage, header button, approvals card, findings lists, home items) becomes a pure function in `shared`, unit-tested row by row against the prototype tables below. The backend gains:

- a shared, server-side agent run state with progress;
- stable finding keys plus per-finding decisions (apply / leave as is);
- approvals that open as soon as the document exists, with a lock.

The web app is restyled to the prototype's tokens and components, and becomes a thin layer over the shared view functions.

**Tech stack:** TypeScript, zod (`shared`), Firebase Functions v2 (`functions`), React + Vite + Tailwind + react-i18next (`web`), `node --test` (the web package has no test runner, so logic lives in `shared`).

**Sources:**

- Prototype: `docs/blm-prototype 19.html`. CSS is at lines 7–1397, HTML at 1398–1730 and JS at 1731–3486. Line numbers below refer to this file.
- Spec: `docs/design-specs.md` (secondary).
- Current code, as of branch `feat/single-tender` with uncommitted `DraftReview.tsx`, `draftRender.ts` and the `supervisorService.ts` changes.

**Status: DRAFT.**

- D1 is decided, D1a–D1d included.
- D1–D7 and D9 are decided; D8 is built provisionally. No blocking decision is left open.
- Phase A and Phase C can start now.

**Progress (2026-11-04):**

- **Phase A done:**
  - `shared/src/workspaceLabels.ts` and `shared/src/workspaceView.ts`, exported from `shared`;
  - 36 table-driven tests in `functions/src/test/workspaceView.test.ts`;
  - the full unit suite passes (236/236, without the emulator-only `rules.test`).
- **Phase C done:**
  - tokens and component classes in `web/src/index.css`;
  - `web/tailwind.config.js`: font, 4px radius, palette fallbacks;
  - Google Fonts removed from `web/index.html`;
  - components in `web/src/components/agent/`: AgentAvatar, ThinkingBox + `usePacedStep`, AgentChip / SeverityChip / ApprovalTag / StageTag, HeaderTip, ChatDock context, PersonChip.
  - Not wired into screens yet (Phase D).
  - Typecheck and production build pass.
- **Deviations, noted for review:**
  - Tailwind keeps hex colours instead of pointing at the CSS variables: the app uses opacity modifiers such as `bg-accent/30`, which break with plain variables. The values are identical.
  - Disabled buttons keep pointer events, so the title explaining why still shows (the prototype sets `pointer-events:none`).
  - HeaderTip shows on hover only, as in the prototype. Keyboard focus is S8, still unconfirmed.
  - Button text is weight 400, as in the prototype (it was 600).
- **D1 + D2 done, with the decided part of B4** (uncommitted, built on the in-progress work):
  - `TenderHeader` follows the prototype: title row, approvals indicator and card with approve on behalf, the main button with its tooltip, the stage bar with hover cards, and restyled tabs.
  - `TenderWorkspace` drives them from `headerAction` / `approvalsView` / `stageBar` / `stagePopover`.
  - Backend: `shared/src/approvalRules.ts` (approvals open once the document exists, legal after requester and finance, approve on behalf with a reason, a blocking finding stops approvals). `approveTender` uses it; `transitionTender('ready')` goes straight from the draft, refuses while blocking, and sets `lockedAt`; `regenerateDocument` clears approvals.
  - New FSM edge `draft→ready`.
  - Tests: 11 in `approvalRules.test.ts`, 2 more in `workspaceView.test.ts`; the unit suite passes 247/247.
  - `e2e.ts` is updated for the new flow but not run (emulators were in use).
  - **Interim, until the rest lands:**
    - Security still blocks: D2 is pending, so the UI passes the case's required roles as approver roles.
    - Agent "running" covers only runs started in this browser (B1); a stale draft check shows as not run.
    - "פתח מחדש (שכפול)" is hidden (B5).
    - The Google Doc is not set to read-only at the lock (rest of B4).
    - Procurement's publish button opens the access tab when no suppliers are picked (D8).
    - ~~The tab set is unchanged (D3 / D9).~~ Done: see below.
- **D2, D3 (tab set), D9 and the provisional D8 done:**
  - Security doesn't block (server and UI).
  - The tabs follow `visibleTabs`: סקירה · טיוטה/מסמך · סוכן מפקח (blocking count) · שאלות הבהרה (from פרסום) · הצעות והשוואה (from הצעות).
    - "שיתוף והרשאות" and "תיק מכרז" are hidden.
    - פעילות and היסטוריית גרסאות are left out until D10.
  - The publish dialog holds the supplier picker.
  - `e2e.ts` covers the approval rules and D2.
- **Verification:**
  - Unit suite 248/248.
  - The e2e ran against the developer's running emulators. Every check passed, including the new approval checks: no send step, legal after requester and finance, on behalf with a reason, blocking stops approvals, security doesn't block, manager last. The only failures were leftovers from earlier runs: an awarded tender shared with meridian, and 2 unnumbered tenders.
  - `e2e.ts` now forces the emulator hosts, so a direct run can't reach live storage.
  - A clean run needs a fresh emulator: `firebase emulators:exec`.
- **M2, the agent in the draft (B1–B3, D5, D7, D8):**
  - **B1:** `tender.supervisionRun` (claimed in a transaction; a person's run can't overlap another; the step is written at the real phases); the UI shows "running" to everyone and paces the steps at least 1 s each.
  - **B2:**
    - Every finding has a stable `key` (`withFindingKeys`), a Hebrew `fix` (`fixHe` from the AI, or `RULE_FIX_HE`) and a Hebrew location.
    - `decideFinding` records decisions on warnings only; `reconcileDecisions` runs after each check.
    - **Safety change:** decisions never clear a blocking finding; it goes only when a check no longer finds it. So a blocking finding offers "ערוך שדה", not "הטמע".
  - **B3:**
    - A draft's empty asked fields are one `MISSING_INFO` warning.
    - `generateDocument` prints empty fields as blank lines, a required one with its label (`requiredBlank`).
    - The rules re-check right after each draft edit (stage `edit`, AI findings carried over), so the gate is always current.
    - A required blank blocks at `prepublish` / `refresh`.
  - **UI:**
    - The draft tab follows the prototype: page, banner and marks (`DraftPage`), the editor under it (D4), and `FindingsPanel` in a sticky 400px column, which also sits beside the document.
    - Apply = decision, then the proposed value; jump-to-fix scrolls the canvas only.
    - The document check starts after "יצירת מסמך".
  - **Tests:** unit 257/257; the e2e passed in full on fresh emulators.
  - **Still open:**
    - Server-side auto-run triggers (B1): the browser still starts the first draft check and the document check.
    - Template default values for "fill the empty fields" (gap G20).
    - The agent tab (D9) and the document viewer restyle (D6).
    - `DraftReview.tsx` is no longer used.
    - ~~`DraftReview.tsx`~~ deleted (with `SupervisorPanel.tsx`, replaced by AgentReport). No visual check in the browser yet.
- **D9, D6, F1, E1 and B7:**
  - **D9:** `AgentReport` is the agent tab (prototype renderAgent).
  - **D6:** `DocView` is the workspace document view (banner, toolbar with zoom, fit, page, search and print, canvas, jump inside the frame). Suppliers keep `DocumentViewer`.
  - **F1:**
    - The completion screen hides the field form (`FIELDS_IN_DRAFT`) and shows the prototype's team section (requester, procurement, security "לא נדרש / שלח לגוף").
    - "אישור ויצירת טיוטה" waits for the AI draft, then creates the tender.
    - Server: blank required fields and an empty deadline are allowed in the draft. A template with deadline-driven dates can't be published without a deadline.
  - **B7:** `unitRequests` on the case, `unitQueue` and `claimTeamSlot` callables; `setTeamSlot` is shared with `assignTeamMember`.
  - **E1:** "לטיפולך" on the home (`PendingList` + `pendingItems`). Approvals, unit assignment with a select, `?tab=` deep links; the requester's draft "seen" mark is kept in the browser.
  - **Verification:** unit 257/257; **e2e passed in full on a fresh emulator** (`emulators:exec`), including the unit-contact check.
  - **Deviations:**
    - Every "לטיפולך" row button is the soft pill: the prototype's final CSS overrides the first row's filled button.
    - "בקשת משתתף נוסף מגוף" is hidden (no backend).
    - The security unit's text "גוף אבטחת המידע" is new.
- **B1 auto-run (decided 2026-11-04: on the server):**
  - The Firestore triggers `superviseOnTenderCreated` (first draft check) and `superviseOnDocumentReady` (document check once `documentStatus` becomes `generated`) call `superviseTender` as the system, stage `created`. A run someone already started makes them skip.
  - The browser no longer starts checks: the sessionStorage auto-run and the run after "יצירת מסמך" are removed. It shows the agent as starting for up to `AUTO_RUN_GRACE_MS` (45 s, `autoRunPending`) until the server claims the run.
  - Conditions live in `shared/src/autoRun.ts` (3 tests).
  - The e2e waits for the automatic checks (`waitForCheck`); unit 260/260; e2e passed in full on a fresh emulator.
- **First browser walkthrough (headless Chrome over the DevTools protocol, emulators, app next to the prototype):**
  - **Found and fixed:**
    - the sticky tender header let the content slide ~15 px under it (the page now starts below it);
    - a draft showed the empty-field warning twice (one per field plus the aggregate; only the aggregate remains);
    - a unit's colleague select was empty (the item's target didn't carry the case);
    - "עו״ד יעל" gave the first name "עו״ד" (titles are skipped);
    - the finding location "supervisor" was shown in English;
    - the regenerate hint still said "המסמך טרם נשלח לבדיקה" (there is no send step any more).
  - **Looks right against the prototype:**
    - the header (title, number, type, owner, the one filled button, approvals indicator and card with אושר / ממתין);
    - the stage bar with "ללא כנס ספקים בבל"מ זה";
    - the draft page (yellow banner with status, violet fields, "חסר – ממלא רכש");
    - the findings panel and the agent tab;
    - the completion screen's chain and request summary;
    - "לטיפולך" (stage chips, row, select, pill button).
  - **Differences that remain, by design or not yet built:**
    - the prototype's tabs פעילות and היסטוריית גרסאות;
    - the prototype's demo bar at the bottom (not part of the product);
    - the draft page shows the real template body (the prototype's mock sections);
    - on a case entered without an AI draft the agent tab marks the skills ✗ (the real state; the prototype always shows ✓);
    - the overview tab is still the old design (D4).
  - **Not yet checked visually:** the approve-on-behalf and publish dialogs, the jump animation, and a narrow window (< 1000 px).
  - Unit 261/261; the e2e passed in full on a fresh emulator after these fixes.
- **D4, the overview tab, done** (`components/overview/OverviewTab.tsx`; checked next to the prototype in both stages, draft and document):
  - the agent's one-line state (the draft strip with "למסמך", or the agent strip with "לדוח הסוכן") and the three cards — "הפעולה הבאה" with the progress pie, "הרביעייה" with the approval tags (incl. "אושר בשם" and the non-blocking security row), and "תאריכים";
  - replaces `NextActionCard` and `QuartetCard` (deleted);
  - the dates card now shows the real publication date (`publishedAt`, new, recorded when the case is published) instead of the creation date, and "לא מתקיים בבל"מ זה" for the conference;
  - role labels follow the prototype ("כספים", "אבטחת מידע").
  - e2e: asserts `publishedAt` (now verified, see below).
- **Rest of B4 and B5 — the lock and "פתח מחדש (שכפול)" done:**
  - **Lock:** the final approval (`→ ready`) also calls `lockDocument`: every user, group and domain permission on the Google Doc that can write or comment drops to reader (the manager included); the owner (the system account) keeps full access. The decision is `permissionsToLock` (3 tests). The document view says "המסמך נעול לאחר האישור הסופי. רק מנהל המכרז יכול לפתוח אותו מחדש."
  - **Reopen:** `reopenTender` (manager only, status `ready` only):
    - copies the document (a Drive copy; in dev mode a copy of the stored HTML);
    - moves the case `ready → internal_review` (audited `tender_reopened`: "נוצרה גרסה חדשה מקושרת. המקור נשאר נעול");
    - clears the approvals and the lock;
    - keeps the locked original and its approvals in `lockedDocuments`;
    - shares the new copy like a new document, and the agent checks it.
  - The approvals card's "פתח מחדש (שכפול)" asks for confirmation and calls it.
  - The permission block of `generateDocument` is now a shared helper (`grantCaseDocPermissions`).
  - **Verification:** unit 264/264; e2e passed in full — reopen denied to the requester and to an unlocked case, the new copy and the kept original, re-approval and a second lock.
  - **Not verifiable here:** `lockDocument` and the Drive copy run only against real Google Docs (dev mode returns before them), so they have not been exercised. First check on a real case after deploy: after the final approval, the manager's access to the Doc is read-only; after reopening, the new Doc is editable and the old one is still read-only.
- **D10 and B6 — the פעילות and היסטוריית גרסאות tabs done** (checked next to the prototype):
  - **פעילות** (`ActivityTab`): the case's audit log as Hebrew sentences, newest first (`shared/src/activityFeed.ts`): approvals, approval on behalf with the reason, the lock, reopen, publication, draft edits (field labels), the agent's checks, findings handled, team changes. Technical entries are left out, so no raw action code shows; the agent's rules re-checks after each draft edit are left out as noise. A unit assigning its own contact reads "שיוך לתפקיד …: <name>". No row links into the document (the audit log does not record a section).
  - **היסטוריית גרסאות** (`VersionsTab`): a table of version, date, who edited, what changed, number of changed paragraphs; "צפה" shows the text, "השווה לנוכחית" shows the changes against the current version with unchanged text collapsed. Each version now records:
    - who edited it (the Doc's last editor from Drive; the creator for version 1; "—" in dev mode and for older versions);
    - a one-line summary ("שונו 2 פסקאות · תנאי סף, ערבויות");
    - the changed-paragraph count (`versionDiff.ts`).
  - New callable `getVersionView` (internal case members only; suppliers are refused).
  - **"שחזר" is not offered** (writing an old text back into a live Google Doc has no safe backend yet).
  - **Limits:** versions are recorded when the agent checks the document, so edits made in Google Docs between two checks appear as one version; a reopened document starts with the same text as the locked one, so it adds no version until it is edited.
  - **Verification:** unit 272/272; e2e: version summaries, creator, view, compare and the supplier refusal passed; the run then failed only on the known late leftover-data assertion (the dev emulator already held an awarded tender from the previous run). ~~A full clean e2e has not been run since B6.~~ **2026-11-05: the full e2e passed on a fresh emulator** (`emulators:exec`), the versions checks included.
- **D12, the team chat dock, done** (2026-11-05; checked next to the prototype, open and closed):
  - `ChatPanel` is the prototype's dock: header "צ'אט פנימי" with "{name} · {number}" and the participants' avatars (requester, procurement, legal, finance, security; each person once), the "−" minimise button;
  - a day separator before each day's first message: "היום", "אתמול", or the date (`shared/src/teamChat.ts`, 6 tests); the bubble shows hh:mm;
  - other people's messages with avatar, name and role; the caller's own on the other side, without them;
  - `@mention` highlight (the prototype's rule: up to a space or punctuation), white and underlined in the caller's own bubble;
  - the floating button and the red unread badge as in the prototype; the placeholder "כתבו לצוות. אפשר לתייג עם @…".
  - `ChatDockProvider` is now provided by the workspace: "פנייה בצ'אט" in a person card opens the dock with "@first-name " typed and the cursor after it.
  - **Deviations:** the button sits 24px from the bottom (the prototype lifts it to 64px to clear its demo bar, which the product doesn't have); Shift+Enter still adds a line (the prototype's input is one line); the messages are the real case chat, so there are no seeded demo messages.
  - Unit 278/278.
- **E2 finding (2026-11-05):** prototype v19 defines a KPI strip (`PERS.*.strip`) and a role subtitle (`PERS.*.sub`) for each role but **renders neither on the home**: the strip data is unused, the subtitle only labels the demo role switcher, and the only `.kpis` element is on the reports screen. Prototype wins, so E2 leaves both out. The `split(/s+/)` bug of §11 is already fixed in `MyDesk.tsx` and `InternalLayout.tsx`.
- **E2, the rest of the home, done** (2026-11-05; checked next to the prototype as procurement and as a requester):
  - **"מועדים קרובים"** (`UpcomingPanel`, 340px beside "לטיפולך", the list scrolls inside the row's height): per active case and open request, the next stage (an outlined stage tag; the conference is skipped), its date, and "ממתין:" with who still holds it up. Rules in `shared/src/homeMilestones.ts` (7 tests):
    - a request waits for רכש; in עריכה the team members who haven't approved (security doesn't block), then רכש; after the lock רכש publishes; in הבהרות nobody (bids start at the deadline); in הצעות רכש;
    - **only the submission deadline is a real date** (the date "הצעות" starts); every other row shows "טרם נקבע" (new text) and comes after the dated ones;
    - a date within 3 days is red; the risk icon ("קיים סיכון: עיכוב") needs someone to wait for.
    - The footer "כל המועדים (n)" is left out: it opens the schedule screen, which is out of scope.
  - **"הבל"מים שלי"** (`HomeTenders`), replacing the separate "בקשות ממתינות" table: the open requests as אפיון rows, then the cases (up to הצעות in the list, everything but סגור in the cards).
    - Procurement: count, "רשימה" / "לפי שלב". The list: מספר (with "חדש" right after sending), שם, מנהל מכרז ("טרם שויך" for a request), שלב, רביעייה, עדכון אחרון. "לפי שלב": six columns, three cases each, "עוד n ‹" (to the all-tenders list), "אין בל"מים בשלב זה".
    - Everyone else: cards (number, type or "טרם נבחר", name, stage and %, the bar, manager and date) and "לכל הבל"מים ‹".
  - **Deviations:**
    - The "רביעייה" bar is the quartet's approval of the document, as in the workspace header. The prototype changes the roles per stage (`STAGE_APPR`) and has an "in review" state; real data records only the document approvals.
    - Under the last-update date only requests show "{who} · {what}": the prototype's who/what is generated demo data, and a case records only `updatedAt`.
    - No hover card on the bar or the date; the prototype's request row avatar for "טרם שויך" is dropped.
    - Non-managers can't read the users directory, so their cards show no manager name (as in `TenderList`).
  - Unit 285/285; typecheck and production build pass.
- **F2, the contact card, done** (2026-11-05; checked next to the prototype): `RequestSnapshot` opens with the prototype's `.reqsnap > h4` line, "הבקשה של הדורש · נשלחה על ידי {PersonChip} · {time}", and the box takes the prototype's colours. The card shows the requester's name and "דורש".
  - **Deviations:** no unit line (users have no unit field; the prototype's "אגף מערכות מידע" is demo data), and no "פנייה בצ'אט" (D14: the case and its chat don't exist yet; the prototype keeps its demo chat here).
- **With F2, every task of phases A–F is built.** Open: G20 (template default values). The three backend issues of §11 are fixed (2026-11-05, see §11).
- **UX review pack written** (2026-11-05): `docs/ux-review/2026-11-05-prototype-parity-ux-review.md`, in Hebrew, with screenshots in `docs/ux-review/img/`. It holds the two screens without a prototype design (approve on behalf, the publish dialog, with questions), every new Hebrew text not in the prototype (found from the diff since `c354e60` and checked against the prototype), the 20 proposed finding-type names for UX and legal review, open questions (§10's text items, one name for two approvals, "לחץ" vs. plural, English status codes in an error, English permission names in the publish dialog), and the decided deviations. Answers come back by item number.

---

## 0. Scope

**In scope:**

- Tender workspace for stages אפיון → פרסום:
  - header and primary button;
  - approvals indicator and card;
  - stage bar;
  - tabs;
  - overview;
  - draft page;
  - document view;
  - findings side panel;
  - agent tab;
  - jump-to-fix;
  - activity tab;
  - versions tab.
- Agent run behaviour:
  - automatic runs after the draft and after the document are created;
  - progress;
  - apply / leave as is;
  - re-run reconciliation.
- Approvals per the prototype:
  - any member approves once the document exists;
  - legal approves after requester and finance; the tender manager acts last, and can approve on behalf of a participant (D1, D1d);
  - information security does not block;
  - the document locks when all four quartet roles approved;
  - withdraw;
  - reopen by duplicating.
- Home "לטיפולך" list. The rest of the home (KPI strip, upcoming dates, bottom table) is in scope too, where real data exists.
- Procurement completion screen (`TenderCreate`): team section, "אישור ויצירת טיוטה", landing on the draft.
- Design tokens and shared components: buttons, chips, agent avatar, thinking box, tooltip, contact card, team chat dock.

**Out of scope (separate plans):**

- The later-stage tabs (פרוטוקול כנס ספקים, שאלות הבהרה, הצעות והשוואה). Their prototype content is demo data, and the conference stage has no backend at all.
- The all-tenders list and schedule screens, reports, settings and templates.
- The request-writing screen (`RequestCreate`), already aligned on `feat/request-flow-ux-parity`.
- The dark theme (the prototype has one, untested).

---

## 1. How prototype state maps to real data

### 1.1 Stage (prototype `r.stage`, lines 1741–1744) ← tender status

| Prototype stage | idx | Real source | Notes |
|---|---|---|---|
| אפיון | 0 | `bidRequests/{serial}` with `status:'open'` (no tender yet) | Shown on the home and the completion screen only |
| עריכה | 1 | `tender.status` ∈ `draft`, `internal_review` | `internal_review` stays only for legacy cases and for reopen (D1) |
| פרסום | 2 | `ready` | Document locked, waiting for publication |
| פרוטוקול כנס ספקים | 3 | — | No backend. Never shown; the stage bar always shows the note "ללא כנס ספקים בבל"מ זה" |
| הבהרות | 4 | `published` | |
| הצעות | 5 | `responses` | |
| הערכה | 6 | `evaluated` | |
| סגור | 7 | `awarded` | |

The stage bar shows the first 6 stages (`NSTEP=6`), minus the conference stage when there is no conference (lines 2406–2408).

**Progress % (proposed; the prototype only defines some of these):**

| Stage | Value |
|---|---|
| אפיון | 8 |
| עריכה, draft | 15 |
| עריכה, document exists | 30 |
| פרסום | 55 |
| הבהרות | 70 |
| הצעות | 80 |
| הערכה | 90 |
| סגור | 100 |

### 1.2 Draft / document (prototype `r.ds`) ← `tender.documentStatus`

| Prototype | Real |
|---|---|
| `draft` | `none` |
| `creating` | `generating` |
| `doc` | `generated` |

`r.draftFlow` is always true for real cases: the code is already draft-first. The prototype's legacy flow (inputs panel beside the document, lines 2142–2158) is not built.

### 1.3 Agent (prototype `r.agent`, lines 2544–2557) ← new `tender.supervisionRun` + `lastSupervision` + `findingDecisions`

| Prototype | Real (new, B1/B2) |
|---|---|
| `a.on` = draft / doc | `supervisionRun.basis` = `draft` / `document` |
| `a.state` = none / running / done | No run yet / `supervisionRun.state==='running'` / otherwise |
| `a.step` | `supervisionRun.step` (0–5) |
| `a.when` | `lastSupervision.at`, formatted `DD.MM HH:mm` |
| `a.applied` / `a.skipped` | `findingDecisions[key].action` = `applied` / `skipped` |
| `a.gone` | Derived at reconciliation: an applied key missing from the newest run is dropped |
| Finding `key` = `draft:N` | `${basis}:${fingerprint}` (B2) |

### 1.4 Roles

| Prototype | Real role | Real slot | Label change needed |
|---|---|---|---|
| דורש | `requester` | `team.requester` | — |
| רכש | `tender_manager` | `ownerUid` | No approval record; the manager's final action locks the case (B4, D1) |
| משפטי | `legal` | `team.legal` | — |
| כספים | `finance` | `team.finance` | Today "חשבות" → **"כספים"** |
| אבטחת מידע | `security` | `team.security` | Today "אחראי ביטחון" / "ביטחון" → **"אבטחת מידע"**; non-blocking (D2) |

### 1.5 Finding (prototype lines 2521–2543 vs `shared/src/supervision.ts:196-209`)

| Prototype field | Real today | Change |
|---|---|---|
| `key` | none | Add `key` (stable fingerprint, B2) |
| `sev` block / warn | `severity` block / warn / **info** | Info is not shown in the panel (D11) |
| `type` (6 codes) | `code` (25 codes) | Hebrew labels for all 25 (§9, D12) |
| `loc` | `location` (often `document` or `params.x`) | Needs a human Hebrew location ("סעיף 3 · תיאור השירות"). The AI already writes one; rules need one (B2) |
| `text` | `message` | — |
| `quote` | `evidence` | — |
| `fix` ("הצעת הסוכן", always shown) | `suggestion` (a field value only, uncommitted) | Add `fix` (Hebrew instruction) for **every** finding. AI: prompt field. Rules: static text per code (B2) |
| — | `paramKey` | Keep: used for apply and jump |

---

## 2. Decisions needed before coding

Each decision has a recommendation, which the plan assumes if it is not changed. **D1–D9 block the phases they name.**

| # | Decision | Why it is open | Recommendation | Blocks |
|---|---|---|---|---|
| D1 | **Approval model — DECIDED (user, 2026-11-04). This overrides the prototype:** the tender manager acts **last**. The manager submits the case for final approval only after everyone else has approved. In the prototype, procurement can approve at any time and legal is last. | — | Approvals open to the team as soon as the document exists; there is no send step before them, as in the prototype. Order:<br>1. Requester and finance, in any order.<br>2. Legal, once requester and finance are in (D1a).<br>3. The manager's final action, enabled only when requester, legal and finance have approved. It locks the case and moves the stage to פרסום (`ready`, D1b).<br>The manager has no approval record; the final action is the existing manager-only `transitionTender('ready')`, extended to start from a draft with a document. There is no auto-lock. Remove the separate "אשר ושלח לאישור הצוות" step. | B4, D-1 |
| D1a | **DECIDED (user, 2026-11-04):** legal approves after requester and finance | — | As decided | A3, B4 |
| D1b | **DECIDED (user, 2026-11-04):** the manager's action locks the case and moves it to פרסום; there is no further approver | — | As decided | B4 |
| D1d | **Approval on behalf — DECIDED (user, 2026-11-04):** the tender manager can approve on behalf of another participant when needed. The prototype has no such feature. | Control bypass: it needs a trail | Safeguards:<br>- A reason is **required** (at least 10 characters, like today's publish override) — **DECIDED (user, 2026-11-04).**<br>- The slot must be assigned — **DECIDED (user, 2026-11-04).** Approving on behalf of an empty slot means assigning someone first (team edit, D9).<br>- It is audited as `approve_on_behalf` and shown in the approvals card and the activity tab.<br>- It follows the same order (legal after requester and finance) and the same blocking guard.<br>- The holder or the manager can withdraw it until the lock.<br>The UI comes from the approvals card (A4) and needs a UX mock. | A4, B4, B6 |
| D1c | **DECIDED (user, 2026-11-04):** the manager's button is "אישור סופי של המכרז" (today's `ws.finalApprove`), replacing the prototype's "פרסום לרביע" | — | The other roles keep the prototype's labels | A3, A4 |
| D2 | **DECIDED (user, 2026-11-04): information security does not block.** It is assigned and may approve, as an extra participant, but the final approval and publication don't wait for it. | — | `blockingApproverRoles()` (`shared/src/team.ts`) drops `security` from the approvals the server waits for; the UI uses the same roles | B4 |
| D3 | **DECIDED (user, 2026-11-04): each unit assigns its own contact.**  **Who assigns legal and finance.** In the prototype, procurement assigns no one but itself ("אין צורך לשייך אנשים לתפקידים אחרים", line 1557). Each unit assigns its own contact from its home screen ("שיוך איש קשר", lines 1944–1951). Today the manager assigns every slot at creation, and creation requires a complete team. | Workflow change | Adopt the prototype. New callable `claimTeamSlot` (a legal or finance user assigns a holder for that role); `createTender` accepts empty legal and finance slots. Team edits by the manager stay possible (D9). | B7, E-1, F-1 |
| D4 | **DECIDED (user, 2026-11-04): option B — the field editor under the draft page, restyled.**  **Where template fields are entered.** The prototype hides the fields on the completion screen ("את שדות התבנית ממלאים בטיוטה", line 3049) but shows **no field editor** in the draft. The only way to fill fields is "הטמע" on the missing-info finding, which fills defaults. | Prototype gap | (A) Click a field mark in the draft page to edit it in a small popover. **Needs a UX mock.** Until then, (B) keep today's DraftPanel editor under the page, restyled. Do not keep the fields on the completion screen. | D-5, F-1 |
| D5 | **DECIDED (user, 2026-11-04): mark as handled and jump; a draft finding with a suggested value still writes it.**  **What "הטמע" does** when there is no field fix (most AI findings), and in the document stage. In the prototype, document findings only jump; nothing changes (spec §7.5). | Real change needs Docs API editing | Draft finding with `paramKey` + `suggestion`: write the value. Any other finding, or any document finding: **mark as applied and jump**; the user edits in Google Docs, and the next run verifies. Later, optionally, replace text via the Docs API (`replaceAllText` from `evidence` to a model `replacement`). | B2, D-7 |
| D6 | **DECIDED (user, 2026-11-04): the recommendation (server steps, at least 1 s each).**  **Thinking steps:** the prototype runs a fixed 1 s per step (6 steps). Real runs are one call of roughly 20–90 s. | No real steps today | The server writes `supervisionRun.step` at real phase boundaries mapped to the 6 labels. The client advances at least 1 s per step and holds on the step the server reached. | B1, C-3 |
| D7 | **DECIDED (user, 2026-11-04): one warning, blank lines, and the prepublish gate blocks blank required fields.**  **Empty fields in the draft.** In the prototype, empty fields are **one warning** ("…הם יופיעו במסמך כקו ריק"), and the document can still be created. Today every empty asked field leaves `{{key}}`, which is a **hard block** (`functions/src/services/supervisorChecks.ts:447-466`). | Contradicts the current gate | On draft basis, roll the empty asked fields into one `MISSING_INFO` warning. At `generateDocument`, print remaining empty fields as blank lines (`BLANK_LINE`, like unasked fields). **Plus:** the `prepublish` gate blocks a blank line in a *required* field (dates, guarantee). The prototype has no publish action, so this does not contradict it. | B3 |
| D8 | **Publishing.** In the prototype, the button at stage פרסום ("אישור סופי ופרסום לספקים ←") only opens the document tab, and there is no supplier picker anywhere. | Prototype gap; built provisionally because D9 hides the access tab | **Provisional, built:** procurement's button opens a "פרסום לספקים" dialog holding today's supplier picker, and the dialog's button publishes. A gate block shows today's audited override. Other roles open the document tab. **Needs a UX mock.** | D-10 |
| D9 | **DECIDED (user, 2026-11-04): hide "שיתוף והרשאות" and "תיק מכרז" for now**, without moving their content. | — | The tab set follows the prototype. Suppliers are picked in the publish dialog (D8). **Until relocated there is no UI for:** changing team members after creation, granting more suppliers after publication, the case summary / ScoreCard / feedback / submission files, and the audit list. | D-3, D-9 |

**Minor decisions** (the recommendation is applied unless someone objects):

| # | Decision | Recommendation |
|---|---|---|
| D10 | "בבדיקה" (light green) approval state: the prototype draws it from demo data; nothing real feeds it | Two states only, אושר and ממתין, until a "viewed" signal exists |
| D11 | Real `info` findings (the prototype has none) | Not in the panel or the counts; listed in the agent tab under "הכול" with a grey chip |
| D12 | Hebrew labels for the 19 codes the prototype does not name | Use the proposal in §9; needs UX and legal review |
| D13 | Document toolbar: the prototype icons are decorative (lines 2145–2149) | Render the same toolbar. Wire zoom −/+, fit, page indicator, search and print; render highlight, pen, erase, text, rotate, columns, save and settings disabled (comments are made in Google Docs) |
| D14 | "פנייה בצ'אט" on the completion screen: the prototype opens the tender chat, but a request has no chat | Hide the button until the tender exists |
| D15 | "פתח מחדש (שכפול)": copy the Google Doc into a new current version and keep the locked original read-only | Yes (B5) |
| D16 | Font: the prototype uses `-apple-system,"Segoe UI Variable Text","Segoe UI",Arial` (line 927); the app uses Heebo | Switch to the prototype stack |
| D17 | Lock and approval "system messages": the prototype writes them to the inputs chat, which is never visible in the new flow | Record them in the **פעילות** tab (audit), not in the team chat |
| D18 | Role gating in draft: the prototype is a single-persona demo and shows procurement's button ("הרץ סוכן מפקח", "יצירת מסמך") to every role | "הרץ סוכן מפקח" for any member (the server already allows it). "יצירת מסמך" and "טפל בממצא חוסם" disabled for non-managers, with the title "רק הרכש יכול ליצור את המסמך" |
| D19 | Backend checkpoints that the prototype does not show (`review`, `ready`, `prepublish`) | Keep them; they appear as normal runs in the agent tab |

---

## 3. Global constraints

- **Hebrew strings are verbatim from the prototype**, including terms the spec bans ("אישור סופי של המכרז"). The precedence rule overrides spec §2. The only exceptions are user decisions (D1, D1d) and strings marked *new*.
- **CSS is layered** in the prototype: dark base, a "modern" layer, a light theme, then "light refresh v3" (lines 1349–1352). The first rule `grep` finds is often overridden. **Take values from the browser's computed styles** (open the prototype, DevTools → Computed), not from the first matching rule.
- **Jump-to-fix scrolls only the page container** (`.dv-canvas` equivalent) with `scrollTo`, never `scrollIntoView`. That is prototype line 2588 and spec §10. `DraftReview.tsx:99-103` violates this today.
- **The sticky side column** must offset by the sticky tender header's height. The prototype's `top:16px` (line 266) lets it slide under the header, which is a prototype bug.
- No new runtime dependencies without need. Any that is added must come through Artifactory (`dv2cloud.jfrog.io`).
- **Tests:**
  - All new shared logic and backend logic get `node --test` tests, emitting coverage SonarQube can read (lcov).
  - No network: AI clients are `null` or fakes.
  - Each prototype table in §5 becomes a table-driven test.
- **Commits and branches:**
  - Conventional Commits.
  - The branch name per the SDLC: `feat/<JIRA-ID>-prototype-parity`. The current `feat/single-tender` has no ticket ID.
  - Never push to `main`, never force-push, never merge an MR (a human does).
- Run from the repo root: `npm run build:shared && npm run build:functions && node --test functions/lib/test/<file>.test.js`; web typecheck `npx tsc --noEmit -p web`.
- Windows checkout with CRLF files: prefer the Edit/Write tools over `sed` for multi-line edits.

---

## 4. Phases and order

```
A  shared view logic (pure, tested)        ─┐
C  web foundation (tokens, components)     ─┼─► D workspace ─► E home ─► F completion screen
B  backend (run state, decisions, approvals)┘
```

**Shippable slices:**

- **M1 = A1–A4 + C + D1–D4.** Restyle on current data, no backend change.
- **M2 = B1–B3 + D5, D7, D8.** The agent in the draft.
- **M3 = B4, B5 + D6, D9, D10.** Document, approvals and lock.
- **M4 = B7 + E + F.**

Rough sizes:

| Size | Tasks |
|---|---|
| S | A6, C1, C2, D2, D3 |
| M | A1–A5, C3, D1, D4, D6, D9, D10, E1, F1 |
| L | B1, B2, B3, B4, D5, D7, D8 |
| XL | B5 (Docs copy and lock) |

---

## 5. Tasks

### Phase A — shared view logic (`shared/src/workspaceView.ts`, tests in `functions/src/test/workspaceView.test.ts`)

#### A1. Stage, tabs and progress

- [ ] `stageOf(tender | request) → { stage, idx }` per §1.1; `progressPct(...)` per §1.1.
- [ ] `visibleTabs(stageIdx, ds)` (prototype `syncTabs`, lines 2701–2706):

  | Tab | Label | Visible from |
  |---|---|---|
  | `ov` | סקירה | always |
  | `doc` | **טיוטה** while `ds ∈ {draft, creating}`, else **מסמך** | always |
  | `agent` | סוכן מפקח | idx ≥ 1 |
  | `conf` | פרוטוקול כנס ספקים | idx ≥ 3, and only with a conference (never, today) |
  | `cl` | שאלות הבהרה | idx ≥ 2 |
  | `bids` | הצעות והשוואה | idx ≥ 5 |
  | `act` | פעילות | always |
  | `ver` | היסטוריית גרסאות | always |

  A tab that is not visible yet falls back to `ov` (line 2417).
- [ ] Badges: the agent tab shows the count of **open blocking** findings, hidden at 0. The `cl` badge shows the question count at idx 4 only.

#### A2. Findings view model (prototype lines 2549–2557)

- [ ] `findingsView(report, decisions) → { all, open, applied, skipped, blocking, chip }`.
  - `open` = not applied and not skipped.
  - `blocking` = open with `severity==='block'`.
  - Sort with blocking first (line 2674).
- [ ] `agentChip`:

  | State | Chip |
  |---|---|
  | No run | טרם הורץ |
  | Running | בבדיקה |
  | Open blocking | חוסם |
  | Open warnings | אזהרות |
  | Otherwise | תקין |

#### A3. Header primary button `headerAction(ctx)`

The context is the stage, ds, agent state, findings view, my role, my approval, approvals, `isLocked` and `isManager`.

**Draft (`ds ∈ draft/creating`; prototype `syncNext`, lines 2600–2609):**

| Condition (first match) | Label | Enabled | Click | Tooltip (`data-tip`) |
|---|---|---|---|---|
| `creating` | יוצר מסמך… | no | — | — |
| No run yet | הרץ סוכן מפקח | yes | Run the agent | — |
| Running | הסוכן בודק… | no | — | — |
| Open blocking > 0 | טפל בממצא חוסם | yes (manager, D18) | Go to the **draft tab** | — |
| Otherwise | יצירת מסמך | yes (manager, D18) | `generateDocument` | If open > 0: "שימו לב: יש {n} ממצאים שלא הוטמעו, ועדיין אפשר ליצור את המסמך"; n = 1: "…יש ממצא אחד שלא הוטמע…" (§10) |

**Document, stage עריכה (prototype `renderApr`, lines 2329–2360, changed by D1).** Blocking applies **first**, for every role: if open blocking > 0, the label is "טפל בממצא חוסם", enabled, with the title "ממצא חוסם מונע אישור סופי ופרסום", and the click goes to the **agent tab**.

| Role | Before their turn | Their turn | After acting (disabled; title = card note) |
|---|---|---|---|
| רכש (D1, D1c) | "אישור סופי של המכרז", **disabled**. Title: "הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: {X, Y}." *(new string, UX to confirm)* | "אישור סופי של המכרז": locks the case, moves to פרסום | — (the case is locked; see A4) |
| דורש, כספים | — | אישור סופי של המכרז | האישור שלך נרשם |
| משפטי (D1a) | "אישור סופי של המכרז", **disabled**. Title: "הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: {X, Y}." (the prototype string, with "הרכש" removed) | אישור סופי של המכרז | האישור שלך נרשם |
| אבטחת מידע | — | אישור (משתתף נוסף) | האישור שלך נרשם |

**Stage ≥ פרסום (prototype `NEXT_ACT`, line 2261; label = text + " ←").** The blocking rule above still applies first.

| idx | Label | Goes to |
|---|---|---|
| 2 | אישור סופי ופרסום לספקים ← | Manager: publish dialog (D8). Others: the document tab |
| 3 | העלאה ופרסום של פרוטוקול כנס הספקים ← | conf |
| 4 | אישור איחוד שאלות הבהרה ← | cl |
| 5 | השוואת הצעות הספקים ← | bids |
| 6 | בחירת ספק זוכה ← | bids |
| 7 | הבל"מ הושלם ← | act |

- [ ] One test case per row above.

#### A4. Approvals view `approvalsView(ctx)` (lines 2323–2352)

- [ ] Hidden in draft/creating and at idx < 1.
- [ ] Indicator: 4 segments (דורש, רכש, משפטי, כספים), green when approved, plus "{n}/4" and the label "אישורים". The רכש segment turns green with the manager's final action, i.e. at the lock (D1).
- [ ] Card:
  - Title "אישור סופי של המכרז".
  - Rows for דורש, רכש, משפטי, כספים, אבטחת מידע. The last role adds " · לא חוסם".
  - Each row: avatar, name, role, and a tag אושר / ממתין (D10). The approval time (`DD.MM HH:mm`) is the tag's title.
- [ ] Note (first match). Rows marked *new* are not in the prototype; they come from the D1 change and need UX wording.

  | Condition | Note |
  |---|---|
  | Locked | "המסמך נעול ומוכן לפרסום." For non-procurement roles add " רק הרכש יכול לפתוח מחדש." |
  | Mine (not procurement) | "האישור שלך נרשם · {time}" |
  | Legal, still waiting | "הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: {…}." |
  | Legal, requester and finance in | *new:* "הדורש והכספים אישרו. אחרי האישור שלך הרכש יוכל לתת אישור סופי." |
  | Security | "משתתף נוסף: האישור נרשם ואינו חוסם נעילה." |
  | Procurement, still waiting | *new:* "הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: {…}." |
  | Procurement, all in | *new:* 'כולם אישרו. לחץ על "אישור סופי של המכרז" כדי לנעול את המסמך.' |
  | Others | 'לחץ על "אישור סופי של המכרז" כשסיימת לעבוד על המסמך.' |

- [ ] Card action:

  | Condition | Button |
  |---|---|
  | Mine and not locked (not procurement) | "בטל את האישור שלי" |
  | Locked, procurement | "פתח מחדש (שכפול)" |

  The manager has no "בטל"; undoing the final action is "פתח מחדש (שכפול)".

- [ ] **Approve on behalf (D1d; *new, not in the prototype, needs a UX mock*).** For procurement, before the lock, each pending row of an assigned slot gets a quiet row action. The action is available only when that role's turn has come (legal after requester and finance).
  - Row action: "אישור בשם {first name}".
  - It opens a small dialog: title "אישור בשם {name} · {role}", a required field "סיבה (תירשם ביומן הפעילות)", and the confirm "אשר בשם {name}".
  - An on-behalf approval shows the tag "אושר בשם", with the title "אושר על ידי {manager} בשם {holder} · {time} · {reason}".
  - The holder's own button then reads "האישור שלך נרשם", and the card offers them "בטל את האישור שלי".
  - Procurement gets "בטל את האישור בשם {first name}" on that row until the lock.
  - Unassigned slot: no action, and the title "יש לשייך איש קשר לפני אישור בשמו".
  - Tests: one per rule above (shown or hidden by turn, assignment and lock).

#### A5. Home items `pendingItems(role, data)`

Prototype `stateActs` + `handoffActs0`, lines 1922–1948. Each item is `{stage, tone (r/w/g), bold, text, button, target, meta}`.

**Procurement:**

| Real state | Bold | Text | Button | Goes to |
|---|---|---|---|---|
| Open request | בקשה חדשה מהדורש: | ממתינה להשלמה שלך | השלם את הבקשה | `/requests/:serial` (meta: "{name} · נשלח על ידי {X} · {time}") |
| Draft, no run | טיוטה חדשה: | ממתינה להרצת הסוכן המפקח | הרץ סוכן מפקח | Draft tab |
| Draft, run done, blocking | ממצא חוסם בטיוטה: | יש לטפל לפני יצירת המסמך | טפל בממצא | Agent tab |
| Draft, run done, no blocking | הטיוטה נבדקה: | אין ממצא חוסם, אפשר ליצור את המסמך | יצירת מסמך | Draft tab |
| Document, blocking | ממצא חוסם בדוח הסוכן המפקח: | מונע אישור סופי ופרסום | טפל בממצא | Agent tab |
| Document, requester, legal and finance approved (D1; *new, not in the prototype, UX to confirm*) | כל הצוות אישר: | ממתין לאישור הסופי שלך | אישור סופי של המכרז | Document tab |
| Legal or finance slot empty (D3) | שיוך אנשי קשר: | משפטי: {name \| ממתין} · כספים: {name \| ממתין} | צפה | Overview |

**Requester** (their own requests; items disappear once the draft was opened, see B7 `seen`):

| Real state | Bold | Text | Button |
|---|---|---|---|
| Request open | בל"מ חדש בטיפול הרכש: | ממתין לבחירת סוג ולאישור | צפה בבל"מ |
| Approved, draft being prepared | הרכש אישר: | הטיוטה נוצרת כעת | צפה בבל"מ |
| Draft ready, not opened yet (listed first) | הטיוטה מוכנה: | הרכש אישר את הבל"ם והכין טיוטה | פתח את הטיוטה |

**Legal / finance** (D3):

| Real state | Bold | Text | Control |
|---|---|---|---|
| Their slot is empty | שיוך איש קשר: | בל"מ חדש ממתין לאיש קשר מטעם {היחידה המשפטית \| גוף הכספים} | A select ("בחר איש קשר…", users with that role) and the button "שייך" |

**Approval items:**

- [ ] Add the real "ממתין לאישורך" items that MyDesk already computes. Use the prototype pattern (`c:'ap'`, tone `w`) with the bold "אישור סופי של המכרז:" and the text "המסמך מוכן לאישורך".
- [ ] **Data gap:** the prototype's other home items are static demo data (section changes, comments, schedule exceptions and so on) with no backend event. They are not built (§7).

#### A6. Labels and fixed texts (`shared/src/workspaceLabels.ts`)

- [ ] Finding type labels (§9).
- [ ] Severity chips "חוסם" / "אזהרה".
- [ ] Agent steps (line 2512): קורא את נתוני הבקשה והטיוטה · מאמת מול התבנית של סוג הבל"מ · עובר על 12 המיומנויות הנדרשות · בודק שדות חסרים וערכים ללא מקור · מחפש סתירות ודרישות מצמצמות תחרות · מכין הצעות תיקון.
- [ ] Role labels per §1.4.
- [ ] Stage colours (line 1744): `#8a5cf0 #5a4fe0 #2f6fe0 #0a8fc2 #0a9a8e #1f9d5f #177a4a #0f5f3b`.

### Phase B — backend

#### B1. Shared agent run state, progress and server-side triggers (D6)

Today a run is one synchronous callable, its state lives in the browser, and the first run is started by the manager's browser (`web/src/pages/TenderWorkspace.tsx:63-73`).

- [ ] Add `tender.supervisionRun = { runId, state:'running'|'done'|'failed', basis, step, startedAt, by }`.
  - It is claimed in a transaction, so only one run happens at a time. A second run request while running is rejected with "already running".
- [ ] `runSupervision` writes `step` at its real phases:
  - 0 read input
  - 1 template
  - 2 skills
  - 3 values
  - 4 AI review
  - 5 merge
- [ ] Firestore triggers replace the browser auto-run:
  - **After the draft is prepared** (F1: `createTender`, then the AI draft fill), run a draft-basis check.
  - **On `documentStatus` going to `generated`**, run a document-basis check.

  Guard the triggers on the field transition, to avoid loops on the `lastSupervision` write.
- [ ] Remove the sessionStorage auto-run from `TenderWorkspace.tsx`.
- [ ] Tests:
  - concurrent claim;
  - the trigger fires once per transition;
  - a failed run sets `state:'failed'` and keeps the previous `lastSupervision`.

#### B2. Stable finding keys, the `fix` text and decisions (D5)

- [ ] `key = basis + ':' + sha1(code | paramKey | normalised location | normalised evidence).slice(0,10)`. It is computed server-side and stored on each finding.
- [ ] `fix: string` (Hebrew "הצעת הסוכן") on every finding:
  - AI: add a `fix` field to the `return_supervision` tool schema.
  - Rules: a static Hebrew text per code in `supervisorChecks.ts`.
  - `location` gets a human Hebrew label for rule findings, e.g. "נתוני הטיוטה" for `params.*` and "המסמך" for `document`.
- [ ] `tender.findingDecisions: Record<key, { action:'applied'|'skipped', by, at, runId }>`, written by the server only.
- [ ] New callable **`decideFinding({tenderId, keys[], action})`** (manager only):
  - `applied` with a draft finding that has `paramKey` and `suggestion`: write the param in the same transaction (reuse the `updateTenderDraft` checks).
  - `skipped` on a blocking finding: rejected.
  - `keys[]` is used for "הטמע הכול".
- [ ] **Reconciliation at the end of each run:**
  - An `applied` key absent from the new findings is resolved: remove the decision.
  - An `applied` key present again is open again: remove the decision.
  - A `skipped` key stays.
  - Keys with a different `basis` are ignored: draft decisions do not carry over to the document.
- [ ] Tests:
  - fingerprint stability across runs (same input, same key);
  - reconciliation table;
  - "skip" refused for blocking;
  - "apply" writes the param;
  - a non-manager is refused.

#### B3. Draft semantics (D7)

- [ ] On draft basis, roll leftover asked `{{key}}` placeholders into **one** `MISSING_INFO` warning:
  - message "עדיין ריקים בנתוני הטיוטה: {labels…} ועוד. הם יופיעו במסמך כקו ריק.";
  - location "נתוני הטיוטה";
  - fix "להשלים את שדות החובה הריקים בערכי ברירת המחדל של התבנית (אפשר לשנות אותם אחר כך).";
  - instead of one hard block per placeholder.

  A document basis keeps today's hard block, which never fires after the next step.
- [ ] `generateDocument` prints remaining empty asked fields as `BLANK_LINE`. `checkBlankLines` then reports them on the document as the existing warning.
- [ ] Applying the aggregated `MISSING_INFO` warning fills the empty fields that have a **template default**.
  - **Data gap:** most params have no `defaultValue` today. Add `defaultValue?` to the template param meta and seed it per template; fields without a default stay empty.
  - Return the list of filled keys for the jump (D-7).
- [ ] The document gate (`functions/src/services/draftCalc.ts:34-45`) blocks only on **open blocking** findings (after decisions). On every draft edit, re-run the **rules layer** synchronously; only rules can block (`applySeverityPolicy`), so a stale AI layer no longer forces a re-run before "יצירת מסמך". This matches the prototype, where applying a blocking finding enables "יצירת מסמך" at once.
- [ ] The `prepublish` gate blocks `BLANK_LINE` in required params.
- [ ] Tests: aggregation; blank-line printing; default fill; gate after decisions; prepublish blank-line block.

#### B4. Approvals: the team first, the manager last (D1, D1a–c, D2)

- [ ] `approveTender` is accepted when a document exists and `status ∈ {draft, internal_review}`. There is no send step; the caller approves the slots they hold.
- [ ] `approveTender` guards, in order:
  1. No open blocking finding, otherwise "ממצא חוסם מונע אישור סופי ופרסום".
  2. Legal only after requester and finance (D1a).
  3. Already locked: refused.
- [ ] `security` approves but is not required for the final action (D2).
- [ ] Withdraw (`approve:false`) is allowed until the lock.
- [ ] **On behalf (D1d):** `approveTender` gains `onBehalfOf?: TeamRole` and `reason?: string`, which is required with `onBehalfOf` and must be at least 10 characters.
  - Only the case owner (manager) may use it, and only for an **assigned** slot.
  - The same guards apply: blocking, legal order, locked.
  - The record keeps `uid` = the slot's current holder, so `missingApprovals` counts it unchanged. It adds `by: {uid, name}`, `onBehalf: true` and `reason` (`shared/src/team.ts:53-58`).
  - Audit `approve_on_behalf` with the role, holder, manager and reason.
  - Withdraw on behalf: `approve:false` + `onBehalfOf`, by the manager. The holder's own withdraw also clears an on-behalf record.
  - If the slot holder changes, the on-behalf approval stops counting, like a normal approval.
- [ ] **The manager's final action** is the existing `transitionTender('ready')` (manager only), extended to start from a draft with a document:
  - Add an FSM edge `draft→ready`, or pass through `internal_review` in the same call; both are audited.
  - It keeps today's guard (`functions/src/index.ts:1050-1062`): the required roles have approved by their current holders. That guard now excludes `security` and reads requester, legal and finance.
  - It adds the no-open-blocking guard.
  - In one transaction it sets `lockedAt`, moves to `ready`, and audits "המכרז ננעל ומוכן לפרסום" (D17).
  - **There is no auto-lock:** the 3rd approval only makes the manager's button available.
- [ ] After the commit, set **every** Google Docs permission to reader (the manager included). Retry on failure and log; the status is already locked.
- [ ] Remove the manager's "אשר ושלח לאישור הצוות" (`draft→internal_review`) from the UI. Keep the edge for legacy cases and for reopen (B5).
- [ ] Data model: `missingApprovals` gets a variant without `security` for this guard.
  - Update `web/src/pages/TenderWorkspace.tsx` and `web/src/pages/MyDesk.tsx` call sites.
- [ ] Tests:
  - each `approveTender` guard (blocking, legal order, locked);
  - on behalf:
    - refused for non-owners, for empty slots, and without a reason;
    - follows the legal order;
    - counts toward the final action;
    - withdrawn by the holder or the manager;
    - stops counting after reassignment;
    - audited;
  - the manager's action refused until requester, legal and finance approved, and allowed without security;
  - no lock happens on the 3rd approval alone;
  - withdraw before the lock;
  - legacy `internal_review` cases;
  - the Docs permission downgrade is called.

#### B5. Reopen by duplicating (D15)

- [ ] New callable `reopenTender` (manager, stage פרסום only):
  - copy the Google Doc into a new current document;
  - move the locked one to `tender.lockedDocuments[] = {googleDocId, lockedAt, approvals}`;
  - clear all approvals, security included;
  - `lockedAt=null`;
  - transition `ready → internal_review`, clearing approvals on that path too (`functions/src/stateMachines/tenderFsm.ts:27-29` keeps them today);
  - audit "נוצרה גרסה חדשה מקושרת. המקור נשאר נעול".
- [ ] In emulator/HTML mode, copy the Storage HTML instead.
- [ ] Tests for state, audit and the dev-mode copy.

#### B6. Activity feed and versions

- [ ] Hebrew sentence per audit action used in these stages, in a shared table:

  | Audit action | Sentence |
  |---|---|
  | `status_change` | (stage sentence) |
  | `approve_tender` | "אישור סופי: {name} · {role}" |
  | `status_change` to `ready` (the manager's final action) | "אישור סופי: {name} · רכש", then "המכרז ננעל ומוכן לפרסום" |
  | `withdraw_approval` | "האישור בוטל: {name} · {role}" |
  | `approve_on_behalf` (D1d, *new*) | "אישור בשם: {manager} אישר בשם {holder} · {role} · סיבה: {reason}" |
  | `supervision` | (run sentence) |
  | `draft_updated` | "{name} עדכן את {field labels}" |
  | `document_generated` | (document sentence) |
  | lock and reopen | the B4/B5 texts |

  Rows with a field or section reference carry it for the jump.
- [ ] Versions: today `internal/versions` has text snapshots in Storage. Add `byName` and a one-line "what changed" (field keys or "עריכה במסמך") per version.
  - Compare: a callable that returns two snapshots, diffed client-side.
  - **"שחזר" (restore) is deferred**: writing old text back into a live Google Doc is destructive and has no backend today.

#### B7. Unit contact assignment and "seen" markers (D3)

- [ ] `claimTeamSlot({tenderId, role, uid})`:
  - the caller's role must equal `role` (legal or finance);
  - the target user must have that role;
  - the slot must be empty or held by the caller;
  - reuses the `assignTeamMember` side effects (access document, Docs permission).
- [ ] `createTender` accepts empty legal and finance slots; requester and manager are still required.
- [ ] Per-user `seen` marker: `tenders/{id}/reads/{uid}.draftSeenAt`, written when the draft tab is opened. It drives the requester's "הטיוטה מוכנה" item. Add a Firestore rule mirroring `chatReads`.
- [ ] Tests: claim rules; creation with empty slots; the seen rule.

### Phase C — web foundation

#### C1. Tokens and theme

- [ ] Add CSS variables in `web/src/index.css` from the prototype's light refresh v3 (lines 1268–1269, 1350–1352):
  - `--bg #f6f6fa`, `--panel #fff`;
  - `--line #e6e6ef`, `--line-soft #f0f0f6`;
  - `--text #1c1b33`, `--muted #6c6b86`;
  - `--brand` / `--accent #5b3fd1`, `--brand-hover #4a31b5`, `--brand-soft #efecfc`;
  - `--ok #1d9a6c`, `--ok-soft #e6f6ef`;
  - `--warn #b9760f`, `--warn-soft #fdf3e1`;
  - `--bad #d64545`.
- [ ] Point `web/tailwind.config.js` colours at the variables. The values already match.
- [ ] Fix the Tailwind fallbacks to default palettes (`teal-200`, `violet-*`, `emerald-*`), used in DraftReview, TenderWorkspace and MyDesk.
- [ ] Radius tokens replace the prototype's `* {border-radius:4px !important}` hack (line 1080):
  - default 4px;
  - panel cards 12px (`.fpanel`, line 268);
  - finding cards 6px;
  - pills 999px;
  - avatars 50%.
- [ ] Font stack per D16; base 14px, line-height 1.5.

#### C2. Buttons and chips (lines 272–275, 221–225)

- [ ] Button variants:
  - `primary`;
  - `apply` (`--brand-soft` background, brand text, no border; hover `#1e3a8a` with white text);
  - `quiet` (no background, muted text; hover brand + underline);
  - `sm`;
  - disabled = `opacity:.5; cursor:not-allowed`.
- [ ] `AgentChip` variants:
  - neutral;
  - `run` (brand outline);
  - `ok`;
  - `wrn` (border `#e0a030`, text `#9a6a00`, background `#fff8e6`);
  - `blk` (solid `#d64545`, white text).
- [ ] Approval tag (`.ap a0/a2`) and stage tag (filled = current, outlined = upcoming).

#### C3. Components

- [ ] `AgentAvatar` (line 2654). Copy the SVG as is; sizes 36. When busy: halo animation (`agp`, 1.3 s, line 293).
- [ ] `ThinkingBox` (lines 2513–2518, CSS 276–287):
  - title "הסוכן המפקח בודק את {הטיוטה|המסמך}";
  - subtitle "זה לוקח כמה שניות";
  - a 5px bar, width `max(6%, step/6)`, with a `.9s` transition;
  - the list ✓ / › / · with typing dots on the current step;
  - step pacing per D6.
- [ ] `HeaderTip`: dark tooltip (line 59) — `#1f2340`, white, 12px, 250px wide, below the button and anchored to its **left** edge (the button sits at the far left).
- [ ] `PersonChip` + contact card (lines 2280–2287, CSS 202–207):
  - dotted name;
  - on hover or focus-within, a 300px card: avatar 42, name, "{role} · {unit}", and the button "פנייה בצ'אט";
  - a 10px invisible bridge between the name and the card;
  - no email or phone.

  **Data gap:** there is no unit/department on users today; add `unitHe` to the user directory, or omit it.
- [ ] `ChatDock` context: lets any component open the team chat with a prefilled "@{first name} ".

### Phase D — tender workspace (`web/src/pages/TenderWorkspace.tsx` and components)

#### D1. Header (HTML lines 1583–1593; `openTender` lines 2394–2415)

- [ ] Remove the verdict badge from the header; the prototype has none.
- [ ] Layout:
  - back "→" to the list;
  - title "{name}" + number + separator + type with icon;
  - below: owner avatar and name (title "איש רכש");
  - on the left: the approvals indicator, then the **primary button** (A3) with HeaderTip.
- [ ] Approvals indicator and card from A4, on hover and focus-within (lines 554–560). Its actions call `approveTender(false)` and `reopenTender`.

#### D2. Stage bar (lines 2289–2299, 2387–2392)

- [ ] Segments in stage colours, from A1:
  - done = tinted + ✓;
  - current = filled + "כרגע";
  - upcoming = outlined.
- [ ] Hover card per stage: "אישורים · {stage}", a status line (השלב הושלם / השלב הנוכחי / טרם התחיל), and role rows from `STAGE_APPR` (line 2293) with tags.
- [ ] After the bar, the note "ללא כנס ספקים בבל"מ זה".

#### D3. Tabs

- [ ] Order, labels, badges and visibility from A1.
- [ ] Persist the tab in the URL (`?tab=`), so every home button lands on the right tab (A5).
- [ ] Remove "שיתוף והרשאות" and "תיק מכרז" and relocate their content per D9.

#### D4. Overview (`renderOv`, lines 2707–2723; strips 2690–2700)

**Draft strip** (draft/creating):

- [ ] Chip "טיוטה", the bold "טרם נוצר מסמך", and a message:

  | State | Message |
  |---|---|
  | Creating | יוצר את המסמך… |
  | No run | הסוכן המפקח טרם בדק את הטיוטה |
  | Running | הסוכן המפקח בודק את הטיוטה… |
  | Blocking | ממצא חוסם: חובה להטמיע אותו לפני יצירת המסמך |
  | Open findings | {n} ממצאים ממתינים להחלטה |
  | Otherwise | הטיוטה נבדקה, אפשר ליצור את המסמך |

- [ ] A **primary sm** button "למסמך" that opens the draft tab.

**Agent strip** (document):

- [ ] The chip, the bold "הסוכן המפקח", and a message:

  | State | Message |
  |---|---|
  | Running | בודק את המסמך החדש… |
  | Blocking | ממצא חוסם מונע פרסום לספקים. נמצאו {n} ממצאים. |
  | Otherwise | {n} אזהרות, אין ממצא חוסם. |

- [ ] The button "לדוח הסוכן".

**Three cards:**

- [ ] "הפעולה הבאה": the stage text, a primary button and a progress pie "{n}% התקדמות".
  - In draft: the text "הרצת הסוכן המפקח והחלטה על הממצאים, ואז יצירת המסמך" and the button "עבור למסמך".
  - Otherwise: `NEXT_ACT[idx]`, e.g. idx 1 "אישור סופי של המכרז" with the button "פתח את המסמך".
- [ ] "הרביעייה": rows "{role} · {name}" with an approval tag, plus a "עריכת צוות" link (D9).
- [ ] "תאריכים": פרסום לספקים · כנס מציעים ("לא מתקיים בבל"מ זה") · מועד אחרון לשאלות · הגשת הצעות.
  - **Data gap:** there is no planned publication date field.

These restyle the existing `NextActionCard`, `QuartetCard` and `DatesCard`.

#### D5. Draft tab (`draftLayout` / `draftPage`, lines 2685–2688; CSS 259–310, 693–708)

- [ ] Two columns: `1fr | 400px`, gap 18. One column below 1000px. The side column is sticky (offset per §3) with `max-height: calc(100vh - 130px)`.
- [ ] Banner (warn-soft): "**טיוטה** · נבנתה מהבקשה ומהשלמת הרכש. שדות ריקים מסומנים." On the other side, a status:

  | State | Status |
  |---|---|
  | Creating | יוצר את המסמך… |
  | Running | typing dots + "הסוכן המפקח בודק את הטיוטה…" |
  | No run | הסוכן המפקח טרם בדק |
  | Open findings | הסוכן המפקח מצא {n} ממצאים לבדיקתך |
  | Otherwise | הסוכן המפקח בדק ואין ממצאים פתוחים |

- [ ] Page: a canvas (`#e7e7ea`, padding `16px 36px 0`, height 560, scrolls) holding a white sheet (`56px 72px`, line-height 1.7).
  - Content: today's `draftLines` / `draftParts` (`shared/src/draftRender.ts`).
  - A filled field is `mark.fld` (`rgba(124,77,214,.14)`, `data-k`).
  - A missing field is `mark.miss` (`#fff3b0` / `#8a5a00`) with the text **"חסר – ממלא רכש"**, not `{{key}}`.
  - Headings get a stable `data-sec` id (heading index + slug) for jumps.
- [ ] Field editing per D4.
- [ ] Remove the duplicate run button and status box in `DraftPanel.tsx`; the header and side panel own them now.
- [ ] Side column: `FindingsPanel` (D7).

#### D6. Document tab (`renderDoc`, lines 2139–2160)

- [ ] Banner: "ניתן להעיר ולהציע שינויים במסמך. רק מנהל המכרז מאשר שינויים." and the link "פתח ב-Google Docs ↗". The link is for internal roles only, and hidden when there is no Google Doc (dev mode).
- [ ] Toolbar per D13; the page indicator shows "{n} of {total}".
- [ ] Canvas and sheet as in D5.
  - Render the exported HTML in an `iframe srcdoc` with `sandbox="allow-same-origin"` (no `allow-scripts`). The parent can then scroll, mark and flash inside it, while the document's scripts stay blocked and its CSS stays isolated.
  - Drop the outline sidebar; the prototype has none.
- [ ] Side column: `FindingsPanel` in **every** document stage (the prototype never switches to inputs; see S4).
- [ ] Remove the embedded-editor toggle and fullscreen; the prototype has neither.

#### D7. Findings side panel (`findingsPanel` / `fpCard`, lines 2662–2683)

**Head:**

- [ ] AgentAvatar 36 (busy while running) and "הסוכן המפקח".
- [ ] Under it: "{n} ממצאים פתוחים" or "אין ממצאים פתוחים" when done, "בודק…" when running, nothing before the first run.
- [ ] Quiet button "↻ הרץ בדיקה", disabled while running or creating.

**Body:**

- [ ] No run: "הסוכן טרם בדק את הטיוטה.". Running: ThinkingBox.
- [ ] Otherwise:
  - Filter "הכול / חוסם / אזהרה" when there are more than 4 open findings.
  - The list is limited to 340px with inner scroll when there are more than 3.
  - Empty filter: "אין ממצאים בסינון הזה.".
  - All decided: "כל הממצאים טופלו ({n}). אפשר ליצור את המסמך." (the second sentence in draft only).

**Card** (`<details open>`):

- [ ] Summary: severity chip, **type label** (bold), location (small, on its own line).
- [ ] Clicking the summary focuses the finding in the page (prototype `agentFocus`, line 2657): missing-info pulses the `mark.miss` marks; a section finding flashes its section.
- [ ] Body: text, quote, "הצעת הסוכן" + fix.
- [ ] "הטמע" (apply variant). On a blocking finding, add a small "חובה להטמיע". There is **no "השאר כמו שהוא" in the panel**.

**Foot** (done only):

- [ ] "הטמע הכול" (when there are open findings) and the quiet "לכל הממצאים ←", which opens the agent tab.
- [ ] Under them, a small "ממצא חוסם" when there is a blocking finding in draft.
- [ ] Gate "apply" and "apply all" on the manager role. **This fixes a current bug**: `DraftReview.tsx` shows "apply all" to everyone.

#### D8. Jump to the fix (lines 2577–2598)

- [ ] After "הטמע":
  - the card leaves the open list;
  - if the current tab is not the draft/document tab, switch to it;
  - then, on the next frame, jump.
- [ ] Targets, in order:
  1. Field keys filled by the apply (B3 return): **pulse** every `mark[data-k]`, an outline animation of 1.2 s × 2.
  2. The finding's `paramKey` mark.
  3. The element containing the `evidence` quote (text search in the page or iframe).
  4. The section whose heading matches `location`: **flash** `#fff3b0` for 2.2 s.
- [ ] Scroll the canvas only, centring the target: `canvas.scrollTo({top: el.top − canvas.top + scrollTop − clientHeight/2 + h/2, behavior:'smooth'})`.
- [ ] "הטמע הכול" does not jump.

#### D9. Agent tab (`renderAgent`, lines 2616–2650)

**Head:**

- [ ] "דוח הסוכן המפקח" + chip.
- [ ] Description: "בודק שהמסמך נוצר מהתבנית הנכונה, עם המיומנויות הנדרשות, וללא ערכים שאין להם מקור. ממצא חוסם מונע פרסום לספקים."
- [ ] **Primary** "↻ הרץ בדיקה". No avatar here, unlike spec §6.6 (S6).
- [ ] No run yet: "הסוכן טרם בדק את הטיוטה." + primary "הרץ סוכן מפקח על הטיוטה". Running: ThinkingBox.

**Done:**

- [ ] Meta: "בוצעה · {when} · נבדק על {הטיוטה|המסמך}" and "תבנית מכרז {type} · {T-A|T-B} · {נוצר מטיוטת AI|טיוטה}".
- [ ] Skills: `<details open>` "מיומנויות נדרשות ({n}) · כולן תקינות" with ✓ list. When a skill is missing, the summary shows the real state ("{k} חסרות") with ✗ on those skills; the prototype is a demo and always shows OK.
- [ ] Filters, on the right (start side): "הכול {n}", "חוסמים {n}", "אזהרות {n}", plus "הוטמעו {n}" and "הושארו {n}" when non-zero.
- [ ] Bulk line: "הסוכן הציע תיקון לכל ממצא. אתם מחליטים מה להטמיע {בטיוטה|במסמך} ומה להשאיר כמו שהוא." + "הטמע את כל הממצאים ({n})".
- [ ] Notes: "הוטמעו {n} ממצאים. הריצו בדיקה כדי לאמת שהם נפתרו." and "יש ממצא חוסם: אי אפשר לפרסם לספקים או לתת אישור סופי עד שיטופל.".
- [ ] Cards:
  - Open: "הטמע {בטיוטה|במסמך}" + "השאר כמו שהוא" (grey). A blocking card shows a small "ממצא חוסם" instead of "השאר".
  - Applied: chip "הוטמע" + the fix text.
  - Skipped: chip "הושאר" + text + "הטמע …".
- [ ] Empty texts: "עדיין לא הוטמעו ממצאים." · "לא הושארו ממצאים." · "אין ממצאים בסינון הזה." · "אין ממצאים פתוחים.".
- [ ] Document only: `<details>` "מקור הערכים ({n}) · {x} ללא מקור · {y} להשלמה" with a table "שדה / ערך / מקור", chips "ללא מקור" / "מנהל המכרז", and a blank value "__________". Confidential internal values are **not** shown here; the prototype has none.

#### D10. Activity and versions tabs (lines 2777–2796)

- [ ] פעילות: rows "{DD.MM.YYYY HH:mm} | sentence", from the B6 table. Rows with a section get a chevron and open the document at that section with a flash (`goDoc`, line 2799).
- [ ] היסטוריית גרסאות: table "גרסה / תאריך / נערך על ידי / מה השתנה / שינויים / actions".
  - The current version gets the tag "נוכחית".
  - Actions: "צפה" and "השווה לנוכחית".
  - "שחזר" is hidden until restore exists (B6).

#### D11. Publish dialog (D8)

- [ ] Procurement at stage פרסום:
  - a modal "פרסום לספקים" holding today's AccessPanel supplier picker;
  - the confirm button calls `transitionTender('published')`;
  - on a gate block, show the findings summary and today's override (reason of at least 10 characters).

#### D12. Team chat dock (lines 2222–2259, HTML ~1699–1702)

- [ ] Restyle `ChatPanel`:
  - header "צ'אט פנימי" with "{name} · {number}" and the participants' avatars;
  - "היום" day separator;
  - own messages without an avatar;
  - `@mention` highlight;
  - unread badge on the floating button.
- [ ] Opened from ChatDock (C3).

### Phase E — home (`web/src/pages/MyDesk.tsx`)

#### E1. "לטיפולך" (`renderHome`, lines 1953–1975)

- [ ] Panel "לטיפולך" + count, and a button "סגור" / "הצג" that collapses it.
- [ ] Stage segment: "הכול {n}" plus the first 6 stages, each with a coloured dot and a count. A stage with no items is translucent.
- [ ] Rows from A5:
  - name (bold) + number;
  - the line "**{bold}** {text}" [+ tag] [+ select];
  - a button (the **first row's is primary**);
  - a grey meta line.
- [ ] 3 rows shown, then "הצג עוד {n}" / "הצג פחות", with a computed count (§10). Choosing a stage shows all its rows and hides "הצג עוד".
- [ ] Each button lands on the tab where the action is done (`?tab=`).

#### E2. The rest of the home (lines 1807–1861, 1976–2006)

- [ ] Greeting "שלום {first name}" with the role subtitle.
- [ ] KPI strip where real data exists:
  - active tenders;
  - "לטיפולך" count;
  - "בל"מים בשלב הבהרות".

  **Data gap:** schedule exceptions and "קיצור זמן כתיבה" have no source.
- [ ] Side "מועדים קרובים": the next stage, its date, and who it waits for.
  - **Data gap:** only some stage dates exist; the publish target date does not.
- [ ] Bottom "הבל"מים שלי": the existing TenderList (table or pipe for procurement, cards for others).
- [ ] Fix the `split(/s+/)` bug (`MyDesk.tsx:38`, also `web/src/layouts/InternalLayout.tsx:30`) → `/\s+/`.

### Phase F — procurement completion screen (`web/src/pages/TenderCreate.tsx`)

#### F1. Team, button and landing (`updateCreate`, lines 3322–3365; HTML 1556–1563; `genDraft`, lines 3430–3451)

- [ ] Title "בקשה חדשה · {number}"; subtitle "{sender} סיים את חלקו, ועכשיו תורכם. בחרו סוג בל"מ והרכיבו את הצוות, ובסיום המערכת תכין טיוטה.".
- [ ] Type hint after picking: "התבנית נבחרה אוטומטית: {template} · {T-A|T-B}. את שדות התבנית ממלאים בטיוטה."
- [ ] **No template fields on this screen** (D4).
- [ ] "צוות המכרז" with the hint "הדורש נקבע לפי הבקשה. אין צורך לשייך אנשים לתפקידים אחרים." and these rows:
  - דורש (fixed: "{name} · לפי הבקשה");
  - רכש (select);
  - "אבטחת מידע (משתתף נוסף)" ("לא נדרש" / "שלח לגוף אבטחת מידע");
  - "בקשת משתתף נוסף מגוף". **Data gap:** there are no extra-participant bodies (בטיחות, דורש נוסף) in `TEAM_ROLES`. Hide this row or add roles.
- [ ] Button **"אישור ויצירת טיוטה"** (replacing the stale "צור מכרז וייצר מסמך", `he.json:218`), disabled until a type is picked, with the hint "בחרו סוג בל"מ.".
- [ ] On click:
  - `createTender` with empty params;
  - the AI draft fill runs **server-side** after creation (move `draftBid` from type-pick to the B1 trigger);
  - stay on the screen with "ה-AI מכין את הטיוטה…" until the draft is ready;
  - then navigate to `?tab=document`, where the agent is already running (B1).

#### F2. Contact card

- [ ] "הבקשה של הדורש · נשלחה על ידי {PersonChip} · {time}" in `RequestSnapshot` (D14: no chat button before the tender exists).

---

## 6. Acceptance (prototype-based)

Verify on the emulator, side by side with the prototype at 1440px and 990px.

1. A seed scenario reproduces the prototype demo (`DEMO_STEPS`, line 3453): one request waiting for procurement.
2. "אישור ויצירת טיוטה" lands on the **טיוטה** tab with the draft page, and the agent starts by itself. ThinkingBox shows the 6 steps and the bar. The header reads "הסוכן בודק…" (disabled), and the panel's "↻ הרץ בדיקה" is disabled.
3. Empty fields show "חסר – ממלא רכש". The missing-info finding is a **warning**; "הטמע" fills the defaults and pulses them.
4. With a blocking finding, the header reads "טפל בממצא חוסם" (to the draft tab), and "יצירת מסמך" is unavailable until it is applied.
5. With only warnings open, "יצירת מסמך" is enabled, and hover shows the dark tooltip with the count.
6. "הטמע" removes the card, jumps inside the page only (the outer page does not move), and flashes or pulses the place. From the agent tab it first switches to the draft tab.
7. "יצירת מסמך" shows "יוצר מסמך…", then the tab becomes **מסמך**, and the agent runs on the document by itself.
8. With the document (D1):
   - requester and finance see "אישור סופי של המכרז", enabled;
   - legal sees it disabled, with the "נותר: …" tooltip, until requester and finance approved;
   - security sees "אישור (משתתף נוסף)";
   - procurement sees "אישור סופי של המכרז" **disabled**, with the "נותר: …" tooltip, until requester, legal and finance approved.
   The indicator shows "{n}/4", and the hover card shows rows, the note and "בטל את האישור שלי" for the non-procurement roles.
9. The 3rd team approval alone changes nothing except enabling procurement's button. Procurement's click (with or without security) moves the stage to **פרסום**. The card reads "המסמך נעול ומוכן לפרסום.", and procurement gets "פתח מחדש (שכפול)", which duplicates and returns the tender to עריכה with approvals cleared.
9a. Procurement can approve on behalf of an assigned participant whose turn has come, with a required reason (D1d):
    - the row shows "אושר בשם" and the reason;
    - the activity tab records it;
    - it counts toward procurement's final action;
    - the participant or procurement can cancel it before the lock.
10. With a blocking finding on the document, every role's button reads "טפל בממצא חוסם" (to the agent tab), and the server rejects approval.
11. "לטיפולך" shows each role the item from A5, and its button opens the right tab.
12. Agent tab: filters, bulk apply, applied and skipped lists, and "השאר כמו שהוא" only on warnings. A re-run removes resolved applied findings and keeps skipped ones.

---

## 7. Gaps found (prototype vs backend)

| # | Gap | Impact | Handled by |
|---|---|---|---|
| G1 | Approval flow: there is no send step and the team approves first (prototype); the manager's final action comes last (user decision). Today the manager has a separate "send for approval" step | High | D1 (decided), B4 |
| G2 | Information security is a required approver today | Policy | D2 |
| G3 | Units assign their own contacts; today procurement assigns every slot | High | D3, B7 |
| G4 | No field editor in the prototype draft, yet the fields moved out of the completion screen | High | D4 |
| G5 | "הטמע" can change real text only for draft fields with a suggestion; most findings have none, and the document can't be patched | High | D5 |
| G6 | No progress or shared run state; the first run is started by the browser | Med | D6, B1 |
| G7 | Each empty field is a hard block today; the prototype treats them as one warning | High | D7, B3 |
| G8 | No per-finding decisions or stable keys; findings are fixed per run | High | B2 |
| G9 | No `fix` text on most findings; `suggestion` is a field value only | Med | B2 |
| G10 | Only 6 of 25 finding codes have Hebrew labels; the UI shows raw English codes | Med | D12, §9 |
| G11 | AI findings can never block (`shared/src/supervision.ts:257-261`), so the prototype's AI-type blocking examples (e.g. a missing mandatory section) only warn in the real system. And `SUPERVISOR_UNAVAILABLE` is a warning in production, contrary to the "fail-closed" comment and ARCHITECTURE.md | Med, safety | Decide separately (not a UI matter) |
| G12 | No document lock; the manager keeps writer access after approvals; approvals are not tied to a document version | High | B4 (lock); version binding is S3 |
| G13 | No publish action or supplier picker in the prototype | High | D8 |
| G14 | The access and case tabs have no place in the prototype | Med | D9 |
| G15 | No activity feed (raw audit codes) and no "what changed" or restore on versions | Med | B6 |
| G16 | No conference stage, clarification stage or closed status in the backend | Out of scope | Later plan |
| G17 | The prototype's home demo items have no backend events: section changes, comments, schedule exceptions, KPI "קיצור זמן כתיבה", milestones per stage | Med | A5 builds only the real ones |
| G18 | No user unit/department for the contact card; no extra-participant bodies | Low | C3, F1 |
| G19 | The draft preview is rendered from `bodyTemplate`, while the real document is a copy of the template Google Doc; they match only while the two are synced | Med | Existing risk; keep `syncTemplateFields` |
| G20 | Template params lack `defaultValue` for "fill defaults" | Med | B3 |
| G21 | The prototype's static document toolbar | Low | D13 |
| G22 | Approval on behalf (user decision) has no prototype design and no backend support | Med | D1d, A4, B4; needs a UX mock |

---

## 8. Spec-only features (not in the prototype; not built unless confirmed)

| # | Spec feature | Spec § |
|---|---|---|
| S1 | "שליחה לאישור" step that opens approvals for others; procurement's "ממתין ל: …"; others' "ממתין לשליחה מהרכש" with its tooltip | 5.2 |
| S2 | Terms "אישור מסמך" and "פרסום לספקים" (stage name); the ban on "פרסום לרביע" | 2, 4.1 |
| S3 | Final 5-step agent check after all approvals ("בדיקה סופית של הסוכן המפקח", "לפני הפרסום לספקים"), including comparing to the approved version and detecting edits after approval | 4.2, 7.4 |
| S4 | Inputs panel replacing the findings panel after sending: role filters and colours, section picker, system pills, banner "המסמך נשלח לאישור…" | 6.5 |
| S5 | Publish stage: procurement's "פרסום לספקים" advancing the stage (skipping the conference); others' "ממתין לפרסום מהרכש" | 5.3 |
| S6 | 44px avatar in the agent tab | 6.6 |
| S7 | "לטיפולך": 40px urgency icons, pill buttons, and the extra role/state rows (e.g. "המסמך נוצר: אפשר לשלוח לאישור", "נשלח לאישור: …") | 8.5 |
| S8 | Header tooltip also on keyboard focus (accessibility; no visual conflict, **recommended to include**) | 8.3 |
| S9 | Contact card in more places (timestamps etc.) | 8.4 |
| S10 | Stage bar with all 8 stages (the prototype shows 6) | 4.1 |
| S11 | "One filled button per screen" (the prototype's overview has three) | 1.3 |
| S12 | REST agent-run contract; the app uses callables, and B1/B2 cover the same needs | 11 |

---

## 9. Proposed Hebrew labels for finding codes (D12)

The prototype names 6 codes (line 2519); the other 19 are proposals that need UX and legal review.

**From the prototype:**

| Code | Label |
|---|---|
| `CONFIDENTIAL_LEAK` | חשיפת מידע חסוי |
| `MISSING_INFO` | מידע חסר |
| `CONTRADICTION` | סתירה |
| `MISSING_MANDATORY_SECTION` | סעיף חובה חסר |
| `UNFAIR_REQUIREMENT` | דרישה מצמצמת תחרות |
| `LEGAL_ELEMENT_MISSING` | רכיב משפטי חסר |

**Proposed:**

| Code | Label |
|---|---|
| `NO_PROVENANCE` | מקור התבנית לא תועד |
| `TEMPLATE_MISMATCH` | תבנית לא תואמת |
| `TEMPLATE_CHANGED` | התבנית השתנתה |
| `TEMPLATE_DOC_CHANGED` | מסמך התבנית השתנה |
| `TEMPLATE_STRUCTURE_MISSING` | מבנה התבנית חסר |
| `WRONG_TEMPLATE_SECTION` | סעיף מתבנית אחרת |
| `SKILL_MISSING` | מיומנות חסרה |
| `SKILL_VERSION_CHANGED` | גרסת מיומנות השתנתה |
| `NO_AI_DRAFT` | אין טיוטת AI |
| `AI_DRAFT_FAILED` | טיוטת ה-AI נכשלה |
| `PARAM_INVALID` | ערך לא תקין |
| `PARAM_NOT_IN_DOC` | ערך חסר במסמך |
| `UNSOURCED_PARAM` | שדה ללא מקור |
| `UNSOURCED_VALUE` | ערך ללא מקור |
| `CRITERIA_WEIGHTS` | משקלי הערכה שגויים |
| `LEGAL_SECTION_MISSING` | סעיף משפטי חסר |
| `LEGAL_SECTION_ALTERED` | סעיף משפטי שונה |
| `DOC_UNREADABLE` | המסמך לא נקרא |
| `AI_REVIEW_SKIPPED` | בדיקת ה-AI לא בוצעה |
| `SUPERVISOR_UNAVAILABLE` | הסוכן המפקח לא זמין |

---

## 10. Prototype bugs: do not copy

- `toggleMore` hard-codes "הצג עוד 2" after collapsing (line 3005). Use the computed count.
- Singular tooltip "יש ממצא אחד שלא הוטמעו" is a grammar slip (line 2608). Use "שלא הוטמע" (confirm with UX).
- The sticky side column at `top:16px` slides under the sticky tender header (lines 37, 266). Offset by the header height.
- The panel's empty text "הסוכן טרם בדק את הטיוטה." is reused on the document. On a document, say "הסוכן טרם בדק את המסמך.".
- Draft-stage buttons are shown to every role because the demo has one persona (D18).
- Disabled `.btn` has `pointer-events:none` (line 754), which hides the title that says why a button is disabled. Keep pointer events.
- The class `.pc-h` is reused (line 1206) and restyles the contact card's header. Use the intended rules at lines 208–211.
- "זה לוקח כמה שניות" understates real AI runs. Keep the text, or change it to "זה עשוי לקחת עד דקה" (UX).

## 11. Current bugs found along the way (fix in the touching task)

- `split(/s+/)` instead of `/\s+/`: `web/src/pages/MyDesk.tsx:38`, `web/src/layouts/InternalLayout.tsx:30` (E2).
- `DraftReview.tsx`:
  - "apply all" is not gated on the manager role (D7);
  - it uses `scrollIntoView` (D8).
- Tailwind palette fallbacks (`teal-200`, `violet-*`, `emerald-*`) render default Tailwind colours (C1).
- ~~`transitionTender` lets a manager jump straight to post-publish statuses, e.g. `awarded` without a winner.~~ **Fixed 2026-11-05** (user decision: fix here, not tickets): `manualTransitionDenial` (`shared/src/tender.ts`) lets the manager move only up to publication (draft, internal_review, ready, published); responses, evaluated and awarded follow only from a submission, the comparison and the award. 4 tests (`manualTransitions.test.ts`); e2e: "evaluated" and "awarded" are refused through `transitionTender`.
- ~~`awardTender` writes the award fields before the transition.~~ **Fixed 2026-11-05:** everything is checked first (status, the supplier, and that the supplier submitted a proposal, which is new), then `transition(…, 'awarded', { awardedSupplierId, awardDate })` writes the winner and the status together. `transition()` now re-reads, checks and writes in one Firestore transaction (`tendersRepo.changeStatus`), so two concurrent moves can't both pass; a move with fields refuses to be a no-op, so a second award is refused. e2e: no award before the comparison, to a non-bidder, or twice; a refused award writes no winner.
- **AI failure became a warning (found 2026-11-04, fixed 2026-11-05):** `aiReview` fails closed (`SUPERVISOR_UNAVAILABLE`, block), but `applySeverityPolicy` downgraded every non-rules block to a warning, so with the AI down the publish gate passed. Now, at the publish gates (`prepublish`, `refresh` — `PUBLISH_GATE_STAGES`), a review that could not run keeps blocking: suppliers get an unchecked document only after a re-check or the manager's audited override. In the draft and during approvals it stays a warning, as the finding's own text says ("פרסום מחייב בדיקה חוזרת או אישור חריגה"). 2 tests (`serviceFields.test.ts`).
- The stale `createTender` comment (`functions/src/index.ts:574-580`) and the button label (`he.json:218`) (F1).
