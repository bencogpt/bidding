import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  askedParams,
  draftLines,
  draftParts,
  resolveParam,
  type FindingSeverity,
  type SupervisionFinding,
  type TemplateDoc,
  type TenderDoc,
} from '@obms/shared';
import { api } from '../lib/api';
import { useSupervision } from '../lib/hooks';
import { VerdictBadge } from './SupervisorPanel';

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  block: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-paper-2 text-tx-soft',
};
const SEVERITY_BORDER: Record<FindingSeverity, string> = {
  block: 'border-s-red-500',
  warn: 'border-s-amber-500',
  info: 'border-s-paper-2',
};

/**
 * The draft as the document would print it, next to the supervisor agent's findings. The agent runs
 * while the manager reads; a finding that comes with a suggestion can be applied in one click.
 */
export default function DraftReview({
  tender,
  template,
  canManage,
  checking,
  onEditField,
}: {
  tender: TenderDoc;
  template: TemplateDoc | null;
  canManage: boolean;
  checking: boolean; // the first check of a new case is running
  onEditField: (key: string) => void;
}) {
  const { t } = useTranslation();
  const reports = useSupervision(tender.id);
  const latest = reports[0] ?? null;
  const [busy, setBusy] = useState<'' | 'run' | 'apply'>('');
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null); // the field a clicked finding points at
  const previewRef = useRef<HTMLDivElement>(null);

  const asked = useMemo(() => askedParams((template?.params ?? []).map(resolveParam)), [template]);
  const labelOf = (key: string) => asked.find((p) => p.key === key)?.labelHe ?? key;
  const lines = useMemo(() => draftLines(template?.bodyTemplate ?? ''), [template]);

  // The latest check covers exactly the data on screen, or the draft changed since.
  const stale = !!latest && (latest.basis !== 'draft' || (!!tender.draftDataHash && latest.dataHash !== tender.draftDataHash));
  const running = checking || busy === 'run';
  const findings = latest?.findings ?? [];
  const fixable = findings.filter((f) => f.paramKey && f.suggestion && asked.some((p) => p.key === f.paramKey));

  const run = async () => {
    setBusy('run');
    setError('');
    try {
      await api.runSupervision({ tenderId: tender.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const valueFor = (key: string, text: string) =>
    asked.find((p) => p.key === key)?.type === 'number' && text.trim() !== '' && Number.isFinite(Number(text.replace(/,/g, '')))
      ? Number(text.replace(/,/g, ''))
      : text;

  // Applying changes the draft, so the previous check no longer covers it: `rerun` checks again right away.
  const apply = async (list: SupervisionFinding[], rerun: boolean) => {
    setBusy('apply');
    setError('');
    try {
      const params: Record<string, string | number> = {};
      for (const f of list) params[f.paramKey!] = valueFor(f.paramKey!, f.suggestion!);
      await api.updateTenderDraft({ tenderId: tender.id, params });
      if (rerun) {
        setBusy('run');
        await api.runSupervision({ tenderId: tender.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const point = (key?: string) => {
    if (!key) return;
    setActive(key);
    previewRef.current?.querySelector(`[data-field="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const fieldSpan = (key: string, value: string | null, i: number) => (
    <span
      key={i}
      data-field={key}
      title={labelOf(key)}
      className={`rounded px-1 ${
        value === null ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-900'
      } ${active === key ? 'outline outline-2 outline-accent' : ''}`}
    >
      {value ?? `{{${key}}}`}
    </span>
  );

  return (
    <div className="space-y-3">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>{t('dr.draftLabel')}</strong> · {t('dr.draftHint')}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* The draft */}
        <div ref={previewRef} className="card max-h-[70vh] overflow-y-auto bg-white p-8 leading-8" dir="rtl">
          {!template ? (
            <div className="text-tx-soft">{t('common.loading')}</div>
          ) : (
            <>
              <h2 className="mb-6 text-xl font-semibold">{tender.title}</h2>
              {lines.map((line, n) => {
                const parts = draftParts(line.text, tender.params).map((p, i) =>
                  p.kind === 'text' ? <span key={i}>{p.text}</span> : fieldSpan(p.key, p.value, i),
                );
                if (line.kind === 'heading') {
                  return (
                    <h3 key={n} className="mb-1 mt-5 font-bold">
                      {parts}
                    </h3>
                  );
                }
                return (
                  <p key={n} className="my-1">
                    {parts}
                  </p>
                );
              })}
            </>
          )}
        </div>

        {/* The supervisor agent */}
        <aside className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{t('ws.supervisor')}</h3>
                {latest && !running && <VerdictBadge verdict={latest.verdict} />}
              </div>
              <div className="text-xs text-tx-mute">
                {running ? t('dr.running') : latest ? t('dr.openFindings', { n: findings.length }) : t('dr.notChecked')}
              </div>
            </div>
            <button className="btn btn-sm" disabled={!!busy || checking} onClick={run}>
              {busy === 'run' ? t('sup.running') : t('dr.rerun')}
            </button>
          </div>

          {running && <div className="h-1 animate-pulse rounded bg-teal-200" role="status" aria-label={t('dr.running')} />}
          {stale && !running && (
            <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">
              {t('dr.stale')}{' '}
              <button className="underline" disabled={!!busy} onClick={run}>
                {t('dr.rerun')}
              </button>
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}

          <ul className="max-h-[52vh] space-y-2 overflow-y-auto">
            {findings.map((f, i) => {
              const canApply = canManage && !!f.suggestion && !!f.paramKey && asked.some((p) => p.key === f.paramKey);
              return (
                <li
                  key={i}
                  className={`cursor-pointer rounded border border-paper-2 border-s-4 p-3 text-sm ${SEVERITY_BORDER[f.severity]} ${stale ? 'opacity-60' : ''}`}
                  onClick={() => point(f.paramKey)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${SEVERITY_COLORS[f.severity]}`}>{t(`sup.severity.${f.severity}`)}</span>
                    <span className="text-xs text-tx-mute">{f.paramKey ? labelOf(f.paramKey) : f.location}</span>
                  </div>
                  <div className="mt-1">{f.message}</div>
                  {f.evidence && f.source === 'ai' && (
                    <div className="mt-1 rounded bg-paper-2 p-1 text-xs text-tx-soft" dir="auto">
                      “{f.evidence}”
                    </div>
                  )}
                  {f.suggestion && (
                    <div className="mt-2 rounded bg-violet-50 p-2">
                      <div className="text-xs font-semibold text-violet-700">{t('dr.suggestion')}</div>
                      <div dir="auto">{f.suggestion}</div>
                    </div>
                  )}
                  {canManage && f.paramKey && (
                    <div className="mt-2 flex gap-2">
                      {canApply && (
                        <button
                          className="btn btn-sm"
                          disabled={!!busy || checking}
                          onClick={(e) => {
                            e.stopPropagation();
                            void apply([f], false);
                          }}
                        >
                          {t('dr.apply')}
                        </button>
                      )}
                      <button
                        className="btn btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditField(f.paramKey!);
                        }}
                      >
                        {t('dr.editField')}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {latest && !findings.length && !running && <li className="text-sm text-tx-mute">{t('sup.clean')}</li>}
          </ul>

          {fixable.length > 0 && (
            <button className="btn w-full" disabled={!!busy || checking} onClick={() => void apply(fixable, true)}>
              {busy === 'apply' ? t('draft.saving') : t('dr.applyAll', { n: fixable.length })}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
