import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isInternalRole } from '@obms/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

// Renders the tender document fetched through a Cloud Function (authorization checked
// server-side). Suppliers see the same in-system render — never the raw Google Doc.
type Doc =
  | { kind: 'html'; content: string }
  | { kind: 'pdf'; dataUrl: string };

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

  if (loading) return <div className="text-tx-soft">{t('common.loading')}</div>;
  if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-paper-2 bg-gold-soft/40 px-4 py-2 text-xs text-gold-deep">
        <span>{docUrl ? t('ws.docCollaborate') : t('ws.docManagerOnly')}</span>
        {docUrl && (
          <a className="btn btn-sm no-print" href={docUrl} target="_blank" rel="noreferrer">
            {t('ws.openInDocs')} ↗
          </a>
        )}
      </div>
      <iframe
        title="tender-document"
        srcDoc={doc?.kind === 'html' ? doc.content : undefined}
        src={doc?.kind === 'pdf' ? doc.dataUrl : undefined}
        className="h-[600px] w-full border-0 bg-white"
      />
    </div>
  );
}
