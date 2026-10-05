---
name: s02-procurement-sla
description: Builds the SLA for a בל"מ: an incident severity table, response and resolution times, measurement rules, and a proportional penalty mechanism, plus the Hebrew clause that explains them. Use in Phase 2 for any services bid, and for any product bid that includes support, maintenance or availability commitments. Use it whenever service levels, uptime, support response or penalties come up.
---
<!--
===========================================
File: skills/s02-procurement-sla/SKILL.md
Purpose: Skill 2. Measurable SLA and penalty mechanism.
Owner: Procurement (with requester input on times)
Phase: 2
Depends on: approved spec (S01), case file parameters, estimate (internal only)
Feeds: S04 (merge), S05 (proportionality check), S11 (liability conflicts)
Source: original Skill 2
===========================================
-->

# S02: SLA and Service Levels

## Why this skill matters

An SLA without clear definitions can't be enforced. "Critical" means
different things to the organization and to the supplier, and the clock
start is always argued about. Penalties that are too harsh drive good
suppliers away, or raise every price.

## When it doesn't apply

For a one-time product purchase with no support, maintenance or availability
commitment, return `COMPLETE` with `not_applicable: true` and a reason.

## Inputs

| Input | Source |
|---|---|
| Spec items in categories SUPPORT / PERFORMANCE (availability) | S01 |
| SLA times per severity: `SLA_*` parameters | Case file |
| Service hours: `SERVICE_HOURS` (for example, 24/7 or Sun–Thu 08:00–17:00) | Case file |
| Monthly or annual contract value (for proportionality) | S12 structure + estimate (internal) |

## Steps

1. **Define severity levels.** Use these definitions unless the requester's
   spec defines its own:

| Severity | Hebrew | Definition |
|---|---|---|
| Critical | קריטית | The system or service is completely unavailable, a core function stops for all users, a security incident, or data loss or corruption |
| Major | גדולה | A core function is seriously impaired and there's no reasonable workaround |
| Medium | בינונית | A function is partly impaired and a workaround exists |
| Minor | קלה | A cosmetic issue, a question, or a documentation issue with no operational impact |

2. **Set the times.** For each severity, set:
   - Initial response time: acknowledgement plus a qualified person
     starting work.
   - Full resolution time: the service is restored.
   - Optionally, a workaround time.

   Take the values from the parameters. If they're missing, use
   placeholders and add a question. You may propose typical values, but
   only with a label.

3. **Define the measurement rules.** Without these, the SLA can't be enforced:
   - **When the clock starts:** When the incident is logged in the agreed
     channel.
   - **Which clock:** Calendar time or service hours only.
   - **What counts as resolved:** Full restoration. A workaround stops the
     clock only if the SLA says so.
   - **Who classifies severity:** The organization. The supplier may appeal.
   - **Measurement period:** Monthly.
   - **Reporting:** The supplier submits a monthly SLA report.

4. **Build the penalty mechanism.**
   - A penalty per breach, per unit of delay. Use a parameter, for example
     `{{PENALTY_CRITICAL_PER_HOUR}}`.
   - A monthly cap as a percentage of the monthly fee: `{{SLA_PENALTY_CAP_PCT}}`.
   - Repeated breach: link to the template's termination clause. Refer
     to it. Don't rewrite it (G3).
   - A statement that penalties are agreed damages. Use the template's
     wording if it has one.

5. **Check proportionality** (internal only). Calculate the largest penalty
   that could apply in one month and compare it to the monthly fee. If it
   exceeds the cap, or the cap is above `{{SLA_CAP_ALERT_PCT}}`, raise a
   `PROPORTIONALITY` flag.

6. **Write the Hebrew clause.** It covers the definitions, the table (as a
   reference), the measurement rules and the penalties. Keep the style formal,
   in line with the template.

## Output (`outputs`)

```json
{
  "not_applicable": false,
  "severity_table": [
    { "severity": "CRITICAL", "name_he": "קריטית", "definition_he": "", "response_time": "{{SLA_CRIT_RESPONSE}}", "resolution_time": "{{SLA_CRIT_RESOLVE}}", "penalty": "{{PENALTY_CRITICAL_PER_HOUR}}" }
  ],
  "measurement_rules_he": "",
  "penalty_mechanism": { "cap_pct_monthly": "{{SLA_PENALTY_CAP_PCT}}", "repeat_breach_ref": "template section ID" },
  "clause_he": "",
  "proportionality_check": { "max_monthly_penalty": null, "monthly_fee": null, "ratio": null, "internal_only": true }
}
```

## Guardrails

- The proportionality numbers use the estimate. They're internal only (G6)
  and must never appear in `clause_he`.
- Don't set penalties that conflict with the template's liability cap. S11
  checks for this, but avoid it from the start.

> **Changes from source:**
> - Added severity definitions, measurement rules (clock start, service
>   hours, what counts as resolved), a penalty cap and an internal
>   proportionality check.
> - The source asked for a table plus an explanation clause. Both are kept.
