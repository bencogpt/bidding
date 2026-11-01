import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TENDER_STATUSES } from '@obms/shared';
import type { TenderDoc } from '@obms/shared';
import { STAGE_COLOR } from '../lib/stages';
import Avatar from './Avatar';
import { VerdictBadge } from './SupervisorPanel';

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
  children,
}: {
  tender: TenderDoc;
  ownerName?: string;
  action?: HeaderAction;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const current = TENDER_STATUSES.indexOf(tender.status);

  return (
    <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-paper-2 bg-paper px-8 pt-5">
      <div className="card flex items-start gap-3 px-5 py-4">
        <Link
          to="/"
          title={t('ws.backToAll')}
          className="grid h-8 w-8 shrink-0 place-items-center rounded border border-paper-2 text-tx-soft hover:border-tx-mute hover:text-tx"
        >
          →
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold">{tender.title}</h1>
            {tender.serial && (
              <span className="text-sm font-semibold text-teal-600" dir="ltr">
                {tender.serial}
              </span>
            )}
            <span className="h-4 w-px bg-paper-2" />
            <span className="chip">{t(`type.${tender.type}`)}</span>
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
        {action && (
          <button
            className="btn btn-primary shrink-0"
            disabled={action.disabled || action.busy}
            title={action.title}
            onClick={action.onClick}
          >
            {action.label} ←
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
