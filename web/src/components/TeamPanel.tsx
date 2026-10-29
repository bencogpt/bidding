import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REQUIRED_ROLES_BY_TYPE,
  TEAM_ROLES,
  missingRoles,
  type AccessDoc,
  type TeamRole,
  type TenderDoc,
  type UserDoc,
} from '@obms/shared';
import { api } from '../lib/api';

// The case team: one user per required role. Only these users (and tender managers) see the case.
export default function TeamPanel({
  tender,
  users,
  access,
  canManage,
}: {
  tender: TenderDoc;
  users: UserDoc[]; // manager only (directory); empty for other roles
  access: AccessDoc[]; // display names for non-managers
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const team = tender.team ?? {};
  const required = tender.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[tender.type];
  const typeDefaults = REQUIRED_ROLES_BY_TYPE[tender.type];
  const missing = missingRoles(required, team);
  const optional = TEAM_ROLES.filter((r) => !required.includes(r));
  const nameOf = (uid: string) =>
    users.find((u) => u.uid === uid)?.displayName ?? access.find((a) => a.principalId === uid)?.displayName ?? uid;
  const userOf = (uid: string) => users.find((u) => u.uid === uid);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const assign = (role: TeamRole, uid: string) =>
    run(() => api.assignTeamMember({ tenderId: tender.id, role, uid: uid || null }));
  const setRoles = (roles: TeamRole[]) =>
    run(() => api.setRequiredRoles({ tenderId: tender.id, roles }));

  return (
    <div className="card p-5">
      <h3 className="mb-1 font-semibold">{t('team.title')}</h3>
      <p className="mb-3 text-xs text-tx-mute">{t('team.hint')}</p>
      {missing.length > 0 && (
        <div className="mb-3 rounded bg-amber-100 p-2 text-xs text-amber-700">
          {t('team.missing', { roles: missing.map((r) => t(`role.${r}`)).join(', ') })}
        </div>
      )}
      <ul className="space-y-2 text-sm">
        {required.map((role) => {
          const uid = team[role];
          const candidates = users.filter((u) => u.role === role);
          return (
            <li key={role} className="flex flex-wrap items-center gap-2">
              <span className="w-28 font-semibold">{t(`role.${role}`)}</span>
              {canManage ? (
                <select
                  className={`input w-56 ${uid ? '' : 'border-amber-400'}`}
                  value={uid ?? ''}
                  disabled={busy}
                  onChange={(e) => assign(role, e.target.value)}
                >
                  <option value="">{t('team.unassigned')}</option>
                  {candidates.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={uid ? '' : 'text-amber-700'}>{uid ? nameOf(uid) : t('team.unassigned')}</span>
              )}
              {uid && canManage && !userOf(uid)?.googleEmail && (
                <span className="text-xs text-amber-700">{t('team.noGoogle')}</span>
              )}
              {canManage && !typeDefaults.includes(role) && (
                <button
                  className="text-xs text-red-600"
                  disabled={busy || !!uid}
                  title={uid ? t('team.removeRoleFirst') : ''}
                  onClick={() => setRoles(required.filter((r) => r !== role))}
                >
                  ✕ {t('team.removeRole')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && optional.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-tx-soft">{t('team.addRole')}:</span>
          {optional.map((r) => (
            <button key={r} className="chip" disabled={busy} onClick={() => setRoles([...required, r])}>
              + {t(`role.${r}`)}
            </button>
          ))}
        </div>
      )}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  );
}
