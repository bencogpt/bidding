import { MILESTONES_SHOWN, STAGE_COLORS, stageLabel, type Milestone } from '@obms/shared';
import { StageTag } from '../agent/Chips';

const ALERT_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1.5l7 12.5H1L8 1.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8 6v3.5M8 11.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * "מועדים קרובים" beside "לטיפולך" (prototype hSide / mileHtml, lines 1976–1980 and 1907–1917; CSS 1109–1147):
 * for each active case the next stage, when it is due and who still holds it up. Rows come from the shared
 * `upcomingMilestones`. The prototype's footer "כל המועדים (n)" opens the schedule screen, which is not built
 * (out of scope), so it is left out.
 */
export default function UpcomingPanel({ items, onOpen }: { items: Milestone[]; onOpen: (m: Milestone) => void }) {
  const shown = items.slice(0, MILESTONES_SHOWN);
  return (
    <aside className="home-side">
      <div className="dl-in">
        <h2 className="m-0 px-5 pb-1.5 pt-[18px] text-lg font-semibold">מועדים קרובים</h2>
        <div className="dl-intro">השלב הקרוב בכל בל"מ, מתי הוא אמור להתחיל, ומי עדיין מעכב</div>
        <div className="dl-list">
          {shown.length === 0 && <div className="dl-intro pt-2">אין כרגע בל"מים פעילים.</div>}
          {shown.map((m) => (
            <div
              key={`${m.kind}-${m.id}`}
              className="dl-i"
              role="link"
              tabIndex={0}
              onClick={() => onOpen(m)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(m)}
            >
              <span className={`when ${m.hot ? 'hot' : ''}`}>
                <span dir="ltr">{m.when}</span>
                {m.risks.length > 0 && (
                  <span className="rk" title={`קיים סיכון: ${m.risks.join(' · ')}`}>
                    {ALERT_ICON}
                  </span>
                )}
              </span>
              <div className="dl-main">
                <div className="dl-title" title={m.name}>
                  {m.name}
                </div>
                <div className="dl-num">
                  <bdi>{m.ref}</bdi>
                </div>
                <div className="dl-tags">
                  <StageTag
                    label={m.nextLabel}
                    color={STAGE_COLORS[m.nextIdx] ?? STAGE_COLORS[0]}
                    upcoming
                    title={`השלב הבא · כעת ב${stageLabel(m.stageIdx)}`}
                  />
                </div>
                {m.waiting.length > 0 && (
                  <div className="dl-tags">
                    <span className="dl-lbl">ממתין:</span>
                    <span className="wait-names">{m.waiting.join(' · ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
