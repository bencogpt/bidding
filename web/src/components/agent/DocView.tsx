import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { FindingView } from '@obms/shared';
import { api } from '../../lib/api';

// Toolbar icons of the prototype's document viewer (IC, line 2122).
const IC: Record<string, string> = {
  list: 'M2 4h12M2 8h12M2 12h8',
  hl: 'M4 3h8l-1.5 6H5.5zM5 13h6',
  pen: 'M3 3l5 10 5-10',
  erase: 'M3 10l5-6 5 4-4 5H5zM9 14h5',
  text: 'M3 3h10v10H3zM6 6h4M8 6v5',
  minus: 'M4 8h8',
  plus: 'M4 8h8M8 4v8',
  fit: 'M3 5v6h10V5zM6 8h4',
  rot: 'M12 8a4 4 0 1 1-1.2-2.8M12 3v3H9',
  cols: 'M3 3h10v10H3zM8 3v10',
  search: 'M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l4 4',
  print: 'M4 6V2h8v4M4 11H2V6h12v5h-2M4 9h8v5H4z',
  save: 'M3 3h8l2 2v8H3zM5 3v4h6V3M5 13V9h6v4',
  gear: 'M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
};

function Tool({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  // Tools without an action yet (comments and suggestions are made in Google Docs) are shown disabled (plan D13).
  return (
    <button
      type="button"
      className="grid place-items-center disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:text-tx"
      title={onClick ? label : `${label} — בקרוב`}
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={IC[icon]} />
      </svg>
    </button>
  );
}

const Sep = () => <i className="inline-block h-[18px] w-px" style={{ background: 'var(--line)' }} />;

const PAGE_PX = 1123; // an A4 page at 96 dpi: the page counter is an estimate for the rendered document

export interface DocViewHandle {
  jumpTo: (f: FindingView) => void;
}

/**
 * The created document in the workspace (prototype renderDoc, lines 2139–2160; CSS 696–712): banner with the
 * Google Docs link, the toolbar, and the document on a grey canvas. It renders in a sandboxed frame (no scripts
 * run inside); the page can still scroll and mark it, so jumping to a finding scrolls only the document.
 * Suppliers keep the plain DocumentViewer.
 */
const DocView = forwardRef<DocViewHandle, { tenderId: string; googleDocId?: string | null; internal: boolean; locked?: boolean }>(
  function DocView({ tenderId, googleDocId, internal, locked = false }, ref) {
    const [html, setHtml] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [zoom, setZoom] = useState(1);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [query, setQuery] = useState<string | null>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const docUrl = internal && googleDocId ? `https://docs.google.com/document/d/${googleDocId}/edit` : null;

    useEffect(() => {
      let alive = true;
      api
        .getTenderDocument({ tenderId })
        .then((r) => alive && setHtml(r.kind === 'html' ? r.content : null))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
      return () => {
        alive = false;
      };
    }, [tenderId]);

    const doc = () => frame.current?.contentDocument ?? null;
    const win = () => frame.current?.contentWindow ?? null;

    const onLoad = () => {
      const d = doc();
      const w = win();
      if (!d || !w) return;
      // The document as a white sheet; exported fixed widths stay inside the frame.
      const style = d.createElement('style');
      style.textContent =
        'html{background:#fff}html,body{overflow-x:hidden}body{width:auto!important;box-sizing:border-box;' +
        'padding:56px 72px!important;margin:0;color:#111;font-size:14px;line-height:1.7}*{max-width:100%;box-sizing:border-box}';
      d.head?.appendChild(style);
      const count = () => setPages(Math.max(1, Math.ceil(d.documentElement.scrollHeight / PAGE_PX)));
      count();
      w.addEventListener('scroll', () => setPage(Math.min(Math.floor(w.scrollY / PAGE_PX) + 1, Math.max(1, Math.ceil(d.documentElement.scrollHeight / PAGE_PX)))));
    };

    useEffect(() => {
      const d = doc();
      if (d?.body) d.body.style.zoom = String(zoom);
    }, [zoom]);

    // Scroll only the frame's own document (scrollIntoView could move the surrounding page too).
    const scrollToEl = (el: HTMLElement) => {
      const w = win();
      if (!w) return;
      const r = el.getBoundingClientRect();
      w.scrollTo({ top: Math.max(0, r.top + w.scrollY - w.innerHeight / 2 + r.height / 2), behavior: 'smooth' });
    };

    useImperativeHandle(ref, () => ({
      jumpTo: (f: FindingView) => {
        const d = doc();
        if (!d) return;
        const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
        const blocks = [...d.querySelectorAll<HTMLElement>('p, li, td, h1, h2, h3, h4')];
        const quote = f.evidence ? norm(f.evidence) : '';
        const el =
          (quote ? blocks.find((b) => norm(b.textContent ?? '').includes(quote)) : undefined) ??
          blocks.find((b) => /^H[1-4]$/.test(b.tagName) && !!norm(b.textContent ?? '') && f.location.includes(norm(b.textContent ?? '')));
        if (!el) return;
        scrollToEl(el);
        const before = el.style.background;
        el.style.transition = 'background .3s';
        el.style.background = '#fff3b0';
        setTimeout(() => {
          el.style.background = before;
        }, 2200);
      },
    }));

    const find = (q: string) => {
      const w = win() as (Window & { find?: (s: string) => boolean }) | null;
      if (q.trim() && w?.find) w.find(q.trim());
    };

    if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>;

    return (
      <div className="overflow-hidden border" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
          style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
        >
          {/* After the final approval the document is locked (new text; the prototype shows only the first). */}
          <span>
            {locked
              ? 'המסמך נעול לאחר האישור הסופי. רק מנהל המכרז יכול לפתוח אותו מחדש.'
              : 'ניתן להעיר ולהציע שינויים במסמך. רק מנהל המכרז מאשר שינויים.'}
          </span>
          {docUrl && (
            <a
              className="whitespace-nowrap rounded-full px-3.5 py-[5px] text-xs font-semibold"
              style={{ background: 'var(--panel)', color: 'var(--text)' }}
              href={docUrl}
              target="_blank"
              rel="noreferrer"
            >
              פתח ב-Google Docs ↗
            </a>
          )}
        </div>
        <div
          className="flex items-center justify-between gap-4 px-4 py-2"
          style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}
        >
          <div className="flex items-center gap-3.5">
            <Tool icon="list" label="רשימה" />
            <Sep />
            <Tool icon="hl" label="הדגשה" />
            <Tool icon="pen" label="סימון" />
            <Tool icon="erase" label="מחיקה" />
            <Sep />
            <Tool icon="text" label="טקסט" />
          </div>
          <div className="flex items-center gap-3.5">
            <Tool icon="minus" label="הקטנה" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} />
            <Tool icon="plus" label="הגדלה" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} />
            <Tool icon="fit" label="התאמה לרוחב" onClick={() => setZoom(1)} />
            <span className="border px-3.5 py-[3px] text-[13px] tabular-nums" style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--text)' }}>
              {page}
            </span>
            <span className="text-[13px] tabular-nums">of {pages}</span>
            <Tool icon="rot" label="סיבוב" />
            <Tool icon="cols" label="תצוגת עמודים" />
          </div>
          <div className="flex items-center gap-3.5">
            {query !== null ? (
              <input
                autoFocus
                className="w-40 border px-2 py-0.5 text-[13px]"
                style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--text)' }}
                placeholder="חיפוש במסמך"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') find(query);
                  if (e.key === 'Escape') setQuery(null);
                }}
              />
            ) : null}
            <Tool icon="search" label="חיפוש" onClick={() => (query === null ? setQuery('') : find(query))} />
            <Sep />
            <Tool
              icon="print"
              label="הדפסה"
              onClick={() => {
                win()?.focus();
                win()?.print();
              }}
            />
            <Tool icon="save" label="שמירה" />
            <Tool icon="gear" label="הגדרות" />
          </div>
        </div>
        <div className="h-[560px] px-9 pt-4" style={{ background: '#e7e7ea' }}>
          {html === null ? (
            <div className="py-6 text-sm" style={{ color: 'var(--muted)' }}>
              טוען…
            </div>
          ) : (
            <iframe
              ref={frame}
              title="tender-document"
              srcDoc={html}
              // No scripts run inside the document; the page reads it to jump, mark and print.
              sandbox="allow-same-origin allow-modals"
              onLoad={onLoad}
              className="block h-[544px] w-full border-0 bg-white"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}
            />
          )}
        </div>
      </div>
    );
  },
);

export default DocView;
