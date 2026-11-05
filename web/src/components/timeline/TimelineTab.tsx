import { useEffect, useRef, useState } from 'react';
import {
  ROLE_HE,
  TIMELINE_FIELDS,
  TIMELINE_SUMMARY_HE,
  daysBetween,
  formatShortDate,
  timelineOf,
  type AuditDoc,
  type TeamRole,
  type TenderDoc,
  type TimelineKey,
} from '@obms/shared';
import { api } from '../../lib/api';
import DatePicker from './DatePicker';

const DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']; // v22 DAYS
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const noon = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const weekday = (iso: string) => DAYS[new Date(`${iso}T12:00:00`).getDay()];

/** The chart's groups (v22 TL_GROUPS). */
const GROUPS = ['אפיון ואישורים', 'פרסום המכרז', 'שאלות הבהרה', 'הגשת הצעות והתקשרות'];

interface Milestone {
  group: number;
  label: string;
  kind: 'ידני' | 'ידני, אופציונלי' | 'לוג';
  at: number;
  manual: boolean;
  unset?: boolean;
}

/** v1 of the chart (plan G-D8): the four dates, and the case's real events from the activity log. */
function milestonesOf(tender: TenderDoc, audit: AuditDoc[]): Milestone[] {
  const d = timelineOf(tender);
  const out: Milestone[] = [];
  const log = (group: number, label: string, at: number) => out.push({ group, label, kind: 'לוג', at, manual: false });
  for (const e of [...audit].sort((a, b) => a.at - b.at)) {
    if (e.action === 'create') log(0, 'יצירת הבל"מ', e.at);
    else if (e.action === 'document_generated') log(0, 'יצירת המסמך', e.at);
    else if (e.action === 'approve_tender' || e.action === 'approve_on_behalf')
      log(0, `אישור ${ROLE_HE[(e.newState ?? '') as TeamRole] ?? ''}`.trim(), e.at);
    else if (e.action === 'status_change') {
      if (e.newState === 'internal_review') log(0, 'שליחה לאישור', e.at);
      else if (e.newState === 'ready') log(0, 'בדיקה סופית ונעילה', e.at);
      else if (e.newState === 'published') log(1, 'פרסום לספקים', e.at);
      else if (e.newState === 'responses') log(3, 'הצעה ראשונה', e.at);
      else if (e.newState === 'evaluated') log(3, 'השוואת הצעות', e.at);
      else if (e.newState === 'awarded') log(3, 'בחירת זוכה', e.at);
    }
  }
  const manual = (group: number, label: string, iso: string | null | undefined, optional = false) =>
    out.push({
      group,
      label,
      kind: optional ? 'ידני, אופציונלי' : 'ידני',
      at: iso ? noon(iso) : Date.now(),
      manual: true,
      unset: !iso,
    });
  manual(1, 'כנס ספקים', d.conf, true);
  manual(2, 'מועד אחרון לשאלות', d.qdead);
  manual(3, 'מועד הגשת הצעות', d.submit);
  manual(3, 'תוקף הצעת מחיר', d.valid);
  return out;
}

function Chart({ items }: { items: Milestone[] }) {
  const times = items.map((m) => m.at);
  const lo = Math.min(...times) - 3 * DAY_MS;
  const hi = Math.max(...times) + 3 * DAY_MS;
  const pct = (t: number) => Math.round(((t - lo) / (hi - lo)) * 1000) / 10;
  const week = 7 * DAY_MS;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / week) * week; t < hi; t += week) ticks.push(t);
  const grid = {
    backgroundImage: `repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${((week / (hi - lo)) * 100).toFixed(3)}%)`,
    backgroundPosition: `${(((Math.ceil(lo / week) * week - lo) / (hi - lo)) * 100).toFixed(3)}% 0`,
  };
  return (
    <div className="tlc" dir="ltr">
      {GROUPS.map((g, gi) => (
        <div key={g} className="tlc-g">
          <div className="tlc-gl" dir="rtl">
            {g}
          </div>
          <div className="tlc-rows" style={grid}>
            {items
              .filter((m) => m.group === gi)
              .map((m, i) => {
                const p = pct(m.at);
                const right = p > 62; // labels flip side near the end, as in v22
                return (
                  <div key={`${m.label}-${i}`} className="tlc-row">
                    <i
                      className={`dm ${m.manual && !m.unset ? 'in' : ''} ${m.unset ? 'un' : ''}`}
                      style={{ left: `${p}%` }}
                      title={m.unset ? 'לא נקבע' : new Date(m.at).toLocaleDateString('he-IL')}
                    />
                    <span
                      className="lb"
                      dir="rtl"
                      style={right ? { right: `calc(${100 - p}% + 14px)` } : { left: `calc(${p}% + 14px)` }}
                    >
                      {m.label} — {m.kind}
                      {m.unset ? ' (לא נקבע)' : ''}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <div className="tlc-ax">
        <span />
        <div className="tlc-axl">
          {ticks.map((t) => {
            const d = new Date(t);
            return (
              <em key={t} style={{ left: `${pct(t)}%` }}>
                {pad(d.getDate())}/{pad(d.getMonth() + 1)}
              </em>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * "לוחות זמנים" (prototype v22 renderTl; spec §6.7; plan G-D7, G-D8): procurement enters the four binding dates
 * until the send; they go into the document, the summary and the chart. After a date is added a green notice
 * links to the place in the document (8 seconds, or until the tab changes).
 */
export default function TimelineTab({
  tender,
  canEdit,
  audit,
  onJump,
}: {
  tender: TenderDoc;
  /** Procurement, before the send (G-D7). */
  canEdit: boolean;
  audit: AuditDoc[];
  /** Opens the document at the section ("5", "1", "9"). */
  onJump: (section: string) => void;
}) {
  const d = timelineOf(tender);
  const done = TIMELINE_FIELDS.filter((f) => d[f.key]).length;
  const [toast, setToast] = useState<{ key: TimelineKey; docUpdated: boolean | null } | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const save = async (key: TimelineKey, iso: string | null) => {
    setError('');
    try {
      const res = await api.setTimeline({ tenderId: tender.id, dates: { [key]: iso } });
      if (!iso) return;
      setToast({ key, docUpdated: res.docUpdated ?? null });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const field = TIMELINE_FIELDS.find((f) => f.key === toast?.key);
  const sectionNo = field?.sectionHe.replace(/^סעיף\s*/, '').split('.')[0] ?? '';

  return (
    <div>
      <div className="tl-top">
        <div className="tl-card">
          <div className="tl-h">
            <div>
              <h2>לוחות זמנים</h2>
              <p className="tl-sub">השדות מתעדכנים במסמך המכרז.{canEdit ? '' : ' העריכה בידי הרכש.'}</p>
            </div>
          </div>
          <div className="tl-grid">
            {TIMELINE_FIELDS.map((f) => (
              <div key={f.key} className="tl-c">
                <div className="tl-l">
                  <b>{f.labelHe}</b>
                  {!f.required && <small>לא חובה</small>}
                </div>
                <DatePicker value={d[f.key] ?? null} disabled={!canEdit} onPick={(iso) => void save(f.key, iso)} />
              </div>
            ))}
          </div>
          {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
          {toast && field && (
            <div className="tl-toast" role="status">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M5.2 8.2l2 2 3.6-4" />
              </svg>
              <span>
                <b>התאריך התווסף בהצלחה</b>
                {toast.docUpdated === false ? (
                  // new — UX to confirm: the date appears more than once in the document, so it was not replaced
                  <> · במסמך יש לעדכן אותו ב-Google Docs</>
                ) : (
                  <>
                    {' '}
                    <a onClick={() => onJump(sectionNo)} role="link" tabIndex={0}>
                      ראו ב{field.sectionHe} במסמך ←
                    </a>
                  </>
                )}
              </span>
              <button type="button" onClick={() => setToast(null)} aria-label="סגור">
                ×
              </button>
            </div>
          )}
        </div>

        <aside className="tl-sum">
          <h3>סיכום</h3>
          <div className="ts-bar">
            <i style={{ width: `${Math.round((done / TIMELINE_FIELDS.length) * 100)}%` }} />
          </div>
          <div className="ts-n">
            {done} מתוך {TIMELINE_FIELDS.length} תאריכים הוזנו
          </div>
          {TIMELINE_FIELDS.map((f) => {
            const v = d[f.key];
            const sub = !v ? '' : f.key === 'valid' && d.submit ? `${daysBetween(d.submit, v)} ימים מההגשה` : weekday(v);
            return (
              <div key={f.key} className="ts-r">
                <span>{TIMELINE_SUMMARY_HE[f.key]}</span>
                <b className={v ? '' : 'none'} dir={v ? 'ltr' : undefined}>
                  {v ? formatShortDate(v) : 'לא נקבע'}
                </b>
                {sub && <small>{sub}</small>}
              </div>
            );
          })}
        </aside>
      </div>

      <div className="tl-chart">
        <div className="tl-h">
          <h2>לוח זמנים לדוגמה למכרז</h2>
          <span className="tl-lg">
            <i className="dm in" />
            ידני <i className="dm" />
            לוג / מחושב
          </span>
        </div>
        <Chart items={milestonesOf(tender, audit)} />
      </div>
    </div>
  );
}
