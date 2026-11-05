// The case team chat's view rules (prototype renderTeam / mention, lines 2229–2247): @mentions and day separators.

/** A piece of a message: plain text, or an @mention to highlight. */
export interface ChatSegment {
  text: string;
  mention: boolean;
}

// The prototype's rule: "@" then anything up to a space or punctuation (line 2229).
const MENTION = /@([^\s,.:;!?]+)/g;

/** Splits a message into plain text and @mentions, in order. Joining the pieces gives the text back. */
export function splitMentions(text: string): ChatSegment[] {
  const out: ChatSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), mention: false });
    out.push({ text: m[0], mention: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** The separator above a day's first message, in local time: "היום", "אתמול", or the date (05.11.2026). */
export function chatDayLabel(ms: number, now: number): string {
  const day = dayStart(ms);
  const today = dayStart(now);
  if (day === today) return 'היום';
  // The day before today's local midnight (correct across a daylight-saving change too).
  if (day === dayStart(today - 1)) return 'אתמול';
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export type ChatLogItem<M> = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: M };

/** The log in order, with a day separator before the first message of each day. */
export function withDaySeparators<M extends { id: string; at: number }>(messages: readonly M[], now: number): ChatLogItem<M>[] {
  const out: ChatLogItem<M>[] = [];
  let prevDay: number | null = null;
  for (const m of messages) {
    const day = dayStart(m.at);
    if (day !== prevDay) {
      out.push({ kind: 'day', key: `day-${day}`, label: chatDayLabel(m.at, now) });
      prevDay = day;
    }
    out.push({ kind: 'msg', key: m.id, m });
  }
  return out;
}

/** The message time inside the bubble: hours and minutes (the day is in the separator). */
export function chatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
