// The activity sentences and the version summaries (plan B6):  node --test functions/lib/test/activity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityRows, activitySentence, fmtDateTime, type ActivityEntry } from '@obms/shared';
import { contextDiff, paragraphsOf, summarizeChange } from '../services/versionDiff.js';

const E = (o: Partial<ActivityEntry>): ActivityEntry => ({ action: 'x', actorName: 'דנה כהן', prevState: null, newState: null, at: 1, ...o });
const s = (o: Partial<ActivityEntry>, labelOf?: (k: string) => string | undefined) => activitySentence(E(o), labelOf);

test('approvals: the team, on behalf with the reason, withdrawn', () => {
  assert.equal(s({ action: 'approve_tender', actorName: 'יעל לוי', newState: 'legal' }), 'אישור סופי: יעל לוי · משפטי');
  assert.equal(s({ action: 'withdraw_approval', actorName: 'אורי מזרחי', newState: 'finance' }), 'האישור בוטל: אורי מזרחי · כספים');
  assert.equal(
    s({ action: 'approve_on_behalf', newState: 'finance', detail: 'אורי מזרחי · אורי בחופשה, אישר בטלפון' }),
    'אישור בשם: דנה כהן אישר בשם אורי מזרחי · כספים · סיבה: אורי בחופשה, אישר בטלפון',
  );
  assert.equal(s({ action: 'withdraw_on_behalf', newState: 'finance' }), 'דנה כהן ביטל את האישור שניתן בשם כספים');
});

test('the lock, publication and the reopen', () => {
  assert.equal(s({ action: 'status_change', prevState: 'draft', newState: 'ready' }), 'אישור סופי: דנה כהן · רכש. המכרז ננעל ומוכן לפרסום');
  assert.equal(s({ action: 'status_change', newState: 'published' }), 'דנה כהן פרסם את הבל"מ לספקים');
  assert.equal(s({ action: 'status_change', newState: 'awarded' }), 'דנה כהן הכריז על זוכה');
  assert.equal(s({ action: 'status_change', newState: 'internal_review' }), null, 'reopen has its own sentence');
  assert.equal(
    s({ action: 'tender_reopened', detail: 'נוצרה גרסה חדשה מקושרת. המקור נשאר נעול' }),
    'דנה כהן פתח מחדש: נוצרה גרסה חדשה מקושרת. המקור נשאר נעול',
  );
});

test('the draft and the agent', () => {
  const labels = (k: string) => ({ org: 'גוף מזמין', quantity: 'כמות' })[k];
  assert.equal(s({ action: 'draft_updated', detail: 'org, quantity, other' }, labels), 'דנה כהן עדכן בטיוטה: גוף מזמין, כמות, other');
  assert.equal(s({ action: 'draft_updated', detail: 'a,b,c,d,e,f' }, () => undefined), 'דנה כהן עדכן בטיוטה: a, b, c, d ועוד 2');
  assert.equal(s({ action: 'draft_updated' }), 'דנה כהן עדכן את הטיוטה');
  assert.equal(s({ action: 'supervision', prevState: 'manual', newState: 'WARN', detail: '0 חוסמים · 3 ממצאים · run abc' }), 'הסוכן המפקח בדק: 3 ממצאים, אין ממצא חוסם');
  assert.equal(s({ action: 'supervision', prevState: 'ready', newState: 'BLOCK', detail: '2 חוסמים · 5 ממצאים · run abc' }), 'הסוכן המפקח בדק: 5 ממצאים, מהם 2 חוסמים');
  assert.equal(s({ action: 'supervision', prevState: 'edit', newState: 'WARN', detail: '0 חוסמים · 1 ממצאים' }), null, 'rules re-checks after edits are noise');
  assert.equal(s({ action: 'finding_applied', newState: '1' }), 'דנה כהן הטמיע ממצא אחד');
  assert.equal(s({ action: 'finding_skipped', newState: '3' }), 'דנה כהן השאיר 3 ממצאים כמו שהם');
  assert.equal(s({ action: 'supervisor_override', detail: 'אישור חריג לצורך בדיקה (run r1)' }), 'דנה כהן פרסם בחריגה מתועדת מעל חסימת הסוכן המפקח: אישור חריג לצורך בדיקה');
});

test('team changes; technical actions are left out', () => {
  assert.equal(s({ action: 'team_assigned', newState: 'legal:יעל לוי' }), 'דנה כהן שייך את יעל לוי לתפקיד משפטי');
  assert.equal(s({ action: 'team_assigned', actorName: 'יעל לוי', newState: 'legal:יעל לוי' }), 'שיוך לתפקיד משפטי: יעל לוי', 'a unit assigning itself');
  assert.equal(s({ action: 'team_unassigned', newState: 'finance' }), 'דנה כהן הסיר את השיבוץ של כספים');
  for (const action of ['case_score', 'provenance_recorded', 'ai_draft', 'request_research', 'set_role', 'write']) {
    assert.equal(s({ action }), null, action);
  }
});

test('activityRows: newest first, only sentences', () => {
  const rows = activityRows([
    E({ id: 'a', action: 'document_generated', at: 100 }),
    E({ id: 'b', action: 'case_score', at: 300 }),
    E({ id: 'c', action: 'approve_tender', newState: 'finance', at: 200 }),
  ]);
  assert.deepEqual(rows.map((r) => r.key), ['c', 'a']);
  assert.equal(fmtDateTime(new Date(2026, 9, 28, 14, 32).getTime()), '28.10.2026 14:32');
});

const DOC = ['# פרטים', 'גוף מזמין: משרד', '# תנאי סף', 'ניסיון בשלושה פרויקטים', 'מחזור שנתי', '# ערבויות', 'ערבות הצעה 20,000'].join('\n');

test('summarizeChange: version 1, no change, and named sections', () => {
  assert.deepEqual(summarizeChange(null, DOC), { summary: 'המסמך נוצר מהטיוטה', changes: 0 });
  assert.deepEqual(summarizeChange(DOC, DOC), { summary: 'ללא שינוי בטקסט', changes: 0 });
  const edited = DOC.replace('ניסיון בשלושה פרויקטים', 'ניסיון בשני פרויקטים');
  assert.deepEqual(summarizeChange(DOC, edited), { summary: 'שונתה פסקה אחת · תנאי סף', changes: 1 });
  const two = edited.replace('ערבות הצעה 20,000', 'ערבות הצעה 25,000');
  assert.deepEqual(summarizeChange(DOC, two), { summary: 'שונו 2 פסקאות · תנאי סף, ערבויות', changes: 2 });
  const added = DOC + '\nערבות ביצוע 40,000';
  assert.deepEqual(summarizeChange(DOC, added), { summary: 'שונתה פסקה אחת · ערבויות', changes: 1 });
});

test('summarizeChange: numbered headings and no heading at all', () => {
  const numbered = ['1. כללי', 'טקסט', '6. תנאי סף', 'דרישה ישנה'].join('\n');
  assert.equal(summarizeChange(numbered, numbered.replace('דרישה ישנה', 'דרישה חדשה')).summary, 'שונתה פסקה אחת · 6. תנאי סף');
  assert.equal(summarizeChange('שורה א\nשורה ב', 'שורה א\nשורה ג').summary, 'שונתה פסקה אחת');
});

test('contextDiff keeps the lines around a change and collapses the rest', () => {
  const a = Array.from({ length: 20 }, (_, i) => `שורה ${i}`).join('\n');
  const b = a.replace('שורה 10', 'שורה 10 חדשה');
  const rows = contextDiff(a, b, 2);
  assert.deepEqual(rows.map((r) => r.kind), ['gap', 'same', 'same', 'del', 'add', 'same', 'same', 'gap']);
  assert.equal(rows[0].text, '8 פסקאות ללא שינוי');
  assert.equal(rows[3].text, 'שורה 10');
  assert.equal(rows[4].text, 'שורה 10 חדשה');
  assert.deepEqual(paragraphsOf(' א \n\n ב  ג \r\n'), ['א', 'ב ג']);
  assert.deepEqual(contextDiff('x', 'x').map((r) => r.kind), ['same']);
});
