// Bundle the repo-root skills/ framework into functions/skills so it ships with the deploy
// (Firebase uploads only the functions/ directory). Runs automatically before `npm run build`.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(functionsDir, '../skills');
const dest = resolve(functionsDir, 'skills');

if (!existsSync(src)) {
  if (existsSync(dest)) {
    console.warn('copy-skills: ../skills not found — keeping the existing functions/skills copy');
    process.exit(0);
  }
  console.error('copy-skills: ../skills not found and no bundled copy exists');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-skills: bundled ${src} -> ${dest}`);
