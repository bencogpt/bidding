import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isInternalRole, type Role, type TenderDoc } from '@obms/shared';

export interface Caller {
  uid: string;
  role: Role;
  name: string;
  email?: string;
  supplierId?: string;
}

/** Extract and validate the authenticated caller from a callable request. */
export function requireAuth(req: CallableRequest): Caller {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'נדרשת התחברות.');
  }
  const token = req.auth.token as Record<string, unknown>;
  const role = token.role as Role | undefined;
  if (!role) {
    throw new HttpsError('permission-denied', 'למשתמש לא הוקצה תפקיד.');
  }
  return {
    uid: req.auth.uid,
    role,
    name: (token.name as string) || (token.email as string) || req.auth.uid,
    email: token.email as string | undefined,
    supplierId: token.supplierId as string | undefined,
  };
}

export function requireRole(req: CallableRequest, ...roles: Role[]): Caller {
  const caller = requireAuth(req);
  if (!roles.includes(caller.role)) {
    throw new HttpsError('permission-denied', 'אין הרשאה לפעולה זו.');
  }
  return caller;
}

export function requireManager(req: CallableRequest): Caller {
  return requireRole(req, 'tender_manager');
}

export function requireInternal(req: CallableRequest): Caller {
  const caller = requireAuth(req);
  if (!isInternalRole(caller.role)) {
    throw new HttpsError('permission-denied', 'פעולה פנימית בלבד.');
  }
  return caller;
}

/**
 * Strict case access for internal callers: tender managers see every case; any other internal
 * role only the cases whose team they belong to (tender.memberUids).
 */
export function canAccessCase(caller: Caller, tender: Pick<TenderDoc, 'memberUids' | 'ownerUid'>): boolean {
  if (caller.role === 'tender_manager') return true;
  if (!isInternalRole(caller.role)) return false;
  return caller.uid === tender.ownerUid || (tender.memberUids ?? []).includes(caller.uid);
}

export function requireCaseAccess(caller: Caller, tender: Pick<TenderDoc, 'memberUids' | 'ownerUid'>): void {
  if (!canAccessCase(caller, tender)) {
    throw new HttpsError('permission-denied', 'אינך משויך למכרז זה.');
  }
}
