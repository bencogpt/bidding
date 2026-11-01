import { useTranslation } from 'react-i18next';
import { rolesOf } from '../lib/roles';
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

  return (
    <div className="card p-5">
      <h4 className="mb-2 font-semibold">{t('case.parties')}</h4>
      <ul className="space-y-2 text-sm">
        {quartet.map(({ key, uid, expected }) => {
          const member = uid ? users.find((u) => u.uid === uid) : undefined;
          const name = uid ? memberName(uid) : undefined;
          const verified = member ? member.role === expected : undefined; // unknown without the directory
          return (
            <li key={key} className="flex flex-wrap items-center gap-2">
              <span className="w-20 font-semibold">{t(`quartet.${key}`)}</span>
              {uid ? (
                <span>{name ?? t('case.partyAssigned')}</span>
              ) : (
                <span className="text-amber-700">{t('team.unassigned')}</span>
              )}
              {member && <span className="chip">{t(`role.${member.role}`)}</span>}
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
