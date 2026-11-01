// Pure helpers for binding a Google Doc template to a tender type. Shared by functions
// (the bind callable) and tests — no I/O here.

/**
 * A value the system fills in itself instead of asking the manager: a fixed text, a copy of another
 * field, or a named formula (see serviceFields.ts).
 */
export type SystemFill =
  | { kind: 'fixed'; value: string }
  | { kind: 'copy'; from: string }
  | { kind: 'formula'; formula: SystemFormula };

export const SYSTEM_FORMULAS = [
  'guarantee_words', // bid-guarantee amount spelled out in Hebrew
  'total_months', // first contract period + optional periods
  'submission_day', // weekday of the submission deadline
  'manager_name', // the tender manager creating the case
  'manager_email',
  'requester_name', // the requester on the case team
  'requester_phone',
] as const;
export type SystemFormula = (typeof SYSTEM_FORMULAS)[number];

export interface TemplateParam {
  key: string;
  labelHe: string;
  type: 'text' | 'number' | 'date' | 'textarea';
  required: boolean;
  // Confidential value (e.g. the estimate / אומדן, GLOBAL_RULES G6): kept internal, never filled
  // into the published document.
  internal?: boolean;
  // Position on the create form, ascending; fields without one come after the ordered ones.
  order?: number;
  // Filled by the system: never asked on the form and never drafted by the AI.
  fill?: SystemFill;
  // Neither asked nor filled: stays blank until a rule exists for it.
  hidden?: boolean;
  // Pre-filled while the manager has not typed a value (still editable).
  defaultFrom?: 'guarantee_pct';
}

const CONFIDENTIAL_KEY_RE = /budget|estimate|אומדן|תקציב/i;

/**
 * Whether a template param holds a confidential value that must never reach the published
 * document. Explicit `internal` wins; otherwise estimate-like keys are confidential by default,
 * since templates bound from Google Docs carry no flags.
 */
export function isConfidentialParam(p: { key: string; internal?: boolean }): boolean {
  return p.internal ?? CONFIDENTIAL_KEY_RE.test(p.key);
}

// Unicode-aware so Hebrew placeholders like {{גוף_מזמין}} are supported and become the label.
const PLACEHOLDER_RE = /\{\{\s*([^}\n]+?)\s*\}\}/g;

/** Extract `{{placeholder}}` keys from template text → form fields (deduped, in order). */
export function detectPlaceholders(text: string): TemplateParam[] {
  const seen = new Set<string>();
  const params: TemplateParam[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const key = m[1].trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    params.push({ key, labelHe: key, type: 'text', required: true });
  }
  return params;
}

/**
 * Merge freshly detected placeholder fields with the template's existing fields on sync/bind.
 * Internal-only fields (e.g. the estimate) have no placeholder in the document by design, so a
 * plain re-detect would drop them — they are kept. A detected key that was internal stays
 * internal, so a confidential placeholder put back into the doc is never silently published.
 */
export function mergeSyncedParams(
  detected: TemplateParam[],
  existing: TemplateParam[],
): TemplateParam[] {
  const prev = new Map(existing.map((p) => [p.key, p]));
  // A key still in the doc keeps its approved metadata (Hebrew label, type, required, internal) —
  // a re-sync must not reset a converted template's fields to raw keys and plain text.
  const merged = detected.map((p) => {
    const old = prev.get(p.key);
    if (!old) return p;
    return {
      ...p,
      labelHe: old.labelHe,
      type: old.type,
      required: old.required,
      ...(old.internal ? { internal: true } : {}),
      // form layout and system-fill rules survive a re-sync too
      ...(old.order !== undefined ? { order: old.order } : {}),
      ...(old.hidden ? { hidden: true } : {}),
      ...(old.fill ? { fill: old.fill } : {}),
      ...(old.defaultFrom ? { defaultFrom: old.defaultFrom } : {}),
    };
  });
  const keys = new Set(detected.map((p) => p.key));
  // Fields that are not typed into the document (the estimate, system-filled and not-yet-set ones)
  // have no placeholder to be detected from, so they are carried over.
  const keepWithoutPlaceholder = (p: TemplateParam) => p.internal || p.hidden || !!p.fill;
  return [...merged, ...existing.filter((p) => keepWithoutPlaceholder(p) && !keys.has(p.key))];
}

// ---- Word-style fill-in spots (XXXX, ____) in documents that aren't real templates yet ----

const FILL_SPOT_RE = /X{2,}|_{3,}/g;

export interface FillSpot {
  marker: string; // the XXXX / ____ run
  line: string; // the (trimmed) line it sits on, for context
  lineNo: number;
}

/**
 * Whether a quote carries real words (vs. only fill-in markers like "_______ ______" or "XXXX" —
 * the X's of a marker are letters but not words).
 */
export const hasWords = (q: string): boolean => /[\p{L}\p{N}]{2,}/u.test(q.replace(/X{2,}|_{3,}/g, ' '));

const normLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Whether a line is covered by a supplier-fill quote. A quote with words matches any line that
 * contains it ("שם הבנק ____"); a word-less quote (a bare blank line under "לכבוד", a signature
 * row) matches only lines that are exactly that blank — never a manager line that merely has a
 * blank of the same length.
 */
export function isSupplierFillLine(line: string, supplierFillQuotes: readonly string[]): boolean {
  const l = normLine(line);
  return supplierFillQuotes.some((raw) => {
    const q = normLine(raw);
    return !!q && (hasWords(q) ? l.includes(q) : l === q);
  });
}

/**
 * Fill-in spots left in a document: XXXX-style and ____-style markers, except on lines the
 * supplier fills (see isSupplierFillLine).
 */
export function findFillSpots(text: string, supplierFillQuotes: readonly string[] = []): FillSpot[] {
  const spots: FillSpot[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = normLine(raw);
    if (!line || isSupplierFillLine(line, supplierFillQuotes)) return;
    for (const m of line.matchAll(FILL_SPOT_RE)) spots.push({ marker: m[0], line, lineNo: i + 1 });
  });
  return spots;
}

export type TemplateFieldsStatus = 'ready' | 'needs_conversion';

/**
 * A template is usable for new cases only when it has real {{fields}} and no unresolved Word-style
 * fill-in spots. Recomputed from the text, so it can't drift from the document.
 */
export function templateFieldsStatus(
  bodyTemplate: string,
  supplierFillQuotes: readonly string[] = [],
): { status: TemplateFieldsStatus; unresolved: number; fields: number } {
  const fields = detectPlaceholders(bodyTemplate).length;
  const unresolved = findFillSpots(bodyTemplate, supplierFillQuotes).length;
  return { status: fields > 0 && unresolved === 0 ? 'ready' : 'needs_conversion', unresolved, fields };
}

/**
 * Template fields the system fills itself: the bid number is the case serial (BID-2026-0042) —
 * never asked in the form and never guessed by the AI.
 */
const AUTO_SERIAL_KEY_RE = /^(tender|bid)_(number|no|num)$/;
export const isAutoSerialParam = (p: { key: string }): boolean => AUTO_SERIAL_KEY_RE.test(p.key);

/**
 * A form value that still holds a placeholder — the AI draft writes {{UPPER_SNAKE}} where the brief
 * doesn't give the value (G2) — is not a value: the manager must replace it before creating.
 */
export const hasPlaceholder = (v: unknown): boolean => /\{\{[^}]*\}\}/.test(String(v ?? ''));

/** Accept a Google Docs URL or a raw doc id and return the document id, or null. */
export function parseDocId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const fromUrl = trimmed.match(/\/d\/([a-zA-Z0-9_-]{12,})/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/** Public export endpoint for a link-viewable Google Doc (plain text). */
export function docExportTxtUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/export?format=txt`;
}

/** Whether the system supplies this field, so the form never asks for it and the AI never drafts it. */
export const isSystemParam = (p: { key: string; fill?: SystemFill }): boolean =>
  isAutoSerialParam(p) || !!p.fill;

/** The fields the create form asks for, in display order (stable for fields without an order). */
export function askedParams<T extends { key: string; fill?: SystemFill; hidden?: boolean; order?: number }>(
  params: readonly T[],
): T[] {
  return params
    .filter((p) => !isSystemParam(p) && !p.hidden)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.order ?? Infinity) - (b.p.order ?? Infinity) || a.i - b.i)
    .map(({ p }) => p);
}
