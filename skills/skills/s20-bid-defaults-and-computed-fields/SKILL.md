---
name: s20-bid-defaults-and-computed-fields
description: Fills the בל"מ result document's fields that don't need a human decision, unless the brief or requester already specified them: fixed defaults (submission location, lunch cost, address and PO box), computed values (offer validity, guarantee validity) and the contract's own unique fields. Also checks the order of the bid's key dates. Use at the start of building the bid, right after the initial data is entered and before the other drafting skills, and whenever a default value, an offer validity date, a guarantee validity date or the order of the bid's dates comes up.
---
<!--
===========================================
File: skills/s20-bid-defaults-and-computed-fields/SKILL.md
Purpose: Skill 20. Pre-fills default, computed and contract-unique fields of
         the result document, and checks the chronological order of events.
Owner: Procurement
Phase: 2 (runs first, before S02–S17)
Depends on: case file (brief, parameters), template placeholders
Feeds: S02, S03, S12–S15, S17 (they read the filled values), S04 (merge),
       S05 (placeholders and contradictions)
Source: bid manager's request for default and computed fields
===========================================
-->

# S20: Defaults, Computed Fields and Date Order

## Why this skill matters

Many fields in a בל"מ have one right answer that doesn't need a human
decision: where offers are submitted, how long an offer stays valid, what a
lunch costs. Asking the bid manager for them wastes time. Computing them by
hand causes date errors, and a wrong validity date can void a bank
guarantee.

## Core rule: explicit input always wins

Fill a field **only if** the bid manager or requester did not specify it. If
the brief, the requester input or the manager's answers give a value, keep it
exactly. Don't "correct" it, even if it differs from a default below. Record
the field in `skipped_explicit`. If an explicit value breaks a rule here
(for example, the date order), keep it and raise a flag. Don't change it.

Where a value is already filled by the system from the template (for
example, `bid_box_location` or `offer_validity_days`), leave that value as
it is. This skill fills the rest.

## Inputs

| Input | Source |
|---|---|
| Brief and requester input, unchanged | Case file |
| Template placeholders for the chosen type | Template (T-A or T-B) |
| Dates already known (submission, clarifications, and so on) | Case file `parameters` |

## Steps

Run the groups in this order. Computed values read the defaults.

### 1. Fixed defaults

Use these values when the matching template field exists and has no explicit
value.

| Field | Default | Note |
|---|---|---|
| Submission location | `מרכז למורשת מודיעין` | Temporary: until submission through ABS exists. Add an `INFO` flag |
| Lunch cost | `820 ₪ לחודש` or `40 ₪ לתלוש` | Both options appear together, as written. Don't pick one |
| Address and PO box | `test@gmail.com` | **Temporary placeholder** until the real details arrive. Always add a `WARNING` flag `MISSING_INFO` so it can't pass the final gate unnoticed |

### 2. Computed values

All dates are calendar days, in Israel time, written `DD/MM/YYYY`.

1. **Offer validity** (`תוקף ההצעה`) = submission date + 90 days.
   Example: submission `16/12/2026` → offer validity `16/03/2027`.
2. **Guarantee validity** (`תוקף ערבות`) = offer validity. The offer and
   its guarantee must expire on the same date.
3. **Direction.** If the guarantee validity was given explicitly, the offer
   validity takes that date and rule 1 is skipped. Otherwise, rule 1 sets
   the offer validity and the guarantee validity copies it.
4. **Missing submission date.** Leave `{{SUBMISSION_DEADLINE}}`, raise a
   `MISSING_INFO` flag, and don't compute anything from it. Never assume a
   date.

### 3. Unique fields of this contract

These are the fields that differ per contract (names, quantities, periods,
scope). Fill a field only if the brief or requester input states it clearly.
Write what they said and record the sentence as the source.

For every other field, leave `{{FIELD_NAME}}` and raise a `MISSING_INFO`
flag (G2). Never copy a value from an example bid (G1). Don't fill the
estimate or any confidential field (G6).

### 4. Check the order of events

Check that the bid's dates are in this order. Skip an event that has no date
or doesn't apply.

| # | Event | Note |
|---|---|---|
| 1 | Publication of the בל"מ | Internal |
| 2 | Supplier conference | Only if there is one |
| 3 | Submission of clarification questions | |
| 4 | Publication of clarification answers | Internal |
| 5 | Submission of offers | |
| 6 | Award notice | Internal |
| 7 | Offer validity = guarantee validity | |
| 8 | Start of service | |

An event dated before an earlier one in this list is a `CONTRADICTION` flag
with severity `BLOCKER`. Name both events and their dates. Don't move
either date.

## Output (`outputs`)

```json
{
  "filled": [
    { "field": "offer_validity", "value": "16/03/2027", "group": "COMPUTED", "source_type": "SKILL_OUTPUT", "source_ref": "S20 step 2: submission 16/12/2026 + 90 days" }
  ],
  "skipped_explicit": [
    { "field": "bid_box_location", "reason": "specified in the brief" }
  ],
  "timeline_check": {
    "ok": true,
    "events": [ { "event": "SUBMISSION", "date": "16/12/2026" } ],
    "violations": [ ]
  }
}
```

`group` is one of `DEFAULT`, `COMPUTED`, `UNIQUE`. Every filled value has a
source (G11).

## Guardrails

- Never override an explicit value (see the core rule).
- Never invent a date, amount or name. A missing input gives a placeholder
  and a flag (G1, G2).
- The address and PO box value is temporary. Don't remove its
  `WARNING` flag until the bid manager confirms the real details.
- Confidential values stay out of everything this skill fills (G6).
