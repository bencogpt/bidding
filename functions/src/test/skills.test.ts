// Unit tests for the read-only skills catalog (reads the bundled functions/skills copy):
//   node --test functions/lib/test/skills.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_IDS, MANDATORY_LEGAL_SECTIONS } from '@obms/shared';
import { currentSkillHash, skillMeta, skillsCatalog, loadSkill } from '../services/skillsRegistry.js';

test('skillMeta parses the frontmatter of a real SKILL.md', () => {
  const meta = skillMeta(loadSkill('s11-legal-compliance').text);
  assert.equal(meta.name, 's11-legal-compliance');
  assert.ok(meta.description.length > 20);
});

test('skillMeta tolerates a file without frontmatter', () => {
  assert.deepEqual(skillMeta('# just a heading'), { name: '', description: '' });
});

test('skillsCatalog: all skills, hashes match what the supervisor checks against', () => {
  const c = skillsCatalog();
  assert.equal(c.skills.length, SKILL_IDS.length);
  for (const s of c.skills) {
    assert.ok(s.text.length > 100, s.id);
    assert.equal(s.hash, currentSkillHash(s.id), s.id);
  }
  assert.equal(c.globalRules.hash, currentSkillHash('GLOBAL_RULES'));
  const ids = new Set(c.skills.map((s) => s.id));
  for (const type of ['goods', 'service', 'project'] as const) {
    for (const id of c.required[type]) assert.ok(ids.has(id), `${type}: ${id}`);
  }
  assert.deepEqual(c.templateIds, { goods: 'T-A', service: 'T-B', project: 'T-B' });
  assert.equal(c.legalSections.length, MANDATORY_LEGAL_SECTIONS.length);
  assert.ok(c.legalChecklist.ip?.length);
  // Serializable for a callable (no RegExp leaks into the payload).
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(c)));
  assert.ok(!JSON.stringify(c.legalSections).includes('pattern'));
});
