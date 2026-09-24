import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Live countdown to a deadline (epoch ms). Renders "passed" once elapsed.
export default function Countdown({ deadline }: { deadline: number | null }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return <span className="text-tx-mute">{t('submission.noDeadline')}</span>;

  const diff = deadline - now;
  if (diff <= 0) return <span className="font-semibold text-red-600">{t('submission.closed')}</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span className="font-mono font-semibold text-teal-600" dir="ltr">
      {d}d {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}
