import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupplierDoc } from '@obms/shared';
import { useSuppliers } from '../lib/hooks';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import SupplierForm from '../components/SupplierForm';

export default function Suppliers() {
  const { t } = useTranslation();
  const suppliers = useSuppliers();
  const { role } = useAuth();
  const isManager = role === 'tender_manager';
  const [editing, setEditing] = useState<SupplierDoc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ email: string; tempPassword: string | null } | null>(null);

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (s: SupplierDoc) => {
    setEditing(s);
    setShowForm(true);
  };
  const createAccount = async (s: SupplierDoc) => {
    setBusyId(s.id);
    try {
      setCreds(await api.createSupplierAccount({ supplierId: s.id }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t('nav.suppliers')}</h1>
        {isManager && (
          <button className="btn btn-gold" onClick={openNew}>
            + {t('supplier.add')}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-paper-2 last:border-0">
                <td className="px-5 py-3 font-semibold">{s.name}</td>
                <td className="px-5 py-3 text-tx-soft" dir="ltr">
                  {s.contactEmail ?? (
                    <span className="chip bg-amber-100 text-amber-700" dir="rtl">
                      {t('supplier.noEmail')}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {s.isIsraeli ? (
                    <span className="chip">ספק ישראלי 🇮🇱</span>
                  ) : (
                    <span className="chip">{s.country}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`chip ${s.status === 'inactive' ? 'opacity-60' : ''}`}>
                    {t(`supplier.${s.status}`)}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(s.domainTags ?? []).map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                {isManager && (
                  <td className="px-5 py-3 text-end">
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-sm" onClick={() => openEdit(s)}>
                        {t('common.edit')}
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={busyId === s.id}
                        onClick={() => createAccount(s)}
                      >
                        {t('supplier.createAccount')}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <SupplierForm initial={editing ?? undefined} onClose={() => setShowForm(false)} />
      )}

      {creds && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4"
          onClick={() => setCreds(null)}
        >
          <div className="card max-w-sm space-y-3 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold">{t('supplier.accountCreated')}</h2>
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
