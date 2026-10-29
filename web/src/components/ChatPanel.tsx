import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CHAT_MAX_LENGTH, type ChatMessage, type Role } from '@obms/shared';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';

// Internal chat of the case team. Messages are immutable (part of the case record); identity and
// server time are enforced by Firestore rules. Suppliers never see it.
export default function ChatPanel({
  tenderId,
  messages,
}: {
  tenderId: string;
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
    <div className="card flex h-[60vh] flex-col p-4">
      <p className="mb-2 text-xs text-tx-mute">{t('chat.hint')}</p>
      <div className="flex-1 space-y-2 overflow-y-auto pe-1">
        {messages.length === 0 && <div className="text-sm text-tx-mute">{t('chat.empty')}</div>}
        {messages.map((m) => {
          const mine = m.uid === user?.uid;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] rounded-lg p-2 text-sm ${mine ? 'bg-teal-soft' : 'bg-paper-2'}`}>
                <div className="mb-0.5 flex items-center gap-2 text-xs text-tx-mute">
                  <span className="font-semibold text-tx">{m.name}</span>
                  <span className="chip">{t(`role.${m.role as Role}`)}</span>
                  <span dir="ltr">{new Date(m.at).toLocaleString('he-IL')}</span>
                </div>
                <div className="whitespace-pre-wrap break-words" dir="auto">
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          className="input min-h-12 flex-1"
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
        <button className="btn btn-gold" disabled={sending || !text.trim()} onClick={send}>
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
