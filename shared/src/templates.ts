// Pure helpers for binding a Google Doc template to a tender type. Shared by functions
// (the bind callable) and tests — no I/O here.

export interface TemplateParam {
  key: string;
  labelHe: string;
  type: 'text' | 'number' | 'date' | 'textarea';
  required: boolean;
  // Confidential value (e.g. the estimate / אומדן, GLOBAL_RULES G6): kept internal, never filled
  // into the published document.
  internal?: boolean;
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
  const merged = detected.map((p) => (prev.get(p.key)?.internal ? { ...p, internal: true } : p));
  const keys = new Set(detected.map((p) => p.key));
  return [...merged, ...existing.filter((p) => p.internal && !keys.has(p.key))];
}

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
