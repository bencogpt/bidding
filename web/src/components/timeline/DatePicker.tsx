import { useEffect, useRef, useState } from 'react';
import { TIMELINE_DAY_HE, checkTimelineDay, formatShortDate, maskTypedDate, parseTypedDate } from '@obms/shared';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
);
// SVG arrows: the "‹ ›" characters flip in right-to-left text (spec §8.6).
const Arrow = ({ dir }: { dir: 'right' | 'left' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'right' ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
  </svg>
);
const ErrorIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5v4M8 11v.5" />
  </svg>
);

/**
 * The date field of "לוחות זמנים" (v22 dateField / tlMask / drawCal; spec §8.6; plan G-D9). Typing digits
 * formats dd/mm/yy; at six digits the date is checked at once. Friday, Saturday and the rest-day holidays are
 * refused and not saved; a holiday eve or Chol HaMoed is saved with a warning. No help text under the field.
 */
export default function DatePicker({
  value,
  disabled,
  onPick,
}: {
  value: string | null;
  disabled?: boolean;
  /** A valid date (yyyy-mm-dd) to save, or null to clear the field. */
  onPick: (iso: string | null) => void;
}) {
  const [text, setText] = useState(value ? formatShortDate(value) : '');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const shown = value ? new Date(`${value}T12:00:00`) : new Date();
  const [ym, setYm] = useState({ y: shown.getFullYear(), m: shown.getMonth() });
  const box = useRef<HTMLDivElement>(null);
  const warning = value ? checkTimelineDay(value) : null;

  useEffect(() => setText(value ? formatShortDate(value) : ''), [value]);
  // The calendar closes on a click outside the field.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const check = (iso: string | null, raw: string) => {
    if (!raw.trim()) {
      setError('');
      onPick(null);
      return;
    }
    if (!iso) return setError(TIMELINE_DAY_HE.invalid);
    const day = checkTimelineDay(iso);
    if (!day.ok) return setError(TIMELINE_DAY_HE[day.error]); // not saved
    setError('');
    onPick(iso);
  };

  const type = (raw: string) => {
    const masked = maskTypedDate(raw);
    setText(masked);
    if (masked.replace(/\D/g, '').length < 6) {
      setError(''); // deleting a digit clears the error
      if (!masked) onPick(null);
      return;
    }
    check(parseTypedDate(masked), masked);
  };

  const first = new Date(ym.y, ym.m, 1).getDay();
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = Math.min(thisYear - 1, ym.y); y <= Math.max(thisYear + 6, ym.y); y++) years.push(y);
  const nav = (n: number) =>
    setYm(({ y, m }) => {
      const mm = m + n;
      return mm < 0 ? { y: y - 1, m: 11 } : mm > 11 ? { y: y + 1, m: 0 } : { y, m: mm };
    });

  return (
    <div className="dfield" ref={box}>
      <div className={`dpill ${error ? 'bad' : ''} ${disabled ? 'off' : ''}`}>
        <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="פתיחת לוח שנה">
          <CalendarIcon />
        </button>
        <input
          type="text"
          inputMode="numeric"
          placeholder="בחירת תאריך"
          disabled={disabled}
          value={text}
          onChange={(e) => type(e.target.value)}
        />
      </div>
      {error && (
        <div className="dp-err">
          <ErrorIcon />
          <span>{error}</span>
        </div>
      )}
      {!error && warning?.ok && warning.warning && <div className="dp-warn">{TIMELINE_DAY_HE[warning.warning]}</div>}
      {open && !disabled && (
        <div className="dcal" role="dialog" aria-label="לוח שנה">
          <div className="dc-h">
            <button type="button" onClick={() => nav(-1)} aria-label="חודש קודם">
              <Arrow dir="right" />
            </button>
            <span className="dc-sel">
              <select aria-label="חודש" value={ym.m} onChange={(e) => setYm((x) => ({ ...x, m: Number(e.target.value) }))}>
                {MONTHS.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <select aria-label="שנה" value={ym.y} onChange={(e) => setYm((x) => ({ ...x, y: Number(e.target.value) }))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </span>
            <button type="button" onClick={() => nav(1)} aria-label="חודש הבא">
              <Arrow dir="left" />
            </button>
          </div>
          <div className="dc-g">
            {WEEKDAYS.map((w) => (
              <i key={w}>{w}</i>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const iso = isoOf(ym.y, ym.m, i + 1);
              const off = !checkTimelineDay(iso).ok;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`${off ? 'off' : ''} ${iso === value ? 'sel' : ''}`}
                  disabled={off}
                  title={off ? 'סוף שבוע / חג' : undefined}
                  onClick={() => {
                    setOpen(false);
                    check(iso, iso);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
