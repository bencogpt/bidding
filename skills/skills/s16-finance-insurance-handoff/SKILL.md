---
name: s16-finance-insurance-handoff
description: Prepares the minimal package sent to the insurance company for a בל"מ. It contains only the insurance appendix, the insurance certificate and the specific insurance-related sentences, plus a short summary of the engagement, with no prices, estimate, suppliers or internal notes. It also handles the insurer's reply. Use in Phase 6, and whenever bid content must go to the insurer or insurance clauses need review.
---
<!--
===========================================
File: skills/s16-finance-insurance-handoff/SKILL.md
Purpose: Skill 16. Minimal, approved package to the insurance company.
Owner: Finance (חשבות)
Phase: 6 (gate G-INSURANCE; loop-back to Phase 4 on insurer changes)
Depends on: approved content (after G-CONTENT), S01 summary
Feeds: external insurance company (after approval); S04 on changes
Source: original Skill 16
===========================================
-->

# S16: Insurance Hand-off

## Why this skill matters

This is the only skill that sends bid content outside the organization before
publication. The insurer needs to understand the risk. It doesn't need the
price, the estimate, the evaluation method or internal discussions (G6).

## Steps

1. **Extract the insurance text:**
   - The insurance appendix (נספח ביטוחים)
   - The insurance certificate (אישור ביטוחים)
   - Every **sentence** elsewhere that deals with insurance. Search terms
     include: ביטוח, מבטח, פוליסה, אחריות מקצועית, צד שלישי, חבות מעבידים,
     אחריות המוצר.

   Take only the relevant sentence, not the whole section around it. For
   each extracted piece, keep its section number.
2. **Write a short engagement summary** (about 5–8 lines, in Hebrew) of what
   the insurer needs to know:
   - Type of engagement (product or service)
   - General scope
   - Duration
   - Where the work is done (on-site or remote)
   - Whether the supplier will access personal or sensitive data (yes/no,
     plus the type of data)
   - Main risk factors, for example physical work, data handling or
     critical systems
3. **Check the package for internal content.** Remove anything that is:
   - A price, the estimate, a guarantee amount, or a weight
   - A supplier name
   - A flag or internal note
   - The conflicts appendix or the risk register
   - Contact details other than the bid lead's
4. **Stop for G-INSURANCE.** The bid manager sees the exact package. Nothing is
   sent before approval (G4).
5. **Handle the reply.** Record the insurer's requested changes in the case
   file. Changes to the insurance appendix go to legal and finance, then back
   through S04 and S05 (the orchestrator's loop-back).

## Output (`outputs`)

```json
{
  "package": {
    "insurance_texts": [ { "section_id": "", "text_he": "" } ],
    "engagement_summary_he": ""
  },
  "removed_items_check": { "prices": false, "estimate": false, "suppliers": false, "internal_notes": false },
  "status_sent": false,
  "insurer_reply": null
}
```

> **Change from source:** Added a check that removes internal content, the
> approval gate before sending, and handling of the insurer's reply. The
> original rule (send only the specific insurance wording plus a short summary)
> is kept.
