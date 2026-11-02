import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useTenders, useCaseScores, useMyFeedbackRequests, useBidRequests } from '../lib/hooks';
import FeedbackForm from '../components/FeedbackForm';
import { useAuth } from '../auth/AuthProvider';
import TenderList, { isActive } from '../components/TenderList';

export default function Dashboard() {
  const { t } = useTranslation();
  const { tenders, loading } = useTenders();
  const { role, user } = useAuth();
  const pending = useMyFeedbackRequests(user?.uid);
  const { requests } = useBidRequests();
  const [open, setOpen] = useState<string | null>(null);
  const isManager = role === 'tender_manager';
  const scores = useCaseScores();
  const scoreOf = (id: string) => scores.find((s) => s.tenderId === id);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {isManager ? t('dashboard.allTenders') : t('dashboard.myTenders')}
          </h1>
          <div className="text-sm text-tx-soft">
            {t('dashboard.count', {
              count: tenders.length,
              active: tenders.filter((tn) => isActive(tn.status)).length,
            })}
          </div>
        </div>
        {(role === 'tender_manager' || role === 'requester') && (
          <Link to="/requests/new" className="btn btn-gold">
            + {t('nav.newRequest')}
          </Link>
        )}
      </div>

      {requests.length > 0 || role === 'tender_manager' ? (
        <div className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold">{role === 'tender_manager' ? t('req.pendingTitle') : t('req.myRequests')}</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-tx-mute">{t('req.pendingEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.serial} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{r.serial}</span>
                  <span className="flex-1 truncate text-tx-soft">{r.brief}</span>
                  <span className="text-tx-mute">{r.requesterName}</span>
                  {role === 'tender_manager' ? (
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
      ) : null}

      {pending.length > 0 && (
        <div className="card mb-6 p-5">
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

      {loading ? (
        <div className="card p-6 text-tx-soft">{t('common.loading')}</div>
      ) : tenders.length === 0 ? (
        <div className="card p-6 text-tx-soft">{t('dashboard.empty')}</div>
      ) : (
        <TenderList
          tenders={tenders}
          scoreOf={scoreOf}
          showScore={isManager}
          defaultActiveOnly={isManager}
        />
      )}
    </div>
  );
}
