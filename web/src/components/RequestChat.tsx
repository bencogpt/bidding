import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMsg } from '../lib/useRequestAgent';

// The guided mode: round bubbles, a typing indicator, quick-reply chips and an input.
export default function RequestChat({
  chat,
  chips,
  typing,
  disabled,
  onSay,
}: {
  chat: ChatMsg[];
  chips: string[];
  typing: boolean;
  disabled: boolean;
  onSay: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [chat, typing]);
  const send = (v: string) => {
    if (!v.trim() || typing || disabled) return;
    onSay(v);
    setText('');
  };
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-black/10">
      <div className="flex items-center gap-2 border-b border-black/5 bg-paper-2/60 px-4 py-3 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-soft text-gold-deep">✦</span>
        {t('req.chatName')}
      </div>
      <div className="flex h-72 flex-col gap-3 overflow-auto p-4">
        {chat.map((m, i) => (
          <div
            key={i}
            className={
              'max-w-[86%] rounded-2xl px-4 py-2 text-sm leading-relaxed ' +
              (m.role === 'agent' ? 'self-start bg-paper-2' : 'self-end bg-ink-800 text-white')
            }
          >
            {m.text}
          </div>
        ))}
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
        <div className="flex items-center gap-2 rounded-full border border-black/10 px-3 py-1">
          <input
            className="flex-1 bg-transparent py-1 text-sm outline-none"
            placeholder={t('req.chatPlaceholder')}
            maxLength={1000}
            value={text}
            disabled={disabled || typing}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(text)}
          />
          <button type="button" className="btn btn-sm" disabled={disabled || typing || !text.trim()} onClick={() => send(text)}>
            {t('req.chatSend')}
          </button>
        </div>
      </div>
    </div>
  );
}
