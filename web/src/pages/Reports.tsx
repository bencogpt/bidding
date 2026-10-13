import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useState } from 'react';
import { DEFAULT_SCORE_TARGETS } from '@obms/shared';
import type { DciParams, RatingKey, ScoreMetricKey, ScoreTargets, TenderStatus, TenderType } from '@obms/shared';
import {
  useTenders,
  useAllAccess,
  useAllSubmissions,
  useSuppliers,
  useCaseScores,
  useScoringTargets,
  useAllFeedback,
} from '../lib/hooks';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { formatMetric } from '../components/ScoreCard';
import {
  statusCounts,
  typeCounts,
  responseFunnel,
  waitTimes,
  supplierProfiles,
  kpis,
  cohortComparison,
  MIN_COHORT,
  feedbackByRole,
  topIssues,
  dciFeedbackCorrelation,
} from '../lib/analytics';
import { downloadCsv } from '../lib/csv';

const PALETTE = ['#d8a23a', '#0e8c8c', '#7c52d6', '#2f6fd8', '#1f9d62', '#d8932f', '#c0405b'];
const short = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s);

function Section({
  title,
  onCsv,
  children,
}: {
  title: string;
  onCsv?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {onCsv && (
          <button className="btn btn-sm no-print" onClick={onCsv}>
            {t('reports.exportCsv')}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// Manager edits the score targets (good → 100, bad → 0 for each metric).
function TargetsEditor({ targets, dci }: { targets: ScoreTargets; dci: DciParams }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ScoreTargets | null>(null);
  const [dciDraft, setDciDraft] = useState<DciParams | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const current = draft ?? targets;
  const currentDci = dciDraft ?? dci;
  const keys = Object.keys(DEFAULT_SCORE_TARGETS) as ScoreMetricKey[];

  const set = (k: ScoreMetricKey, field: 'good' | 'bad', v: string) =>
    setDraft({ ...current, [k]: { ...current[k], [field]: Number(v) } });
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const clean = Object.fromEntries(keys.map((k) => [k, current[k]])) as ScoreTargets;
      await api.updateScoringTargets({ targets: clean, dci: currentDci });
      setDraft(null);
      setDciDraft(null);
      setMsg(t('score.targetsSaved'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-tx-mute">{t('score.targetsHint')}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-xs text-tx-mute">
            <th className="py-1">{t('score.metricCol')}</th>
            <th className="py-1">{t('score.good')}</th>
            <th className="py-1">{t('score.bad')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-paper-2">
              <td className="py-1">{t(`score.metric.${k}`)}</td>
              {(['good', 'bad'] as const).map((f) => (
                <td key={f} className="py-1">
                  <input
                    className="input w-24"
                    type="number"
                    step="any"
                    dir="ltr"
                    value={current[k][f]}
                    onChange={(e) => set(k, f, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{t('score.dciParams')}</span>
        <label className="flex items-center gap-1">
          N₀
          <input
            className="input w-20"
            type="number"
            step="1"
            min="1"
            dir="ltr"
            value={currentDci.targetSessions}
            onChange={(e) => setDciDraft({ ...currentDci, targetSessions: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-1">
          w
          <input
            className="input w-20"
            type="number"
            step="0.1"
            min="0"
            max="1"
            dir="ltr"
            value={currentDci.reworkWeight}
            onChange={(e) => setDciDraft({ ...currentDci, reworkWeight: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-gold btn-sm" disabled={busy || (!draft && !dciDraft)} onClick={save}>
          {t('common.save')}
        </button>
        {msg && <span className="text-sm text-tx-soft">{msg}</span>}
      </div>
    </div>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const { tenders } = useTenders();
  const access = useAllAccess();
  const submissions = useAllSubmissions();
  const suppliers = useSuppliers();
  const scores = useCaseScores();
  const scoring = useScoringTargets();
  const { role } = useAuth();
  const isManager = role === 'tender_manager';
  const allFeedback = useAllFeedback(isManager);
  const fbRoles = feedbackByRole(allFeedback);
  const fbKeys = [...new Set(fbRoles.flatMap((r) => Object.keys(r.ratings)))] as RatingKey[];
  const fbIssues = topIssues(allFeedback);
  const corr = dciFeedbackCorrelation(scores, allFeedback);
  const [backfilling, setBackfilling] = useState(false);
  const now = Date.now();
  const cohorts = cohortComparison(scores);
  const fmt = (row: (typeof cohorts)[number], v: number | null) =>
    v === null ? '—' : row.key === 'total' ? String(v) : formatMetric(row.key, v);
  const cohortData = cohorts
    .filter((r) => r.key !== 'total' && r.key !== 'editSize')
    .map((r) => ({
      name: t(`score.metric.${r.key}`),
      [t('score.cohort.ai')]: r.ai ?? 0,
      [t('score.cohort.manual')]: r.manual ?? 0,
    }));
  const backfill = async () => {
    setBackfilling(true);
    try {
      await api.backfillCaseScores({});
    } finally {
      setBackfilling(false);
    }
  };

  const sc = statusCounts(tenders);
  const tc = typeCounts(tenders);
  const funnel = responseFunnel(tenders, access, submissions);
  const waits = waitTimes(tenders, access, now);
  const profiles = supplierProfiles(access, submissions, suppliers);
  const k = kpis(tenders, access, suppliers);

  const statusData = (Object.keys(sc) as TenderStatus[])
    .filter((s) => sc[s] > 0)
    .map((s) => ({ name: t(`status.${s}`), value: sc[s] }));
  const typeData = (Object.keys(tc) as TenderType[]).map((ty) => ({
    name: t(`type.${ty}`),
    value: tc[ty],
  }));
  const funnelData = funnel.map((f) => ({
    name: short(f.title),
    [t('reports.suppliersWithAccess')]: f.withAccess,
    [t('reports.submitted')]: f.submitted,
  }));
  const waitData = waits.map((w) => ({ name: short(`${w.name} · ${w.tenderTitle}`), hours: w.hours }));
  const profileData = profiles.map((p) => ({
    name: short(p.name),
    [t('reports.shared')]: p.shared,
    [t('reports.submitted')]: p.submitted,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t('reports.title')}</h1>
        <button className="btn btn-gold no-print" onClick={() => window.print()}>
          {t('reports.downloadPdf')}
        </button>
      </div>

      <div className="print-area space-y-6">
        <div className="hidden text-sm text-tx-soft print:block">
          {t('reports.title')} · {new Date(now).toLocaleString('he-IL')}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: t('reports.kpiTenders'), value: k.totalTenders },
            { label: t('reports.kpiPublished'), value: k.published },
            { label: t('reports.kpiSuppliers'), value: k.totalSuppliers },
            { label: t('reports.kpiAvgSuppliers'), value: k.avgSuppliersPerTender },
          ].map((c) => (
            <div key={c.label} className="card p-4">
              <div className="text-xs text-tx-mute">{c.label}</div>
              <div className="font-display text-2xl font-bold text-teal-600">{c.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Section title={t('reports.byStatus')}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Section>

          <Section title={t('reports.byType')}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#0e8c8c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <Section
          title={t('reports.responseStatus')}
          onCsv={() =>
            downloadCsv(
              'response-status',
              ['מכרז', t('reports.suppliersWithAccess'), t('reports.submitted')],
              funnel.map((f) => [f.title, f.withAccess, f.submitted]),
            )
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('reports.suppliersWithAccess')} fill="#2f6fd8" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('reports.submitted')} fill="#1f9d62" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section
          title={t('reports.tenderStatus')}
          onCsv={() =>
            downloadCsv(
              'wait-times',
              [t('audit.actor'), 'מכרז', t('reports.waitHours')],
              waits.map((w) => [w.name, w.tenderTitle, w.hours]),
            )
          }
        >
          {waitData.length === 0 ? (
            <div className="text-sm text-tx-mute">{t('reports.noReviewers')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waitData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="hours" fill="#d8932f" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* AI benefit: AI-drafted vs manual (control group) */}
        <Section
          title={t('score.benefitTitle')}
          onCsv={() =>
            downloadCsv(
              'ai-benefit',
              [t('score.metricCol'), t('score.cohort.ai'), 'n', t('score.cohort.manual'), 'n'],
              cohorts.map((r) => [t(r.key === 'total' ? 'score.total' : `score.metric.${r.key}`), fmt(r, r.ai), r.aiN, fmt(r, r.manual), r.manualN]),
            )
          }
        >
          <p className="mb-3 text-xs text-tx-mute">{t('score.benefitHint')}</p>
          {(cohorts[0].aiN < MIN_COHORT || cohorts[0].manualN < MIN_COHORT) && (
            <div className="mb-3 rounded bg-amber-100 p-2 text-xs text-amber-700">
              {t('score.tooFew', { ai: cohorts[0].aiN, manual: cohorts[0].manualN, min: MIN_COHORT })}
            </div>
          )}
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-tx-mute">
                <th className="py-1">{t('score.metricCol')}</th>
                <th className="py-1">{t('score.cohort.ai')}</th>
                <th className="py-1">{t('score.cohort.manual')}</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((r) => {
                const better =
                  r.ai !== null && r.manual !== null && r.ai !== r.manual
                    ? (r.ai < r.manual) === r.lowerIsBetter
                      ? 'ai'
                      : 'manual'
                    : null;
                return (
                  <tr key={r.key} className="border-t border-paper-2">
                    <td className="py-1">{t(r.key === 'total' ? 'score.total' : `score.metric.${r.key}`)}</td>
                    <td className={`py-1 ${better === 'ai' ? 'font-bold text-green-700' : ''}`} dir="ltr">
                      {fmt(r, r.ai)} <span className="text-xs text-tx-mute">(n={r.aiN})</span>
                    </td>
                    <td className={`py-1 ${better === 'manual' ? 'font-bold text-green-700' : ''}`} dir="ltr">
                      {fmt(r, r.manual)} <span className="text-xs text-tx-mute">(n={r.manualN})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cohortData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('score.cohort.ai')} fill="#0e8c8c" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('score.cohort.manual')} fill="#d8a23a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {isManager && (
            <button className="btn btn-sm no-print mt-3" disabled={backfilling} onClick={backfill}>
              {backfilling ? t('score.computing') : t('score.backfill')}
            </button>
          )}
        </Section>

        {isManager && (
          <Section title={t('score.targetsTitle')}>
            <TargetsEditor targets={scoring.targets} dci={scoring.dci} />
          </Section>
        )}

        {isManager && (
          <Section
            title={t('fb.reportTitle')}
            onCsv={() =>
              downloadCsv(
                'participant-feedback',
                [t('fb.role'), 'n', ...fbKeys.map((k) => t(`fb.rating.${k}`))],
                fbRoles.map((r) => [r.role === 'all' ? t('fb.all') : t(`role.${r.role}`), r.n, ...fbKeys.map((k) => r.ratings[k] ?? '')]),
              )
            }
          >
            {allFeedback.length === 0 ? (
              <div className="text-sm text-tx-mute">{t('fb.noneYet')}</div>
            ) : (
              <>
                <table className="mb-3 w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-tx-mute">
                      <th className="py-1">{t('fb.role')}</th>
                      {fbKeys.map((k) => (
                        <th key={k} className="py-1">
                          {t(`fb.rating.${k}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fbRoles.map((r) => (
                      <tr key={r.role} className="border-t border-paper-2">
                        <td className="py-1">
                          {r.role === 'all' ? t('fb.all') : t(`role.${r.role}`)} <span className="text-xs text-tx-mute">(n={r.n})</span>
                        </td>
                        {fbKeys.map((k) => (
                          <td key={k} className="py-1" dir="ltr">
                            {r.ratings[k] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mb-3 flex flex-wrap gap-1">
                  {fbIssues.map((i) => (
                    <span key={i.issue} className="chip">
                      {t(`fb.issue.${i.issue}`)} · {i.count}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="rounded border border-paper-2 p-3 text-sm">
              <div className="font-semibold">{t('fb.corrTitle')}</div>
              <div className="text-xs text-tx-mute">{t('fb.corrHint')}</div>
              <div className="mt-1" dir="ltr">
                {corr.r === null ? t('fb.corrTooFew', { n: corr.n }) : `r = ${corr.r} (n=${corr.n})`}
              </div>
            </div>
          </Section>
        )}

        <Section
          title={t('reports.supplierProfile')}
          onCsv={() =>
            downloadCsv(
              'supplier-profile',
              [t('supplier.name'), t('reports.shared'), t('reports.submitted')],
              profiles.map((p) => [p.name, p.shared, p.submitted]),
            )
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={profileData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('reports.shared')} fill="#7c52d6" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('reports.submitted')} fill="#1f9d62" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>
    </div>
  );
}
