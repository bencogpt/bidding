// Plain-text list helpers for the large writing window: the request is stored as plain text, so a list is
// just lines that start with "- " or "1. ".

/** Turn the lines touched by the selection into a bulleted or numbered list, or back to plain lines. */
export function toggleList(value: string, start: number, end: number, kind: 'bullet' | 'number') {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const toIdx = value.indexOf('\n', end);
  const to = toIdx === -1 ? value.length : toIdx;
  const lines = value.slice(from, to).split('\n');
  const mark = kind === 'bullet' ? /^\s*-\s+/ : /^\s*\d+\.\s+/;
  const all = lines.every((l) => !l.trim() || mark.test(l));
  let n = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    const bare = l.replace(/^\s*(?:-|\d+\.)\s+/, '');
    if (all) return bare;
    n += 1;
    return kind === 'bullet' ? `- ${bare}` : `${n}. ${bare}`;
  });
  return { from, to, text: out.join('\n') };
}
