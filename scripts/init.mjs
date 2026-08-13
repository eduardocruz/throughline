/**
 * Create .throughline/ in a repository from the bundled templates.
 *
 * Idempotent: an existing file is never overwritten. Re-running after a partial
 * setup fills only what is missing and says what it left alone.
 *
 * Usage:
 *     node init.mjs [repo_path]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ping } from './telemetry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(HERE, '..', 'templates');
const TEMPLATES = ['goals.md', 'guidelines.md', 'decisions.md', 'actions.md'];

const README = `# .throughline/

The context your AI agent reads before it does anything in this repository.

| File | What it answers |
|---|---|
| \`goals.md\` | What are we trying to do, at four timescales? |
| \`guidelines.md\` | What are the three rules the agent must respect? |
| \`decisions.md\` | What has already been decided (and why)? |
| \`actions.md\` | Who owes what, and where did it come from? |

Keep these true. An agent reading a stale goal ladder is more confidently wrong
than an agent reading nothing.

\`/throughline:check\` measures whether that is happening.
`;

async function main(argv) {
  const root = path.resolve(argv[0] ?? '.');

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    process.stderr.write(`Not a directory: ${root}\n`);
    return 2;
  }

  const target = path.join(root, '.throughline');
  fs.mkdirSync(target, { recursive: true });

  const created = [];
  const kept = [];

  for (const name of TEMPLATES) {
    const destination = path.join(target, name);
    if (fs.existsSync(destination)) { kept.push(name); continue; }
    fs.copyFileSync(path.join(TEMPLATE_DIR, name), destination);
    created.push(name);
  }

  const readme = path.join(target, 'README.md');
  if (fs.existsSync(readme)) {
    kept.push('README.md');
  } else {
    fs.writeFileSync(readme, README, 'utf8');
    created.push('README.md');
  }

  await ping('init', root);

  const out = ['', `.throughline/ ready in ${path.basename(root)}`, ''];
  if (created.length) {
    out.push('created:');
    created.forEach((name) => out.push(`  + .throughline/${name}`));
  }
  if (kept.length) {
    out.push('left alone (already existed):');
    kept.forEach((name) => out.push(`  = .throughline/${name}`));
  }

  if (created.length) {
    out.push(
      '',
      'From now on your agent reads .throughline/ before it proposes work,',
      'estimates, or makes a technical call — in every session, in this repo.',
      '',
      'Next: fill in the week goal in .throughline/goals.md and the first',
      'guideline in .throughline/guidelines.md. Both are useless empty, and',
      'the agent will read them either way.',
      '',
      'Nothing updates these files except you. /throughline:check measures',
      'whether that has started to show.',
      '',
    );
  } else {
    out.push('', 'Nothing to do — everything was already in place.', '');
  }

  process.stdout.write(`${out.join('\n')}\n`);
  return 0;
}

/** Only run when invoked directly, so importing this module for tests is inert. */
function isEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  process.exitCode = await main(process.argv.slice(2));
}
