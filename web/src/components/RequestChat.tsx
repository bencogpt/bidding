import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH, SCOPE_PAGE_CHARS, pageCount } from '@obms/shared';
import type { ChatMsg } from '../lib/useRequestAgent';
import BigEditor from './BigEditor';

const SHORT_MAX = 1000; // an ordinary answer; only the principal service may run to five pages
const CLIP = 400; // a long answer is shown clipped in its bubble

// The guided mode: round bubbles, a typing indicator, quick-reply chips and an input that grows, with a large
// writing window for long answers. An earlier answer is edited in place, in its own bubble.
export default function RequestChat({
  chat,
  chips,
  typing,
  disabled,
  asking,
  onSay,
  onEdit,
  editAsking,
}: {
  chat: ChatMsg[];
  chips: string[];
  typing: boolean;
  disabled: boolean;
  asking: string | null;
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
  const isScope = asking === 'scope';
  const max = isScope ? BRIEF_MAX_LENGTH : SHORT_MAX;

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
    <div className="flex flex-col overflow-hidden rounded-lg border border-black/10">
      <div className="flex items-center gap-2 border-b border-black/5 bg-paper-2/60 px-4 py-3 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-soft text-gold-deep">✦</span>
        {t('req.chatName')}
      </div>
      <div className="flex h-72 flex-col gap-3 overflow-auto p-4">
        {chat.map((m, i) => {
          if (m.role === 'agent') {
            return (
              <div key={i} className="max-w-[86%] self-start whitespace-pre-wrap rounded-2xl bg-paper-2 px-4 py-2 text-sm leading-relaxed">
                {m.text}
              </div>
            );
          }
          if (editing === i) {
            return (
              <div key={i} className="w-full max-w-[86%] min-w-[260px] self-end rounded-2xl border border-gold bg-white p-2">
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
                  <button type="button" className="btn btn-sm" disabled={!draft.trim()} onClick={() => saveEdit(i, draft)}>
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
            <div key={i} className="group flex items-center gap-2 self-end">
              {editAsking(i) !== null && (
                <button
                  type="button"
                  className="grid h-6 w-6 flex-none place-items-center rounded-full border border-black/10 bg-white text-tx-soft opacity-0 transition-opacity hover:border-gold hover:text-gold-deep focus:opacity-100 group-hover:opacity-100"
                  title={t('req.chatEdit')}
                  aria-label={t('req.chatEdit')}
                  onClick={() => startEdit(i)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
                  </svg>
                </button>
              )}
              <div className="max-w-[86%] whitespace-pre-wrap rounded-2xl bg-ink-800 px-4 py-2 text-sm leading-relaxed text-white">
                {clip(m.text)}
                {m.edited && <span className="mt-0.5 block text-end text-[10px] opacity-75">{t('req.chatEdited')}</span>}
              </div>
            </div>
          );
        })}
        {typing && <div className="self-start rounded-2xl bg-paper-2 px-4 py-2 text-sm text-tx-soft">…</div>}
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t border-black/5 p-3">
        {chips.length > 0 && !typing && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="rounded-full border border-gold px-3 py-1 text-xs text-gold-deep hover:bg-gold-soft"
                onClick={() => send(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-black/10 px-3 py-1">
          <textarea
            ref={field}
            rows={1}
            className="min-h-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 outline-none"
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
              className="btn btn-sm"
              title={t('req.expand')}
              disabled={disabled || typing}
              onClick={() => setBig(true)}
            >
              ⤢
            </button>
          )}
          <button type="button" className="btn btn-sm" disabled={disabled || typing || !text.trim()} onClick={() => send(text)}>
            {t('req.chatSend')}
          </button>
        </div>
        {isScope && (
          <div className="text-xs text-tx-soft">
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
