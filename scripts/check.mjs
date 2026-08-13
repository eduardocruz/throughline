/**
 * Measure structural decay of a .throughline/ directory.
 *
 * This is not a linter for prose. It measures the four ways a hand-maintained
 * context file stops being true:
 *
 *     1. the week goal stopped moving
 *     2. the guidelines stopped changing
 *     3. decisions are being recorded without a source
 *     4. action items are open and static
 *
 * Nothing here is a judgement call — each signal is a date or a count, and each
 * one names the file it came from.
 *
 * Usage:
 *     node check.mjs [repo_path] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { ping } from './telemetry.mjs';

const GOAL_STALE_DAYS = 14;
const GUIDELINES_STALE_DAYS = 21;
const ACTION_STALE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days since the file last changed, by git history, falling back to mtime.
 *
 * git is preferred because a checkout rewrites mtimes and would make every file
 * look freshly edited on a new machine.
 */
export function lastChangedDays(filePath, now = Date.now()) {
  try {
    const stamp = execFileSync(
      'git',
      ['-C', path.dirname(filePath), 'log', '-1', '--format=%ct', '--', path.basename(filePath)],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (stamp) return Math.floor((now - Number(stamp) * 1000) / DAY_MS);
  } catch { /* not a git repo, or git unavailable */ }

  try {
    return Math.floor((now - fs.statSync(filePath).mtimeMs) / DAY_MS);
  } catch {
    return null;
  }
}

function read(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function analyse(target, now = Date.now()) {
  const signals = [];

  const goalsPath = path.join(target, 'goals.md');
  const goals = read(goalsPath);
  if (goals !== null) {
    const age = lastChangedDays(goalsPath, now);
    if (goals.includes('**Goal:**') && !/\*\*Goal:\*\*[^\S\n]*\S/.test(goals)) {
      signals.push({ id: 'goal-empty', detail: 'the week goal in .throughline/goals.md is blank' });
    } else if (age !== null && age > GOAL_STALE_DAYS) {
      signals.push({
        id: 'goal-stale',
        detail: `.throughline/goals.md has not changed in ${age} days (a week goal should move weekly)`,
      });
    }
  }

  const guidelinesPath = path.join(target, 'guidelines.md');
  const guidelines = read(guidelinesPath);
  if (guidelines !== null) {
    const filled = (guidelines.match(/\*\*Rule:\*\*[^\S\n]*\S/g) ?? []).length;
    const age = lastChangedDays(guidelinesPath, now);
    if (filled === 0) {
      signals.push({ id: 'guidelines-empty', detail: 'no guideline is filled in .throughline/guidelines.md' });
    } else if (age !== null && age > GUIDELINES_STALE_DAYS) {
      signals.push({
        id: 'guidelines-stale',
        detail: `${filled} guideline(s) unchanged for ${age} days — nothing new has been learned from an incident since`,
      });
    }
  }

  const decisions = read(path.join(target, 'decisions.md'));
  if (decisions !== null) {
    const blocks = decisions.split(/^##\s+/m).slice(1);
    const real = blocks.filter((block) => !block.startsWith('YYYY-MM-DD'));
    const sourceless = real.filter((block) => !/\*\*Source:\*\*[^\S\n]*\S/.test(block)).length;
    if (real.length > 0 && sourceless > 0) {
      signals.push({
        id: 'decisions-sourceless',
        detail: `${sourceless} of ${real.length} decision(s) in .throughline/decisions.md have no Source`,
      });
    }
  }

  const actionsPath = path.join(target, 'actions.md');
  const actions = read(actionsPath);
  if (actions !== null) {
    const open = (actions.match(/^\s*-\s*\[ \]\s*\S.*$/gm) ?? []).length;
    const age = lastChangedDays(actionsPath, now);
    if (open > 0 && age !== null && age > ACTION_STALE_DAYS) {
      signals.push({
        id: 'actions-static',
        detail: `${open} open action item(s), file untouched for ${age} days`,
      });
    }
  }

  return signals;
}

async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const root = path.resolve(positional[0] ?? '.');
  const target = path.join(root, '.throughline');

  if (!fs.existsSync(target)) {
    process.stderr.write('No .throughline/ here. Run /throughline:init first.\n');
    return 1;
  }

  const signals = analyse(target);
  await ping('check', root);

  if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify({ repo: root, signals }, null, 2)}\n`);
    return 0;
  }

  const out = ['', `Throughline check — ${path.basename(root)}`, ''];

  if (signals.length === 0) {
    out.push('No decay detected. The context your agent reads is current.', '');
    process.stdout.write(`${out.join('\n')}\n`);
    return 0;
  }

  signals.forEach((signal) => out.push(`  ! ${signal.detail}`));

  out.push(
    '',
    'Every one of these is the same failure: the file only changes when a',
    'human remembers to change it, and the work that should update it —',
    'email, Slack threads, meetings, PRs — never arrives here on its own.',
    '',
    'That is what the hosted tier does: it feeds this directory from the',
    'channels the decisions actually happen in, so the record stays true',
    'without anyone maintaining it. /throughline:connect',
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
