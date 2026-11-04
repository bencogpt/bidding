// Rendering a draft's text from the template and the draft values — the same rule on the server (the
// inspector's preview, the generated document) and in the browser (the draft view).
import { BLANK_LINE, isOmittedParam, requiredBlank } from './procurementForm.js';
import { isConfidentialParam } from './templates.js';

/**
 * The values the document is created with (plan D7): a field still empty is printed as a blank line to
 * complete by hand — with its label when it is required, so the publish gate can tell it is still open.
 * Confidential fields are never printed; tags removed from the system print nothing (fillTemplate).
 */
export function withEmptyFieldsPrinted(
  params: Record<string, string | number>,
  templateParams: readonly { key: string; labelHe: string; required: boolean; internal?: boolean }[],
): Record<string, string | number> {
  const out = { ...params };
  for (const p of templateParams) {
    if (isConfidentialParam(p) || isOmittedParam(p)) continue;
    const v = out[p.key];
    if (v !== undefined && String(v).trim() !== '') continue;
    out[p.key] = p.required ? requiredBlank(p.labelHe) : BLANK_LINE;
  }
  return out;
}

// Unfilled placeholders stay visible as {{key}} (matching real Docs mode) so the supervisor and
// the manager see the gap — never silently papered over.
export function fillTemplate(body: string, params: Record<string, string | number>): string {
  return body.replace(/\{\{\s*([^}\n]+?)\s*\}\}/g, (m, key: string) => {
    if (isOmittedParam({ key: key.trim() })) return ''; // tags removed from the system print nothing
    const v = params[key.trim()];
    return v !== undefined && String(v) !== '' ? String(v) : m;
  });
}

export type DraftLine =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string };

export type DraftPart = { kind: 'text'; text: string } | { kind: 'field'; key: string; value: string | null };

/**
 * A line cut into plain text and {{field}} spots. `value` is what the document prints there, or null
 * when the field is still empty (the placeholder stays visible, like fillTemplate leaves it).
 */
export function draftParts(line: string, params: Record<string, string | number>): DraftPart[] {
  const parts: DraftPart[] = [];
  let last = 0;
  for (const m of line.matchAll(/\{\{\s*([^}\n]+?)\s*\}\}/g)) {
    if (m.index > last) parts.push({ kind: 'text', text: line.slice(last, m.index) });
    const key = m[1].trim();
    const v = params[key];
    if (isOmittedParam({ key })) parts.push({ kind: 'text', text: '' });
    else parts.push({ kind: 'field', key, value: v !== undefined && String(v) !== '' ? String(v) : null });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ kind: 'text', text: line.slice(last) });
  return parts;
}

/** The template body as headings and paragraphs, split the way the document renderer splits it. */
export function draftLines(body: string): DraftLine[] {
  return body
    .split('\n')
    .flatMap((line): DraftLine[] => {
      const h = line.match(/^(#{1,3})\s+(.*\S)\s*$/);
      if (h) return [{ kind: 'heading', level: Math.min(h[1].length + 1, 4) as 2 | 3 | 4, text: h[2] }];
      return line.trim() ? [{ kind: 'paragraph', text: line }] : [];
    });
}
