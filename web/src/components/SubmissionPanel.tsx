import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ref, uploadBytes } from 'firebase/storage';
import type { TenderDoc, SubmissionDoc } from '@obms/shared';
import { storage } from '../lib/firebase';
import { api } from '../lib/api';
import { useMySubmission } from '../lib/hooks';
import Countdown from './Countdown';

// Supplier's private submission space: upload files + a proposal summary, until the deadline.
export default function SubmissionPanel({
  tender,
  supplierId,
}: {
  tender: TenderDoc;
  supplierId: string;
}) {
  const { t } = useTranslation();
  const existing = useMySubmission(tender.id, supplierId);
  const [summary, setSummary] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const locked = !!tender.submissionDeadline && Date.now() > tender.submissionDeadline;
  const summaryValue = summary ?? existing?.summary ?? '';

  const save = async () => {
    setBusy(true);
    setDone(false);
    try {
      const uploaded: SubmissionDoc['files'] = existing?.files ? [...existing.files] : [];
      for (const f of files) {
        const path = `tenders/${tender.id}/submissions/${supplierId}/${f.name}`;
        await uploadBytes(ref(storage, path), f);
        uploaded.push({ name: f.name, size: f.size, path });
      }
      await api.saveSubmission({ tenderId: tender.id, files: uploaded, summary: summaryValue });
      setFiles([]);
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{t('submission.title')}</h3>
        <div className="text-sm">
          {t('submission.deadline')}: <Countdown deadline={tender.submissionDeadline} />
        </div>
      </div>

      {locked ? (
        <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{t('submission.lockedHint')}</div>
      ) : (
        <div className="mb-3 rounded bg-teal-soft/40 p-2 text-sm text-teal-600">{t('submission.openHint')}</div>
      )}

      {existing && existing.files.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {existing.files.map((f) => (
            <li key={f.path} className="flex items-center gap-2">
              <span className="chip">📎</span>
              <span dir="ltr">{f.name}</span>
              <span className="text-tx-mute">({Math.round(f.size / 1024)} KB)</span>
            </li>
          ))}
        </ul>
      )}

      <label className="label">{t('submission.summary')}</label>
      <textarea
        className="input min-h-28"
        dir="auto"
        disabled={locked}
        placeholder={t('submission.summaryPlaceholder')}
        value={summaryValue}
        onChange={(e) => setSummary(e.target.value)}
      />

      {!locked && (
        <>
          <label className="label mt-3">{t('submission.files')}</label>
          <input
            type="file"
            multiple
            className="block w-full text-sm"
            onChange={(e) =>
              setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])
            }
          />
          {files.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                  <span className="chip">＋</span>
                  <span dir="ltr">{f.name}</span>
                  <span className="text-tx-mute">({Math.round(f.size / 1024)} KB)</span>
                  <button
                    className="text-red-600"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn btn-gold mt-3"
            disabled={busy || (files.length === 0 && summaryValue.trim() === '')}
            onClick={save}
          >
            {busy ? t('submission.saving') : t('submission.save')}
            {files.length > 0 ? ` (${files.length})` : ''}
          </button>
          {done && <span className="ms-3 text-sm text-green-600">{t('submission.saved')}</span>}
        </>
      )}
    </div>
  );
}
