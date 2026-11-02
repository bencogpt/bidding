import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import type { Role } from '@obms/shared';
import { useMyFeedbackRequests } from '../lib/hooks';

function NavItem({ to, label, badge }: { to: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `block rounded px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-gold/20 text-gold-soft' : 'text-ink-700/70 text-white/70 hover:bg-white/5'
        }`
      }
    >
      {label}
      {!!badge && (
        <span className="mr-2 rounded-full bg-gold px-1.5 text-xs font-bold text-ink-900">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export default function InternalLayout() {
  const { t } = useTranslation();
  const { role, user, logout } = useAuth();
  const isManager = role === 'tender_manager';
  const pendingFeedback = useMyFeedbackRequests(user?.uid);
  // The dashboard list uses the full width and height of the screen; other pages stay a centred column.
  const fullScreen = useLocation().pathname === '/all';

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col bg-ink-900 p-4 text-white">
        <div className="mb-6 px-2">
          <div className="font-display text-lg font-bold text-gold">{t('app.title')}</div>
          <div className="text-xs text-white/50">{t('app.subtitle')}</div>
        </div>
        <nav className="flex-1 space-y-1">
          <NavItem to="/" label={t('nav.myDesk')} badge={pendingFeedback.length} />
          <NavItem to="/all" label={t('nav.dashboard')} />
          {isManager && <NavItem to="/tenders/new" label={t('nav.newTender')} />}
          {isManager && <NavItem to="/templates" label={t('nav.templates')} />}
          {isManager && <NavItem to="/users" label={t('nav.users')} />}
          <NavItem to="/suppliers" label={t('nav.suppliers')} />
          {isManager && <NavItem to="/reports" label={t('nav.reports')} />}
          {isManager && <NavItem to="/audit" label={t('nav.audit')} />}
        </nav>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="px-2 text-sm font-semibold">{user?.displayName ?? user?.email}</div>
          <div className="px-2 text-xs text-gold-soft">{t(`role.${role as Role}`)}</div>
          <button
            className="btn mt-3 w-full justify-center bg-transparent text-white"
            onClick={logout}
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <div className={fullScreen ? 'h-full' : 'mx-auto max-w-6xl'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
