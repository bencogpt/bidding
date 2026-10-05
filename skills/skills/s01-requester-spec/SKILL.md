---
name: s01-requester-spec
description: Turns the requester's (דורש) free-text input into a structured, measurable, unambiguous technical spec for a בל"מ. Use in Phase 1 of every bid, and again whenever the requester changes their requirements. Use it whenever raw requirements, a needs description, or a "what we want" text must become spec items, even if the word "spec" isn't used.
---
<!--
===========================================
File: skills/s01-requester-spec/SKILL.md
Purpose: Skill 1. Converts raw requester input into a structured technical spec.
Owner: Requester (דורש)
Phase: 1 (gate G-SPEC)
Depends on: 00_GLOBAL_RULES.md, 01_ORCHESTRATOR.md (case file, hand-off format)
Feeds: S02, S03, S08, S11, S12, S13, S17
Source: original Skill 1
===========================================
-->

# S01: Requester Input → Technical Spec

## Why this skill matters

Everything else in the בל"מ is built on the spec. The SLA, thresholds,
pricing, and legal and security checks all read it. A vague spec leads to
offers that can't be compared, and to disputes after the award. A spec
that contains invented requirements commits the organization to things
nobody asked for.

## Inputs

| Input | Source | Required |
|---|---|---|
| `requester_input` | Case file (original text) | Yes |
| `bid_type`, `template_id` | Case file | Yes |
| Spec section structure | Selected template (T-A / T-B) | Yes |
| Requester's answers to earlier questions | Case file | If they exist |

## Steps

1. **Extract atomic requirements.** Read the whole text. Split it into items,
   one requirement per item. For each item, record the exact phrase it came
   from (`source_ref`). Keep everything, including requirements that seem
   minor.

2. **Categorize** each item into one of these categories:
   - Functional
   - Technical / architecture
   - Performance
   - Integration
   - Quantities / equipment
   - Deliverables
   - Schedule
   - Support and maintenance
   - Security

   Security items are also passed to S17. Support items are also passed
   to S02.

3. **Turn vague words into measurable values.** Look for these words and
   words like them: מהיר, זמין, איכותי, אמין, גמיש, מתקדם, בהקדם, מספיק,
   סביר, מינימלי, "ככל הנדרש", "בהתאם לצורך". For each one:
   - If the requester gave a number anywhere in the input, use it.
   - If not, rewrite the item with a placeholder (`{{SEARCH_RESPONSE_SEC}}`)
     and add an open question to the requester. You may attach a
     **proposed** value, clearly labeled as a proposal (G2).
   - Measurable means it has a metric, a value, a unit, and the conditions
     under which it's measured.

4. **Classify each item as mandatory or advantage.**
   - `MANDATORY`: Pass/fail. An offer that doesn't meet it isn't
     compliant. Words that suggest this: חייב, נדרש, יש, "לא יפחת מ-".
   - `ADVANTAGE`: Scored in the evaluation (S03). Words that suggest this:
     רצוי, יתרון, מומלץ, "ככל האפשר".
   - If it's unclear which one applies, ask. Don't choose. The difference
     decides whether suppliers are disqualified or only lose points.

5. **Define how each mandatory item will be checked.** A requirement that
   can't be verified at evaluation time is useless. Methods include:
   supplier declaration, document or certificate, reference, demo, test,
   or proof of concept.

6. **Define deliverables.** For each deliverable, record:
   - What it is
   - The format it's delivered in
   - When it's due (date or offset from contract start)
   - Acceptance criteria and who accepts it

   Missing values → placeholders and questions.

7. **Check for brand names or single-supplier wording.** If a product or
   brand is named, add "או שווה ערך" and raise a `COMPETITION` flag (G7).

8. **Check for invented content.** Go through every item. Each one must have a
   `source_ref` to the requester's input or answers. Remove any item without
   one, or move it to `proposals` for the requester to accept or reject.

## Output (`outputs`)

```json
{
  "spec_items": [
    {
      "id": "REQ-001",
      "category": "PERFORMANCE",
      "text_he": "זמן התגובה לפעולת חיפוש לא יעלה על {{SEARCH_RESPONSE_SEC}} שניות ב-95% מהבקשות, בעומס של עד {{CONCURRENT_USERS}} משתמשים בו-זמנית.",
      "type": "MANDATORY | ADVANTAGE",
      "measure": { "metric": "", "value": "", "unit": "", "conditions": "" },
      "verification": "DECLARATION | DOCUMENT | REFERENCE | DEMO | TEST | POC",
      "origin": "FROM_INPUT | PROPOSED",
      "source_ref": "requester_input: 'המערכת צריכה להיות מהירה'"
    }
  ],
  "deliverables": [
    { "id": "DEL-001", "name_he": "", "format": "", "due": "", "acceptance_criteria_he": "", "accepted_by": "" }
  ],
  "proposals": [ { "text_he": "", "reason": "" } ],
  "passed_to": { "S02": ["REQ-..."], "S17": ["REQ-..."] }
}
```

## Example

Requester input:
> "צריך מערכת מהירה וזמינה, רצוי עם אפליקציה"

Result:

- **REQ-001 (MANDATORY):** Response time ≤ `{{RESPONSE_SEC}}` seconds.
  Question to requester. Proposed value: 2 seconds, labeled as a proposal.
- **REQ-002 (MANDATORY):** Availability ≥ `{{AVAILABILITY_PCT}}`% per calendar
  month, excluding planned maintenance windows. Question to requester. Also
  passed to S02.
- **REQ-003 (ADVANTAGE):** A mobile app. "רצוי" means advantage, and S03
  will score it.

## Guardrails

- Don't add requirements the input doesn't contain, even "obvious" ones.
  Put them in `proposals`.
- Don't soften or strengthen a requirement. Keep the requester's intent.
- Don't copy technical values from example bids (G1).

## Hand-off

Return `COMPLETE` when all items are classified and every missing value has a
placeholder and a question. Return `NEEDS_INPUT` when mandatory/advantage
classification or deliverable dates are still open.

The requester approves at G-SPEC. After approval, the spec is locked. Any
change triggers the re-run rules.

> **Changes from source:**
> - Each requirement must now be verifiable (step 5).
> - Proposed values are allowed, but only with a label (step 3).
> - Brand names get the "or equivalent" check (step 7).
