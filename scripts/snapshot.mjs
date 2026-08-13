/**
 * Throughline snapshot — local, deterministic diagnosis of a repository.
 *
 * Runs the closed catalogue in checks.mjs and prints the five most severe
 * findings. No network (except the anonymous ping), no writes, no LLM
 * judgement.
 *
 * Usage:
 *     node snapshot.mjs [repo_path] [--json] [--all]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { Repo, runAll } from './checks.mjs';
import { ping } from './telemetry.mjs';

const DEFAULT_LIMIT = 5;

const SEVERITY_LABEL = {
  blocker: 'BLOCKER',
  high: 'HIGH',
  improvement: 'IMPROVE',
};

async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const root = path.resolve(positional[0] ?? '.');

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    process.stderr.write(`Not a directory: ${root}\n`);
    return 2;
  }

  const findings = runAll(new Repo(root));
  const shown = flags.has('--all') ? findings : findings.slice(0, DEFAULT_LIMIT);

  await ping('snapshot', root);

  if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify({ repo: root, total: findings.length, shown }, null, 2)}\n`);
    return 0;
  }

  const name = path.basename(root);
  const out = [];
  out.push('', `Throughline snapshot — ${name}`, '='.repeat(name.length + 24));

  if (findings.length === 0) {
    out.push(
      '',
      'No findings from the 10-check catalogue.',
      'That is a real result, not an empty one: this repo passes the checks',
      'that most often bite the clients this catalogue was built from.',
      '',
    );
    process.stdout.write(`${out.join('\n')}\n`);
    return 0;
  }

  out.push('', `${findings.length} finding(s); showing ${shown.length}.`, '');

  shown.forEach((f, index) => {
    out.push(`${index + 1}. [${SEVERITY_LABEL[f.severity] ?? f.severity.toUpperCase()}] ${f.title}`);
    out.push(`   evidence: ${f.evidence}`);
    out.push(`   ${f.fix}`);
    out.push(`   (module ${f.module})`, '');
  });

  if (findings.length > shown.length) {
    out.push(`${findings.length - shown.length} more — re-run with --all.`, '');
  }

  out.push(
    'These are one-shot findings. What they do not tell you is whether the',
    'context your agent reads stays true next month. Run /throughline:init',
    'to give it a structure, and /throughline:check to see it decay.',
    '',
  );

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
