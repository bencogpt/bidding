import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { askedParams, isConfidentialParam, type DocumentGateReason, type TemplateDoc, type TemplateParam, type TenderDoc } from '@obms/shared';
import { api } from '../lib/api';
import { useTenderInternal } from '../lib/hooks';

const YES = 'כן';
const NO = 'לא';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * The same gate the server applies before creating the document: the latest inspector check must
 * cover exactly the current draft data and have no blocking finding. The server decides; this only
 * explains the state and enables the button.
 */
export function draftGate(tender: TenderDoc): DocumentGateReason | null {
  const s = tender.lastSupervision;
  if (!s || s.basis !== 'draft') return 'no_check';
  if (tender.draftDataHash && s.dataHash !== tender.draftDataHash) return 'stale_check';
  if (s.verdict === 'BLOCK') return 'blocked';
  return null;
}

// Draft-first: a new case has no document. The team checks the draft with the inspector; once the
// latest check has no blocking finding, the tender manager creates the document.
export default function DraftPanel({
  tender,
  template,
  canManage,
  onOpenInspector,
}: {
  tender: TenderDoc;
  template: TemplateDoc | null;
  canManage: boolean;
  onOpenInspector: () => void;
}) {
  const { t } = useTranslation();
  const { params: internalParams } = useTenderInternal(tender.id);
  const [busy, setBusy] = useState<'' | 'check' | 'generate' | 'save'>('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(tender.title);
  const [deadline, setDeadline] = useState(toLocalInput(tender.submissionDeadline));
  const [values, setValues] = useState<Record<string, string>>({});

  const generating = tender.documentStatus === 'generating';
  const gate = draftGate(tender);
  const asked = askedParams(template?.params ?? []);
  const current = (p: TemplateParam) => String(tender.params[p.key] ?? internalParams[p.key] ?? '');
  const valueOf = (p: TemplateParam) => values[p.key] ?? current(p);

  const run = async (kind: 'check' | 'generate' | 'save', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy('');
    }
  };

  const check = () => run('check', () => api.runSupervision({ tenderId: tender.id }));
  const generate = () => run('generate', () => api.generateDocument({ tenderId: tender.id }));
  const save = async () => {
    // Only the fields the manager changed are sent; the server overlays them on the current values.
    const params = Object.fromEntries(
      asked
        .filter((p) => values[p.key] !== undefined && values[p.key] !== current(p))
        .map((p) => [p.key, p.type === 'number' && values[p.key] !== '' ? Number(values[p.key]) : values[p.key]]),
    );
    const newDeadline = deadline ? new Date(deadline).getTime() : null;
    const ok = await run('save', () =>
      api.updateTenderDraft({
        tenderId: tender.id,
        ...(title.trim() !== tender.title ? { title: title.trim() } : {}),
        ...(newDeadline !== tender.submissionDeadline ? { submissionDeadline: newDeadline } : {}),
        ...(Object.keys(params).length ? { params } : {}),
      }),
    );
    if (ok) {
      setValues({});
      setEditing(false);
    }
  };

  const s = tender.lastSupervision;
  const statusTone =
    gate === null ? 'border-green-200 bg-green-50 text-green-800' : gate === 'blocked' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <h3 className="font-display text-xl font-semibold">{t('draft.title')}</h3>
        <p className="text-sm text-tx-soft">{t('draft.hint')}</p>
        <div className={`rounded border p-3 text-sm ${statusTone}`}>
          {generating ? t('draft.generating') : t(`draft.gate.${gate ?? 'ok'}`)}
          {s?.basis === 'draft' && (
            <span className="ms-2 text-xs opacity-80" dir="ltr">
              {new Date(s.at).toLocaleString('he-IL')}
            </span>
          )}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!!busy || generating} onClick={check}>
            {busy === 'check' ? t('sup.running') : t('draft.runInspector')}
          </button>
          <button className="btn" onClick={onOpenInspector}>
            {t('draft.viewFindings')}
          </button>
          {canManage && (
            <button
              className="btn border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
              disabled={!!busy || generating || gate !== null}
              title={gate ? t(`draft.gate.${gate}`) : undefined}
              onClick={generate}
            >
              {busy === 'generate' || generating ? t('draft.generating') : t('draft.createDocument')}
            </button>
          )}
        </div>
      </div>

      {canManage && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">{t('draft.edit')}</h4>
            {!editing && (
              <button className="btn btn-sm" disabled={generating} onClick={() => setEditing(true)}>
                {t('draft.editStart')}
              </button>
            )}
          </div>
          {editing && (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block font-semibold text-tx-soft">{t('draft.fieldTitle')}</span>
                <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block font-semibold text-tx-soft">{t('draft.fieldDeadline')}</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              {asked.map((p) => (
                <label key={p.key} className="block">
                  <span className="mb-1 block font-semibold text-tx-soft">
                    {p.labelHe || p.key}
                    {p.required && <span className="text-red-600"> *</span>}
                    {isConfidentialParam(p) && <span className="badge ms-2 bg-red-100 text-red-700">{t('sup.confidential')}</span>}
                  </span>
                  {p.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={valueOf(p) === YES}
                      onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.checked ? YES : NO }))}
                    />
                  ) : p.type === 'textarea' ? (
                    <textarea
                      className="input min-h-20 w-full"
                      dir="auto"
                      value={valueOf(p)}
                      onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="input w-full"
                      dir="auto"
                      type={p.type === 'number' ? 'number' : 'text'}
                      value={valueOf(p)}
                      onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
              <p className="text-xs text-tx-mute">{t('draft.editHint')}</p>
              <div className="flex gap-2">
                <button className="btn border-accent bg-accent text-white" disabled={!!busy} onClick={save}>
                  {busy === 'save' ? t('draft.saving') : t('draft.save')}
                </button>
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() => {
                    setValues({});
                    setTitle(tender.title);
                    setDeadline(toLocalInput(tender.submissionDeadline));
                    setEditing(false);
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
