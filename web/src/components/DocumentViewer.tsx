import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isInternalRole } from '@obms/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

// Renders the tender document fetched through a Cloud Function (authorization checked
// server-side). Suppliers see the same in-system render — never the raw Google Doc.
type Doc = { kind: 'html'; content: string } | { kind: 'pdf'; dataUrl: string };

type OutlineItem = { text: string; level: number };

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
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getTenderDocument({ tenderId })
      .then((r) => {
        if (!alive) return;
        setDoc(
          r.kind === 'pdf'
            ? { kind: 'pdf', dataUrl: `data:application/pdf;base64,${r.dataBase64}` }
            : { kind: 'html', content: r.content },
        );
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tenderId]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The in-system render is same-origin (srcDoc), so the section list is read from its headings.
  const headingsOf = () =>
    Array.from(
      frameRef.current?.contentDocument?.querySelectorAll<HTMLElement>('h1, h2, h3') ?? [],
    );
  const readOutline = () =>
    setOutline(
      headingsOf().map((h) => ({ text: h.textContent?.trim() ?? '', level: Number(h.tagName[1]) })),
    );
  const jumpTo = (i: number) =>
    headingsOf()[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
          {doc?.kind === 'html' && (
            <button className="btn btn-sm" onClick={print}>
              {t('doc.print')}
            </button>
          )}
          {doc?.kind === 'pdf' && (
            <a className="btn btn-sm" href={doc.dataUrl} download={`tender-${tenderId}.pdf`}>
              {t('doc.download')}
            </a>
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
        {outline.length > 1 && (
          <nav className="w-52 shrink-0 overflow-y-auto border-e border-paper-2 p-3 text-sm">
            <div className="mb-2 text-xs font-semibold text-tx-mute">{t('doc.outline')}</div>
            <ul className="space-y-0.5">
              {outline.map((o, i) => (
                <li key={i} style={{ paddingInlineStart: `${(o.level - 1) * 12}px` }}>
                  <button
                    className="w-full rounded px-2 py-1 text-start text-tx-soft hover:bg-paper-2 hover:text-tx"
                    onClick={() => jumpTo(i)}
                  >
                    {o.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="min-w-0 flex-1 bg-paper-2 p-4">
          <iframe
            ref={frameRef}
            title="tender-document"
            srcDoc={doc?.kind === 'html' ? doc.content : undefined}
            src={doc?.kind === 'pdf' ? doc.dataUrl : undefined}
            onLoad={readOutline}
            className={`mx-auto block w-full max-w-4xl border-0 bg-white shadow-card ${frameHeight}`}
          />
        </div>
      </div>
    </div>
  );
}
