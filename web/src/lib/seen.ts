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

export function isDraftSeen(tenderId: string, uid: string): boolean {
  try {
    return localStorage.getItem(key(tenderId, uid)) === '1';
  } catch {
    return false;
  }
}
