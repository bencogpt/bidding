// Recommendations for a new request: notes and ideas the requester can add before sending it to procurement.
// Pure: the sanitiser and the fallback used by the callable, and the types the request screen shares with it.
// The budget is deliberately absent (GLOBAL_RULES G6): the input has no field for it.
import { z } from 'zod';
import { BRIEF_MAX_LENGTH } from './schemas.js';
import { agentDetailsSchema } from './requestAgent.js';

export type RecommendationKind = 'הערה' | 'רעיון';
export interface Recommendation {
  kind: RecommendationKind;
  text: string;
}
export interface RecommendationsResult {
  items: Recommendation[];
  source: 'model' | 'script';
}

export const RECOMMENDATIONS_MAX = 6;
const TEXT_MIN = 3;
const TEXT_MAX = 300;

export const recommendationsInput = z
  .object({
    brief: z.string().min(3).max(BRIEF_MAX_LENGTH),
    details: agentDetailsSchema,
  })
  .strict();
export type RecommendationsInput = z.infer<typeof recommendationsInput>;

/** Keep at most six clean, bounded, distinct items from whatever the model returned. */
export function sanitizeRecommendations(raw: unknown): Recommendation[] {
  const items = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return [];
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const r = it as { kind?: unknown; text?: unknown };
    if (typeof r.text !== 'string') continue;
    const text = r.text.trim().slice(0, TEXT_MAX);
    if (text.length < TEXT_MIN || text.includes('{{') || seen.has(text)) continue;
    seen.add(text);
    out.push({ kind: r.kind === 'רעיון' ? 'רעיון' : 'הערה', text });
    if (out.length === RECOMMENDATIONS_MAX) break;
  }
  return out;
}

/** The fallback when no model answers: only suggestions about what the request does not already say. */
export function scriptRecommendations(input: RecommendationsInput): Recommendation[] {
  const t = input.brief;
  const years = input.details.contract_years;
  const out: Recommendation[] = [];
  if (!/ניסיון/.test(t)) {
    out.push({ kind: 'רעיון', text: 'להגדיר דרישת ניסיון מוכח של הספק (מספר פרויקטים ותקופה), ולבדוק שהיא לא מצמצמת תחרות.' });
  }
  if (!/SLA|זמן תגובה|זמינות/i.test(t)) {
    out.push({ kind: 'רעיון', text: 'לקבוע זמני תגובה ופתרון לתקלות לפי חומרה, ופיצוי מדורג על חריגה.' });
  }
  if (!/אופצי|הארכה/.test(t)) {
    out.push({ kind: 'הערה', text: 'לא צוינו אופציות להארכת ההתקשרות. כדאי להחליט אם הן נדרשות.' });
  }
  if (/נותני שירות|צוות/.test(t)) {
    out.push({ kind: 'רעיון', text: 'סעיף החלפת איש צוות והעברת ידע בסיום ההתקשרות.' });
  }
  if (years !== undefined && years >= 3) {
    out.push({ kind: 'הערה', text: 'בהתקשרות של שלוש שנים ויותר כדאי לשקול הצמדה למדד ומנגנון עדכון מחירים.' });
  }
  if (!out.length) {
    out.push({ kind: 'הערה', text: 'הבקשה מפורטת. כדאי לוודא שכל הדרישות מנוסחות באופן מדיד.' });
  }
  return out.slice(0, 5);
}

/** The brief as it is sent to procurement: the requester's text, their free notes and the recommendations they chose. */
export function composeRequestBrief(brief: string, notes: string, chosen: readonly string[]): string {
  let out = brief;
  const n = notes.trim();
  if (n) out += `\n\nהערות נוספות:\n${n}`;
  const picks = chosen.map((c) => c.trim()).filter(Boolean);
  if (picks.length) out += `\n\nהמלצות שנבחרו:\n${picks.map((c) => `- ${c}`).join('\n')}`;
  return out;
}

/** Why an edited recommendation text is not acceptable (an empty string when it is). */
export function recommendationTextError(text: string): string {
  const t = text.trim();
  if (!t) return 'יש להזין טקסט';
  if (t.length < TEXT_MIN) return 'הטקסט קצר מדי';
  if (t.length > TEXT_MAX) return `הטקסט ארוך מ-${TEXT_MAX} תווים`;
  if (t.includes('{{')) return 'אי אפשר להשתמש ב-{{';
  return '';
}

/** The chosen list after a recommendation's text changed: the old text is replaced in place, or the new one is added. */
export function replaceChosen(chosen: readonly string[], from: string, to: string): string[] {
  const i = chosen.indexOf(from);
  if (i === -1) return chosen.includes(to) ? [...chosen] : [...chosen, to];
  const out = [...chosen];
  out[i] = to;
  return out;
}

// Headings composeRequestBrief and the request agent add after the requester's own description. What
// follows them is internal working text (clarifications, chosen recommendations, notes).
export const BRIEF_INTERNAL_HEADINGS = ['הבהרות מהדורש:', 'המלצות שנבחרו:', 'הערות נוספות:'] as const;

/** The request split into the requester's own description and its internal sections. */
export function splitRequestBrief(brief: string): { description: string; sections: Record<string, string[]> } {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  const desc: string[] = [];
  for (const raw of brief.split('\n')) {
    const line = raw.trim();
    const heading = BRIEF_INTERNAL_HEADINGS.find((h) => line === h);
    if (heading) {
      current = heading;
      sections[current] ??= [];
    } else if (current) {
      if (line) sections[current].push(line.replace(/^[-•]\s*/, ''));
    } else {
      desc.push(raw);
    }
  }
  return { description: desc.join('\n').trim(), sections };
}

/**
 * Without AI: the text suppliers may see — the requester's own description plus the clarifications they
 * stated as requirements. Chosen recommendations and notes are internal advice and stay out.
 */
export function fallbackPublicSummary(brief: string): string {
  const { description, sections } = splitRequestBrief(brief);
  const reqs = sections['הבהרות מהדורש:'] ?? [];
  return [description, ...reqs].filter(Boolean).join('\n');
}
