---
name: s17-security-requirements
description: Builds the information-security requirements section of a בל"מ from the spec and the organization's security policy. It covers data classification and location, access control, authentication, encryption, logging, vulnerability management, personnel security, incident reporting, subcontractors and data return or deletion, each classified as mandatory or advantage. Use in Phase 2 whenever the supplier will handle organizational data or systems, or whenever security, cyber, privacy or data hosting requirements for a bid come up.
---
<!--
===========================================
File: skills/s17-security-requirements/SKILL.md
Purpose: Skill 17 (new). Information-security requirements for the בל"מ.
Owner: Information security (ב"מ)
Phase: 2
Depends on: S01 (security items, data involved), references/security_policy.md (supplied by the organization)
Feeds: S04, S08, S11, S18 (offer review)
Source: new skill (approved); the source listed ב"מ as a stakeholder with no skills
===========================================
-->

# S17: Information-Security Requirements

## Why this skill matters

Suppliers often get access to organizational data, systems or premises.
Security requirements added after the award are hard to enforce and
expensive. They must be in the בל"מ so suppliers can price them.

## When it doesn't apply

If the supplier gets no access to organizational data, systems, networks or
secure premises (for example, buying standard hardware with no installation),
return `not_applicable: true` with a reason. Information security confirms
this.

## Inputs

- Spec items of category SECURITY, plus a description of the data and systems
  involved (S01)
- `references/security_policy.md`: the organization's security policy and
  standard supplier requirements. **Information security maintains this
  file.** `{{CONFIRM: provide this file}}`
- `DATA_CLASSIFICATION`: the classification of data the supplier will access

## Topics to cover (only those relevant to the scope)

| Topic | What to define |
|---|---|
| Data classification and location | Where data may be stored and processed, and which hosting or cloud options are allowed |
| Access control | Least privilege, named accounts, access approval and removal |
| Authentication | MFA requirements for remote or privileged access |
| Encryption | In transit and at rest, according to policy |
| Logging and monitoring | What is logged, how long logs are kept, and the organization's access to them |
| Vulnerability management | Patch times, penetration tests, secure development (if developing) |
| Personnel security | Background checks and confidentiality commitments for supplier staff |
| Incident reporting | The deadline to report a security incident to the organization (`{{INCIDENT_REPORT_HOURS}}`) |
| Subcontractors | Allowed only with approval, and bound by the same requirements |
| Termination | Return of data, verified deletion, and removal of access |
| Certifications | For example ISO 27001, only if policy requires it for this classification |

## Steps

1. Choose the relevant topics based on the data and the systems involved.
2. Take the values (times, standards, certifications) from the security policy
   file only. Missing values → placeholders and questions (G1, G2).
3. Classify each requirement as `MANDATORY` or `ADVANTAGE`, and give it a
   verification method, as in S01. S18 uses these when checking offers.
4. Make sure required certifications are proportional to the data
   classification. Unnecessary certifications narrow competition (G7). If so,
   raise a `COMPETITION` flag.
5. Write the Hebrew section.

## Output (`outputs`)

```json
{
  "not_applicable": false,
  "security_items": [ { "id": "SEC-001", "topic": "", "text_he": "", "type": "MANDATORY | ADVANTAGE", "verification": "", "policy_ref": "security_policy.md#..." } ],
  "section_he": ""
}
```
