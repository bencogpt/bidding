import { useState } from 'react';
import { ON_BEHALF_REASON_MIN, firstName } from '@obms/shared';

/**
 * A recorded reason (at least ON_BEHALF_REASON_MIN characters, kept in the activity log). By default the tender
 * manager approving on a participant's behalf (plan D1d; approved by UX 1.1); with title / confirmLabel, any other
 * such step, e.g. continuing without the AI review (plan G-D5).
 */
export default function OnBehalfDialog({
  name = '',
  roleHe = '',
  title,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  name?: string;
  roleHe?: string;
  title?: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= ON_BEHALF_REASON_MIN;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="on-behalf-title"
        className="w-full max-w-md border p-5"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 'var(--radius-panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="on-behalf-title" className="mb-3 text-base font-semibold">
          {title ?? `אישור בשם ${name} · ${roleHe}`}
        </h2>
        <label className="label" htmlFor="on-behalf-reason">
          סיבה (תירשם ביומן הפעילות)
        </label>
        <textarea
          id="on-behalf-reason"
          className="input min-h-[90px]"
          value={reason}
          maxLength={500}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
        {!ok && reason.length > 0 && (
          <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {ON_BEHALF_REASON_MIN} תווים לפחות
          </div>
        )}
        {error && (
          <div className="mt-2 text-sm" style={{ color: 'var(--bad)' }}>
            {error}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel}>
            ביטול
          </button>
          <button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel ?? `אשר בשם ${firstName(name)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
