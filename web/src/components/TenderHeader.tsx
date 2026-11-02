import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TENDER_STATUSES } from '@obms/shared';
import type { TenderDoc } from '@obms/shared';
import { STAGE_COLOR } from '../lib/stages';
import Avatar from './Avatar';
import { VerdictBadge } from './SupervisorPanel';

// Sign-offs of the case team: one slot per required role, true once that role approved.
export type HeaderApprovals = { slots: boolean[] };

export type HeaderAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  busy?: boolean;
};

// The tender header: identity (back, name, number, type, manager) with the next action, and a thin
// stage strip. It stays on top while the tender's tabs (passed as children) scroll underneath.
export default function TenderHeader({
  tender,
  ownerName,
  action,
  approvals,
  children,
}: {
  tender: TenderDoc;
  ownerName?: string;
  action?: HeaderAction;
  approvals?: HeaderApprovals;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const current = TENDER_STATUSES.indexOf(tender.status);

  return (
    <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-paper-2 bg-paper px-8 pt-5">
      <div className="card flex items-center gap-3 px-5 py-4">
        <Link
          to="/"
          title={t('ws.backToAll')}
          className="grid h-8 w-8 shrink-0 self-start place-items-center rounded border border-paper-2 text-tx-soft hover:border-tx-mute hover:text-tx"
        >
          →
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[26px] font-semibold leading-8">{tender.title}</h1>
            {tender.serial && (
              <span className="text-sm font-semibold tabular-nums text-accent" dir="ltr">
                {tender.serial}
              </span>
            )}
            <span className="h-4 w-px bg-paper-2" />
            <span className="flex items-center gap-1.5 text-sm text-tx-soft">
              {t(`type.${tender.type}`)}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
            {tender.lastSupervision && <VerdictBadge verdict={tender.lastSupervision.verdict} />}
          </div>
          {ownerName && (
            <div
              className="mt-1 flex items-center gap-2 text-sm text-tx-soft"
              title={t('quartet.manager')}
            >
              <Avatar name={ownerName} />
              <b className="font-semibold text-tx">{ownerName}</b>
            </div>
          )}
        </div>
        <div className="flex-1" />
        {approvals && approvals.slots.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 text-sm text-tx-soft" title={t('header.approvalsHint')}>
            <span>{t('header.approvals')}</span>
            <b className="tabular-nums text-tx">
              {approvals.slots.filter(Boolean).length}/{approvals.slots.length}
            </b>
            <span className="flex gap-1">
              {approvals.slots.map((done, i) => (
                <i key={i} className={`h-2 w-5 rounded-sm ${done ? 'bg-green-600' : 'bg-paper-2'}`} />
              ))}
            </span>
          </div>
        )}
        {action && (
          <button
            className="btn shrink-0 border-accent bg-accent px-5 text-white hover:border-accent-hover hover:bg-accent-hover"
            disabled={action.disabled || action.busy}
            title={action.title}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>

      <div className="card mt-3 px-5 pb-2 pt-4">
        <div className="flex gap-1.5">
          {TENDER_STATUSES.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <div key={s} className="flex-1" aria-current={now ? 'step' : undefined}>
                <i
                  className="mb-2 block h-1 rounded-sm bg-paper-2"
                  style={
                    done || now ? { background: STAGE_COLOR[s], opacity: now ? 1 : 0.9 } : undefined
                  }
                />
                <span
                  className={`whitespace-nowrap text-xs ${done ? 'text-tx' : 'text-tx-mute'} ${
                    now ? 'font-semibold' : ''
                  }`}
                  style={now ? { color: STAGE_COLOR[s] } : undefined}
                >
                  {t(`status.${s}`)}
                  {now && (
                    <em className="ms-1.5 text-[11px] font-normal not-italic text-tx-mute">
                      {t('ws.now')}
                    </em>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
