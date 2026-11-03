// Israeli working days, for dates the system computes (e.g. the bid validity date). Pure; the holidays
// come from the Hebrew calendar built into Intl (no external service, no yearly table to maintain).

const TZ = 'Asia/Jerusalem';
const hebrew = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric', timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ });

// Rest days (no work) by Hebrew date: Rosh Hashana, Yom Kippur, Sukkot, Simchat Torah, Pesach (first and
// seventh day), Shavuot. Independence Day moves with the weekday and is handled below.
const HOLIDAYS: Record<string, readonly number[]> = {
  Tishri: [1, 2, 10, 15, 22],
  Nisan: [15, 21],
  Sivan: [6],
};

function hebrewDate(d: Date): { month: string; day: number } {
  const parts = hebrew.formatToParts(d);
  return {
    month: parts.find((p) => p.type === 'month')?.value ?? '',
    day: Number(parts.find((p) => p.type === 'day')?.value),
  };
}

const weekday = (d: Date) => weekdayFmt.format(d); // 'Sun' … 'Sat'

/**
 * Independence Day (5 Iyar) is observed on Thursday when 5 Iyar falls on Friday (4 Iyar) or Saturday
 * (3 Iyar), and on Tuesday when it falls on Monday (6 Iyar).
 */
function isIndependenceDay(day: number, wd: string): boolean {
  if (day === 5) return !['Fri', 'Sat', 'Mon'].includes(wd);
  return (day === 4 && wd === 'Thu') || (day === 3 && wd === 'Thu') || (day === 6 && wd === 'Tue');
}

/** Friday, Saturday and the Israeli holidays are not working days. */
export function isIsraeliWorkingDay(d: Date): boolean {
  const wd = weekday(d);
  if (wd === 'Fri' || wd === 'Sat') return false;
  const { month, day } = hebrewDate(d);
  if (HOLIDAYS[month]?.includes(day)) return false;
  return !(month === 'Iyar' && isIndependenceDay(day, wd));
}

const DAY = 86_400_000;

/** `days` calendar days after `fromMs`; a date that isn't a working day moves to the next one that is. */
export function addDaysToWorkingDay(fromMs: number, days: number): number {
  let t = fromMs + days * DAY;
  for (let i = 0; i < 14 && !isIsraeliWorkingDay(new Date(t)); i++) t += DAY;
  return t;
}

/** dd/mm/yyyy in Israel time. */
export function formatIsraelDate(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);
}
