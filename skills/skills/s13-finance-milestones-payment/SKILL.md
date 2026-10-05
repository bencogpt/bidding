---
name: s13-finance-milestones-payment
description: Defines a בל"מ's milestones and payment terms. Payment is either conditional on approved deliverables, or time-based (periodic), with an acceptance process and payment percentages that add up to 100%. Use in Phase 2, and whenever payment schedule, milestones, acceptance before payment or payment terms of a bid are discussed.
---
<!--
===========================================
File: skills/s13-finance-milestones-payment/SKILL.md
Purpose: Skill 13. Milestones and payment mechanism.
Owner: Finance (חשבות)
Phase: 2
Depends on: S01 (deliverables, acceptance criteria), S12 (milestone lines)
Feeds: S04, S05 (sum check)
Source: original Skill 13
===========================================
-->

# S13: Milestones and Payment Terms

## Why this skill matters

Paying before a deliverable is approved removes the organization's leverage.
The payment mechanism should tie money to verified results wherever the
engagement allows it.

## Inputs

- Deliverables and acceptance criteria (S01)
- Milestone lines (S12)
- `PAYMENT_MODE`: `DELIVERABLE_BASED` or `TIME_BASED`. If missing, recommend one
  with a reason and ask.
- `PAYMENT_TERMS` (for example, שוטף + {{DAYS}}) from the template or parameters
- `RETENTION_PCT` (optional): a percentage held back until final acceptance

## Steps

1. **Choose the mode.**
   - `DELIVERABLE_BASED` fits projects with defined deliverables. Payment is
     made only after a deliverable is approved in writing.
   - `TIME_BASED` fits ongoing services. Payment is made per period (for
     example, monthly), subject to the SLA report (S02).
2. **For deliverable-based payment**, list each milestone with:
   - The deliverable (from S01)
   - Its acceptance criteria (from S01)
   - Its due date
   - Its payment percentage

   The percentages must add up to 100%. If they don't, raise a `BLOCKER`.
   Payment percentages come from the bid manager or finance. Placeholders
   otherwise.
3. **Define the acceptance process:**
   - Who approves: `{{ACCEPTANCE_APPROVER_ROLE}}`
   - How many days they have to review: `{{REVIEW_DAYS}}`
   - What happens when a deliverable is rejected: the supplier fixes it and
     resubmits, and the review time restarts.
   - A note that approval of a milestone doesn't waive later defects. Use the
     template's wording if it has one.
4. **For time-based payment:** Define the billing period, what's attached to
   each invoice (hours report, SLA report), and the link to SLA penalties
   (deducted from the invoice).
5. **Write the Hebrew clause.**

## Output (`outputs`)

```json
{
  "mode": "DELIVERABLE_BASED | TIME_BASED",
  "milestones": [ { "id": "MS-1", "deliverable_ref": "DEL-001", "acceptance_criteria_he": "", "due": "{{...}}", "payment_pct": "{{...}}" } ],
  "acceptance_process_he": "",
  "payment_terms_he": "",
  "retention_pct": null,
  "clause_he": ""
}
```

> **Changes from source:**
> - Added an acceptance process, a check that percentages add up to 100%,
>   an optional retention and a link to SLA deductions.
> - The source's two modes (approved deliverables or time only) are kept.
