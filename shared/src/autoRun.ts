// The supervising agent starts by itself on the server (plan B1, decided 2026-11-04): the first check of a
// new draft, and the check of its document once created. These are the conditions, shared by the Firestore
// triggers and the browser (which shows "the agent is starting" until the server claims the run).
import { hasDocument, type DocumentStatus } from './draft.js';

interface RunView {
  createdAt: number;
  documentStatus?: DocumentStatus;
  googleDocId: string | null;
  docExportPath: string | null;
  documentGeneratedAt?: number;
  lastSupervision?: { at: number; basis?: 'draft' | 'document' } | null;
  supervisionRun?: { state: 'running' | 'done' | 'failed' } | null;
}

/** A new case is checked once, unless a check already ran or is running (event redelivery, another run). */
export function autoRunOnCreate(t: Pick<RunView, 'lastSupervision' | 'supervisionRun'>): boolean {
  return !t.lastSupervision && t.supervisionRun?.state !== 'running';
}

/** The update in which the case's document became ready: the moment to check the document. */
export function documentBecameReady(
  before: Pick<RunView, 'documentStatus'>,
  after: Pick<RunView, 'documentStatus'>,
): boolean {
  return before.documentStatus !== 'generated' && after.documentStatus === 'generated';
}

/** How long the browser shows the agent as starting before the server's run appears. */
export const AUTO_RUN_GRACE_MS = 45_000;

/**
 * Whether the server is about to check (the trigger has not claimed the run yet): a new draft never
 * checked, or a document created after the last check — within AUTO_RUN_GRACE_MS. Afterwards the agent
 * shows as not run, so "הרץ סוכן מפקח" is there if the automatic run failed.
 */
export function autoRunPending(t: RunView, now: number): boolean {
  if (t.supervisionRun?.state === 'running') return false; // the server's own state says so
  if (!hasDocument(t)) return !t.lastSupervision && now - t.createdAt < AUTO_RUN_GRACE_MS;
  const at = t.documentGeneratedAt;
  if (!at || now - at >= AUTO_RUN_GRACE_MS) return false;
  return !t.lastSupervision || t.lastSupervision.basis === 'draft' || t.lastSupervision.at < at;
}
