import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';

// Shown when someone authenticated (e.g. via Google) but is not a registered user (no role).
export default function Unauthorized() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <div className="grid h-full place-items-center bg-ink-900 p-4">
      <div className="card max-w-sm p-7 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="mb-2 font-display text-xl font-bold">{t('unauth.title')}</h1>
        <p className="mb-1 text-sm text-tx-soft">{t('unauth.body')}</p>
        <p className="mb-5 text-xs text-tx-mute" dir="ltr">
          {user?.email}
        </p>
        <button className="btn btn-gold w-full justify-center" onClick={logout}>
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );
}
