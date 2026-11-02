const AVATAR_COLORS = ['#6a4fe0', '#2f6fe0', '#0a8fc2', '#0a9a8e', '#1f9d5f', '#8a5cf0'];

/** Small round picture of a person: coloured initials, the colour stable per name. */
export default function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ background: AVATAR_COLORS[hue], width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {initials}
    </span>
  );
}
