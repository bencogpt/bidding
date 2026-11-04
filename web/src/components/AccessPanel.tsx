import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AccessDoc,
  SupplierDoc,
  TenderType,
  TenderStatus,
  ExternalSupplierSuggestion,
  ExternalSearchStatus,
} from '@obms/shared';
import { isSupplierVisible } from '@obms/shared';
import { api } from '../lib/api';
import SupplierForm from './SupplierForm';

export default function AccessPanel({
  tenderId,
  tenderType,
  tenderStatus,
  tenderDomainTags,
  access,
  suppliers,
  canManage,
  pendingSupplierIds = [],
}: {
  tenderId: string;
  tenderType: TenderType;
  tenderStatus: TenderStatus;
  tenderDomainTags: string[];
  access: AccessDoc[];
  suppliers: SupplierDoc[];
  canManage: boolean;
  pendingSupplierIds?: string[];
}) {
  const { t } = useTranslation();
  const [selSuppliers, setSelSuppliers] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Suppliers may only see a document the supervisor passed, i.e. after publication. Before that (in
  // review / once ready) the manager picks who it will be published to; they get access on publish.
  const published = isSupplierVisible(tenderStatus);
  const prePublish = tenderStatus === 'internal_review' || tenderStatus === 'ready';
  const canShareSuppliers = published || prePublish;
  const pendingKey = pendingSupplierIds.join(',');
  useEffect(() => {
    if (prePublish) setSelSuppliers(new Set(pendingSupplierIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, prePublish]);
  const [saved, setSaved] = useState(false);
  const [external, setExternal] = useState<ExternalSupplierSuggestion[] | null>(null);
  const [externalStatus, setExternalStatus] = useState<ExternalSearchStatus | null>(null);
  const [searching, setSearching] = useState(false);
  const [prefill, setPrefill] = useState<{
    name: string;
    domainTags: string[];
    isIsraeli: boolean;
    contactEmail?: string;
    country?: string;
    sourceUrl?: string;
  } | null>(null);

  const granted = new Set(access.map((a) => a.principalId));
  const wanted = new Set(tenderDomainTags.map((x) => x.toLowerCase()));

  // Rank registered suppliers by domain-tag overlap, Israeli-first.
  const ranked = [...suppliers]
    .map((s) => {
      const matched = (s.domainTags ?? []).filter((tag) => wanted.has(tag.toLowerCase()));
      return { s, matched, score: matched.length * 100 + (s.isIsraeli ? 10 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    fn(n);
  };

  const grant = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      if (prePublish) {
        await api.setPendingSuppliers({ tenderId, supplierIds: [...selSuppliers] });
        setSaved(true);
        return;
      }
      // Internal users join through the case team (TeamPanel), never ad hoc.
      await api.grantAccess({ tenderId, supplierIds: [...selSuppliers], internalUids: [] });
      setSelSuppliers(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const searchExternal = async () => {
    setSearching(true);
    try {
      const res = await api.searchSuppliers({ type: tenderType, domainTags: tenderDomainTags });
      setExternal(res.external);
      setExternalStatus(res.externalStatus);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {canManage && (
        <div className="card p-5">
          <h3 className="mb-1 font-semibold">{t('ws.shareSuppliers')}</h3>
          {tenderDomainTags.length > 0 && (
            <div className="mb-2 text-xs text-tx-mute">
              {t('ws.matchedBy')}: {tenderDomainTags.join(', ')}
            </div>
          )}
          {!canShareSuppliers && (
            <div className="mb-2 rounded bg-amber-100 p-2 text-xs text-amber-700">{t('ws.shareAfterReview')}</div>
          )}
          {prePublish && (
            <div className="mb-2 rounded bg-teal-soft p-2 text-xs text-teal-600">{t('ws.pickBeforePublish')}</div>
          )}
          <div className="space-y-2">
            {ranked.map(({ s, matched }) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={granted.has(s.id) || !canShareSuppliers}
                  checked={granted.has(s.id) || selSuppliers.has(s.id)}
                  onChange={() => toggle(selSuppliers, s.id, setSelSuppliers)}
                />
                <span>{s.name}</span>
                {s.isIsraeli && <span className="chip">🇮🇱</span>}
                {matched.length > 0 && (
                  <span className="chip bg-teal-soft text-teal-600">✓ {matched.join(', ')}</span>
                )}
                {granted.has(s.id) && <span className="text-xs text-green-600">✓</span>}
              </label>
            ))}
          </div>

          <button
            className="btn btn-gold mt-5"
            disabled={busy || !canShareSuppliers || (!prePublish && selSuppliers.size === 0)}
            onClick={grant}
          >
            {prePublish ? t('ws.savePublishSuppliers', { n: selSuppliers.size }) : t('ws.grant')}
          </button>
          {saved && <div className="mt-2 text-sm text-green-700">{t('ws.publishSuppliersSaved')}</div>}
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        </div>
      )}

      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">{t('ws.currentAccess')}</h3>
          {access.length === 0 ? (
            <div className="text-sm text-tx-soft">—</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {access.map((a) => (
                <li key={a.principalId} className="flex items-center justify-between">
                  <span>{a.displayName}</span>
                  <span className="chip">{a.kind === 'supplier' ? t('role.supplier') : a.level}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('ws.findExternal')}</h3>
              <button className="btn btn-sm no-print" disabled={searching} onClick={searchExternal}>
                {searching ? t('ws.searching') : `✨ ${t('ws.aiSearch')}`}
              </button>
            </div>
            <p className="mb-2 text-xs text-tx-mute">{t('ws.externalHint')}</p>
            {searching && <div className="text-sm text-tx-soft">{t('ws.externalBusy')}</div>}
            {!searching && external === null ? null : !searching && external!.length === 0 ? (
              <div className="text-sm text-tx-mute">{t(`ws.externalStatus.${externalStatus ?? 'none'}`)}</div>
            ) : searching ? null : (
              <ul className="space-y-2 text-sm">
                {external.map((c, i) => (
                  <li key={i} className="rounded border border-paper-2 p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.isIsraeli && <span className="chip">🇮🇱</span>}
                      <span className="chip">{c.domain}</span>
                    </div>
                    <div className="text-tx-soft" dir="auto">{c.rationaleHe}</div>
                    {c.hasGovRecord ? (
                      <div className="mt-1 text-xs text-green-700">
                        🏛 {c.govRecordHe}{' '}
                        <a href={c.govSourceUrl} target="_blank" rel="noreferrer" className="underline">
                          {t('ws.govSource')}
                        </a>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-tx-mute">{t('ws.noGovRecord')}</div>
                    )}
                    {c.contactEmail ? (
                      <div className="text-xs text-teal-600" dir="ltr">
                        ✉ {c.contactEmail}
                      </div>
                    ) : (
                      <div className="text-xs text-tx-mute">{t('ws.noEmailFound')}</div>
                    )}
                    <button
                      className="btn btn-sm mt-1"
                      onClick={() =>
                        setPrefill({
                          name: c.name,
                          domainTags: [c.domain],
                          isIsraeli: c.isIsraeli,
                          contactEmail: c.contactEmail,
                          country: c.country,
                          sourceUrl: c.sourceUrl ?? c.website,
                        })
                      }
                    >
                      {t('ws.addToRegistry')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {prefill && <SupplierForm prefill={prefill} onClose={() => setPrefill(null)} />}
    </div>
  );
}
