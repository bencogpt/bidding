// Bid-number allocation: a random n in 1..999 per year, claimed atomically by the caller's `claim`.
// Pure apart from the injected dependencies, so it is unit-tested without Firestore.
import { HttpsError } from 'firebase-functions/v2/https';
import { BID_NUMBER_MAX, formatBidNumber } from '@obms/shared';

export interface BidNumberDeps {
  random(): number; // [0, 1)
  /** Take this bid number; true if newly taken, false if it already existed. */
  claim(serial: string, n: number): Promise<boolean>;
}

/** The calendar year in Israel (the server runs in UTC). */
export function israelYear(ms: number): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(new Date(ms)));
}

const draw = (random: () => number) => 1 + Math.floor(random() * BID_NUMBER_MAX);

const RANDOM_TRIES = 20;

export async function allocateBidNumber(year: number, deps: BidNumberDeps): Promise<string> {
  const tried = new Set<number>();
  const attempt = async (n: number): Promise<string | null> => {
    tried.add(n);
    const serial = formatBidNumber(year, n);
    return (await deps.claim(serial, n)) ? serial : null;
  };
  for (let i = 0; i < RANDOM_TRIES; i++) {
    const n = draw(deps.random);
    if (tried.has(n)) continue;
    const got = await attempt(n);
    if (got) return got;
  }
  // Nearly full year: sweep every number not yet tried, starting at a random point.
  const start = draw(deps.random);
  for (let k = 0; k < BID_NUMBER_MAX; k++) {
    const n = ((start - 1 + k) % BID_NUMBER_MAX) + 1;
    if (tried.has(n)) continue;
    const got = await attempt(n);
    if (got) return got;
  }
  throw new HttpsError('resource-exhausted', `כל מספרי הבל"מ של שנת ${year} נוצלו.`);
}
