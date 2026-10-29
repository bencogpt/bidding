import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillsCatalog as Catalog, TenderType } from '@obms/shared';
import { useSkillsCatalog } from '../lib/hooks';
import { renderMarkdown } from '../lib/markdown';

// Skill files open with YAML frontmatter and an HTML header comment — metadata, not content.
const skillBody = (text: string) =>
  text
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

function SkillText({ text }: { text: string }) {
  return (
    <div
      className="prose-sm mt-2 max-h-96 overflow-auto rounded border border-paper-2 bg-surface-2 p-3 text-sm leading-relaxed [&_h1]:text-base [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:list-disc [&_ul]:mr-5"
      dir="auto"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(skillBody(text)) }}
    />
  );
}

function ReadOnlyNote() {
  const { t } = useTranslation();
  return <p className="mb-2 rounded bg-paper-2 p-2 text-xs text-tx-soft">🔒 {t('skills.readOnly')}</p>;
}

function SkillRow({ skill, catalog, showTypes }: { skill: Catalog['skills'][number]; catalog: Catalog; showTypes?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const types = (Object.keys(catalog.required) as TenderType[]).filter((ty) => catalog.required[ty].includes(skill.id));
  return (
    <li className="rounded border border-paper-2 p-2">
      <button className="flex w-full flex-wrap items-center gap-2 text-right text-sm" onClick={() => setOpen((o) => !o)}>
        <span className="text-tx-mute">{open ? '▾' : '▸'}</span>
        <span className="font-semibold" dir="ltr">
          {skill.id}
        </span>
        {catalog.supervisorSkills.includes(skill.id) && <span className="chip">{t('skills.usedBySupervisor')}</span>}
        {showTypes &&
          types.map((ty) => (
            <span key={ty} className="chip">
              {t(`type.${ty}`)}
            </span>
          ))}
        <span className="mr-auto text-xs text-tx-mute" dir="ltr" title={skill.hash}>
          #{skill.hash.slice(0, 8)}
        </span>
      </button>
      {skill.description && <div className="mt-1 text-xs text-tx-soft" dir="auto">{skill.description}</div>}
      {open && <SkillText text={skill.text} />}
    </li>
  );
}

/** The skills a bid type is drafted and checked with — shown inside each type card. */
export function TypeSkills({ type }: { type: TenderType }) {
  const { t } = useTranslation();
  const { catalog, error } = useSkillsCatalog();
  return (
    <div className="border-t border-paper-2 pt-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-tx-soft">
        {t('skills.requiredTitle')}
        {catalog && <span className="chip">{t('skills.templateId', { id: catalog.templateIds[type] })}</span>}
      </div>
      <ReadOnlyNote />
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!catalog ? (
        !error && <div className="text-sm text-tx-mute">{t('common.loading')}</div>
      ) : (
        <ul className="space-y-1">
          {catalog.required[type].map((id) => {
            const skill = catalog.skills.find((s) => s.id === id);
            return skill ? <SkillRow key={id} skill={skill} catalog={catalog} /> : null;
          })}
        </ul>
      )}
    </div>
  );
}

/** Page-level reference: global rules, mandatory legal sections + clause checklist, all skills. */
export default function SkillsCatalog() {
  const { t } = useTranslation();
  const { catalog, error } = useSkillsCatalog();
  const [globalOpen, setGlobalOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  return (
    <div className="card mt-6 space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{t('skills.title')}</h2>
        <p className="text-sm text-tx-soft">{t('skills.intro')}</p>
      </div>
      <ReadOnlyNote />
      {error && <div className="text-sm text-red-600">{error}</div>}
      {catalog && (
        <>
          {/* Global rules */}
          <div>
            <button className="flex items-center gap-2 text-sm font-semibold" onClick={() => setGlobalOpen((o) => !o)}>
              <span className="text-tx-mute">{globalOpen ? '▾' : '▸'}</span>
              {t('skills.globalRules')}
              <span className="text-xs font-normal text-tx-mute" dir="ltr" title={catalog.globalRules.hash}>
                #{catalog.globalRules.hash.slice(0, 8)}
              </span>
            </button>
            {globalOpen && <SkillText text={catalog.globalRules.text} />}
          </div>

          {/* Mandatory legal sections + checklist */}
          <div>
            <div className="mb-1 text-sm font-semibold">{t('skills.legalTitle')}</div>
            <p className="mb-2 text-xs text-tx-mute">{t('skills.legalHint')}</p>
            <ul className="grid gap-2 md:grid-cols-2">
              {catalog.legalSections.map((s) => (
                <li key={s.id} className="rounded border border-paper-2 p-2 text-sm">
                  <div className="font-semibold">{s.nameHe}</div>
                  {catalog.legalChecklist[s.id]?.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-tx-soft">
                      {catalog.legalChecklist[s.id].map((e) => (
                        <li key={e.id}>• {e.he}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-xs text-tx-mute">{t('skills.presenceOnly')}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* All skills */}
          <div>
            <button className="flex items-center gap-2 text-sm font-semibold" onClick={() => setAllOpen((o) => !o)}>
              <span className="text-tx-mute">{allOpen ? '▾' : '▸'}</span>
              {t('skills.allSkills', { count: catalog.skills.length })}
            </button>
            {allOpen && (
              <ul className="mt-2 space-y-1">
                {catalog.skills.map((s) => (
                  <SkillRow key={s.id} skill={s} catalog={catalog} showTypes />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
