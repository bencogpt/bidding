import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuestionDoc, AnswerDoc } from '@obms/shared';
import { api } from '../lib/api';
import { isInternalRole } from '@obms/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuestionAuthors } from '../lib/hooks';

export default function QuestionsPanel({
  tenderId,
  questions,
  answers,
  canManage,
  canAsk,
}: {
  tenderId: string;
  questions: QuestionDoc[];
  answers: AnswerDoc[];
  canManage: boolean;
  canAsk: boolean;
}) {
  const { t } = useTranslation();
  const { role, supplierId } = useAuth();
  const isInternal = isInternalRole(role ?? undefined);
  // Internal users resolve every asker; a supplier resolves only their own question.
  const authors = useQuestionAuthors(tenderId, isInternal ? null : supplierId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [answerText, setAnswerText] = useState<Record<string, string>>({});

  const ask = async () => {
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      await api.askQuestion({ tenderId, text });
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const cluster = async () => {
    setBusy(true);
    try {
      await api.clusterTenderQuestions({ tenderId });
    } finally {
      setBusy(false);
    }
  };

  // Group questions by clusterId (null = its own group keyed by id).
  const groups = new Map<string, QuestionDoc[]>();
  for (const q of questions) {
    const key = q.clusterId ?? `solo_${q.id}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const answerFor = (clusterId: string) => answers.find((a) => a.clusterId === clusterId);

  // Questions are anonymous to suppliers by design — a bidder who could see who else is asking
  // would know who else is bidding. Only the manager sees real names.
  const labelFor = (q: QuestionDoc) => {
    const author = authors[q.id];
    if (isInternal) return author?.supplierName ?? t('q.anonymous');
    // Supplier: the only author doc they can read is their own, so presence == "mine".
    return author ? t('q.yourQuestion') : t('q.anonymous');
  };

  const submitAnswer = async (clusterId: string, questionIds: string[]) => {
    const txt = answerText[clusterId];
    if (!txt?.trim()) return;
    setBusy(true);
    try {
      await api.answerQuestions({ tenderId, clusterId, questionIds, text: txt });
      setAnswerText((s) => ({ ...s, [clusterId]: '' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {canAsk && (
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">{t('q.ask')}</h3>
          <textarea
            className="input min-h-20"
            placeholder={t('q.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn-gold mt-3" disabled={busy} onClick={ask}>
            {t('q.send')}
          </button>
        </div>
      )}

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t('q.list')}</h3>
          {canManage && questions.length > 0 && (
            <button className="btn" disabled={busy} onClick={cluster}>
              {t('q.cluster')}
            </button>
          )}
        </div>
        {questions.length === 0 ? (
          <div className="text-sm text-tx-soft">{t('q.empty')}</div>
        ) : (
          <div className="space-y-4">
            {[...groups.entries()].map(([key, qs]) => {
              const clusterId = qs[0].clusterId;
              const ans = clusterId ? answerFor(clusterId) : undefined;
              return (
                <div key={key} className="rounded border border-paper-2 p-4">
                  <ul className="space-y-1">
                    {qs.map((q) => (
                      <li key={q.id} className="text-sm">
                        <span className="font-medium text-teal-600">{labelFor(q)}:</span>{' '}
                        {q.text}
                        {q.answered && (
                          <span className="ms-2 text-xs text-green-600">{t('q.answered')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {ans ? (
                    <div className="mt-3 rounded bg-teal-soft/40 p-3 text-sm">
                      <span className="font-semibold">↳ </span>
                      {ans.text}
                    </div>
                  ) : (
                    canManage &&
                    clusterId && (
                      <div className="mt-3">
                        <textarea
                          className="input min-h-16"
                          placeholder={t('q.answerPlaceholder')}
                          value={answerText[clusterId] ?? ''}
                          onChange={(e) =>
                            setAnswerText((s) => ({ ...s, [clusterId]: e.target.value }))
                          }
                        />
                        <button
                          className="btn btn-gold mt-2"
                          disabled={busy}
                          onClick={() => submitAnswer(clusterId, qs.map((q) => q.id))}
                        >
                          {t('q.answer')}
                        </button>
                      </div>
                    )
                  )}
                  {canManage && !clusterId && (
                    <div className="mt-2 text-xs text-tx-mute">{t('q.cluster')} →</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
