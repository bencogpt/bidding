import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RawExtraKey, ScoreComponentKey, ScoreGrade, ScoreMetricKey, TenderDoc } from '@obms/shared';
import { useAuth } from '../auth/AuthProvider';
import { useCaseScore, useVersions } from '../lib/hooks';
import { api } from '../lib/api';

const GRADE_COLORS: Record<ScoreGrade, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-teal-soft text-teal-600',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
};

const PCT_METRICS: (ScoreMetricKey | RawExtraKey)[] = ['acceptance', 'editSize', 'responseRate', 'rework'];
const VERDICTS = ['PASS', 'WARN', 'BLOCK'];
const PARTS: ScoreComponentKey[] = ['efficiency', 'correctness', 'aiBenefit', 'outcome'];

export function formatMetric(key: ScoreMetricKey | RawExtraKey, v: number): string {
  if (PCT_METRICS.includes(key)) return `${Math.round(v * 100)}%`;
  if (key === 'firstCheck') return VERDICTS[v] ?? String(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const barColor = (score: number) =>
  score >= 85 ? 'bg-green-500' : score >= 70 ? 'bg-teal-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';

export function GradeBadge({ grade, total }: { grade: ScoreGrade; total: number }) {
  return (
    <span className={`badge ${GRADE_COLORS[grade]}`}>
      {total} · {grade}
    </span>
  );
}

// Success score of one bid case: efficiency, correctness, AI benefit, outcome + version timeline. Each
// part says what it measures; a part that can't be measured yet says when it will be. The bid manager
// sees the details (metrics, document-change index, versions); the rest of the team sees the summary.
export default function ScoreCard({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
  const isManager = useAuth().role === 'tender_manager';
  const score = useCaseScore(tender.id);
  const versions = useVersions(tender.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const recompute = async () => {
    setBusy(true);
    setError('');
    try {
      await api.recomputeCaseScore({ tenderId: tender.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold">{t('score.title')}</h4>
          {score && <GradeBadge grade={score.grade} total={score.total} />}
          {score && <span className="chip">{t(`score.cohort.${score.cohort}`)}</span>}
        </div>
        {isManager && (
          <button className="btn btn-sm no-print" disabled={busy} onClick={recompute}>
            {busy ? t('score.computing') : t('score.recompute')}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-tx-soft">{t('score.subtitle')}</p>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      {!score ? (
        <div className="text-sm text-tx-mute">{t('score.none')}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {PARTS.map((key) => {
              const c = score.components.find((x) => x.key === key);
              if (!c) {
                return (
                  <div key={key} className="rounded border border-dashed border-paper-2 p-3 text-tx-mute">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold">{t(`score.component.${key}`)}</span>
                      <span className="text-xs">{t('score.pendingLabel')}</span>
                    </div>
                    <p className="text-xs">{t(`score.componentHint.${key}`)}</p>
                    <p className="mt-1 text-xs">{t(`score.pending.${key}`)}</p>
                  </div>
                );
              }
              return (
                <div key={key} className="rounded border border-paper-2 p-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold">{t(`score.component.${key}`)}</span>
                    <span className="text-tx-soft" title={t('score.weightHint')}>
                      {c.score} · {t('score.weight', { pct: Math.round(c.weight * 100) })}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-tx-soft">{t(`score.componentHint.${key}`)}</p>
                  <div className="mb-2 h-2 rounded bg-paper-2">
                    <div className={`h-2 rounded ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
                  </div>
                  {isManager && (
                    <table className="w-full text-xs">
                      <tbody>
                        {c.metrics.map((m) => (
                          <tr key={m.key} title={t(`score.metricHint.${m.key}`)} className="cursor-help">
                            <td className="py-0.5 text-tx-soft underline decoration-dotted underline-offset-2">
                              {t(`score.metric.${m.key}`)}
                            </td>
                            <td className="py-0.5 font-semibold" dir="ltr">
                              {formatMetric(m.key, m.value)}
                            </td>
                            <td className="py-0.5 text-tx-mute">
                              {t('score.target')}: <span dir="ltr">{formatMetric(m.key, m.target.good)}</span>
                            </td>
                            <td className="py-0.5 text-left">{m.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-tx-mute">
            {t('score.computedAt')} <span dir="ltr">{new Date(score.computedAt).toLocaleString('he-IL')}</span>
            {score.driveRevisions !== null && <> · {t('score.driveRevisions', { count: score.driveRevisions })}</>}
          </div>
        </div>
      )}

      {/* Document Change Index: first edition → last, over edit sessions */}
      {isManager && score?.docChange && (
        <div className="mt-4 rounded border border-paper-2 p-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold" title={t('score.dciHint')}>
              {t('score.dciTitle')}
            </span>
            <span className="font-display text-lg font-bold text-teal-600">{score.docChange.dci}</span>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1 text-xs md:grid-cols-4">
            <span>
              {t('score.dciN')}: <b>{score.docChange.sessions}</b>
            </span>
            <span>
              {t('score.dciD')}: <b>{Math.round(score.docChange.netChange * 100)}%</b>
            </span>
            <span>
              {t('score.dciC')}: <b>{Math.round(score.docChange.churn * 100)}%</b>
            </span>
            <span>
              {t('score.dciR')}: <b>{Math.round(score.docChange.rework * 100)}%</b>
            </span>
          </div>
          <div className="text-xs text-tx-mute" dir="ltr">
            DCI = 100 × (1 − D) × (1 − w·R) × min(1, √(N₀/N))
          </div>
          <div className="mt-1 text-xs text-tx-mute">
            {t(`score.dciSource.${score.docChange.source}`)}
            {score.docChange.sampled && <> · {t('score.dciSampled')}</>}
          </div>
          {score.docChange.timeline.length > 1 && (
            <ul className="mt-2 space-y-1 text-sm">
              {score.docChange.timeline.map((s) => (
                <li key={s.n} className="flex flex-wrap items-center gap-2">
                  <span className="chip">{s.n === 0 ? t('score.firstEdition') : `#${s.n}`}</span>
                  {s.editor && (
                    <span className="text-tx-soft" dir="ltr">
                      {s.editor}
                    </span>
                  )}
                  <span className="text-tx-mute" dir="ltr">
                    {new Date(s.at).toLocaleString('he-IL')}
                  </span>
                  {s.changeRatio !== null && (
                    <span className="text-xs text-tx-soft">{t('score.changed', { pct: Math.round(s.changeRatio * 100) })}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Checkpoint snapshots (what the supervisor saw) */}
      {isManager && <div className="mt-4">
        <div className="mb-1 text-sm font-semibold">{t('score.versions')}</div>
        {versions.length === 0 ? (
          <div className="text-sm text-tx-mute">—</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {versions.map((v) => (
              <li key={v.n} className="flex flex-wrap items-center gap-2">
                <span className="chip">v{v.n}</span>
                <span className="text-tx-soft">{t(`sup.stage.${v.stage}`)}</span>
                <span className="text-tx-mute">{t(`status.${v.status}`)}</span>
                <span className="text-tx-mute" dir="ltr">
                  {new Date(v.at).toLocaleString('he-IL')}
                </span>
                {v.changeRatio !== null && (
                  <span className="text-xs text-tx-soft">
                    {t('score.changed', { pct: Math.round(v.changeRatio * 100) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>}
    </div>
  );
}
