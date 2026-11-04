import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useBidRequests, useMyFeedbackRequests, useTenders } from '../lib/hooks';
import { REQUIRED_ROLES_BY_TYPE, REQUIRE_APPROVALS, missingApprovals } from '@obms/shared';
import FeedbackForm from '../components/FeedbackForm';
import { useAuth } from '../auth/AuthProvider';

/** dd/mm/yyyy in Israel time. */
const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);

// "השולחן שלי": what is waiting for the signed-in user, across all tenders.
export default function MyDesk() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const pending = useMyFeedbackRequests(user?.uid);
  const { requests } = useBidRequests();
  const { tenders } = useTenders();
  const isManager = role === 'tender_manager';
  // Cases in internal review that wait for a role the signed-in user holds.
  const toApprove = REQUIRE_APPROVALS
    ? tenders.filter((td) => {
        if (td.status !== 'internal_review' || !user) return false;
        const waiting = missingApprovals(td.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[td.type], td.team, td.approvals);
        return waiting.some((r) => td.team?.[r] === user.uid);
      })
    : [];
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t('nav.myDesk')}</h1>
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

      {toApprove.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-semibold">{t('desk.toApprove', { n: toApprove.length })}</h2>
          <div className="card divide-y divide-paper-2">
            {toApprove.map((td) => (
              <div key={td.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  <span className="font-semibold" dir="ltr">
                    {td.serial}
                  </span>{' '}
                  · {td.title}
                </span>
                <Link to={`/tenders/${td.id}`} className="btn btn-gold btn-sm">
                  {t('desk.reviewAndApprove')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <th className="px-5 py-3 text-start font-medium">{t('req.col.opened')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('req.col.name')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('req.requestedBy')}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr
                      key={r.serial}
                      className={'border-t border-paper-2 hover:bg-paper ' + (r.serial === justSent ? 'bg-emerald-50' : '')}
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-semibold text-tx-soft">
                        {r.serial === justSent && (
                          <span className="ml-2 rounded-full bg-emerald-600 px-2 text-[10px] leading-4 text-white">
                            {t('req.newTag')}
                          </span>
                        )}
                        <span dir="ltr">{r.serial}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-tx-mute">{fmtDate(r.createdAt)}</td>
                      <td className="max-w-md truncate px-5 py-3" title={r.brief}>{String((r.details as Record<string, unknown> | undefined)?.service_name ?? '').trim() || r.brief}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-tx-soft">{r.requesterName}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-end">
                        {isManager ? (
                          <Link to={`/requests/${r.serial}`} className="btn btn-gold btn-sm">
                            {t('req.handle')}
                          </Link>
                        ) : (
                          <span className="chip">
                            {r.status === 'open'
                              ? r.serial === justSent
                                ? t('req.inProcurement')
                                : t('req.statusOpen')
                              : t('req.statusConverted')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pending.length === 0 ? (
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
