import { useTranslation } from 'react-i18next';
import { rolesOf } from '../lib/roles';
import { TENDER_STATUSES } from '@obms/shared';
import type { Role, TenderDoc } from '@obms/shared';
import { useAccess, useUsers } from '../lib/hooks';

// The רביעייה of one case, with a check that each member holds the role their slot needs.
export default function QuartetCard({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
  const access = useAccess(tender.id);
  const users = useUsers(); // manager-only directory; empty for other roles

  // The רביעייה: requester, the tender manager (owner), then the case's other roles. A member is
  // verified when the user in the slot really holds the system role that slot requires.
  const required = rolesOf(tender);
  const quartet: { key: string; uid?: string; expected: Role }[] = [
    ...required
      .filter((r) => r === 'requester')
      .map((r) => ({ key: r, uid: tender.team?.[r], expected: r as Role })),
    { key: 'manager', uid: tender.ownerUid, expected: 'tender_manager' as Role },
    ...required
      .filter((r) => r !== 'requester')
      .map((r) => ({ key: r, uid: tender.team?.[r], expected: r as Role })),
  ];
  const memberName = (uid: string) =>
    users.find((u) => u.uid === uid)?.displayName ??
    access.find((a) => a.principalId === uid)?.displayName;

  // There is no per-member sign-off yet, so the chip follows the case's stage: waiting until the
  // review starts, under review during it, approved once the case is ready.
  const stage = TENDER_STATUSES.indexOf(tender.status);
  const state: 'pending' | 'review' | 'approved' =
    stage >= TENDER_STATUSES.indexOf('ready')
      ? 'approved'
      : stage === TENDER_STATUSES.indexOf('internal_review')
        ? 'review'
        : 'pending';
  const chipClass = {
    approved: 'bg-green-50 text-green-700',
    review: 'bg-amber-50 text-amber-700',
    pending: 'bg-paper-2 text-tx-mute',
  }[state];

  return (
    <div className="card p-5">
      <div className="mb-2 text-xs font-semibold text-tx-mute">{t('case.parties')}</div>
      <ul className="space-y-2 text-sm">
        {quartet.map(({ key, uid, expected }) => {
          const member = uid ? users.find((u) => u.uid === uid) : undefined;
          const name = uid ? memberName(uid) : undefined;
          const verified = member ? member.role === expected : undefined; // unknown without the directory
          return (
            <li key={key} className="flex flex-wrap items-center gap-2 border-b border-paper-2 py-2 last:border-0">
              <span className="font-semibold">{t(`quartet.${key}`)}</span>
              <span className="text-tx-mute">·</span>
              {uid ? (
                <span>{name ?? t('case.partyAssigned')}</span>
              ) : (
                <span className="text-amber-700">{t('team.unassigned')}</span>
              )}
              <span className="flex-1" />
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ${uid ? chipClass : 'bg-paper-2 text-tx-mute'}`}
              >
                {t(`overview.state.${uid ? state : 'pending'}`)}
              </span>
              {verified === true && (
                <span className="text-green-700" title={t('case.partyOk')}>
                  ✓
                </span>
              )}
              {verified === false && (
                <span className="text-xs text-red-600">
                  {t('case.partyMismatch', { role: t(`role.${expected}`) })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
