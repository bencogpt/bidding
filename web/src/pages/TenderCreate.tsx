import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  TENDER_TYPES,
  TEAM_ROLES,
  isConfidentialParam,
  requiredRolesFor,
  templateFieldsStatus,
  type CaseTeam,
  type TeamRole,
  type TenderType,
} from '@obms/shared';
import { useTemplate, useUsers } from '../lib/hooks';
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
  // AI draft provenance: linked to the tender so the supervisor can trace every value.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = useTemplate(type);
  const users = useUsers();
  // Case team: one user per required role (type defaults + roles the manager adds).
  const [team, setTeam] = useState<CaseTeam>({});
  const [extraRoles, setExtraRoles] = useState<TeamRole[]>([]);
  const requiredRoles = requiredRolesFor(type, extraRoles);
  // A template that still has Word-style blanks (XXXX / ____) can't be used until it is converted.
  const templateStatus = template
    ? templateFieldsStatus(template.bodyTemplate ?? '', template.supplierFillQuotes ?? [])
    : null;
  const notConverted = templateStatus?.status === 'needs_conversion';

  const setParam = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v }));

  const runDraft = async () => {
    if (brief.trim().length < 3) return;
    setDrafting(true);
    setError('');
    try {
      const d = await api.draftBid({ type, brief });
      setDraftId(d.draftId);
      const labelOf = (k: string) => template?.params.find((p) => p.key === k)?.labelHe ?? k;
      setDraftNote(
        d.status === 'FAILED'
          ? t('create.draftFailed')
          : d.missing.length
            ? t('create.draftMissing', { fields: d.missing.map(labelOf).join(', ') })
            : '',
      );
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
        draftId: draftId ?? undefined,
        team: Object.fromEntries(requiredRoles.filter((r) => team[r]).map((r) => [r, team[r]])),
        extraRoles,
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
              setDraftId(null); // a draft is bound to the template type it was made for
              setDraftNote('');
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
        {draftNote && <div className="rounded bg-amber-100 p-2 text-xs text-amber-700">{draftNote}</div>}
      </div>

      {notConverted && (
        <div className="card mb-5 border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {t('conv.createBlocked', { n: templateStatus!.unresolved })}
        </div>
      )}
      <form onSubmit={submit} className="card space-y-5 p-6">
        <div>
          <label className="label">{t('create.tenderTitle')}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        {template?.params.map((p) => (
          <div key={p.key}>
            <label className="label">
              {p.labelHe}
              {isConfidentialParam(p) && <span className="mr-2 text-xs text-red-600">{t('create.confidential')}</span>}
            </label>
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
          <label className="label">{t('team.title')}</label>
          <p className="mb-2 text-xs text-tx-mute">{t('team.createHint')}</p>
          <div className="space-y-2">
            {requiredRoles.map((r) => (
              <div key={r} className="flex items-center gap-2 text-sm">
                <span className="w-28">{t(`role.${r}`)}</span>
                <select
                  className="input w-56"
                  value={team[r] ?? ''}
                  onChange={(e) => setTeam((tm) => ({ ...tm, [r]: e.target.value || undefined }))}
                >
                  <option value="">{t('team.unassigned')}</option>
                  {users
                    .filter((u) => u.role === r)
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName}
                      </option>
                    ))}
                </select>
                {extraRoles.includes(r) && (
                  <button type="button" className="text-xs text-red-600" onClick={() => setExtraRoles((x) => x.filter((y) => y !== r))}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {TEAM_ROLES.some((r) => !requiredRoles.includes(r)) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-tx-soft">{t('team.addRole')}:</span>
              {TEAM_ROLES.filter((r) => !requiredRoles.includes(r)).map((r) => (
                <button key={r} type="button" className="chip" onClick={() => setExtraRoles((x) => [...x, r])}>
                  + {t(`role.${r}`)}
                </button>
              ))}
            </div>
          )}
        </div>

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
        <button className="btn btn-gold" disabled={busy || notConverted}>
          {busy ? t('create.creating') : t('create.submit')}
        </button>
      </form>
    </div>
  );
}
