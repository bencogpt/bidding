// conversionCalc — pure helpers of the template converter (no I/O; unit tested).
import {
  FIELD_TYPES,
  findFillSpots,
  hasWords,
  isConfidentialParam,
  type ConversionField,
  type FillSpot,
  type TemplateParam,
} from '@obms/shared';

const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

const countOf = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);

export interface ValidationResult {
  fields: ConversionField[];
  supplierFill: string[];
  dropped: { reason: string; detail: string }[];
}

/**
 * Keep only proposals that are grounded in the document: every quote must exist verbatim on one
 * line, `replace` must occur exactly once inside its quote, keys must be snake_case. Occurrences
 * of the same key are merged; confidential keys (estimate/budget) become internal and optional.
 */
export function validateProposals(
  docText: string,
  fields: Partial<ConversionField>[],
  supplierFill: string[],
): ValidationResult {
  const dropped: ValidationResult['dropped'] = [];
  const byKey = new Map<string, ConversionField>();
  for (const f of fields) {
    const key = String(f.key ?? '').trim();
    if (!KEY_RE.test(key)) {
      dropped.push({ reason: 'bad_key', detail: key });
      continue;
    }
    const occurrences = (f.occurrences ?? []).filter((o) => {
      const quote = o?.quote ?? '';
      const replace = o?.replace ?? '';
      let reason: string | null = null;
      if (!quote || quote.includes('\n')) reason = 'quote_multiline';
      else if (!docText.includes(quote)) reason = 'quote_not_in_doc';
      else if (!replace || countOf(quote, replace) !== 1) reason = 'replace_not_once_in_quote';
      else if (replace.includes('{{')) reason = 'already_a_field';
      if (reason) dropped.push({ reason, detail: `${key}: ${quote.slice(0, 80)}` });
      return !reason;
    });
    const confidential = isConfidentialParam({ key, internal: f.internal });
    // G6: a confidential value (the estimate) never goes into the document — it stays an
    // internal-only field, and its spot in the text is left for the manager to remove.
    if (confidential && occurrences.length) {
      dropped.push({ reason: 'confidential_not_in_doc', detail: `${key}: ${occurrences[0].quote.slice(0, 80)}` });
      occurrences.length = 0;
    }
    if (!occurrences.length && !confidential) continue;
    const existing = byKey.get(key);
    if (existing) {
      for (const o of occurrences) {
        if (!existing.occurrences.some((e) => e.quote === o.quote)) existing.occurrences.push(o);
      }
      continue;
    }
    byKey.set(key, {
      key,
      labelHe: f.labelHe?.trim() || key,
      type: (FIELD_TYPES as readonly string[]).includes(f.type ?? '') ? f.type! : 'text',
      required: confidential ? false : f.required !== false,
      ...(confidential ? { internal: true } : {}),
      occurrences,
    });
  }
  // A word-less supplier quote (a bare blank) must be an entire line of the document; it then only
  // exempts lines that are exactly that blank (isSupplierFillLine), never a manager's fill-in line.
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const docLines = new Set(docText.split('\n').map(norm));
  const fill: string[] = [];
  for (const raw of supplierFill) {
    const q = raw.trim();
    const reason =
      !q || q.includes('\n') || !(docText.includes(q) || docLines.has(norm(q)))
        ? 'supplier_quote_not_in_doc'
        : !hasWords(q) && !docLines.has(norm(q))
          ? 'supplier_quote_too_generic'
          : null;
    if (reason) dropped.push({ reason, detail: q.slice(0, 80) });
    else if (!fill.includes(q)) fill.push(q);
  }
  return { fields: [...byKey.values()], supplierFill: fill, dropped };
}

/** All occurrences, longest quote first (so a short quote can't break a longer one). */
function orderedOccurrences(fields: ConversionField[]) {
  return fields
    .flatMap((f) => f.occurrences.map((o) => ({ ...o, key: f.key })))
    .sort((a, b) => b.quote.length - a.quote.length);
}

export const placeholderQuote = (o: { quote: string; replace: string; key: string }) =>
  o.quote.replace(o.replace, `{{${o.key}}}`);

/** The document text after the conversion — exactly what the Docs replaceAllText batch produces. */
export function applyToText(text: string, fields: ConversionField[]): string {
  let out = text;
  for (const o of orderedOccurrences(fields)) out = out.split(o.quote).join(placeholderQuote(o));
  return out;
}

/** Docs API requests for the conversion, in the same order as applyToText. */
export function replaceRequests(fields: ConversionField[]) {
  return orderedOccurrences(fields).map((o) => ({
    replaceAllText: {
      containsText: { text: o.quote, matchCase: true },
      replaceText: placeholderQuote(o),
    },
  }));
}

/** Fill-in spots that the proposals would still leave in the document. */
export function remainingSpots(docText: string, fields: ConversionField[], supplierFill: string[]): FillSpot[] {
  return findFillSpots(applyToText(docText, fields), supplierFill);
}

/** Merge proposals from a later agent round into the accepted set. */
export function mergeFields(accepted: ConversionField[], incoming: ConversionField[]): ConversionField[] {
  const out = accepted.map((f) => ({ ...f, occurrences: [...f.occurrences] }));
  for (const f of incoming) {
    const same = out.find((x) => x.key === f.key);
    if (!same) out.push(f);
    else for (const o of f.occurrences) if (!same.occurrences.some((e) => e.quote === o.quote)) same.occurrences.push(o);
  }
  return out;
}

/** Approved fields as template params (metadata source for the post-conversion sync). */
export function fieldsAsParams(fields: ConversionField[]): TemplateParam[] {
  return fields.map((f) => ({
    key: f.key,
    labelHe: f.labelHe,
    type: f.type,
    required: f.required,
    ...(f.internal ? { internal: true } : {}),
  }));
}
