import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTenders, useCaseScores } from '../lib/hooks';
import { useAuth } from '../auth/AuthProvider';
import TenderList, { isActive } from '../components/TenderList';

export default function Dashboard() {
  const { t } = useTranslation();
  const { tenders, loading } = useTenders();
  const { role } = useAuth();
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
