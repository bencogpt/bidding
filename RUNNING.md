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
1. Sign in as `manager@obms.test` → **מכרז חדש** → choose *מכרז טובין*, fill params → create.
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
