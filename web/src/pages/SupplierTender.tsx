import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useTender, useQuestions, useAnswers } from '../lib/hooks';
import DocumentViewer from '../components/DocumentViewer';
import QuestionsPanel from '../components/QuestionsPanel';
import SubmissionPanel from '../components/SubmissionPanel';
import StatusBadge from '../components/StatusBadge';

export default function SupplierTender() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { supplierId } = useAuth();
  const { tender, loading } = useTender(id);
  const questions = useQuestions(id);
  const answers = useAnswers(id);

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (!tender || !id) return <div className="text-tx-soft">404</div>;

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
          <StatusBadge status={tender.status} />
        </div>
      </div>

      {/* In-system document view (no Google Docs link, view-only) */}
      <DocumentViewer tenderId={id} />

      {/* Private submission space (files + summary, until deadline) */}
      {supplierId && <SubmissionPanel tender={tender} supplierId={supplierId} />}

      {/* Authorized suppliers can ask and see each other's questions + manager answers */}
      <QuestionsPanel
        tenderId={id}
        questions={questions}
        answers={answers}
        canManage={false}
        canAsk={true}
      />
    </div>
  );
}
