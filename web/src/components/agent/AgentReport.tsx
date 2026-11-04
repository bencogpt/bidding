import { useState } from 'react';
import {
  BLANK_LINE,
  REQUIRED_BLANK_RE,
  REQUIRED_SKILLS,
  agentChip,
  fmtStamp,
  type AgentRunState,
  type FindingView,
  type FindingsView,
  type TemplateDoc,
  type TenderDoc,
} from '@obms/shared';
import { useTenderInternal } from '../../lib/hooks';
import ThinkingBox, { usePacedStep } from './ThinkingBox';
import { AgentChip, SeverityChip } from './Chips';

type Filter = '' | 'block' | 'warn' | 'done' | 'skip';

const TYPE_HE: Record<TenderDoc['type'], string> = { goods: 'טובין', service: 'שירות וכוח אדם', project: 'פרויקטלי' };

/**
 * "דוח הסוכן המפקח" — the agent tab (prototype renderAgent, lines 2616–2650): the run, the template and skills
 * it checked against, every finding with its decision (incorporate, or leave as is), and on the document the
 * fields without a source or still to complete. "↻ הרץ בדיקה" is the tab's filled button.
 */
export default function AgentReport({
  tender,
  template,
  view,
  agent,
  serverStep,
  on,
  creating,
  lastAt,
  canManage,
  busy,
  onRun,
  onApply,
  onApplyAll,
  onSkip,
  onEditField,
}: {
  tender: TenderDoc;
  template: TemplateDoc | null;
  view: FindingsView;
  agent: AgentRunState;
  serverStep?: number | null;
  on: 'draft' | 'document';
  creating: boolean;
  lastAt?: number | null;
  canManage: boolean;
  busy: boolean;
  onRun: () => void;
  onApply: (f: FindingView) => void;
  onApplyAll: () => void;
  onSkip: (f: FindingView) => void;
  onEditField: (paramKey: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('');
  const step = usePacedStep(agent === 'running', serverStep);
  const { provenance } = useTenderInternal(tender.id);
  const where = on === 'draft' ? 'בטיוטה' : 'במסמך';
  const chip = agentChip(agent, view);
  const disabled = agent === 'running' || creating || busy;

  const { open, applied, skipped, blocking, warnings } = view;
  const list =
    filter === 'block' ? blocking : filter === 'warn' ? warnings : filter === 'done' ? applied : filter === 'skip' ? skipped : open;

  const used = new Set((provenance?.skillsUsed ?? []).map((s) => s.id));
  const required = ['GLOBAL_RULES', ...REQUIRED_SKILLS[tender.type]];
  const missingSkills = required.filter((id) => !used.has(id as never));

  // On the document: fields printed blank (to complete) and values with no recorded source (G11).
  const labelOf = (k: string) => template?.params.find((p) => p.key === k)?.labelHe ?? k;
  type SourceRow = { k: string; value: string; kind: 'mgr' | 'nosrc' };
  const sources = Object.entries(tender.params).flatMap(([k, v]): SourceRow[] => {
    const text = String(v ?? '');
    if (text === BLANK_LINE || [...text.matchAll(REQUIRED_BLANK_RE)].length) return [{ k, value: '', kind: 'mgr' }];
    const sourced = !!provenance?.paramSources[k] || !!provenance?.editedByManager.includes(k) || !provenance?.draftId;
    return sourced ? [] : [{ k, value: text, kind: 'nosrc' }];
  });

  const filterButton = (k: Filter, label: string, n: number, color?: string) => (
    <button
      key={k || 'all'}
      type="button"
      className="rounded-full px-3 py-1 text-xs"
      style={
        filter === k
          ? { background: 'var(--brand-soft)', color: 'var(--brand)', fontWeight: 600 }
          : { color: color ?? 'var(--muted)', border: '1px solid var(--line)' }
      }
      onClick={() => setFilter(filter === k ? '' : k)}
    >
      {label} {n}
    </button>
  );

  return (
    <div className="border px-6 py-5" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-lg font-semibold">
            דוח הסוכן המפקח <AgentChip tone={chip.tone}>{chip.label}</AgentChip>
          </h2>
          <div className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>
            בודק שהמסמך נוצר מהתבנית הנכונה, עם המיומנויות הנדרשות, וללא ערכים שאין להם מקור. ממצא חוסם מונע פרסום לספקים.
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={onRun}>
          ↻ הרץ בדיקה
        </button>
      </div>

      {agent === 'none' && (
        <div className="py-8 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
          {on === 'draft' ? 'הסוכן טרם בדק את הטיוטה.' : 'הסוכן טרם בדק את המסמך.'}
          <br />
          <button type="button" className="btn btn-primary mt-3" disabled={disabled} onClick={onRun}>
            {on === 'draft' ? 'הרץ סוכן מפקח על הטיוטה' : 'הרץ סוכן מפקח על המסמך'}
          </button>
        </div>
      )}
      {agent === 'running' && <ThinkingBox on={on} step={step} />}
      {agent === 'done' && (
        <div className="mt-4 space-y-3">
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            בוצעה · {lastAt ? fmtStamp(lastAt) : '—'} · נבדק על {on === 'draft' ? 'הטיוטה' : 'המסמך'}
          </div>
          <div className="text-[13px]">
            תבנית מכרז {TYPE_HE[tender.type]}
            {template?.title ? ` · ${template.title}` : ''} · {provenance?.draftId ? 'נוצר מטיוטת AI' : 'טיוטה'}
          </div>
          <details
            open
            className="border px-4 py-3 text-[13px]"
            style={{ background: 'var(--bg)', borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-card)' }}
          >
            <summary className="cursor-pointer">
              מיומנויות נדרשות ({required.length}) · {missingSkills.length ? `${missingSkills.length} חסרות` : 'כולן תקינות'}
            </summary>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" dir="ltr">
              {required.map((id) => (
                <span key={id} className="inline-flex items-center gap-1">
                  <i className="not-italic" style={{ color: used.has(id as never) ? 'var(--ok)' : 'var(--bad)' }}>
                    {used.has(id as never) ? '✓' : '✗'}
                  </i>
                  {id}
                </span>
              ))}
            </div>
          </details>

          <div className="flex flex-wrap gap-1.5">
            {filterButton('', 'הכול', open.length)}
            {filterButton('block', 'חוסמים', blocking.length, 'var(--bad)')}
            {filterButton('warn', 'אזהרות', warnings.length, '#9a6a00')}
            {applied.length > 0 && filterButton('done', 'הוטמעו', applied.length, 'var(--ok)')}
            {skipped.length > 0 && filterButton('skip', 'הושארו', skipped.length)}
          </div>

          {canManage && warnings.length > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]"
              style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius-card)' }}
            >
              <span>הסוכן הציע תיקון לכל ממצא. אתם מחליטים מה להטמיע {where} ומה להשאיר כמו שהוא.</span>
              <button type="button" className="btn btn-apply btn-sm" disabled={disabled} onClick={onApplyAll}>
                הטמע את כל הממצאים ({warnings.length})
              </button>
            </div>
          )}
          {applied.length > 0 && (
            <div className="px-3 py-2 text-[13px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
              הוטמעו {applied.length} ממצאים. הריצו בדיקה כדי לאמת שהם נפתרו.
            </div>
          )}
          {blocking.length > 0 && (
            <div className="px-3 py-2 text-[13px]" style={{ background: '#fdecec', color: 'var(--bad)' }}>
              יש ממצא חוסם: אי אפשר לפרסם לספקים או לתת אישור סופי עד שיטופל.
            </div>
          )}

          {list.length ? (
            <div className="flex flex-col gap-2.5">
              {list.map((f) => (
                <ReportCard
                  key={f.key}
                  f={f}
                  where={where}
                  canManage={canManage}
                  busy={disabled}
                  canEditField={on === 'draft'}
                  onApply={() => onApply(f)}
                  onSkip={() => onSkip(f)}
                  onEditField={() => f.paramKey && onEditField(f.paramKey)}
                />
              ))}
            </div>
          ) : (
            <div className="py-3.5 text-[13px]" style={{ color: 'var(--muted)' }}>
              {filter === 'done'
                ? 'עדיין לא הוטמעו ממצאים.'
                : filter === 'skip'
                  ? 'לא הושארו ממצאים.'
                  : open.length
                    ? 'אין ממצאים בסינון הזה.'
                    : 'אין ממצאים פתוחים.'}
            </div>
          )}
          {filter === '' && view.info.length > 0 && (
            <div className="flex flex-col gap-2">
              {view.info.map((f) => (
                <div key={f.key} className="border px-4 py-2.5 text-[13px]" style={{ borderColor: 'var(--line-soft)' }}>
                  <AgentChip tone="neutral">מידע</AgentChip> <b className="font-semibold">{f.typeHe}</b>{' '}
                  <small style={{ color: 'var(--muted)' }}>{f.location}</small>
                  <p className="mb-0 mt-1">{f.message}</p>
                </div>
              ))}
            </div>
          )}

          {on === 'document' && sources.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer">
                מקור הערכים ({sources.length}) · {sources.filter((s) => s.kind === 'nosrc').length} ללא מקור ·{' '}
                {sources.filter((s) => s.kind === 'mgr').length} להשלמה
              </summary>
              <table className="mt-2 w-full text-start text-[13px]">
                <thead>
                  <tr style={{ color: 'var(--muted)' }}>
                    <th className="py-1 text-start font-normal">שדה</th>
                    <th className="py-1 text-start font-normal">ערך</th>
                    <th className="py-1 text-start font-normal">מקור</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.k} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td className="py-1.5">{labelOf(s.k)}</td>
                      <td className="py-1.5">{s.value || '__________'}</td>
                      <td className="py-1.5">
                        {s.kind === 'nosrc' ? <AgentChip tone="wrn">ללא מקור</AgentChip> : <AgentChip tone="neutral">מנהל המכרז</AgentChip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/** A finding in the report: open (incorporate / leave as is), incorporated, or left as is. */
function ReportCard({
  f,
  where,
  canManage,
  busy,
  canEditField,
  onApply,
  onSkip,
  onEditField,
}: {
  f: FindingView;
  where: string;
  canManage: boolean;
  busy: boolean;
  canEditField: boolean;
  onApply: () => void;
  onSkip: () => void;
  onEditField: () => void;
}) {
  const block = f.severity === 'block';
  const state = f.applied ? 'applied' : f.skipped ? 'skipped' : 'open';
  const accent = state === 'applied' ? 'var(--ok)' : state === 'skipped' ? 'var(--line)' : block ? '#d64545' : '#e0a030';
  return (
    <div
      className="border px-4 py-3"
      style={{
        borderColor: 'var(--line-soft)',
        borderInlineStartWidth: 3,
        borderInlineStartColor: accent,
        background: state === 'open' && block ? '#fffafa' : state === 'applied' ? 'color-mix(in srgb, var(--ok) 5%, transparent)' : 'var(--panel)',
        opacity: state === 'skipped' ? 0.75 : 1,
        borderRadius: 'var(--radius-card)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {state === 'applied' ? (
          <AgentChip tone="ok">הוטמע</AgentChip>
        ) : state === 'skipped' ? (
          <AgentChip tone="neutral">הושאר</AgentChip>
        ) : (
          <SeverityChip severity={block ? 'block' : 'warn'} />
        )}
        <b className="font-semibold">{f.typeHe}</b>
        <small style={{ color: 'var(--muted)' }}>{f.location}</small>
      </div>
      {state === 'applied' ? (
        <p className="mb-0 mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>
          {f.fix || f.message}
        </p>
      ) : (
        <>
          <p className="mb-0 mt-2 text-[13px] leading-[1.7]">{f.message}</p>
          {state === 'open' && f.evidence && f.source === 'ai' && (
            <blockquote
              className="mx-0 mb-0 mt-2 px-3 py-1.5 text-xs"
              style={{ borderInlineStart: '2px solid var(--line)', color: 'var(--muted)', background: 'var(--bg)' }}
              dir="auto"
            >
              {f.evidence}
            </blockquote>
          )}
          {state === 'open' && f.fix && (
            <div className="mt-2.5 px-3 py-2 text-[13px] leading-[1.6]" style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius-card)' }}>
              <span className="mb-0.5 block text-[11px]" style={{ color: 'var(--accent)' }}>
                הצעת הסוכן
              </span>
              {f.fix}
            </div>
          )}
          {canManage && (
            <div className="mt-2.5 flex items-center gap-2">
              {!block ? (
                <>
                  <button type="button" className="btn btn-apply btn-sm" disabled={busy} onClick={onApply}>
                    הטמע {where}
                  </button>
                  {state === 'open' && (
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={onSkip}>
                      השאר כמו שהוא
                    </button>
                  )}
                </>
              ) : (
                <>
                  {canEditField && f.paramKey && (
                    <button type="button" className="btn btn-apply btn-sm" disabled={busy} onClick={onEditField}>
                      ערוך שדה
                    </button>
                  )}
                  <small className="text-xs" style={{ color: 'var(--muted)' }}>
                    ממצא חוסם
                  </small>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
