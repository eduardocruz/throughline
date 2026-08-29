/**
 * The README makes three promises about telemetry. These are the tests that
 * hold them, because the previous version of this file made a promise the code
 * did not keep: it claimed the repo id was "not reversible to the URL without
 * already knowing the URL", when a plain SHA-256 of a git remote URL is
 * brute-forceable from the public list of repository names in seconds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SCRIPTS = path.join(import.meta.dirname, '..', 'scripts');

/** Run a snippet against a throwaway config dir, with the network stubbed out. */
function inSandbox(code, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-consent-'));
  try {
    return execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8',
      env: { ...process.env, THROUGHLINE_CONFIG_DIR: dir, TL_SCRIPTS: SCRIPTS, ...env },
    }).trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a fresh install sends nothing — consent starts unset, not granted', () => {
  const out = inSandbox(`
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    console.log(JSON.stringify([t.consentState(), t.isEnabled()]));
  `);
  assert.deepEqual(JSON.parse(out), ['unset', false]);
});

test('ping is a no-op until consent is granted — the network is never touched', () => {
  const out = inSandbox(`
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    let called = false;
    globalThis.fetch = () => { called = true; throw new Error('network touched'); };
    await t.ping('snapshot', process.cwd());
    console.log(String(called));
  `);
  assert.equal(out, 'false');
});

test('granting consent, then revoking it, silences the ping again', () => {
  const out = inSandbox(`
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    const seen = [];
    globalThis.fetch = async () => { seen.push(1); return new Response('{}'); };
    t.setConsent(true);
    await t.ping('snapshot', process.cwd());
    t.setConsent(false);
    await t.ping('snapshot', process.cwd());
    console.log(JSON.stringify([seen.length, t.consentState()]));
  `);
  assert.deepEqual(JSON.parse(out), [1, 'denied']);
});

test('THROUGHLINE_TELEMETRY=0 overrides a stored yes', () => {
  const out = inSandbox(`
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    t.setConsent(true);
    console.log(t.consentState());
  `, { THROUGHLINE_TELEMETRY: '0' });
  assert.equal(out, 'denied');
});

test('repo_hash is NOT a plain hash of the remote URL — the 75-guess attack fails', () => {
  // Exactly the attack that broke the old scheme: hash the candidate remote
  // URLs anyone can enumerate from public repository listings, and look for a
  // match. Against an HMAC keyed with a secret that never leaves the machine,
  // it must find nothing.
  const remote = 'https://github.com/eduardocruz/throughline.git';
  const sent = inSandbox(`
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    t.setConsent(true);
    const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-repo-'));
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', ${JSON.stringify(remote)}]);
    console.log(t.repoHash(dir));
  `);

  const plain = createHash('sha256').update(remote, 'utf8').digest('hex').slice(0, 16);
  assert.notEqual(sent, plain, 'repo_hash must not be a plain SHA-256 of the remote URL');

  const orgs = ['facebook', 'vercel', 'laravel', 'eduardocruz', 'openai'];
  const names = ['react', 'next.js', 'framework', 'throughline', 'gpt'];
  for (const o of orgs) {
    for (const n of names) {
      for (const form of [`https://github.com/${o}/${n}.git`, `https://github.com/${o}/${n}`, `git@github.com:${o}/${n}.git`]) {
        const guess = createHash('sha256').update(form, 'utf8').digest('hex').slice(0, 16);
        assert.notEqual(guess, sent, `brute force reversed repo_hash to ${form}`);
      }
    }
  }
});

test('the same repository on two machines produces different ids', () => {
  const code = `
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    t.setConsent(true);
    const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-repo-'));
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/eduardocruz/throughline.git']);
    console.log(t.repoHash(dir));
  `;
  assert.notEqual(inSandbox(code), inSandbox(code));
});

test('the install secret is never part of the payload', () => {
  const out = inSandbox(`
    const t = await import(process.env.TL_SCRIPTS + '/telemetry.mjs');
    t.setConsent(true);
    let body = '';
    globalThis.fetch = async (_url, opts) => { body = opts.body; return new Response('{}'); };
    await t.ping('snapshot', process.cwd());
    const fs = await import('node:fs');
    const cfg = JSON.parse(fs.readFileSync(t.CONFIG_PATH, 'utf8'));
    console.log(JSON.stringify({ body, leaks: body.includes(cfg.install_secret) }));
  `);
  const { body, leaks } = JSON.parse(out);
  assert.equal(leaks, false, 'the install secret must never be transmitted');
  assert.deepEqual(
    Object.keys(JSON.parse(body)).sort(),
    ['event', 'plugin_version', 'repo_hash', 'ts'],
    'the payload is exactly these four fields — the README prints it in full',
  );
});
