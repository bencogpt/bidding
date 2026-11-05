import type { ReactNode } from 'react';

/**
 * "פרסום לספקים": procurement picks the suppliers (today's supplier picker, passed as children) and publishes.
 * The access tab is hidden for now (plan D9), so this is where suppliers are picked (plan D8). Not in the
 * prototype — the layout is provisional until UX supplies a mock. If the supervisor's publish gate blocks,
 * the workspace shows the reason and the audited override, as before.
 */
export default function PublishDialog({
  canPublish,
  busy,
  onPublish,
  onClose,
  children,
}: {
  canPublish: boolean;
  busy?: boolean;
  onPublish: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
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
            {canPublish ? 'הספקים שנבחרו יקבלו גישה למסמך עם הפרסום.' : 'בחרו לפחות ספק אחד ושמרו את הבחירה.'}
          </span>
          <button type="button" className="btn btn-primary" disabled={!canPublish || busy} onClick={onPublish}>
            פרסום לספקים
          </button>
        </div>
      </div>
    </div>
  );
}
