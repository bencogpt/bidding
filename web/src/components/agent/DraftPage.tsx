import { forwardRef, useMemo } from 'react';
import { draftLines, draftParts, type TemplateDoc, type TenderDoc } from '@obms/shared';

/**
 * The draft as a page of the future document (prototype draftPage, line 2685; CSS 693–708): a yellow
 * banner with the agent's status, then a grey canvas holding a white sheet. Filled fields are soft violet,
 * empty ones "חסר – ממלא רכש". The canvas scrolls by itself — jumping to a fix scrolls only it (spec §6.3).
 */
const DraftPage = forwardRef<HTMLDivElement, { tender: TenderDoc; template: TemplateDoc | null; status: React.ReactNode }>(
  function DraftPage({ tender, template, status }, canvasRef) {
    const lines = useMemo(() => draftLines(template?.bodyTemplate ?? ''), [template]);
    const labelOf = (key: string) => template?.params.find((p) => p.key === key)?.labelHe ?? key;
    let heading = 0;
    return (
      <div className="overflow-hidden border" style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
          style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
        >
          <span>
            <b className="font-semibold">טיוטה</b> · נבנתה מהבקשה ומהשלמת הרכש. שדות ריקים מסומנים.
          </span>
          <span className="inline-flex items-center gap-1.5">{status}</span>
        </div>
        <div ref={canvasRef} className="h-[560px] overflow-auto px-9 pt-4" style={{ background: '#e7e7ea' }}>
          <div
            className="min-h-[760px] px-[72px] py-14 text-[14px] leading-[1.7]"
            style={{ background: '#fff', color: '#111', boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}
            dir="rtl"
          >
            {!template ? (
              <div style={{ color: 'var(--muted)' }}>טוען…</div>
            ) : (
              <>
                <p>
                  {tender.serial ? <>בל"ם - {tender.serial}</> : null}
                  <br />
                  {tender.title}
                </p>
                {lines.map((line, n) => {
                  const parts = draftParts(line.text, tender.params).map((p, i) =>
                    p.kind === 'text' ? (
                      <span key={i}>{p.text}</span>
                    ) : p.value === null ? (
                      <mark key={i} className="mark-miss" data-k={p.key} data-miss="" title={labelOf(p.key)}>
                        חסר – ממלא רכש
                      </mark>
                    ) : (
                      <mark key={i} className="mark-fld" data-k={p.key} title={labelOf(p.key)}>
                        {p.value}
                      </mark>
                    ),
                  );
                  if (line.kind === 'heading') {
                    heading += 1;
                    return (
                      <b key={n} className="mt-5 block" data-sec={heading} data-heading={line.text}>
                        {parts}
                      </b>
                    );
                  }
                  return (
                    <p key={n} className="my-1">
                      {parts}
                    </p>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default DraftPage;
