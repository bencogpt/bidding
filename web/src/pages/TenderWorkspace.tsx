import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
  useSupervision,
} from '../lib/hooks';
import {
  REQUIRED_ROLES_BY_TYPE,
  REQUIRE_APPROVALS,
  TEAM_ROLES,
  ROLE_HE,
  missingApprovals,
  hasDocument,
  draftStateOf,
  stageIndexOf,
  findingsView,
  headerAction,
  approvalsView,
  stageBar,
  stagePopover,
  visibleTabs,
  resolveTab,
  blockingApproverRoles,
  type AgentRunState,
  type ApprovalRowAction,
  type Approvals,
  type Holders,
  type WorkspaceCtx,
  type WorkspaceTabKey,
} from '@obms/shared';
import ChatPanel from '../components/ChatPanel';
import { api } from '../lib/api';
import DocumentViewer from '../components/DocumentViewer';
import DraftPanel from '../components/DraftPanel';
import DraftReview from '../components/DraftReview';
import AccessPanel from '../components/AccessPanel';
import QuestionsPanel from '../components/QuestionsPanel';
import EvaluationPanel from '../components/EvaluationPanel';
import QuartetCard from '../components/QuartetCard';
import NextActionCard from '../components/NextActionCard';
import DatesCard from '../components/DatesCard';
import SupervisorPanel from '../components/SupervisorPanel';
import TenderHeader, { type HeaderButton } from '../components/TenderHeader';
import OnBehalfDialog from '../components/agent/OnBehalfDialog';
import PublishDialog from '../components/agent/PublishDialog';

// The prototype's tabs (shared visibleTabs). "שיתוף והרשאות" and "תיק מכרז" are hidden for now (plan D9):
// suppliers are picked in the publish dialog. פעילות and היסטוריית גרסאות join once built (plan D10); the
// conference stage has no backend.
type Tab = WorkspaceTabKey;
const NOT_BUILT_YET: readonly WorkspaceTabKey[] = ['activity', 'versions', 'conference'];

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
  // A new case opens on its draft (?tab=document), where the supervisor's check is already running.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'document' ? 'document' : 'overview');
  const [focusField, setFocusField] = useState<{ key: string; n: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set when the supervisor blocked publication — offers the audited manager override.
  const [blocked, setBlocked] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [initialCheck, setInitialCheck] = useState(false);
  const reports = useSupervision(id);
  // A check this browser started (until the server reports runs itself — plan B1).
  const [agentBusy, setAgentBusy] = useState(false);
  // Approving on a participant's behalf: the row it was asked for, while the reason dialog is open.
  const [onBehalf, setOnBehalf] = useState<ApprovalRowAction | null>(null);
  const [onBehalfError, setOnBehalfError] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);

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
        setTab('agent');
      }
    } finally {
      setBusy(false);
    }
  };

  // Sign-offs of the case team in internal review: one per required role.
  const requiredRoles = tender.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[tender.type] ?? [];
  // Information security approves but doesn't block (plan D2).
  const waiting = missingApprovals(blockingApproverRoles(requiredRoles), tender.team, tender.approvals);
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


  const ownerName =
    users.find((u) => u.uid === tender.ownerUid)?.displayName ??
    access.find((a) => a.principalId === tender.ownerUid)?.displayName;

  // The prototype's header (plan D1, D2): one shared ruleset decides the main button, the approvals card and
  // the stage bar (shared/src/workspaceView.ts).
  const ds = draftStateOf(tender);
  const stageIdx = stageIndexOf(tender.status);
  const latest = reports[0];
  // A check counts for what exists now: the document, or exactly the draft's current data.
  const fresh =
    !!latest &&
    (ds === 'doc' ? latest.basis !== 'draft' : latest.basis === 'draft' && latest.dataHash === tender.draftDataHash);
  const fv = findingsView(fresh ? { findings: latest.findings, basis: latest.basis ?? 'document' } : null);
  const agent: AgentRunState = agentBusy || initialCheck ? 'running' : fresh ? 'done' : 'none';
  const nameOf = (uid: string) =>
    users.find((u) => u.uid === uid)?.displayName ??
    access.find((a) => a.principalId === uid)?.displayName ??
    Object.values(tender.approvals ?? {}).find((a) => a?.uid === uid)?.name ??
    '';
  const holders: Holders = {};
  for (const r of TEAM_ROLES) {
    const uid = tender.team?.[r];
    if (uid) holders[r] = { uid, name: nameOf(uid) || ROLE_HE[r] };
  }
  const securityInvolved = requiredRoles.includes('security');
  const wctx: WorkspaceCtx = {
    stageIdx,
    ds,
    agent,
    openCount: fv.open.length,
    blockingCount: fv.blocking.length,
    isManager,
    myRoles: requiredRoles.filter((r) => tender.team?.[r] === user?.uid),
    holders,
    approvals: (tender.approvals ?? {}) as Approvals,
    // The final approval waits for requester, legal and finance; security doesn't block (plan D2).
    approverRoles: REQUIRE_APPROVALS ? blockingApproverRoles(requiredRoles) : [],
  };
  const hv = headerAction(wctx);
  const av = approvalsView({
    ...wctx,
    myUid: user?.uid ?? '',
    isOwner: user?.uid === tender.ownerUid,
    ownerName: ownerName ?? '',
    lockedAt: tender.lockedAt ?? null,
    securityInvolved,
  });
  const bar = stageBar({ stageIdx });
  const tabs = visibleTabs({ stageIdx, ds, blockingCount: fv.blocking.length, questionCount: questions.length }).filter(
    (tb) => !NOT_BUILT_YET.includes(tb.key),
  );
  const shown = resolveTab(tab, tabs);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const onHeader = () => {
    if (!hv) return;
    switch (hv.kind) {
      case 'run_agent':
        setAgentBusy(true);
        setError('');
        api
          .runSupervision({ tenderId: tender.id })
          .catch((e) => setError(e instanceof Error ? e.message : String(e)))
          .finally(() => setAgentBusy(false));
        return;
      case 'create_document':
        void run(async () => {
          await api.generateDocument({ tenderId: tender.id });
          setTab('document');
        });
        return;
      case 'open_tab':
        if (hv.tab) setTab(hv.tab);
        return;
      case 'approve':
        void setApproval(true);
        return;
      case 'final_approve':
        void transitionTo('ready');
        return;
      case 'publish':
        // Suppliers are picked in the publish dialog (the access tab is hidden — plan D9).
        setPublishOpen(true);
        return;
    }
  };
  const action: HeaderButton | null = hv
    ? {
        label: hv.label,
        enabled: hv.enabled,
        title: hv.title,
        tip: hv.tip,
        busy: busy || agentBusy,
        ...(hv.kind ? { onClick: onHeader } : {}),
      }
    : null;

  return (
    <div>
      <TenderHeader
        tender={tender}
        ownerName={ownerName}
        button={action}
        approvals={{
          // "פתח מחדש (שכפול)" arrives with the reopen callable (plan B5).
          view: { ...av, actions: av.actions.filter((a) => a.kind !== 'reopen') },
          busy,
          onAction: (kind) => {
            if (kind === 'withdraw') void setApproval(false);
          },
          onRowAction: (a) => {
            if (a.kind === 'approve_on_behalf') {
              setOnBehalfError('');
              setOnBehalf(a);
            } else void run(() => api.approveTender({ tenderId: tender.id, approve: false, onBehalfOf: a.role }));
          },
        }}
        stages={{
          items: bar.items,
          note: bar.note,
          popover: (item) => stagePopover(item, { stageIdx, holders, approvals: wctx.approvals, securityInvolved }),
        }}
      >
        {/* Tabs (prototype CSS lines 994–999): text with a 2px underline on the open one. */}
        <div className="mt-2.5 flex gap-[26px]" role="tablist">
          {tabs.map((tb) => {
            const on = shown === tb.key;
            return (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={on}
                className="-mb-px border-b-2 px-0.5 py-[11px] text-[13px] hover:!text-tx"
                style={{
                  color: on ? 'var(--text)' : 'var(--muted)',
                  fontWeight: on ? 600 : 400,
                  borderBottomColor: on ? 'var(--brand)' : 'transparent',
                }}
                onClick={() => setTab(tb.key)}
              >
                {tb.label}
                {tb.badge ? (
                  <span
                    className="ms-1.5 inline-block min-w-[22px] rounded-full px-[7px] text-center text-xs font-semibold"
                    style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                  >
                    {tb.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </TenderHeader>

      {publishOpen && isManager && (
        <PublishDialog
          canPublish={pendingSuppliers.length > 0}
          busy={busy}
          onClose={() => setPublishOpen(false)}
          onPublish={() => {
            setPublishOpen(false);
            void transitionTo('published');
          }}
        >
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
        </PublishDialog>
      )}

      {onBehalf && holders[onBehalf.role] && (
        <OnBehalfDialog
          name={holders[onBehalf.role]!.name}
          roleHe={ROLE_HE[onBehalf.role]}
          busy={busy}
          error={onBehalfError}
          onCancel={() => setOnBehalf(null)}
          onConfirm={async (reason) => {
            setBusy(true);
            setOnBehalfError('');
            try {
              await api.approveTender({ tenderId: tender.id, approve: true, onBehalfOf: onBehalf.role, reason });
              setOnBehalf(null);
            } catch (e) {
              setOnBehalfError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

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
          <button className="btn btn-sm" onClick={() => setPublishOpen(true)}>
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

      {shown === 'overview' && (
        <div className="space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <NextActionCard tender={tender} action={action ?? undefined} onOpenDocument={() => setTab('document')} />
            <QuartetCard tender={tender} />
            <DatesCard tender={tender} template={template} />
          </div>
        </div>
      )}
      {shown === 'document' && (
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
            <div className="space-y-4">
              <DraftReview
                tender={tender}
                template={template}
                canManage={isManager}
                checking={initialCheck}
                onEditField={(key) => setFocusField((f) => ({ key, n: (f?.n ?? 0) + 1 }))}
              />
              <DraftPanel
                tender={tender}
                template={template}
                canManage={isManager}
                onOpenInspector={() => setTab('agent')}
                focusField={focusField}
              />
            </div>
          )}
        </div>
      )}
      {shown === 'questions' && (
        <QuestionsPanel
          tenderId={tender.id}
          questions={questions}
          answers={answers}
          canManage={isManager}
          canAsk={false}
        />
      )}
      {shown === 'bids' && <EvaluationPanel tender={tender} submissions={submissions} />}
      {shown === 'agent' && <SupervisorPanel tender={tender} template={template} />}

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
