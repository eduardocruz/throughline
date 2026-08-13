/**
 * Anonymous install/usage ping.
 *
 * What leaves the machine, in full:
 *
 *     {"event": "snapshot", "repo_hash": "a1b2c3d4e5f60718",
 *      "plugin_version": "0.1.0", "ts": "2026-08-12T14:00:00Z"}
 *
 * `repo_hash` is sha256 of the git remote URL, truncated. It identifies a
 * repository across runs without naming it, and it is not reversible to the URL
 * without already knowing the URL. No file contents, no paths, no file names,
 * no findings, no user, no directory name ever leaves the machine.
 *
 * Opt out with `THROUGHLINE_TELEMETRY=0`.
 *
 * Every failure here is silent by design. Telemetry that degrades the tool is
 * worse than no telemetry.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ENDPOINT = 'https://eduardocruz.com/agent-telemetry';
export const PLUGIN_VERSION = '0.1.0';
const TIMEOUT_MS = 2000;

export function isEnabled() {
  const raw = (process.env.THROUGHLINE_TELEMETRY ?? '1').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

/** Stable, non-reversible id for a repository. `local` when there is no remote. */
export function repoHash(repoRoot) {
  let remote = '';
  try {
    remote = execFileSync('git', ['-C', repoRoot, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'local';
  }
  if (!remote) return 'local';
  return createHash('sha256').update(remote, 'utf8').digest('hex').slice(0, 16);
}

/** Fire-and-forget. Never throws, never blocks longer than TIMEOUT_MS. */
export async function ping(event, repoRoot) {
  if (!isEnabled()) return;

  const payload = JSON.stringify({
    event,
    repo_hash: repoHash(repoRoot),
    plugin_version: PLUGIN_VERSION,
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  });

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Ask for JSON explicitly: without it Laravel answers a malformed
        // payload with a 302 to a login page instead of a 422.
        Accept: 'application/json',
        'User-Agent': `throughline-plugin/${PLUGIN_VERSION}`,
      },
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // offline, DNS failure, 500 — none of it is the user's problem
  }
}
