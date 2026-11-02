import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useBidRequests, useMyFeedbackRequests } from '../lib/hooks';
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
  const isManager = role === 'tender_manager';
  const [open, setOpen] = useState<string | null>(null);

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

      {(requests.length > 0 || isManager) && (
        <div className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold">{isManager ? t('req.pendingTitle') : t('req.myRequests')}</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-tx-mute">{t('req.pendingEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.serial} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{r.serial}</span>
                  <span className="text-tx-mute">{fmtDate(r.createdAt)}</span>
                  <span className="flex-1 truncate text-tx-soft">{r.brief}</span>
                  <span className="text-tx-mute">{r.requesterName}</span>
                  {isManager ? (
                    <Link to={`/requests/${r.serial}`} className="btn btn-gold">
                      {t('req.handle')}
                    </Link>
                  ) : (
                    <span className="chip">{r.status === 'open' ? t('req.statusOpen') : t('req.statusConverted')}</span>
                  )}
                </li>
              ))}
            </ul>
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
