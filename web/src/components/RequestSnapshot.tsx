import { useTranslation } from 'react-i18next';
import { REQUESTER_FIELDS, ROLE_HE, splitRequestBrief, type BidRequestDoc } from '@obms/shared';
import PersonChip from './agent/PersonChip';

const MONEY_KEYS = new Set(['annual_budget']);

/**
 * The requester's request as procurement sees it while completing it: who sent it and when, the details
 * they gave, the service description, and the recommendations they chose. Read-only. The internal budget
 * is shown here (the manager may see it); it never goes to the AI draft or the document.
 */
export default function RequestSnapshot({ request, sentAt, id }: { request: BidRequestDoc; sentAt: string; id?: string }) {
  const { t } = useTranslation();
  const { description, sections } = splitRequestBrief(request.brief);
  const details = request.details as Record<string, unknown> | undefined;
  const rows = REQUESTER_FIELDS.filter((f) => String(details?.[f.key] ?? '').trim() !== '');
  const recs = sections['המלצות שנבחרו:'] ?? [];
  const clarifications = sections['הבהרות מהדורש:'] ?? [];
  const notes = sections['הערות נוספות:'] ?? [];

  const show = (key: string, v: unknown) =>
    MONEY_KEYS.has(key) && Number.isFinite(Number(v)) ? `₪${Number(v).toLocaleString('en-US')}` : String(v);

  return (
    <div
      id={id}
      className="mb-6 scroll-mt-4 border px-[18px] py-3.5"
      style={{ background: 'var(--bg)', borderColor: 'var(--line-soft)', borderRadius: 8 }}
    >
      {/* Prototype .reqsnap > h4 (lines 215–217, 3364): the title, then who sent it as a person card and when. No
          chat button in the card: the case, and its chat, don't exist yet (plan D14). */}
      <h4 className="m-0 mb-2.5 text-sm font-medium">
        {t('req.snapshotTitle')}
        <small className="ms-2.5 text-xs font-normal" style={{ color: 'var(--muted)' }}>
          {t('req.sentBy')} <PersonChip name={request.requesterName} role={ROLE_HE.requester} /> · <bdi>{sentAt}</bdi>
        </small>
      </h4>

      <div className="rounded-lg border border-black/5 bg-white p-5">
        {rows.length > 0 && (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-4">
            {rows.map((f) => (
              <div key={f.key}>
                <dt className="mb-1 text-xs text-tx-soft">{f.labelHe}</dt>
                <dd className="text-sm font-semibold">
                  <bdi>{show(f.key, details?.[f.key])}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className={rows.length ? 'mt-4 border-t border-dashed border-black/10 pt-4' : ''}>
          <div className="mb-1 text-xs text-tx-soft">{t('req.scopeLabel')}</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{description || request.brief}</div>
        </div>
      </div>

      {clarifications.length > 0 && (
        <BulletBox title={t('req.clarifications')} items={clarifications} />
      )}
      <BulletBox title={`${t('req.recsIncluded')} (${recs.length})`} items={recs} />
      {notes.length > 0 && <BulletBox title={t('req.notes')} items={notes} />}
    </div>
  );
}

function BulletBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3 rounded-lg border border-black/5 bg-white p-4">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {items.length > 0 && (
        <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
          {items.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
