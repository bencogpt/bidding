// Whether the signed-in requester has opened a draft, so "הטיוטה מוכנה" leaves their home list (plan A5).
// Kept in this browser for now; a per-user marker on the server is plan B7's "seen" (not built yet).
const key = (tenderId: string, uid: string) => `obms.draftSeen.${tenderId}.${uid}`;

export function markDraftSeen(tenderId: string, uid: string): void {
  try {
    localStorage.setItem(key(tenderId, uid), '1');
  } catch {
    // storage unavailable (private mode): the item simply stays on the list
  }
}

// An approval given on the user's behalf (UX 1.1.C): "לטיפולך" tells them until they open the case. Keyed by
// the approval's time, so a later one is told again.
const behalfKey = (tenderId: string, uid: string) => `behalf-seen:${tenderId}:${uid}`;

export function markBehalfSeen(tenderId: string, uid: string, at: number): void {
  try {
    localStorage.setItem(behalfKey(tenderId, uid), String(at));
  } catch {
    // storage unavailable: the item stays on the list
  }
}

export function isBehalfSeen(tenderId: string, uid: string, at: number): boolean {
  try {
    return Number(localStorage.getItem(behalfKey(tenderId, uid)) ?? 0) >= at;
  } catch {
    return false;
  }
}

export function isDraftSeen(tenderId: string, uid: string): boolean {
  try {
    return localStorage.getItem(key(tenderId, uid)) === '1';
  } catch {
    return false;
  }
}
