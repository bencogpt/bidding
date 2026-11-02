<!--
===========================================
File: 01_ORCHESTRATOR.md
Purpose: Defines how the agentic bidding system runs a בל"מ from the bid
         manager's short description to award letters: phases, which skill
         runs when, human approval gates, the shared bid case file, and the
         standard hand-off format every skill returns.
Provides: phase map (0–10), entry/exit criteria per phase, gate rules,
          hand-off schema, re-run (dependency) rules, flag handling.
Relationships: Requires 00_GLOBAL_RULES.md (rules G1–G11).
               Calls the skills in skills/s01 … s19 by their skill ID.
               Each SKILL.md defines its own "outputs" object inside the
               hand-off format defined here.
===========================================
-->

# Orchestrator: Running a בל"מ End to End

This file tells the system **what to run, in what order, and when to stop for
a human**. Individual skills define **how** to do each task.

Load `00_GLOBAL_RULES.md` first. Its rules apply to every step below.

---

## 1. The bid case file

Keep one case file per בל"מ. Every skill reads from it and writes back to it.
This is the single source of truth for the run.

```json
{
  "bid_id": "string",
  "bid_title": "string",
  "bid_type": "PRODUCT | SERVICES | MANPOWER",
  "template_id": "T-A | T-B",
  "short_description": "the bid manager's original text, unchanged",
  "requester_input": "the requester's original text, unchanged",
  "bid_lead": { "name": "first name + last initial", "email": "", "phone": "" },
  "estimate": { "amount": null, "currency": "ILS", "confidential": true },
  "parameters": { "QUALITY_WEIGHT": null, "PRICE_WEIGHT": null, "...": null },
  "document_versions": [ { "version": "v1", "created_by": "S04", "timestamp": "" } ],
  "skill_results": { "S01": { "...hand-off object...": "" } },
  "open_flags": [ ],
  "open_questions": [ ],
  "approvals": [ { "gate": "G-SPEC", "approver": "", "role": "", "version": "", "timestamp": "", "decision": "APPROVED | REJECTED", "notes": "" } ],
  "suppliers": [ { "supplier_id": "", "access_approved": false } ],
  "current_phase": 0
}
```

Rules for the case file:

- **Keep original input unchanged.** `short_description` and `requester_input`
  are never edited, so any output can be traced back to them (G11).
- **The estimate is marked confidential.** No skill may copy it into anything
  that leaves the system (G6).
- **`parameters` holds every configurable value** (weights, SLA times,
  percentages, dates). A skill that needs a value reads it from here. If it's
  `null`, the skill follows the missing-information protocol (G2).

---

## 2. Hand-off format

Every skill returns exactly this object. The skill's own `SKILL.md` defines
what goes inside `outputs`.

```json
{
  "skill_id": "S01",
  "bid_id": "string",
  "input_version": "the case-file or document version the skill worked on",
  "status": "COMPLETE | NEEDS_INPUT | BLOCKED | FAILED",
  "outputs": { },
  "flags": [
    {
      "type": "MISSING_INFO | LEGAL_CONFLICT | CONTRADICTION | AMBIGUITY | COMPETITION | RISK | PROPORTIONALITY | SECURITY | INJECTION",
      "severity": "BLOCKER | WARNING | INFO",
      "location": "section number or skill.field",
      "description": "",
      "suggested_action": "",
      "owner": "stakeholder"
    }
  ],
  "open_questions": [
    { "field": "PLACEHOLDER_NAME", "question": "", "why_needed": "", "owner": "stakeholder" }
  ],
  "sources": [
    { "output_ref": "which output item", "source_type": "TEMPLATE | BID_MANAGER | REQUESTER | SKILL_OUTPUT", "source_ref": "section ID / input line / skill ID" }
  ]
}
```

**What each status means:**

| Status | Meaning | What the orchestrator does |
|---|---|---|
| `COMPLETE` | Finished. There may be `WARNING` or `INFO` flags, but no `BLOCKER` flags | Move on |
| `NEEDS_INPUT` | Can't finish without answers to `open_questions` | Collect questions (see section 5) and wait |
| `BLOCKED` | Has at least one `BLOCKER` flag | Stop the phase and send the flag to its owner |
| `FAILED` | Technical failure, for example a template can't be loaded | Stop and report to the bid manager. Don't retry with guessed data |

---

## 3. Phase map

⏸ marks a human approval gate (see G4). A phase can't start until the
previous phase's exit criteria are met.

| Phase | Name | Skills | Gate at end |
|---|---|---|---|
| 0 | Intake | Orchestrator only | – |
| 1 | Technical spec | S01 | ⏸ G-SPEC (requester) |
| 2 | Drafting | S02, S03, S12, S13, S14, S15, S17 | – |
| 3 | Legal and risk checks | S11, S08 | – |
| 4 | Merge and style | S04 | – |
| 5 | Quality check | S05 | ⏸ G-CONTENT (bid manager) |
| 6 | Insurance hand-off | S16 | ⏸ G-INSURANCE (bid manager, before sending) |
| 7 | Sourcing and publication | S10, S19 | ⏸ G-ACCESS and ⏸ G-PUBLISH (bid manager) |
| 8 | Clarification questions | S06, S07 | ⏸ G-ANSWERS (bid manager) |
| 9 | Offer evaluation | S09 stages 1–4, S18 | ⏸ G-EVALUATION (evaluation committee) |
| 10 | Award | S09 stage 5 | ⏸ G-LETTERS (bid manager) |

---

## 4. Phases in detail

### Phase 0: Intake

**Input:** The bid manager's short description, plus any attachments.

**Steps:**

1. Create the case file and store the original text.
2. Determine `bid_type` from the description:
   - An existing product → `PRODUCT`
   - Services → `SERVICES`
   - Manpower (כ"א) → `MANPOWER`

   If it's unclear or mixed, ask the bid manager. Don't guess.
3. Select the template: `PRODUCT` → T-A. `SERVICES` or `MANPOWER` → T-B, unless
   the bid manager says otherwise. `{{CONFIRM: which template manpower bids use}}`
4. Fill in the bid lead's details.
5. List the parameters this bid will need and mark every missing one.
6. Ask the bid manager for the requester's raw input, if it wasn't attached.
7. If `bid_type = MANPOWER`, add recruitment (גיוס) as a stakeholder for
   this bid. `{{CONFIRM: recruitment's checkpoints}}`

**Exit:** The template is selected, the requester input exists, and the
bid lead's details are filled in.

### Phase 1: Technical spec

**Run:** S01, with the requester's raw input.

**Exit:** S01 status is `COMPLETE`. ⏸ **G-SPEC:** The requester approves the
structured spec. If they reject it, re-run S01 with their comments. The
approved spec is locked. Any later change to it triggers the re-run rules in
section 6.

### Phase 2: Drafting

**Run:** These skills don't depend on each other's output, so they can run in
any order or in parallel. All of them read the approved spec:

| Skill | Produces |
|---|---|
| S20 (runs first) | Default, computed and contract-unique field values, and the date-order check. Never overrides a value the bid manager or requester specified |
| S02 | SLA table and explanation clause (services bids, or products with maintenance) |
| S03 | Threshold conditions, evaluation criteria and weights, pricing approach |
| S12 | Pricing table for suppliers |
| S13 | Milestones and payment terms |
| S14 | "All-inclusive costs" clause |
| S15 | Bid and performance guarantee amounts and clauses |
| S17 | Information-security requirements |

**When a skill doesn't apply:** A skill may be irrelevant to this bid (for
example, S02 for a one-time product purchase with no maintenance). In that
case, it returns `COMPLETE` with `outputs.not_applicable = true` and a
one-line reason. The orchestrator doesn't decide this alone.

**Exit:** Every skill has returned `COMPLETE`. Any `NEEDS_INPUT` is handled
through section 5 first.

### Phase 3: Legal and risk checks

**Run:**

- **S11** checks the template's mandatory legal sections against the drafted
  content.
- **S08** checks the spec and the drafted content against the regulatory and
  legal framework.

Both can run in parallel.

**Exit:** Both return `COMPLETE` or `BLOCKED`. A `BLOCKER` from S11 or S08 must
be resolved by its owner before Phase 4. Resolving it may mean re-running a
Phase 1 or 2 skill (see section 6).

### Phase 4: Merge and style

**Run:** S04 merges the template and all approved outputs into one document.
It unifies style (except hard legal sections, per G3), applies the numbering
convention, checks cross-references, and detects contradictions.

**Exit:** One merged document version exists, and S04's contradiction flags
have been added to the case file.

### Phase 5: Quality check

**Run:** S05 checks the merged document for these problems:

- Threshold conditions that block competition
- Ambiguous wording
- Sanctions that are out of proportion
- Leftover placeholders

**Exit:** There are no `BLOCKER` flags and no placeholders.
⏸ **G-CONTENT:** The bid manager approves the document content.

### Phase 6: Insurance hand-off

**Run:** S16 extracts only the insurance-related text and a short summary of
the engagement.

**Exit:** ⏸ **G-INSURANCE:** The bid manager approves the exact package before
anything is sent.

**Loop-back:** If the insurance company returns requested changes, record them
in the case file and return to Phase 4 (S04 merges the change). Then repeat
Phase 5 and G-CONTENT.

### Phase 7: Sourcing and publication

**Run:**

1. S10 finds relevant suppliers and prepares the supplier list.
   ⏸ **G-ACCESS:** The bid manager chooses which suppliers get access.
2. Strip every internal item from the document (flags, source records,
   internal notes, the estimate) to produce the **publication version**.
   Then check that none of it remains.
   ⏸ **G-PUBLISH:** The bid manager approves this exact version.
3. Publish only to approved suppliers, all at the same time (G7).
4. If a supplier conference is planned, run S19 to build the presentation from
   the published version.

**Exit:** The בל"מ is published, and the list of approved suppliers is recorded.

### Phase 8: Clarification questions

**Run:** After the questions deadline:

1. S06 consolidates the questions.
2. S07 routes each consolidated question to legal, finance, requester or
   procurement.
3. Owners write their answers. The system may draft answers only from the
   approved document and case file (G1).

**Exit:** ⏸ **G-ANSWERS:** The bid manager approves the anonymized answers
document. It's then published to **all** approved suppliers.

If an answer changes the בל"מ, record it as an official amendment and return
to Phase 4 for that change. Then repeat Phase 5 and G-PUBLISH.

### Phase 9: Offer evaluation

**Run:** S09 in stages:

1. Open the offers and register them.
2. Check threshold conditions and guarantees (with S18 for security
   compliance).
3. Score quality according to the מפ"ל.
4. Combine the quality and price scores.

**Exit:** ⏸ **G-EVALUATION:** The evaluation committee approves the results
and the ranking. The system recommends. The committee decides.

### Phase 10: Award

**Run:** S09 stage 5 drafts the award and non-award letters from the
organization's template.

**Exit:** ⏸ **G-LETTERS:** The bid manager approves each letter before it's
sent. Each letter contains only information about its own recipient (G6).

---

## 5. Handling questions and flags

- **Batch questions per phase.** Collect `open_questions` from all skills in the
  current phase. Remove duplicates, group them by owner, and send each owner one
  list.
- **`BLOCKER` flags stop the phase exit.** Send each one to its owner. After
  it's resolved, re-run only the skill that raised it, plus anything that
  depends on it (section 6).
- **`WARNING` flags don't stop the phase.** Show them to the approver at the
  next gate. The approver must acknowledge them before approving.
- **`INFO` flags** are listed in the gate summary only.
- **A gate rejection** sends the phase back to the skill named in the
  approver's comments. If none is named, ask the approver which part to redo.

**At every gate, show the approver:**

1. The item to approve and its version
2. Open `WARNING` flags
3. The changes since the last approved version
4. A clear request: approve or reject, with comments

---

## 6. Re-run rules (dependencies)

When an approved output changes, everything built on it may be outdated. Use
this table to decide what to re-run, then repeat the next gate.

| If this changes | Re-run |
|---|---|
| Approved spec (S01) | S02, S03, S08, S11, S12, S17, then S04, S05 |
| Thresholds or criteria (S03) | S05, S09 (if evaluation has started, ask the bid manager first) |
| Pricing table (S12) | S13, S14, S04, S05 |
| Milestones or payment (S13) | S04, S05 |
| SLA (S02) | S05 (proportionality), S04 |
| Estimate | S15, S05 (proportionality) |
| Any template section | S11, S04, S05 |
| Amendment after publication | S04, S05, then G-PUBLISH for the amendment |

**Never re-run a skill whose outputs a human has already approved without
telling that approver.** Show the old and new versions side by side.

---

## 7. Things the orchestrator must never do

- Skip a gate, or treat a timeout or silence as approval.
- Publish or send anything that still contains internal content or
  placeholders.
- Change the order of phases to save time. Phase 2 skills may run in
  parallel with each other, and so may Phase 3 skills with each other, but
  phases never overlap.
- Pass one supplier's material to a skill run for another supplier's
  context (for example, when drafting a letter).
- Decide the winner. Scores are a recommendation to the committee.
