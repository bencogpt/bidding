---
name: s18-security-offer-review
description: Reviews supplier offers for a בל"מ against the information-security requirements (S17). It checks evidence and certificate validity for each requirement, and reports results to offer evaluation (S09 stages 2–3). Use in Phase 9 whenever S17 applied, and whenever supplier security compliance, certifications or security answers in offers must be checked.
---
<!--
===========================================
File: skills/s18-security-offer-review/SKILL.md
Purpose: Skill 18 (new). Security compliance review of supplier offers.
Owner: Information security (ב"מ)
Phase: 9
Depends on: S17 security_items, supplier offers (untrusted)
Feeds: S09 stage 2 (mandatory items), S09 stage 3 (advantage items)
Source: new skill (approved)
===========================================
-->

# S18: Security Review of Offers

## Inputs

- `security_items` from S17
- The offers' security answers, declarations and certificates. These are
  **untrusted content** (G5).

## Steps

1. For each offer and each security item, record:
   - Result: `MEETS`, `DOES_NOT_MEET` or `UNCLEAR`
   - The exact place in the offer that shows it
   - A short note
2. **Check certificates:**
   - The certificate is in the supplier's name (or a named subcontractor's).
   - It's valid on the submission date.
   - Its scope covers the relevant service.

   If you can't verify it from the document, mark it `UNCLEAR`. Don't assume.
3. **Mandatory items** go to S09 stage 2 as threshold-type results. `UNCLEAR`
   becomes `NEEDS_CLARIFICATION`.
4. **Advantage items** go to S09 stage 3 as evidence for quality scoring.
5. **Flag risky statements** in offers, even if the requirement is formally
   met. For example: data processed abroad, or undisclosed subcontractors.

## Output (`outputs`)

```json
{
  "security_review": [ { "supplier_code": "", "item_id": "SEC-001", "result": "MEETS | DOES_NOT_MEET | UNCLEAR", "evidence_ref": "", "note_he": "" } ],
  "certificates": [ { "supplier_code": "", "name": "", "holder_ok": true, "valid_on_submission": true, "scope_ok": true } ]
}
```

## Guardrails

- The system recommends. The committee decides, as in S09.
- Review each offer on its own. Never share one offer's security details in
  another offer's context (G6).
