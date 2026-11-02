import { useTranslation } from 'react-i18next';
import type { TemplateDoc, TenderDoc } from '@obms/shared';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
// A time is shown only when the date carries one (midnight means "date only").
const fmtWithTime = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() || d.getMinutes() ? `${pad(d.getHours())}:${pad(d.getMinutes())} ${fmt(ms)}` : fmt(ms);
};
// A date field of the document: "16/12/2026" or "2026-12-16", shown as 16.12.2026. Anything else
// (e.g. a weekday, free text) is shown as written.
const fromParam = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  if (!s || s.includes('{{')) return null; // empty, or the placeholder is still unfilled
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) ? s.replace(/\//g, '.') : s;
};

// The case's dates, read-only. Submission and the last date for questions come from the
// document's own fields (submission_date, the questions-deadline field), so the card and the document agree.
export default function DatesCard({
  tender,
  template,
}: {
  tender: TenderDoc;
  template?: TemplateDoc | null;
}) {
  const { t } = useTranslation();
  // Templates name these fields differently, so find each by its Hebrew label first, then by key.
  const paramValue = (labels: string[], keys: string[]) => {
    const key =
      template?.params.find((p) => labels.some((l) => p.labelHe.replace(/\s+/g, ' ').includes(l)))
        ?.key ?? keys.find((k) => k in tender.params);
    return key ? fromParam(tender.params[key]) : null;
  };
  const rows: { label: string; value: string | null }[] = [
    { label: 'overview.datePublish', value: fmt(tender.createdAt) },
    {
      label: 'overview.dateConference',
      value: paramValue(
        ['כנס מציעים', 'כנס ספקים'],
        ['bidders_conference', 'bidders_conference_date', 'conference_date', 'bidder_conference_date'],
      ),
    },
    {
      label: 'overview.dateQuestions',
      value: paramValue(['מועד אחרון לשאלות'], ['questions_deadline', 'clarification_deadline']),
    },
    {
      label: 'overview.dateSubmission',
      value: tender.submissionDeadline
        ? fmtWithTime(tender.submissionDeadline)
        : fromParam(tender.params.submission_date),
    },
  ];

  return (
    <div className="card p-5">
      <div className="mb-2 text-xs font-semibold text-tx-mute">{t('overview.dates')}</div>
      <ul className="text-sm">
        {rows.map(({ label, value }) => (
          <li
            key={label}
            className="flex items-center justify-between gap-3 border-b border-paper-2 py-2 last:border-0"
          >
            <span>{t(label)}</span>
            <b className="tabular-nums" dir="ltr">
              {value ?? t('overview.dateUnset')}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
