import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BRIEF_MAX_LENGTH, pageCount } from '@obms/shared';
import { plainToRich, richToPlain, sanitizeRich } from '../lib/richText';

const MAX_PAGES = 5;

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const Sep = () => <span className="mx-2 h-5 w-px bg-black/10" />;

// A large writing window for long answers (up to five pages), with the formatting bar of the UX prototype: bold,
// italic, underline, alignment, lists, text size, undo and redo. The request itself stays plain text (lists keep
// their bullet or number); the formatting is handed back separately for the summary. Closing keeps the draft.
export default function BigEditor({
  title,
  initial,
  initialHtml,
  submitLabel,
  hint,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  initialHtml?: string; // the formatting this text was written with, when it is still known
  submitLabel: string;
  hint?: string;
  onSubmit: (text: string, html: string) => void;
  onClose: (draft: string, html: string) => void;
}) {
  const { t } = useTranslation();
  const ed = useRef<HTMLDivElement>(null);
  const [plain, setPlain] = useState(initial);

  useEffect(() => {
    const el = ed.current;
    if (!el) return;
    el.innerHTML = initialHtml ? sanitizeRich(initialHtml) : plainToRich(initial);
    setPlain(richToPlain(el));
    el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const read = () => {
    const el = ed.current;
    return { text: el ? richToPlain(el) : plain, html: el ? sanitizeRich(el.innerHTML) : '' };
  };
  const changed = () => setPlain(ed.current ? richToPlain(ed.current) : '');
  const fmt = (cmd: string, val?: string) => {
    if (val === '') return;
    ed.current?.focus();
    document.execCommand(cmd, false, val);
    changed();
  };

  const pages = pageCount(plain);
  const over = plain.length > BRIEF_MAX_LENGTH;
  const empty = !plain.trim();
  const submit = () => {
    const r = read();
    if (!over && r.text.trim()) onSubmit(r.text, r.html);
  };
  const close = () => {
    const r = read();
    onClose(r.text, r.html);
  };

  const tb = (title: string, cmd: string, icon: ReactNode, val?: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-md text-[15px] transition-colors hover:bg-accent-soft hover:text-accent"
      onClick={() => fmt(cmd, val)}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(20,18,40,.5)] p-4"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
      }}
    >
      <div className="flex h-[min(82vh,780px)] w-[min(900px,92vw)] flex-col overflow-hidden rounded-xl border border-black/10 bg-surface shadow-lg">
        <div className="flex items-center gap-3.5 border-b border-black/5 px-5 py-3.5">
          <b className="text-[15px] font-medium">{title}</b>
          <span className={'ms-auto text-xs ' + (over ? 'text-red-600' : 'text-tx-soft')}>
            {t('req.pagesOf', { n: pages, max: MAX_PAGES })}
          </span>
          <button
            type="button"
            className="grid h-[30px] w-[30px] place-items-center rounded-full text-tx-soft transition-colors hover:bg-paper hover:text-tx"
            aria-label={t('common.close')}
            onClick={close}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-0.5 border-b border-black/5 px-4 py-2" onMouseDown={(e) => e.preventDefault()}>
          {tb(t('req.fmtBold'), 'bold', <b>B</b>)}
          {tb(t('req.fmtItalic'), 'italic', <i>I</i>)}
          {tb(t('req.fmtUnderline'), 'underline', <u>U</u>)}
          <Sep />
          {tb(t('req.fmtAlignRight'), 'justifyRight', <Icon><path d="M2 3h12M5 6.5h9M2 10h12M5 13.5h9" /></Icon>)}
          {tb(t('req.fmtAlignCenter'), 'justifyCenter', <Icon><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" /></Icon>)}
          {tb(t('req.fmtAlignLeft'), 'justifyLeft', <Icon><path d="M2 3h12M2 6.5h9M2 10h12M2 13.5h9" /></Icon>)}
          <Sep />
          {tb(
            t('req.fmtBullets'),
            'insertUnorderedList',
            <Icon>
              <path d="M6 4h8M6 8h8M6 12h8" />
              <circle cx="2.5" cy="4" r=".6" fill="currentColor" />
              <circle cx="2.5" cy="8" r=".6" fill="currentColor" />
              <circle cx="2.5" cy="12" r=".6" fill="currentColor" />
            </Icon>,
          )}
          {tb(
            t('req.fmtNumbers'),
            'insertOrderedList',
            <Icon>
              <path d="M6 4h8M6 8h8M6 12h8" />
              <path d="M2 3v2.5M2 7.5h1.5L2 9.5h1.5M2 11h1.5v1.2H2" strokeWidth="1" />
            </Icon>,
          )}
          <Sep />
          <select
            title={t('req.fmtSize')}
            aria-label={t('req.fmtSize')}
            className="rounded-md border border-black/10 bg-surface px-2 py-1 text-[13px]"
            defaultValue=""
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              fmt('fontSize', e.target.value);
              e.target.selectedIndex = 0;
            }}
          >
            <option value="">{t('req.fmtSize')}</option>
            <option value="2">{t('req.fmtSmall')}</option>
            <option value="3">{t('req.fmtNormal')}</option>
            <option value="5">{t('req.fmtLarge')}</option>
            <option value="6">{t('req.fmtXLarge')}</option>
          </select>
          <Sep />
          {tb(t('req.fmtUndo'), 'undo', <Icon><path d="M6 4L3 7l3 3M3 7h6a4 4 0 0 1 0 8H7" /></Icon>)}
          {tb(t('req.fmtRedo'), 'redo', <Icon><path d="M10 4l3 3-3 3M13 7H7a4 4 0 0 0 0 8h2" /></Icon>)}
        </div>
        <div
          ref={ed}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-ph={t('req.bigPlaceholder')}
          className="min-h-0 flex-1 overflow-auto bg-surface px-[26px] py-5 text-[15px] leading-[1.9] outline-none empty:before:text-tx-soft empty:before:content-[attr(data-ph)] [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:ps-6"
          onInput={changed}
          onPaste={(e) => {
            // Pasted text arrives as plain text, so nothing foreign gets into the formatting.
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
            changed();
          }}
        />
        <div className="flex items-center gap-2.5 border-t border-black/5 px-5 py-3">
          <span className={'me-auto text-xs ' + (over ? 'text-red-600' : 'text-tx-soft')}>
            {over ? t('req.tooLongPages', { max: MAX_PAGES }) : hint}
          </span>
          <button type="button" className="btn" onClick={close}>
            {t('req.bigClose')}
          </button>
          <button type="button" className="btn btn-gold" disabled={over || empty} onClick={submit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
