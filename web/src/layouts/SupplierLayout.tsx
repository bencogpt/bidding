import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';

export default function SupplierLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <div className="min-h-full bg-paper">
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <div className="font-display font-semibold text-gold">{t('supplier.title')}</div>
            <div className="text-xs text-white/50">OBMS</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.displayName ?? user?.email}</span>
            <button className="btn bg-transparent text-white" onClick={logout}>
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
