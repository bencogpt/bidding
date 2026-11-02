import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CHAT_MAX_LENGTH, type ChatMessage, type Role } from '@obms/shared';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import Avatar from './Avatar';

const pad = (n: number) => String(n).padStart(2, '0');
// 11:32 for today's messages, 02.11 11:32 for older ones.
const timeOf = (ms: number) => {
  const d = new Date(ms);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString()
    ? hm
    : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm}`;
};

// Internal chat of the case team. Messages are immutable (part of the case record); identity and
// server time are enforced by Firestore rules. Suppliers never see it.
export default function ChatPanel({
  tenderId,
  title,
  messages,
}: {
  tenderId: string;
  title: string;
  messages: (ChatMessage & { at: number })[];
}) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  // Opening the tab (and every new message while it's open) marks the chat as read.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
    if (!user) return;
    void setDoc(doc(db, 'tenders', tenderId, 'chatReads', user.uid), { lastReadAt: serverTimestamp() }).catch(
      () => undefined,
    );
  }, [messages.length, tenderId, user]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card flex h-[60vh] flex-col p-5">
      <h3 className="border-b border-paper-2 pb-3 font-display text-xl font-semibold" title={t('chat.hint')}>
        {title}
      </h3>
      <div className="flex-1 space-y-4 overflow-y-auto py-4 pe-1">
        {messages.length === 0 && <div className="text-sm text-tx-mute">{t('chat.empty')}</div>}
        {messages.map((m) => {
          const mine = m.uid === user?.uid;
          return (
            <div key={m.id} className="flex items-end gap-2">
              {!mine && <Avatar name={m.name} size={28} />}
              <div className={`min-w-0 ${mine ? 'w-full' : 'max-w-[85%]'}`}>
                {!mine && (
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <b className="font-semibold">{m.name}</b>
                    <span className="text-tx-mute">{t(`role.${m.role as Role}`)}</span>
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${mine ? 'bg-accent text-white' : 'bg-paper-2'}`}
                >
                  <div className="whitespace-pre-wrap break-words" dir="auto">
                    {m.text}
                  </div>
                  <div className={`mt-1 text-xs ${mine ? 'text-white/70' : 'text-tx-mute'}`} dir="ltr">
                    {timeOf(m.at)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          disabled={sending || !text.trim()}
          onClick={send}
          title={t('chat.send')}
          aria-label={t('chat.send')}
        >
          ←
        </button>
        <textarea
          className="input max-h-28 min-h-10 flex-1 resize-none rounded-full px-4 py-2"
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
      </div>
    </div>
  );
}
