// Pure helpers that turn the (markdown-like) template body into the HTML shown in the system.
// No Firebase imports, so they can be unit-tested without a network.

/** Text → HTML text: user-typed values can never become markup in a rendered document. */
export const escapeHtml = (s: string): string =>
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
      return line.trim() ? `<p>${escapeHtml(line)}</p>` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Make a Google Docs HTML export read properly right-to-left: the page is RTL, the export's
 * hard-coded left alignment is dropped (so text starts on the right), and list/paragraph indents
 * move to the right side. Scripts are removed.
 */
export function rtlifyExportedHtml(raw: string): string {
  let html = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/text-align\s*:\s*(?:left|start)\s*;?/gi, '');
  const css = `<style>
html{direction:rtl}
body{direction:rtl;text-align:start;max-width:760px!important;margin:32px auto!important;padding:0 24px!important;line-height:1.7}
p,h1,h2,h3,h4,h5,h6,li,td,th,div{direction:rtl;unicode-bidi:plaintext}
ol,ul{padding-left:0!important;padding-right:0!important;margin-left:0!important}
li{margin-left:0!important;margin-right:36pt!important}
table{width:100%;border-collapse:collapse}
img{max-width:100%;height:auto}
</style>`;
  html = /<html[^>]*>/i.test(html)
    ? html.replace(/<html[^>]*>/i, '<html dir="rtl" lang="he">')
    : `<html dir="rtl" lang="he">${html}</html>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${css}</head>`) : css + html;
}
