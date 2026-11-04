import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ApprovalRowAction,
  ApprovalsView,
  StageBarItem,
  StagePopover,
  TenderDoc,
} from '@obms/shared';
import Avatar from './Avatar';
import HeaderTip from './agent/HeaderTip';
import { ApprovalTag } from './agent/Chips';

/** The header's main button, from the shared headerAction() plus what clicking it does. */
export type HeaderButton = {
  label: string;
  enabled: boolean;
  title?: string;
  tip?: string;
  busy?: boolean;
  onClick?: () => void;
};

export type HeaderApprovals = {
  view: ApprovalsView;
  busy?: boolean;
  onAction: (kind: 'withdraw' | 'reopen') => void;
  onRowAction: (action: ApprovalRowAction) => void;
};

export type HeaderStages = {
  items: StageBarItem[];
  note: string | null;
  popover: (item: StageBarItem) => StagePopover;
};

/**
 * The tender header (prototype HTML lines 1583–1597, CSS 43–86, 552–579): back, name, number and type, the
 * owner; on the far left the approvals indicator and the one filled button; under it the stage bar, then the
 * tabs (children). It stays on top while the tab below scrolls.
 */
export default function TenderHeader({
  tender,
  ownerName,
  button,
  approvals,
  stages,
  children,
}: {
  tender: TenderDoc;
  ownerName?: string;
  button?: HeaderButton | null;
  approvals?: HeaderApprovals | null;
  stages: HeaderStages;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 px-8 pt-4"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="border px-[18px] pb-3 pt-3.5" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
        <div className="flex items-start gap-3.5">
          <Link
            to="/all"
            title={t('ws.backToAll')}
            className="grid h-[30px] w-[30px] flex-none place-items-center border text-base"
            style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--muted)' }}
          >
            →
          </Link>
          <div className="min-w-0">
            <h1 className="m-0 flex h-[30px] items-center gap-2.5 text-[22px] font-semibold leading-[30px]">
              <span className="truncate">{tender.title}</span>
              {tender.serial && (
                <span
                  className="text-sm font-semibold tabular-nums tracking-[.3px]"
                  style={{ color: 'var(--accent)' }}
                  dir="ltr"
                >
                  {tender.serial}
                </span>
              )}
              <i className="inline-block h-4 w-px" style={{ background: 'var(--line)' }} />
              <TypeLabel type={tender.type} label={t(`type.${tender.type}`)} />
            </h1>
            {ownerName && (
              <div className="mt-[5px] flex items-center gap-3 text-[13px]" style={{ color: 'var(--muted)' }}>
                <span className="inline-flex items-center gap-[7px]" title="איש רכש">
                  <Avatar name={ownerName} />
                  <b className="font-semibold" style={{ color: 'var(--text)' }}>
                    {ownerName}
                  </b>
                </span>
              </div>
            )}
          </div>
          <div className="flex-1" />
          {approvals?.view.visible && <ApprovalsIndicator {...approvals} />}
          {button && (
            <HeaderTip tip={button.enabled ? button.tip : undefined}>
              {(describedBy) => (
                <button
                  type="button"
                  className="btn btn-primary self-start disabled:!opacity-50"
                  disabled={!button.enabled || button.busy}
                  title={button.title}
                  aria-describedby={describedBy}
                  onClick={button.onClick}
                >
                  {button.label}
                </button>
              )}
            </HeaderTip>
          )}
        </div>
      </div>

      <div className="mt-2.5 border px-[18px] pb-2.5 pt-3.5" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
        <StageStrip {...stages} />
      </div>

      {children}
    </div>
  );
}

/** Icons per tender type (prototype TYPE_ICON, line 1761): service = people, goods = box, project = flag. */
const TYPE_ICON: Record<TenderDoc['type'], ReactNode> = {
  service: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <path d="M2 13c0-2.5 1.8-4 4-4s4 1.5 4 4" />
      <circle cx="11.5" cy="6.5" r="1.7" />
      <path d="M11 9.2c1.8 0 3 1.2 3 3.3" />
    </>
  ),
  goods: (
    <>
      <path d="M2 5l6-3 6 3v6l-6 3-6-3z" />
      <path d="M2 5l6 3 6-3M8 8v6" />
    </>
  ),
  project: <path d="M3 14V2M3 3h8l-1.5 3L11 9H3" />,
};

/** The tender type as plain text with a small icon (a type is an attribute, not a state). */
function TypeLabel({ type, label }: { type: TenderDoc['type']; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-normal" style={{ color: 'var(--muted)' }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {TYPE_ICON[type]}
      </svg>
      {label}
    </span>
  );
}

/** "אישורים N/4" with four segments; hover or keyboard focus opens the card (prototype renderApr). */
function ApprovalsIndicator({ view, busy, onAction, onRowAction }: HeaderApprovals) {
  return (
    <div className="flex h-[30px] items-center self-start">
      <div className="group relative flex h-[30px] items-center gap-2 px-1 outline-none" tabIndex={0}>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex gap-[3px]">
            {view.segments.map((s) => (
              <i
                key={s.role}
                className="block h-2 w-[18px] rounded-[2px]"
                style={{ background: s.approved ? 'var(--ok)' : 'rgba(128,128,150,.3)' }}
              />
            ))}
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {view.count}/{view.total}
          </span>
        </span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          אישורים
        </span>

        <div
          className="absolute end-0 top-[calc(100%+8px)] z-[60] hidden w-[300px] cursor-default border px-4 py-3.5 font-normal group-focus-within:block group-hover:block"
          style={{ background: 'var(--panel)', color: 'var(--text)', borderColor: 'var(--line)', boxShadow: '0 14px 36px rgba(0,0,0,.2)' }}
        >
          {/* bridge, so the card stays open on the way from the indicator */}
          <span className="absolute inset-x-0 -top-2.5 h-2.5" aria-hidden="true" />
          <div className="mb-1.5 text-[13px] font-semibold">{view.title}</div>
          {view.rows.map((r) => (
            <div
              key={r.role}
              className="flex items-center justify-between gap-2.5 py-[7px]"
              style={{ borderBottom: '1px solid var(--line-soft)' }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={r.name ?? r.roleHe} />
                <span className="flex flex-col leading-[1.3]">
                  <b className="text-[13px] font-semibold">{r.name ?? '—'}</b>
                  <small className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    {r.roleHe}
                    {r.nonBlocking ? ' · לא חוסם' : ''}
                  </small>
                  {r.action && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm mt-0.5 self-start !px-0 !py-0 !text-[11px]"
                      disabled={!r.action.enabled || busy}
                      title={r.action.title}
                      onClick={() => onRowAction(r.action!)}
                    >
                      {r.action.label}
                    </button>
                  )}
                </span>
              </span>
              <ApprovalTag tag={r.tag} title={r.tagTitle}>
                {r.tagLabel}
              </ApprovalTag>
            </div>
          ))}
          {view.note && (
            <div className="mt-2 text-xs leading-normal" style={{ color: 'var(--muted)' }}>
              {view.note}
            </div>
          )}
          {view.actions.length > 0 && (
            <div className="mt-3 space-y-2">
              {view.actions.map((a) => (
                <button key={a.kind} type="button" className="btn w-full !px-3.5 !py-[9px]" disabled={busy} onClick={() => onAction(a.kind)}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The stage bar (prototype stageBar, line 2289; CSS 76–83): thin segments with the label underneath. Done =
 * coloured, current = coloured from the start with "כרגע", upcoming = grey. Hovering a stage shows who
 * approves at that stage.
 */
function StageStrip({ items, note, popover }: HeaderStages) {
  return (
    <div className="flex items-center">
      <div className="flex flex-1 gap-1.5">
        {items.map((s) => {
          const pop = popover(s);
          const bar =
            s.state === 'done'
              ? s.color
              : s.state === 'current'
                ? `linear-gradient(to left, ${s.color} 55%, var(--line) 55%)`
                : 'var(--line)';
          return (
            <div
              key={s.idx}
              className="group relative flex-1 cursor-default pb-0.5"
              style={{ '--sc': s.color } as CSSProperties}
              aria-current={s.state === 'current' ? 'step' : undefined}
            >
              <i className="mb-2 block h-1" style={{ background: bar }} />
              <span
                className="whitespace-nowrap text-xs"
                style={{
                  color: s.state === 'done' ? 'var(--text)' : s.state === 'current' ? s.color : 'var(--muted)',
                  fontWeight: s.state === 'current' ? 600 : 400,
                }}
              >
                {s.label}
                {s.state === 'current' && (
                  <em className="ms-1.5 text-[11px] font-normal not-italic" style={{ color: 'var(--muted)' }}>
                    כרגע
                  </em>
                )}
              </span>
              <div
                className="absolute -start-2 top-[calc(100%+12px)] z-[60] hidden w-[240px] cursor-default border px-4 py-3.5 text-start font-normal group-hover:block"
                style={{ background: 'var(--panel)', color: 'var(--text)', borderColor: 'var(--line)', boxShadow: '0 14px 36px rgba(0,0,0,.2)' }}
              >
                <span className="absolute inset-x-0 -top-3.5 h-3.5" aria-hidden="true" />
                <div className="text-[13px] font-semibold">{pop.title}</div>
                <div className="mb-2 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                  {pop.status}
                </div>
                {pop.rows.map((r, i) => (
                  <div
                    key={r.role}
                    className="flex items-center justify-between py-1.5 text-[13px]"
                    style={{ borderBottom: i < pop.rows.length - 1 ? '1px solid var(--line-soft)' : 0 }}
                  >
                    <span>{r.roleHe}</span>
                    <ApprovalTag tag={r.tag}>{r.tagLabel}</ApprovalTag>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {note && (
        <div className="ms-3.5 mt-2 inline-block text-xs" style={{ color: 'var(--muted)' }}>
          {note}
        </div>
      )}
    </div>
  );
}
