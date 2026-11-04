import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TenderDoc, SubmissionDoc } from '@obms/shared';
import { api } from '../lib/api';
import { useTenderInternal } from '../lib/hooks';

export default function EvaluationPanel({
  tender,
  submissions,
}: {
  tender: TenderDoc;
  submissions: SubmissionDoc[];
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'compare' | string | null>(null);
  const [error, setError] = useState('');
  // Internal report (older cases may still carry it on the tender doc until migrated).
  const { comparison } = useTenderInternal(tender.id);
  const report = comparison ?? tender.comparisonReport ?? null;
  const nameOf = (sid: string) =>
    submissions.find((s) => s.supplierId === sid)?.supplierName ?? sid;

  const run = async () => {
    setBusy('compare');
    setError('');
    try {
      await api.runComparison({ tenderId: tender.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const award = async (supplierId: string) => {
    setBusy(supplierId);
    setError('');
    try {
      await api.awardTender({ tenderId: tender.id, supplierId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">
            {t('eval.submissions')} ({submissions.length})
          </h3>
          <button className="btn btn-gold" disabled={!submissions.length || busy === 'compare'} onClick={run}>
            {busy === 'compare' ? t('eval.running') : t('eval.runComparison')}
          </button>
        </div>
        {submissions.length === 0 ? (
          <div className="text-sm text-tx-mute">{t('eval.noSubmissions')}</div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.supplierId} className="rounded border border-paper-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.supplierName}</span>
                  {tender.awardedSupplierId === s.supplierId && (
                    <span className="badge bg-green-100 text-green-700">{t('eval.awarded')}</span>
                  )}
                </div>
                {s.summary && <p className="mt-1 text-sm text-tx-soft" dir="auto">{s.summary}</p>}
                {s.files.length > 0 && (
                  <div className="mt-1 text-xs text-tx-mute" dir="ltr">
                    {s.files.map((f) => f.name).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      {report && (
        <div className="card p-5">
          <h3 className="mb-2 font-semibold">{t('eval.report')}</h3>
          <div className="mb-3 rounded bg-gold-soft/40 p-2 text-xs text-gold-deep">{report.note}</div>
          <div className="space-y-3">
            {[...report.ranking]
              .sort((a, b) => b.score - a.score)
              .map((r) => (
                <div
                  key={r.supplierId}
                  className={`rounded border p-3 ${
                    report.preferredSupplierId === r.supplierId
                      ? 'border-gold bg-gold-soft/20'
                      : 'border-paper-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{nameOf(r.supplierId)}</span>
                      {report.preferredSupplierId === r.supplierId && (
                        <span className="badge bg-gold-soft text-gold-deep">{t('eval.preferred')}</span>
                      )}
                      <span className="chip">{t('eval.score')}: {r.score}</span>
                    </div>
                    <button
                      className="btn btn-sm"
                      disabled={busy === r.supplierId || tender.status === 'awarded'}
                      onClick={() => award(r.supplierId)}
                    >
                      {tender.awardedSupplierId === r.supplierId ? t('eval.awarded') : t('eval.award')}
                    </button>
                  </div>
                  {r.strengthsHe.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="font-semibold text-green-700">{t('eval.strengths')}: </span>
                      {r.strengthsHe.join('; ')}
                    </div>
                  )}
                  {r.weaknessesHe.length > 0 && (
                    <div className="text-sm">
                      <span className="font-semibold text-red-700">{t('eval.weaknesses')}: </span>
                      {r.weaknessesHe.join('; ')}
                    </div>
                  )}
                  {r.rationaleHe && <p className="mt-1 text-sm text-tx-soft" dir="auto">{r.rationaleHe}</p>}
                  {r.criteriaScores && r.criteriaScores.length > 1 && (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-tx-mute">
                      {r.criteriaScores.map((c) => (
                        <span key={c.name} className="chip">
                          {c.name}: {c.score}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.injection && (
                    <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700" dir="auto">
                      {t('eval.injectionFlag')}: “{r.injection.evidence}”
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
