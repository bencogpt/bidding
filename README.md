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

## Notes

- Static prototype: all data is mocked in `data.js`; state changes live in-memory
  for the session and reset on reload.
- Out of scope per PRD v1 (contract mgmt, payments, ERP/SSO, native mobile,
  v2+ agentic workflows) is not implemented; the *Supplier Q&A Bot* appears as a
  v2 preview.
