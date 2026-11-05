import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { STAGE_BAR_COUNT, STAGE_COLORS, STAGES_HE, type TenderType } from '@obms/shared';
import { StageTag } from '../agent/Chips';
import Avatar from '../Avatar';
import { TypeCell } from '../TenderList';

/** One row of "הבל"מים שלי": a case, or a request still at אפיון (prototype ROWS). */
export interface HomeRow {
  key: string;
  kind: 'tender' | 'request';
  id: string;
  ref: string;
  name: string;
  stageIdx: number;
  type?: TenderType;
  ownerName?: string;
  /** Just sent from the request page: the "חדש" tag and a highlight. */
  isNew?: boolean;
  updatedAt: number;
  /** "{who} · {what}" under the date; only where it is known (requests). */
  lastWhat?: string;
  /** The approvals bar (prototype chainHtml): the quartet's approvals of the document. */
  segments: { role: string; approved: boolean }[];
  pct: number;
}

/** hh:mm dd.mm.yyyy in Israel time. */
const stamp = (ms: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ${p.day}.${p.month}.${p.year}`;
};

function Stage({ idx }: { idx: number }) {
  return <StageTag label={STAGES_HE[idx] ?? ''} color={STAGE_COLORS[idx] ?? STAGE_COLORS[0]} />;
}

function ApprovalBar({ segments }: { segments: HomeRow['segments'] }) {
  return (
    <span className="qbar">
      <span className="qseg-w">
        {segments.map((s) => (
          <i key={s.role} className={`qs ${s.approved ? 'a2' : ''}`} />
        ))}
      </span>
      <span className="qn">
        {segments.filter((s) => s.approved).length}/{segments.length}
      </span>
    </span>
  );
}

const NewTag = ({ row }: { row: HomeRow }) => (row.isNew ? <span className="new-tag">חדש</span> : null);

function Owner({ name }: { name?: string }) {
  if (!name) return <span style={{ color: 'var(--muted)' }}>טרם שויך</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Avatar name={name} size={22} />
      <span>{name}</span>
    </span>
  );
}

/**
 * "הבל"מים שלי" under the home grid (prototype renderHome bottom, lines 1981–1996; renderPipe, 2988–2996).
 * Procurement gets the table with "רשימה" / "לפי שלב"; everyone else gets cards. Rows are the active cases and
 * the requests still at אפיון.
 */
export default function HomeTenders({
  rows,
  layout,
  onOpen,
}: {
  rows: HomeRow[];
  layout: 'table' | 'cards';
  onOpen: (r: HomeRow) => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<'list' | 'pipe'>('list');
  const active = rows.filter((r) => r.stageIdx < STAGE_BAR_COUNT);
  const rowProps = (r: HomeRow) => ({
    role: 'link' as const,
    tabIndex: 0,
    onClick: () => onOpen(r),
    onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && onOpen(r),
  });

  if (layout === 'cards') {
    const open = rows.filter((r) => r.stageIdx < 7); // everything but סגור
    return (
      <section>
        <div className="sec-head">
          <h2 className="m-0 text-xl font-semibold">הבל"מים שלי</h2>
          <Link to="/all" className="text-sm" style={{ color: 'var(--accent)' }}>
            לכל הבל"מים ‹
          </Link>
        </div>
        {open.length === 0 ? (
          <div className="border p-5 text-sm" style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
            {t('desk.empty')}
          </div>
        ) : (
          <div className="bcards">
            {open.map((r) => (
              <div key={r.key} className={`bcard ${r.isNew ? 'hl-new' : ''}`} {...rowProps(r)}>
                <div className="bc-top">
                  <span className="id">
                    <NewTag row={r} />
                    <bdi>{r.ref}</bdi>
                  </span>
                  {r.type ? <TypeCell type={r.type} /> : <span className="text-xs" style={{ color: 'var(--muted)' }}>טרם נבחר</span>}
                </div>
                <div className="bc-name">{r.name}</div>
                <div className="bc-stage flex items-center gap-2.5">
                  <Stage idx={r.stageIdx} />
                  <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                    {r.pct}%
                  </span>
                </div>
                <ApprovalBar segments={r.segments} />
                <div className="bc-foot">
                  {r.ownerName ? <Owner name={r.ownerName} /> : <span />}
                  <span className="tabular-nums">
                    <bdi>{stamp(r.updatedAt)}</bdi>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <div className="sec-head">
        <h2 className="m-0 flex items-center text-xl font-semibold">
          הבל"מים שלי<span className="count">{active.length}</span>
        </h2>
        <div className="vt" role="group">
          {(['list', 'pipe'] as const).map((v) => (
            <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'list' ? 'רשימה' : 'לפי שלב'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="home-table">
          <table>
            <thead>
              <tr>
                <th>מספר</th>
                <th>שם</th>
                <th>מנהל מכרז</th>
                <th>שלב</th>
                <th>רביעייה</th>
                <th>עדכון אחרון</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--muted)', cursor: 'default' }}>
                    {t('desk.empty')}
                  </td>
                </tr>
              )}
              {active.map((r) => (
                <tr key={r.key} className={r.isNew ? 'hl-new' : ''} {...rowProps(r)}>
                  <td className="id">
                    <NewTag row={r} />
                    <bdi>{r.ref}</bdi>
                  </td>
                  <td className="nm">{r.name}</td>
                  <td>
                    <Owner name={r.ownerName} />
                  </td>
                  <td>
                    <Stage idx={r.stageIdx} />
                  </td>
                  <td>
                    <ApprovalBar segments={r.segments} />
                  </td>
                  <td>
                    <div className="lu">
                      <span className="tabular-nums">
                        <bdi>{stamp(r.updatedAt)}</bdi>
                      </span>
                      {r.lastWhat && <small>{r.lastWhat}</small>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pipe">
          {STAGES_HE.slice(0, STAGE_BAR_COUNT).map((label, i) => {
            const list = active.filter((r) => r.stageIdx === i);
            return (
              <div key={label} className="pcol">
                <div className="pc-h">
                  <Stage idx={i} />
                  <span className="count">{list.length}</span>
                </div>
                {list.length === 0 && <div className="pi empty-pi">אין בל"מים בשלב זה</div>}
                {list.slice(0, 3).map((r) => (
                  <div key={r.key} className="pi" {...rowProps(r)}>
                    <span className="id">
                      <bdi>{r.ref}</bdi>
                    </span>
                    <div>{r.name}</div>
                    <div className="pi-q">
                      <ApprovalBar segments={r.segments} />
                    </div>
                  </div>
                ))}
                {list.length > 3 && (
                  <Link to="/all" className="text-[13px]" style={{ color: 'var(--accent)' }}>
                    עוד {list.length - 3} ‹
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
