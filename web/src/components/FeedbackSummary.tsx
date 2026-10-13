import { useTranslation } from 'react-i18next';
import type { RatingKey, TenderDoc } from '@obms/shared';
import { useTenderFeedback } from '../lib/hooks';
import { feedbackByRole, topIssues } from '../lib/analytics';

// Manager view of participants' feedback on one bid case.
export default function FeedbackSummary({ tender }: { tender: TenderDoc }) {
  const { t } = useTranslation();
  const { requests, feedback } = useTenderFeedback(tender.id, true);
  if (!requests.length) return null;

  const rounds = ['publish', 'award'] as const;
  const byRole = feedbackByRole(feedback);
  const keys = [...new Set(byRole.flatMap((r) => Object.keys(r.ratings)))] as RatingKey[];
  const issues = topIssues(feedback);

  return (
    <div className="card p-5">
      <h4 className="mb-2 font-semibold">{t('fb.summaryTitle')}</h4>
      <div className="mb-3 flex flex-wrap gap-3 text-sm text-tx-soft">
        {rounds.map((r) => {
          const rs = requests.filter((x) => x.round === r);
          if (!rs.length) return null;
          return (
            <span key={r}>
              {t(`fb.round.${r}`)}: {t('fb.responses', { done: rs.filter((x) => x.status === 'done').length, total: rs.length })}
            </span>
          );
        })}
      </div>
      {feedback.length > 0 && (
        <>
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-tx-mute">
                <th className="py-1">{t('fb.role')}</th>
                {keys.map((k) => (
                  <th key={k} className="py-1">
                    {t(`fb.rating.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byRole.map((r) => (
                <tr key={r.role} className="border-t border-paper-2">
                  <td className="py-1">
                    {r.role === 'all' ? t('fb.all') : t(`role.${r.role}`)} <span className="text-xs text-tx-mute">(n={r.n})</span>
                  </td>
                  {keys.map((k) => (
                    <td key={k} className="py-1" dir="ltr">
                      {r.ratings[k] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {issues.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {issues.map((i) => (
                <span key={i.issue} className="chip">
                  {t(`fb.issue.${i.issue}`)} · {i.count}
                </span>
              ))}
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {feedback
              .filter((f) => f.comment)
              .map((f) => (
                <li key={f.id} className="rounded bg-paper-2 p-2" dir="auto">
                  <span className="text-xs text-tx-mute">
                    {f.name} · {t(`role.${f.role}`)} · {t(`fb.round.${f.round}`)}:
                  </span>{' '}
                  {f.comment}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
