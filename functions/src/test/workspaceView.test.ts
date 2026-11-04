// The workspace view rules, row by row against the prototype tables (plan A1–A5, as amended by D1):
//   node --test functions/lib/test/workspaceView.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentChip,
  agentStateOf,
  approvalsView,
  draftStateOf,
  findingKey,
  findingsView,
  fmtStamp,
  headerAction,
  isApproved,
  missingTeamApprovals,
  pendingItems,
  pendingStageCounts,
  progressPct,
  resolveTab,
  stageBar,
  stageIndexOf,
  visibleTabs,
  type ApprovalsCtx,
  type Approvals,
  type FindingInput,
  type PendingCtx,
  type PendingTenderInput,
  type WorkspaceCtx,
} from '@obms/shared';

const T = (h: number, m = 0) => new Date(2026, 10, 4, h, m).getTime(); // local time: fmtStamp is local too
const H = {
  requester: { uid: 'u-req', name: 'דני כהן' },
  legal: { uid: 'u-leg', name: 'יעל לוי' },
  finance: { uid: 'u-fin', name: 'אורי מזרחי' },
  security: { uid: 'u-sec', name: 'גיל דהן' },
};
type R = keyof typeof H;
const ok = (role: R, at = T(10)) => ({ uid: H[role].uid, name: H[role].name, at });
const approvals = (...roles: R[]): Approvals => Object.fromEntries(roles.map((r) => [r, ok(r)]));

const ctx = (over: Partial<WorkspaceCtx> = {}): WorkspaceCtx => ({
  stageIdx: 1,
  ds: 'doc',
  agent: 'done',
  openCount: 0,
  blockingCount: 0,
  isManager: false,
  myRoles: [],
  holders: H,
  approvals: {},
  ...over,
});
const actx = (over: Partial<ApprovalsCtx> = {}): ApprovalsCtx => ({
  ...ctx(),
  myUid: 'u-mgr',
  isOwner: false,
  ownerName: 'דנה כהן',
  lockedAt: null,
  securityInvolved: true,
  ...over,
});

// ───────── A1 ─────────

test('A1 draftStateOf: document status, and legacy cases by doc id / path', () => {
  assert.equal(draftStateOf({ documentStatus: 'none' }), 'draft');
  assert.equal(draftStateOf({ documentStatus: 'generating' }), 'creating');
  assert.equal(draftStateOf({ documentStatus: 'generated' }), 'doc');
  assert.equal(draftStateOf({ googleDocId: 'g1', docExportPath: null }), 'doc');
  assert.equal(draftStateOf({ googleDocId: null, docExportPath: null }), 'draft');
});

test('A1 stageIndexOf: writing → publication → clarifications → bids → evaluation → closed', () => {
  assert.deepEqual(
    (['draft', 'internal_review', 'ready', 'published', 'responses', 'evaluated', 'awarded'] as const).map(stageIndexOf),
    [1, 1, 2, 4, 5, 6, 7],
  );
});

test('A1 progressPct follows the prototype at the writing stages', () => {
  assert.equal(progressPct(0, 'draft'), 8);
  assert.equal(progressPct(1, 'draft'), 15);
  assert.equal(progressPct(1, 'doc'), 30);
  assert.equal(progressPct(2, 'doc'), 55);
  assert.equal(progressPct(7, 'doc'), 100);
});

test('A1 visibleTabs: the draft tab is "טיוטה" until the document exists', () => {
  const draft = visibleTabs({ stageIdx: 1, ds: 'draft' });
  assert.deepEqual(draft.map((t) => t.key), ['overview', 'document', 'agent', 'activity', 'versions']);
  assert.equal(draft[1].label, 'טיוטה');
  assert.equal(visibleTabs({ stageIdx: 1, ds: 'creating' })[1].label, 'טיוטה');
  assert.equal(visibleTabs({ stageIdx: 1, ds: 'doc' })[1].label, 'מסמך');
});

test('A1 visibleTabs: questions from פרסום, bids from הצעות, the conference only with one', () => {
  assert.ok(visibleTabs({ stageIdx: 2, ds: 'doc' }).some((t) => t.key === 'questions'));
  assert.ok(!visibleTabs({ stageIdx: 4, ds: 'doc' }).some((t) => t.key === 'bids'));
  assert.ok(visibleTabs({ stageIdx: 5, ds: 'doc' }).some((t) => t.key === 'bids'));
  assert.ok(!visibleTabs({ stageIdx: 7, ds: 'doc' }).some((t) => t.key === 'conference'));
  assert.ok(visibleTabs({ stageIdx: 3, ds: 'doc', hasConference: true }).some((t) => t.key === 'conference'));
});

test('A1 visibleTabs: badges — blocking count on the agent, questions only at clarifications', () => {
  const tabs = visibleTabs({ stageIdx: 4, ds: 'doc', blockingCount: 2, questionCount: 6 });
  assert.equal(tabs.find((t) => t.key === 'agent')!.badge, 2);
  assert.equal(tabs.find((t) => t.key === 'questions')!.badge, 6);
  const later = visibleTabs({ stageIdx: 5, ds: 'doc', blockingCount: 0, questionCount: 6 });
  assert.equal(later.find((t) => t.key === 'agent')!.badge, undefined);
  assert.equal(later.find((t) => t.key === 'questions')!.badge, undefined);
});

test('A1 resolveTab: a tab that has not joined yet falls back to the overview', () => {
  const tabs = visibleTabs({ stageIdx: 1, ds: 'draft' });
  assert.equal(resolveTab('agent', tabs), 'agent');
  assert.equal(resolveTab('bids', tabs), 'overview');
  assert.equal(resolveTab(null, tabs), 'overview');
});

test('A1 stageBar: five stages and the no-conference note; six with a conference', () => {
  const { items, note } = stageBar({ stageIdx: 1 });
  assert.deepEqual(items.map((s) => s.label), ['אפיון', 'עריכה', 'פרסום', 'הבהרות', 'הצעות']);
  assert.deepEqual(items.map((s) => s.state), ['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(note, 'ללא כנס ספקים בבל"מ זה');
  const conf = stageBar({ stageIdx: 1, hasConference: true });
  assert.equal(conf.items.length, 6);
  assert.equal(conf.note, null);
  assert.equal(items[0].color, '#8a5cf0');
});

// ───────── A2 ─────────

const F = (o: Partial<FindingInput>): FindingInput => ({
  code: 'MISSING_INFO',
  severity: 'warn',
  location: 'document',
  message: 'm',
  source: 'rules',
  ...o,
});

test('A2 findingsView: blocking first, info kept apart, Hebrew type labels', () => {
  const v = findingsView({
    basis: 'draft',
    findings: [
      F({ code: 'CONTRADICTION', evidence: 'a' }),
      F({ code: 'CONFIDENTIAL_LEAK', severity: 'block', evidence: 'b' }),
      F({ code: 'UNSOURCED_VALUE', severity: 'info', evidence: 'c' }),
    ],
  });
  assert.deepEqual(v.all.map((f) => f.code), ['CONFIDENTIAL_LEAK', 'CONTRADICTION']);
  assert.equal(v.blocking.length, 1);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.info.length, 1);
  assert.equal(v.all[0].typeHe, 'חשיפת מידע חסוי');
  assert.equal(v.all[1].typeHe, 'סתירה');
});

test('A2 findingsView: decisions — applied and skipped leave the open list; a blocking one cannot be skipped', () => {
  const findings = [F({ code: 'CONTRADICTION', evidence: 'a' }), F({ code: 'UNFAIR_REQUIREMENT', evidence: 'b' }), F({ severity: 'block', evidence: 'c' })];
  const keys = findingsView({ basis: 'draft', findings }).all.map((f) => f.key);
  const v = findingsView(
    { basis: 'draft', findings },
    { [keys[1]]: { action: 'applied' }, [keys[2]]: { action: 'skipped' }, [keys[0]]: { action: 'skipped' } },
  );
  // keys[0] is the blocking one (sorted first): its "skipped" is ignored.
  assert.equal(v.all[0].severity, 'block');
  assert.equal(v.blocking.length, 1);
  assert.equal(v.applied.length, 1);
  assert.equal(v.skipped.length, 1);
  assert.equal(v.open.length, 1);
});

test('A2 findingKey: stable across a reworded re-run, prefixed by what was checked', () => {
  const a = F({ code: 'CONTRADICTION', location: 'סעיף 4', evidence: '36 חודשים', message: 'נוסח א' });
  const b = { ...a, message: 'נוסח אחר לגמרי' };
  assert.equal(findingKey(a, 'draft'), findingKey(b, 'draft'));
  assert.match(findingKey(a, 'draft'), /^draft:/);
  assert.match(findingKey(a, 'document'), /^doc:/);
  assert.notEqual(findingKey(a, 'draft'), findingKey({ ...a, evidence: 'אחר' }, 'draft'));
  assert.equal(findingKey({ ...a, key: 'doc:fixed' }, 'draft'), 'doc:fixed'); // the server's key wins
});

test('A2 findingsView: two findings about the same thing still get keys of their own', () => {
  const v = findingsView({ basis: 'document', findings: [F({ severity: 'block' }), F({ severity: 'block' })] });
  assert.equal(new Set(v.all.map((f) => f.key)).size, 2);
  assert.match(v.all[1].key, /~2$/);
});

test('A2 agentStateOf / agentChip', () => {
  assert.equal(agentStateOf({ run: null, lastAt: null }), 'none');
  assert.equal(agentStateOf({ run: { state: 'running' }, lastAt: T(9) }), 'running');
  assert.equal(agentStateOf({ run: { state: 'failed' }, lastAt: T(9) }), 'done');
  const v = (o: number, b: number) => ({ open: Array(o).fill(0), blocking: Array(b).fill(0) }) as never;
  assert.deepEqual(agentChip('none', v(0, 0)), { label: 'טרם הורץ', tone: 'neutral' });
  assert.deepEqual(agentChip('running', v(0, 0)), { label: 'בבדיקה', tone: 'run' });
  assert.deepEqual(agentChip('done', v(2, 1)), { label: 'חוסם', tone: 'blk' });
  assert.deepEqual(agentChip('done', v(2, 0)), { label: 'אזהרות', tone: 'wrn' });
  assert.deepEqual(agentChip('done', v(0, 0)), { label: 'תקין', tone: 'ok' });
});

// ───────── A3: draft ─────────

test('A3 draft: creating / not run / running', () => {
  assert.deepEqual(headerAction(ctx({ ds: 'creating' })), { label: 'יוצר מסמך…', kind: null, enabled: false });
  assert.deepEqual(headerAction(ctx({ ds: 'draft', agent: 'none' })), { label: 'הרץ סוכן מפקח', kind: 'run_agent', enabled: true });
  assert.deepEqual(headerAction(ctx({ ds: 'draft', agent: 'running' })), { label: 'הסוכן בודק…', kind: null, enabled: false });
});

test('A3 draft: a blocking finding sends procurement to the draft tab; others see it disabled', () => {
  assert.deepEqual(headerAction(ctx({ ds: 'draft', blockingCount: 1, openCount: 3, isManager: true })), {
    label: 'טפל בממצא חוסם',
    kind: 'open_tab',
    tab: 'document',
    enabled: true,
  });
  const other = headerAction(ctx({ ds: 'draft', blockingCount: 1, myRoles: ['requester'] }))!;
  assert.equal(other.enabled, false);
  assert.equal(other.title, 'רק הרכש יכול ליצור את המסמך');
});

test('A3 draft: "יצירת מסמך", with the warnings tooltip while warnings are open', () => {
  assert.deepEqual(headerAction(ctx({ ds: 'draft', isManager: true })), { label: 'יצירת מסמך', kind: 'create_document', enabled: true });
  assert.equal(
    headerAction(ctx({ ds: 'draft', isManager: true, openCount: 3 }))!.tip,
    'שימו לב: יש 3 ממצאים שלא הוטמעו, ועדיין אפשר ליצור את המסמך',
  );
  assert.equal(
    headerAction(ctx({ ds: 'draft', isManager: true, openCount: 1 }))!.tip,
    'שימו לב: יש ממצא אחד שלא הוטמע, ועדיין אפשר ליצור את המסמך',
  );
  const req = headerAction(ctx({ ds: 'draft', openCount: 2, myRoles: ['requester'] }))!;
  assert.equal(req.enabled, false);
  assert.equal(req.tip, undefined);
});

test('A3 before the workspace (a request) there is no header button', () => {
  assert.equal(headerAction(ctx({ stageIdx: 0 })), null);
});

// ───────── A3: document (D1) ─────────

test('A3 document: a blocking finding stops every role and opens the agent tab', () => {
  for (const c of [ctx({ isManager: true }), ctx({ myRoles: ['legal'] }), ctx({ stageIdx: 2, isManager: true })]) {
    assert.deepEqual(headerAction({ ...c, blockingCount: 1 }), {
      label: 'טפל בממצא חוסם',
      kind: 'open_tab',
      tab: 'agent',
      enabled: true,
      title: 'ממצא חוסם מונע אישור סופי ופרסום',
    });
  }
});

test('A3 document: the manager acts last — disabled until requester, legal and finance approved', () => {
  const none = headerAction(ctx({ isManager: true }))!;
  assert.equal(none.kind, 'final_approve');
  assert.equal(none.enabled, false);
  assert.equal(none.title, 'הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: דורש, משפטי, כספים.');
  const two = headerAction(ctx({ isManager: true, approvals: approvals('requester', 'finance') }))!;
  assert.equal(two.title, 'הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: משפטי.');
  // Security does not block (D2).
  assert.deepEqual(headerAction(ctx({ isManager: true, approvals: approvals('requester', 'finance', 'legal') })), {
    label: 'אישור סופי של המכרז',
    kind: 'final_approve',
    enabled: true,
  });
});

test('A3 document: requester and finance approve at once; then "האישור שלך נרשם"', () => {
  assert.deepEqual(headerAction(ctx({ myRoles: ['requester'] })), { label: 'אישור סופי של המכרז', kind: 'approve', enabled: true });
  assert.deepEqual(headerAction(ctx({ myRoles: ['finance'] })), { label: 'אישור סופי של המכרז', kind: 'approve', enabled: true });
  assert.deepEqual(headerAction(ctx({ myRoles: ['requester'], approvals: { requester: ok('requester', T(11, 7)) } })), {
    label: 'האישור שלך נרשם',
    kind: null,
    enabled: false,
    title: `האישור שלך נרשם · ${fmtStamp(T(11, 7))}`,
  });
  assert.equal(fmtStamp(T(11, 7)), '04.11 11:07');
});

test('A3 document: legal waits for requester and finance (D1a)', () => {
  const a = headerAction(ctx({ myRoles: ['legal'] }))!;
  assert.equal(a.enabled, false);
  assert.equal(a.title, 'הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: דורש, כספים.');
  assert.equal(headerAction(ctx({ myRoles: ['legal'], approvals: approvals('requester') }))!.title, 'הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: כספים.');
  assert.deepEqual(headerAction(ctx({ myRoles: ['legal'], approvals: approvals('requester', 'finance') })), {
    label: 'אישור סופי של המכרז',
    kind: 'approve',
    enabled: true,
  });
});

test('A3 document: security approves as an extra participant; non-members get no button', () => {
  assert.deepEqual(headerAction(ctx({ myRoles: ['security'] })), { label: 'אישור (משתתף נוסף)', kind: 'approve', enabled: true });
  assert.equal(headerAction(ctx({ myRoles: [] })), null);
});

test('A3 document: an approval by a previous slot holder no longer counts; one given on behalf does', () => {
  const stale: Approvals = { ...approvals('requester', 'finance'), legal: { uid: 'u-old', name: 'קודם', at: T(9) } };
  assert.equal(headerAction(ctx({ isManager: true, approvals: stale }))!.enabled, false);
  const onBehalf: Approvals = { ...approvals('requester', 'finance'), legal: { ...ok('legal'), onBehalf: true, byName: 'דנה כהן', reason: 'בחופשה, אישרה בטלפון' } };
  assert.equal(headerAction(ctx({ isManager: true, approvals: onBehalf }))!.enabled, true);
});

test('A3 document: a manager who also holds the requester slot approves it before the final action', () => {
  const holders = { ...H, requester: { uid: 'u-mgr', name: 'דנה כהן' } };
  assert.equal(headerAction(ctx({ isManager: true, myRoles: ['requester'], holders }))!.kind, 'approve');
  const after = headerAction(ctx({ isManager: true, myRoles: ['requester'], holders, approvals: { requester: { uid: 'u-mgr', name: 'דנה כהן', at: T(9) } } }))!;
  assert.equal(after.kind, 'final_approve');
});

test('A3 from publication on: the stage\'s work; procurement publishes', () => {
  assert.deepEqual(headerAction(ctx({ stageIdx: 2, isManager: true })), {
    label: 'אישור סופי ופרסום לספקים ←',
    kind: 'publish',
    enabled: true,
  });
  assert.deepEqual(headerAction(ctx({ stageIdx: 2, myRoles: ['requester'] })), {
    label: 'אישור סופי ופרסום לספקים ←',
    kind: 'open_tab',
    tab: 'document',
    enabled: true,
  });
  assert.deepEqual(headerAction(ctx({ stageIdx: 4 })), { label: 'אישור איחוד שאלות הבהרה ←', kind: 'open_tab', tab: 'questions', enabled: true });
  assert.equal(headerAction(ctx({ stageIdx: 7 }))!.tab, 'activity');
});

// ───────── A4 ─────────

test('A4 approvals: hidden until the document exists', () => {
  assert.equal(approvalsView(actx({ ds: 'draft' })).visible, false);
  assert.equal(approvalsView(actx({ ds: 'creating' })).visible, false);
  assert.equal(approvalsView(actx()).visible, true);
});

test('A4 approvals: four segments, procurement green only at the lock', () => {
  const v = approvalsView(actx({ approvals: approvals('requester', 'finance', 'legal') }));
  assert.deepEqual(v.segments.map((s) => s.approved), [true, false, true, true]);
  assert.equal(v.count, 3);
  assert.equal(v.total, 4);
  assert.equal(v.title, 'אישור סופי של המכרז');
  const locked = approvalsView(actx({ stageIdx: 2, approvals: approvals('requester', 'finance', 'legal'), lockedAt: T(15) }));
  assert.equal(locked.count, 4);
  assert.equal(locked.rows.find((r) => r.role === 'manager')!.tagTitle, fmtStamp(T(15)));
});

test('A4 approvals: rows, the non-blocking security row, and tag titles', () => {
  const ap: Approvals = {
    requester: ok('requester', T(10, 5)),
    finance: { ...ok('finance', T(12)), onBehalf: true, byName: 'דנה כהן', reason: 'אורי בחופשה' },
  };
  const v = approvalsView(actx({ approvals: ap }));
  assert.deepEqual(v.rows.map((r) => r.roleHe), ['דורש', 'רכש', 'משפטי', 'כספים', 'אבטחת מידע']);
  assert.equal(v.rows[4].nonBlocking, true);
  assert.equal(v.rows[0].tagLabel, 'אושר');
  assert.equal(v.rows[0].tagTitle, '04.11 10:05');
  assert.equal(v.rows[3].tag, 'on_behalf');
  assert.equal(v.rows[3].tagLabel, 'אושר בשם');
  assert.equal(v.rows[3].tagTitle, 'אושר על ידי דנה כהן בשם אורי מזרחי · 04.11 12:00 · אורי בחופשה');
  assert.equal(v.rows[2].tagLabel, 'ממתין');
  assert.equal(approvalsView(actx({ securityInvolved: false, holders: { ...H, security: undefined } })).rows.length, 4);
});

test('A4 approvals: notes and actions per role', () => {
  const note = (o: Partial<ApprovalsCtx>) => approvalsView(actx(o)).note;
  assert.equal(note({ isManager: true }), 'הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: דורש, משפטי, כספים.');
  assert.equal(note({ isManager: true, approvals: approvals('requester', 'legal', 'finance') }), 'כולם אישרו. לחץ על "אישור סופי של המכרז" כדי לנעול את המסמך.');
  assert.equal(note({ myRoles: ['legal'] }), 'הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: דורש, כספים.');
  assert.equal(note({ myRoles: ['legal'], approvals: approvals('requester', 'finance') }), 'הדורש והכספים אישרו. אחרי האישור שלך הרכש יוכל לתת אישור סופי.');
  assert.equal(note({ myRoles: ['security'] }), 'משתתף נוסף: האישור נרשם ואינו חוסם נעילה.');
  assert.equal(note({ myRoles: ['requester'] }), 'לחץ על "אישור סופי של המכרז" כשסיימת לעבוד על המסמך.');
  const mine = approvalsView(actx({ myRoles: ['requester'], approvals: { requester: ok('requester', T(10, 5)) } }));
  assert.equal(mine.note, 'האישור שלך נרשם · 04.11 10:05');
  assert.deepEqual(mine.actions, [{ kind: 'withdraw', label: 'בטל את האישור שלי' }]);
  const lockedOther = approvalsView(actx({ stageIdx: 2, myRoles: ['requester'], approvals: approvals('requester') }));
  assert.equal(lockedOther.note, 'המסמך נעול ומוכן לפרסום. רק הרכש יכול לפתוח מחדש.');
  assert.deepEqual(lockedOther.actions, []);
  const lockedMgr = approvalsView(actx({ stageIdx: 2, isManager: true }));
  assert.equal(lockedMgr.note, 'המסמך נעול ומוכן לפרסום.');
  assert.deepEqual(lockedMgr.actions, [{ kind: 'reopen', label: 'פתח מחדש (שכפול)' }]);
});

test('A4 on behalf (D1d): the owner, assigned slots, in turn, before the lock', () => {
  const owner = { isManager: true, isOwner: true };
  const rows = approvalsView(actx(owner)).rows;
  const act = (role: string) => rows.find((r) => r.role === role)!.action;
  assert.deepEqual(act('requester'), { kind: 'approve_on_behalf', role: 'requester', label: 'אישור בשם דני', enabled: true });
  assert.equal(act('legal'), undefined); // not legal's turn yet
  assert.equal(act('manager'), undefined);
  const inTurn = approvalsView(actx({ ...owner, approvals: approvals('requester', 'finance') })).rows;
  assert.equal(inTurn.find((r) => r.role === 'legal')!.action!.label, 'אישור בשם יעל');
  // unassigned slot: no approving on behalf
  const empty = approvalsView(actx({ ...owner, holders: { ...H, finance: undefined } })).rows.find((r) => r.role === 'finance')!;
  assert.deepEqual(empty.action, { kind: 'approve_on_behalf', role: 'finance', label: 'אישור בשם', enabled: false, title: 'יש לשייך איש קשר לפני אישור בשמו' });
  // a blocking finding
  const blocked = approvalsView(actx({ ...owner, blockingCount: 1 })).rows.find((r) => r.role === 'requester')!;
  assert.equal(blocked.action!.enabled, false);
  // withdraw an approval given on behalf
  const given = approvalsView(actx({ ...owner, approvals: { requester: { ...ok('requester'), onBehalf: true, byName: 'דנה כהן' } } }));
  assert.deepEqual(given.rows[0].action, { kind: 'withdraw_on_behalf', role: 'requester', label: 'בטל את האישור בשם דני', enabled: true });
  // not the owner, or locked: nothing
  assert.equal(approvalsView(actx({ isManager: true, isOwner: false })).rows[0].action, undefined);
  assert.equal(approvalsView(actx({ ...owner, stageIdx: 2 })).rows[0].action, undefined);
});

// ───────── A5 ─────────

const tender = (o: Partial<PendingTenderInput> = {}): PendingTenderInput => ({
  id: 't1',
  ref: '2026-71',
  name: 'פיתוח ותחזוקה - DEV',
  ownerUid: 'u-mgr',
  stageIdx: 1,
  ds: 'draft',
  agent: 'none',
  blockingCount: 0,
  holders: H,
  approvals: {},
  approvedByName: 'דנה כהן',
  approvedAt: T(9, 30),
  ...o,
});
const pctx = (o: Partial<PendingCtx> = {}): PendingCtx => ({ uid: 'u-mgr', isManager: true, requests: [], tenders: [], ...o });
const lines = (c: PendingCtx) => pendingItems(c).map((i) => `${i.bold} ${i.text} | ${i.button}`);

test('A5 procurement: draft and document states of its own cases', () => {
  assert.deepEqual(lines(pctx({ tenders: [tender()] })), ['טיוטה חדשה: ממתינה להרצת הסוכן המפקח | הרץ סוכן מפקח']);
  assert.deepEqual(lines(pctx({ tenders: [tender({ agent: 'running' })] })), []);
  assert.deepEqual(lines(pctx({ tenders: [tender({ agent: 'done', blockingCount: 1 })] })), ['ממצא חוסם בטיוטה: יש לטפל לפני יצירת המסמך | טפל בממצא']);
  assert.deepEqual(lines(pctx({ tenders: [tender({ agent: 'done' })] })), ['הטיוטה נבדקה: אין ממצא חוסם, אפשר ליצור את המסמך | יצירת מסמך']);
  assert.deepEqual(lines(pctx({ tenders: [tender({ ds: 'doc', blockingCount: 2 })] })), ['ממצא חוסם בדוח הסוכן המפקח: מונע אישור סופי ופרסום | טפל בממצא']);
  assert.deepEqual(lines(pctx({ tenders: [tender({ ds: 'doc', approvals: approvals('requester', 'legal', 'finance') })] })), [
    'כל הצוות אישר: ממתין לאישור הסופי שלך | אישור סופי של המכרז',
  ]);
  assert.deepEqual(lines(pctx({ tenders: [tender({ ownerUid: 'someone-else' })] })), []);
  const [item] = pendingItems(pctx({ tenders: [tender({ agent: 'done', blockingCount: 1 })] }));
  assert.deepEqual(item.target, { kind: 'tender', id: 't1', tab: 'agent' });
  assert.equal(item.tone, 'r');
  assert.equal(item.meta, '2026-71');
});

test('A5 procurement: new requests and missing unit contacts', () => {
  const items = pendingItems(
    pctx({
      requests: [{ serial: 's1', ref: '2026-72', name: 'בקשה', status: 'open', requesterUid: 'u-req', sentByName: 'דני כהן', sentAt: T(8, 15) }],
      tenders: [tender({ agent: 'running', holders: { ...H, legal: undefined } })],
    }),
  );
  assert.deepEqual(
    items.map((i) => `${i.bold} ${i.text}`),
    ['בקשה חדשה מהדורש: ממתינה להשלמה שלך', 'שיוך אנשי קשר: משפטי: ממתין · כספים: אורי מזרחי'],
  );
  assert.equal(items[0].meta, 'נשלח על ידי דני כהן · 04.11 08:15');
  assert.deepEqual(items[0].target, { kind: 'request', serial: 's1' });
  assert.equal(items[0].stageIdx, 0);
});

test('A5 requester: own request, the draft being prepared, the draft ready (first) until opened', () => {
  const req = { serial: 's1', ref: '2026-72', name: 'בקשה', status: 'open' as const, requesterUid: 'u-req', sentByName: 'דני כהן', sentAt: T(8) };
  const base = { uid: 'u-req', isManager: false };
  assert.deepEqual(lines(pctx({ ...base, requests: [req] })), ['בל"מ חדש בטיפול הרכש: ממתין לבחירת סוג ולאישור | צפה בבל"מ']);
  assert.deepEqual(lines(pctx({ ...base, tenders: [tender({ preparing: true })] })), ['הרכש אישר: הטיוטה נוצרת כעת | צפה בבל"מ']);
  const ready = pendingItems(pctx({ ...base, requests: [req], tenders: [tender()] }));
  assert.equal(ready[0].bold, 'הטיוטה מוכנה:');
  assert.equal(ready[0].meta, 'אושר על ידי דנה כהן · 04.11 09:30');
  assert.deepEqual(lines(pctx({ ...base, tenders: [tender({ draftSeen: true })] })), []);
});

test('A5 legal / finance: assign the unit contact, then approve in turn', () => {
  const assign = pendingItems(pctx({ uid: 'u-leg2', isManager: false, unitRole: 'legal', unassigned: [tender({ holders: { ...H, legal: undefined } })] }));
  assert.equal(assign[0].text, 'בל"מ חדש ממתין לאיש קשר מטעם היחידה המשפטית');
  assert.equal(assign[0].button, 'שייך');
  assert.deepEqual(assign[0].select, { role: 'legal' });
  const doc = tender({ ds: 'doc' });
  assert.deepEqual(lines(pctx({ uid: 'u-leg', isManager: false, tenders: [doc] })), []); // not legal's turn
  assert.deepEqual(lines(pctx({ uid: 'u-leg', isManager: false, tenders: [{ ...doc, approvals: approvals('requester', 'finance') }] })), [
    'אישור סופי של המכרז: המסמך מוכן לאישורך | פתח את המסמך',
  ]);
  assert.deepEqual(lines(pctx({ uid: 'u-fin', isManager: false, tenders: [doc] })), ['אישור סופי של המכרז: המסמך מוכן לאישורך | פתח את המסמך']);
  assert.deepEqual(lines(pctx({ uid: 'u-fin', isManager: false, tenders: [{ ...doc, blockingCount: 1 }] })), []);
});

test('A5 stage chip counts', () => {
  const items = pendingItems(
    pctx({
      requests: [{ serial: 's1', ref: 'r', name: 'n', status: 'open', requesterUid: 'x', sentByName: 'x', sentAt: T(8) }],
      tenders: [tender(), tender({ id: 't2', agent: 'done' })],
    }),
  );
  assert.deepEqual(pendingStageCounts(items), [1, 2, 0, 0, 0, 0]);
});

test('approval helpers: current holder only; security is not a team approver', () => {
  assert.equal(isApproved(H, approvals('legal'), 'legal'), true);
  assert.equal(isApproved({ ...H, legal: { uid: 'new', name: 'x' } }, approvals('legal'), 'legal'), false);
  assert.deepEqual(missingTeamApprovals(H, approvals('security')), ['requester', 'legal', 'finance']);
});
