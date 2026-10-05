---
name: s05-procurement-quality-check
description: Quality check of the merged בל"מ before publication. It detects thresholds that block competition, ambiguous wording that may lead to disputes, sanctions out of proportion to the deal, leftover placeholders and internal inconsistencies, and returns a READY / NOT READY verdict. Use in Phase 5, and whenever a bid document must be reviewed, checked or approved before it goes out.
---
<!--
===========================================
File: skills/s05-procurement-quality-check/SKILL.md
Purpose: Skill 5. Final quality check before the G-CONTENT gate.
Owner: Procurement
Phase: 5 (gate G-CONTENT)
Depends on: merged document (S04), S02 proportionality data, S03 evaluation, estimate (internal)
Feeds: bid manager decision at G-CONTENT
Source: original Skill 5
===========================================
-->

# S05: Quality Check Before Publication

## Why this skill matters

This is the last check before suppliers see the document. Problems found
here cost minutes. Problems found after publication cost amendments, delays
or legal challenges.

## Inputs

- The merged document (latest S04 version)
- S03 outputs (thresholds, evaluation), S02 and S15 outputs, the estimate
  (internal)

## Checks

Run all checks and report every finding. Don't stop at the first one.

### 1. Readiness (any failure → `BLOCKER`)

- No `{{PLACEHOLDER}}` remains.
- No open `BLOCKER` flags remain from earlier skills.
- Evaluation weights add up to 100, and quality sub-weights add up to 100%.
- Milestone payment percentages (S13) add up to 100%.
- Every date in the timeline is in a logical order.

### 2. Thresholds that block competition (`COMPETITION`)

Check for:

- Experience, references or turnover above what the scope needs
- Rare certifications that aren't clearly needed
- Brand names without "או שווה ערך"
- Geographic or ownership limits
- A very short time to submit

For each one, explain why it narrows competition and suggest an alternative.
For example: make it an advantage instead of a threshold, or lower the
number.

### 3. Ambiguous wording (`AMBIGUITY`)

Look for wording that could be read in two ways and lead to a dispute:

- Vague words left over (see S01 step 3), "וכו'", "וכדומה", "ככל הנדרש",
  "בהתאם לצורך", "לשביעות רצון המזמין" with no criteria
- Passive wording where it's unclear who is responsible ("יבוצע", "יסופק" –
  by whom?)
- Terms used but never defined
- "ו/או" where only one reading is intended
- Requirements with no quantity, unit or deadline
- Mandatory items with no verification method

For each finding, quote the section and propose clearer wording.

### 4. Proportionality of sanctions (`PROPORTIONALITY`)

- The maximum monthly SLA penalty compared to the monthly fee (from S02)
- Total possible penalties compared to the contract value
- Guarantee amounts compared to the policy (S15)
- Termination or penalty clauses written in the spec that are harsher than
  the template

### 5. Internal consistency

- Thresholds and quality criteria don't overlap (S03 step 9).
- Spec deliverables match the milestones (S13) and the pricing table
  lines (S12).
- Every section that the conflicts appendix (S11) refers to still exists.

## Output (`outputs`)

```json
{
  "verdict": "READY | NOT_READY",
  "checks": [ { "check": "READINESS | COMPETITION | AMBIGUITY | PROPORTIONALITY | CONSISTENCY", "result": "PASS | FAIL", "findings": [ "flag objects" ] } ],
  "summary_for_bid_manager_he": "a short summary: how many findings of each severity, and the 3–5 most important"
}
```

`READY` means there are no `BLOCKER` flags. `WARNING` flags still go to the bid
manager at G-CONTENT and must be acknowledged there.

## Guardrails

- Report findings and propose fixes. Don't edit the document. Fixes go back
  through the owning skill, then through S04.
- Proportionality numbers that use the estimate are internal only (G6).

> **Changes from source:**
> - "המומים" corrected to "עמומים" (ambiguous).
> - Added readiness, consistency checks and a READY / NOT READY verdict.
