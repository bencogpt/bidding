import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TENDER_TYPES, type TenderType, type TemplateDoc } from '@obms/shared';
import { useTemplates, useLatestSkillTips } from '../lib/hooks';
import { api } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import SkillsCatalog, { TypeSkills } from '../components/SkillsCatalog';

type Example = { title: string; url: string };

function BindSection({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const createDoc = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.createTemplateDoc({ type });
      setMsg({ kind: 'ok', text: t('templates.created') });
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.syncTemplateFields({ type });
      setMsg({ kind: 'ok', text: t('templates.boundOk', { count: res.params.length }) });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-tx-soft">{t('templates.section.doc')}</span>
        {template?.googleTemplateDocId ? (
          <a href={template.sourceUrl ?? '#'} target="_blank" rel="noreferrer" className="text-sm text-teal-600" dir="ltr">
            {t('templates.openEdit')} ↗
          </a>
        ) : (
          <span className="chip">{t('templates.unbound')}</span>
        )}
      </div>
      {template?.googleTemplateDocId ? (
        <button className="btn btn-gold whitespace-nowrap" disabled={busy} onClick={sync}>
          {busy ? t('templates.syncing') : t('templates.syncFields')}
        </button>
      ) : (
        <button className="btn btn-gold whitespace-nowrap" disabled={busy} onClick={createDoc}>
          {busy ? t('templates.creating') : t('templates.createDoc')}
        </button>
      )}
      <p className="mt-2 text-xs text-tx-mute">{t('templates.createHint')}</p>
      {msg && (
        <div
          className={`mt-2 rounded p-2 text-sm ${
            msg.kind === 'ok'
              ? 'bg-green-100 text-green-700'
              : msg.kind === 'warn'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}
      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-tx-soft">{t('templates.fields')}</div>
        {template?.params?.some((p) => !p.internal) ? (
          <div className="flex flex-wrap gap-2">
            {template.params.filter((p) => !p.internal).map((p) => (
              <span key={p.key} className="chip" dir="auto">
                {p.labelHe}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-tx-mute">{t('templates.noFields')}</div>
        )}
      </div>
    </div>
  );
}

type InternalField = { key: string; labelHe: string; type: 'text' | 'number' };

// Internal-only fields (e.g. the estimate): on the create form, never in the published document.
function InternalFieldsSection({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  const current: InternalField[] = (template?.params ?? [])
    .filter((p) => p.internal)
    .map((p) => ({ key: p.key, labelHe: p.labelHe, type: p.type === 'number' ? 'number' : 'text' }));
  const [draft, setDraft] = useState<InternalField>({ key: '', labelHe: '', type: 'number' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (fields: InternalField[]) => {
    setBusy(true);
    setError('');
    try {
      await api.setTemplateInternalFields({ type, fields });
      setDraft({ key: '', labelHe: '', type: 'number' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-paper-2 pt-4">
      <div className="mb-1 text-sm font-semibold text-tx-soft">{t('templates.section.internal')}</div>
      <p className="mb-2 text-xs text-tx-mute">{t('templates.internalHint')}</p>
      {current.length > 0 && (
        <ul className="mb-2 space-y-1 text-sm">
          {current.map((f) => (
            <li key={f.key} className="flex items-center gap-2">
              <span className="badge bg-red-100 text-red-700">{t('sup.confidential')}</span>
              <span dir="auto">{f.labelHe}</span>
              <span className="text-xs text-tx-mute" dir="ltr">
                {f.key} · {f.type}
              </span>
              <button
                className="text-red-600"
                disabled={busy}
                onClick={() => save(current.filter((c) => c.key !== f.key))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          className="input w-28"
          dir="ltr"
          placeholder={t('templates.internalKey')}
          value={draft.key}
          onChange={(e) => setDraft({ ...draft, key: e.target.value })}
        />
        <input
          className="input flex-1"
          placeholder={t('templates.internalLabel')}
          value={draft.labelHe}
          onChange={(e) => setDraft({ ...draft, labelHe: e.target.value })}
        />
        <select
          className="input w-24"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as InternalField['type'] })}
        >
          <option value="number">{t('templates.typeNumber')}</option>
          <option value="text">{t('templates.typeText')}</option>
        </select>
        <button
          className="btn btn-sm"
          disabled={busy || !draft.key.trim() || !draft.labelHe.trim()}
          onClick={() => save([...current, { ...draft, key: draft.key.trim(), labelHe: draft.labelHe.trim() }])}
        >
          {t('templates.addInternal')}
        </button>
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  );
}

function ExamplesSection({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Example[]>(template?.examples ?? []);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(template?.examples ?? []), [template?.examples]);

  const update = (i: number, k: keyof Example, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const save = async () => {
    setBusy(true);
    try {
      await api.updateTemplateMeta({
        type,
        examples: rows.filter((r) => r.title.trim() && r.url.trim()),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-paper-2 pt-4">
      <div className="mb-2 text-sm font-semibold text-tx-soft">{t('templates.section.examples')}</div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input"
              placeholder={t('templates.exampleTitle')}
              value={row.title}
              onChange={(e) => update(i, 'title', e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              placeholder="https://…"
              value={row.url}
              onChange={(e) => update(i, 'url', e.target.value)}
            />
            <button className="btn btn-sm" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn btn-sm" onClick={() => setRows((r) => [...r, { title: '', url: '' }])}>
          + {t('templates.addExample')}
        </button>
        <button className="btn btn-gold btn-sm" disabled={busy} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

function SkillSection({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  const [md, setMd] = useState(template?.skillMd ?? '');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMd(template?.skillMd ?? ''), [template?.skillMd]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setMd(await f.text());
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.updateTemplateMeta({ type, skillMd: md });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-paper-2 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-tx-soft">{t('templates.section.skill')}</span>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => setPreview((p) => !p)}>
            {preview ? t('templates.editMd') : t('templates.preview')}
          </button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            {t('templates.uploadMd')}
          </button>
          <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown" hidden onChange={onFile} />
        </div>
      </div>
      {preview ? (
        <div
          className="prose-sm min-h-24 rounded border border-paper-2 bg-surface-2 p-3 text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:font-semibold [&_li]:list-disc [&_ul]:mr-5"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
        />
      ) : (
        <textarea
          className="input min-h-32 font-mono text-xs"
          dir="auto"
          placeholder={t('templates.skillPlaceholder')}
          value={md}
          onChange={(e) => setMd(e.target.value)}
        />
      )}
      <button className="btn btn-gold btn-sm mt-2" disabled={busy} onClick={save}>
        {t('common.save')}
      </button>
    </div>
  );
}

// AI tips on improving the drafting skills, grounded in participants' feedback.
function SkillTipsSection({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  const run = useLatestSkillTips(type);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      await api.generateSkillTips({ type });
      setApplied(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = async (i: number, text: string) => {
    setBusy(true);
    setError('');
    try {
      const current = template?.skillMd?.trim() ?? '';
      await api.updateTemplateMeta({ type, skillMd: current ? `${current}\n\n${text}` : text });
      setApplied((s) => new Set(s).add(i));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-paper-2 pt-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-tx-soft">{t('tips.title')}</span>
        <button className="btn btn-sm" disabled={busy} onClick={generate}>
          {busy ? t('tips.generating') : `✨ ${t('tips.generate')}`}
        </button>
      </div>
      <p className="mb-2 text-xs text-tx-mute">{t('tips.hint')}</p>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      {run && (
        <div className="space-y-2">
          <div className="text-xs text-tx-mute">
            {t('tips.basedOn', { n: run.aggregate.responses, days: run.windowDays })} ·{' '}
            <span dir="ltr">{new Date(run.createdAt).toLocaleString('he-IL')}</span>
          </div>
          {run.tips.length === 0 ? (
            <div className="text-sm text-tx-mute">{t('tips.none')}</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {run.tips.map((tip, i) => (
                <li key={i} className="rounded border border-paper-2 p-2">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="chip" dir="ltr">
                      {tip.target === 'skillMd' ? t('tips.targetSkillMd') : tip.target}
                    </span>
                    <span className="text-xs text-tx-mute">{tip.evidence.counts}</span>
                  </div>
                  <div className="font-medium">{tip.problemHe}</div>
                  <div className="text-tx-soft">{tip.suggestionHe}</div>
                  {tip.proposedSkillMdText ? (
                    <>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-paper-2 p-2 text-xs" dir="auto">
                        {tip.proposedSkillMdText}
                      </pre>
                      <button
                        className="btn btn-sm mt-1"
                        disabled={busy || applied.has(i)}
                        onClick={() => apply(i, tip.proposedSkillMdText!)}
                      >
                        {applied.has(i) ? `✓ ${t('tips.applied')}` : t('tips.apply')}
                      </button>
                    </>
                  ) : (
                    tip.target !== 'skillMd' && <div className="mt-1 text-xs text-amber-700">{t('tips.needsSkillFile')}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TypeCard({ type, template }: { type: TenderType; template?: TemplateDoc }) {
  const { t } = useTranslation();
  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-semibold">{t(`type.${type}`)}</h2>
      <BindSection type={type} template={template} />
      <InternalFieldsSection type={type} template={template} />
      <ExamplesSection type={type} template={template} />
      <SkillSection type={type} template={template} />
      <SkillTipsSection type={type} template={template} />
      <TypeSkills type={type} />
    </div>
  );
}

export default function Templates() {
  const { t } = useTranslation();
  const templates = useTemplates();
  const byType = (ty: TenderType) => templates.find((tpl) => tpl.type === ty);

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl font-bold">{t('templates.title')}</h1>
      <p className="mb-6 text-sm text-tx-soft">{t('templates.intro')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(TENDER_TYPES).map((ty) => (
          <TypeCard key={ty} type={ty} template={byType(ty)} />
        ))}
      </div>
      <SkillsCatalog />
    </div>
  );
}
