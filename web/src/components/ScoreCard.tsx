import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScoreGrade, ScoreMetricKey, TenderDoc } from '@obms/shared';
import { useCaseScore, useVersions } from '../lib/hooks';
import { api } from '../lib/api';

const GRADE_COLORS: Record<ScoreGrade, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-teal-soft text-teal-600',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
};

const PCT_METRICS: ScoreMetricKey[] = ['acceptance', 'editSize', 'responseRate'];
const VERDICTS = ['PASS', 'WARN', 'BLOCK'];

export function formatMetric(key: ScoreMetricKey, v: number): string {
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

// Success score of one bid case: efficiency, correctness, AI benefit, outcome + version timeline.
export default function ScoreCard({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
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
        <button className="btn btn-sm no-print" disabled={busy} onClick={recompute}>
          {busy ? t('score.computing') : t('score.recompute')}
        </button>
      </div>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      {!score ? (
        <div className="text-sm text-tx-mute">{t('score.none')}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {score.components.map((c) => (
              <div key={c.key} className="rounded border border-paper-2 p-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold">{t(`score.component.${c.key}`)}</span>
                  <span className="text-tx-soft">
                    {c.score} · {Math.round(c.weight * 100)}%
                  </span>
                </div>
                <div className="mb-2 h-2 rounded bg-paper-2">
                  <div className={`h-2 rounded ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {c.metrics.map((m) => (
                      <tr key={m.key}>
                        <td className="py-0.5 text-tx-soft">{t(`score.metric.${m.key}`)}</td>
                        <td className="py-0.5 font-semibold" dir="ltr">
                          {formatMetric(m.key, m.value)}
                        </td>
                        <td className="py-0.5 text-tx-mute" dir="ltr">
                          {t('score.target')} {formatMetric(m.key, m.target.good)}
                        </td>
                        <td className="py-0.5 text-left">{m.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="text-xs text-tx-mute">
            {t('score.computedAt')} <span dir="ltr">{new Date(score.computedAt).toLocaleString('he-IL')}</span>
            {score.driveRevisions !== null && <> · {t('score.driveRevisions', { count: score.driveRevisions })}</>}
          </div>
        </div>
      )}

      {/* Version timeline */}
      <div className="mt-4">
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
      </div>
    </div>
  );
}
