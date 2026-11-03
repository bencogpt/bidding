# Requester fields on phase 1 (פתיחת בקשה)

Date: 2026-11-02 · Status: design approved in chat, awaiting spec review

## Goal
Phase 1 ("שלב 1 — פתיחת בקשה (הדורש)") today asks only for the brief. Add the questions the procurement
spreadsheet marks "add to the requester as follow-up questions for the דמ"צ", so the requester answers them
once and procurement does not have to ask again. There is no template for phase 1: the fields are defined in
code.

Out of scope (a later piece): the spreadsheet's phase 2 columns (fields removed from the procurement form,
fixed values, computed values, the conflicting validity and guarantee rules), editing a request after it is
submitted, notifying procurement.

## The fields
One list in `shared` (`REQUESTER_FIELDS`), in the spreadsheet's order. Each entry: `key`, `labelHe`, `type`
(`text` | `textarea` | `number`), optional `default`, optional `internal`.

| row | key | label | type | default | internal |
|---|---|---|---|---|---|
| 11 | `service_location` | מקום אספקת השירות | text | | |
| 12 | `provider_responsibilities` | תחומי אחריות נותני השירות | textarea | | |
| 13 | `team_lead_role` | תפקיד ראש הצוות | textarea | | |
| 16 | `service_providers_total` | כמות נותני השירות | number | | |
| 59 | `supplier_equipment` | ציוד שהספק מספק לנותני השירות | textarea | | |
| 61 | `work_days` | מס' ימי עבודה | text | ימים א' עד ה' | |
| 62 | `work_hours` | מס' שעות עבודה | text | משרה מלאה - 170 שעות | |
| 63 | `excellence_bonus_month` | חודש תשלום מענק מצוינות | text | | |
| 64 | `excellence_criteria_place` | מקום פרסום אמות מידה למענק מצוינות | text | | |
| 66 | `medical_approval_type` | סוג האישור הרפואי הנדרש | text | | |
| 67 | `annual_budget` | מהו אומדן ההתקשרות השנתית או מהו גובה התקציב שהוקצה לשירות? | number | | yes |

`service_providers_total` and `service_location` reuse keys that already exist in the services template.

## Decisions
- All 11 questions are **optional**. An unanswered one stays empty in phase 2.
- `annual_budget` is confidential (GLOBAL_RULES G6): never sent to the AI draft, never in the document, never
  in a supplier-visible record. It is **not** copied into the `estimate` field automatically ("annual" and
  "total" may differ); the manager sees it read-only as a hint.
- Labels are the spreadsheet's wording.

## Data model
`bidRequests/{serial}` gains `details`: a map `key → string | number`, only keys from `REQUESTER_FIELDS`.
Old requests have no `details` and keep working. The schema (`bidRequestDocSchema`, `createBidRequestInput`)
gains an optional `details`. Rules are unchanged: the collection is still function-written, read by the
requester (own) and by managers.

## Backend
- `createBidRequest` validates `details`: known keys only, text up to a per-field limit, `number` fields finite
  and positive. Unknown keys are rejected. Duplicate protection and bid-number allocation are unchanged.
- `draftBid` receives the non-internal answers and appends them to the brief it sends to the model, labelled
  "פרטים מהדורש". `annual_budget` is excluded.
- `createTender`: for every template param whose key matches an answer, the value is filled from the request,
  unless the manager typed one. The request's answers are stored on the tender only for non-internal keys.

## Web
- **Phase 1** (`RequestCreate.tsx`): below the brief, the 11 questions in the table's order. Number inputs for
  `number`, text areas for `textarea`. Defaults (rows 61, 62) are pre-filled and editable. Empty answers are
  not sent.
- **Phase 2** (`TenderCreate.tsx`): the requester's answers shown read-only above the form. The budget is shown
  to the manager only, labelled internal.

## Tests
- Schema: accepts valid details; rejects unknown keys, a negative or non-numeric budget, an over-long text.
- `draftBid` input: contains the answers, never the budget.
- Create request with details → convert to a tender: matching template params are filled, a manager-typed value
  wins, the budget is not on the tender record.
- Rules (emulator): the requester reads only their own request; no client writes.
- Existing tests still pass.

## Update 2026-11-03 — required answers and removed field

- "סוג האישור הרפואי הנדרש" is removed from both screens (the request form and, by label, procurement's form).
- Required on the request screen: שם השירות, סיווג המסמך (default בלמ"ס), עיקרי השירות הנדרש (פרק ב') — this is the brief —,
  the budget question (סכום המסגרת המקסימלי) and מספר תקופות אופציה (a whole number, 0 allowed). All other answers stay optional.
- שם השירות becomes the tender title. מספר תקופות אופציה stays on procurement's form, pre-filled; the other answers leave it.
