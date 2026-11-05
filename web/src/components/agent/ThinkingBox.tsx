import { useEffect, useState } from 'react';
import { AGENT_STEPS_FINAL_HE, AGENT_STEPS_HE } from '@obms/shared';

const STEP_MS = 1000; // the prototype's pace: one second per step (line 2518)

/**
 * The step to show: it moves forward one step a second, never past the step the server reached. Without a
 * server step (plan B1 not deployed yet) it walks to the last step and holds there until the run ends.
 */
export function usePacedStep(running: boolean, serverStep?: number | null, final = false): number {
  const last = (final ? AGENT_STEPS_FINAL_HE : AGENT_STEPS_HE).length - 1;
  const target = Math.min(serverStep ?? last, last);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!running) {
      setShown(0);
      return;
    }
    if (shown >= target) return;
    const t = setTimeout(() => setShown((s) => Math.min(s + 1, target)), STEP_MS);
    return () => clearTimeout(t);
  }, [running, shown, target]);
  return shown;
}

/**
 * "The agent is checking": title, a progress bar filled by steps, and the steps list — ✓ done, › current
 * with typing dots, · waiting (prototype thinkInner, line 2513; CSS lines 276–287).
 */
export default function ThinkingBox({ on, step, final = false }: { on: 'draft' | 'document'; step: number; final?: boolean }) {
  // The final check before the lock has its own title and five steps (v22 thinkInner, plan G-D3).
  const steps: readonly string[] = final ? AGENT_STEPS_FINAL_HE : AGENT_STEPS_HE;
  const n = steps.length;
  const pct = Math.max(6, Math.round((step / n) * 100));
  return (
    <div className="py-3.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <div>
          <b className="block text-[14px] font-medium">
            {final ? 'בדיקה סופית של הסוכן המפקח' : <>הסוכן המפקח בודק את {on === 'draft' ? 'הטיוטה' : 'המסמך'}</>}
          </b>
          <small className="text-xs" style={{ color: 'var(--muted)' }}>
            {/* UX answer 4.1: a real check can take up to a minute */}
            {final ? 'לפני הפרסום לספקים' : 'זה עשוי לקחת עד דקה'}
          </small>
        </div>
      </div>
      <div className="my-3 h-[5px] overflow-hidden rounded-[3px]" style={{ background: 'var(--line-soft)' }}>
        <i
          className="block h-full rounded-[3px]"
          style={{ width: `${pct}%`, background: 'var(--accent)', transition: 'width .9s ease' }}
        />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]" style={{ color: 'var(--muted)' }}>
        {steps.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'cur' : 'todo';
          return (
            <li
              key={label}
              className="flex items-center gap-2"
              style={{ color: state === 'done' ? 'var(--text)' : state === 'cur' ? 'var(--accent)' : undefined }}
            >
              <b className="w-3.5 text-center font-medium" style={{ color: state === 'done' ? 'var(--ok)' : undefined }}>
                {state === 'done' ? '✓' : state === 'cur' ? '›' : '·'}
              </b>
              {label}
              {state === 'cur' && (
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
