import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AnswerDoc, QuestionDoc } from '@obms/shared';
import { useAuth } from '../auth/AuthProvider';
import { useSupplierCase } from '../lib/hooks';
import DocumentViewer from '../components/DocumentViewer';
import QuestionsPanel from '../components/QuestionsPanel';
import SubmissionPanel from '../components/SubmissionPanel';
import StatusBadge from '../components/StatusBadge';

// The supplier's view of one case. Everything comes from Cloud Functions (supplierGetTender,
// getTenderDocument, askQuestion, saveSubmission) — suppliers have no direct database access.
export default function SupplierTender() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { supplierId } = useAuth();
  const { data, loading, error, reload } = useSupplierCase(id);

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (!data || !id) return <div className="text-tx-soft">{error || '404'}</div>;
  const { tender } = data;

  return (
    <div className="space-y-6">
      <Link to="/portal" className="text-sm text-teal-600">
        ← {t('common.back')}
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold">{tender.title}</h1>
        {tender.serial && <div className="text-sm text-tx-mute" dir="ltr">{tender.serial}</div>}
        <div className="mt-2 flex items-center gap-2">
          <span className="chip">{t(`type.${tender.type}`)}</span>
          <StatusBadge status={tender.status as never} />
        </div>
      </div>

      {/* In-system document view (no Google Docs link, view-only) */}
      <DocumentViewer tenderId={id} />

      {/* Private submission space (files + summary, until deadline) */}
      {supplierId && (
        <SubmissionPanel
          tender={{ id: tender.id, submissionDeadline: tender.submissionDeadline }}
          existing={data.mySubmission}
          onSaved={reload}
        />
      )}

      {/* Authorized suppliers can ask and see each other's (anonymous) questions + manager answers */}
      <QuestionsPanel
        tenderId={id}
        questions={data.questions as QuestionDoc[]}
        answers={data.answers as AnswerDoc[]}
        canManage={false}
        canAsk={true}
        myQuestionIds={data.myQuestionIds}
        onAsked={reload}
      />
    </div>
  );
}
