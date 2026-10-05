---
name: s12-finance-pricing-table
description: Builds the structured pricing table suppliers fill in for a בל"מ. It supports fixed price split by milestones, an hour bank or rates by role level (junior, senior, architect and so on), and licensing and maintenance by number of users or maintainers, following the pricing approach S03 chose. Use in Phase 2, and whenever a price form, quote table, rate card or cost structure for a bid is needed.
---
<!--
===========================================
File: skills/s12-finance-pricing-table/SKILL.md
Purpose: Skill 12. Pricing table for suppliers.
Owner: Finance (חשבות)
Phase: 2
Depends on: S01 (deliverables, quantities, roles), S03 (pricing approach, price formula)
Feeds: S13 (milestones), S14 (all-inclusive check), S04, S09 (price scoring)
Source: original Skill 12
===========================================
-->

# S12: Pricing Table

## Why this skill matters

If suppliers price different things, their offers can't be compared. The
table must make every offer come down to **one comparable number**,
calculated the same way as S03's price formula.

## Inputs

- `pricing_approach` from S03
- Deliverables, quantities and required roles from S01
- `VAT_INCLUDED` (default: prices exclude VAT), `CURRENCY` (default: ILS)
- Estimated quantities for comparing offers. These come from the requester
  and are never invented. Placeholders otherwise.

## Table models (use the ones S03 selected; they can be combined)

### A. Fixed price split by milestones

| מס' | אבן דרך / תוצר | מחיר (₪, לא כולל מע"מ) |
|---|---|---|
| 1 | {{from S01 deliverables}} | |
| | **סה"כ** | =sum |

### B. Hour bank / rates by role

| תפקיד | הגדרת התפקיד ודרישות מינימום | תעריף לשעה (₪) | כמות שעות משוערת* | סה"כ |
|---|---|---|---|---|
| ג'וניור | {{from S01 or placeholder}} | | {{HOURS_JUNIOR}} | =rate×hours |
| סיניור | | | {{HOURS_SENIOR}} | |
| ארכיטקט | | | {{HOURS_ARCHITECT}} | |

\* The estimated hours are for comparing offers only. They aren't a commitment
to buy these hours. Use the template's wording for this if it has one.

### C. Licensing and maintenance

| פריט | יחידת תמחור | כמות משוערת | מחיר ליחידה (₪) | סה"כ שנתי |
|---|---|---|---|---|
| רישוי | למשתמש / לשנה | {{USERS}} | | |
| תחזוקה | לאיש תחזוקה / לחודש | {{MAINTAINERS}} | | |

## Steps

1. Build only the models S03 selected.
2. Fill in lines only from S01 deliverables, roles and quantities. Missing
   role definitions or quantities → placeholders and questions.
3. Define the comparison total. It's the one number S09 uses in the price
   formula. If you combine models, state exactly how they add up. For
   example: fixed price + (rates × estimated hours) + licensing × contract
   years.
4. Add these instructions for suppliers:
   - Fill in every cell. A blank cell is not zero.
   - Prices are in ₪ and exclude VAT (or as the parameters say).
   - No lines may be added.
   - Prices are final. This refers to S14.
5. Make sure there are no lines for items that S14 says are included in the
   price (travel, equipment and so on). If there are, raise a `CONTRADICTION`
   flag.

## Output (`outputs`)

```json
{
  "models": ["FIXED_MILESTONES", "HOUR_BANK", "LICENSING_MAINTENANCE"],
  "tables_he": [ { "model": "", "columns": [], "rows": [] } ],
  "comparison_total_formula": "",
  "supplier_instructions_he": "",
  "milestone_lines_for_S13": [ { "line": 1, "deliverable_ref": "DEL-001" } ]
}
```

> **Changes from source:**
> - "לפני אבני דרך" read as "לפי אבני דרך" (by milestones).
> - Added a single comparison total that matches S03's formula, and
>   instructions for suppliers.
> - Estimated quantities are marked as not binding.
