import { useEffect, useState } from 'react';
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
  useTemplate,
  useChat,
} from '../lib/hooks';
import { REQUIRED_ROLES_BY_TYPE, missingRoles } from '@obms/shared';
import TeamPanel from '../components/TeamPanel';
import ChatPanel from '../components/ChatPanel';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import DocumentViewer from '../components/DocumentViewer';
import AccessPanel from '../components/AccessPanel';
import QuestionsPanel from '../components/QuestionsPanel';
import EvaluationPanel from '../components/EvaluationPanel';
import CasePanel from '../components/CasePanel';
import QuartetCard from '../components/QuartetCard';
import SupervisorPanel, { VerdictBadge } from '../components/SupervisorPanel';

type Tab =
  'case' | 'overview' | 'document' | 'supervisor' | 'chat' | 'access' | 'questions' | 'evaluation';

export default function TenderWorkspace() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const { tender, loading, denied } = useTender(id);
  const chat = useChat(id, user?.uid);
  const access = useAccess(id);
  const suppliers = useSuppliers();
  const users = useUsers();
  const questions = useQuestions(id);
  const answers = useAnswers(id);
  const submissions = useSubmissions(id);
  const template = useTemplate(tender?.type);
  const [tab, setTab] = useState<Tab>('case');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set when the supervisor blocked publication — offers the audited manager override.
  const [blocked, setBlocked] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [initialCheck, setInitialCheck] = useState(false);

  // A new case is created in seconds; its first supervisor check starts here, once per case.
  useEffect(() => {
    if (!tender || role !== 'tender_manager' || tender.lastSupervision) return;
    const key = `initial-supervision:${tender.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setInitialCheck(true);
    api
      .runSupervision({ tenderId: tender.id, initial: true })
      .catch((e) => console.error('initial supervision failed', e))
      .finally(() => setInitialCheck(false));
  }, [tender?.id, tender?.lastSupervision, role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (!tender) return <div className="text-tx-soft">{denied ? t('team.notAssigned') : '404'}</div>;

  const isManager = role === 'tender_manager';
  const missing = missingRoles(
    tender.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[tender.type],
    tender.team,
  );
  const transitionTo = async (
    to: Parameters<typeof api.transitionTender>[0]['to'],
    override?: string,
  ) => {
    setBusy(true);
    setError('');
    try {
      await api.transitionTender({ tenderId: tender.id, to, overrideReason: override });
      setBlocked(false);
      setOverrideReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (to === 'published') {
        setBlocked(true);
        setTab('supervisor');
      }
    } finally {
      setBusy(false);
    }
  };

  const showEval = ['responses', 'evaluated', 'awarded'].includes(tender.status);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'case', label: t('ws.case') },
    { key: 'overview', label: t('ws.overview') },
    { key: 'document', label: t('ws.document') },
    { key: 'supervisor', label: t('ws.supervisor') },
    { key: 'chat', label: chat.unread ? `${t('chat.tab')} (${chat.unread})` : t('chat.tab') },
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
            {tender.serial && (
              <span className="chip font-semibold" dir="ltr">
                {tender.serial}
              </span>
            )}
            <span className="chip">{t(`type.${tender.type}`)}</span>
            <StatusBadge status={tender.status} />
            {tender.lastSupervision && <VerdictBadge verdict={tender.lastSupervision.verdict} />}
          </div>
        </div>
        {isManager && (
          <div className="flex gap-2">
            {tender.status === 'draft' && (
              <button
                className="btn"
                disabled={busy || missing.length > 0}
                title={
                  missing.length
                    ? t('team.missing', { roles: missing.map((r) => t(`role.${r}`)).join(', ') })
                    : ''
                }
                onClick={() => transitionTo('internal_review')}
              >
                {t('ws.sendToReview')}
              </button>
            )}
            {tender.status === 'internal_review' && (
              <button className="btn" disabled={busy} onClick={() => transitionTo('ready')}>
                {t('ws.markReady')}
              </button>
            )}
            {tender.status === 'ready' && (
              <button
                className="btn btn-gold"
                disabled={busy}
                onClick={() => transitionTo('published')}
              >
                {busy ? t('sup.checking') : t('ws.publish')}
              </button>
            )}
          </div>
        )}
      </div>

      {(initialCheck || (!tender.lastSupervision && isManager)) && (
        <div className="card mb-4 border-teal-200 bg-teal-soft p-3 text-sm text-teal-600">
          {t('sup.initialRunning')}
        </div>
      )}
      {error && (
        <div className="card mb-4 space-y-2 border-red-200 p-4 text-sm">
          <div className="text-red-600">{error}</div>
          {isManager && blocked && tender.status === 'ready' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input flex-1"
                placeholder={t('sup.overridePlaceholder')}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <button
                className="btn"
                disabled={busy || overrideReason.trim().length < 10}
                onClick={() => transitionTo('published', overrideReason.trim())}
              >
                {t('sup.override')}
              </button>
            </div>
          )}
        </div>
      )}

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
        <div className="space-y-4">
          <QuartetCard tender={tender} />
          <div className="card space-y-2 p-6 text-sm">
            {Object.entries(tender.params).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-semibold text-tx-soft">{k}:</span>
                <span>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'document' && (
        <DocumentViewer tenderId={tender.id} googleDocId={tender.googleDocId} />
      )}
      {tab === 'chat' && <ChatPanel tenderId={tender.id} messages={chat.messages} />}
      {tab === 'access' && (
        <div className="mb-4">
          <TeamPanel tender={tender} users={users} access={access} canManage={isManager} />
        </div>
      )}
      {tab === 'access' && (
        <AccessPanel
          tenderId={tender.id}
          tenderType={tender.type}
          tenderStatus={tender.status}
          tenderDomainTags={tender.domainTags ?? []}
          access={access}
          suppliers={suppliers}
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
      {tab === 'supervisor' && <SupervisorPanel tender={tender} template={template} />}
    </div>
  );
}
