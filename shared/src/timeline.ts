// The "לוחות זמנים" tab (v22 renderTl, spec §6.7, §8.6; plan G-D7, G-D9): four binding dates procurement enters
// before the send. They go into the tender document, the summary and the chart.
import { isIsraeliWorkingDay, israeliHalfDay } from './israelCalendar.js';
import type { TimelineDates } from './schemas.js';

export type TimelineKey = 'conf' | 'qdead' | 'submit' | 'valid';

export interface TimelineField {
  key: TimelineKey;
  labelHe: string;
  required: boolean;
  /** Where the date appears in the document (v22 TL_AT); the toast links there. */
  sectionHe: string;
}

/** v22 TL_FIELDS, in their order (two per row). */
export const TIMELINE_FIELDS: readonly TimelineField[] = [
  { key: 'conf', labelHe: 'מועד כנס ספקים', required: false, sectionHe: 'סעיף 5.1' },
  { key: 'qdead', labelHe: 'מועד אחרון לשליחת שאלות הבהרה', required: true, sectionHe: 'סעיף 1.2' },
  { key: 'submit', labelHe: 'מועד הגשת הצעות מחיר', required: true, sectionHe: 'סעיף 1.2' },
  { key: 'valid', labelHe: 'תוקף הצעת מחיר', required: true, sectionHe: 'סעיף 9.1' },
];

/** The summary card's labels (v22 renderTl). */
export const TIMELINE_SUMMARY_HE: Record<TimelineKey, string> = {
  conf: 'כנס ספקים',
  qdead: 'שאלות הבהרה עד',
  submit: 'הגשת הצעות',
  valid: 'תוקף הצעה',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-mm-dd of an epoch in Israel time. */
export function isoDateIsrael(ms: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** The tender's dates, with the submission date taken from submissionDeadline when the tab hasn't set it. */
export function timelineOf(t: { timeline?: TimelineDates; submissionDeadline?: number | null }): TimelineDates {
  return {
    ...t.timeline,
    submit: t.timeline?.submit ?? (t.submissionDeadline ? isoDateIsrael(t.submissionDeadline) : null),
  };
}

/** Required dates still empty: "שליחה לאישור" waits for them (G-D7). */
export function missingTimelineDates(t: { timeline?: TimelineDates; submissionDeadline?: number | null }): TimelineKey[] {
  const d = timelineOf(t);
  return TIMELINE_FIELDS.filter((f) => f.required && !d[f.key]).map((f) => f.key);
}

/** Noon in Israel on the given date: weekday and Hebrew date are the same all day. */
const noon = (iso: string) => new Date(`${iso}T12:00:00+02:00`);

/** A real calendar date, yyyy-mm-dd. */
export function isValidIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export type DayCheck = { ok: true; warning?: 'eve' | 'chol_hamoed' } | { ok: false; error: 'invalid' | 'blocked' };

/** Fridays, Saturdays and the rest-day holidays are blocked; eves and Chol HaMoed are only a warning (G-D9). */
export function checkTimelineDay(iso: string): DayCheck {
  if (!isValidIsoDate(iso)) return { ok: false, error: 'invalid' };
  const d = noon(iso);
  if (!isIsraeliWorkingDay(d)) return { ok: false, error: 'blocked' };
  const half = israeliHalfDay(d);
  return half ? { ok: true, warning: half } : { ok: true };
}

/** Messages under the field (spec §8.6); the warnings are new — UX to confirm with procurement (G-D9). */
export const TIMELINE_DAY_HE = {
  invalid: 'התאריך שהוזן אינו תקין',
  blocked: 'התאריך שהוזן חל בסוף שבוע / חג',
  eve: 'שימו לב: התאריך חל בערב חג',
  chol_hamoed: 'שימו לב: התאריך חל בחול המועד',
} as const;

/** Digits typed into the field become dd/mm/yy as you type (spec §8.6): "211226" → "21/12/26". */
export function maskTypedDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 6);
  return d.slice(0, 2) + (d.length > 2 ? '/' + d.slice(2, 4) : '') + (d.length > 4 ? '/' + d.slice(4, 6) : '');
}

/** dd/mm/yy (or dd/mm/yyyy, dots or dashes) → yyyy-mm-dd; null when it isn't a real date. */
export function parseTypedDate(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** yyyy-mm-dd → dd/mm/yy, as the field and the summary show it. */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y!.slice(2)}`;
}

/** yyyy-mm-dd → dd/mm/yyyy, as the document prints dates. */
export function formatDocDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

type ParamLike = { key: string; labelHe: string; type: string };

/** Templates name these fields differently: by key first, then by their Hebrew label (like the dates card). */
function findParam(params: readonly ParamLike[], labels: string[], keys: string[]): ParamLike | undefined {
  return (
    params.find((p) => keys.includes(p.key)) ??
    params.find((p) => labels.some((l) => p.labelHe.replace(/\s+/g, ' ').includes(l)))
  );
}

/**
 * The template fields the four dates fill (plan G-D7: "השדות מתעדכנים במסמך המכרז"): the questions deadline,
 * the conference date, and the offer's validity as days from the submission (the templates count days). The
 * submission date itself is the case's deadline, from which the templates' formulas derive their fields.
 */
export function timelineParamValues(params: readonly ParamLike[], d: TimelineDates): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const q = findParam(params, ['מועד אחרון לשאלות'], ['clarification_deadline', 'clarifications_deadline', 'questions_deadline']);
  if (q && d.qdead) out[q.key] = formatDocDate(d.qdead);
  const c = findParam(params, ['כנס מציעים', 'כנס ספקים'], ['gathering_date', 'bidders_conference_date', 'conference_date']);
  if (c && d.conf) out[c.key] = formatDocDate(d.conf);
  if (d.valid && d.submit) {
    const days = daysBetween(d.submit, d.valid);
    for (const p of params) if (p.type === 'number' && p.labelHe.includes('תוקף ההצעה')) out[p.key] = days;
  }
  return out;
}

/** Whole days from one date to another (the summary's "N ימים מההגשה"). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((noon(toIso).getTime() - noon(fromIso).getTime()) / 86_400_000);
}
