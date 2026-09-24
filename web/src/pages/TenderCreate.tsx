import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TENDER_TYPES, type TenderType } from '@obms/shared';
import { useTemplate } from '../lib/hooks';
import { api } from '../lib/api';
import TagsInput from '../components/TagsInput';

type Criterion = { name: string; weight: number };

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TenderCreate() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TenderType>(TENDER_TYPES.goods);
  const [deadline, setDeadline] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [domainTags, setDomainTags] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = useTemplate(type);

  const setParam = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v }));

  const runDraft = async () => {
    if (brief.trim().length < 3) return;
    setDrafting(true);
    setError('');
    try {
      const d = await api.draftBid({ type, brief });
      if (d.title) setTitle(d.title);
      setParams(Object.fromEntries(Object.entries(d.params ?? {}).map(([k, v]) => [k, String(v)])));
      setDomainTags(d.domainTags ?? []);
      setCriteria(d.evaluationCriteria ?? []);
      if (d.submissionDeadlineDays)
        setDeadline(toLocalInput(Date.now() + d.submissionDeadlineDays * 86400000));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const numericParams: Record<string, string | number> = {};
      for (const p of template?.params ?? []) {
        const raw = params[p.key] ?? '';
        numericParams[p.key] = p.type === 'number' && raw !== '' ? Number(raw) : raw;
      }
      const { id } = await api.createTender({
        title,
        type,
        params: numericParams,
        submissionDeadline: deadline ? new Date(deadline).getTime() : null,
        domainTags,
        evaluationCriteria: criteria,
      });
      nav(`/tenders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-2xl font-bold">{t('create.title')}</h1>
      <p className="mb-6 text-sm text-tx-soft">{t('create.typeNote')}</p>

      {/* Agentic brief → AI draft */}
      <div className="card mb-5 space-y-3 p-6">
        <div>
          <label className="label">{t('create.type')}</label>
          <select
            className="input"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TenderType);
              setParams({});
            }}
          >
            {Object.values(TENDER_TYPES).map((tt) => (
              <option key={tt} value={tt}>
                {t(`type.${tt}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('create.brief')}</label>
          <textarea
            className="input min-h-20"
            placeholder={t('create.briefPlaceholder')}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-gold" disabled={drafting || brief.trim().length < 3} onClick={runDraft}>
          {drafting ? t('create.drafting') : `✨ ${t('create.aiDraft')}`}
        </button>
        <p className="text-xs text-tx-mute">{t('create.aiDraftHint')}</p>
      </div>

      <form onSubmit={submit} className="card space-y-5 p-6">
        <div>
          <label className="label">{t('create.tenderTitle')}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        {template?.params.map((p) => (
          <div key={p.key}>
            <label className="label">{p.labelHe}</label>
            {p.type === 'textarea' ? (
              <textarea
                className="input min-h-20"
                value={params[p.key] ?? ''}
                onChange={(e) => setParam(p.key, e.target.value)}
                required={p.required}
              />
            ) : (
              <input
                className="input"
                type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
                value={params[p.key] ?? ''}
                onChange={(e) => setParam(p.key, e.target.value)}
                required={p.required}
              />
            )}
          </div>
        ))}

        <div>
          <label className="label">{t('create.domainTags')}</label>
          <TagsInput value={domainTags} onChange={setDomainTags} placeholder={t('create.domainTagsHint')} />
        </div>

        {criteria.length > 0 && (
          <div>
            <label className="label">{t('create.criteria')}</label>
            <div className="flex flex-wrap gap-2">
              {criteria.map((c, i) => (
                <span key={i} className="chip flex items-center gap-1">
                  {c.name} · {c.weight}%
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => setCriteria((cs) => cs.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">{t('create.deadline')}</label>
          <input
            className="input"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        <button className="btn btn-gold" disabled={busy}>
          {busy ? t('create.creating') : t('create.submit')}
        </button>
      </form>
    </div>
  );
}
