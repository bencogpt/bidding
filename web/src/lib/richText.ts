// Formatting for the principal-service text (bold, lists, alignment, size). The request itself stays plain text:
// the formatting is kept in the browser for the editor and the summary only. Untrusted markup never reaches the page:
// the HTML is parsed into an inert document and only a small allow-list of tags and attributes is kept.

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'FONT', 'SPAN']);
const ALIGN = new Set(['left', 'right', 'center', 'justify']);

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const plainToRich = (text: string) => escapeHtml(text).replace(/\n/g, '<br>');

function clean(node: Node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (!ALLOWED.has(el.tagName)) {
        el.replaceWith(document.createTextNode(el.textContent ?? ''));
        continue;
      }
      const align = ALIGN.has(el.style.textAlign) ? el.style.textAlign : '';
      const size = el.tagName === 'FONT' ? el.getAttribute('size') : null;
      for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
      if (align) el.style.textAlign = align;
      if (size && /^[1-7]$/.test(size)) el.setAttribute('size', size);
      clean(el);
    } else if (child.nodeType !== Node.TEXT_NODE) {
      child.remove();
    }
  }
}

/** The HTML with everything outside the allow-list removed (safe to hand to an editable area). */
export function sanitizeRich(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  clean(doc.body);
  return doc.body.innerHTML;
}

const BLOCK = new Set(['P', 'DIV', 'UL', 'OL', 'LI']);

/** Plain text of formatted content: line breaks kept, list items keep their bullet or number. */
export function richToPlain(root: Node): string {
  let out = '';
  const walk = (node: Node, list: { ordered: boolean; n: number } | null) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as HTMLElement;
      if (el.tagName === 'BR') {
        out += '\n';
      } else if (el.tagName === 'UL' || el.tagName === 'OL') {
        if (out && !out.endsWith('\n')) out += '\n';
        walk(el, { ordered: el.tagName === 'OL', n: 0 });
      } else if (el.tagName === 'LI') {
        if (out && !out.endsWith('\n')) out += '\n';
        if (list) {
          list.n += 1;
          out += list.ordered ? `${list.n}. ` : '• ';
        }
        walk(el, null);
        if (!out.endsWith('\n')) out += '\n';
      } else {
        if (BLOCK.has(el.tagName) && out && !out.endsWith('\n')) out += '\n';
        walk(el, list);
        if (BLOCK.has(el.tagName) && !out.endsWith('\n')) out += '\n';
      }
    }
  };
  walk(root, null);
  return out.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}
