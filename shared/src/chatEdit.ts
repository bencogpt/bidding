// Editing an earlier answer in the request chat. The browser keeps a snapshot of the conversation state taken just
// before each answer is added, keyed by that answer's position in the chat; editing returns to the snapshot.

export interface ChatEditMsg {
  role: 'agent' | 'user';
  local?: boolean; // shown in the chat but never sent to the server (the frame amount)
}

/** An answer can be edited when the agent is idle and there is a snapshot to go back to. The frame amount cannot. */
export function canEditMessage(
  chat: readonly ChatEditMsg[],
  index: number,
  snapshots: ReadonlyMap<number, unknown>,
  typing: boolean,
): boolean {
  const m = chat[index];
  return !typing && m?.role === 'user' && !m.local && snapshots.has(index);
}

/** Returns the snapshot taken before the answer at `index` and forgets it and every later one. */
export function rewindSnapshots<S>(snapshots: Map<number, S>, index: number): S | undefined {
  const snap = snapshots.get(index);
  if (snap === undefined) return undefined;
  for (const k of [...snapshots.keys()]) if (k >= index) snapshots.delete(k);
  return snap;
}
