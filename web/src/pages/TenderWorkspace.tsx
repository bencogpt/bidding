import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import DocumentViewer from '../components/DocumentViewer';
import AccessPanel from '../components/AccessPanel';
import QuestionsPanel from '../components/QuestionsPanel';
import EvaluationPanel from '../components/EvaluationPanel';
import CasePanel from '../components/CasePanel';
import QuartetCard from '../components/QuartetCard';
import NextActionCard from '../components/NextActionCard';
import DatesCard from '../components/DatesCard';
import SupervisorPanel from '../components/SupervisorPanel';
import TenderHeader, { type HeaderAction } from '../components/TenderHeader';

type Tab = 'overview' | 'document' | 'supervisor' | 'access' | 'questions' | 'evaluation' | 'case';

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
  const [tab, setTab] = useState<Tab>('overview');
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
    { key: 'overview', label: t('ws.overview') },
    // The case team chat sits beside the document, so unread messages show on this tab.
    {
      key: 'document',
      label: chat.unread ? `${t('ws.document')} (${chat.unread})` : t('ws.document'),
    },
    { key: 'supervisor', label: t('ws.supervisor') },
    { key: 'access', label: t('ws.access') },
    { key: 'questions', label: t('ws.questions') },
    ...(showEval ? [{ key: 'evaluation' as Tab, label: t('ws.evaluation') }] : []),
    { key: 'case', label: t('ws.case') },
  ];

  // The next step for this case, shown as the header's main button.
  let action: HeaderAction | undefined;
  if (isManager) {
    if (tender.status === 'draft') {
      action = {
        label: t('ws.sendToReview'),
        onClick: () => transitionTo('internal_review'),
        disabled: busy || missing.length > 0,
        title: missing.length
          ? t('team.missing', { roles: missing.map((r) => t(`role.${r}`)).join(', ') })
          : undefined,
      };
    } else if (tender.status === 'internal_review') {
      action = { label: t('ws.markReady'), onClick: () => transitionTo('ready'), disabled: busy };
    } else if (tender.status === 'ready') {
      action = {
        label: busy ? t('sup.checking') : t('ws.publish'),
        onClick: () => transitionTo('published'),
        disabled: busy,
      };
    } else if (tender.status === 'responses' || tender.status === 'evaluated') {
      action = { label: t('ws.toEvaluation'), onClick: () => setTab('evaluation') };
    }
  }
  const ownerName =
    users.find((u) => u.uid === tender.ownerUid)?.displayName ??
    access.find((a) => a.principalId === tender.ownerUid)?.displayName;

  return (
    <div>
      <TenderHeader tender={tender} ownerName={ownerName} action={action}>
        <div className="mt-3 flex gap-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              className={`px-4 py-2 text-sm font-semibold ${
                tab === tb.key ? 'border-b-2 border-teal text-tx' : 'text-tx-mute'
              }`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </TenderHeader>

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

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <NextActionCard tender={tender} action={action} onOpenDocument={() => setTab('document')} />
            <QuartetCard tender={tender} />
            <DatesCard tender={tender} template={template} />
          </div>
        </div>
      )}
      {tab === 'document' && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
          <DocumentViewer tenderId={tender.id} googleDocId={tender.googleDocId} />
          <ChatPanel tenderId={tender.id} messages={chat.messages} />
        </div>
      )}
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
      {tab === 'case' && (
        <div className="space-y-4">
          <CasePanel tender={tender} />
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
      {tab === 'supervisor' && <SupervisorPanel tender={tender} template={template} />}
    </div>
  );
}
