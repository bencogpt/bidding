import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTenders, useCaseScores } from '../lib/hooks';
import { useAuth } from '../auth/AuthProvider';
import StatusBadge from '../components/StatusBadge';
import { GradeBadge } from '../components/ScoreCard';

export default function Dashboard() {
  const { t } = useTranslation();
  const { tenders, loading } = useTenders();
  const { role } = useAuth();
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

      <div className="card overflow-hidden">
        <div className="border-b border-paper-2 px-5 py-3 font-semibold">
          {t('dashboard.allTenders')}
        </div>
        {loading ? (
          <div className="p-6 text-tx-soft">{t('common.loading')}</div>
        ) : tenders.length === 0 ? (
          <div className="p-6 text-tx-soft">{t('dashboard.empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {tenders.map((tn) => (
                <tr key={tn.id} className="border-b border-paper-2 last:border-0 hover:bg-paper">
                  <td className="px-5 py-3">
                    <Link to={`/tenders/${tn.id}`} className="font-semibold text-teal-600">
                      {tn.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-tx-soft">{t(`type.${tn.type}`)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={tn.status} />
                  </td>
                  <td className="px-5 py-3" title={t('score.title')}>
                    {scoreOf(tn.id) ? (
                      <GradeBadge grade={scoreOf(tn.id)!.grade} total={scoreOf(tn.id)!.total} />
                    ) : (
                      <span className="text-tx-mute">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
