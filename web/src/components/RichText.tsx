import { createElement, type CSSProperties, type ReactNode } from 'react';
import { sanitizeRich } from '../lib/richText';

const SIZE: Record<string, string> = { '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '48px' };
const TAG: Record<string, string> = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', UL: 'ul', OL: 'ol', LI: 'li', P: 'p', DIV: 'div', SPAN: 'span', FONT: 'span' };

function toReact(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as HTMLElement;
  if (el.tagName === 'BR') return <br key={key} />;
  const tag = TAG[el.tagName];
  if (!tag) return null;
  const style: CSSProperties = {};
  if (el.style.textAlign) style.textAlign = el.style.textAlign as CSSProperties['textAlign'];
  const size = el.getAttribute('size');
  if (size && SIZE[size]) style.fontSize = SIZE[size];
  const kids = Array.from(el.childNodes).map((c, i) => toReact(c, i));
  return createElement(tag, { key, style: Object.keys(style).length ? style : undefined }, ...kids);
}

// Formatted principal-service text, drawn as React elements (never injected as markup).
export default function RichText({ html, className }: { html: string; className?: string }) {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeRich(html)}</body>`, 'text/html');
  return (
    <div className={'[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:ps-6 ' + (className ?? '')}>
      {Array.from(doc.body.childNodes).map((c, i) => toReact(c, i))}
    </div>
  );
}
