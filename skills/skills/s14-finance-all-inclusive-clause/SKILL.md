---
name: s14-finance-all-inclusive-clause
description: Inserts and enforces the hard "all-inclusive costs" (עלויות כוללות) clause in a בל"מ. The offered price is final and includes travel, licensing, equipment, training and communication, and no extra costs outside the pricing table are recognized. It also checks the pricing table doesn't contradict the clause. Use in Phase 2 of every bid, and whenever extra costs, hidden fees or final-price wording come up.
---
<!--
===========================================
File: skills/s14-finance-all-inclusive-clause/SKILL.md
Purpose: Skill 14. Final-price clause and its consistency with the pricing table.
Owner: Finance (חשבות)
Phase: 2
Depends on: template (if it has its own wording), S12 (pricing table)
Feeds: S04, S05, S09 (supplier notes that add costs are flagged)
Source: original Skill 14
===========================================
-->

# S14: "All-Inclusive Costs" Clause

## Why this skill matters

Offers that look cheap and then add travel, licensing or equipment later make
price comparison meaningless. This clause makes the price in the table the
whole price.

## Steps

1. **If the template contains an all-inclusive clause, use it word for word**
   (G3). Stop here, except for step 3.
2. **If it doesn't,** insert this clause. It carries the source document's
   content, and legal must confirm it at G-CONTENT:

> המחיר המוצע על ידי המציע יהיה סופי ומוחלט, ויכלול את כל העלויות וההוצאות
> הכרוכות בביצוע ההתקשרות, לרבות הוצאות נסיעה, רישוי, ציוד, הדרכה ותקשורת.
> מובהר כי לא יוכרו חריגות או עלויות נוספות כלשהן שאינן מפורטות במפורש
> בטבלת התמחור.

3. **Check consistency with S12.** The pricing table must not contain separate
   lines for items the clause includes (travel, licensing, equipment, training,
   communication). The exception is lines the bid manager deliberately wants
   priced separately. If such a line exists, raise a `CONTRADICTION` flag.
   Either remove the line in S12, or add an explicit exception to the clause.
4. **Evaluation note for S09:** If an offer adds conditions, notes or extra
   costs outside the table, flag it in S09 stage 4. Don't recalculate the
   price. The committee decides.

## Output (`outputs`)

```json
{
  "clause_source": "TEMPLATE | SKILL_DEFAULT",
  "clause_he": "",
  "exceptions": [ ],
  "needs_legal_confirmation": true
}
```

> **Change from source:** Template wording now takes priority. Added a
> consistency check with the pricing table, and handling of offers that add
> costs.
