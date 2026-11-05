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
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/); // 2026-12-16 or 2026/12/16
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
  stageIdx?: number;
}) {
  const { t } = useTranslation();
  // Templates name these fields differently, so find each by its Hebrew label first, then by key.
  const paramValue = (labels: string[], keys: string[]) => {
    const key =
      template?.params.find((p) => labels.some((l) => p.labelHe.replace(/\s+/g, ' ').includes(l)))
        ?.key ?? keys.find((k) => k in tender.params);
    return key ? fromParam(tender.params[key]) : null;
  };
  const rows: { label: string; value: string | null; noValue?: string }[] = [
    // The day the case was published to suppliers; until then it has no date (it used to show the creation date).
    { label: 'overview.datePublish', value: tender.publishedAt ? fmt(tender.publishedAt) : null },
    {
      label: 'overview.dateConference',
      // gathering_date / gathering_hour are the fields these templates use for the conference.
      value: [
        paramValue(
          ['כנס מציעים', 'כנס ספקים'],
          ['gathering_date', 'bidders_conference_date', 'conference_date'],
        ),
        fromParam(tender.params.gathering_hour),
      ]
        .reverse()
        .filter(Boolean)
        .join(' ') || null,
      noValue: 'overview.dateNoConference',
    },
    {
      label: 'overview.dateQuestions',
      value: paramValue(
        ['מועד אחרון לשאלות'],
        ['clarifications_deadline', 'clarification_deadline', 'questions_deadline'],
      ),
    },
    {
      label: 'overview.dateSubmission',
      value: tender.submissionDeadline
        ? fmtWithTime(tender.submissionDeadline)
        : fromParam(tender.params.submission_date ?? tender.params.submission_day_date),
    },
  ];

  // Prototype overview card: a small grey heading, then label / date rows (lines 1220–1222, 835–836).
  return (
    <div className="border p-[22px]" style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 8 }}>
      <h3 className="m-0 mb-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
        {t('overview.dates')}
      </h3>
      {rows.map(({ label, value, noValue }) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 py-1.5"
          style={{ borderBottom: '1px solid var(--line-soft)' }}
        >
          <span>{t(label)}</span>
          {value ? (
            <b className="tabular-nums" dir="ltr">
              {value}
            </b>
          ) : (
            <span style={{ color: 'var(--muted)' }}>{t(noValue ?? 'overview.dateUnset')}</span>
          )}
        </div>
      ))}
    </div>
  );
}
