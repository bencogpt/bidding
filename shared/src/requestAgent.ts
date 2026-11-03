// The request agent's contract and deterministic logic. Pure: used by the callable (server) as the model
// fallback and as the sanitiser, and by the request screen for the mandatory-details checklist.
// The budget (annual_budget) is deliberately absent everywhere in this file (GLOBAL_RULES G6).
import { z } from 'zod';
import { BRIEF_MAX_LENGTH } from './schemas.js';
import { BUDGET_MIN } from './requesterFields.js';

export const SCOPE_MIN_LENGTH = 60;
export const AGENT_HISTORY_MAX = 20;

const noPlaceholder = (s: string) => !s.includes('{{');

export const agentDetailsSchema = z
  .object({
    service_name: z.string().trim().min(1).max(200).refine(noPlaceholder).optional(),
    document_classification: z.string().trim().min(1).max(40).refine(noPlaceholder).optional(),
    contract_years: z.number().int().min(1).max(30).optional(),
    // the optional answers (never the budget)
    service_location: z.string().trim().min(1).max(200).refine(noPlaceholder).optional(),
    provider_responsibilities: z.string().trim().min(1).max(1000).refine(noPlaceholder).optional(),
    team_lead_role: z.string().trim().min(1).max(1000).refine(noPlaceholder).optional(),
    min_pool_candidates: z.number().int().min(1).max(100000).optional(),
    service_providers_total: z.number().int().min(1).max(100000).optional(),
    supplier_equipment: z.string().trim().min(1).max(1000).refine(noPlaceholder).optional(),
    work_hours: z.string().trim().min(1).max(200).refine(noPlaceholder).optional(),
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

export type OptionalAskKey =
  | 'service_location'
  | 'provider_responsibilities'
  | 'team_lead_role'
  | 'min_pool_candidates'
  | 'service_providers_total'
  | 'supplier_equipment'
  | 'work_hours';
export type AskKey =
  | 'service_name'
  | 'document_classification'
  | 'scope'
  | 'contract_years'
  | OptionalAskKey
  | 'quality'
  | 'done';
const ASK_KEYS: readonly AskKey[] = [
  'service_name',
  'document_classification',
  'scope',
  'contract_years',
  'service_location',
  'provider_responsibilities',
  'team_lead_role',
  'min_pool_candidates',
  'service_providers_total',
  'supplier_equipment',
  'work_hours',
  'quality',
  'done',
];

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

/** Asked in the chat after the mandatory details; each can be skipped. */
const OPTIONAL_ORDER: readonly OptionalAskKey[] = [
  'service_location',
  'provider_responsibilities',
  'team_lead_role',
  'min_pool_candidates',
  'service_providers_total',
  'supplier_equipment',
  'work_hours',
];
export const OPTIONAL_QUESTIONS: Record<OptionalAskKey, { q: string; chips: string[] }> = {
  service_location: { q: 'מה מקום אספקת השירות?', chips: ['דלג'] },
  provider_responsibilities: { q: 'מה תחומי האחריות של נותני השירות?', chips: ['דלג'] },
  team_lead_role: { q: 'מה תפקיד ראש הצוות?', chips: ['דלג'] },
  min_pool_candidates: { q: 'מה מספר המועמדים המינימלי למאגר?', chips: ['דלג'] },
  service_providers_total: { q: 'כמה נותני שירות נדרשים?', chips: ['דלג'] },
  supplier_equipment: { q: 'איזה ציוד הספק מספק לנותני השירות?', chips: ['דלג'] },
  work_hours: { q: 'מה היקף המשרה, והאם נדרשות גם שעות כוננות?', chips: ['משרה מלאה', 'משרה מלאה + כוננות', 'דלג'] },
};

export const QUALITY_QUESTIONS: readonly { q: string; chips: string[] }[] = [
  { q: 'באיזה זמן תגובה לתקלה קריטית מדובר?', chips: ['30 דקות', 'שעה', '4 שעות', 'דלג'] },
  { q: 'האם נדרש ניסיון קודם של הספק, ובאילו פרויקטים?', chips: ['דלג'] },
  { q: 'מה צריך לקרות אם איש צוות עוזב באמצע ההתקשרות?', chips: ['דלג'] },
];

const GREETING = 'שלום, אעזור לך להשלים את הבקשה. אשאל שאלה אחת בכל פעם. ';
const QUALITY_INTRO = 'קיבלתי את כל מה שצריך מהשיחה. עוד כמה שאלות להשלמה, אפשר לדלג על כל אחת. ';
const DONE = 'מצוין, סיימנו את השאלות.';

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

const OPTIONAL_TEXT = {
  service_location: 200,
  provider_responsibilities: 1000,
  team_lead_role: 1000,
  supplier_equipment: 1000,
  work_hours: 200,
} as const;
const OPTIONAL_INT = ['min_pool_candidates', 'service_providers_total'] as const;
const intIn = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : undefined;
};

/** The optional answers from a loosely typed source: text bounded and clean, counts whole numbers. */
function optionalFrom(src: Record<string, unknown>): AgentDetails {
  const out: Record<string, string | number> = {};
  for (const [k, max] of Object.entries(OPTIONAL_TEXT)) {
    const v = cleanText(src[k], max);
    if (v) out[k] = v;
  }
  for (const k of OPTIONAL_INT) {
    const n = intIn(src[k]);
    if (n !== undefined) out[k] = n;
  }
  return out as AgentDetails;
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
  const providers = text.match(/(\d{1,5})\s*נותני\s*שירות/);
  if (providers) Object.assign(out, optionalFrom({ service_providers_total: providers[1] }));
  const place = text.match(/מקום אספקת השירות\s*[:\-]\s*([^\n,.;]+)/);
  if (place) Object.assign(out, optionalFrom({ service_location: place[1] }));
  const hours = text.match(/היקף משרה\s*[:\-]\s*([^\n,.;]+)/) ?? text.match(/משרה (?:מלאה|חלקית)[^\n,.;]*/);
  if (hours) Object.assign(out, optionalFrom({ work_hours: hours[1] ?? hours[0] }));
  const pool = text.match(/(\d{1,5})\s*מועמדים/);
  if (pool) Object.assign(out, optionalFrom({ min_pool_candidates: pool[1] }));
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
  Object.assign(details, optionalFrom(d));
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
  history: AssistRequestInput['history'],
): { asking: AskKey; message: string; chips: string[] } {
  const miss = missingKeys(details, brief);
  const prefix = history.length === 0 ? GREETING : '';
  if (miss.length) {
    const k = miss[0];
    return { asking: k, message: prefix + REQUEST_QUESTIONS[k].q, chips: REQUEST_QUESTIONS[k].chips };
  }
  const said = (text: string) => history.some((m) => m.role === 'agent' && m.text.includes(text));
  const intro = said(QUALITY_INTRO.trim()) ? '' : QUALITY_INTRO;
  // An optional question is asked once: a skipped or answered one is never asked again.
  const pending = OPTIONAL_ORDER.find((k) => details[k] === undefined && !said(OPTIONAL_QUESTIONS[k].q));
  if (pending) {
    return { asking: pending, message: prefix + intro + OPTIONAL_QUESTIONS[pending].q, chips: OPTIONAL_QUESTIONS[pending].chips };
  }
  if (qualityAsked < QUALITY_QUESTIONS.length) {
    const qq = QUALITY_QUESTIONS[qualityAsked];
    return { asking: 'quality', message: prefix + intro + qq.q, chips: qq.chips };
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
  const step = nextStep(details, input.brief, input.qualityAsked, input.history);
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

const askedKeyOf = (agentText: string): MissingKey | OptionalAskKey | 'quality' | null => {
  for (const k of ORDER) if (agentText.includes(REQUEST_QUESTIONS[k].q)) return k;
  for (const k of OPTIONAL_ORDER) if (agentText.includes(OPTIONAL_QUESTIONS[k].q)) return k;
  return QUALITY_QUESTIONS.some((q) => agentText.includes(q.q)) ? 'quality' : null;
};

function applyAnswer(
  key: 'service_name' | 'document_classification' | 'contract_years' | OptionalAskKey,
  text: string,
): AgentDetails {
  const t = text.trim();
  if (!t || t === 'דלג') return {};
  if (key in OPTIONAL_TEXT) return optionalFrom({ [key]: t });
  if (key === 'min_pool_candidates' || key === 'service_providers_total') {
    return optionalFrom({ [key]: t.match(/[0-9]{1,6}/)?.[0] });
  }
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
    if (k && k !== 'scope' && k !== 'quality') {
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
    else if (key === 'annual_budget') present = text(key) && Number.isFinite(Number(fields.annual_budget)) && Number(fields.annual_budget) >= BUDGET_MIN;
    else if (key === 'contract_years') {
      const n = Number(fields.contract_years);
      present = text(key) && Number.isInteger(n) && n >= 1 && n <= 30;
    } else present = text(key);
    return { key, label, present };
  });
}

/**
 * What the agent may see of the panel's text boxes. The classification counts only once the person set it
 * (the pre-filled default must not look "typed", or it would block detection). The budget is never included.
 */
export function agentDetailsFromFields(fields: Record<string, string>, touched: ReadonlySet<string>): AgentDetails {
  const out: AgentDetails = {};
  const name = (fields.service_name ?? '').trim();
  if (name && !name.includes('{{') && name.length <= 200) out.service_name = name;
  const cls = (fields.document_classification ?? '').trim();
  if (cls && touched.has('document_classification') && !cls.includes('{{') && cls.length <= 40) out.document_classification = cls;
  const y = Number(fields.contract_years);
  if ((fields.contract_years ?? '').trim() && Number.isInteger(y) && y >= 1 && y <= 30) out.contract_years = y;
  Object.assign(out, optionalFrom(fields));
  return out;
}

/** In the text mode: while the agent still has data to ask for, the main button continues to the agent instead of sending. */
export const needsAgent = (asking: string): boolean => asking !== 'quality' && asking !== 'done';

/** About 3,000 characters make a page of the request; BRIEF_MAX_LENGTH is five pages. */
export const SCOPE_PAGE_CHARS = 3000;

/** The length of a text in pages, to one decimal place (a little text is never shown as 0). */
export function pageCount(text: string): number {
  if (!text) return 0;
  return Math.max(0.1, Math.round((text.length / SCOPE_PAGE_CHARS) * 10) / 10);
}
