import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TENDER_STATUSES, TENDER_TYPES, requiredRolesFor } from '@obms/shared';
import type { ScoreGrade, TenderDoc, TenderStatus, TenderType } from '@obms/shared';
import { GradeBadge } from './ScoreCard';
import { useUsers } from '../lib/hooks';

type View = 'table' | 'cards';
type Score = { grade: ScoreGrade; total: number } | undefined;
type StatusFilter = TenderStatus | 'active' | '';

/** Statuses after which the case needs no more day-to-day work. */
const DONE_STATUSES: TenderStatus[] = ['evaluated', 'awarded'];
export const isActive = (s: TenderStatus) => !DONE_STATUSES.includes(s);

/** One solid colour per stage, running along a single journey from writing to award. */
const STAGE_COLOR: Record<TenderStatus, string> = {
  draft: '#8a5cf0',
  internal_review: '#5a4fe0',
  ready: '#2f6fe0',
  published: '#0a8fc2',
  responses: '#0a9a8e',
  evaluated: '#1f9d5f',
  awarded: '#177a4a',
};

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** How far along the lifecycle the case is, 0–100. */
const progressOf = (s: TenderStatus) =>
  Math.round((TENDER_STATUSES.indexOf(s) / (TENDER_STATUSES.length - 1)) * 100);

function StageTag({ status }: { status: TenderStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-3 py-0.5 text-xs font-semibold text-white"
      style={{ background: STAGE_COLOR[status] }}
    >
      {t(`status.${status}`)}
    </span>
  );
}

const AVATAR_COLORS = ['#6a4fe0', '#2f6fe0', '#0a8fc2', '#0a9a8e', '#1f9d5f', '#8a5cf0'];

/** Small round picture of a person: coloured initials, the colour stable per name. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return (
    <span
      className="inline-grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: AVATAR_COLORS[hue] }}
    >
      {initials}
    </span>
  );
}

/**
 * The "רביעייה" as one compact bar: a segment per role (דורש, רכש, then the case's other roles)
 * and an n/N count. The tender manager (רכש) owns the case so is always filled; every other
 * segment fills once a user is assigned to that slot.
 */
function Quartet({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
  const required = tender.requiredRoles ?? requiredRolesFor(tender.type);
  const steps = [
    ...required.filter((r) => r === 'requester').map((r) => ({ key: r, done: !!tender.team?.[r] })),
    { key: 'manager', done: true },
    ...required.filter((r) => r !== 'requester').map((r) => ({ key: r, done: !!tender.team?.[r] })),
  ];
  const filled = steps.filter((s) => s.done).length;
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <span className="inline-flex gap-[3px]">
        {steps.map(({ key, done }) => {
          const role = t(`quartet.${key}`);
          return (
            <i
              key={key}
              title={t(done ? 'dashboard.teamAssigned' : 'dashboard.teamMissing', { role })}
              className={`block h-2 w-[18px] rounded-sm ${done ? 'bg-teal' : 'bg-tx-mute/30'}`}
            />
          );
        })}
      </span>
      <span className="text-xs tabular-nums text-tx-soft">
        {filled}/{steps.length}
      </span>
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
            <thead className="sticky top-0 z-10 bg-paper text-xs text-tx-mute">
              <tr>
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.serial')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.name')}</th>
                {users.length > 0 && (
                  <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.manager')}</th>
                )}
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.type')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.stage')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.team')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.updated')}</th>
                {showScore && (
                  <th className="px-5 py-3 text-start font-medium">{t('score.title')}</th>
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
                    <td className="whitespace-nowrap px-5 py-3 text-tx-soft" dir="ltr">
                      {tn.serial ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/tenders/${tn.id}`}
                        className="font-semibold text-teal-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tn.title}
                      </Link>
                    </td>
                    {users.length > 0 && (
                      <td className="px-5 py-3">
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
                    <td className="px-5 py-3 text-tx-soft">{t(`type.${tn.type}`)}</td>
                    <td className="px-5 py-3">
                      <StageTag status={tn.status} />
                    </td>
                    <td className="px-5 py-3">
                      <Quartet tender={tn} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-tx-mute">
                      {fmtDate(tn.updatedAt)}
                    </td>
                    {showScore && (
                      <td className="px-5 py-3">
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
                  <span className="chip">{t(`type.${tn.type}`)}</span>
                </div>
                <div className="font-display text-base font-semibold">{tn.title}</div>
                <div className="flex items-center gap-2">
                  <StageTag status={tn.status} />
                  <span className="text-xs text-tx-mute">{progressOf(tn.status)}%</span>
                  {sc && <GradeBadge grade={sc.grade} total={sc.total} />}
                </div>
                <Quartet tender={tn} />
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
