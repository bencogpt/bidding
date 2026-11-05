import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REQUIRED_ROLES_BY_TYPE,
  ROLE_HE,
  TEAM_ROLES,
  type TeamRole,
  type TenderDoc,
  type UserDoc,
} from '@obms/shared';
import { api } from '../lib/api';

/**
 * The case team for the tender manager, inside the overview's quartet card: one user per required role, until
 * the send. Only these users (and tender managers) see the case; assigning one shares the document with them.
 */
export default function TeamPanel({ tender, users }: { tender: TenderDoc; users: UserDoc[] }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const team = tender.team ?? {};
  const required = tender.requiredRoles ?? REQUIRED_ROLES_BY_TYPE[tender.type];
  const typeDefaults = REQUIRED_ROLES_BY_TYPE[tender.type];
  const optional = TEAM_ROLES.filter((r) => !required.includes(r));
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
  const setRoles = (roles: TeamRole[]) => run(() => api.setRequiredRoles({ tenderId: tender.id, roles }));

  return (
    <div>
      {required.map((role) => {
        const uid = team[role];
        const candidates = users.filter((u) => u.role === role);
        // A unit asked for its own contact (plan D3); the manager may still assign one here.
        const asked = !uid && (tender.unitRequests as readonly string[] | undefined)?.includes(role);
        return (
          <div key={role} className="py-1.5 last:border-0" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <div className="flex items-center gap-2">
              <span className="w-[86px] flex-none">{ROLE_HE[role]}</span>
              <select
                className="input min-w-0 flex-1 py-1 text-sm"
                style={uid ? undefined : { borderColor: 'var(--warn)' }}
                value={uid ?? ''}
                disabled={busy}
                aria-label={ROLE_HE[role]}
                onChange={(e) => assign(role, e.target.value)}
              >
                <option value="">{t('team.unassigned')}</option>
                {candidates.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName}
                  </option>
                ))}
              </select>
              {!typeDefaults.includes(role) && (
                <button
                  type="button"
                  className="flex-none text-xs"
                  style={{ color: uid ? 'var(--muted)' : 'var(--bad)' }}
                  disabled={busy || !!uid}
                  title={uid ? t('team.removeRoleFirst') : t('team.removeRole')}
                  aria-label={t('team.removeRole')}
                  onClick={() => setRoles(required.filter((r) => r !== role))}
                >
                  ✕
                </button>
              )}
            </div>
            {asked && (
              <small className="mt-0.5 block ps-[94px]" style={{ color: 'var(--muted)' }}>
                {t('team.askedUnit')}
              </small>
            )}
            {uid && !userOf(uid)?.googleEmail && (
              <small className="mt-0.5 block ps-[94px]" style={{ color: 'var(--warn)' }}>
                {t('team.noGoogle')}
              </small>
            )}
          </div>
        );
      })}
      {optional.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: 'var(--muted)' }}>{t('team.addRole')}:</span>
          {optional.map((r) => (
            <button key={r} type="button" className="chip" disabled={busy} onClick={() => setRoles([...required, r])}>
              + {ROLE_HE[r]}
            </button>
          ))}
        </div>
      )}
      <p className="mb-0 mt-2.5 text-xs" style={{ color: 'var(--muted)' }}>
        {t('team.hint')}
      </p>
      {error && (
        <div className="mt-2 text-sm" style={{ color: 'var(--bad)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
