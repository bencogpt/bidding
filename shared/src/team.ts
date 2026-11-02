// Bid case identity and team: serial numbers, and strict role-based assignment of internal users.
//
// Each case has one slot per required role (requester, legal, finance, security). A slot can only
// be filled by a user who holds exactly that role. Only the case team (plus tender managers) can see
// the case; the team must be complete before the case can go to internal review.
import { z } from 'zod';
import type { TenderType } from './tender.js';

export const TEAM_ROLES = ['requester', 'legal', 'finance', 'security'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export type CaseTeam = Partial<Record<TeamRole, string>>; // role → uid

export const REQUIRED_ROLES_BY_TYPE: Record<TenderType, TeamRole[]> = {
  goods: ['requester', 'legal', 'finance'],
  service: ['requester', 'legal', 'finance', 'security'],
  project: ['requester', 'legal', 'finance', 'security'],
};

export const isTeamRole = (r: string | undefined): r is TeamRole => !!r && (TEAM_ROLES as readonly string[]).includes(r);

/** BID-2026-0042 */
export function formatSerial(year: number, n: number): string {
  return `BID-${year}-${String(n).padStart(4, '0')}`;
}

/** Largest n of a bid number: three random digits, 1..999. */
export const BID_NUMBER_MAX = 999;

/** 2026-31 — the bid number: the year, then n without leading zeros (031 is written 31). */
export function formatBidNumber(year: number, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > BID_NUMBER_MAX) throw new RangeError(`bid number out of range: ${n}`);
  return `${year}-${n}`;
}

/** Type defaults plus the manager's extra roles, in canonical order, without duplicates. */
export function requiredRolesFor(type: TenderType, extra: readonly string[] = []): TeamRole[] {
  const set = new Set<string>([...REQUIRED_ROLES_BY_TYPE[type], ...extra]);
  return TEAM_ROLES.filter((r) => set.has(r));
}

/** Required slots that are still empty. */
export function missingRoles(required: readonly TeamRole[], team: CaseTeam | undefined): TeamRole[] {
  return required.filter((r) => !team?.[r]);
}

/** Who may see the case: the owning manager plus every assigned team member. */
export function memberUidsOf(ownerUid: string, team: CaseTeam | undefined): string[] {
  return [...new Set([ownerUid, ...Object.values(team ?? {}).filter((u): u is string => !!u)])];
}

const teamSchema = z.object(
  Object.fromEntries(TEAM_ROLES.map((r) => [r, z.string().min(1).optional()])) as Record<
    TeamRole,
    z.ZodOptional<z.ZodString>
  >,
);

export const assignTeamMemberInput = z.object({
  tenderId: z.string(),
  role: z.enum(TEAM_ROLES),
  uid: z.string().min(1).nullable(), // null = unassign
});
export type AssignTeamMemberInput = z.infer<typeof assignTeamMemberInput>;

export const setRequiredRolesInput = z.object({
  tenderId: z.string(),
  roles: z.array(z.enum(TEAM_ROLES)),
});
export type SetRequiredRolesInput = z.infer<typeof setRequiredRolesInput>;

export const createTenderTeamFields = {
  team: teamSchema.optional(),
  extraRoles: z.array(z.enum(TEAM_ROLES)).optional(),
};

/** tenders/{id}/chat/{msgId} — immutable internal chat message. */
export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  role: string;
  text: string;
  createdAt: unknown; // Firestore Timestamp (server time, enforced by rules)
}

export const CHAT_MAX_LENGTH = 4000;
