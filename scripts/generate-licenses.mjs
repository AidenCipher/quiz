// Writes apps/web/public/third-party-notices.txt: licence text for the font and the production npm dependencies.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const out = [];
out.push(
  'QUIZ ARENA — THIRD-PARTY NOTICES',
  '',
  'All avatars, the detective owl and the icons are original artwork made for this project.',
  '',
);
out.push('=== Font: Inter (self-hosted) ===', '');
out.push(readFileSync('apps/web/node_modules/@fontsource-variable/inter/LICENSE', 'utf8').trim(), '');
out.push('=== Production npm dependencies of the web app and worker ===', '');
const seen = new Map();
for (const dir of ['apps/web', 'apps/worker', 'packages/shared']) {
  const raw = JSON.parse(
    execSync('pnpm licenses list --prod --json', { cwd: dir, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }),
  );
  for (const [license, pkgs] of Object.entries(raw)) {
    for (const p of pkgs)
      seen.set(
        `${p.name}@${p.versions.join(',')}`,
        `${p.name}@${p.versions.join(',')}\t${license}\t${p.homepage ?? ''}`,
      );
  }
}
const rows = [...seen.values()].sort();
out.push(...rows, '');
writeFileSync('apps/web/public/third-party-notices.txt', out.join('\n'));
console.log(`Wrote ${rows.length} packages.`);
