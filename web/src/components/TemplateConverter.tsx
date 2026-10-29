import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FIELD_TYPES,
  templateFieldsStatus,
  type ConversionField,
  type ConversionReport,
  type TemplateDoc,
  type TenderType,
} from '@obms/shared';
import { useLatestConversion } from '../lib/hooks';
import { api } from '../lib/api';

type EditableField = ConversionField & { accepted: boolean };

/** The quote with the part that becomes {{key}} highlighted. */
function Quote({ quote, replace, fieldKey }: { quote: string; replace: string; fieldKey: string }) {
  const i = quote.indexOf(replace);
  if (i < 0) return <span>{quote}</span>;
  return (
    <span dir="auto">
      {quote.slice(0, i)}
      <mark className="rounded bg-gold/30 px-0.5" title={`{{${fieldKey}}}`}>
        {replace}
      </mark>
      {quote.slice(i + replace.length)}
    </span>
  );
}

// Turns a Word-based document into a real template: the agent proposes fields for every fill-in
// spot, the manager reviews and edits, then Apply writes {{fields}} into the Doc (after a backup).
export default function TemplateConverter({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  const run = useLatestConversion(type);
  const [fields, setFields] = useState<EditableField[]>([]);
  const [supplierFill, setSupplierFill] = useState<string[]>([]);
  const [busy, setBusy] = useState<'analyze' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [open, setOpen] = useState(false);

  const status = template ? templateFieldsStatus(template.bodyTemplate ?? '', template.supplierFillQuotes ?? []) : null;
  const pending = run && !run.appliedAt ? run : null;

  // Load the latest unapplied proposal into the editor.
  useEffect(() => {
    if (!pending) return;
    setFields(pending.fields.map((f) => ({ ...f, accepted: true })));
    setSupplierFill(pending.supplierFill);
  }, [pending?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i: number, patch: Partial<EditableField>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const analyze = async () => {
    setBusy('analyze');
    setError('');
    setReport(null);
    try {
      await api.analyzeTemplateFields({ type });
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const apply = async () => {
    if (!pending) return;
    setBusy('apply');
    setError('');
    try {
      const r = await api.applyTemplateConversion({
        type,
        runId: pending.runId,
        fields: fields.filter((f) => f.accepted).map(({ accepted: _a, ...f }) => f),
        supplierFill,
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  // An unresolved spot: the supplier fills it, or it becomes another occurrence of a field.
  const markSupplier = (line: string) => setSupplierFill((s) => [...new Set([...s, line])]);
  const mapToField = (line: string, marker: string, key: string) =>
    setFields((fs) =>
      fs.map((f) => (f.key === key ? { ...f, occurrences: [...f.occurrences, { quote: line, replace: marker }] } : f)),
    );

  return (
    <div className="border-t border-paper-2 pt-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-tx-soft">
          {t('conv.title')}
          {status && (
            <span className={`badge ${status.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {status.status === 'ready'
                ? t('conv.ready', { n: status.fields })
                : t('conv.needs', { n: status.unresolved, f: status.fields })}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {pending && (
            <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
              {open ? t('common.close') : t('conv.review')}
            </button>
          )}
          <button className="btn btn-sm" disabled={!!busy} onClick={analyze}>
            {busy === 'analyze' ? t('conv.analyzing') : `✨ ${pending ? t('conv.reanalyze') : t('conv.analyze')}`}
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-tx-mute">{t('conv.hint')}</p>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      {report && (
        <div className={`mb-2 rounded p-2 text-sm ${report.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {t('conv.applied', { fields: report.fields, replaced: report.replaced })}
          {report.notFound.length > 0 && <> · {t('conv.notFound', { n: report.notFound.length })}</>}
          {report.unresolved.length > 0 && <> · {t('conv.stillUnresolved', { n: report.unresolved.length })}</>}
          {report.backupDocId && (
            <>
              {' · '}
              <a className="underline" href={`https://docs.google.com/document/d/${report.backupDocId}/edit`} target="_blank" rel="noreferrer">
                {t('conv.backup')}
              </a>
            </>
          )}
        </div>
      )}

      {open && pending && (
        <div className="space-y-3 rounded border border-paper-2 p-3">
          <div className="text-xs text-tx-mute">
            {t('conv.runInfo', { rounds: pending.rounds, model: pending.model, dropped: pending.dropped.length })}
          </div>

          {/* Proposed fields */}
          <div>
            <div className="mb-1 text-sm font-semibold">{t('conv.fields', { n: fields.filter((f) => f.accepted).length })}</div>
            {fields.length === 0 && <div className="text-sm text-tx-mute">{t('conv.noFields')}</div>}
            <ul className="space-y-2">
              {fields.map((f, i) => (
                <li key={i} className={`rounded border p-2 text-sm ${f.accepted ? 'border-paper-2' : 'border-dashed opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" checked={f.accepted} onChange={(e) => update(i, { accepted: e.target.checked })} />
                    <input className="input w-48" value={f.labelHe} onChange={(e) => update(i, { labelHe: e.target.value })} />
                    <input className="input w-40" dir="ltr" value={f.key} onChange={(e) => update(i, { key: e.target.value })} />
                    <select className="input w-24" value={f.type} onChange={(e) => update(i, { type: e.target.value as EditableField['type'] })}>
                      {FIELD_TYPES.map((ty) => (
                        <option key={ty} value={ty}>
                          {t(`conv.type.${ty}`)}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} />
                      {t('conv.required')}
                    </label>
                    {f.internal && <span className="badge bg-red-100 text-red-700">{t('sup.confidential')}</span>}
                    <span className="text-xs text-tx-mute">{t('conv.occurrences', { n: f.occurrences.length })}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-tx-soft">
                    {f.occurrences.map((o, j) => (
                      <li key={j}>
                        • <Quote quote={o.quote} replace={o.replace} fieldKey={f.key} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          {/* Supplier-filled spots */}
          <div>
            <div className="mb-1 text-sm font-semibold">{t('conv.supplierFill', { n: supplierFill.length })}</div>
            <p className="mb-1 text-xs text-tx-mute">{t('conv.supplierFillHint')}</p>
            <ul className="space-y-0.5 text-xs text-tx-soft">
              {supplierFill.map((q) => (
                <li key={q} className="flex items-center gap-2">
                  <span dir="auto">• {q}</span>
                  <button className="text-red-600" onClick={() => setSupplierFill((s) => s.filter((x) => x !== q))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Spots the agent couldn't classify */}
          {pending.unresolved.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-semibold text-amber-700">{t('conv.unresolved', { n: pending.unresolved.length })}</div>
              <ul className="space-y-1 text-xs">
                {pending.unresolved.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className="text-tx-mute">#{s.lineNo}</span>
                    <span dir="auto">{s.line}</span>
                    <button className="chip" onClick={() => markSupplier(s.line)}>
                      {t('conv.markSupplier')}
                    </button>
                    {fields.length > 0 && (
                      <select className="input w-40 text-xs" defaultValue="" onChange={(e) => e.target.value && mapToField(s.line, s.marker, e.target.value)}>
                        <option value="">{t('conv.mapTo')}</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.labelHe}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button className="btn btn-gold btn-sm" disabled={!!busy || !fields.some((f) => f.accepted)} onClick={apply}>
              {busy === 'apply' ? t('conv.applying') : t('conv.apply')}
            </button>
            <span className="text-xs text-tx-mute">{t('conv.applyHint')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
