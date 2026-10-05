---
name: s04-procurement-merge-and-style
description: Merges the template and all skill outputs into one בל"מ document. It unifies tone and terminology, applies the organizational numbering, checks cross-references, and detects and resolves contradictions between repeated facts. Use in Phase 4, and again after any approved change, insurer feedback or post-publication amendment. Use it whenever parts of a bid need to be combined, cleaned up, renumbered or made consistent.
---
<!--
===========================================
File: skills/s04-procurement-merge-and-style/SKILL.md
Purpose: Skill 4. One consistent document from the template and all outputs.
Owner: Procurement
Phase: 4 (also on loop-backs from Phases 6 and 8)
Depends on: template, outputs of S01–S03, S11–S15, S17
Feeds: S05 (quality check), publication version (Phase 7)
Source: original Skill 4
===========================================
-->

# S04: Merge, Style and Consistency

## Why this skill matters

Each skill writes its own part. Without a merge step, the document reads
like several authors wrote it, numbering breaks, and the same date or amount
can appear with two values. A contradiction in a published בל"מ is usually
read against the organization.

## Inputs

- The selected template (T-A / T-B) with its section structure and
  alternative paragraphs
- `outputs` of S01, S02, S03, S11, S12, S13, S14, S15, S17 (those that aren't
  `not_applicable`)
- The glossary (`00_GLOBAL_RULES.md`)

## Steps

1. **Place the content.** Put each skill's output into the template section
   it belongs to. Keep the template's chapter order. Content with no matching
   section: don't create a new chapter. Raise a `WARNING` flag and ask the
   bid manager where it belongs.

2. **Choose alternative paragraphs** using the template rules in
   `00_GLOBAL_RULES.md`: pick one, record the reason, and flag a tie.

3. **Unify terminology.**
   - Build a term map of every name used for the same thing. For example,
     "הספק" / "המציע" / "הזוכה" / "נותן השירות" / "הקבלן".
   - Use the template's defined term everywhere. Note that "המציע" before the
     award and "הספק" after it can be a correct legal distinction. Keep the
     template's usage.

4. **Unify tone and style.** Formal Hebrew, consistent sentence structure, the
   same way of writing numbers, dates and currency (for example, 1,000 ₪ or
   ₪1,000, as the template does).

   **Skip every hard legal section completely** (G3). Don't touch even a
   comma.

5. **Apply the numbering** according to G8, or the template's own scheme.
   Renumber from start to end.

6. **Check cross-references.** Every "כמפורט בסעיף X" must point to an
   existing section with the matching content. Fix references that changed
   because of renumbering. Flag references that point to nothing.

7. **Detect contradictions.**
   - Extract every repeated fact: dates, deadlines, amounts, percentages,
     quantities, durations, names, contact details and weights.
   - Group identical facts. Where values differ, resolve them this way:
     - **a.** The value that appears most often wins.
     - **b.** If there's a tie, the value that's written first in the
       document wins.
     - **c.** In every case, raise a `CONTRADICTION` flag listing all the
       values and their locations.
   - **Exceptions: don't fix these automatically.** Raise a `BLOCKER` instead:
     - One of the values is inside a hard legal section (G3).
     - The fact is an amount, a guarantee, a weight or a submission deadline.

     A wrong automatic fix here is more harmful than asking.

8. **Write a change log** of every edit that isn't pure placement: style
   changes, chosen alternatives and resolved contradictions. Show the before
   and after text for each.

## Output (`outputs`)

```json
{
  "document_version": "vN",
  "document": "the merged document (Hebrew) with internal flags inline",
  "term_map": [ { "defined_term": "", "variants_replaced": [] } ],
  "alternatives_chosen": [ { "section": "", "alternative": "", "reason": "" } ],
  "contradictions": [ { "fact": "", "values": [ { "value": "", "location": "" } ], "resolved_to": "", "rule": "MAJORITY | FIRST | NOT_AUTO_RESOLVED" } ],
  "broken_references": [ ],
  "change_log": [ { "location": "", "before": "", "after": "", "reason": "" } ]
}
```

## Guardrails

- Don't add, remove or change requirements. Style only. If you think content
  is wrong, flag it.
- Keep internal flags and source records in this version. They're removed
  only when the publication version is made in Phase 7.

> **Changes from source:**
> - The source said contradictions are resolved by "the value written first /
>   that repeats". This is now an ordered rule: majority, then first-written,
>   and always flagged.
> - Amounts, guarantees, weights, deadlines and legal text aren't
>   auto-fixed.
> - Added a term map, cross-reference checking and a change log.
>
> **Suggestion (not implemented):** Also consider the source's authority
> (G1 order) when resolving contradictions. For example, a template value
> would beat a requester value even if the requester value repeats more
> often.
