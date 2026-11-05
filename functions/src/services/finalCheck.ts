// The supervising agent's final check (plan G-D3, G-D5): it runs when everyone has approved, before the lock.
// Its five steps (AGENT_STEPS_FINAL_HE): everyone approved · compare with the version each approved · nothing
// changed after the approvals · the required skills again (the full agent check, AI included) · no blocking
// finding. Pass → the case locks and moves to "פרסום לספקים". Otherwise it stays open.
import {
  ON_BEHALF_REASON_MIN,
  REQUIRED_ROLES_BY_TYPE,
  allApproved,
  blockingApproverRoles,
  finalCheckOutcome,
  type FinalCheckRecord,
  type TenderDoc,
} from '@obms/shared';
import { auditRepo, tendersRepo } from '../repositories.js';
import { now } from '../lib/admin.js';
import type { Caller } from '../lib/context.js';
import { transition } from '../stateMachines/tenderFsm.js';
import { cancelStaleApprovals, currentContentHash } from './approvalGuard.js';
import { lockDocument } from './docsService.js';
import { superviseTender } from './supervisorService.js';

const SYSTEM: Caller = { uid: 'system', name: 'מערכת', role: 'tender_manager' };

const blockingRolesOf = (t: TenderDoc) => blockingApproverRoles(t.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[t.type]);

/** Whether this case is waiting for its final check: out for approval and everyone the lock waits for approved. */
export function readyForFinalCheck(t: TenderDoc): boolean {
  return allApproved(t, blockingRolesOf(t));
}

async function audit(tenderId: string, action: string, detail?: string, actor = SYSTEM): Promise<void> {
  await auditRepo.append({
    entityType: 'tender',
    entityId: tenderId,
    tenderId,
    actorUid: actor.uid,
    actorName: actor.name,
    action,
    prevState: null,
    newState: null,
    ...(detail ? { detail } : {}),
  });
}

const record = (id: string, r: FinalCheckRecord) => tendersRepo.update(id, { finalCheck: r });

/** Pass: lock the Doc and move to "פרסום לספקים", with the fingerprint publishing will compare to (G-D6). */
async function lockAndAdvance(t: TenderDoc, r: FinalCheckRecord, actor: Caller): Promise<void> {
  await transition(actor, t.id, 'ready', { lockedAt: now(), finalCheck: r });
  // From now on everyone, the manager included, can only read the Google Doc.
  await lockDocument(t.googleDocId);
}

export async function runFinalCheck(tenderId: string): Promise<void> {
  const t0 = await tendersRepo.get(tenderId);
  if (!t0 || !readyForFinalCheck(t0)) return;
  if (!(await tendersRepo.claimFinalCheck(tenderId, now()))) return; // already running
  await audit(tenderId, 'final_check_started');

  try {
    // Steps 2–3: every approval stands for the content as it is now.
    const hash = await currentContentHash(t0);
    if (await cancelStaleApprovals(t0, hash).then((c) => c.length)) {
      await record(tenderId, { state: 'changed', at: now(), docHash: hash });
      return;
    }

    // Steps 4–5: the full agent check again (rules, skills, AI), at the publish gate's strictness (fail-closed).
    const report = await superviseTender(SYSTEM, tenderId, 'final');
    const outcome = finalCheckOutcome(report.findings);

    // Someone may have withdrawn an approval or edited the document while the AI ran.
    const t1 = await tendersRepo.get(tenderId);
    if (!t1 || !readyForFinalCheck(t1)) {
      await record(tenderId, { state: 'changed', at: now(), runId: report.runId, docHash: hash });
      return;
    }
    if (outcome === 'pass') {
      const hash1 = await currentContentHash(t1);
      if (await cancelStaleApprovals(t1, hash1).then((c) => c.length)) {
        await record(tenderId, { state: 'changed', at: now(), runId: report.runId, docHash: hash1 });
        return;
      }
      await lockAndAdvance(t1, { state: 'passed', at: now(), runId: report.runId, docHash: hash1 ?? hash }, SYSTEM);
      return;
    }
    await record(tenderId, { state: outcome, at: now(), runId: report.runId, docHash: hash });
    await audit(tenderId, outcome === 'ai_unavailable' ? 'final_check_ai_unavailable' : 'final_check_blocked');
  } catch (err) {
    console.error(`final check of ${tenderId} failed`, err);
    await record(tenderId, { state: 'error', at: now() });
  }
}

export type OverrideDenial = 'not_waiting' | 'reason_required' | 'changed';

/**
 * Procurement continues without the AI review (G-D5): only when the final check's sole blocker was the AI
 * being unavailable, with everyone's approvals still standing for the current content.
 */
export async function continueWithoutAi(t: TenderDoc, caller: Caller, reason: string): Promise<OverrideDenial | null> {
  if (reason.trim().length < ON_BEHALF_REASON_MIN) return 'reason_required';
  if (t.status !== 'internal_review' || t.finalCheck?.state !== 'ai_unavailable' || !readyForFinalCheck(t)) return 'not_waiting';
  const hash = await currentContentHash(t);
  if (await cancelStaleApprovals(t, hash).then((c) => c.length)) {
    await record(t.id, { state: 'changed', at: now(), docHash: hash });
    return 'changed';
  }
  await audit(t.id, 'final_check_override', reason.trim(), caller);
  await lockAndAdvance(
    t,
    {
      state: 'overridden',
      at: now(),
      // Firestore refuses undefined inside a map: the run id only when the stopped check stored one.
      ...(t.finalCheck.runId ? { runId: t.finalCheck.runId } : {}),
      docHash: hash,
      by: caller.uid,
      byName: caller.name,
      reason: reason.trim(),
    },
    caller,
  );
  return null;
}
