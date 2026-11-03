import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
        `flex items-center justify-between rounded-[10px] px-3.5 py-2 text-sm transition ${
          isActive
            ? 'bg-accent-soft font-semibold text-accent shadow-[inset_-3px_0_0_theme(colors.accent.DEFAULT)]'
            : 'text-tx-soft hover:bg-paper hover:text-tx'
        }`
      }
    >
      {label}
      {!!badge && (
        <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-white">{badge}</span>
      )}
    </NavLink>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/s+/);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

function UserMenu() {
  const { t } = useTranslation();
  const { role, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = user?.displayName ?? user?.email ?? '';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-start transition hover:bg-white/10"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-accent text-sm font-semibold text-white ring-2 ring-white/30">
          {initials(name)}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{name}</span>
          <span className="flex items-center gap-1 text-xs text-white/70">
            {t(`role.${role as Role}`)}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-50 w-60 rounded-lg border border-paper-2 bg-surface p-2 text-tx shadow-lg"
        >
          <div className="px-3 py-2">
            <div className="text-sm font-semibold">{name}</div>
            <div className="text-xs text-tx-soft">{user?.email}</div>
          </div>
          <button
            role="menuitem"
            className="w-full rounded-[10px] px-3 py-2 text-start text-sm hover:bg-paper"
            onClick={logout}
          >
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function InternalLayout() {
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const isManager = role === 'tender_manager';
  const pendingFeedback = useMyFeedbackRequests(user?.uid);
  // The dashboard list uses the full width and height of the screen; other pages stay a centred column.
  const fullScreen = useLocation().pathname === '/all';

  return (
    <div className="flex h-full flex-col">
      <header className="relative z-30 flex h-[60px] shrink-0 items-center justify-between bg-ink-900 px-6 text-white">
        <button
          className="flex flex-col items-start leading-none"
          onClick={() => navigate('/')}
          title={t('nav.myDesk')}
        >
          <span className="font-display text-lg font-bold tracking-[2.5px]">ABS</span>
          <span className="mt-[3px] text-[10.5px] opacity-60">{t('app.title')}</span>
        </button>
        <UserMenu />
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[200px] shrink-0 border-e border-paper-2 bg-surface px-3.5 py-5">
          <nav className="space-y-0.5">
            <NavItem to="/" label={t('nav.myDesk')} badge={pendingFeedback.length} />
            <NavItem to="/all" label={t('nav.dashboard')} />
            {(isManager || role === 'requester') && <NavItem to="/requests/new" label={t('nav.newRequest')} />}
            {isManager && <NavItem to="/templates" label={t('nav.templates')} />}
            {isManager && <NavItem to="/users" label={t('nav.users')} />}
            <NavItem to="/suppliers" label={t('nav.suppliers')} />
            {isManager && <NavItem to="/reports" label={t('nav.reports')} />}
            {isManager && <NavItem to="/audit" label={t('nav.audit')} />}
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-8">
          <div className={fullScreen ? 'h-full' : 'mx-auto max-w-6xl'}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
