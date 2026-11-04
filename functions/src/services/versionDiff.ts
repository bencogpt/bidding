// The versions tab (plan B6): what changed between two texts of the document. Pure — unit tested.
import { diffArrays } from 'diff';
import type { VersionDiffRow } from '@obms/shared';

/** The text as non-empty paragraphs (one per line). */
export const paragraphsOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

// A line that opens a section: "## title", "3. תיאור השירות", "פרק ב'", "נספח 2" — and is short.
const HEADING = /^(?:#{1,3}\s+|\d{1,2}(?:\.\d{1,2})*[.)]?\s+\S|פרק\s|נספח\s)/u;
const headingText = (line: string) => line.replace(/^#{1,3}\s+/, '').trim();
const isHeading = (line: string) => line.length <= 80 && HEADING.test(line);

export interface VersionChange {
  summary: string;
  /** Changed paragraphs: an edited paragraph counts once, an added or removed one counts once. */
  changes: number;
}

/**
 * "What changed" between the previous version and this one, for the versions table. Version 1 is the document as
 * created. Sections are named from the heading above each changed paragraph (at most three).
 */
export function summarizeChange(prev: string | null, next: string): VersionChange {
  if (prev === null) return { summary: 'המסמך נוצר מהטיוטה', changes: 0 };
  const a = paragraphsOf(prev);
  const b = paragraphsOf(next);
  const parts = diffArrays(a, b);
  let changes = 0;
  let removedRun = 0;
  const sections: string[] = [];
  let heading = '';
  const noteSection = () => {
    if (heading && !sections.includes(heading)) sections.push(heading);
  };
  for (const part of parts) {
    if (!part.added && !part.removed) {
      removedRun = 0;
      for (const line of part.value) if (isHeading(line)) heading = headingText(line);
      continue;
    }
    if (part.removed) {
      removedRun = part.value.length;
      changes += part.value.length;
      noteSection();
    } else {
      // added lines that follow removed ones are the edit of them: count the pair once
      const edited = Math.min(removedRun, part.value.length);
      changes += part.value.length - edited;
      removedRun = 0;
      noteSection();
      for (const line of part.value) if (isHeading(line)) heading = headingText(line);
    }
  }
  if (!changes) return { summary: 'ללא שינוי בטקסט', changes: 0 };
  const where = sections.slice(0, 3).join(', ');
  const what = changes === 1 ? 'שונתה פסקה אחת' : `שונו ${changes} פסקאות`;
  return { summary: where ? `${what} · ${where}${sections.length > 3 ? ' ועוד' : ''}` : what, changes };
}

/**
 * The comparison of two versions as rows, with unchanged text collapsed to `context` lines around each change
 * (a long document would otherwise be pages of "same").
 */
export function contextDiff(prev: string, next: string, context = 2): VersionDiffRow[] {
  const parts = diffArrays(paragraphsOf(prev), paragraphsOf(next));
  const out: VersionDiffRow[] = [];
  parts.forEach((part, i) => {
    if (part.added) return void part.value.forEach((text) => out.push({ kind: 'add', text }));
    if (part.removed) return void part.value.forEach((text) => out.push({ kind: 'del', text }));
    const lines = part.value;
    const first = i === 0;
    const last = i === parts.length - 1;
    // keep the lines next to a change: the start of a run follows one, its end precedes the next
    const head = first ? 0 : context;
    const tail = last ? 0 : context;
    if (lines.length <= head + tail + 1) return void lines.forEach((text) => out.push({ kind: 'same', text }));
    lines.slice(0, head).forEach((text) => out.push({ kind: 'same', text }));
    out.push({ kind: 'gap', text: `${lines.length - head - tail} פסקאות ללא שינוי` });
    lines.slice(lines.length - tail).forEach((text) => out.push({ kind: 'same', text }));
  });
  return out;
}
