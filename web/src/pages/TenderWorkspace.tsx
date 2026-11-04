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
  useTenderInternal,
} from '../lib/hooks';
import { REQUIRED_ROLES_BY_TYPE, REQUIRE_APPROVALS, missingRoles, missingApprovals, hasDocument } from '@obms/shared';
import TeamPanel from '../components/TeamPanel';
import ChatPanel from '../components/ChatPanel';
import { api } from '../lib/api';
import DocumentViewer from '../components/DocumentViewer';
import DraftPanel, { draftGate } from '../components/DraftPanel';
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
  const { pendingSuppliers } = useTenderInternal(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [chatOpen, setChatOpen] = useState(false);
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
      // Left out when absent: an undefined field is sent as null, which the server rejects.
      await api.transitionTender({ tenderId: tender.id, to, ...(override ? { overrideReason: override } : {}) });
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

  // Sign-offs of the case team in internal review: one per required role.
  const requiredRoles = tender.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[tender.type] ?? [];
  const waiting = missingApprovals(requiredRoles, tender.team, tender.approvals);
  const myApproved = requiredRoles.some((r) => tender.team?.[r] === user?.uid && !waiting.includes(r));
  const iHoldSlot = requiredRoles.some((r) => tender.team?.[r] === user?.uid);
  const setApproval = async (approve: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api.approveTender({ tenderId: tender.id, approve });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const showEval = ['responses', 'evaluated', 'awarded'].includes(tender.status);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('ws.overview') },
    { key: 'document', label: t('ws.document') },
    { key: 'supervisor', label: t('ws.supervisor') },
    { key: 'access', label: t('ws.access') },
    { key: 'questions', label: t('ws.questions') },
    ...(showEval ? [{ key: 'evaluation' as Tab, label: t('ws.evaluation') }] : []),
    { key: 'case', label: t('ws.case') },
  ];

  // The next step for this case, shown as the header's main button.
  let action: HeaderAction | undefined;
  if (isManager) {
    if (tender.status === 'draft' && !hasDocument(tender)) {
      // Draft-first: the next step is creating the document, from the document tab.
      const gate = draftGate(tender);
      action = {
        label: t('draft.nextAction'),
        onClick: () => setTab('document'),
        title: gate ? t(`draft.gate.${gate}`) : undefined,
      };
    } else if (tender.status === 'draft') {
      // The manager's own approval: the case goes to the team for theirs.
      action = {
        label: t('ws.sendForApproval'),
        onClick: () => transitionTo('internal_review'),
        disabled: busy || missing.length > 0,
        title: missing.length
          ? t('team.missing', { roles: missing.map((r) => t(`role.${r}`)).join(', ') })
          : undefined,
      };
    } else if (tender.status === 'internal_review') {
      // Says what it waits for instead of looking like a dead button.
      const done = requiredRoles.length - waiting.length;
      action = {
        label:
          REQUIRE_APPROVALS && waiting.length
            ? t('ws.waitingTeam', { done, total: requiredRoles.length })
            : t('ws.finalApprove'),
        onClick: () => transitionTo('ready'),
        disabled: busy || (REQUIRE_APPROVALS && waiting.length > 0),
        title: REQUIRE_APPROVALS && waiting.length
          ? t('ws.awaitingApproval', { roles: waiting.map((r) => t(`role.${r}`)).join(', ') })
          : undefined,
      };
    } else if (tender.status === 'ready') {
      // Publishing needs every required role's approval too (cases that reached "ready" without them).
      action = {
        label: busy ? t('sup.checking') : t('ws.publish'),
        onClick: () => transitionTo('published'),
        disabled: busy || (REQUIRE_APPROVALS && waiting.length > 0) || pendingSuppliers.length === 0,
        title: REQUIRE_APPROVALS && waiting.length
          ? t('ws.awaitingApproval', { roles: waiting.map((r) => t(`role.${r}`)).join(', ') })
          : pendingSuppliers.length === 0
            ? t('ws.pickSuppliersFirst')
            : undefined,
      };
    } else if (tender.status === 'responses' || tender.status === 'evaluated') {
      action = { label: t('ws.toEvaluation'), onClick: () => setTab('evaluation') };
    }
  }
  // A team member (not the manager) signs off through the same button.
  if (REQUIRE_APPROVALS && !isManager && iHoldSlot && tender.status === 'internal_review') {
    action = myApproved
      ? { label: t('ws.withdrawApproval'), onClick: () => setApproval(false), disabled: busy }
      : { label: t('ws.approve'), onClick: () => setApproval(true), disabled: busy };
  }
  const ownerName =
    users.find((u) => u.uid === tender.ownerUid)?.displayName ??
    access.find((a) => a.principalId === tender.ownerUid)?.displayName;

  return (
    <div>
      <TenderHeader
        tender={tender}
        ownerName={ownerName}
        action={action}
        approvals={REQUIRE_APPROVALS ? { slots: requiredRoles.map((r) => !waiting.includes(r)) } : undefined}
      >
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
      {isManager && REQUIRE_APPROVALS && tender.status === 'internal_review' && waiting.length > 0 && (
        <div className="card mb-4 border-teal-200 bg-teal-soft p-3 text-sm text-teal-700">
          {t('ws.reviewWaiting', { roles: waiting.map((r) => t(`role.${r}`)).join(', ') })}
        </div>
      )}
      {isManager && REQUIRE_APPROVALS && tender.status === 'ready' && waiting.length > 0 && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>{t('ws.readyMissingApprovals', { roles: waiting.map((r) => t(`role.${r}`)).join(', ') })}</span>
          <button className="btn btn-sm" disabled={busy} onClick={() => transitionTo('internal_review')}>
            {t('ws.backToReview')}
          </button>
        </div>
      )}
      {isManager && tender.status === 'ready' && waiting.length === 0 && pendingSuppliers.length === 0 && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>{t('ws.pickSuppliersFirst')}</span>
          <button className="btn btn-sm" onClick={() => setTab('access')}>
            {t('ws.goPickSuppliers')}
          </button>
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
        <div>
          {hasDocument(tender) ? (
            <div className="space-y-3">
              {isManager && tender.status === 'draft' && (
                <div className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="text-tx-soft">{t('draft.regenerateHint')}</span>
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(t('draft.regenerateConfirm'))) return;
                      setBusy(true);
                      setError('');
                      try {
                        await api.regenerateDocument({ tenderId: tender.id });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t('draft.regenerate')}
                  </button>
                </div>
              )}
              <DocumentViewer tenderId={tender.id} googleDocId={tender.googleDocId} />
            </div>
          ) : (
            <DraftPanel
              tender={tender}
              template={template}
              canManage={isManager}
              onOpenInspector={() => setTab('supervisor')}
            />
          )}
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
          pendingSupplierIds={pendingSuppliers}
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

      {/* Case team chat: floats over every tab; the button shows the unread count while it is closed. */}
      {chatOpen && (
        <div className="fixed bottom-24 left-6 z-40 flex h-[min(560px,calc(100vh-8rem))] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-paper-2 bg-surface shadow-lg">
          <ChatPanel
            tenderId={tender.id}
            title={tender.title}
            messages={chat.messages}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}
      <button
        className="fixed bottom-6 left-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lg transition hover:bg-accent-hover"
        onClick={() => setChatOpen((o) => !o)}
        title={t('chat.open')}
        aria-label={t('chat.open')}
        aria-expanded={chatOpen}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
        </svg>
        {!chatOpen && chat.unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-xs font-bold text-ink-900">
            {chat.unread}
          </span>
        )}
      </button>
    </div>
  );
}
