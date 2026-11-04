import { useMemo } from 'react';
import { activityRows, fmtDateTime, type TemplateDoc, type TenderDoc } from '@obms/shared';
import { useTenderAudit } from '../../lib/hooks';

/**
 * "פעילות" (prototype renderAct, lines 2787–2796; CSS 734–741, 922–923): the case's story, newest first — a time
 * and one Hebrew sentence per step. Technical audit entries are left out (shared activityRows).
 */
export default function ActivityTab({ tender, template }: { tender: TenderDoc; template: TemplateDoc | null }) {
  const audit = useTenderAudit(tender.id);
  const labelOf = (key: string) => template?.params.find((p) => p.key === key)?.labelHe;
  const rows = useMemo(
    () => activityRows(audit, labelOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audit, template],
  );

  return (
    <div className="border py-1.5" style={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 8 }}>
      {rows.length === 0 ? (
        <div className="px-[22px] py-4 text-sm" style={{ color: 'var(--muted)' }}>
          עדיין אין פעילות בבל"מ הזה.
        </div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.key}
            className="flex items-center gap-[18px] px-[22px] py-3"
            style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : 0 }}
          >
            <span className="w-[140px] flex-none tabular-nums" style={{ color: 'var(--muted)' }}>
              {fmtDateTime(r.at)}
            </span>
            <span className="flex-1">{r.text}</span>
          </div>
        ))
      )}
    </div>
  );
}
