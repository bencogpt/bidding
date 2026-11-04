import { useTranslation } from 'react-i18next';
import { TENDER_STATUSES } from '@obms/shared';
import type { TenderDoc } from '@obms/shared';
import type { HeaderButton as HeaderAction } from './TenderHeader';

// The overview's "next action": the step the header button performs, a shortcut to the document,
// and how far the case is along its stages.
export default function NextActionCard({
  tender,
  action,
  onOpenDocument,
}: {
  tender: TenderDoc;
  action?: HeaderAction;
  onOpenDocument: () => void;
}) {
  const { t } = useTranslation();
  const progress = Math.round(
    (TENDER_STATUSES.indexOf(tender.status) / (TENDER_STATUSES.length - 1)) * 100,
  );
  const circumference = 2 * Math.PI * 7;

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="text-xs font-semibold text-tx-mute">{t('overview.nextAction')}</div>
      <div className="font-display text-xl font-semibold">
        {action?.label ?? t('overview.noNextAction')}
      </div>
      <div>
        <button
          className="btn border-accent bg-accent px-5 text-white hover:border-accent-hover hover:bg-accent-hover"
          onClick={onOpenDocument}
        >
          {t('overview.openEditor')}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-tx-soft">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="7" fill="none" strokeWidth="2" className="stroke-paper-2" />
          <circle
            cx="9"
            cy="9"
            r="7"
            fill="none"
            strokeWidth="2"
            className="stroke-accent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress / 100)}
            transform="rotate(-90 9 9)"
          />
        </svg>
        {t('overview.progress', { pct: progress })}
      </div>
    </div>
  );
}
