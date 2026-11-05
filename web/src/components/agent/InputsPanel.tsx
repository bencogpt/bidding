import { useMemo, useState, type CSSProperties } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  CHAT_MAX_LENGTH,
  INPUT_REQUIRED_DEFAULT,
  QUARTET_ROLES,
  ROLE_COLOR,
  ROLE_HE,
  activitySentence,
  chatTime,
  type ApprovalRole,
  type QuartetRole,
} from '@obms/shared';
import { db } from '../../lib/firebase';
import { useAuth } from '../../auth/AuthProvider';
import type { InputDoc } from '../../lib/hooks';
import type { AuditDoc } from '@obms/shared';
import Avatar from '../Avatar';

// The flow's own steps, shown as grey lines among the inputs (v22 chatSys).
const SYSTEM_ACTIONS = new Set([
  'approve_tender',
  'approve_on_behalf',
  'withdraw_approval',
  'withdraw_on_behalf',
  'final_check_started',
  'final_check_blocked',
  'final_check_ai_unavailable',
  'final_check_override',
  'approvals_cancelled',
  'status_change',
]);

/** The input's role in the quartet's terms: procurement is the tender manager. */
const quartetRoleOf = (role: string): ApprovalRole =>
  role === 'tender_manager' ? 'manager' : (role as ApprovalRole);

const sectionLabel = (s: string) => `סעיף ${s}`;

/**
 * "אינפוטים" (prototype v22 renderChat / renderSecMarks; spec §6.5; plan G-D10): after the document was sent for
 * approval the side panel collects the team's inputs, stored in the system (not as Google Docs comments).
 * Filters by role with counts, each input with its role colour, the flow's steps as grey lines, and a section
 * picker. "אינפוט נדרש" per section uses the default table until templates define it; the prototype marks the
 * sections inside the document — here the marks are a block at the top of the panel (the document is a frame).
 */
export default function InputsPanel({
  tenderId,
  tenderName,
  inputs,
  audit,
  sentAt,
  onSection,
}: {
  tenderId: string;
  tenderName: string;
  inputs: InputDoc[];
  audit: AuditDoc[];
  /** The send that opened this approval round: steps before it are not shown. */
  sentAt: number;
  onSection?: (section: string) => void;
}) {
  const { user, role } = useAuth();
  const [filter, setFilter] = useState<QuartetRole | ''>('');
  const [section, setSection] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const myRole = role ? quartetRoleOf(role) : null;

  const lines = useMemo(() => {
    const system = audit
      .filter((e) => SYSTEM_ACTIONS.has(e.action) && e.at >= sentAt - 1000)
      .map((e) => ({ kind: 'sys' as const, key: `a-${e.at}-${e.action}-${e.newState ?? ''}`, at: e.at, text: activitySentence(e) }))
      .filter((x): x is { kind: 'sys'; key: string; at: number; text: string } => !!x.text);
    const own = inputs
      .filter((i) => !filter || quartetRoleOf(i.role) === filter)
      .map((i) => ({ kind: 'input' as const, key: i.id, at: i.at, i }));
    return [...system, ...own].sort((a, b) => a.at - b.at);
  }, [audit, inputs, filter, sentAt]);

  const send = async () => {
    const body = text.trim();
    if (!body || !user || !role) return;
    setSending(true);
    setError('');
    try {
      const ref = doc(collection(db, 'tenders', tenderId, 'inputs'));
      await setDoc(ref, {
        id: ref.id,
        uid: user.uid,
        name: user.displayName || user.email || user.uid,
        role,
        text: body.slice(0, CHAT_MAX_LENGTH),
        section: section || null,
        createdAt: serverTimestamp(),
      });
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const given = (sec: string, r: QuartetRole) => inputs.some((i) => i.section === sec && quartetRoleOf(i.role) === r);

  return (
    <aside className="inputs-panel">
      <div>
        <h2 className="m-0 text-base font-medium">אינפוטים</h2>
        <small style={{ color: 'var(--muted)' }}>{tenderName}</small>
      </div>

      <div className="rl-bar">
        {QUARTET_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={`rl-f ${filter === r ? 'on' : ''}`}
            style={{ '--rc': ROLE_COLOR[r] } as CSSProperties}
            onClick={() => setFilter(filter === r ? '' : r)}
          >
            <i />
            {ROLE_HE[r]}
            <em>{inputs.filter((i) => quartetRoleOf(i.role) === r).length}</em>
          </button>
        ))}
      </div>

      {/* "אינפוט נדרש" per section (v22 renderSecMarks): ✓ once that role gave an input there. */}
      <div className="sec-marks">
        {Object.entries(INPUT_REQUIRED_DEFAULT).map(([sec, roles]) => (
          <div key={sec} className="sec-mk">
            <button type="button" className="sec-name" onClick={() => onSection?.(sec)}>
              {sectionLabel(sec)}
            </button>
            <span>אינפוט נדרש:</span>
            {roles.map((r) => (
              <span
                key={r}
                className={`mk ${given(sec, r) ? 'done' : ''}`}
                style={{ '--rc': ROLE_COLOR[r] } as CSSProperties}
                title={`${ROLE_HE[r]} · ${given(sec, r) ? 'נתן אינפוט' : 'ממתין לאינפוט'}`}
              >
                {given(sec, r) ? '✓ ' : ''}
                {ROLE_HE[r]}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="inps">
        {lines.length === 0 && <div className="chat-day">עדיין אין אינפוטים.</div>}
        {lines.map((l) =>
          l.kind === 'sys' ? (
            <div key={l.key} className="chat-day sys">
              {l.text} · <span dir="ltr">{chatTime(l.at)}</span>
            </div>
          ) : (
            <div key={l.key} className="inp" style={{ '--rc': ROLE_COLOR[quartetRoleOf(l.i.role)] ?? '#8a8fa3' } as CSSProperties}>
              <div className="inp-h">
                <Avatar name={l.i.name} size={20} />
                <b>{l.i.name}</b>
                <span className="rl">
                  <i />
                  {ROLE_HE[quartetRoleOf(l.i.role)] ?? l.i.role}
                </span>
                <span className="inp-t" dir="ltr">
                  {chatTime(l.i.at)}
                </span>
              </div>
              {l.i.section && (
                <button type="button" className="inp-s" onClick={() => onSection?.(l.i.section!)}>
                  {sectionLabel(l.i.section)}
                </button>
              )}
              <div className="inp-x" dir="auto">
                {l.i.text}
              </div>
            </div>
          ),
        )}
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="inp-in">
        <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="סעיף">
          <option value="">ללא סעיף</option>
          {Object.keys(INPUT_REQUIRED_DEFAULT).map((s) => (
            <option key={s} value={s}>
              {sectionLabel(s)}
            </option>
          ))}
        </select>
        <div className="chat-in !p-0 !border-0">
          <textarea
            rows={1}
            dir="auto"
            maxLength={CHAT_MAX_LENGTH}
            placeholder={`הוסיפו אינפוט כ${myRole ? ROLE_HE[myRole] : ''}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="button" className="send" disabled={sending} onClick={send} title="הוסף" aria-label="הוסף">
            ←
          </button>
        </div>
      </div>
    </aside>
  );
}
