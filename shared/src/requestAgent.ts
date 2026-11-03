// The request agent's contract and deterministic logic. Pure: used by the callable (server) as the model
// fallback and as the sanitiser, and by the request screen for the mandatory-details checklist.
// The budget (annual_budget) is deliberately absent everywhere in this file (GLOBAL_RULES G6).
import { z } from 'zod';
import { BRIEF_MAX_LENGTH } from './schemas.js';

export const SCOPE_MIN_LENGTH = 60;
export const AGENT_HISTORY_MAX = 20;

const noPlaceholder = (s: string) => !s.includes('{{');

export const agentDetailsSchema = z
  .object({
    service_name: z.string().trim().min(1).max(200).refine(noPlaceholder).optional(),
    document_classification: z.string().trim().min(1).max(40).refine(noPlaceholder).optional(),
    contract_years: z.number().int().min(1).max(30).optional(),
  })
  .strict();
export type AgentDetails = z.infer<typeof agentDetailsSchema>;

export const assistRequestInput = z
  .object({
    mode: z.enum(['extract', 'chat']),
    brief: z.string().max(BRIEF_MAX_LENGTH),
    details: agentDetailsSchema,
    history: z
      .array(z.object({ role: z.enum(['agent', 'user']), text: z.string().max(1000) }))
      .max(AGENT_HISTORY_MAX),
    qualityAsked: z.number().int().min(0).max(3),
  })
  .strict();
export type AssistRequestInput = z.infer<typeof assistRequestInput>;

export type AskKey = 'service_name' | 'document_classification' | 'scope' | 'contract_years' | 'quality' | 'done';
const ASK_KEYS: readonly AskKey[] = ['service_name', 'document_classification', 'scope', 'contract_years', 'quality', 'done'];

export interface AssistRequestResult {
  details: AgentDetails;
  scopeOk: boolean;
  asking: AskKey;
  message: string; // empty in extract mode
  chips: string[];
  ready: boolean; // the four non-budget details are present
  source: 'model' | 'script';
}

type MissingKey = 'service_name' | 'document_classification' | 'scope' | 'contract_years';
const ORDER: readonly MissingKey[] = ['service_name', 'document_classification', 'scope', 'contract_years'];

export const REQUEST_QUESTIONS: Record<MissingKey, { q: string; chips: string[] }> = {
  service_name: { q: 'מה שם השירות?', chips: [] },
  document_classification: { q: 'מה סיווג המסמך?', chips: ['רגיל', 'שמור', 'סודי', 'בלמ"ס'] },
  scope: { q: 'תארו בכמה משפטים את עיקרי השירות הנדרש.', chips: [] },
  contract_years: { q: 'מה משך תקופת ההתקשרות בשנים?', chips: ['1', '2', '3', '5'] },
};

export const QUALITY_QUESTIONS: readonly { q: string; chips: string[] }[] = [
  { q: 'באיזה זמן תגובה לתקלה קריטית מדובר?', chips: ['30 דקות', 'שעה', '4 שעות', 'דלג'] },
  { q: 'האם נדרש ניסיון קודם של הספק, ובאילו פרויקטים?', chips: ['דלג'] },
  { q: 'מה צריך לקרות אם איש צוות עוזב באמצע ההתקשרות?', chips: ['דלג'] },
];

const GREETING = 'שלום, אעזור לך להשלים את הבקשה. אשאל שאלה אחת בכל פעם. ';
const QUALITY_INTRO = 'כל פרטי החובה מולאו. עוד כמה שאלות להשלמה, אפשר לדלג על כל אחת. ';
const DONE = 'מצוין, זה מספיק. הבקשה מוכנה לשליחה לרכש.';

export const scopeOk = (brief: string): boolean => brief.trim().length >= SCOPE_MIN_LENGTH;

const missingKeys = (details: AgentDetails, brief: string): MissingKey[] =>
  ORDER.filter((k) => (k === 'scope' ? !scopeOk(brief) : details[k] === undefined));

/** What the person typed wins; extraction only fills the gaps. */
export function mergeExtracted(typed: AgentDetails, extracted: AgentDetails): AgentDetails {
  const defined = Object.fromEntries(Object.entries(typed).filter(([, v]) => v !== undefined));
  return { ...extracted, ...defined } as AgentDetails;
}

const cleanText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, max);
  return s && noPlaceholder(s) ? s : undefined;
};

function yearsFrom(text: string): number | undefined {
  let n: number | undefined;
  const m = text.match(/(\d{1,3})\s*שנ(?:ים|ה)/);
  if (m) n = Number(m[1]);
  else if (/שנתיים/.test(text)) n = 2;
  else if (/(?:^|\s)ל?שנה(?:\s|$|[.,])/.test(text)) n = 1;
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 30 ? n : undefined;
}

/** Deterministic extraction (the fallback when no model answers). */
export function scriptExtract(text: string): AgentDetails {
  const out: AgentDetails = {};
  const name = text.match(/שם (?:ה)?שירות\s*[:\-]\s*([^\n,.;]+)/);
  const n = name && cleanText(name[1], 200);
  if (n) out.service_name = n;
  const cls = text.match(/סודי ביותר|סודי|שמור|בלתי מסווג|רגיל|בלמ["״]ס/);
  if (cls) out.document_classification = cls[0];
  const y = yearsFrom(text);
  if (y !== undefined) out.contract_years = y;
  return out;
}

/** Keep only known, clean, bounded values from whatever the model returned. */
export function sanitizeModelOutput(raw: unknown): {
  details: AgentDetails;
  asking?: AskKey;
  message: string;
  chips: string[];
} {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = (r.details && typeof r.details === 'object' ? r.details : {}) as Record<string, unknown>;
  const details: AgentDetails = {};
  const name = cleanText(d.service_name, 200);
  if (name) details.service_name = name;
  const cls = cleanText(d.document_classification, 40);
  if (cls) details.document_classification = cls;
  const y = Number(d.contract_years);
  if (Number.isInteger(y) && y >= 1 && y <= 30) details.contract_years = y;
  const chips = Array.isArray(r.chips)
    ? [...new Set(r.chips.map((c) => cleanText(c, 40)).filter((c): c is string => !!c))].slice(0, 4)
    : [];
  const asking = ASK_KEYS.find((k) => k === r.asking);
  return { details, ...(asking ? { asking } : {}), message: cleanText(r.message, 600) ?? '', chips };
}

function nextStep(
  details: AgentDetails,
  brief: string,
  qualityAsked: number,
  first: boolean,
): { asking: AskKey; message: string; chips: string[] } {
  const miss = missingKeys(details, brief);
  const prefix = first ? GREETING : '';
  if (miss.length) {
    const k = miss[0];
    return { asking: k, message: prefix + REQUEST_QUESTIONS[k].q, chips: REQUEST_QUESTIONS[k].chips };
  }
  if (qualityAsked < QUALITY_QUESTIONS.length) {
    const qq = QUALITY_QUESTIONS[qualityAsked];
    return { asking: 'quality', message: prefix + (qualityAsked === 0 ? QUALITY_INTRO : '') + qq.q, chips: qq.chips };
  }
  return { asking: 'done', message: DONE, chips: [] };
}

/** Build the result from the merged details; the model's wording is used only when it asked the right thing. */
export function finishTurn(
  input: AssistRequestInput,
  details: AgentDetails,
  source: 'model' | 'script',
  say?: { asking?: AskKey; message: string; chips: string[] },
): AssistRequestResult {
  const step = nextStep(details, input.brief, input.qualityAsked, input.history.length === 0);
  const useModel = !!say && say.asking === step.asking && !!say.message;
  return {
    details,
    scopeOk: scopeOk(input.brief),
    asking: step.asking,
    message: input.mode === 'extract' ? '' : useModel ? say!.message : step.message,
    chips: input.mode === 'extract' ? [] : useModel && say!.chips.length ? say!.chips : step.chips,
    ready: missingKeys(details, input.brief).length === 0,
    source,
  };
}

const askedKeyOf = (agentText: string): MissingKey | 'quality' | null => {
  for (const k of ORDER) if (agentText.includes(REQUEST_QUESTIONS[k].q)) return k;
  return QUALITY_QUESTIONS.some((q) => agentText.includes(q.q)) ? 'quality' : null;
};

function applyAnswer(key: 'service_name' | 'document_classification' | 'contract_years', text: string): AgentDetails {
  const t = text.trim();
  if (!t) return {};
  if (key === 'service_name') {
    const v = cleanText(t, 200);
    return v ? { service_name: v } : {};
  }
  if (key === 'document_classification') {
    const known = t.match(/סודי ביותר|סודי|שמור|בלתי מסווג|רגיל|בלמ["״]ס/);
    const v = cleanText(known ? known[0] : t, 40);
    return v ? { document_classification: v } : {};
  }
  const y = yearsFrom(t) ?? (/^\d{1,3}$/.test(t) ? Number(t) : undefined);
  return y !== undefined && Number.isInteger(y) && y >= 1 && y <= 30 ? { contract_years: y } : {};
}

/** The whole turn without a model: extract from the text, apply the last answer, ask the next thing. */
export function scriptTurn(input: AssistRequestInput): AssistRequestResult {
  let details = mergeExtracted(input.details, scriptExtract(input.brief));
  const last = input.history[input.history.length - 1];
  const prev = input.history[input.history.length - 2];
  if (last?.role === 'user' && prev?.role === 'agent') {
    const k = askedKeyOf(prev.text);
    if (k === 'service_name' || k === 'document_classification' || k === 'contract_years') {
      details = { ...details, ...applyAnswer(k, last.text) };
    }
  }
  return finishTurn(input, details, 'script');
}

// ---- the request screen's checklist (the five mandatory details) ----
export const CHECKLIST = [
  { key: 'service_name', label: 'שם השירות' },
  { key: 'document_classification', label: 'סיווג המסמך' },
  { key: 'scope', label: "עיקרי השירות הנדרש (פרק ב')" },
  { key: 'annual_budget', label: 'סכום המסגרת המקסימלי (בש"ח)' },
  { key: 'contract_years', label: 'משך תקופת התקשרות בשנים' },
] as const;

/** `fields` are the panel's text boxes (strings). Each row says whether that detail is present and valid. */
export function requestChecklist(
  brief: string,
  fields: Record<string, string>,
): { key: string; label: string; present: boolean }[] {
  const text = (k: string) => (fields[k] ?? '').trim() !== '';
  return CHECKLIST.map(({ key, label }) => {
    let present: boolean;
    if (key === 'scope') present = scopeOk(brief);
    else if (key === 'annual_budget') present = Number.isFinite(Number(fields.annual_budget)) && Number(fields.annual_budget) > 0 && text(key);
    else if (key === 'contract_years') {
      const n = Number(fields.contract_years);
      present = text(key) && Number.isInteger(n) && n >= 1 && n <= 30;
    } else present = text(key);
    return { key, label, present };
  });
}
