import { useId, useState, type ReactNode } from 'react';

/**
 * The dark tooltip under the header's main button (prototype line 59): #1f2340, white 12px text, 250px wide,
 * anchored to the button's left edge because the button sits at the far left of the header. Shown on hover,
 * as in the prototype; the text is also linked to the button for screen readers.
 */
export default function HeaderTip({ tip, children }: { tip?: string; children: (describedBy?: string) => ReactNode }) {
  const id = useId();
  const [hover, setHover] = useState(false);
  if (!tip) return <>{children(undefined)}</>;
  return (
    <span className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[250px] whitespace-normal px-3 py-2 text-xs font-normal leading-normal text-white"
        style={{
          background: 'var(--tip-bg)',
          borderRadius: 6,
          boxShadow: '0 8px 20px rgba(20,18,50,.25)',
          display: hover ? 'block' : 'none',
        }}
      >
        {tip}
      </span>
    </span>
  );
}
