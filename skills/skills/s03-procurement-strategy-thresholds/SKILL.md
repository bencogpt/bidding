---
name: s03-procurement-strategy-thresholds
description: Defines a בל"מ's supplier strategy: threshold conditions (תנאי סף), quality evaluation criteria and weights, the price scoring formula, the pricing approach (fixed / hour bank / rates), and the supplier-interaction timeline. Use in Phase 2 of every bid, and whenever thresholds, scoring, weights, the quality/price split or how the winner is chosen are discussed.
---
<!--
===========================================
File: skills/s03-procurement-strategy-thresholds/SKILL.md
Purpose: Skill 3. Thresholds, evaluation criteria and weights, pricing approach.
Owner: Procurement
Phase: 2
Depends on: approved spec (S01), case file parameters, template threshold section
Feeds: S04, S05, S09 (evaluation), S12 (pricing approach), S19 (conference deck)
Source: original Skill 3
===========================================
-->

# S03: Supplier Strategy, Thresholds and Evaluation

## Why this skill matters

Threshold conditions decide who may compete. The evaluation criteria decide
who wins. Both must be objective and verifiable, and they must be fixed
before any offer arrives. If they aren't, the award can be challenged.

## Inputs

| Input | Source |
|---|---|
| Spec items (MANDATORY / ADVANTAGE) | S01 |
| Template's standard thresholds (for example, legal registration and tax compliance) | Template (T-A / T-B) |
| `QUALITY_WEIGHT`, `PRICE_WEIGHT`, `MIN_QUALITY_SCORE`, timeline dates | Case file |
| Estimated annual contract value (internal) | Estimate |

## Steps

### A. Threshold conditions (תנאי סף)

1. **Keep the template's standard thresholds exactly as worded** (G3). Don't
   add them yourself if the template already contains them.
2. **Add project-specific thresholds** only where the spec justifies them:
   previous experience, certifications and standards, or professional
   licenses.

   Each threshold must be:
   - **Independent:** It can be checked on its own.
   - **Objective:** Yes/no, with no judgment.
   - **Provable:** It names the document that proves it.
   - **Linked:** It refers to the spec item that justifies it.
3. **Check proportionality** before writing any number. This covers years of
   experience, number of references, and turnover. If the required turnover is
   more than `{{MAX_TURNOVER_RATIO}}` times the annual contract value, or the
   experience or reference requirements look higher than the project needs,
   raise a `COMPETITION` flag with the reason.
4. **Don't create thresholds from example bids.** Use their structure only (G1).

### B. Evaluation criteria

5. **Weights:** Use `QUALITY_WEIGHT` and `PRICE_WEIGHT` from the case file.
   They must add up to 100. If they're missing, return `NEEDS_INPUT`.
6. **Quality criteria:**
   - Build them from the spec's ADVANTAGE items, plus general quality aspects
     the bid manager approves: methodology, team, experience, references,
     demo.
   - Each criterion has a sub-weight. Sub-weights add up to 100% of the
     quality score.
   - Each criterion has a scoring scale that describes what each score level
     means. This is the basis for the מפ"ל used in S09.
7. **Minimum quality score** (optional): If `MIN_QUALITY_SCORE` is set, offers
   below it don't continue to the price stage.
8. **Price scoring formula:** Choose one formula and state it explicitly. The
   default is: price score = (lowest valid price ÷ this offer's price) ×
   `PRICE_WEIGHT`. If the bid manager wants a different formula, use theirs.
9. **Avoid double counting:** A requirement that is a threshold must not also
   be scored as a quality criterion. Flag it if it is.

### C. Pricing approach

10. Recommend one pricing approach, or a combination, with a one-line reason
    based on the bid type and spec:

| Approach | Fits when |
|---|---|
| Fixed price split by milestones | Deliverables are well defined (projects, products) |
| Hour bank by role level | Scope isn't fully known in advance |
| Rates (per unit / user / month) | Ongoing services, licensing, maintenance |

    S12 builds the table from this decision.

### D. Supplier-interaction timeline

11. List these events with placeholders for their dates:
    - Publication
    - Supplier conference (yes/no)
    - Clarification questions deadline
    - Answers publication
    - Submission deadline
    - Offer validity period

    Check that the order is logical and that suppliers have reasonable time.
    If any gap is shorter than `{{MIN_DAYS_BETWEEN_STEPS}}`, raise a
    `COMPETITION` flag.

## Output (`outputs`)

```json
{
  "thresholds": [
    { "id": "TH-01", "text_he": "", "proof_document_he": "", "origin": "TEMPLATE | SPEC", "spec_ref": "REQ-...", "template_ref": "" }
  ],
  "evaluation": {
    "quality_weight": "{{QUALITY_WEIGHT}}",
    "price_weight": "{{PRICE_WEIGHT}}",
    "min_quality_score": "{{MIN_QUALITY_SCORE}}",
    "quality_criteria": [
      { "id": "QC-01", "name_he": "", "sub_weight_pct": 0, "spec_refs": [], "scale_he": [ { "score": 0, "meaning_he": "" } ], "evidence_required_he": "" }
    ],
    "price_formula": "lowest_valid_price / offer_price * PRICE_WEIGHT"
  },
  "pricing_approach": { "models": ["FIXED_MILESTONES | HOUR_BANK | RATES"], "reason": "" },
  "timeline": [ { "event_he": "", "date": "{{...}}" } ]
}
```

## Guardrails

- Don't set weights, dates or numeric thresholds without a source. Use
  placeholders and questions.
- The estimate is used only for the internal proportionality check (G6).

> **Changes from source:**
> - Added provability, a spec link for every threshold, a check against
>   double counting, an explicit price formula, scoring scales (the basis for
>   the מפ"ל) and a timeline.
> - The source line "הגדרת אסטרטגיית הממשק מול הספקים" is implemented as
>   step D.
