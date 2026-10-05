import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REQUIRED_SKILLS,
  type FindingSeverity,
  type SupervisionVerdict,
  type TemplateDoc,
  type TenderDoc,
} from '@obms/shared';
import { useSupervision, useTenderInternal } from '../lib/hooks';
import { api } from '../lib/api';

export const VERDICT_COLORS: Record<SupervisionVerdict, string> = {
  PASS: 'bg-green-100 text-green-700',
  WARN: 'bg-amber-100 text-amber-700',
  BLOCK: 'bg-red-100 text-red-700',
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  block: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-paper-2 text-tx-soft',
};

export function VerdictBadge({ verdict }: { verdict: SupervisionVerdict }) {
  const { t } = useTranslation();
  return <span className={`badge ${VERDICT_COLORS[verdict]}`}>{t(`sup.verdict.${verdict}`)}</span>;
}

// Supervisor agent report: template + skills used vs. required, findings, and value sources.
export default function SupervisorPanel({
  tender,
  template,
}: {
  tender: TenderDoc;
  template: TemplateDoc | null;
}) {
  const { t } = useTranslation();
  const reports = useSupervision(tender.id);
  const { provenance, params: internalParams } = useTenderInternal(tender.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = reports[0] ?? null;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await api.runSupervision({ tenderId: tender.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const used = new Set((provenance?.skillsUsed ?? []).map((s) => s.id));
  const required = ['GLOBAL_RULES', ...REQUIRED_SKILLS[tender.type]];
  const labelOf = (key: string) => template?.params.find((p) => p.key === key)?.labelHe ?? key;

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{t('sup.title')}</h3>
            {latest && <VerdictBadge verdict={latest.verdict} />}
          </div>
          <button className="btn btn-sm no-print" disabled={busy} onClick={run}>
            {busy ? t('sup.running') : t('sup.run')}
          </button>
        </div>
        <p className="text-xs text-tx-mute">{t('sup.hint')}</p>
        {latest ? (
          <div className="mt-2 text-sm text-tx-soft">
            {t(`sup.stage.${latest.stage}`)} ·{' '}
            <span dir="ltr">{new Date(latest.at).toLocaleString('he-IL')}</span> ·{' '}
            {latest.aiModel ?? t('sup.rulesOnly')}
          </div>
        ) : (
          <div className="mt-2 text-sm text-tx-mute">{t('sup.noRuns')}</div>
        )}
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Template */}
        <div className="card p-5">
          <h4 className="mb-2 font-semibold">{t('sup.template')}</h4>
          <div className="space-y-1 text-sm">
            <div>
              {template?.title ?? tender.type} · {provenance?.templateId ?? '—'}
            </div>
            {provenance ? (
              <div className="text-tx-soft">
                {provenance.draftId ? t('sup.fromDraft', { model: provenance.aiModel ?? '—' }) : t('sup.manual')}
              </div>
            ) : (
              <div className="text-amber-700">{t('sup.noProvenance')}</div>
            )}
            {provenance?.brief && (
              <div className="rounded bg-paper-2 p-2 text-tx-soft" dir="auto">
                {provenance.brief}
              </div>
            )}
          </div>
        </div>

        {/* Skills */}
        <div className="card p-5">
          <h4 className="mb-2 font-semibold">{t('sup.skills')}</h4>
          <ul className="space-y-1 text-sm" dir="ltr">
            {required.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <span className={used.has(id as never) ? 'text-green-600' : 'text-red-600'}>
                  {used.has(id as never) ? '✓' : '✗'}
                </span>
                <span>{id}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Findings */}
      <div className="card p-5">
        <h4 className="mb-2 font-semibold">{t('sup.findings')}</h4>
        {!latest || latest.findings.length === 0 ? (
          <div className="text-sm text-tx-mute">{latest ? t('sup.clean') : '—'}</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {latest.findings.map((f, i) => (
              <li key={i} className="rounded border border-paper-2 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${SEVERITY_COLORS[f.severity]}`}>{t(`sup.severity.${f.severity}`)}</span>
                  <span className="chip" dir="ltr">{f.code}</span>
                  <span className="text-xs text-tx-mute">{f.location}</span>
                  {f.source === 'ai' && <span className="chip">AI</span>}
                </div>
                <div className="mt-1">{f.message}</div>
                {f.evidence && (
                  <div className="mt-1 rounded bg-paper-2 p-1 text-xs text-tx-soft" dir="auto">
                    “{f.evidence}”
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Value sources (G11) */}
      <div className="card p-5">
        <h4 className="mb-2 font-semibold">{t('sup.sources')}</h4>
        <ul className="space-y-1 text-sm">
          {Object.entries(tender.params).map(([k, v]) => {
            const src = provenance?.paramSources[k];
            const edited = provenance?.editedByManager.includes(k);
            return (
              <li key={k} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-tx-soft">{labelOf(k)}:</span>
                <span>{String(v)}</span>
                <span className="chip">
                  {edited || !provenance?.draftId
                    ? t('sup.srcManager')
                    : src
                      ? `${src.source_type} · ${src.source_ref}`
                      : t('sup.srcNone')}
                </span>
              </li>
            );
          })}
          {Object.entries(internalParams).map(([k, v]) => (
            <li key={k} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-tx-soft">{labelOf(k)}:</span>
              <span>{String(v)}</span>
              <span className="badge bg-red-100 text-red-700">{t('sup.confidential')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
