import { useEffect, useRef, useState } from 'react';
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
  useInputs,
  useTenderAudit,
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
  SUPERVISION_RUN_STALE_MS,
  AUTO_RUN_GRACE_MS,
  autoRunPending,
  type FindingView,
  visibleTabs,
  resolveTab,
  blockingApproverRoles,
  finalCheckViewOf,
  FLOW_HE,
  missingRoles,
  missingTimelineDates,
  sendDenialHe,
  type TeamRole,
  type AgentRunState,
  type ApprovalRowAction,
  type Approvals,
  type Holders,
  type WorkspaceCtx,
  type WorkspaceTabKey,
} from '@obms/shared';
import ChatPanel, { type ChatSeed } from '../components/ChatPanel';
import { ChatDockProvider } from '../components/agent/ChatDock';
import { api } from '../lib/api';
import DocView, { type DocViewHandle } from '../components/agent/DocView';
import DraftPanel from '../components/DraftPanel';
import DraftPage from '../components/agent/DraftPage';
import FindingsPanel from '../components/agent/FindingsPanel';
import AccessPanel from '../components/AccessPanel';
import QuestionsPanel from '../components/QuestionsPanel';
import EvaluationPanel from '../components/EvaluationPanel';
import OverviewTab from '../components/overview/OverviewTab';
import ActivityTab from '../components/activity/ActivityTab';
import VersionsTab from '../components/activity/VersionsTab';
import AgentReport from '../components/agent/AgentReport';
import TenderHeader, { type HeaderButton } from '../components/TenderHeader';
import OnBehalfDialog from '../components/agent/OnBehalfDialog';
import PublishDialog from '../components/agent/PublishDialog';
import InputsPanel from '../components/agent/InputsPanel';
import TimelineTab from '../components/timeline/TimelineTab';
import { markBehalfSeen, markDraftSeen } from '../lib/seen';

// The prototype's tabs (shared visibleTabs). "שיתוף והרשאות" and "תיק מכרז" are hidden for now (plan D9):
// suppliers are picked in the publish dialog. The conference stage has no backend.
type Tab = WorkspaceTabKey;
const NOT_BUILT_YET: readonly WorkspaceTabKey[] = ['conference'];

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
  // ?tab= opens a tab from the home list (any tab; one that hasn't joined yet falls back to the overview).
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab | null) ?? 'overview');
  const [focusField, setFocusField] = useState<{ key: string; n: number } | null>(null);
  // The draft page's canvas: jumping to a fix scrolls only it (spec §6.3).
  const canvasRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<DocViewHandle>(null);
  const [chatOpen, setChatOpen] = useState(false);
  // Text a person card asked to start the message with ("@דני ").
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set when the supervisor blocked publication — offers the audited manager override.
  // The suppliers picked in the publish dialog (published in the same call — plan G-D6).
  const [publishPick, setPublishPick] = useState<string[]>([]);
  const reports = useSupervision(id);
  const inputs = useInputs(id);
  const caseAudit = useTenderAudit(id);
  // A check this browser started (until the server reports runs itself — plan B1).
  const [agentBusy, setAgentBusy] = useState(false);
  // Approving on a participant's behalf: the row it was asked for, while the reason dialog is open.
  const [onBehalf, setOnBehalf] = useState<ApprovalRowAction | null>(null);
  const [onBehalfError, setOnBehalfError] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  // Continuing without the AI review when it was unavailable at the final check (plan G-D5).
  const [continueOpen, setContinueOpen] = useState(false);
  const [continueError, setContinueError] = useState('');

  // The server starts the agent by itself (plan B1). Until it claims the run, the agent shows as starting;
  // when that grace period ends the page re-renders, so a failed automatic run leaves "הרץ סוכן מפקח".
  const [, setGraceTick] = useState(0);
  useEffect(() => {
    if (!tender || !autoRunPending(tender, Date.now())) return;
    const since = tender.documentGeneratedAt && hasDocument(tender) ? tender.documentGeneratedAt : tender.createdAt;
    const left = Math.max(0, since + AUTO_RUN_GRACE_MS - Date.now()) + 50;
    const timer = setTimeout(() => setGraceTick((n) => n + 1), left);
    return () => clearTimeout(timer);
  }, [tender?.id, tender?.lastSupervision?.at, tender?.supervisionRun?.state, tender?.documentGeneratedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The requester opened the draft: "הטיוטה מוכנה" leaves their home list (plan A5).
  useEffect(() => {
    if (tender && user && tab === 'document' && draftStateOf(tender) !== 'doc') markDraftSeen(tender.id, user.uid);
  }, [tender?.id, tender?.documentStatus, tab, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // A participant opened the case: "אושר בשמך" leaves their home list (UX 1.1.C).
  useEffect(() => {
    if (!tender || !user) return;
    const mine = Object.values(tender.approvals ?? {}).filter((a) => a?.onBehalf && a.uid === user.uid);
    const at = Math.max(0, ...mine.map((a) => a!.at));
    if (at) markBehalfSeen(tender.id, user.uid, at);
  }, [tender?.id, tender?.approvals, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (!tender) return <div className="text-tx-soft">{denied ? t('team.notAssigned') : '404'}</div>;

  const isManager = role === 'tender_manager';
  const transitionTo = async (to: Parameters<typeof api.transitionTender>[0]['to'], supplierIds?: string[]) => {
    setBusy(true);
    setError('');
    try {
      // Left out when absent: an undefined field is sent as null, which the server rejects.
      await api.transitionTender({ tenderId: tender.id, to, ...(supplierIds ? { supplierIds } : {}) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
  const fv = findingsView(fresh ? { findings: latest.findings, basis: latest.basis ?? 'document' } : null, tender.findingDecisions);
  // The run everyone sees (plan B1); a run this browser just asked for counts until the server reports it.
  const serverRun = tender.supervisionRun;
  const serverRunning = serverRun?.state === 'running' && Date.now() - serverRun.startedAt < SUPERVISION_RUN_STALE_MS;
  const agent: AgentRunState =
    agentBusy || serverRunning || autoRunPending(tender, Date.now()) ? 'running' : fresh ? 'done' : 'none';
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
    // The lock waits for requester, legal and finance; security doesn't block (plan D2).
    approverRoles: REQUIRE_APPROVALS ? blockingApproverRoles(requiredRoles) : [],
    // The v22 flow (plan Phase G): the send, the final check and approvals cancelled by a content change.
    sent: tender.status === 'internal_review',
    sentAt: tender.sentForApproval?.at ?? null,
    finalCheck: finalCheckViewOf(tender),
    sendBlockedTitle:
      tender.status === 'draft' && ds === 'doc'
        ? sendDenialHe({
            status: tender.status,
            hasDocument: true,
            missingRoles: missingRoles(requiredRoles, tender.team),
            blockers: fv.blocking.length,
            missingDates: missingTimelineDates(tender),
          })
        : null,
    cancelled: Object.keys(tender.cancelledApprovals ?? {}) as TeamRole[],
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
  const runAgent = () => {
    setAgentBusy(true);
    setError('');
    api
      .runSupervision({ tenderId: tender.id })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAgentBusy(false));
  };

  // Jump to where a finding is incorporated (prototype jumpFix, line 2589): empty fields pulse, a field
  // pulses, a quoted text or a section flashes. Only the draft page's canvas scrolls.
  const jumpTo = (f: FindingView) => {
    if (ds === 'doc') {
      docRef.current?.jumpTo(f); // inside the document frame only
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const all = <T extends Element>(sel: string) => [...canvas.querySelectorAll<T>(sel)];
    let marks: HTMLElement[] = [];
    if (f.code === 'MISSING_INFO') marks = all<HTMLElement>('mark[data-miss]');
    if (!marks.length && f.paramKey) marks = all<HTMLElement>(`mark[data-k="${CSS.escape(f.paramKey)}"]`);
    let section: HTMLElement | undefined;
    if (!marks.length) {
      const blocks = all<HTMLElement>('p, b[data-sec]');
      const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
      const quote = f.evidence ? norm(f.evidence) : '';
      section =
        (quote ? blocks.find((el) => norm(el.textContent ?? '').includes(quote)) : undefined) ??
        blocks.find((el) => !!el.dataset.heading && f.location.includes(norm(el.dataset.heading)));
    }
    const target = marks[0] ?? section;
    if (!target) return;
    const cr = canvas.getBoundingClientRect();
    const er = target.getBoundingClientRect();
    canvas.scrollTo({
      top: Math.max(0, canvas.scrollTop + (er.top - cr.top) - canvas.clientHeight / 2 + er.height / 2),
      behavior: 'smooth',
    });
    for (const m of marks) {
      m.classList.remove('mark-pulse');
      void m.offsetWidth; // restart the animation
      m.classList.add('mark-pulse');
    }
    if (section) {
      const el = section;
      el.classList.add('sec-flash');
      setTimeout(() => el.classList.remove('sec-flash'), 2200);
    }
  };

  // "הטמע": the decision first (on the current check), then the proposed value — the rules then check again.
  const applyFindings = async (list: FindingView[], jump: boolean) => {
    const warnings = list.filter((f) => f.severity !== 'block');
    const writes = ds !== 'doc' ? list.filter((f) => f.paramKey && f.suggestion) : [];
    await run(async () => {
      if (warnings.length) {
        await api.decideFinding({ tenderId: tender.id, keys: warnings.map((f) => f.key), action: 'applied' });
      }
      if (writes.length) {
        const params: Record<string, string | number> = {};
        for (const f of writes) {
          const isNumber = template?.params.find((p) => p.key === f.paramKey)?.type === 'number';
          const plain = f.suggestion!.replace(/,/g, '');
          params[f.paramKey!] = isNumber && plain.trim() !== '' && Number.isFinite(Number(plain)) ? Number(plain) : f.suggestion!;
        }
        await api.updateTenderDraft({ tenderId: tender.id, params });
      }
    });
    if (jump && list.length === 1) {
      if (shown !== 'document') setTab('document');
      setTimeout(() => jumpTo(list[0]), 350); // once the tab and the new value are on screen
    }
  };

  const onHeader = () => {
    if (!hv) return;
    switch (hv.kind) {
      case 'run_agent':
        runAgent();
        return;
      case 'create_document':
        void run(async () => {
          await api.generateDocument({ tenderId: tender.id });
          // The server checks the new document by itself (prototype agentCreateDoc; plan B1 trigger).
          setTab('document');
        });
        return;
      case 'open_tab':
        if (hv.tab) setTab(hv.tab);
        return;
      case 'send':
        void transitionTo('internal_review'); // "שליחה לאישור" (plan G-D1)
        return;
      case 'approve':
        void setApproval(true);
        return;
      case 'continue_without_ai':
        setContinueOpen(true); // a recorded reason (plan G-D5)
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

  // The chat header's avatars, in the prototype's order: requester, procurement (the owner), legal, finance,
  // security; each person once (renderTeam, line 2240).
  const chatPeople = [holders.requester?.name, ownerName, holders.legal?.name, holders.finance?.name, holders.security?.name]
    .filter((n): n is string => !!n)
    .filter((n, i, all) => all.indexOf(n) === i)
    .map((name) => ({ name }));
  const chatDock = {
    openWith: (text: string) => {
      setChatOpen(true);
      setChatSeed((s) => ({ text, n: (s?.n ?? 0) + 1 }));
    },
  };

  return (
    <ChatDockProvider value={chatDock}>
    <div>
      <TenderHeader
        tender={tender}
        ownerName={ownerName}
        button={action}
        approvals={{
          view: av,
          busy,
          onAction: (kind) => {
            // Procurement's "בטל את האישור שלי" takes the send back (v22); the others withdraw their approval.
            if (kind === 'withdraw') void (isManager && tender.status === 'internal_review' && !wctx.myRoles.length ? transitionTo('draft') : setApproval(false));
            else if (confirm('לפתוח מחדש? ייווצר עותק חדש של המסמך לעריכה, האישורים יתאפסו והמסמך הנעול יישמר.')) {
              void run(() => api.reopenTender({ tenderId: tender.id })); // the agent then checks the new copy
            }
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
          count={publishPick.length}
          busy={busy}
          onClose={() => setPublishOpen(false)}
          onPublish={() => {
            setPublishOpen(false);
            void transitionTo('published', publishPick); // saved and published in one step (plan G-D6)
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
            onSelect={setPublishPick}
          />
        </PublishDialog>
      )}

      {continueOpen && (
        // The AI was unavailable at the final check (plan G-D5): continue with a recorded reason. New, UX to confirm.
        <OnBehalfDialog
          title="המשך לפרסום לספקים בלי בדיקת AI"
          confirmLabel="המשך בלי בדיקת AI"
          busy={busy}
          error={continueError}
          onCancel={() => setContinueOpen(false)}
          onConfirm={async (reason) => {
            setBusy(true);
            setContinueError('');
            try {
              await api.continueWithoutAiCheck({ tenderId: tender.id, reason });
              setContinueOpen(false);
            } catch (e) {
              setContinueError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
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

      {/* A "ready" case without every approval (from before approvals were required) can only be reopened. */}
      {isManager && REQUIRE_APPROVALS && tender.status === 'ready' && waiting.length > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t('ws.readyMissingApprovals', { roles: waiting.map((r) => t(`role.${r}`)).join(', ') })}
        </div>
      )}
      {error && (
        <div className="card mb-4 border-red-200 p-4 text-sm">
          <div className="text-red-600">{error}</div>
        </div>
      )}

      {shown === 'overview' && (
        <OverviewTab
          tender={tender}
          template={template}
          ds={ds}
          stageIdx={stageIdx}
          agent={agent}
          fv={fv}
          rows={av.rows}
          onTab={setTab}
          // The manager fills or changes the team until the send (the access tab is hidden — plan D9).
          teamUsers={isManager && tender.status === 'draft' ? users : undefined}
        />
      )}
      {shown === 'document' && (
        // Two columns (prototype dsplit, lines 259–266): the page, and the agent's panel beside it — sticky
        // under the tender header, one column below 1000px.
        <div className="grid items-start gap-[18px] min-[1000px]:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-4">
            {hasDocument(tender) ? (
              <>
                {isManager && tender.status === 'draft' && (
                  <div className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span className="text-tx-soft">{t('draft.regenerateHint')}</span>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(t('draft.regenerateConfirm'))) return;
                        await run(() => api.regenerateDocument({ tenderId: tender.id }));
                      }}
                    >
                      {t('draft.regenerate')}
                    </button>
                  </div>
                )}
                <DocView
                  ref={docRef}
                  tenderId={tender.id}
                  googleDocId={tender.googleDocId}
                  internal
                  locked={stageIdx >= 2}
                  {...(stageIdx === 1 && wctx.finalCheck === 'running'
                    ? { banner: FLOW_HE.bannerFinal }
                    : stageIdx === 1 && wctx.sent
                      ? { banner: FLOW_HE.bannerSent }
                      : {})}
                />
              </>
            ) : (
              <>
                <DraftPage
                  ref={canvasRef}
                  tender={tender}
                  template={template}
                  status={
                    ds === 'creating' ? (
                      'יוצר את המסמך…'
                    ) : agent === 'running' ? (
                      <>
                        <span className="typing-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        הסוכן המפקח בודק את הטיוטה…
                      </>
                    ) : agent === 'none' ? (
                      'הסוכן המפקח טרם בדק'
                    ) : fv.open.length ? (
                      `הסוכן המפקח מצא ${fv.open.length} ממצאים לבדיקתך`
                    ) : (
                      'הסוכן המפקח בדק ואין ממצאים פתוחים'
                    )
                  }
                />
                {/* Field values are typed here, under the page (plan D4). */}
                <DraftPanel
                  tender={tender}
                  template={template}
                  canManage={isManager}
                  onOpenInspector={() => setTab('agent')}
                  focusField={focusField}
                  editorOnly
                />
              </>
            )}
          </div>
          <aside
            className="min-[1000px]:sticky"
            style={{
              // 16px under the stuck header; sticky offsets count from inside the scroll area's 32px padding.
              top: 'calc(var(--tender-header-h, 0px) - 16px)',
              maxHeight: 'calc(100vh - var(--tender-header-h, 0px) - 92px)',
            }}
          >
            {/* After the send the side panel collects the team's inputs; the findings stay in the agent tab (v22). */}
            {ds === 'doc' && (tender.sentForApproval || stageIdx >= 2) ? (
              <InputsPanel
                tenderId={tender.id}
                tenderName={tender.title}
                inputs={inputs}
                audit={caseAudit}
                sentAt={tender.sentForApproval?.at ?? 0}
                onSection={(n) => docRef.current?.jumpToSection(n)}
              />
            ) : (
              <FindingsPanel
                agent={agent}
                serverStep={serverRunning ? serverRun?.step : null}
                final={wctx.finalCheck === 'running'}
                on={ds === 'doc' ? 'document' : 'draft'}
                creating={ds === 'creating'}
                view={fv}
                canManage={isManager}
                busy={busy}
                onRun={runAgent}
                onApply={(f) => void applyFindings([f], true)}
                onApplyAll={() => void applyFindings(fv.open, false)}
                onEditField={(key) => setFocusField((f) => ({ key, n: (f?.n ?? 0) + 1 }))}
                onFocus={jumpTo}
                onShowAll={() => setTab('agent')}
              />
            )}
          </aside>
        </div>
      )}
      {shown === 'timelines' && (
        <TimelineTab
          tender={tender}
          canEdit={isManager && tender.status === 'draft'}
          audit={caseAudit}
          onJump={(n) => {
            setTab('document');
            setTimeout(() => docRef.current?.jumpToSection(n), 400); // once the document tab is on screen
          }}
        />
      )}
      {shown === 'activity' && <ActivityTab tender={tender} template={template} />}
      {shown === 'versions' && <VersionsTab tender={tender} />}
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
      {shown === 'agent' && (
        <AgentReport
          tender={tender}
          template={template}
          view={fv}
          agent={agent}
          serverStep={serverRunning ? serverRun?.step : null}
          final={wctx.finalCheck === 'running'}
          on={ds === 'doc' ? 'document' : 'draft'}
          creating={ds === 'creating'}
          lastAt={fresh ? latest.at : null}
          canManage={isManager}
          busy={busy}
          onRun={runAgent}
          onApply={(f) => void applyFindings([f], true)}
          onApplyAll={() => void applyFindings(fv.warnings, false)}
          onSkip={(f) => void run(() => api.decideFinding({ tenderId: tender.id, keys: [f.key], action: 'skipped' }))}
          onEditField={(key) => {
            setTab('document');
            setFocusField((f) => ({ key, n: (f?.n ?? 0) + 1 }));
          }}
        />
      )}

      {/* Case team chat (plan D12): floats over every tab; the button shows the unread count while it is closed. */}
      {chatOpen && (
        <ChatPanel
          tenderId={tender.id}
          title={tender.title}
          number={tender.serial}
          people={chatPeople}
          messages={chat.messages}
          seed={chatSeed}
          onClose={() => setChatOpen(false)}
        />
      )}
      <button
        type="button"
        className="tdock-fab"
        onClick={() => setChatOpen((o) => !o)}
        title={t('chat.title')}
        aria-label={t('chat.title')}
        aria-expanded={chatOpen}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          <path d="M9 11h.01M12 11h.01M15 11h.01" />
        </svg>
        {!chatOpen && chat.unread > 0 && <span className="tdock-bd">{chat.unread}</span>}
      </button>
    </div>
    </ChatDockProvider>
  );
}
