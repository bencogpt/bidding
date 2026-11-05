// Approvals stand for the content they approved (plan G-D4). The document is fingerprinted at the send and at
// each approval; when it is read again later (another approval, an agent check, the final check) and its
// content changed, the approvals given before the change are cancelled and their holders are told.
// Detection is not real time — Google Docs offers no cheap push — so the final check is the backstop.
import { staleApprovals, type TeamRole, type TenderDoc } from '@obms/shared';
import { auditRepo, tendersRepo } from '../repositories.js';
import { now } from '../lib/admin.js';
import { readTenderContentText } from './docsService.js';
import { docHash } from './supervisorChecks.js';

const SYSTEM = { uid: 'system', name: 'מערכת' };

/** Fingerprint of the document's content (without pending suggestions); null when it can't be read. */
export async function currentContentHash(tender: TenderDoc): Promise<string | null> {
  try {
    return docHash(await readTenderContentText(tender));
  } catch (err) {
    console.error(`content hash of ${tender.id} unavailable`, err);
    return null;
  }
}

/**
 * Cancels the approvals given on an earlier version of the document (only while it is out for approval) and
 * returns their roles. Audited once, as the system.
 */
export async function cancelStaleApprovals(tender: TenderDoc, hash: string | null): Promise<TeamRole[]> {
  if (tender.status !== 'internal_review') return [];
  const stale = staleApprovals(tender.approvals, hash);
  if (!stale.length) return [];
  await tendersRepo.cancelApprovals(tender.id, stale, now());
  // A final check of the earlier content no longer counts: the next one runs once everyone approved again.
  if (tender.finalCheck && tender.finalCheck.state !== 'running') {
    await tendersRepo.update(tender.id, { finalCheck: { state: 'changed', at: now(), docHash: hash } });
  }
  await auditRepo.append({
    entityType: 'tender',
    entityId: tender.id,
    tenderId: tender.id,
    actorUid: SYSTEM.uid,
    actorName: SYSTEM.name,
    action: 'approvals_cancelled',
    prevState: null,
    newState: stale.join(','),
  });
  return stale;
}
