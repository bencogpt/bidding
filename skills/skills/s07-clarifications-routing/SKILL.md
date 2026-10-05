---
name: s07-clarifications-routing
description: Routes each consolidated clarification question to the right professional owner (legal, finance, requester, procurement or information security) by analyzing its content, and adds an owner column to S06's output. Use in Phase 8 immediately after S06, or whenever bid questions must be assigned to a responsible team.
---
<!--
===========================================
File: skills/s07-clarifications-routing/SKILL.md
Purpose: Skill 7. Assign each consolidated question to its owner.
Owner: Procurement
Phase: 8
Depends on: S06 output
Feeds: owners' answers, then the answers document (gate G-ANSWERS)
Source: original Skill 7
===========================================
-->

# S07: Routing Clarification Questions

## Inputs

- `consolidated_questions` from S06
- The published document (to see what the referenced section is about)

## Routing rules

Decide from **both** the question's content and the section it refers to:

| Owner | Topics |
|---|---|
| Legal (משפטי) | Threshold conditions, guarantees (legal wording), contract, insurance, liability, IP, confidentiality |
| Finance (כספים) | Pricing, payment terms, linkage/indexation, fees, guarantee amounts |
| Requester (דורש) | Technical spec, architecture, quantities, equipment, deliverables |
| Procurement (רכש) | Submission dates, supplier conference, how to submit, forms |
| Information security (ב"מ) | Security requirements (S17), data hosting and location, access, security certifications |

## Steps

1. For each question, choose a **primary owner**. Add a **secondary owner** if
   another discipline must agree. For example, a question about a guarantee
   amount goes to finance first, with legal second.
2. Give a one-line reason for the choice.
3. Give a confidence level: `HIGH`, `MEDIUM` or `LOW`. When it's `LOW`, set
   the primary owner to procurement for manual assignment. Don't guess.
4. If one consolidated question really contains two questions for different
   owners, flag it and suggest that S06 splits it.

## Output (`outputs`)

This adds fields to each item in S06's list:

```json
{
  "routed_questions": [
    { "cq_id": "CQ-001", "primary_owner": "LEGAL | FINANCE | REQUESTER | PROCUREMENT | SECURITY", "secondary_owner": null, "reason": "", "confidence": "HIGH | MEDIUM | LOW" }
  ],
  "per_owner_lists": { "LEGAL": ["CQ-..."], "FINANCE": [] }
}
```

> **Changes from source:**
> - Added information security (ב"מ) as a routing owner, because S17 now adds
>   security requirements to the בל"מ.
> - Added a secondary owner, a confidence level, and manual assignment when
>   confidence is low.
