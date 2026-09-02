/**
 * Pull answers from a hosted Throughline into the repository, once per session.
 *
 * This is the only part of the plugin that reads from the network, and it does
 * nothing at all unless BOTH of these are true:
 *
 *     1. `.throughline/remote.json` exists — this repo was deliberately
 *        connected to a hosted Throughline
 *     2. `THROUGHLINE_TOKEN` is set in the environment
 *
 * Without both, it exits 0 and prints nothing. That is what keeps the local
 * tier's promise honest: an unconnected repo never touches the network here.
 *
 * What is sent: a bearer token, and a `since` timestamp read from the top of
 * `.throughline/answers.md`. No file contents, no findings, no paths.
 *
 * Reading answers acknowledges them server-side, so they arrive exactly once.
 * Everything is therefore written to disk BEFORE anything is printed, and the
 * watermark never advances past an answer that was not persisted.
 *
 * Every failure — offline, 500, malformed JSON, unwritable file — is a silent
 * exit 0. A session must never be blocked by this.
 *
 * Usage:
 *     node answers.mjs [repo_path]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 5000;
const ANSWERS_FILE = 'answers.md';

/** The line that carries the watermark. Machine-read, so it is exact. */
const MARKER_RE = /^<!-- throughline:latest-answer (.*?) -->$/m;

const PREAMBLE = `# Answers

<!-- throughline:latest-answer  -->

Questions this repository's agent asked, and the answers that came back from
the hosted Throughline. Appended automatically at the start of a session; the
marker line above is the watermark, so leave it alone.
`;

/** The project URL for a connected repo, or null. Never holds a token. */
export function readRemote(root) {
  try {
    const raw = fs.readFileSync(path.join(root, '.throughline', 'remote.json'), 'utf8');
    const url = JSON.parse(raw).url;
    return typeof url === 'string' && url ? url : null;
  } catch {
    return null;
  }
}

/**
 * The origin to call.
 *
 * remote.json holds the *project* URL, which is a page, not an API root.
 * Concatenating an endpoint onto it would 404.
 */
export function originOf(projectUrl) {
  try {
    return new URL(projectUrl).origin;
  } catch {
    return null;
  }
}

/** The `answered_at` of the newest answer already on disk, or null. */
export function watermarkOf(body) {
  const match = body.match(MARKER_RE);
  const value = match?.[1]?.trim();
  return value || null;
}

/** Is this answer already in the file? Ids are stable, so the heading is the key. */
export function hasAnswer(body, id) {
  return new RegExp(`^## #${String(id)}(?![0-9])`, 'm').test(body);
}

function section(answer) {
  const who = answer.answered_by ? ` by ${answer.answered_by}` : '';
  const when = answer.answered_at ?? 'an unknown date';
  const quoted = String(answer.question ?? '')
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');

  return [
    `## #${answer.request_id} — ${answer.subject ?? 'Untitled'}`,
    '',
    `_Answered ${when}${who}_`,
    '',
    quoted,
    '',
    String(answer.answer ?? '').trim(),
    '',
  ].join('\n');
}

/**
 * The new file contents, or null when there is nothing new to write.
 *
 * Composed whole and written once: a crash must not be able to leave the
 * watermark ahead of the answers it claims to cover.
 */
export function compose(existing, answers, latestAnswerAt) {
  const body = existing ?? PREAMBLE;
  const fresh = answers.filter((a) => a && a.request_id != null && !hasAnswer(body, a.request_id));
  if (fresh.length === 0) return null;

  const watermark = latestAnswerAt
    ?? fresh.map((a) => a.answered_at).filter(Boolean).sort().at(-1)
    ?? watermarkOf(body)
    ?? '';

  const marked = MARKER_RE.test(body)
    ? body.replace(MARKER_RE, `<!-- throughline:latest-answer ${watermark} -->`)
    : `${body.trimEnd()}\n\n<!-- throughline:latest-answer ${watermark} -->\n`;

  return {
    fresh,
    contents: `${marked.trimEnd()}\n\n${fresh.map(section).join('\n')}`,
  };
}

/**
 * Fetch, persist, and report. Returns the additionalContext string, or null
 * when there is nothing to say.
 *
 * `fetchImpl` is injected so tests never touch the network or a global.
 */
export async function pullAnswers({
  root = process.cwd(),
  token = process.env.THROUGHLINE_TOKEN,
  fetchImpl = globalThis.fetch,
} = {}) {
  const projectUrl = readRemote(root);
  // Both conditions, or nothing happens — including the fetch.
  if (!projectUrl || !token) return null;

  const origin = originOf(projectUrl);
  if (!origin) return null;

  const contextDir = path.join(root, '.throughline');
  const file = path.join(contextDir, ANSWERS_FILE);

  let existing = null;
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch { /* first run — the preamble is written below */ }

  const since = watermarkOf(existing ?? '');
  const endpoint = new URL('/agent/answers', origin);
  if (since) endpoint.searchParams.set('since', since);

  let payload;
  try {
    const response = await fetchImpl(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  }

  const answers = Array.isArray(payload?.answers) ? payload.answers : [];
  if (answers.length === 0) return null;

  const composed = compose(existing, answers, payload?.latest_answer_at ?? null);
  if (!composed) return null;

  // Write first. Reading acknowledged these server-side; if this throws, they
  // are gone, so nothing downstream may run before the bytes are on disk.
  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(file, composed.contents, 'utf8');

  const listed = composed.fresh.map((a) => `#${a.request_id} ${a.subject ?? ''}`.trim()).join(', ');
  const count = composed.fresh.length;
  return `${count} new Throughline answer${count === 1 ? '' : 's'} `
    + `(${listed}) appended to .throughline/${ANSWERS_FILE}. Read it before proposing work.`;
}

/**
 * Where the repo is.
 *
 * An explicit argument wins, then the `cwd` Claude Code puts on stdin with the
 * SessionStart payload, then the process cwd. The stdin step matters: if the
 * hook is ever invoked from somewhere other than the project root, resolving
 * from cwd alone would find no `.throughline/` and this would go quiet forever
 * without anyone noticing.
 */
async function resolveRoot(argv) {
  if (argv[0]) return path.resolve(argv[0]);

  try {
    const chunks = [];
    // No payload on a TTY, and waiting for one would hang the session.
    if (!process.stdin.isTTY) {
      const deadline = setTimeout(() => process.stdin.destroy(), 1000);
      for await (const chunk of process.stdin) chunks.push(chunk);
      clearTimeout(deadline);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (typeof payload.cwd === 'string' && payload.cwd) return path.resolve(payload.cwd);
  } catch {
    // Not JSON, nothing on stdin, or a closed pipe: fall through to cwd.
  }

  return path.resolve('.');
}

async function main(argv) {
  let context = null;
  try {
    context = await pullAnswers({ root: await resolveRoot(argv) });
  } catch {
    // An unwritable repo is not worth a broken session.
    return 0;
  }

  if (context) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    })}\n`);
  }
  return 0;
}

/** Only run when invoked directly, so importing this module for tests is inert. */
function isEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  process.exitCode = await main(process.argv.slice(2));
}
