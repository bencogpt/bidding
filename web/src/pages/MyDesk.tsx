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
import FeedbackForm from '../components/FeedbackForm';
import { useAuth } from '../auth/AuthProvider';

// The participant-feedback card is hidden for now (the data and the form stay, turn it back on here).
const SHOW_FEEDBACK_REQUESTS = false;

/** hh:mm dd.mm.yyyy in Israel time. */
const fmtStamp = (ms: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ${p.day}.${p.month}.${p.year}`;
};

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
  const toPending = (td: TenderDoc): PendingTenderInput => {
    const ds = draftStateOf(td);
    const run = td.supervisionRun;
    const last = td.lastSupervision;
    const running = run?.state === 'running' && Date.now() - run.startedAt < SUPERVISION_RUN_STALE_MS;
    const fresh = !!last && (ds === 'doc' ? last.basis !== 'draft' : last.basis === 'draft' && last.dataHash === td.draftDataHash);
    const holders: Holders = {};
    for (const r of TEAM_ROLES) {
      const uid = td.team?.[r];
      if (uid) holders[r] = { uid, name: nameOfUid(uid) };
    }
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
      approverRoles: REQUIRE_APPROVALS ? blockingApproverRoles(td.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[td.type]) : [],
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
          name: String((r.details as Record<string, unknown> | undefined)?.service_name ?? '').trim() || r.brief,
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
      <PendingList items={pendingList} candidates={candidates} busy={assigning} onOpen={openItem} onAssign={assign} />

      {(requests.length > 0 || isManager) && (
        <div className="mb-6">
          <h2 className="mb-3 font-semibold">{isManager ? t('req.pendingTitle') : t('req.myRequests')}</h2>
          {requests.length === 0 ? (
            <div className="card p-5 text-sm text-tx-mute">{t('req.pendingEmpty')}</div>
          ) : (
            <div className="card overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper text-xs text-tx-mute">
                  <tr>
                  <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.serial')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('req.col.name')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('req.requestedBy')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('req.col.stage')}</th>
                    {!isManager && <th className="px-5 py-3" />}
                  <th className="px-5 py-3 text-start font-medium">{t('req.col.lastUpdate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr
                      key={r.serial}
                      className={
                        'border-t border-paper-2 hover:bg-paper ' +
                        (isManager ? 'cursor-pointer ' : '') +
                        (r.serial === justSent ? 'bg-emerald-50' : '')
                      }
                      // The whole row opens the request for the manager; the button at its end is only a label.
                      onClick={isManager ? () => nav(`/requests/${r.serial}`) : undefined}
                      onKeyDown={isManager ? (e) => e.key === 'Enter' && nav(`/requests/${r.serial}`) : undefined}
                      tabIndex={isManager ? 0 : undefined}
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-semibold text-tx-soft">
                        {r.serial === justSent && (
                          <span className="ml-2 rounded-full bg-emerald-600 px-2 text-[10px] leading-4 text-white">
                            {t('req.newTag')}
                          </span>
                        )}
                        <span dir="ltr">{r.serial}</span>
                      </td>
                      <td className="max-w-md truncate px-5 py-3" title={r.brief}>{String((r.details as Record<string, unknown> | undefined)?.service_name ?? '').trim() || r.brief}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-tx-soft">{r.requesterName}</td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span className="rounded-full bg-[#8a5cf0] px-3 py-0.5 text-xs font-semibold text-white">
                          {t('req.stageSpec')}
                        </span>
                      </td>
                      {!isManager && (
                        <td className="whitespace-nowrap px-5 py-3 text-end">
                          <span className="chip">
                            {r.status === 'open'
                              ? r.serial === justSent
                                ? t('req.inProcurement')
                                : t('req.statusOpen')
                              : t('req.statusConverted')}
                          </span>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-5 py-3">
                        <div className="font-medium tabular-nums">
                          <bdi>{fmtStamp(r.createdAt)}</bdi>
                        </div>
                        <div className="mt-0.5 text-xs text-tx-soft">
                          {r.requesterName} · {t('req.lastUpdateWhat')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!SHOW_FEEDBACK_REQUESTS || pending.length === 0 ? (
        requests.length === 0 && !isManager && <div className="card p-6 text-tx-soft">{t('desk.empty')}</div>
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
