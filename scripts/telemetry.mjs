/**
 * Usage ping — off until you turn it on.
 *
 * Nothing is sent unless you have explicitly said yes. There is no ping on
 * first run, and no ping while the answer is still unset. `/throughline:start`
 * asks once; the answer is remembered in `~/.throughline/config.json` and
 * applies to every repository on this machine.
 *
 * When it is on, this is what leaves the machine, in full:
 *
 *     {"event": "snapshot", "repo_hash": "a1b2c3d4e5f60718",
 *      "plugin_version": "0.6.0", "ts": "2026-08-12T14:00:00Z"}
 *
 * `repo_hash` is an HMAC of your git remote URL, keyed with a random secret
 * generated on your machine and never sent. It is stable across runs, so it can
 * tell "this repo again" from "a new repo" — and because the key never leaves
 * your machine, the value cannot be matched back to a repository by anyone who
 * holds it, including us. The same repo on someone else's machine hashes to a
 * different value.
 *
 * No file contents, no paths, no file names, no findings, no user, no directory
 * name are ever included. What the request itself unavoidably reveals, like any
 * HTTP call, is your IP address to the receiving server.
 *
 * Turn it off again at any time: `node scripts/consent.mjs off`, or set
 * `THROUGHLINE_TELEMETRY=0`, which overrides a stored yes.
 *
 * Every failure here is silent by design. Telemetry that degrades the tool is
 * worse than no telemetry.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENDPOINT = 'https://eduardocruz.com/agent-telemetry';
export const PLUGIN_VERSION = '0.6.0';
const TIMEOUT_MS = 2000;

export const CONFIG_DIR = process.env.THROUGHLINE_CONFIG_DIR
  ?? path.join(os.homedir(), '.throughline');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

/**
 * 'granted' | 'denied' | 'unset'.
 *
 * `unset` is the state a fresh install is in, and it behaves exactly like
 * `denied` — silence until someone actually answers. The two are kept distinct
 * only so the start flow knows whether it still has a question to ask.
 */
export function consentState() {
  const env = (process.env.THROUGHLINE_TELEMETRY ?? '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(env)) return 'denied';

  const stored = readConfig().telemetry;
  if (stored === true) return 'granted';
  if (stored === false) return 'denied';
  return 'unset';
}

export function isEnabled() {
  return consentState() === 'granted';
}

/** Record the answer. Returns the state it settled on. */
export function setConsent(granted) {
  const config = readConfig();
  config.telemetry = Boolean(granted);
  if (config.telemetry && !config.install_secret) {
    config.install_secret = randomBytes(32).toString('hex');
  }
  writeConfig(config);
  return config.telemetry ? 'granted' : 'denied';
}

/** Random per-install key. Created on first use, never transmitted. */
function installSecret() {
  const config = readConfig();
  if (config.install_secret) return config.install_secret;
  config.install_secret = randomBytes(32).toString('hex');
  writeConfig(config);
  return config.install_secret;
}

/**
 * Stable, non-reversible id for a repository. `local` when there is no remote.
 *
 * Keyed with a secret that never leaves the machine — so unlike a plain hash of
 * the remote URL, it cannot be brute-forced back to a repository by enumerating
 * public repository names.
 */
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
  return createHmac('sha256', installSecret()).update(remote, 'utf8').digest('hex').slice(0, 16);
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
