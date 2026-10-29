import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useSupplierTenders } from '../lib/hooks';
import StatusBadge from '../components/StatusBadge';

export default function SupplierPortal() {
  const { t } = useTranslation();
  const { supplierId } = useAuth();
  const { tenders, loading, error } = useSupplierTenders(supplierId);

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl font-bold">{t('supplier.myTenders')}</h1>
      <div className="mb-6 rounded border border-teal-soft bg-teal-soft/30 p-3 text-sm text-teal-600">
        🔒 {t('supplier.isolation')}
      </div>

      {loading ? (
        <div className="text-tx-soft">{t('common.loading')}</div>
      ) : error ? (
        <div className="card p-6 text-sm text-red-600">{t('supplier.loadError')}</div>
      ) : tenders.length === 0 ? (
        <div className="card p-6 text-tx-soft">{t('supplier.empty')}</div>
      ) : (
        <div className="space-y-3">
          {tenders.map((tn) => (
            <div key={tn.id} className="card flex items-center justify-between p-5">
              <div>
                <div className="font-semibold">{tn.title}</div>
                {tn.serial && <div className="text-xs text-tx-mute" dir="ltr">{tn.serial}</div>}
                <div className="mt-1 flex items-center gap-2">
                  <span className="chip">{t(`type.${tn.type}`)}</span>
                  <StatusBadge status={tn.status} />
                </div>
              </div>
              <Link to={`/portal/${tn.id}`} className="btn btn-gold">
                {t('supplier.viewDoc')}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
