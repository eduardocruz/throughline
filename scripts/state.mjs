/**
 * Report what Throughline can tell about this repository right now.
 *
 * Used by /throughline:start to give a first-time user the next step that
 * actually applies to them, instead of a menu of four commands they have to
 * choose between while knowing nothing.
 *
 * Read-only, no network.
 *
 * Usage:
 *     node state.mjs [repo_path]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const CONTEXT_FILES = ['goals.md', 'actions.md'];

/** Rough stack label, for orientation only — not used by any check. */
export function detectStack(root) {
  const stack = [];
  const has = (name) => fs.existsSync(path.join(root, name));

  if (has('composer.json')) {
    let laravel = false;
    try {
      const composer = JSON.parse(fs.readFileSync(path.join(root, 'composer.json'), 'utf8'));
      const req = { ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) };
      laravel = Object.keys(req).some((n) => n.startsWith('laravel/'));
    } catch { /* malformed manifest */ }
    stack.push(laravel ? 'Laravel' : 'PHP');
  }
  if (has('package.json')) stack.push('JavaScript');
  if (has('pyproject.toml') || has('requirements.txt')) stack.push('Python');
  if (has('go.mod')) stack.push('Go');
  if (has('Gemfile')) stack.push('Ruby');
  if (has('Cargo.toml')) stack.push('Rust');

  return stack;
}

/**
 * Drop fenced code blocks before measuring content.
 *
 * The templates document their own format with worked examples — `actions.md`
 * ships a fenced `- [ ] <what> — owner: …` line — and an example is not content.
 * Without this, every template reads as filled the moment it is created.
 */
export function stripFences(body) {
  return body.replace(/^```[\s\S]*?^```/gm, '');
}

/**
 * Does this context file carry anything the user actually wrote?
 *
 * The templates ship with headings and placeholders, so "has a `##`" is not a
 * test — `actions.md` arrives with `## On you` and would read as filled the
 * moment it is created. Each file needs its own rule, and each rule uses
 * horizontal whitespace only: `\s` matches the newline and would call an empty
 * field filled.
 */
export function isFilled(name, rawBody) {
  const body = stripFences(rawBody);
  switch (name) {
    case 'goals.md':
      return /\*\*Goal:\*\*[^\S\n]*\S/.test(body);
    case 'actions.md':
      // A real action item has text after the checkbox.
      return /^[^\S\n]*-[^\S\n]*\[[ x]\][^\S\n]*\S/m.test(body);
    default:
      return false;
  }
}

export function inspect(root) {
  const isGit = fs.existsSync(path.join(root, '.git'));

  let tracked = null;
  if (isGit) {
    try {
      const out = execFileSync('git', ['-C', root, 'ls-files'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      tracked = out.split('\n').filter(Boolean).length;
    } catch { /* empty repo or git unavailable */ }
  }

  const contextDir = path.join(root, '.throughline');
  const hasContext = fs.existsSync(contextDir);

  const context = {};
  if (hasContext) {
    for (const name of CONTEXT_FILES) {
      const file = path.join(contextDir, name);
      if (!fs.existsSync(file)) { context[name] = 'missing'; continue; }
      const body = fs.readFileSync(file, 'utf8');
      context[name] = isFilled(name, body) ? 'filled' : 'empty';
    }
  }

  // Has this repo ever been connected to a hosted Throughline? The file holds
  // only the project URL — never the token, which belongs in the environment.
  const hasRemote = fs.existsSync(path.join(contextDir, 'remote.json'));

  return {
    repo: path.basename(root),
    is_git: isGit,
    has_remote: hasRemote,
    tracked_files: tracked,
    stack: detectStack(root),
    has_context: hasContext,
    context,
    // The single most useful field: what this user should do next.
    // An empty actions.md is the normal steady state, not a gap — only a
    // missing week goal means the setup was never finished.
    suggested_next: !hasContext ? 'snapshot'
      : context['goals.md'] !== 'filled' ? 'fill'
        : 'check',
  };
}

function main(argv) {
  const root = path.resolve(argv[0] ?? '.');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    process.stderr.write(`Not a directory: ${root}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(inspect(root), null, 2)}\n`);
  return 0;
}

/** Only run when invoked directly, so importing this module for tests is inert. */
function isEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  process.exitCode = main(process.argv.slice(2));
}
