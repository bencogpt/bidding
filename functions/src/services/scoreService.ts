// scoreService — gathers a bid case's data and computes + stores its success score
// (caseScores/{tenderId}). Pure scoring lives in scoreCalc.ts.
import {
  DEFAULT_DCI_PARAMS,
  DEFAULT_SCORE_TARGETS,
  type AuditDoc,
  type CaseScore,
  type DciParams,
  type DocChange,
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
  feedbackRepo,
  internalRepo,
  questionsRepo,
  settingsRepo,
  submissionsRepo,
  supervisionRepo,
  tendersRepo,
  versionsRepo,
} from '../repositories.js';
import { collectEditSessions, countDriveRevisions, readVersionSnapshot } from './docsService.js';
import { computeScore, documentChange } from './scoreCalc.js';

export async function scoringSettings(): Promise<{ targets: ScoreTargets; dci: DciParams }> {
  const s = await settingsRepo.getScoring();
  return {
    targets: { ...DEFAULT_SCORE_TARGETS, ...s.targets },
    dci: { ...DEFAULT_DCI_PARAMS, ...s.dci },
  };
}

/**
 * Document change from the first edition to the last one before publication (or the latest, if
 * not published). Editions = Google Docs edit sessions; falls back to the supervisor's checkpoint
 * snapshots under the emulator or if Drive can't be read.
 */
async function analyzeDocChange(
  tender: TenderDoc,
  audit: AuditDoc[],
  versions: DocVersion[],
  params: DciParams,
): Promise<DocChange | null> {
  const publishedAt =
    audit
      .filter((a) => a.action === 'status_change' && a.newState === 'published')
      .sort((a, b) => a.at - b.at)[0]?.at ?? null;
  const upToPublish = <T extends { at: number }>(xs: T[]) =>
    publishedAt === null ? xs : xs.filter((x) => x.at <= publishedAt);

  let editions: { at: number; editor: string | null; text: string }[] | null = null;
  let source: DocChange['source'] = 'checkpoints';
  let sampled = false;
  try {
    const docs = await collectEditSessions(tender);
    if (docs) {
      const kept = upToPublish(docs.sessions);
      if (kept.length) {
        editions = kept;
        source = 'docs';
        sampled = docs.sampled;
      }
    }
  } catch (err) {
    console.error(`edit sessions unavailable for ${tender.id}, using checkpoints`, err);
  }
  if (!editions) {
    const kept = upToPublish(versions);
    if (!kept.length) return null;
    editions = await Promise.all(
      kept.map(async (v) => ({ at: v.at, editor: null, text: await readVersionSnapshot(v.path) })),
    );
  }
  const r = documentChange(
    editions.map((e) => e.text),
    params,
  );
  return {
    source,
    sampled,
    sessions: r.sessions,
    netChange: r.netChange,
    churn: r.churn,
    rework: r.rework,
    dci: r.dci,
    timeline: editions.map((e, i) => ({
      n: i,
      editor: e.editor,
      at: e.at,
      changeRatio: i === 0 ? null : Math.round(r.steps[i - 1] * 1000) / 1000,
    })),
  };
}

export async function computeCaseScore(
  caller: Pick<Caller, 'uid' | 'name'>,
  tenderId: string,
): Promise<CaseScore> {
  const tender = await tendersRepo.get(tenderId);
  if (!tender) throw new Error(`tender ${tenderId} not found`);
  const [provenance, audit, supervision, versions, access, submissions, questions, settings, feedback] =
    await Promise.all([
      internalRepo.getProvenance(tenderId),
      auditRepo.forTender(tenderId),
      supervisionRepo.list(tenderId),
      versionsRepo.list(tenderId),
      accessRepo.list(tenderId),
      submissionsRepo.list(tenderId),
      questionsRepo.list(tenderId),
      scoringSettings(),
      feedbackRepo.listForTender(tenderId),
    ]);
  const [docChange, driveRevisions] = await Promise.all([
    analyzeDocChange(tender, audit, versions, settings.dci).catch((err) => {
      console.error(`document change failed for ${tenderId}`, err);
      return null;
    }),
    countDriveRevisions(tender).catch(() => null),
  ]);
  const score = computeScore({
    tender,
    provenance,
    audit,
    supervision,
    versions,
    docChange,
    feedback,
    invitedSuppliers: access.filter((a) => a.kind === 'supplier').length,
    submissions: submissions.length,
    questions: questions.length,
    driveRevisions,
    targets: settings.targets,
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
