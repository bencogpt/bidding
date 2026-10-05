---
name: s19-supplier-conference-deck
description: Builds the supplier conference (כנס ספקים) presentation for a published בל"מ. It covers bid type, threshold conditions, how the winner is chosen, main engagement terms, timeline and the clarification process, taken only from the published version. Use in Phase 7 when a supplier conference is planned, and whenever slides or a presentation for suppliers about a bid are needed.
---
<!--
===========================================
File: skills/s19-supplier-conference-deck/SKILL.md
Purpose: Skill 19 (new). Supplier conference presentation outline.
Owner: Procurement
Phase: 7 (after G-PUBLISH)
Depends on: publication version of the בל"מ (only), S03 timeline
Feeds: presentation renderer of the system; conference minutes
Source: new skill (approved); described in source section 2.א.6 without a skill number
===========================================
-->

# S19: Supplier Conference Presentation

## Why this skill matters

The conference is the only time most suppliers hear about the בל"מ directly.
Everything shown must match the published document exactly. Anything extra
or different creates unequal information or a dispute about what was
promised.

## Inputs

- **Only the publication version** of the בל"מ (after G-PUBLISH). Never the
  internal draft, flags, estimate or risk register (G6).
- S03's timeline

## Slides (the content comes from the source document)

1. Title: the name of the בל"מ, the organization, and the conference date
2. Background and purpose of the engagement (short)
3. **Type of בל"מ** (product / services) and main scope
4. **Threshold conditions**: a list, with a reference to the exact sections
5. **How the winner is chosen**: quality/price weights, main quality criteria,
   and the price formula
6. **Main engagement terms**: duration, SLA summary, payment mechanism, and
   guarantees (the published amounts only)
7. Timeline: clarification questions deadline, submission deadline, how to
   submit
8. The clarification-questions process and the question template (S06)
9. The bid lead's contact details (`{{BID_LEAD_NAME}}`, email)

## Steps

1. Build each slide from the published text. Add a section reference to
   every fact. Summarize, but don't add, change or interpret anything.
2. Include this statement on the first slide and the last slide:
   > "המצגת נועדה להקל על ההבנה בלבד. בכל מקרה של סתירה, יגבר נוסח הבל"מ."
3. Hand the outline to the system's presentation renderer. Formatting follows
   the organization's design system, if it has one.
4. **After the conference:** Questions asked orally are recorded in the
   minutes. Answers are published in writing to **all** approved suppliers,
   through the Phase 8 process (G7).

## Output (`outputs`)

```json
{
  "slides": [ { "n": 1, "title_he": "", "bullets_he": [], "source_sections": [] } ],
  "disclaimer_he": "המצגת נועדה להקל על ההבנה בלבד. בכל מקרה של סתירה, יגבר נוסח הבל\"מ."
}
```
