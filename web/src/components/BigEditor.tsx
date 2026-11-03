import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH, pageCount, toggleList } from '@obms/shared';

const MAX_PAGES = 5;

// A large writing window for long answers (up to five pages). Plain text: the request is stored as plain text,
// so the toolbar offers lists and undo/redo only. Closing keeps the draft with the caller.
export default function BigEditor({
  title,
  initial,
  submitLabel,
  hint,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  hint?: string;
  onSubmit: (text: string) => void;
  onClose: (draft: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);

  const pages = pageCount(text);
  const over = text.length > BRIEF_MAX_LENGTH;
  const empty = !text.trim();

  const edit = (kind: 'bullet' | 'number') => {
    const el = ta.current;
    if (!el) return;
    const r = toggleList(el.value, el.selectionStart, el.selectionEnd, kind);
    el.setSelectionRange(r.from, r.to);
    // insertText keeps the browser's undo history; the fallback replaces the range directly.
    if (!document.execCommand('insertText', false, r.text)) {
      el.setRangeText(r.text, r.from, r.to, 'select');
      setText(el.value);
    }
    el.focus();
  };
  const history = (cmd: 'undo' | 'redo') => {
    ta.current?.focus();
    document.execCommand(cmd);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose(text);
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !over && !empty) onSubmit(text);
      }}
    >
      <div className="flex h-[min(82vh,780px)] w-[min(900px,94vw)] flex-col overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center gap-3 border-b border-black/5 px-5 py-3">
          <b className="flex-1 text-sm">{title}</b>
          <span className={'text-xs ' + (over ? 'text-red-600' : 'text-tx-soft')}>
            {t('req.pagesOf', { n: pages, max: MAX_PAGES })}
          </span>
          <button type="button" className="px-2 text-tx-soft" aria-label={t('common.close')} onClick={() => onClose(text)}>
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-black/5 px-4 py-2" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className="btn btn-sm" onClick={() => edit('bullet')}>
            • {t('req.listBullets')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => edit('number')}>
            1. {t('req.listNumbers')}
          </button>
          <span className="mx-1 h-5 w-px bg-black/10" />
          <button type="button" className="btn btn-sm" onClick={() => history('undo')}>
            ↶
          </button>
          <button type="button" className="btn btn-sm" onClick={() => history('redo')}>
            ↷
          </button>
        </div>
        <textarea
          ref={ta}
          className="flex-1 resize-none px-6 py-5 text-[15px] leading-8 outline-none"
          value={text}
          placeholder={t('req.bigPlaceholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-3 border-t border-black/5 px-5 py-3">
          <span className={'flex-1 text-xs ' + (over ? 'text-red-600' : 'text-tx-soft')}>
            {over ? t('req.tooLongPages', { max: MAX_PAGES }) : hint}
          </span>
          <button type="button" className="btn" onClick={() => onClose(text)}>
            {t('req.bigClose')}
          </button>
          <button type="button" className="btn btn-gold" disabled={over || empty} onClick={() => onSubmit(text)}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
