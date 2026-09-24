import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import {
  useTender,
  useAccess,
  useSuppliers,
  useUsers,
  useQuestions,
  useAnswers,
  useSubmissions,
} from '../lib/hooks';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import DocumentViewer from '../components/DocumentViewer';
import AccessPanel from '../components/AccessPanel';
import QuestionsPanel from '../components/QuestionsPanel';
import EvaluationPanel from '../components/EvaluationPanel';
import CasePanel from '../components/CasePanel';

type Tab = 'case' | 'overview' | 'document' | 'access' | 'questions' | 'evaluation';

export default function TenderWorkspace() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { role } = useAuth();
  const { tender, loading } = useTender(id);
  const access = useAccess(id);
  const suppliers = useSuppliers();
  const users = useUsers();
  const questions = useQuestions(id);
  const answers = useAnswers(id);
  const submissions = useSubmissions(id);
  const [tab, setTab] = useState<Tab>('case');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (!tender) return <div className="text-tx-soft">404</div>;

  const isManager = role === 'tender_manager';
  const transitionTo = async (to: Parameters<typeof api.transitionTender>[0]['to']) => {
    setBusy(true);
    try {
      await api.transitionTender({ tenderId: tender.id, to });
    } finally {
      setBusy(false);
    }
  };

  const showEval = ['responses', 'evaluated', 'awarded'].includes(tender.status);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'case', label: t('ws.case') },
    { key: 'overview', label: t('ws.overview') },
    { key: 'document', label: t('ws.document') },
    { key: 'access', label: t('ws.access') },
    { key: 'questions', label: t('ws.questions') },
    ...(showEval ? [{ key: 'evaluation' as Tab, label: t('ws.evaluation') }] : []),
  ];

  return (
    <div>
      <Link to="/" className="text-sm text-teal-600">
        ← {t('common.back')}
      </Link>
      <div className="mb-4 mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{tender.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="chip">{t(`type.${tender.type}`)}</span>
            <StatusBadge status={tender.status} />
          </div>
        </div>
        {isManager && (
          <div className="flex gap-2">
            {tender.status === 'draft' && (
              <button className="btn" disabled={busy} onClick={() => transitionTo('internal_review')}>
                {t('ws.sendToReview')}
              </button>
            )}
            {tender.status === 'internal_review' && (
              <button className="btn" disabled={busy} onClick={() => transitionTo('ready')}>
                {t('ws.markReady')}
              </button>
            )}
            {tender.status === 'ready' && (
              <button className="btn btn-gold" disabled={busy} onClick={() => transitionTo('published')}>
                {t('ws.publish')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b border-paper-2">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            className={`px-4 py-2 text-sm font-semibold ${
              tab === tb.key ? 'border-b-2 border-gold text-tx' : 'text-tx-mute'
            }`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card space-y-2 p-6 text-sm">
          {Object.entries(tender.params).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="font-semibold text-tx-soft">{k}:</span>
              <span>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'document' && (
        <DocumentViewer tenderId={tender.id} googleDocId={tender.googleDocId} />
      )}
      {tab === 'access' && (
        <AccessPanel
          tenderId={tender.id}
          tenderType={tender.type}
          tenderDomainTags={tender.domainTags ?? []}
          access={access}
          suppliers={suppliers}
          users={users}
          canManage={isManager}
        />
      )}
      {tab === 'questions' && (
        <QuestionsPanel
          tenderId={tender.id}
          questions={questions}
          answers={answers}
          canManage={isManager}
          canAsk={false}
        />
      )}
      {tab === 'evaluation' && <EvaluationPanel tender={tender} submissions={submissions} />}
      {tab === 'case' && <CasePanel tender={tender} />}
    </div>
  );
}
