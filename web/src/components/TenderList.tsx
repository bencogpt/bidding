import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TENDER_STATUSES, TENDER_TYPES } from '@obms/shared';
import { rolesOf } from '../lib/roles';
import type { ScoreGrade, TenderDoc, TenderStatus, TenderType } from '@obms/shared';
import { GradeBadge } from './ScoreCard';
import { useUsers } from '../lib/hooks';
import { STAGE_COLOR, isActive } from '../lib/stages';
import Avatar from './Avatar';

export { isActive };

type View = 'table' | 'cards';
type Score = { grade: ScoreGrade; total: number } | undefined;
type StatusFilter = TenderStatus | 'active' | '';

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** How far along the lifecycle the case is, 0–100. */
const progressOf = (s: TenderStatus) =>
  Math.round((TENDER_STATUSES.indexOf(s) / (TENDER_STATUSES.length - 1)) * 100);

function StageTag({ status }: { status: TenderStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-semibold text-white"
      style={{ background: STAGE_COLOR[status] }}
    >
      {t(`status.${status}`)}
    </span>
  );
}

const TYPE_ICON: Record<TenderType, string> = {
  goods: 'M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6',
  service:
    'M2 13c0-2.5 1.8-4 4-4s4 1.5 4 4M11 9.2c1.8 0 3 1.2 3 3.3M6 3.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM11.5 4.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  project: 'M3 14V2M3 3h8l-1.5 3L11 9H3',
};

/** The tender type as plain text with a small icon (pills are kept for states). */
function TypeCell({ type }: { type: TenderType }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-tx-soft">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={TYPE_ICON[type]} />
      </svg>
      {t(`type.${type}`)}
    </span>
  );
}

/**
 * The "רביעייה" as one compact bar: a segment per role (דורש, רכש, then the case's other roles)
 * and an n/N count. The tender manager (רכש) owns the case so is always filled; every other
 * segment fills once a user is assigned to that slot. Hovering opens a card with who holds each role.
 */
function Quartet({ tender, nameOf }: { tender: TenderDoc; nameOf: (uid?: string) => string | undefined }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const required = rolesOf(tender);
  const steps = [
    ...required.filter((r) => r === 'requester').map((r) => ({ key: r as string, uid: tender.team?.[r] })),
    { key: 'manager', uid: tender.ownerUid },
    ...required.filter((r) => r !== 'requester').map((r) => ({ key: r as string, uid: tender.team?.[r] })),
  ];
  const filled = steps.filter((s) => !!s.uid).length;

  const show = () => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return;
    const w = 260;
    const h = steps.length * 40 + 44;
    const top = b.bottom + 8 + h > innerHeight ? Math.max(8, b.top - h - 8) : b.bottom + 8;
    setPos({ left: Math.min(Math.max(8, b.left), innerWidth - w - 8), top });
  };

  return (
    <span
      ref={ref}
      className="inline-flex cursor-help items-center gap-2 align-middle"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      <span className="inline-flex gap-[3px]">
        {steps.map(({ key, uid }) => (
          <i key={key} className={`block h-2 w-[18px] rounded-sm ${uid ? 'bg-green-500' : 'bg-tx-mute/30'}`} />
        ))}
      </span>
      <span className="text-xs tabular-nums text-tx-soft">
        {filled}/{steps.length}
      </span>
      {pos && (
        <span
          className="pointer-events-none fixed z-50 w-[260px] rounded-lg border border-paper-2 bg-surface p-3 text-sm shadow-lg"
          style={{ left: pos.left, top: pos.top }}
        >
          <span className="mb-1 block text-xs font-semibold text-tx-soft">{t('dashboard.col.team')}</span>
          {steps.map(({ key, uid }) => {
            const name = nameOf(uid);
            return (
              <span key={key} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  {name ? <Avatar name={name} size={24} /> : <span className="h-6 w-6 shrink-0 rounded-full bg-paper-2" />}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{name ?? '—'}</span>
                    <span className="block text-xs text-tx-mute">{t(`quartet.${key}`)}</span>
                  </span>
                </span>
                <span className={`badge ${uid ? 'bg-green-50 text-green-700' : 'bg-paper-2 text-tx-mute'}`}>
                  {t(uid ? 'dashboard.assigned' : 'dashboard.unassigned')}
                </span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}

export default function TenderList({
  tenders,
  scoreOf,
  showScore,
  defaultActiveOnly = false,
}: {
  tenders: TenderDoc[];
  scoreOf: (id: string) => Score;
  showScore: boolean;
  defaultActiveOnly?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const users = useUsers(); // manager-only directory; empty for other roles
  const [view, setView] = useState<View>('table');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TenderType | ''>('');
  const [status, setStatus] = useState<StatusFilter>(defaultActiveOnly ? 'active' : '');

  const ownerName = (uid: string) => users.find((u) => u.uid === uid)?.displayName;
  const nameOf = (uid?: string) => (uid ? ownerName(uid) : undefined);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tenders.filter(
      (tn) =>
        (!needle || `${tn.serial ?? ''} ${tn.title}`.toLowerCase().includes(needle)) &&
        (!type || tn.type === type) &&
        (!status || (status === 'active' ? isActive(tn.status) : tn.status === status)),
    );
  }, [tenders, search, type, status]);

  const open = (id: string) => navigate(`/tenders/${id}`);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded bg-paper-2 p-0.5 text-sm" role="group">
          {(['table', 'cards'] as const).map((v) => (
            <button
              key={v}
              className={`rounded px-4 py-1.5 transition ${
                view === v ? 'bg-surface font-semibold shadow-card' : 'text-tx-soft hover:text-tx'
              }`}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(v === 'table' ? 'dashboard.viewTable' : 'dashboard.viewCards')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-56"
            placeholder={t('dashboard.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input w-40"
            value={type}
            onChange={(e) => setType(e.target.value as TenderType | '')}
          >
            <option value="">{t('dashboard.allTypes')}</option>
            {Object.values(TENDER_TYPES).map((v) => (
              <option key={v} value={v}>
                {t(`type.${v}`)}
              </option>
            ))}
          </select>
          <select
            className="input w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="">{t('dashboard.allStatuses')}</option>
            <option value="active">{t('dashboard.activeOnly')}</option>
            {TENDER_STATUSES.map((v) => (
              <option key={v} value={v}>
                {t(`status.${v}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card p-6 text-tx-soft">{t('dashboard.noMatch')}</div>
      ) : view === 'table' ? (
        <div className="card min-h-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-tx-mute">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.serial')}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.name')}</th>
                {users.length > 0 && (
                  <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.manager')}</th>
                )}
                <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.type')}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.stage')}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.team')}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t('dashboard.col.updated')}</th>
                {showScore && (
                  <th className="px-4 py-2.5 text-start font-medium">{t('score.title')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((tn) => {
                const sc = scoreOf(tn.id);
                const owner = ownerName(tn.ownerUid);
                return (
                  <tr
                    key={tn.id}
                    className="cursor-pointer border-t border-paper-2 hover:bg-paper"
                    onClick={() => open(tn.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums text-accent">
                      <span dir="ltr">{tn.serial ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/tenders/${tn.id}`}
                        className="font-semibold text-tx hover:text-accent"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tn.title}
                      </Link>
                    </td>
                    {users.length > 0 && (
                      <td className="px-4 py-2.5">
                        {owner ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={owner} />
                            {owner}
                          </span>
                        ) : (
                          <span className="text-tx-mute">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <TypeCell type={tn.type} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StageTag status={tn.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Quartet tender={tn} nameOf={nameOf} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-tx-mute">
                      {fmtDate(tn.updatedAt)}
                    </td>
                    {showScore && (
                      <td className="px-4 py-2.5">
                        {sc ? (
                          <GradeBadge grade={sc.grade} total={sc.total} />
                        ) : (
                          <span className="text-tx-mute">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-0 content-start gap-4 overflow-auto [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
          {shown.map((tn) => {
            const sc = showScore ? scoreOf(tn.id) : undefined;
            const owner = ownerName(tn.ownerUid);
            return (
              <div
                key={tn.id}
                role="link"
                tabIndex={0}
                className="card flex cursor-pointer flex-col gap-3 p-5 transition hover:shadow-lg"
                onClick={() => open(tn.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(tn.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-tx-mute" dir="ltr">
                    {tn.serial ?? '—'}
                  </span>
                  <TypeCell type={tn.type} />
                </div>
                <div className="font-display text-base font-semibold">{tn.title}</div>
                <div className="flex items-center gap-2">
                  <StageTag status={tn.status} />
                  <span className="text-xs text-tx-mute">{progressOf(tn.status)}%</span>
                  {sc && <GradeBadge grade={sc.grade} total={sc.total} />}
                </div>
                <Quartet tender={tn} nameOf={nameOf} />
                <div className="mt-auto flex justify-between border-t border-paper-2 pt-3 text-xs text-tx-mute">
                  <span>{owner ?? ''}</span>
                  <span>{fmtDate(tn.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
