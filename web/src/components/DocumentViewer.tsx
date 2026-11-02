import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isInternalRole } from '@obms/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

// Renders the tender document fetched through a Cloud Function (authorization checked
// server-side). Suppliers see the same in-system render — never the raw Google Doc.
// ok = every field in the section is filled; gaps = {{placeholders}} are still unfilled.
type OutlineItem = { text: string; level: number; status: 'ok' | 'gaps' };

export default function DocumentViewer({
  tenderId,
  googleDocId,
}: {
  tenderId: string;
  googleDocId?: string | null;
}) {
  const { t } = useTranslation();
  const { role } = useAuth();
  // Internal roles collaborate in the Doc itself; suppliers must NEVER get the raw link.
  const docUrl =
    isInternalRole(role ?? undefined) && googleDocId
      ? `https://docs.google.com/document/d/${googleDocId}/edit`
      : null;
  const [html, setHtml] = useState<string | null>(null);
  // Editing swaps the read-only render for the Google Doc editor (same permissions as the Doc).
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(0);

  // Reloads when leaving the editor, so the render shows what was just edited.
  useEffect(() => {
    if (editing) return;
    let alive = true;
    setLoading(true);
    api
      .getTenderDocument({ tenderId })
      .then((r) => alive && setHtml(r.content))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tenderId, editing]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The in-system render is same-origin (srcDoc), so the section list is read from its headings.
  const headingsOf = () =>
    Array.from(
      frameRef.current?.contentDocument?.querySelectorAll<HTMLElement>('h1, h2, h3, h4') ?? [],
    );
  // A section has gaps when unfilled {{placeholders}} remain between its heading and the next.
  const hasGaps = (h: HTMLElement) => {
    for (
      let el = h.nextElementSibling;
      el && !/^H[1-4]$/.test(el.tagName);
      el = el.nextElementSibling
    ) {
      if (el.textContent?.includes('{{')) return true;
    }
    return false;
  };
  // Show heading-like paragraphs as real headings, so every document gets an outline:
  //  - "## title" lines (documents generated before the server wrote them as headings), and
  //  - chapter and annex lines such as "פרק ב'" or "נספח 3", which documents converted from Word
  //    carry as bare lines with no heading style.
  const CHAPTER = /^(?:פרק|נספח)\s+[\p{L}\d]{1,4}['׳]?\s*(?:[-–—:]\s*\S.{0,50})?$/u;
  const promoteHeadings = () => {
    const d = frameRef.current?.contentDocument;
    d?.querySelectorAll('p').forEach((p) => {
      const text = p.textContent?.trim() ?? '';
      const md = text.match(/^(#{1,3})\s+(.*\S)$/);
      if (!md && !CHAPTER.test(text)) return;
      const h = d.createElement(`h${md ? Math.min(md[1].length + 1, 4) : 3}`);
      h.textContent = md ? md[2] : text;
      h.style.cssText =
        'font-size:18px;border-bottom:2px solid #d8a23a;padding-bottom:4px;margin-top:28px';
      p.replaceWith(h);
    });
  };
  const readOutline = () => {
    // Exported documents carry fixed widths; keep them inside the frame (no sideways scrolling).
    const d = frameRef.current?.contentDocument;
    if (d?.head) {
      const fit = d.createElement('style');
      fit.textContent =
        'html,body{overflow-x:hidden}body{width:auto!important;box-sizing:border-box}' +
        '*{max-width:100%;box-sizing:border-box}';
      d.head.appendChild(fit);
    }
    promoteHeadings();
    const hs = headingsOf();
    setOutline(
      hs.map((h) => ({
        text: h.textContent?.trim() ?? '',
        level: Number(h.tagName[1]),
        status: hasGaps(h) ? 'gaps' : 'ok',
      })),
    );
    setActive(0);
    // Highlight the section being read as the document scrolls.
    frameRef.current?.contentWindow?.addEventListener('scroll', () => {
      let idx = 0;
      headingsOf().forEach((h, i) => {
        if (h.getBoundingClientRect().top <= 24) idx = i;
      });
      setActive(idx);
    });
  };
  // Scroll only the document frame: scrollIntoView would also scroll the surrounding page.
  const jumpTo = (i: number) => {
    const w = frameRef.current?.contentWindow;
    const h = headingsOf()[i];
    if (w && h) w.scrollTo({ top: h.getBoundingClientRect().top + w.scrollY - 8, behavior: 'smooth' });
  };

  const print = () => {
    const w = frameRef.current?.contentWindow;
    w?.focus();
    w?.print();
  };
  const toggleFullscreen = () =>
    document.fullscreenElement
      ? void document.exitFullscreen()
      : void boxRef.current?.requestFullscreen();

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>;

  const frameHeight = fullscreen ? 'h-[calc(100vh-3.5rem)]' : 'h-[calc(100vh-19rem)] min-h-[480px]';

  return (
    <div ref={boxRef} className="card flex flex-col overflow-hidden bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-2 bg-gold-soft/40 px-4 py-2 text-xs text-gold-deep">
        <span>{docUrl ? t('ws.docCollaborate') : t('ws.docManagerOnly')}</span>
        <span className="no-print flex items-center gap-2">
          {!editing && (
            <button className="btn btn-sm" onClick={print}>
              {t('doc.print')}
            </button>
          )}
          {docUrl && (
            <button className="btn btn-sm" onClick={() => setEditing((e) => !e)}>
              {editing ? t('doc.doneEditing') : t('doc.edit')}
            </button>
          )}
          <button className="btn btn-sm" onClick={toggleFullscreen}>
            {fullscreen ? t('doc.exitFullscreen') : t('doc.fullscreen')}
          </button>
          {docUrl && (
            <a className="btn btn-sm" href={docUrl} target="_blank" rel="noreferrer">
              {t('ws.openInDocs')} ↗
            </a>
          )}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        {!editing && outline.length > 1 && (
          <nav className="w-56 shrink-0 overflow-y-auto border-e border-paper-2 p-3 text-sm">
            <div className="mb-2 px-1 text-xs font-semibold text-tx-mute">{t('doc.outline')}</div>
            <ul className="space-y-0.5">
              {outline.map((o, i) => (
                <li key={i}>
                  <button
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-start ${
                      i === active
                        ? 'bg-accent-soft font-semibold text-accent'
                        : 'text-tx-soft hover:bg-paper-2 hover:text-tx'
                    }`}
                    style={{ paddingInlineStart: `${8 + Math.max(0, o.level - 3) * 12}px` }}
                    onClick={() => jumpTo(i)}
                  >
                    <span className="flex-1 truncate">{o.text}</span>
                    <i
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        o.status === 'gaps' ? 'bg-amber-500' : 'bg-green-600'
                      }`}
                      title={t(o.status === 'gaps' ? 'doc.sectionGaps' : 'doc.sectionOk')}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="min-w-0 flex-1 bg-paper-2 p-4">
          {editing && docUrl ? (
            <iframe
              title="tender-document-editor"
              src={docUrl}
              className={`block w-full border-0 bg-white shadow-card ${frameHeight}`}
            />
          ) : (
            <iframe
              ref={frameRef}
              title="tender-document"
              srcDoc={html ?? undefined}
              onLoad={readOutline}
              className={`mx-auto block w-full max-w-4xl border-0 bg-white shadow-card ${frameHeight}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
