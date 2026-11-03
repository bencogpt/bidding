// A fixed-window call counter, kept pure so it can be tested without Firestore.
export interface UsageWindow {
  start: number;
  count: number;
}

export function nextUsage(
  prev: UsageWindow | undefined,
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; next: UsageWindow } {
  const cur = prev && now - prev.start < windowMs ? prev : { start: now, count: 0 };
  if (cur.count >= limit) return { allowed: false, next: cur };
  return { allowed: true, next: { start: cur.start, count: cur.count + 1 } };
}
