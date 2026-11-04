import { useState } from 'react';
import { fmtDateTime, type TenderDoc, type VersionView } from '@obms/shared';
import { api } from '../../lib/api';
import { useVersions } from '../../lib/hooks';
import Avatar from '../Avatar';

type Open = { n: number; compare: boolean } | null;

/**
 * "היסטוריית גרסאות" (prototype renderVer, lines 2777–2786): a row per stored version of the document — version,
 * date, who edited, what changed, how many paragraphs — with "צפה" and "השווה לנוכחית". "שחזר" is not offered:
 * writing an old text back into a live Google Doc has no safe backend yet (plan B6).
 */
export default function VersionsTab({ tender }: { tender: TenderDoc }) {
  const versions = useVersions(tender.id);
  const [open, setOpen] = useState<Open>(null);
  const [view, setView] = useState<VersionView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const rows = [...versions].sort((a, b) => b.n - a.n); // newest first
  const currentN = rows[0]?.n;

  const show = async (n: number, compare: boolean) => {
    setOpen({ n, compare });
    setView(null);
    setError('');
    setLoading(true);
    try {
      setView(await api.getVersionView({ tenderId: tender.id, n, compare }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!rows.length) {
    return (
      <div className="border px-[22px] py-4 text-sm" style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 8, color: 'var(--muted)' }}>
        הגרסאות נשמרות מרגע יצירת המסמך.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-auto border" style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 8 }}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['גרסה', 'תאריך', 'נערך על ידי', 'מה השתנה', 'שינויים', ''].map((h, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap px-4 py-3 text-start text-xs font-medium"
                  style={{ color: 'var(--muted)', background: '#fff', borderBottom: '1px solid var(--line)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.n} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums" style={{ color: 'var(--muted)' }}>
                  v{v.n}
                  {v.n === currentN && (
                    <span
                      className="ms-2 rounded-full border px-2 py-px text-[11px]"
                      style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
                    >
                      נוכחית
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums" style={{ color: 'var(--muted)' }}>
                  {fmtDateTime(v.at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {v.by ? (
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={v.by} size={22} />
                      {v.by}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  )}
                </td>
                <td className="max-w-[380px] px-4 py-3">{v.summary ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--muted)' }}>
                  {v.changes ?? '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-end">
                  <button type="button" className="btn btn-sm" onClick={() => void show(v.n, false)}>
                    צפה
                  </button>{' '}
                  {v.n !== currentN && (
                    <button type="button" className="btn btn-sm" onClick={() => void show(v.n, true)}>
                      השווה לנוכחית
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col border"
            style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 'var(--radius-panel)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
              <h2 className="text-base font-semibold">
                {open.compare ? `v${open.n} לעומת הגרסה הנוכחית` : `גרסה v${open.n}`}
              </h2>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(null)}>
                סגור
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-[13px] leading-[1.8]">
              {loading && <span style={{ color: 'var(--muted)' }}>טוען…</span>}
              {error && <span style={{ color: 'var(--bad)' }}>{error}</span>}
              {view &&
                'text' in view &&
                view.text
                  .split(/\r?\n/)
                  .filter((l) => l.trim())
                  .map((l, i) => (
                    <p key={i} className="m-0 mb-1.5">
                      {l}
                    </p>
                  ))}
              {view && 'rows' in view && (
                <div>
                  <div className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                    <span className="me-3" style={{ color: 'var(--bad)' }}>
                      − v{view.n}
                    </span>
                    <span style={{ color: 'var(--ok)' }}>+ v{view.currentN} (הנוכחית)</span>
                  </div>
                  {view.rows.every((r) => r.kind === 'same' || r.kind === 'gap') && (
                    <div style={{ color: 'var(--muted)' }}>אין הבדלים בטקסט.</div>
                  )}
                  {view.rows.map((r, i) =>
                    r.kind === 'gap' ? (
                      <div key={i} className="my-1 text-xs" style={{ color: 'var(--muted)' }}>
                        ⋯ {r.text}
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="px-2"
                        style={{
                          background: r.kind === 'add' ? 'var(--ok-soft)' : r.kind === 'del' ? '#fdecec' : undefined,
                          textDecoration: r.kind === 'del' ? 'line-through' : undefined,
                          color: r.kind === 'del' ? 'var(--bad)' : undefined,
                        }}
                      >
                        {r.kind === 'add' ? '+ ' : r.kind === 'del' ? '− ' : ''}
                        {r.text}
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
