import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('manager@obms.test');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError(t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError(t('login.error'));
    }
  };

  return (
    <div className="grid h-full place-items-center bg-ink-900 p-4">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-gold-deep">
          OBMS
        </div>
        <h1 className="mb-6 font-display text-2xl font-bold">{t('login.title')}</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">{t('login.email')}</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div>
            <label className="label">{t('login.password')}</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button className="btn btn-gold w-full justify-center" disabled={busy}>
            {t('login.submit')}
          </button>
        </form>
        <div className="my-4 border-t border-paper-2" />
        <button className="btn w-full justify-center" onClick={google}>
          {t('login.google')}
        </button>
        <p className="mt-4 text-xs text-tx-mute">{t('login.supplierHint')}</p>
      </div>
    </div>
  );
}
