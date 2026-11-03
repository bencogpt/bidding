// draftCalc — pure helpers for draft-first cases (no I/O; unit tested).
import { createHash } from 'node:crypto';
import { hasDocument, type DocumentGateReason, type TenderDoc } from '@obms/shared';

/**
 * Fingerprint of everything the inspector checks on a draft: the rendered preview text (title,
 * template and values) plus the data that isn't in the text — dates, criteria, confidential values.
 * Any edit changes it, so an older check no longer counts.
 */
export function draftDataHash(input: {
  previewText: string;
  submissionDeadline: number | null;
  awardDate: number | null;
  evaluationCriteria: { name: string; weight: number }[];
  internalParams: Record<string, string | number>;
}): string {
  const material = JSON.stringify({
    text: input.previewText,
    deadline: input.submissionDeadline,
    award: input.awardDate,
    criteria: input.evaluationCriteria,
    internal: Object.keys(input.internalParams)
      .sort()
      .map((k) => [k, input.internalParams[k]]),
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * May the manager create the document now? Only for a draft with no document whose LATEST inspector
 * check covered exactly the current draft data and found nothing blocking (warnings are fine).
 * Returns the reason it may not, or null.
 */
export function documentGate(
  tender: Pick<TenderDoc, 'status' | 'documentStatus' | 'googleDocId' | 'docExportPath' | 'lastSupervision'>,
  currentDataHash: string,
): DocumentGateReason | null {
  if (hasDocument(tender)) return 'has_document';
  if (tender.status !== 'draft') return 'not_draft';
  const last = tender.lastSupervision;
  if (!last || last.basis !== 'draft') return 'no_check';
  if (last.dataHash !== currentDataHash) return 'stale_check';
  if (last.verdict === 'BLOCK') return 'blocked';
  return null;
}

export const DOCUMENT_GATE_MESSAGE_HE: Record<DocumentGateReason, string> = {
  has_document: 'למכרז כבר קיים מסמך.',
  not_draft: 'ניתן ליצור מסמך רק למכרז בטיוטה.',
  no_check: 'יש להריץ את הסוכן המפקח על הטיוטה לפני יצירת המסמך.',
  stale_check: 'הטיוטה השתנתה מאז הבדיקה האחרונה — יש להריץ את הסוכן המפקח שוב.',
  blocked: 'הסוכן המפקח מצא ממצאים חוסמים — יש לתקן את הטיוטה ולהריץ בדיקה שוב.',
};
