# OBMS Tender System — Running the Firebase app

Real Hebrew (RTL) tender-management system on Firebase (project **`biding-system`**).
Monorepo: `shared/` (types + Zod), `functions/` (Cloud Functions, Node 20), `web/` (React + Vite).

## Prerequisites
- Node 20+, Firebase CLI (`npx firebase --version`)
- **Java 11+** (the Firestore/Auth/Storage emulators need it). If `java -version` fails, a
  no-sudo local JDK works — e.g. Temurin extracted under `~/.local/jdk/...`, then:
  ```bash
  export JAVA_HOME=~/.local/jdk/jdk-21.0.11+10/Contents/Home
  export PATH="$JAVA_HOME/bin:$PATH"
  ```
- The admin service account JSON (kept out of git). Export it:
  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/biding-system-firebase-adminsdk-fbsvc-f6972a0a99.json
  ```

## Install & build
```bash
npm install               # if ~/.npm has root-owned files, add: --cache /tmp/obms-npm-cache
npm run build:shared      # compile @obms/shared first (web + functions depend on it)
npm run build:functions
```

## Run locally on the Emulator Suite (recommended for the slice)
```bash
# terminal 1 — emulators (auth, firestore, functions, storage, UI on :4000)
npm run build:functions && npx firebase emulators:start

# terminal 2 — seed demo data into the emulator (users, suppliers, 3 templates)
npm run seed

# terminal 3 — web app (Vite, http://localhost:5173, auto-targets emulators)
npm run dev:web
```

### Demo accounts (seeded)
| Role | Email | Password |
|---|---|---|
| מנהל המכרז | manager@obms.test | password |
| יועץ משפטי | legal@obms.test | password |
| איש כספים | finance@obms.test | password |
| אחראי ביטחון | security@obms.test | password |
| מזמין | requester@obms.test | password |
| ספק (אגיס) | a@aegis.test | password |
| ספק (מרידיאן) | b@meridian.test | password |

## End-to-end flow to verify
1. Sign in as `manager@obms.test` → **בל"מ חדש** → choose *מכרז טובין*, fill params → create.
   System generates the document from the goods template.
2. In the workspace open **מסמך המכרז** → the rendered doc shows (manager-only edit notice).
3. **שיתוף והרשאות** → share with a supplier + assign legal/finance reviewers → **עדכן הרשאות**.
4. Sign in as the shared supplier (`a@aegis.test`) → portal lists ONLY that tender →
   open it → document renders in-system; ask a clarification question.
5. Back as manager → tender **שאלות הבהרה** → **קבץ שאלות דומות (AI)** → answer a cluster.
6. As another authorized supplier (`b@meridian.test`, after sharing) → sees the question + answer.
7. **דוחות** (status + response) and **יומן פעולות** (audit) reflect everything live.

## Tests (all green)
```bash
# Security-rules tests (Gate 2)
npx firebase emulators:exec --only firestore "npm run test --workspace functions"

# Full end-to-end callable flow (create -> share -> supplier view -> isolation -> Q&A)
npx firebase emulators:exec --only auth,firestore,functions,storage \
  "npm run seed && node functions/lib/test/e2e.js"
```

### Supervisor agent
Inspects every bid document from the AI draft to publication: right template, required skills
(`skills/` — bundled into `functions/skills` by the `prebuild` step), and no unsourced values.
A BLOCK verdict refuses publish unless the manager overrides with a reason (audited).
Suppliers can only be shared after publication.
```bash
node --test functions/lib/test/supervisor.test.js   # deterministic checks, no emulator needed
node functions/verifysupervisor.mjs                  # live: draft → create → supervise → publish
```
Model: `ANTHROPIC_SUPERVISOR_MODEL` (defaults to `ANTHROPIC_COMPARE_MODEL`). Under the emulator
the AI review layer is skipped (verdict WARN); in production a missing key/failed review BLOCKs.

## App Check (proof that requests come from our web app)
Rollout in 5 phases. **Status: phase 1 done** — the web app starts App Check when
`VITE_APPCHECK_SITE_KEY` is set; until then it is off and nothing changes for users.

| Phase | What | Status |
|---|---|---|
| 0 | Enable App Check + reCAPTCHA Enterprise APIs; create the web site key (domains `biding-system.web.app`, `biding-system.firebaseapp.com`, `localhost`); register the web app in Firebase App Check | to do |
| 1 | Web app initializes App Check (`web/src/lib/firebase.ts`) | **done** |
| 2 | Monitor 2–3 days: verified vs unverified requests (console metrics; function logs `"app": "VALID"`) | to do |
| 3 | Debug tokens for our Node scripts (`verify*.mjs`, maintenance scripts) | to do |
| 4 | Enforce: `enforceAppCheck: true` on all callables + enforcement for Firestore and Storage | to do |
| 5 | Verify: browser works, tokenless script refused, emulator e2e green | to do |

**Rules every change must follow (so the next phases need no rework):**
- **One Firebase app.** All browser code uses `app`, `db`, `auth`, `functions`, `storage` exported from
  `web/src/lib/firebase.ts`. Never call `initializeApp` / `getFirestore` / `getFunctions` /
  `getStorage` / `getAuth` anywhere else — such a client would bypass App Check.
- **App Check starts first.** Keep `initializeAppCheck` before any service is created or used.
- **New callable functions** go through `onCall` with the global options; never add a per-function
  option that disables App Check (`enforceAppCheck: false`) — phase 4 turns it on globally.
- **New Node scripts** that use the client SDK against the live project must accept a debug token
  from the environment (`APP_CHECK_DEBUG_TOKEN`), or use the Admin SDK — after phase 4 a script
  without one is refused.
- **Never commit** a debug token or put one in `.env.example`; the site key is public and may be.
- Local dev on `localhost` with App Check on: set `VITE_APPCHECK_DEBUG_TOKEN` (registered in the
  Firebase console → App Check → Manage debug tokens). The emulators do not enforce App Check.

## Running against the LIVE project
- Seed live: `SEED_TARGET=real GOOGLE_APPLICATION_CREDENTIALS=... npm run seed`
- Web against live: `VITE_USE_EMULATOR=false npm run dev:web`
- Deploy: `npm run build && npx firebase deploy`

## Documents & AI (real, behind flags)
- **Documents**: default dev mode renders the template to HTML in Storage, served through a
  function (Storage stays private). **Google Docs mode** (`USE_GOOGLE_DOCS=true`) is fully
  implemented: copies the template Doc, fills params, exports a PDF (in-system view via signed
  URL), and sets permissions (manager=writer, reviewers=commenter; suppliers get none). Needs
  the service account to have Drive+Docs access, `GOOGLE_DRIVE_PARENT_ID`, and real
  `googleTemplateDocId` on each `templates/*`.
- **AI** (`aiService`): **real Claude** integration via structured tool-use —
  `clusterQuestions` (groups similar clarification questions) and `compareResponses`
  (structured, non-binding comparison). Set `ANTHROPIC_API_KEY`; without it (or without
  proposal text) both fall back to a labeled local heuristic. AI output is non-binding.
- **supplier search** (`supplierSearch`) remains a labeled stub (IL-first over the supplier
  master); external discovery comes next.
