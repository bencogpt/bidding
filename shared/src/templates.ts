// Pure helpers for binding a Google Doc template to a tender type. Shared by functions
// (the bind callable) and tests — no I/O here.

export interface TemplateParam {
  key: string;
  labelHe: string;
  type: 'text' | 'number' | 'date' | 'textarea';
  required: boolean;
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
