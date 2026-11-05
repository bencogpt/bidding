import { HttpsError } from 'firebase-functions/v2/https';
import { canTransition, type TenderDoc, type TenderStatus } from '@obms/shared';
import { tendersRepo, auditRepo } from '../repositories.js';
import type { Caller } from '../lib/context.js';

/**
 * The ONLY way a tender's status changes. Validates the transition is legal, persists it, and writes an
 * immutable audit entry. No code sets status directly.
 *
 * The check and the write are one transaction, so two concurrent calls can't both make the same move.
 * `extra` holds fields that belong to the move (the winner of an award) and are written with the status, never
 * without it. A move with `extra` must really change the status: a second award of an awarded case is refused
 * instead of silently doing nothing.
 */
export async function transition(
  caller: Caller,
  tenderId: string,
  to: TenderStatus,
  extra?: Partial<TenderDoc>,
): Promise<void> {
  const tender = await tendersRepo.changeStatus(
    tenderId,
    to,
    (t) => {
      if (t.status === to && !extra) return;
      if (!canTransition(t.status, to)) {
        throw new HttpsError('failed-precondition', `מעבר סטטוס לא חוקי: ${t.status} → ${to}`);
      }
    },
    extra,
  );
  if (tender.status === to) return;
  // A review round starts with no approvals. Sent back from "ready" (to collect missing approvals), the
  // approvals already given are kept.
  if (to === 'internal_review' && tender.status !== 'ready') await tendersRepo.clearApprovals(tenderId);
  await auditRepo.append({
    entityType: 'tender',
    entityId: tenderId,
    tenderId,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'status_change',
    prevState: tender.status,
    newState: to,
  });
}
