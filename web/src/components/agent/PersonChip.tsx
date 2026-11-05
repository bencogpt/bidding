import { firstName } from '@obms/shared';
import Avatar from '../Avatar';
import { useChatDock } from './ChatDock';

/**
 * A name that opens a small contact card on hover or keyboard focus: who the person is, and one way to reach
 * them — the case chat, with "@first-name " already typed (prototype personChip, line 2280; CSS 202–213).
 * No e-mail, phone or Skype. An invisible 10px bridge keeps the card open on the way from the name to it.
 */
export default function PersonChip({ name, role, unit }: { name: string; role?: string; unit?: string }) {
  const chat = useChatDock();
  const sub = [role, unit].filter(Boolean).join(' · ');
  return (
    <span className="group relative inline-flex align-middle" tabIndex={0}>
      <span
        className="inline-flex cursor-pointer items-center gap-1.5"
        style={{ color: 'var(--accent)', borderBottom: '1px dotted var(--accent)' }}
      >
        <Avatar name={name} size={20} />
        {name}
      </span>
      <span
        className="absolute start-0 top-[calc(100%+8px)] z-[60] hidden w-[300px] gap-3 border p-3.5 font-normal group-hover:grid group-focus-within:grid"
        style={{
          background: 'var(--panel)',
          borderColor: 'var(--line)',
          borderRadius: 'var(--radius-panel)',
          color: 'var(--text)',
          boxShadow: '0 14px 36px rgba(20,18,50,.22)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* the bridge between the name and the card */}
        <span className="absolute inset-x-0 -top-2.5 h-2.5" aria-hidden="true" />
        <span className="flex items-center gap-3">
          <Avatar name={name} size={42} />
          <span>
            <b className="block text-[15px] font-medium">{name}</b>
            {sub && (
              <small className="mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>
                {sub}
              </small>
            )}
          </span>
        </span>
        {chat && (
          <span className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => chat.openWith(`@${firstName(name)} `)}>
              פנייה בצ'אט
            </button>
          </span>
        )}
      </span>
    </span>
  );
}
