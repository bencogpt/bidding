// scoreService — gathers a bid case's data and computes + stores its success score
// (caseScores/{tenderId}). Pure scoring lives in scoreCalc.ts.
import {
  DEFAULT_SCORE_TARGETS,
  type CaseScore,
  type DocVersion,
  type ScoreTargets,
  type TenderDoc,
} from '@obms/shared';
import { now } from '../lib/admin.js';
import type { Caller } from '../lib/context.js';
import {
  accessRepo,
  auditRepo,
  caseScoresRepo,
  internalRepo,
  questionsRepo,
  settingsRepo,
  submissionsRepo,
  supervisionRepo,
  tendersRepo,
  versionsRepo,
} from '../repositories.js';
import { countDriveRevisions, readVersionSnapshot } from './docsService.js';
import { changeRatio, computeScore } from './scoreCalc.js';

export async function scoringTargets(): Promise<ScoreTargets> {
  return { ...DEFAULT_SCORE_TARGETS, ...(await settingsRepo.getScoringTargets()) };
}

/** Edit size: generated document (v1) → the version that was published, else the latest. */
async function editSize(tender: TenderDoc, versions: DocVersion[]): Promise<number | null> {
  if (versions.length < 2) return versions.length === 1 ? 0 : null;
  const target =
    (tender.publishedDocHash && versions.find((v) => v.hash === tender.publishedDocHash)) ||
    versions[versions.length - 1];
  if (target.n === 1) return 0;
  const [a, b] = await Promise.all([readVersionSnapshot(versions[0].path), readVersionSnapshot(target.path)]);
  return changeRatio(a, b);
}

export async function computeCaseScore(
  caller: Pick<Caller, 'uid' | 'name'>,
  tenderId: string,
): Promise<CaseScore> {
  const tender = await tendersRepo.get(tenderId);
  if (!tender) throw new Error(`tender ${tenderId} not found`);
  const [provenance, audit, supervision, versions, access, submissions, questions, targets] =
    await Promise.all([
      internalRepo.getProvenance(tenderId),
      auditRepo.forTender(tenderId),
      supervisionRepo.list(tenderId),
      versionsRepo.list(tenderId),
      accessRepo.list(tenderId),
      submissionsRepo.list(tenderId),
      questionsRepo.list(tenderId),
      scoringTargets(),
    ]);
  const [edit, driveRevisions] = await Promise.all([
    editSize(tender, versions).catch(() => null),
    countDriveRevisions(tender).catch(() => null),
  ]);
  const score = computeScore({
    tender,
    provenance,
    audit,
    supervision,
    versions,
    editSize: edit,
    invitedSuppliers: access.filter((a) => a.kind === 'supplier').length,
    submissions: submissions.length,
    questions: questions.length,
    driveRevisions,
    targets,
    now: now(),
  });
  await caseScoresRepo.set(score);
  await auditRepo.append({
    entityType: 'tender',
    entityId: tenderId,
    tenderId,
    actorUid: caller.uid,
    actorName: caller.name,
    action: 'case_score',
    prevState: score.cohort,
    newState: `${score.total} (${score.grade})`,
    detail: score.components.map((c) => `${c.key}:${c.score}`).join(' · '),
  });
  return score;
}

/** Best-effort recompute after an event — scoring must never break the manager's action. */
export async function refreshCaseScore(caller: Pick<Caller, 'uid' | 'name'>, tenderId: string): Promise<void> {
  try {
    await computeCaseScore(caller, tenderId);
  } catch (err) {
    console.error(`case score failed for ${tenderId}`, err);
  }
}
