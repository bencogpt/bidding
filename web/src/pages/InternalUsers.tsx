import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INTERNAL_ROLES, type CreateInternalUserInput } from '@obms/shared';

type InternalRole = CreateInternalUserInput['role'];
import { useUsers } from '../lib/hooks';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';

export default function InternalUsers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const users = useUsers().filter((u) => (INTERNAL_ROLES as string[]).includes(u.role));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [role, setRole] = useState<InternalRole>('requester');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creds, setCreds] = useState<{ email: string; tempPassword: string | null } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setCreds(await api.createInternalUser({ name, email, role, googleEmail }));
      setName('');
      setEmail('');
      setGoogleEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string, label: string) => {
    if (!confirm(t('users.confirmDelete', { name: label }))) return;
    await api.deleteInternalUser({ uid });
  };

  return (
    <div>
      <form onSubmit={add} className="card mb-6 grid gap-3 p-6 md:grid-cols-5">
        <div className="md:col-span-1">
          <label className="label">{t('users.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="md:col-span-1">
          <label className="label">{t('login.email')}</label>
          <input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="md:col-span-1">
          <label className="label">{t('users.googleEmail')}</label>
          <input
            className="input"
            type="email"
            dir="ltr"
            placeholder={t('users.googleEmailHint')}
            value={googleEmail}
            onChange={(e) => setGoogleEmail(e.target.value)}
          />
        </div>
        <div className="md:col-span-1">
          <label className="label">{t('users.role')}</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as InternalRole)}>
            {INTERNAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn btn-gold w-full justify-center" disabled={busy}>
            {busy ? t('users.creating') : t('users.add')}
          </button>
        </div>
        {error && <div className="text-sm text-red-600 md:col-span-5">{error}</div>}
        <p className="text-xs text-tx-mute md:col-span-5">{t('users.googleEmailNote')}</p>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-b border-paper-2 last:border-0">
                <td className="px-5 py-3 font-semibold">{u.displayName}</td>
                <td className="px-5 py-3 text-tx-soft" dir="ltr">
                  {u.email}
                </td>
                <td className="px-5 py-3 text-tx-soft" dir="ltr">
                  {u.googleEmail ?? (
                    <span className="chip bg-amber-100 text-amber-700" dir="rtl">
                      {t('users.noGoogleAccount')}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className="chip">{t(`role.${u.role}`)}</span>
                </td>
                <td className="px-5 py-3 text-end">
                  {u.uid !== user?.uid && (
                    <button className="btn btn-sm text-red-600" onClick={() => remove(u.uid, u.displayName)}>
                      {t('users.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creds && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={() => setCreds(null)}>
          <div className="card max-w-sm space-y-3 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold">{t('users.created')}</h2>
            <p className="text-sm text-tx-soft">{t('supplier.accountCredsHint')}</p>
            <div className="rounded bg-paper-2 p-3 text-sm" dir="ltr">
              <div>
                <b>email:</b> {creds.email}
              </div>
              <div>
                <b>password:</b> {creds.tempPassword ?? '(already existed)'}
              </div>
            </div>
            <button className="btn btn-gold w-full justify-center" onClick={() => setCreds(null)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
