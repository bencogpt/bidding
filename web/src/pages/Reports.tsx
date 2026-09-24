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
import type { TenderStatus, TenderType } from '@obms/shared';
import { useTenders, useAllAccess, useAllSubmissions, useSuppliers } from '../lib/hooks';
import {
  statusCounts,
  typeCounts,
  responseFunnel,
  waitTimes,
  supplierProfiles,
  kpis,
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

export default function Reports() {
  const { t } = useTranslation();
  const { tenders } = useTenders();
  const access = useAllAccess();
  const submissions = useAllSubmissions();
  const suppliers = useSuppliers();
  const now = Date.now();

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
