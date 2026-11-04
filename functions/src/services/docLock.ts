// Locking a case's Google Doc at the final approval (plan B4): everyone but the owner keeps read access only.
// The decision is pure, so it is tested without Google; docsService.lockDocument applies it through Drive.

/** One Drive permission as `permissions.list` returns it. */
export interface DrivePermission {
  id?: string | null;
  role?: string | null;
  type?: string | null;
  emailAddress?: string | null;
}

/**
 * The permission ids to downgrade to reader: every user, group or domain permission that can still write or
 * comment, except the file's owner. A link share ("anyone") never exists on a case document, and one that
 * did is left alone — the lock only narrows what people the case shared the document with can do.
 */
export function permissionsToLock(perms: readonly DrivePermission[]): string[] {
  return perms
    .filter(
      (p) =>
        !!p.id &&
        (p.type === 'user' || p.type === 'group' || p.type === 'domain') &&
        (p.role === 'writer' || p.role === 'commenter' || p.role === 'fileOrganizer' || p.role === 'organizer'),
    )
    .map((p) => p.id!);
}
