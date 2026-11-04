import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  TENDER_TYPES,
  TEAM_ROLES,
  isConfidentialParam,
  requiredRolesFor,
  templateFieldsStatus,
  hasPlaceholder,
  publicDetails,
  fillFromRequestDetails,
  isAutoSerialParam,
  askedParams,
  guaranteeDefault,
  shekelsInWords,
  SERVICE_KEYS,
  type TemplateParam,
  resolveParam,
  hebrewLabel,
  isAutoParam,
  isAutoDeadlineParam,
  type CaseTeam,
  type TeamRole,
  type TenderType,
} from '@obms/shared';
import { useBidRequest, useTemplate, useUsers } from '../lib/hooks';
import { api } from '../lib/api';
import TagsInput from '../components/TagsInput';
import RequestSnapshot from '../components/RequestSnapshot';
import Avatar from '../components/Avatar';
import ChainBar from '../components/ChainBar';
import SectionCard, { StatusChip } from '../components/SectionCard';
import { useAuth } from '../auth/AuthProvider';

type Criterion = { name: string; weight: number };

// The type the request reads like (the manager still chooses): the one whose key words appear most.
const TYPE_HINTS: [TenderType, RegExp][] = [
  ['service', /נותני שירות|כוח אדם|צוות|תחזוק|פיתוח|שירותים|SLA/g],
  ['goods', /טובין|רכישת|אספקת|ציוד|מדפסות|ריהוט/g],
  ['project', /פרויקט|תוצרים|אבני דרך|אבן דרך/g],
];
function suggestType(text: string): TenderType | '' {
  let best: TenderType | '' = '';
  let score = 0;
  for (const [type, re] of TYPE_HINTS) {
    const n = text.match(re)?.length ?? 0;
    if (n > score) {
      score = n;
      best = type;
    }
  }
  return best;
}

/** dd.mm hh:mm in Israel time. */
function fmtSent(ms: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// On a template with a field order, the submission deadline sits after the fields numbered below
// DEADLINE_ORDER, the case team after those below TEAM_ORDER and the domain tags after those below TAGS_ORDER.
const DEADLINE_ORDER = 9;
const TEAM_ORDER = 11;
const TAGS_ORDER = 15;
const YES = 'כן';
const NO = 'לא';

export default function TenderCreate() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { serial } = useParams();
  const { request } = useBidRequest(serial);
  const { user } = useAuth();
  const brief = request?.brief ?? '';
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TenderType | ''>('');
  const [deadline, setDeadline] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [domainTags, setDomainTags] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  // AI draft provenance: linked to the tender so the supervisor can trace every value.
  const [draftId, setDraftId] = useState<string | null>(null);
  // The draft outcome is kept as data and turned into text at render time, so labels come from the current template.
  const [draftFailed, setDraftFailed] = useState(false);
  const [draftMissing, setDraftMissing] = useState<string[]>([]);
  // Bumped on every type pick; a draft response whose number is stale belongs to a type no longer selected.
  const draftSeq = useRef(0);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = useTemplate(type || undefined);
  // One id per form: if a submission's answer is lost and the user retries, the server returns the
  // case it already created instead of making a copy.
  const requestId = useRef(crypto.randomUUID());
  const users = useUsers();
  // Case team: one user per required role (type defaults + roles the manager adds).
  const [team, setTeam] = useState<CaseTeam>({});
  const [extraRoles, setExtraRoles] = useState<TeamRole[]>([]);
  // The person who opened the request is the default case requester (never overrides a manager's pick).
  const openerUid = request?.requesterUid;
  const openerIsRequester = users.some((u) => u.uid === openerUid && u.role === 'requester');
  useEffect(() => {
    if (!openerUid || !openerIsRequester) return;
    setTeam((tm) => (tm.requester ? tm : { ...tm, requester: openerUid }));
  }, [openerUid, openerIsRequester]);
  const requiredRoles = requiredRolesFor(type || TENDER_TYPES.service, extraRoles);
  // A template that still has Word-style blanks (XXXX / ____) can't be used until it is converted.
  const templateStatus = template
    ? templateFieldsStatus(template.bodyTemplate ?? '', template.supplierFillQuotes ?? [])
    : null;
  const notConverted = templateStatus?.status === 'needs_conversion';

  const setParam = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v }));

  // The fields the form asks for, in the template's order. System-filled and hidden ones are not here.
  const asked = askedParams((template?.params ?? []).map(resolveParam)); // Hebrew labels, date fields as dates
  const ordered = asked.some((p) => p.order !== undefined);
  const beforeDeadline = ordered ? asked.filter((p) => (p.order ?? Infinity) < DEADLINE_ORDER) : asked;
  const orderOf = (p: TemplateParam) => p.order ?? Infinity;
  // System-filled fixed values the form shows read-only, in their place among the asked fields.
  const shown = ordered ? (template?.params ?? []).map(resolveParam).filter((p) => p.display && p.fill?.kind === 'fixed') : [];
  const beforeTeam = ordered
    ? [...asked, ...shown]
        .filter((p) => orderOf(p) >= DEADLINE_ORDER && orderOf(p) < TEAM_ORDER)
        .sort((a, b) => orderOf(a) - orderOf(b))
    : [];
  const afterTags = ordered ? asked.filter((p) => orderOf(p) >= TAGS_ORDER) : [];
  const qualitative = params.is_qualitative === YES;
  // A field with a default (the bid guarantee) shows it until the manager types a value; the checkbox
  // starts unticked; a non-qualitative bid is scored 100% on price.
  const valueOf = (p: TemplateParam): string => {
    if (p.type === 'checkbox') return params[p.key] ?? NO;
    if (p.key === SERVICE_KEYS.economicPct && !qualitative) return '100';
    return (
      params[p.key] ??
      (p.defaultFrom === 'guarantee_pct'
        ? String(guaranteeDefault((request?.details as Record<string, unknown> | undefined)?.annual_budget ?? params[SERVICE_KEYS.estimate]) ?? '')
        : '')
    );
  };
  const runDraft = async (forType: TenderType) => {
    if (brief.trim().length < 3) return;
    const seq = draftSeq.current;
    setDrafting(true);
    setError('');
    try {
      const d = await api.draftBid({ type: forType, brief, bidRequestId: serial });
      if (seq !== draftSeq.current) return; // a newer pick owns the form and the drafting flag
      setDraftId(d.draftId);
      setDraftFailed(d.status === 'FAILED');
      setDraftMissing(d.status === 'FAILED' ? [] : d.missing);
      const answers = publicDetails(request?.details);
      // The service name the requester gave is the tender title.
      const named = String(answers.service_name ?? '').trim();
      // A {{PLACEHOLDER}} the draft left behind is never shown: the field stays empty (and is listed as missing).
      const draftTitle = hasPlaceholder(d.title) ? '' : d.title;
      if (named || draftTitle) setTitle(named || draftTitle);
      // What the requester answered fills the fields the draft left empty (the same rule the server applies).
      // The template in this closure may still be the previous type's (the pick and the draft run together), so the
      // keys come from the draft and the answers instead; `initial_period_months` is the one derived from the years.
      const keys = new Set([...Object.keys(d.params ?? {}), ...Object.keys(answers), 'initial_period_months']);
      const clean = Object.fromEntries(Object.entries(d.params ?? {}).filter(([, v]) => !hasPlaceholder(v)));
      const filled = fillFromRequestDetails([...keys].map((key) => ({ key })), clean, request?.details);
      setParams(Object.fromEntries(Object.entries(filled).map(([k, v]) => [k, String(v)])));
      setDomainTags(d.domainTags ?? []);
      setCriteria(d.evaluationCriteria ?? []);
      if (d.submissionDeadlineDays) setDeadline(toLocalInput(Date.now() + d.submissionDeadlineDays * 86400000));
    } catch (err) {
      if (seq !== draftSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === draftSeq.current) setDrafting(false);
    }
  };

  // Picking (or changing) the type discards the previous draft and drafts again from that template.
  const pickType = (next: TenderType | '') => {
    draftSeq.current += 1;
    setDrafting(false);
    setError('');
    setType(next);
    setParams({});
    setTitle('');
    setDomainTags([]);
    setCriteria([]);
    setDeadline('');
    setDraftId(null); // a draft is bound to the template type it was made for
    setDraftFailed(false);
    setDraftMissing([]);
    if (next) void runDraft(next);
  };

  // Fields still holding the AI draft's {{PLACEHOLDER}} — the brief didn't give the value.
  const unfilled = asked.filter((p) => hasPlaceholder(params[p.key]));

  const labelOf = (k: string) => hebrewLabel(k, template?.params.find((p) => p.key === k)?.labelHe ?? k);
  const draftNote = draftFailed
    ? t('create.draftFailed')
    : draftMissing.length
      ? t('create.draftMissing', { fields: draftMissing.map(labelOf).join(', ') })
      : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !serial) return;
    if (unfilled.length) {
      setError(t('create.fillPlaceholders', { fields: unfilled.map((p) => p.labelHe).join(', ') }));
      document.getElementById(`param-${unfilled[0].key}`)?.focus();
      return;
    }
    if (ordered) {
      const missingTeam = requiredRoles.filter((r) => !team[r]);
      if (missingTeam.length) {
        setError(t('create.teamRequired', { roles: missingTeam.map((r) => t(`role.${r}`)).join(', ') }));
        return;
      }
      if (!domainTags.length) {
        setError(t('create.tagsRequired'));
        return;
      }
      if (!deadline) {
        setError(t('create.deadlineRequired'));
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const numericParams: Record<string, string | number> = {};
      for (const p of asked) {
        const raw = valueOf(p);
        numericParams[p.key] = p.type === 'number' && raw !== '' ? Number(raw) : raw;
      }
      const { id } = await api.createTender({
        title,
        bidRequestId: serial,
        type,
        params: numericParams,
        submissionDeadline: deadline ? new Date(deadline).getTime() : null,
        domainTags,
        evaluationCriteria: criteria,
        // Omit the key when there is no AI draft: the callable client turns undefined into null,
        // which the optional string field on the server rejects.
        ...(draftId ? { draftId } : {}),
        requestId: requestId.current,
        team: Object.fromEntries(requiredRoles.filter((r) => team[r]).map((r) => [r, team[r]])),
        extraRoles,
      });
      nav(`/tenders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const renderParam = (p: TemplateParam) => {
    if (p.display && p.fill?.kind === 'fixed') {
      return (
        <div key={p.key}>
          <label className="label">{p.labelHe}</label>
          <input id={`param-${p.key}`} className="input bg-paper-2" value={p.fill.value} readOnly />
        </div>
      );
    }
    const raw = valueOf(p);
    const value = hasPlaceholder(raw) ? '' : raw; // whatever the source, a {{placeholder}} never reaches an input
    return (
      <div key={p.key}>
        <label className="label">
          {p.labelHe}
          {p.required && <span className="text-red-600"> *</span>}
          {isConfidentialParam(p) && <span className="mr-2 text-xs text-red-600">{t('create.confidential')}</span>}
        </label>
        {p.type === 'checkbox' ? (
          <input
            id={`param-${p.key}`}
            type="checkbox"
            checked={value === YES}
            onChange={(e) => setParam(p.key, e.target.checked ? YES : NO)}
          />
        ) : p.type === 'textarea' ? (
          <textarea
            id={`param-${p.key}`}
            className="input min-h-20"
            value={value}
            onChange={(e) => setParam(p.key, e.target.value)}
            required={p.required}
          />
        ) : (
          <input
            id={`param-${p.key}`}
            className="input"
            type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
            value={value}
            onChange={(e) => setParam(p.key, e.target.value)}
            required={p.required}
            min={p.key === SERVICE_KEYS.economicPct ? 0 : undefined}
            max={p.key === SERVICE_KEYS.economicPct ? 100 : undefined}
            disabled={p.key === SERVICE_KEYS.economicPct && !qualitative}
          />
        )}
        {p.key === SERVICE_KEYS.economicPct && Number(value) >= 0 && Number(value) <= 100 && value !== '' && (
          <div className="mt-1 text-xs text-tx-mute">{t('create.qualityShare', { pct: 100 - Number(value) })}</div>
        )}
        {p.defaultFrom === 'guarantee_pct' && (
          <div className="mt-1 text-xs text-tx-mute">
            {t('create.guaranteeHint')}
            {Number(value) > 0 && Number(value) <= 999_999_999 && ` · ${shekelsInWords(Number(value))}`}
          </div>
        )}
      </div>
    );
  };

  const deadlineField = (
    <div>
      <label className="label">
        {t('create.deadline')}
        {ordered && <span className="text-red-600"> *</span>}
      </label>
      <input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required={ordered || !!template?.params.some(isAutoDeadlineParam)} />
    </div>
  );

  const sentAt = request ? fmtSent(request.createdAt) : '';
  const suggested = request ? suggestType(`${String((request.details as Record<string, unknown> | undefined)?.service_name ?? '')} ${request.brief}`) : '';
  const meName = user?.displayName || user?.email || '';

  if (request === undefined) return <div className="p-6 text-tx-soft">{t('common.loading')}</div>;
  if (request === null) return <div className="p-6 text-red-600">{t('req.notFound')}</div>;
  if (request.status === 'converted')
    return (
      <div className="mx-auto max-w-2xl card space-y-3 p-6">
        <div>{t('req.alreadyConverted')}</div>
        {request.tenderId && (
          <Link to={`/tenders/${request.tenderId}`} className="btn btn-gold">
            {t('req.openCase')}
          </Link>
        )}
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 font-display text-2xl font-bold">
        {t('nav.newRequest')} · <bdi>{request.serial}</bdi>
      </h1>
      <p className="mb-5 text-sm text-tx-soft">{t('req.phase2Sub', { name: request.requesterName })}</p>
      <ChainBar
        caption={t('req.chainCaption')}
        steps={[
          {
            title: t('req.chainReceived'),
            sub: `${request.requesterName} · ${sentAt}`,
            state: 'done',
            onClick: () => document.getElementById('req-snapshot')?.scrollIntoView({ behavior: 'smooth' }),
          },
          { title: t('req.chainProc'), sub: t('req.chainProcSub'), state: 'cur', nowLabel: t('req.chainNow') },
          { title: t('req.chainDraft'), sub: t('req.chainDraftSub'), state: 'todo' },
        ]}
      />
      {notConverted && (
        <div className="card mb-5 border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {t('conv.createBlocked', { n: templateStatus!.unresolved })}
        </div>
      )}
      <SectionCard
        n={2}
        collapsible
        title={t('req.completeTitle')}
        subtitle={t('req.completeSub')}
        owner={
          <>
            {meName && <Avatar name={meName} size={24} />}
            <span>{meName} · {t('req.procRole')}</span>
            <StatusChip tone="wait">{t('req.statusInProgress')}</StatusChip>
          </>
        }
      >
      <RequestSnapshot id="req-snapshot" request={request} sentAt={sentAt} />
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h3 className="mb-1 font-semibold">{t('req.typeHeading')}</h3>
          <p className="mb-3 text-sm text-tx-soft">{t('req.typeIntro')}</p>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('req.typeHeading')}>
            {(['service', 'goods', 'project'] as const).map((tt) => {
              const on = type === tt;
              const hint = !type && suggested === tt;
              return (
                <button
                  key={tt}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickType(on ? '' : tt)}
                  className={
                    'relative rounded-lg border px-4 py-3 text-start transition ' +
                    (on
                      ? 'border-accent bg-accent-soft ring-1 ring-accent'
                      : hint
                        ? 'border-dashed border-accent hover:bg-accent-soft/50'
                        : 'border-black/10 hover:border-accent')
                  }
                >
                  {hint && (
                    <em className="absolute end-3 top-2.5 rounded-full bg-accent-soft px-2 text-[10px] not-italic leading-4 text-accent">
                      {t('req.suggested')}
                    </em>
                  )}
                  <b className={'mb-1 block text-sm ' + (on ? 'text-accent' : '')}>{t(`type.${tt}`)}</b>
                  <span className="text-xs leading-relaxed text-tx-soft">{t(`type.desc.${tt}`)}</span>
                </button>
              );
            })}
          </div>
          {drafting && <div className="mt-2 text-sm text-tx-soft">{t('create.drafting')}</div>}
          {draftNote && <div className="mt-2 rounded bg-amber-100 p-2 text-xs text-amber-700">{draftNote}</div>}
        </div>
        {type && (
          <>
        <div>
          <label className="label">{t('create.tenderTitle')}</label>
          <input
            className="input"
            value={title}
            placeholder={ordered ? t('create.titleAuto') : undefined}
            onChange={(e) => setTitle(e.target.value)}
            required={!ordered}
          />
        </div>

        {!ordered && template?.params.filter(isAutoParam).map((p) => (
          <div key={p.key} className="rounded bg-paper-2 p-2 text-sm text-tx-soft">
            {p.labelHe}: {isAutoSerialParam(p) ? t('create.autoSerial') : t('create.autoDeadline')}
          </div>
        ))}
        {beforeDeadline.map(renderParam)}
        {ordered && deadlineField}
        {beforeTeam.map(renderParam)}

        <div>
          <label className="label">
            {t('team.title')}
            {ordered && <span className="text-red-600"> *</span>}
          </label>
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
          <label className="label">
            {t('create.domainTags')}
            {ordered && <span className="text-red-600"> *</span>}
          </label>
          <TagsInput value={domainTags} onChange={setDomainTags} placeholder={t('create.domainTagsHint')} />
        </div>

        {afterTags.map(renderParam)}

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

        {!ordered && deadlineField}

          </>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}
        <button className="btn btn-gold" disabled={busy || drafting || !type || notConverted}>
          {busy ? t('create.creating') : t('create.submit')}
        </button>
      </form>
      </SectionCard>
    </div>
  );
}
