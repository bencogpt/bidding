// Approval rules of the v22 flow (plan Phase G; G-D1 to G-D5, D1d, D2):  node --test functions/lib/test/approvalRules.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allApproved,
  blockingApproverRoles,
  canTransition,
  documentBlockers,
  finalCheckOutcome,
  missingApprovals,
  planApproval,
  sendDenial,
  sendDenialHe,
  SEND_DENIAL_HE,
  staleApprovals,
  type ApprovalCase,
  type ApprovalCall,
  type SendCase,
} from '@obms/shared';

const team = { requester: 'u-req', legal: 'u-leg', finance: 'u-fin', security: 'u-sec' };
const base = (o: Partial<ApprovalCase> = {}): ApprovalCase => ({
  status: 'internal_review', // sent for approval
  hasDocument: true,
  ownerUid: 'u-mgr',
  team,
  approvals: {},
  requiredRoles: ['requester', 'legal', 'finance', 'security'],
  blockers: 0,
  ...o,
});
const call = (uid: string, o: Partial<ApprovalCall> = {}): ApprovalCall => ({ uid, name: `name-${uid}`, approve: true, ...o });
const ap = (uid: string, docHash?: string) => ({ uid, name: uid, at: 1, ...(docHash ? { docHash } : {}) });
const AT = 1_700_000_000_000;

const denial = (c: ApprovalCase, k: ApprovalCall) => {
  const p = planApproval(c, k, AT);
  return p.ok ? null : p.denial;
};

test('nobody approves before procurement sends the document (G-D1), nor after the lock', () => {
  assert.equal(denial(base({ status: 'draft' }), call('u-req')), 'not_open', 'not sent yet');
  assert.equal(denial(base({ hasDocument: false }), call('u-req')), 'not_open');
  assert.equal(denial(base({ status: 'ready' }), call('u-req')), 'not_open', 'locked');
  assert.equal(denial(base({ status: 'published' }), call('u-req', { approve: false })), 'not_open');
  assert.equal(denial(base(), call('u-req')), null, 'sent: open');
});

test('own approval: every required slot the caller holds, with the content fingerprint (G-D4)', () => {
  const p = planApproval(base(), call('u-fin', { docHash: 'h1' }), AT);
  assert.deepEqual(p, {
    ok: true,
    audit: 'approve_tender',
    writes: [{ role: 'finance', approval: { uid: 'u-fin', name: 'name-u-fin', at: AT, docHash: 'h1' } }],
  });
  const noHash = planApproval(base(), call('u-fin', { docHash: null }), AT);
  assert.ok(noHash.ok && !('docHash' in noHash.writes[0].approval!), 'an unreadable document gives no fingerprint');
  assert.equal(denial(base(), call('u-stranger')), 'no_slot');
  assert.equal(denial(base({ requiredRoles: ['requester', 'legal', 'finance'] }), call('u-sec')), 'no_slot');
});

test('a blocking finding stops approving, not withdrawing', () => {
  assert.equal(denial(base({ blockers: 1 }), call('u-req')), 'blocked');
  assert.equal(denial(base({ blockers: 1, approvals: { requester: ap('u-req') } }), call('u-req', { approve: false })), null);
});

test('legal approves after requester and finance (legal last)', () => {
  assert.equal(denial(base(), call('u-leg')), 'legal_too_early');
  assert.equal(denial(base({ approvals: { requester: ap('u-req') } }), call('u-leg')), 'legal_too_early');
  assert.equal(denial(base({ approvals: { requester: ap('u-req'), finance: ap('u-fin') } }), call('u-leg')), null);
  assert.equal(denial(base({ approvals: { requester: ap('u-old'), finance: ap('u-fin') } }), call('u-leg')), 'legal_too_early');
  const both = base({ team: { ...team, requester: 'u-leg' }, approvals: { finance: ap('u-fin') } });
  const p = planApproval(both, call('u-leg'), AT);
  assert.ok(p.ok && p.writes.map((w) => w.role).join() === 'requester,legal');
});

test('withdraw: own slots are cleared', () => {
  const p = planApproval(base({ approvals: { finance: ap('u-fin') } }), call('u-fin', { approve: false }), AT);
  assert.deepEqual(p, { ok: true, audit: 'withdraw_approval', writes: [{ role: 'finance', approval: null }] });
});

test('on behalf (D1d): the owner, an assigned slot, a reason, in turn, after the send', () => {
  const owner = (o: Partial<ApprovalCall>) =>
    call('u-mgr', { name: 'דנה כהן', onBehalfOf: 'finance', reason: 'אורי בחופשה, אישר בטלפון', holderName: 'אורי מזרחי', docHash: 'h1', ...o });
  const p = planApproval(base(), owner({}), AT);
  assert.deepEqual(p, {
    ok: true,
    audit: 'approve_on_behalf',
    writes: [
      {
        role: 'finance',
        approval: {
          uid: 'u-fin',
          name: 'אורי מזרחי',
          at: AT,
          onBehalf: true,
          byUid: 'u-mgr',
          byName: 'דנה כהן',
          reason: 'אורי בחופשה, אישר בטלפון',
          docHash: 'h1',
        },
      },
    ],
  });
  if (!p.ok) throw new Error('expected an approval plan');
  assert.deepEqual(missingApprovals(['requester', 'finance'], team, { requester: ap('u-req'), finance: p.writes[0].approval! }), []);

  assert.equal(denial(base({ status: 'draft' }), owner({})), 'not_open', 'not before the send');
  assert.equal(denial(base(), owner({ uid: 'u-other-manager' })), 'not_owner');
  assert.equal(denial(base({ team: { ...team, finance: undefined } }), owner({})), 'slot_empty');
  assert.equal(denial(base({ team: { ...team, finance: 'u-mgr' } }), owner({})), 'own_slot');
  assert.equal(denial(base(), owner({ reason: '  קצר  ' })), 'reason_required');
  assert.equal(denial(base(), owner({ onBehalfOf: 'legal' })), 'legal_too_early');
  assert.equal(denial(base({ approvals: { requester: ap('u-req'), finance: ap('u-fin') } }), owner({ onBehalfOf: 'legal' })), null);
  assert.equal(denial(base({ blockers: 2 }), owner({})), 'blocked');
  assert.equal(denial(base({ requiredRoles: ['requester', 'legal', 'finance'] }), owner({ onBehalfOf: 'security' })), 'not_required');
});

test('withdraw on behalf: only an approval that was given on behalf', () => {
  const given = { finance: { ...ap('u-fin'), onBehalf: true, byUid: 'u-mgr', byName: 'דנה', reason: 'סיבה ארוכה מספיק' } };
  const w = (approvals: ApprovalCase['approvals']) =>
    planApproval(base({ approvals }), call('u-mgr', { approve: false, onBehalfOf: 'finance' }), AT);
  assert.deepEqual(w(given), { ok: true, audit: 'withdraw_on_behalf', writes: [{ role: 'finance', approval: null }] });
  assert.deepEqual(w({ finance: ap('u-fin') }), { ok: false, denial: 'not_on_behalf' });
  assert.deepEqual(w({}), { ok: true, audit: 'withdraw_on_behalf', writes: [] });
  const own = planApproval(base({ approvals: given }), call('u-fin', { approve: false }), AT);
  assert.ok(own.ok && own.writes[0].approval === null);
});

test('the send (G-D1, G-D7): document, nothing blocking, the team, then the three required dates', () => {
  const s = (o: Partial<SendCase> = {}): SendCase => ({
    status: 'draft',
    hasDocument: true,
    missingRoles: [],
    blockers: 0,
    missingDates: [],
    ...o,
  });
  assert.equal(sendDenial(s()), null);
  assert.equal(sendDenial(s({ status: 'internal_review' })), 'not_draft');
  assert.equal(sendDenial(s({ hasDocument: false, blockers: 1 })), 'no_document', 'in this order');
  assert.equal(sendDenial(s({ blockers: 1, missingRoles: ['legal'] })), 'blocked');
  assert.equal(sendDenial(s({ missingRoles: ['legal'], missingDates: ['qdead'] })), 'team_incomplete');
  assert.equal(sendDenial(s({ missingDates: ['qdead', 'valid'] })), 'dates_missing');
  // The text says where to assign and names the missing roles; the others are the plain texts.
  assert.equal(sendDenialHe(s()), null);
  assert.equal(
    sendDenialHe(s({ missingRoles: ['legal', 'finance'] })),
    'יש לשבץ את כל התפקידים בלשונית "סקירה" לפני השליחה לאישור. חסר: משפטי, כספים.',
  );
  assert.equal(sendDenialHe(s({ missingDates: ['qdead'] })), SEND_DENIAL_HE.dates_missing);
});

test('a content change cancels the approvals given before it (G-D4)', () => {
  const approvals = { requester: ap('u-req', 'h1'), finance: ap('u-fin', 'h2'), legal: ap('u-leg') };
  assert.deepEqual(staleApprovals(approvals, 'h2'), ['requester'], 'approved h1, the content is h2 now');
  assert.deepEqual(staleApprovals(approvals, 'h1'), ['finance']);
  assert.deepEqual(staleApprovals(approvals, null), [], 'unreadable document: nothing is cancelled');
  assert.deepEqual(staleApprovals(undefined, 'h1'), []);
  // an approval without a fingerprint (older) has nothing to compare
  assert.ok(!staleApprovals(approvals, 'h3').includes('legal'));
});

test('the final check waits for everyone the lock waits for; security does not block (D2)', () => {
  const roles = blockingApproverRoles(['requester', 'legal', 'finance', 'security']);
  assert.deepEqual(roles, ['requester', 'legal', 'finance']);
  const all = { requester: ap('u-req'), legal: ap('u-leg'), finance: ap('u-fin') };
  assert.equal(allApproved({ status: 'internal_review', team, approvals: all }, roles), true);
  assert.equal(allApproved({ status: 'draft', team, approvals: all }, roles), false, 'not sent');
  assert.equal(allApproved({ status: 'internal_review', team, approvals: { ...all, legal: ap('u-old') } }, roles), false);
  assert.equal(denial(base(), call('u-sec')), null, 'security can still approve its own slot');
});

test('the final check: pass, a blocker, or only the AI unavailable (G-D3, G-D5)', () => {
  assert.equal(finalCheckOutcome([]), 'pass');
  assert.equal(finalCheckOutcome([{ severity: 'warn', code: 'UNSOURCED_VALUE' }]), 'pass', 'warnings pass');
  assert.equal(finalCheckOutcome([{ severity: 'block', code: 'SUPERVISOR_UNAVAILABLE' }]), 'ai_unavailable');
  assert.equal(
    finalCheckOutcome([
      { severity: 'block', code: 'SUPERVISOR_UNAVAILABLE' },
      { severity: 'block', code: 'CONFIDENTIAL_LEAK' },
    ]),
    'blocked',
    'another blocker is never overridden',
  );
});

test('the state machine of the v22 flow', () => {
  assert.equal(canTransition('draft', 'internal_review'), true, 'the send');
  assert.equal(canTransition('draft', 'ready'), false, 'no more final approval from the draft');
  assert.equal(canTransition('internal_review', 'ready'), true, 'the final check passed');
  assert.equal(canTransition('internal_review', 'draft'), true, 'the send taken back');
  assert.equal(canTransition('ready', 'draft'), true, 'reopened');
  assert.equal(canTransition('ready', 'internal_review'), false);
  assert.equal(canTransition('ready', 'published'), true);
});

test('documentBlockers: only a check of the document counts', () => {
  assert.equal(documentBlockers({ hasDocument: false, lastSupervision: { blockers: 3 } }), 0);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: { blockers: 3, basis: 'draft' } }), 0);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: { blockers: 3, basis: 'document' } }), 3);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: { blockers: 2 } }), 2);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: null }), 0);
});
