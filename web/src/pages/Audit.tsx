import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAudit, useTenders } from '../lib/hooks';

export default function Audit() {
  const { t } = useTranslation();
  const audit = useAudit();
  const { tenders } = useTenders();
  const titleOf = new Map(tenders.map((tn) => [tn.id, tn.title]));

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold">{t('audit.title')}</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-tx-mute">
              <th className="px-4 py-2 text-start">{t('audit.actor')}</th>
              <th className="px-4 py-2 text-start">{t('audit.action')}</th>
              <th className="px-4 py-2 text-start">{t('audit.bid')}</th>
              <th className="px-4 py-2 text-start">{t('audit.when')}</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id} className="border-t border-paper-2">
                <td className="px-4 py-2">{e.actorName}</td>
                <td className="px-4 py-2">
                  <span className="chip">{e.action}</span>{' '}
                  {e.prevState && e.newState ? `${e.prevState} → ${e.newState}` : (e.newState ?? '')}
                  {e.detail ? ` · ${e.detail}` : ''}
                </td>
                <td className="px-4 py-2">
                  {e.tenderId ? (
                    <Link to={`/tenders/${e.tenderId}`} className="text-teal-600">
                      {titleOf.get(e.tenderId) ?? e.tenderId}
                    </Link>
                  ) : (
                    <span className="text-tx-mute">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-tx-soft" dir="ltr">
                  {new Date(e.at).toLocaleString('he-IL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
