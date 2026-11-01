import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TENDER_STATUSES, TENDER_TYPES, requiredRolesFor } from '@obms/shared';
import type { ScoreGrade, TenderDoc, TenderStatus, TenderType } from '@obms/shared';
import StatusBadge from './StatusBadge';
import { GradeBadge } from './ScoreCard';

type View = 'table' | 'cards';
type Score = { grade: ScoreGrade; total: number } | undefined;

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** How far along the lifecycle the case is, 0–100. */
const progressOf = (s: TenderStatus) =>
  Math.round((TENDER_STATUSES.indexOf(s) / (TENDER_STATUSES.length - 1)) * 100);

function Pie({ pct }: { pct: number }) {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(#0e8c8c ${pct}%, #eef1f7 0)`,
        WebkitMask:
          'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
        mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
      }}
    />
  );
}

/** One chip per required role: filled once a user is assigned to that slot. */
function TeamChips({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
  const roles = tender.requiredRoles ?? requiredRolesFor(tender.type);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {roles.map((r) => {
        const done = !!tender.team?.[r];
        const role = t(`role.${r}`);
        return (
          <span
            key={r}
            title={t(done ? 'dashboard.teamAssigned' : 'dashboard.teamMissing', { role })}
            className={`rounded-full px-2 py-0.5 text-xs ${
              done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {role}
          </span>
        );
      })}
    </div>
  );
}

export default function TenderList({
  tenders,
  scoreOf,
  showScore,
}: {
  tenders: TenderDoc[];
  scoreOf: (id: string) => Score;
  showScore: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('table');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TenderType | ''>('');
  const [status, setStatus] = useState<TenderStatus | ''>('');

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tenders.filter(
      (tn) =>
        (!needle || `${tn.serial ?? ''} ${tn.title}`.toLowerCase().includes(needle)) &&
        (!type || tn.type === type) &&
        (!status || tn.status === status),
    );
  }, [tenders, search, type, status]);

  const open = (id: string) => navigate(`/tenders/${id}`);

  return (
    <div>
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
            onChange={(e) => setStatus(e.target.value as TenderStatus | '')}
          >
            <option value="">{t('dashboard.allStatuses')}</option>
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
        <div className="card overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper text-xs text-tx-mute">
              <tr className="text-start">
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.serial')}</th>
                <th className="px-5 py-3 text-start font-medium">{t('dashboard.col.name')}</th>
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
                    <td className="px-5 py-3 text-tx-soft">{t(`type.${tn.type}`)}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2">
                        <Pie pct={progressOf(tn.status)} />
                        <StatusBadge status={tn.status} />
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <TeamChips tender={tn} />
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
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
          {shown.map((tn) => {
            const sc = showScore ? scoreOf(tn.id) : undefined;
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
                  <Pie pct={progressOf(tn.status)} />
                  <StatusBadge status={tn.status} />
                  {sc && <GradeBadge grade={sc.grade} total={sc.total} />}
                </div>
                <TeamChips tender={tn} />
                <div className="mt-auto border-t border-paper-2 pt-3 text-xs text-tx-mute">
                  {fmtDate(tn.updatedAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
