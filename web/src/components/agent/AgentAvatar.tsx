/**
 * The supervising agent as a small character: a violet badge with a white robot face, a yellow antenna and
 * a magnifier (prototype agAvatar, line 2654). 36px in the side panel; while it checks, a halo pulses.
 */
export default function AgentAvatar({ size = 36, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <span
      className="inline-flex flex-none overflow-hidden rounded-full align-middle"
      style={{ width: size, height: size, animation: busy ? 'agent-halo 1.3s infinite' : undefined }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" width={size} height={size} className="block">
        <circle cx="20" cy="20" r="20" fill="#5b3fd0" />
        <line x1="20" y1="6.5" x2="20" y2="10.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="20" cy="5.5" r="2" fill="#ffd166" />
        <rect x="9" y="10.5" width="22" height="17" rx="6" fill="#fff" />
        <circle cx="15.5" cy="18" r="2.4" fill="#5b3fd0" />
        <circle cx="24.5" cy="18" r="2.4" fill="#5b3fd0" />
        <path d="M15.5 23.2q4.5 2.8 9 0" stroke="#5b3fd0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="30" cy="30" r="4.2" fill="#5b3fd0" stroke="#fff" strokeWidth="2" />
        <line x1="33" y1="33" x2="36" y2="36" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
