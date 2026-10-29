import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useTenders, useCaseScores, useMyFeedbackRequests } from '../lib/hooks';
import FeedbackForm from '../components/FeedbackForm';
import { useAuth } from '../auth/AuthProvider';
import StatusBadge from '../components/StatusBadge';
import { GradeBadge } from '../components/ScoreCard';

export default function Dashboard() {
  const { t } = useTranslation();
  const { tenders, loading } = useTenders();
  const { role, user } = useAuth();
  const pending = useMyFeedbackRequests(user?.uid);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const isManager = role === 'tender_manager';
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? tenders.filter((tn) => `${tn.serial ?? ''} ${tn.title}`.toLowerCase().includes(needle))
    : tenders;
  const scores = useCaseScores();
  const scoreOf = (id: string) => scores.find((s) => s.tenderId === id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t('dashboard.title')}</h1>
        {role === 'tender_manager' && (
          <Link to="/tenders/new" className="btn btn-gold">
            + {t('nav.newTender')}
          </Link>
        )}
      </div>

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
                  <button className="btn btn-sm" onClick={() => setOpen(open === r.id ? null : r.id)}>
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

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-2 px-5 py-3">
          <span className="font-semibold">{isManager ? t('dashboard.allTenders') : t('dashboard.myTenders')}</span>
          <input
            className="input w-64"
            placeholder={t('dashboard.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="p-6 text-tx-soft">{t('common.loading')}</div>
        ) : tenders.length === 0 ? (
          <div className="p-6 text-tx-soft">{t('dashboard.empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {shown.map((tn) => (
                <tr key={tn.id} className="border-b border-paper-2 last:border-0 hover:bg-paper">
                  <td className="whitespace-nowrap px-5 py-3 text-tx-soft" dir="ltr">
                    {tn.serial ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <Link to={`/tenders/${tn.id}`} className="font-semibold text-teal-600">
                      {tn.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-tx-soft">{t(`type.${tn.type}`)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={tn.status} />
                  </td>
                  {isManager && (
                    <td className="px-5 py-3" title={t('score.title')}>
                      {scoreOf(tn.id) ? (
                        <GradeBadge grade={scoreOf(tn.id)!.grade} total={scoreOf(tn.id)!.total} />
                      ) : (
                        <span className="text-tx-mute">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
