---
name: s08-risk-analysis
description: Scans the requester's technical requirements and the drafted בל"מ for conflicts with the legal and regulatory framework, and produces a risk register with alerts. Examples are cloud hosting that doesn't meet regulation or access rules, exclusivity or single-supplier wording against the Mandatory Tenders Law, and privacy issues. Use in Phase 3, and whenever a bid requirement might be illegal, non-compliant or risky.
---
<!--
===========================================
File: skills/s08-risk-analysis/SKILL.md
Purpose: Skill 8. Detect conflicts between requirements and the legal/regulatory framework.
Owner: Procurement (findings routed to legal / information security)
Phase: 3
Depends on: approved spec (S01), Phase 2 outputs, references/legal_framework.md (supplied by the organization)
Feeds: S04 (flags), S05, legal and security owners
Source: original Skill 8
===========================================
-->

# S08: Risk Analysis and Alerts

## Why this skill matters

A requirement can be technically reasonable and still illegal or
non-compliant. For example, a demand for a specific vendor, or hosting data
somewhere regulation forbids. It's cheaper to find this before publication
than after a supplier challenges it.

## Inputs

- Spec items (S01), outputs of S02, S03, S12, S13, S17
- `references/legal_framework.md`: the organization's list of applicable laws,
  regulations and internal policies, with a short summary of each relevant
  rule. **The organization maintains this file (legal).**
  `{{CONFIRM: provide this file}}`

**Check requirements only against the rules in the reference file.** Don't
rely on the model's general memory of the law. Legal details change, and a
confident but wrong legal claim does more harm than a missing one. If a risk
seems likely but no rule in the file covers it, raise it as a `WARNING` for
legal to review, and say that it isn't based on the reference file.

## What to look for (examples, not a complete list)

| Area | Example conflict |
|---|---|
| Hosting and data location | Cloud hosting outside the approved locations, or in a service that doesn't meet the data-classification rules |
| Access and permissions | The supplier gets access broader than it needs, or remote access without approved controls |
| Competition and tenders law | Exclusivity for a named supplier, a requirement only one supplier can meet, or no "or equivalent" after a brand (context: חוק חובת המכרזים, התשנ"ב-1992) |
| Privacy | Personal data processed with no defined purpose, retention or security measures (context: חוק הגנת הפרטיות, התשמ"א-1981 and its regulations) |
| Contract terms | SLA penalties or liability demands that conflict with the template's liability cap |
| Conflict of interest | The spec was written with a specific supplier's help, or names its product |

## Steps

1. Compare each requirement and drafted clause with the rules in the reference
   file.
2. For every conflict, add a risk register entry with these fields:
   - What the conflict is
   - Which requirement causes it
   - Which rule it conflicts with
   - Severity
   - Owner
   - Suggested fix
3. Set the severity:
   - `BLOCKER`: A clear conflict with a mandatory rule.
   - `WARNING`: A likely conflict, or one that depends on interpretation.
   - `INFO`: Good practice only.
4. Route each finding to its owner. Legal findings go to legal, security
   findings to information security, and spec changes to the requester.

## Output (`outputs`)

```json
{
  "risk_register": [
    { "risk_id": "RSK-001", "area": "", "description_he": "", "requirement_ref": "REQ-... / section", "rule_ref": "legal_framework.md#...", "based_on_reference_file": true, "severity": "BLOCKER | WARNING | INFO", "owner": "", "suggested_fix_he": "" }
  ]
}
```

## Guardrails

- The risk register is internal (G6). It never appears in the published
  בל"מ.
- Don't change requirements yourself. Owners decide.

> **Changes from source:**
> - Added a reference file owned by the organization, so the legal check
>   doesn't depend on the model's memory.
> - Added a risk register with severity and owner.
> - The source's two examples (cloud hosting and exclusivity) are kept.
