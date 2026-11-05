import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  CHAT_MAX_LENGTH,
  chatTime,
  splitMentions,
  withDaySeparators,
  type ChatMessage,
  type Role,
} from '@obms/shared';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import Avatar from './Avatar';

/** Text to start the message with, e.g. "@דני " from a person's card; a new `n` applies it again. */
export interface ChatSeed {
  text: string;
  n: number;
}

/** A message with its @mentions marked (prototype `mention`, line 2229). */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((p, i) =>
        p.mention ? (
          <span key={i} className="mn">
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

/**
 * The case team chat as the prototype's floating dock (renderTeam, lines 2238–2247; HTML 1700–1704): the case
 * and its participants on top, the day separators, other people's messages with avatar, name and role, and
 * the caller's own on the other side without them. Messages are immutable (part of the case record); identity
 * and server time are enforced by Firestore rules. Suppliers never see it.
 */
export default function ChatPanel({
  tenderId,
  title,
  number,
  people,
  messages,
  seed,
  onClose,
}: {
  tenderId: string;
  title: string;
  number?: string | null;
  /** The case's participants, shown as avatars in the header. */
  people: { name: string }[];
  messages: (ChatMessage & { at: number })[];
  seed?: ChatSeed | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Opening the dock (and every new message while it's open) marks the chat as read.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    if (!user) return;
    void setDoc(doc(db, 'tenders', tenderId, 'chatReads', user.uid), { lastReadAt: serverTimestamp() }).catch(
      () => undefined,
    );
  }, [messages.length, tenderId, user]);

  // The input takes the focus on opening, and a seed ("@name ") with the cursor after it.
  useEffect(() => {
    if (seed) setText(seed.text);
    const el = input.current;
    if (!el) return;
    el.focus();
    if (seed) requestAnimationFrame(() => el.setSelectionRange(seed.text.length, seed.text.length));
  }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const body = text.trim();
    if (!body || !user || !role) return;
    setSending(true);
    setError('');
    try {
      const ref = doc(collection(db, 'tenders', tenderId, 'chat'));
      await setDoc(ref, {
        id: ref.id,
        uid: user.uid,
        name: user.displayName || user.email || user.uid,
        role,
        text: body.slice(0, CHAT_MAX_LENGTH),
        createdAt: serverTimestamp(),
      });
      setText('');
      input.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const items = withDaySeparators(messages, Date.now());

  return (
    <div className="tdock" role="dialog" aria-label={t('chat.title')}>
      <div className="tdock-h" title={t('chat.hint')}>
        <div className="tdock-t">
          <b>{t('chat.title')}</b>
          <small>
            {title}
            {number && (
              <>
                {' · '}
                <span dir="ltr">{number}</span>
              </>
            )}
          </small>
        </div>
        <div className="tdock-p">
          {people.map((p) => (
            <span key={p.name} title={p.name} className="inline-flex rounded-full">
              <Avatar name={p.name} size={24} />
            </span>
          ))}
        </div>
        <button type="button" className="tdock-x" onClick={onClose} title={t('chat.close')} aria-label={t('common.close')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
      <div className="chat-log" ref={log}>
        {items.length === 0 && <div className="chat-day">{t('chat.empty')}</div>}
        {items.map((it) => {
          if (it.kind === 'day') {
            return (
              <div key={it.key} className="chat-day">
                {it.label}
              </div>
            );
          }
          const m = it.m;
          // A system line (plan G-D2, e.g. an approval on someone's behalf): a grey pill, as v22 renders them.
          if (m.uid === 'system') {
            return (
              <div key={it.key} className="chat-day sys">
                {m.text} · <span dir="ltr">{chatTime(m.at)}</span>
              </div>
            );
          }
          const time = <span className="cm-t" dir="ltr">{chatTime(m.at)}</span>;
          if (m.uid === user?.uid) {
            return (
              <div key={it.key} className="cm me">
                <div className="cm-body">
                  <div className="bub" dir="auto">
                    <MessageText text={m.text} />
                    {time}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={it.key} className="cm">
              <span className="cm-av">
                <Avatar name={m.name} size={20} />
              </span>
              <div className="cm-body">
                <div className="cm-meta">
                  <b>{m.name}</b>
                  <span>{t(`role.${m.role as Role}`)}</span>
                </div>
                <div className="bub" dir="auto">
                  <MessageText text={m.text} />
                  {time}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="px-3.5 pb-1 text-xs text-red-600">{error}</div>}
      <div className="chat-in">
        <textarea
          ref={input}
          rows={1}
          dir="auto"
          maxLength={CHAT_MAX_LENGTH}
          placeholder={t('chat.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="send"
          disabled={sending}
          onClick={send}
          title={t('chat.send')}
          aria-label={t('chat.send')}
        >
          ←
        </button>
      </div>
    </div>
  );
}
