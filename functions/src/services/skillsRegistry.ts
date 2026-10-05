// skillsRegistry — loads the procurement skills framework (skills/00_GLOBAL_RULES.md + the
// per-skill SKILL.md files) bundled into functions/skills by scripts/copy-skills.mjs, and hashes
// each file so a tender's provenance records exactly which skill version drafted it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_SKILLS, type SkillId, type SkillUse, type TenderType } from '@obms/shared';

export interface LoadedSkill {
  id: SkillId | 'GLOBAL_RULES';
  text: string;
  hash: string;
}

export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

let rootCache: string | null = null;

// The bundled entry (lib/index.js) and the tsc output (lib/services/*.js) sit at different
// depths, and the emulator/test cwd varies — probe the known locations.
function skillsRoot(): string {
  if (rootCache) return rootCache;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../skills'),
    resolve(here, '../../skills'),
    resolve(process.cwd(), 'skills'),
    resolve(here, '../../../skills'),
  ];
  const found = candidates.find((c) => existsSync(resolve(c, '00_GLOBAL_RULES.md')));
  if (!found) {
    throw new Error(`skills framework not found (looked in: ${candidates.join(', ')})`);
  }
  rootCache = found;
  return found;
}

const cache = new Map<string, LoadedSkill>();

function load(id: LoadedSkill['id'], relPath: string): LoadedSkill {
  const hit = cache.get(id);
  if (hit) return hit;
  const text = readFileSync(resolve(skillsRoot(), relPath), 'utf8');
  const skill = { id, text, hash: sha256(text) };
  cache.set(id, skill);
  return skill;
}

export function loadGlobalRules(): LoadedSkill {
  return load('GLOBAL_RULES', '00_GLOBAL_RULES.md');
}

export function loadSkill(id: SkillId): LoadedSkill {
  return load(id, `skills/${id}/SKILL.md`);
}

/** GLOBAL_RULES + every skill the bid type must be drafted with. */
export function requiredSkillsFor(type: TenderType): LoadedSkill[] {
  return [loadGlobalRules(), ...REQUIRED_SKILLS[type].map(loadSkill)];
}

/** Current hash of a skill, or null if the bundled file is missing. */
export function currentSkillHash(id: SkillUse['id']): string | null {
  try {
    return id === 'GLOBAL_RULES' ? loadGlobalRules().hash : loadSkill(id).hash;
  } catch {
    return null;
  }
}
