import { REQUIRED_ROLES_BY_TYPE, requiredRolesFor } from '@obms/shared';
import type { TeamRole, TenderDoc } from '@obms/shared';

/**
 * The roles a case needs. Tolerates a malformed tender (missing or unknown type) so one bad
 * document cannot take down a whole list: it simply has no required roles.
 */
export function rolesOf(tender: Pick<TenderDoc, 'type' | 'requiredRoles'>): TeamRole[] {
  if (tender.requiredRoles) return tender.requiredRoles;
  return tender.type in REQUIRED_ROLES_BY_TYPE ? requiredRolesFor(tender.type) : [];
}
