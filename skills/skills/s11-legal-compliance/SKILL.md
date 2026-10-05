---
name: s11-legal-compliance
description: Legal compliance check of a בל"מ against the organization's legal template (T-A or T-B). It verifies that every mandatory legal section (confidentiality, IP, liability and indemnity, thresholds, cancellation/termination) is present word for word, finds conflicts between requester demands and legal sections, and produces flags plus a conflicts appendix. Use in Phase 3, after any template or content change, and whenever legal wording, mandatory clauses or legal conflicts in a bid are in question.
---
<!--
===========================================
File: skills/s11-legal-compliance/SKILL.md
Purpose: Skill 11. Mandatory legal sections present and unchanged; conflicts flagged.
Owner: Legal
Phase: 3 (also re-run after template/content changes)
Depends on: template (T-A / T-B) with marked hard legal sections, Phase 1–2 outputs
Feeds: S04 (conflicts appendix, flags), S05
Source: original Skill 11
===========================================
-->

# S11: Legal Compliance and Mandatory Sections

## Why this skill matters

The hard legal sections protect the organization. Legal wrote them, and even
one missing word can change their meaning. The rule is simple: they appear in
full, exactly as written. Any conflict goes to a human and is never "solved"
by editing the legal text.

## Inputs

- The selected template. Its hard legal sections must be **marked** (for
  example, with section IDs or tags) so the system can find them.
  `{{CONFIRM: how hard sections are marked in T-A / T-B}}`
- Outputs of S01, S02, S03, S12, S13, S14, S15, S17
- The merged document (when re-run after S04)

## Mandatory sections (at least these)

- Confidentiality (סודיות)
- Intellectual property (קניין רוחני)
- Liability and indemnity (אחריות ושיפוי)
- Threshold conditions, as worded in the template (תנאי סף)
- Cancellation or termination of the engagement (ביטול/ סיום התקשרות)
- Any other section the template marks as hard

## Steps

1. **Load** the template that matches `template_id`.
2. **Check presence.** Every mandatory section exists in the draft. If one is
   missing, raise a `BLOCKER`.
3. **Check exact wording.** Compare each hard section in the draft with the
   template, character by character, after normalizing only whitespace.
   - The only allowed difference is a placeholder the template defines,
     filled in correctly.
   - Any other difference, even one word, raises a `BLOCKER`. Show the
     template text next to the draft text.
4. **Find conflicts.** Check the other skills' outputs against the hard
   sections. For example:
   - The requester wants the supplier to keep the IP, but the template
     gives it to the organization.
   - SLA penalties exceed the template's liability cap.
   - The spec allows subcontractors, but the confidentiality section
     forbids them.

   For each conflict, raise a `LEGAL_CONFLICT` flag at the conflicting place
   in the document. Owner: legal.
5. **Write the conflicts appendix** (נספח סתירות) at the end of the internal
   draft. For each conflict, list:
   - The legal section
   - The conflicting demand and where it is
   - A short explanation
   - What legal must decide

   **Don't propose new legal wording.** That's legal's decision.

## Output (`outputs`)

```json
{
  "mandatory_sections": [ { "section_id": "", "name_he": "", "present": true, "verbatim": true, "diff": null } ],
  "conflicts": [ { "conflict_id": "LC-001", "legal_section_id": "", "conflicting_item": "REQ-... / S02 / section", "explanation_he": "", "decision_needed_he": "" } ],
  "conflicts_appendix_he": "internal appendix text"
}
```

## Guardrails

- Never edit, shorten or "fix" a hard legal section. That includes spelling
  (G3).
- The conflicts appendix is internal. It's removed from the publication
  version (G6).

> **Changes from source:**
> - "התרע בסוף המסמך" is implemented as an internal conflicts appendix plus
>   inline flags. It isn't part of the published בל"מ, because suppliers
>   shouldn't see internal legal disputes.
> - Added a character-level wording check and the requirement that hard
>   sections are marked in the templates.
