// Pure helpers that turn the (markdown-like) template body into the HTML shown in the system.
// No Firebase imports, so they can be unit-tested without a network.

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * `#` / `##` / `###` lines become real headings (with ids, so the viewer can list and jump to
 * sections); every other non-empty line stays a paragraph, exactly as before.
 */
export function bodyToHtml(body: string): string {
  let n = 0;
  return body
    .split('\n')
    .map((line) => {
      const h = line.match(/^(#{1,3})\s+(.*\S)\s*$/);
      if (h) {
        n += 1;
        // The document title is the page's <h1>, so a body "#" is shown one level lower.
        const level = Math.min(h[1].length + 1, 4);
        return `<h${level} id="sec-${n}">${escapeHtml(h[2])}</h${level}>`;
      }
      return line.trim() ? `<p>${line}</p>` : '';
    })
    .filter(Boolean)
    .join('\n');
}
