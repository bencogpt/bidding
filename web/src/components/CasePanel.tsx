import { useTranslation } from 'react-i18next';
import type { TenderDoc } from '@obms/shared';
import { useAccess, useSubmissions, useQuestions, useAnswers, useTenderAudit } from '../lib/hooks';
import StatusBadge from './StatusBadge';
import ScoreCard from './ScoreCard';
import FeedbackSummary from './FeedbackSummary';
import { useAuth } from '../auth/AuthProvider';

// Consolidated "case file" for one bid: everything about it in one place.
export default function CasePanel({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
  const access = useAccess(tender.id);
  const submissions = useSubmissions(tender.id);
  const questions = useQuestions(tender.id);
  const answers = useAnswers(tender.id);
  const audit = useTenderAudit(tender.id);
  const isManager = useAuth().role === 'tender_manager';

  const suppliers = access.filter((a) => a.kind === 'supplier');
  const reviewers = access.filter((a) => a.kind === 'internal');

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          {tender.serial && (
            <span className="chip font-semibold" dir="ltr">
              {tender.serial}
            </span>
          )}
          <h3 className="font-semibold">{tender.title}</h3>
          <span className="chip">{t(`type.${tender.type}`)}</span>
          <StatusBadge status={tender.status} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-tx-soft md:grid-cols-4">
          <div>
            {t('case.deadline')}:{' '}
            {tender.submissionDeadline
              ? new Date(tender.submissionDeadline).toLocaleString('he-IL')
              : '—'}
          </div>
          <div>
            {t('case.suppliers')}: {suppliers.length}
          </div>
          <div>
            {t('case.reviewers')}: {reviewers.length}
          </div>
          <div>
            {t('case.awarded')}: {tender.awardedSupplierId ?? '—'}
          </div>
        </div>
      </div>

      <ScoreCard tender={tender} />
      {isManager && <FeedbackSummary tender={tender} />}

      {/* Submissions + files */}
      <div className="card p-5">
        <h4 className="mb-2 font-semibold">
          {t('case.submissions')} ({submissions.length})
        </h4>
        {submissions.length === 0 ? (
          <div className="text-sm text-tx-mute">{t('eval.noSubmissions')}</div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.supplierId} className="rounded border border-paper-2 p-3">
                <div className="font-medium">{s.supplierName}</div>
                {s.summary && (
                  <p className="mt-1 text-sm text-tx-soft" dir="auto">
                    {s.summary}
                  </p>
                )}
                {s.files.length > 0 && (
                  <ul className="mt-1 space-y-1 text-sm">
                    {s.files.map((f) => (
                      <li key={f.path} className="flex items-center gap-2">
                        <span className="chip">📎</span>
                        <span dir="ltr">{f.name}</span>
                        <span className="text-tx-mute">({Math.round(f.size / 1024)} KB)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Q&A summary */}
      <div className="card p-5">
        <h4 className="mb-2 font-semibold">{t('case.qa')}</h4>
        <div className="text-sm text-tx-soft">
          {t('case.qaSummary', { questions: questions.length, answers: answers.length })}
        </div>
      </div>

      {/* Comparison / award */}
      {tender.comparisonReport && (
        <div className="card p-5">
          <h4 className="mb-2 font-semibold">{t('case.comparison')}</h4>
          <div className="text-sm">
            {t('eval.preferred')}: {tender.comparisonReport.preferredSupplierId ?? '—'} ·{' '}
            {tender.comparisonReport.isStub ? 'stub' : tender.comparisonReport.model}
          </div>
        </div>
      )}

      {/* Audit trail for this bid */}
      <div className="card p-5">
        <h4 className="mb-2 font-semibold">{t('case.audit')}</h4>
        {audit.length === 0 ? (
          <div className="text-sm text-tx-mute">—</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {audit.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="chip">{e.action}</span>
                <span className="text-tx-soft">{e.actorName}</span>
                <span className="text-tx-mute" dir="ltr">
                  {new Date(e.at).toLocaleString('he-IL')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
