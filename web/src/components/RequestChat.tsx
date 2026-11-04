import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH, SCOPE_PAGE_CHARS, pageCount } from '@obms/shared';
import type { ChatMsg } from '../lib/useRequestAgent';
import BigEditor from './BigEditor';

const SHORT_MAX = 1000; // an ordinary answer; only the principal service may run to five pages
const CLIP = 400; // a long answer is shown clipped in its bubble

const Sparkle = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[55%] w-[55%]">
    <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".8" />
  </svg>
);
const AgentAvatar = ({ large }: { large?: boolean }) =>
  large ? (
    <span className="relative grid h-10 w-10 flex-none place-items-center rounded-full border-[3px] border-accent-soft bg-accent text-white shadow-[0_0_0_1.5px_#5b3fd1]">
      <Sparkle />
      <i className="absolute -bottom-0.5 -end-0.5 h-[11px] w-[11px] rounded-full border-2 border-paper bg-green-600" />
    </span>
  ) : (
    <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full border-[1.5px] border-accent bg-accent-soft text-accent">
      <Sparkle />
    </span>
  );
const Row = ({ ai, children }: { ai?: boolean; children: ReactNode }) => (
  <div className={'flex max-w-[86%] items-start gap-2 ' + (ai ? 'self-start' : 'items-center self-end')}>{children}</div>
);

// The guided mode: an agent card with round bubbles, a typing indicator, quick-reply chips and an input that grows,
// with a large writing window for long answers. An earlier answer is edited in place, in its own bubble.
export default function RequestChat({
  chat,
  chips,
  typing,
  disabled,
  asking,
  details,
  onSay,
  onEdit,
  editAsking,
}: {
  chat: ChatMsg[];
  chips: string[];
  typing: boolean;
  disabled: boolean;
  asking: string | null;
  details?: { n: number; total: number }; // how many of the mandatory details are known
  onSay: (text: string) => void;
  onEdit: (index: number, text: string) => void;
  editAsking: (index: number) => string | null; // what was asked when that answer was given; null = not editable
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [big, setBig] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // the answer being edited inline
  const [draft, setDraft] = useState('');
  const [bigEdit, setBigEdit] = useState<number | null>(null); // the principal service is edited in the large window
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const isScope = asking === 'scope';
  const max = isScope ? BRIEF_MAX_LENGTH : SHORT_MAX;
  const over = isScope && text.length > BRIEF_MAX_LENGTH;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [chat, typing]);
  // Grow with the text, up to a few lines; longer text scrolls inside.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = '34px';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);
  // When the agent has answered, the cursor is in the input and the input is in view.
  useEffect(() => {
    if (typing || disabled || editing !== null || chat[chat.length - 1]?.role !== 'agent') return;
    field.current?.focus({ preventScroll: true });
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [typing, chat, disabled, editing]);
  // An edit cannot go on once the agent starts answering or the conversation is rewound.
  useEffect(() => {
    if (editing !== null && editAsking(editing) === null) setEditing(null);
    if (bigEdit !== null && editAsking(bigEdit) === null) setBigEdit(null);
  }, [chat, typing, editing, bigEdit, editAsking]);

  const send = (v: string) => {
    if (!v.trim() || typing || disabled || v.length > max) return;
    onSay(v);
    setText('');
  };
  const startEdit = (i: number) => {
    if (editAsking(i) === 'scope') {
      setBigEdit(i);
      return;
    }
    setDraft(chat[i].text);
    setEditing(i);
  };
  const saveEdit = (i: number, v: string) => {
    if (!v.trim()) return;
    setEditing(null);
    setBigEdit(null);
    onEdit(i, v);
  };
  const clip = (m: string) =>
    m.length > CLIP ? `${m.slice(0, CLIP)}… (${t('req.pagesShort', { n: Math.ceil(m.length / SCOPE_PAGE_CHARS) })})` : m;

  return (
    <div className="flex max-h-[480px] flex-col overflow-hidden rounded-[10px] border border-black/10 bg-surface">
      <div className="flex items-center gap-3 border-b border-black/5 bg-paper px-4 py-3">
        <AgentAvatar large />
        <b className="flex-1 text-sm">{t('req.chatName')}</b>
        {details && (
          <span className="rounded-full border border-black/10 bg-paper px-3 py-0.5 text-xs text-tx-soft">
            {t('req.chatDetails', details)}
          </span>
        )}
      </div>
      <div className="flex min-h-[150px] flex-1 flex-col gap-3 overflow-auto px-4 py-[18px] [&>:first-child]:mt-auto">
        {chat.map((m, i) => {
          if (m.role === 'agent') {
            return (
              <Row key={i} ai>
                <AgentAvatar />
                <div className="whitespace-pre-wrap rounded-[14px] rounded-ss-[4px] border border-black/5 bg-paper px-3.5 py-[9px] text-sm leading-relaxed">
                  {m.text}
                </div>
              </Row>
            );
          }
          if (editing === i) {
            return (
              <div key={i} className="min-w-[260px] max-w-[86%] self-end rounded-[14px] rounded-ee-[4px] border border-accent bg-surface px-3.5 py-[9px]">
                <textarea
                  autoFocus
                  className="min-h-[60px] w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
                  value={draft}
                  maxLength={SHORT_MAX}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null);
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveEdit(i, draft);
                    }
                  }}
                />
                <div className="mb-2 text-xs text-tx-soft">{t('req.chatEditing')}</div>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-gold btn-sm" disabled={!draft.trim()} onClick={() => saveEdit(i, draft)}>
                    {t('req.chatEditSave')}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                    {t('req.chatEditCancel')}
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="group flex max-w-[86%] items-center gap-2 self-end">
              {editAsking(i) !== null && (
                <button
                  type="button"
                  className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border border-black/10 bg-surface text-tx-soft opacity-0 transition-opacity duration-150 hover:border-accent hover:text-accent focus:opacity-100 group-hover:opacity-100"
                  title={t('req.chatEdit')}
                  aria-label={t('req.chatEdit')}
                  onClick={() => startEdit(i)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
                  </svg>
                </button>
              )}
              <div className="whitespace-pre-wrap rounded-[14px] rounded-ee-[4px] bg-accent px-3.5 py-[9px] text-sm leading-relaxed text-white">
                {clip(m.text)}
                {m.edited && <span className="mt-0.5 block text-end text-[10px] opacity-75">{t('req.chatEdited')}</span>}
              </div>
            </div>
          );
        })}
        {typing && (
          <Row ai>
            <AgentAvatar />
            <div className="rounded-[14px] rounded-ss-[4px] border border-black/5 bg-paper px-3.5 py-[9px]">
              <span className="inline-flex items-center gap-1 px-0.5 py-1" aria-label="…">
                {[0, 150, 300].map((d) => (
                  <i
                    key={d}
                    className="h-1.5 w-1.5 animate-rcdot rounded-full bg-tx-soft"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </span>
            </div>
          </Row>
        )}
        <div ref={end} />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-black/5 px-4 py-3">
        {chips.length > 0 && !typing && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="rounded-full border border-accent bg-transparent px-3.5 py-[5px] text-[13px] text-accent transition-colors hover:bg-accent hover:text-white"
                onClick={() => send(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div
          ref={composer}
          className="flex items-end gap-2 rounded-[22px] border border-black/10 bg-surface py-1 pe-1 ps-3 transition-colors focus-within:border-accent"
        >
          <textarea
            ref={field}
            rows={1}
            className="min-h-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 outline-none"
            placeholder={t('req.chatPlaceholder')}
            maxLength={max}
            value={text}
            disabled={disabled || typing}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Principal service: Enter writes a new line, Ctrl+Enter sends. Other answers: Enter sends.
              if (isScope ? e.ctrlKey || e.metaKey : !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          {(isScope || text.length > 200) && (
            <button
              type="button"
              className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-tx-soft transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-40"
              title={t('req.expand')}
              aria-label={t('req.expand')}
              disabled={disabled || typing}
              onClick={() => setBig(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-accent text-white transition-opacity hover:bg-accent-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-accent"
            aria-label={t('req.chatSend')}
            title={t('req.chatSend')}
            disabled={disabled || typing || !text.trim()}
            onClick={() => send(text)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        {isScope && (
          <div className={'text-[11px] ' + (over ? 'text-red-600' : 'text-tx-soft')}>
            {t('req.pagesOf', { n: pageCount(text), max: 5 })} · {t('req.ctrlEnter')}
          </div>
        )}
      </div>
      {big && (
        <BigEditor
          title={isScope ? t('req.principalService') : t('req.chatName')}
          initial={text}
          submitLabel={t('req.chatSend')}
          hint={t('req.bigHint')}
          onClose={(draft) => {
            setText(draft.slice(0, max));
            setBig(false);
          }}
          onSubmit={(v) => {
            setBig(false);
            send(v);
          }}
        />
      )}
      {bigEdit !== null && (
        <BigEditor
          title={`${t('req.chatEdit')}: ${t('req.principalService')}`}
          initial={chat[bigEdit].text}
          submitLabel={t('req.chatEditSave')}
          hint={t('req.chatEditing')}
          onClose={() => setBigEdit(null)}
          onSubmit={(v) => saveEdit(bigEdit, v)}
        />
      )}
    </div>
  );
}
