// Approval rules (plan B4; decisions D1, D1a, D1b, D1d):  node --test functions/lib/test/approvalRules.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockingApproverRoles,
  canTransition,
  documentBlockers,
  finalApprovalDenial,
  missingApprovals,
  planApproval,
  type ApprovalCase,
  type ApprovalCall,
} from '@obms/shared';

const team = { requester: 'u-req', legal: 'u-leg', finance: 'u-fin', security: 'u-sec' };
const base = (o: Partial<ApprovalCase> = {}): ApprovalCase => ({
  status: 'draft',
  hasDocument: true,
  ownerUid: 'u-mgr',
  team,
  approvals: {},
  requiredRoles: ['requester', 'legal', 'finance', 'security'],
  blockers: 0,
  ...o,
});
const call = (uid: string, o: Partial<ApprovalCall> = {}): ApprovalCall => ({ uid, name: `name-${uid}`, approve: true, ...o });
const ap = (uid: string) => ({ uid, name: uid, at: 1 });
const AT = 1_700_000_000_000;

const denial = (c: ApprovalCase, k: ApprovalCall) => {
  const p = planApproval(c, k, AT);
  return p.ok ? null : p.denial;
};

test('approvals open once the document exists: draft or (older cases) internal review', () => {
  assert.equal(denial(base({ hasDocument: false }), call('u-req')), 'not_open');
  assert.equal(denial(base({ status: 'ready' }), call('u-req')), 'not_open');
  assert.equal(denial(base({ status: 'published' }), call('u-req', { approve: false })), 'not_open');
  assert.equal(denial(base(), call('u-req')), null);
  assert.equal(denial(base({ status: 'internal_review' }), call('u-req')), null);
});

test('own approval: written for every required slot the caller holds', () => {
  const p = planApproval(base(), call('u-fin'), AT);
  assert.deepEqual(p, { ok: true, audit: 'approve_tender', writes: [{ role: 'finance', approval: { uid: 'u-fin', name: 'name-u-fin', at: AT } }] });
  assert.equal(denial(base(), call('u-stranger')), 'no_slot');
  // a role the case doesn't require can't approve
  assert.equal(denial(base({ requiredRoles: ['requester', 'legal', 'finance'] }), call('u-sec')), 'no_slot');
});

test('a blocking finding stops approving, not withdrawing', () => {
  assert.equal(denial(base({ blockers: 1 }), call('u-req')), 'blocked');
  assert.equal(denial(base({ blockers: 1, approvals: { requester: ap('u-req') } }), call('u-req', { approve: false })), null);
});

test('legal approves after requester and finance (D1a)', () => {
  assert.equal(denial(base(), call('u-leg')), 'legal_too_early');
  assert.equal(denial(base({ approvals: { requester: ap('u-req') } }), call('u-leg')), 'legal_too_early');
  assert.equal(denial(base({ approvals: { requester: ap('u-req'), finance: ap('u-fin') } }), call('u-leg')), null);
  // an approval by a previous holder doesn't count
  assert.equal(denial(base({ approvals: { requester: ap('u-old'), finance: ap('u-fin') } }), call('u-leg')), 'legal_too_early');
  // the same person holding requester and legal approves both at once
  const both = base({ team: { ...team, requester: 'u-leg' }, approvals: { finance: ap('u-fin') } });
  const p = planApproval(both, call('u-leg'), AT);
  assert.ok(p.ok && p.writes.map((w) => w.role).join() === 'requester,legal');
});

test('withdraw: own slots are cleared', () => {
  const p = planApproval(base({ approvals: { finance: ap('u-fin') } }), call('u-fin', { approve: false }), AT);
  assert.deepEqual(p, { ok: true, audit: 'withdraw_approval', writes: [{ role: 'finance', approval: null }] });
});

test('on behalf (D1d): the owner, an assigned slot, a reason, in turn', () => {
  const owner = (o: Partial<ApprovalCall>) => call('u-mgr', { name: 'דנה כהן', onBehalfOf: 'finance', reason: 'אורי בחופשה, אישר בטלפון', holderName: 'אורי מזרחי', ...o });
  const p = planApproval(base(), owner({}), AT);
  assert.deepEqual(p, {
    ok: true,
    audit: 'approve_on_behalf',
    writes: [
      {
        role: 'finance',
        approval: { uid: 'u-fin', name: 'אורי מזרחי', at: AT, onBehalf: true, byUid: 'u-mgr', byName: 'דנה כהן', reason: 'אורי בחופשה, אישר בטלפון' },
      },
    ],
  });
  // it counts like the holder's own approval
  if (!p.ok) throw new Error('expected an approval plan');
  const given = p.writes[0].approval!;
  assert.deepEqual(missingApprovals(['requester', 'finance'], team, { requester: ap('u-req'), finance: given }), []);

  assert.equal(denial(base(), owner({ uid: 'u-other-manager' })), 'not_owner');
  assert.equal(denial(base({ team: { ...team, finance: undefined } }), owner({})), 'slot_empty');
  assert.equal(denial(base({ team: { ...team, finance: 'u-mgr' } }), owner({})), 'own_slot');
  assert.equal(denial(base(), owner({ reason: '  קצר  ' })), 'reason_required');
  assert.equal(denial(base(), owner({ reason: undefined })), 'reason_required');
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
  // the holder can withdraw an approval given on their behalf
  const own = planApproval(base({ approvals: given }), call('u-fin', { approve: false }), AT);
  assert.ok(own.ok && own.writes[0].approval === null);
});

test('final approval (the manager last): the document exists and nothing blocks', () => {
  assert.equal(finalApprovalDenial({ hasDocument: false, blockers: 0 }), 'no_document');
  assert.equal(finalApprovalDenial({ hasDocument: true, blockers: 1 }), 'blocked');
  assert.equal(finalApprovalDenial({ hasDocument: true, blockers: 0 }), null);
  assert.equal(canTransition('draft', 'ready'), true); // no "send for approval" step (D1)
  assert.equal(canTransition('draft', 'published'), false);
});

test('information security approves but does not block (D2)', () => {
  assert.deepEqual(blockingApproverRoles(['requester', 'legal', 'finance', 'security']), ['requester', 'legal', 'finance']);
  assert.deepEqual(missingApprovals(blockingApproverRoles(['requester', 'legal', 'finance', 'security']), team, {
    requester: ap('u-req'),
    legal: ap('u-leg'),
    finance: ap('u-fin'),
  }), []);
  // security can still approve its own slot
  assert.equal(denial(base(), call('u-sec')), null);
});

test('documentBlockers: only a check of the document counts', () => {
  assert.equal(documentBlockers({ hasDocument: false, lastSupervision: { blockers: 3 } }), 0);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: { blockers: 3, basis: 'draft' } }), 0);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: { blockers: 3, basis: 'document' } }), 3);
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: { blockers: 2 } }), 2); // older reports
  assert.equal(documentBlockers({ hasDocument: true, lastSupervision: null }), 0);
});
