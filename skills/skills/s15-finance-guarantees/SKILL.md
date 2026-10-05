---
name: s15-finance-guarantees
description: Calculates a בל"מ's bid guarantee (ערבות הצעה, 2.5% of the estimate) and performance guarantee (ערבות ביצוע, 5% of the estimate), and publishes them only as rounded fixed amounts so the confidential estimate isn't revealed. It also prepares the guarantee clauses from the template. Use in Phase 2 of every bid, and whenever guarantees, bank guarantees or their amounts come up.
---
<!--
===========================================
File: skills/s15-finance-guarantees/SKILL.md
Purpose: Skill 15. Guarantee amounts and clauses without revealing the estimate.
Owner: Finance (חשבות)
Phase: 2
Depends on: estimate (confidential), template guarantee wording, S03 timeline (validity dates)
Feeds: S04, S05 (proportionality), S09 stage 2 (guarantee check)
Source: original Skill 15
===========================================
-->

# S15: Guarantees

## Why this skill matters

The policy fixes the guarantees as percentages of the estimate. But the
estimate is confidential (G6). If the בל"מ says "2.5% of the estimate", or
publishes an exact 2.5% figure, anyone who knows the policy can calculate the
estimate. Then suppliers price towards it instead of competing.

## Policy

| Guarantee | Rate |
|---|---|
| Bid guarantee (ערבות הצעה) | 2.5% of the estimate |
| Performance guarantee (ערבות ביצוע) | 5% of the estimate |

## Steps

1. **Calculate internally:** bid = estimate × 2.5%; performance =
   estimate × 5%.
2. **Round** each amount to `{{GUARANTEE_ROUNDING}}`.

   ⚠️ **Rounding reduces precision but doesn't hide the estimate completely.**
   A reader can still multiply by 40 (or 20) and get an approximate estimate.
   For stronger protection, finance and legal can choose one of these:
   - Coarser rounding (for example, to the nearest 10,000 ₪)
   - Fixed amount bands (for example, estimate between X and Y → guarantee
     Z)

   `{{CONFIRM: rounding rule or bands}}`
3. **Publish only the fixed amount** in ₪. Never write the percentage or the
   word "אומדן" (estimate) next to it.
4. **Validity:**
   - The bid guarantee is valid until `{{BID_GUARANTEE_VALID_UNTIL}}`, which
     must be later than the offer validity period (S03).
   - The performance guarantee is valid for the contract period plus
     `{{PERF_GUARANTEE_EXTRA_DAYS}}`.
5. **Wording:** Use the template's guarantee clauses and guarantee form word
   for word (G3). Fill in only the amount, dates and beneficiary.
6. **Provide the checklist for S09 stage 2:** amount, beneficiary, validity,
   wording and issuer.

## Output (`outputs`)

```json
{
  "internal": { "estimate": null, "bid_exact": null, "perf_exact": null, "rounding_rule": "", "internal_only": true },
  "bid_guarantee": { "amount_ils": "{{...}}", "valid_until": "{{...}}" },
  "performance_guarantee": { "amount_ils": "{{...}}", "validity_rule_he": "" },
  "clauses_he": "",
  "s09_checklist": [ "amount", "beneficiary", "validity", "wording", "issuer" ]
}
```

## Guardrails

- The `internal` block never leaves the system (G6).
- If the estimate is missing, return `NEEDS_INPUT`. Don't estimate the estimate.

> **Change from source (approved):** The amounts are calculated internally and
> only a rounded fixed amount is published, instead of a published
> percentage. The 2.5% and 5% rates are kept.
