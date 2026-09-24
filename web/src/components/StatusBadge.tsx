import { useTranslation } from 'react-i18next';
import type { TenderStatus } from '@obms/shared';

const COLORS: Record<TenderStatus, string> = {
  draft: 'bg-paper-2 text-tx-soft',
  internal_review: 'bg-orange-100 text-orange-700',
  ready: 'bg-blue-100 text-blue-700',
  published: 'bg-purple-100 text-purple-700',
  responses: 'bg-teal-soft text-teal-600',
  evaluated: 'bg-amber-100 text-amber-700',
  awarded: 'bg-green-100 text-green-700',
};

export default function StatusBadge({ status }: { status: TenderStatus }) {
  const { t } = useTranslation();
  return <span className={`badge ${COLORS[status]}`}>{t(`status.${status}`)}</span>;
}
