import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useBidRequests, useMyFeedbackRequests, useTenders, useUsers } from '../lib/hooks';
import {
  REQUIRED_ROLES_BY_TYPE,
  REQUIRE_APPROVALS,
  SUPERVISION_RUN_STALE_MS,
  autoRunPending,
  TEAM_ROLES,
  blockingApproverRoles,
  draftStateOf,
  isUnitRole,
  pendingItems,
  stageIndexOf,
  progressPct,
  isApproved,
  QUARTET_ROLES,
  upcomingMilestones,
  type Milestone,
  type Approvals,
  type Holders,
  type PendingItem,
  type PendingTenderInput,
  type TenderDoc,
  type UnitQueueItem,
  type UnitRole,
} from '@obms/shared';
import { api } from '../lib/api';
import { isDraftSeen } from '../lib/seen';
import PendingList from '../components/home/PendingList';
import UpcomingPanel from '../components/home/UpcomingPanel';
import HomeTenders, { type HomeRow } from '../components/home/HomeTenders';
import FeedbackForm from '../components/FeedbackForm';
import { useAuth } from '../auth/AuthProvider';

// The participant-feedback card is hidden for now (the data and the form stay, turn it back on here).
const SHOW_FEEDBACK_REQUESTS = false;

// "השולחן שלי": what is waiting for the signed-in user, across all tenders.
export default function MyDesk() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const pending = useMyFeedbackRequests(user?.uid);
  const { requests } = useBidRequests();
  const { tenders } = useTenders();
  const isManager = role === 'tender_manager';
  const firstName = (user?.displayName ?? '').trim().split(/\s+/)[0];
  const [open, setOpen] = useState<string | null>(null);
  // Right after "שלח לרכש" the create page brings us here: a green notice and the new request marked for a few seconds.
  const location = useLocation();
  const nav = useNavigate();
  const [justSent, setJustSent] = useState<string | null>(
    (location.state as { sentSerial?: string } | null)?.sentSerial ?? null,
  );
  const toast = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!justSent) return;
    nav(location.pathname, { replace: true, state: null }); // a refresh must not show the notice again
    window.scrollTo({ top: 0 });
    toast.current?.scrollIntoView({ block: 'start' });
    const timer = setTimeout(() => setJustSent(null), 9000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSent === null]);

  const users = useUsers();
  // A unit's cases waiting for its contact (plan D3) — legal, finance and security users.
  const [queue, setQueue] = useState<UnitQueueItem[]>([]);
  const [queueTick, setQueueTick] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [deskError, setDeskError] = useState('');
  useEffect(() => {
    if (!isUnitRole(role ?? undefined)) return;
    let alive = true;
    api
      .unitQueue({})
      .then((r) => alive && setQueue(r.items))
      .catch(() => alive && setQueue([]));
    return () => {
      alive = false;
    };
  }, [role, queueTick]);

  // "לטיפולך": what waits for the signed-in user, from the shared rules (plan A5, E1).
  const nameOfUid = (uid: string) => users.find((u) => u.uid === uid)?.displayName ?? '';
  const holdersOf = (td: TenderDoc): Holders => {
    const holders: Holders = {};
    for (const r of TEAM_ROLES) {
      const uid = td.team?.[r];
      if (uid) holders[r] = { uid, name: nameOfUid(uid) };
    }
    return holders;
  };
  const approverRolesOf = (td: TenderDoc) =>
    REQUIRE_APPROVALS ? blockingApproverRoles(td.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[td.type]) : [];
  const requestName = (r: (typeof requests)[number]) =>
    String((r.details as Record<string, unknown> | undefined)?.service_name ?? '').trim() || r.brief;
  const toPending = (td: TenderDoc): PendingTenderInput => {
    const ds = draftStateOf(td);
    const run = td.supervisionRun;
    const last = td.lastSupervision;
    const running = run?.state === 'running' && Date.now() - run.startedAt < SUPERVISION_RUN_STALE_MS;
    const fresh = !!last && (ds === 'doc' ? last.basis !== 'draft' : last.basis === 'draft' && last.dataHash === td.draftDataHash);
    const holders = holdersOf(td);
    return {
      id: td.id,
      ref: td.serial ?? td.id,
      name: td.title,
      ownerUid: td.ownerUid,
      stageIdx: stageIndexOf(td.status),
      ds,
      agent: running || autoRunPending(td, Date.now()) ? 'running' : fresh ? 'done' : 'none',
      blockingCount: fresh && last ? last.blockers : 0,
      holders,
      approvals: (td.approvals ?? {}) as Approvals,
      approverRoles: approverRolesOf(td),
      approvedByName: nameOfUid(td.ownerUid),
      approvedAt: td.createdAt,
      draftSeen: user ? isDraftSeen(td.id, user.uid) : false,
    };
  };
  const pendingList = user
    ? pendingItems({
        uid: user.uid,
        isManager,
        ...(isUnitRole(role ?? undefined) ? { unitRole: role as UnitRole } : {}),
        requests: requests.map((r) => ({
          serial: r.serial,
          ref: r.serial,
          name: requestName(r),
          status: r.status,
          requesterUid: r.requesterUid,
          sentByName: r.requesterName,
          sentAt: r.createdAt,
        })),
        tenders: tenders.map(toPending),
        unassigned: queue.map((q) => ({
          id: q.tenderId,
          ref: q.ref,
          name: q.name,
          ownerUid: '',
          stageIdx: 1,
          ds: 'draft',
          agent: 'none',
          blockingCount: 0,
          holders: {},
          approvals: {},
          approvedByName: q.ownerName,
          approvedAt: q.createdAt,
        })),
      })
    : [];
  const candidates = Object.fromEntries(queue.map((q) => [q.tenderId, q.candidates]));
  const openItem = (item: PendingItem) => {
    if (item.target.kind === 'tender') nav(`/tenders/${item.target.id}?tab=${item.target.tab}`);
    else if (item.target.kind === 'request') nav(isManager ? `/requests/${item.target.serial}` : '/all');
  };
  // "מועדים קרובים" (plan E2): the next stage of each active case, its date and who it waits for.
  const milestones = upcomingMilestones(
    [
      ...requests
        .filter((r) => r.status === 'open')
        .map((r) => ({ id: r.serial, ref: r.serial, name: requestName(r), kind: 'request' as const, stageIdx: 0 })),
      ...tenders.map((td) => ({
        id: td.id,
        ref: td.serial ?? td.id,
        name: td.title,
        kind: 'tender' as const,
        stageIdx: stageIndexOf(td.status),
        holders: holdersOf(td),
        approvals: (td.approvals ?? {}) as Approvals,
        approverRoles: approverRolesOf(td),
        submissionDeadline: td.submissionDeadline,
      })),
    ],
    Date.now(),
  );
  const openMilestone = (m: Milestone) => {
    if (m.kind === 'tender') nav(`/tenders/${m.id}?tab=${m.tab}`);
    else nav(isManager ? `/requests/${m.id}` : '/all');
  };
  // "הבל"מים שלי" (plan E2): the requests still at אפיון, then the cases. The bar is the quartet's approval of
  // the document, as in the workspace header; a request has only the requester's (it was sent) and procurement's.
  const homeRows: HomeRow[] = [
    ...requests
      .filter((r) => r.status === 'open')
      .map(
        (r): HomeRow => ({
          key: `r-${r.serial}`,
          kind: 'request',
          id: r.serial,
          ref: r.serial,
          name: requestName(r),
          stageIdx: 0,
          isNew: r.serial === justSent,
          updatedAt: r.createdAt,
          lastWhat: `${r.requesterName} · ${t('req.lastUpdateWhat')}`,
          segments: [
            { role: 'requester', approved: true },
            { role: 'manager', approved: false },
          ],
          pct: progressPct(0, 'draft'),
        }),
      ),
    ...tenders.map((td): HomeRow => {
      const stageIdx = stageIndexOf(td.status);
      const holders = holdersOf(td);
      const approvals = (td.approvals ?? {}) as Approvals;
      return {
        key: `t-${td.id}`,
        kind: 'tender',
        id: td.id,
        ref: td.serial ?? td.id,
        name: td.title,
        stageIdx,
        type: td.type,
        ownerName: nameOfUid(td.ownerUid) || undefined,
        updatedAt: td.updatedAt,
        segments: QUARTET_ROLES.map((role) => ({
          role,
          approved: role === 'manager' ? stageIdx >= 2 : isApproved(holders, approvals, role),
        })),
        pct: progressPct(stageIdx, draftStateOf(td)),
      };
    }),
  ];
  const openRow = (r: HomeRow) => {
    if (r.kind === 'tender') nav(`/tenders/${r.id}`);
    else nav(isManager ? `/requests/${r.id}` : '/all');
  };
  const assign = async (item: PendingItem, uid: string) => {
    if (item.target.kind !== 'assign') return;
    setAssigning(true);
    setDeskError('');
    try {
      await api.claimTeamSlot({ tenderId: item.target.tenderId, role: item.target.role as UnitRole, uid });
      setQueueTick((n) => n + 1);
    } catch (e) {
      setDeskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">
          {t('desk.hello')}
          {firstName && <> <span className="text-accent">{firstName}</span></>}
        </h1>
        {(isManager || role === 'requester') && (
          <Link to="/requests/new" className="btn btn-gold">
            + {t('nav.newTender')}
          </Link>
        )}
      </div>

      {justSent && (
        <div
          ref={toast}
          className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-900"
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-600 text-white">✓</span>
          <div>
            <div className="font-semibold">
              {t('req.sentToast')} <bdi>{justSent}</bdi>
            </div>
            <p className="mt-1 text-sm">{t('req.sentToastSub')}</p>
          </div>
        </div>
      )}

      {deskError && <div className="mb-3 text-sm text-red-600">{deskError}</div>}
      <div className="home-grid">
        <PendingList items={pendingList} candidates={candidates} busy={assigning} onOpen={openItem} onAssign={assign} />
        <UpcomingPanel items={milestones} onOpen={openMilestone} />
      </div>

      <HomeTenders rows={homeRows} layout={isManager ? 'table' : 'cards'} onOpen={openRow} />

      {!SHOW_FEEDBACK_REQUESTS || pending.length === 0 ? (
        null
      ) : (
        <div className="card p-5">
          <h2 className="mb-1 font-semibold">{t('fb.waitingTitle', { count: pending.length })}</h2>
          <p className="mb-3 text-xs text-tx-mute">{t('fb.waitingHint')}</p>
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded border border-paper-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Link to={`/tenders/${r.tenderId}`} className="font-semibold text-teal-600">
                      {r.tenderTitle}
                    </Link>
                    {r.tenderSerial && (
                      <span className="text-xs text-tx-mute" dir="ltr">
                        {r.tenderSerial}
                      </span>
                    )}
                    <span className="chip">{t(`fb.round.${r.round}`)}</span>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    {open === r.id ? t('common.close') : t('fb.give')}
                  </button>
                </div>
                {open === r.id && (
                  <div className="mt-3">
                    <FeedbackForm request={r} onDone={() => setOpen(null)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
