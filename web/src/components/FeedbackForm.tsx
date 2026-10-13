import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_ISSUES,
  ROUND_RATINGS,
  SKILL_AREAS,
  type FeedbackIssue,
  type FeedbackRequest,
  type RatingKey,
} from '@obms/shared';
import { api } from '../lib/api';

function Stars({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`text-lg leading-none ${value && n <= value ? 'text-gold' : 'text-paper-2'}`}
          onClick={() => onChange(n)}
          aria-label={String(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function Chips<T extends string>({
  options,
  selected,
  label,
  onToggle,
}: {
  options: readonly T[];
  selected: Set<T>;
  label: (o: T) => string;
  onToggle: (o: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip ${selected.has(o) ? 'bg-teal-soft text-teal-600 ring-1 ring-teal-500' : ''}`}
          onClick={() => onToggle(o)}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

// Structured feedback of one internal participant on one bid case (publish or award round).
export default function FeedbackForm({ request, onDone }: { request: FeedbackRequest; onDone?: () => void }) {
  const { t } = useTranslation();
  const keys = ROUND_RATINGS[request.round].filter((k) => k !== 'aiAccuracy' || request.aiDrafted);
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, number>>>({});
  const [issues, setIssues] = useState<Set<FeedbackIssue>>(new Set());
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    fn(n);
  };

  const run = async (action: 'submit' | 'decline') => {
    setBusy(true);
    setError('');
    try {
      if (action === 'submit') {
        await api.submitFeedback({
          tenderId: request.tenderId,
          round: request.round,
          ratings,
          issues: [...issues],
          skillAreas: [...areas],
          comment,
        });
      } else {
        await api.declineFeedback({ tenderId: request.tenderId, round: request.round });
      }
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <table className="w-full">
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td className="py-1 text-tx-soft">{t(`fb.rating.${k}`)}</td>
              <td className="py-1">
                <Stars value={ratings[k]} onChange={(v) => setRatings((r) => ({ ...r, [k]: v }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <div className="mb-1 text-xs font-semibold text-tx-soft">{t('fb.issues')}</div>
        <Chips options={FEEDBACK_ISSUES} selected={issues} label={(o) => t(`fb.issue.${o}`)} onToggle={(o) => toggle(issues, o, setIssues)} />
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-tx-soft">{t('fb.skillAreas')}</div>
        <Chips
          options={Object.keys(SKILL_AREAS)}
          selected={areas}
          label={(o) => t(`fb.area.${o}`)}
          onToggle={(o) => toggle(areas, o, setAreas)}
        />
      </div>
      <textarea
        className="input min-h-16"
        dir="auto"
        placeholder={t('fb.commentPlaceholder')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <div className="text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button className="btn btn-gold btn-sm" disabled={busy || !Object.keys(ratings).length} onClick={() => run('submit')}>
          {t('fb.submit')}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => run('decline')}>
          {t('fb.decline')}
        </button>
      </div>
    </div>
  );
}
