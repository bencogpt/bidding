import { HttpsError } from 'firebase-functions/v2/https';
import { canTransition, type TenderStatus } from '@obms/shared';
import { tendersRepo, auditRepo } from '../repositories.js';
import type { Caller } from '../lib/context.js';

/**
 * The ONLY way a tender's status changes. Validates the transition is legal,
 * persists it, and writes an immutable audit entry. No code sets status directly.
 */
export async function transition(
  caller: Caller,
  tenderId: string,
  to: TenderStatus,
): Promise<void> {
  const tender = await tendersRepo.get(tenderId);
  if (!tender) {
    throw new HttpsError('not-found', 'מכרז לא נמצא.');
  }
  if (tender.status === to) return;
  if (!canTransition(tender.status, to)) {
    throw new HttpsError(
      'failed-precondition',
      `מעבר סטטוס לא חוקי: ${tender.status} → ${to}`,
    );
  }
  await tendersRepo.update(tenderId, { status: to });
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
