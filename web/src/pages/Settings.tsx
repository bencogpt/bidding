import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import InternalUsers from './InternalUsers';
import Templates from './Templates';

// Tabs of the settings screen; the permissions-per-role tab of the prototype is not built yet.
const TABS = [
  { key: 'users', label: 'users.title', Panel: InternalUsers },
  { key: 'templates', label: 'nav.templates', Panel: Templates },
];

export default function Settings() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? TABS[0].key;
  const { Panel } = TABS.find((x) => x.key === tab) ?? TABS[0];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">{t('settings.title')}</h1>
      <p className="mb-4 text-sm text-tx-soft">{t('settings.sub')}</p>
      <div className="mb-6 flex gap-1 border-b border-paper-2">
        {TABS.map((x) => (
          <button
            key={x.key}
            onClick={() => setParams({ tab: x.key }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              tab === x.key
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-tx-soft hover:text-tx'
            }`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      <Panel />
    </div>
  );
}
