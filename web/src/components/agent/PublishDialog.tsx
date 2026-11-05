import type { ReactNode } from 'react';

/**
 * "פרסום לספקים" (plan G-D6; UX answers 1.2): procurement picks the suppliers (the existing picker, passed as
 * children, without the permissions list — 1.2.C) and one button saves the pick and publishes (1.2.D), after
 * "לפרסם ל-{N} ספקים?" because publishing can't be undone (1.2.B). The picker is not redesigned (1.2.A).
 */
export default function PublishDialog({
  count,
  busy,
  onPublish,
  onClose,
  children,
}: {
  /** Suppliers picked in the dialog. */
  count: number;
  busy?: boolean;
  onPublish: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const publish = () => {
    if (window.confirm(`לפרסם ל-${count} ספקים?`)) onPublish();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col border"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 'var(--radius-panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--line-soft)' }}>
          <h2 id="publish-title" className="text-base font-semibold">
            פרסום לספקים
          </h2>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            סגור
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {/* 1.2.3 said "…ושמרו את הבחירה"; with one button there is nothing to save (new wording, UX to confirm). */}
            {count > 0 ? 'הספקים שנבחרו יקבלו גישה למסמך עם הפרסום.' : 'בחרו לפחות ספק אחד.'}
          </span>
          <button type="button" className="btn btn-primary" disabled={count === 0 || busy} onClick={publish}>
            פרסום לספקים
          </button>
        </div>
      </div>
    </div>
  );
}
