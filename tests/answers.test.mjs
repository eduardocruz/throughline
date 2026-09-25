/**
 * Tests for the SessionStart answers pull.
 *
 * Two promises are load bearing here and each one gets a test that fails loudly
 * if it stops being true:
 *
 *     1. an unconnected repo never touches the network
 *     2. an answer is never appended twice, and never lost between the fetch
 *        that acknowledges it and the file that holds it
 *
 * Run: node --test tests/
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { pullAnswers, watermarkOf, originOf } from '../scripts/answers.mjs';

const ANSWERS = path.join('.throughline', 'answers.md');

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'throughline-answers-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function connect(url = 'https://eduardocruz.com/eduardocruz/throughline/acme') {
  fs.mkdirSync(path.join(root, '.throughline'), { recursive: true });
  fs.writeFileSync(path.join(root, '.throughline', 'remote.json'), JSON.stringify({ url }));
}

/** A fetch that records its calls and replies with a fixed payload. */
function stubFetch(payload, { ok = true } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return { ok, json: async () => payload };
  };
  impl.calls = calls;
  return impl;
}

const answer = (overrides = {}) => ({
  request_id: 12,
  subject: 'Queue worker restart',
  question: 'Does the deploy restart the queue worker?',
  answer: 'No. It is a supervisor daemon and the deploy hook never reaches it.',
  answered_at: '2026-09-02T17:00:00+00:00',
  answered_by: 'Eduardo Cruz',
  ...overrides,
});

const payloadOf = (...answers) => ({
  answers,
  latest_answer_at: answers.at(-1)?.answered_at ?? null,
});

describe('the guard', () => {
  test('no remote.json — the network is never touched, nothing is written', async () => {
    const impl = stubFetch(payloadOf(answer()));
    const out = await pullAnswers({ root, token: 'secret', fetchImpl: impl });

    assert.equal(out, null);
    assert.equal(impl.calls.length, 0, 'an unconnected repo must not call out');
    assert.equal(fs.existsSync(path.join(root, ANSWERS)), false);
  });

  test('connected but no token — same silence', async () => {
    connect();
    const impl = stubFetch(payloadOf(answer()));
    const out = await pullAnswers({ root, token: undefined, fetchImpl: impl });

    assert.equal(out, null);
    assert.equal(impl.calls.length, 0);
    assert.equal(fs.existsSync(path.join(root, ANSWERS)), false);
  });

  test('a remote.json with no usable url is not a connection', async () => {
    fs.mkdirSync(path.join(root, '.throughline'), { recursive: true });
    fs.writeFileSync(path.join(root, '.throughline', 'remote.json'), '{"note":"hi"}');
    const impl = stubFetch(payloadOf(answer()));

    assert.equal(await pullAnswers({ root, token: 'secret', fetchImpl: impl }), null);
    assert.equal(impl.calls.length, 0);
  });
});

describe('the happy path', () => {
  test('appends the answer and reports it as additionalContext', async () => {
    connect();
    const impl = stubFetch(payloadOf(answer()));
    const out = await pullAnswers({ root, token: 'secret', fetchImpl: impl });

    assert.match(out, /1 new Throughline answer/);
    assert.match(out, /#12/);
    assert.match(out, /\.throughline\/answers\.md/);

    const body = fs.readFileSync(path.join(root, ANSWERS), 'utf8');
    assert.match(body, /^## #12 — Queue worker restart$/m);
    assert.match(body, /_Answered 2026-09-02T17:00:00\+00:00 by Eduardo Cruz_/);
    assert.match(body, /^> Does the deploy restart the queue worker\?$/m);
    assert.match(body, /supervisor daemon/);
    assert.equal(watermarkOf(body), '2026-09-02T17:00:00+00:00');
  });

  test('the first call sends the token and no since; the second sends the watermark', async () => {
    connect();
    const first = stubFetch(payloadOf(answer()));
    await pullAnswers({ root, token: 'secret', fetchImpl: first });

    assert.equal(first.calls[0].options.headers.Authorization, 'Bearer secret');
    assert.equal(new URL(first.calls[0].url).pathname, '/agent/answers');
    assert.equal(new URL(first.calls[0].url).origin, 'https://eduardocruz.com');
    assert.equal(new URL(first.calls[0].url).searchParams.get('since'), null);

    const second = stubFetch(payloadOf(answer({ request_id: 13, answered_at: '2026-09-03T09:00:00+00:00' })));
    await pullAnswers({ root, token: 'secret', fetchImpl: second });

    assert.equal(
      new URL(second.calls[0].url).searchParams.get('since'),
      '2026-09-02T17:00:00+00:00',
      'the watermark on disk is what gets sent as since',
    );
  });

  test('two answers in one response both land, newest watermark wins', async () => {
    connect();
    const impl = stubFetch(payloadOf(
      answer({ request_id: 12 }),
      answer({ request_id: 13, subject: 'Second', answered_at: '2026-09-03T09:00:00+00:00' }),
    ));
    const out = await pullAnswers({ root, token: 'secret', fetchImpl: impl });

    assert.match(out, /2 new Throughline answers/);
    const body = fs.readFileSync(path.join(root, ANSWERS), 'utf8');
    assert.match(body, /^## #12 —/m);
    assert.match(body, /^## #13 —/m);
    assert.equal(watermarkOf(body), '2026-09-03T09:00:00+00:00');
  });
});

describe('dedupe', () => {
  test('the same payload twice appends nothing and prints nothing', async () => {
    connect();
    await pullAnswers({ root, token: 'secret', fetchImpl: stubFetch(payloadOf(answer())) });
    const after = fs.readFileSync(path.join(root, ANSWERS), 'utf8');

    const out = await pullAnswers({ root, token: 'secret', fetchImpl: stubFetch(payloadOf(answer())) });

    assert.equal(out, null, 'a repeated answer is not news');
    assert.equal(fs.readFileSync(path.join(root, ANSWERS), 'utf8'), after, 'the file is untouched');
  });

  test('#1 and #12 are different answers', async () => {
    connect();
    await pullAnswers({ root, token: 'secret', fetchImpl: stubFetch(payloadOf(answer({ request_id: 1 }))) });
    const out = await pullAnswers({ root, token: 'secret', fetchImpl: stubFetch(payloadOf(answer({ request_id: 12 }))) });

    assert.match(out, /#12/);
    const body = fs.readFileSync(path.join(root, ANSWERS), 'utf8');
    assert.match(body, /^## #1 —/m);
    assert.match(body, /^## #12 —/m);
  });
});

describe('failure is always silent', () => {
  const broken = {
    'a rejected fetch': () => { throw new Error('ENOTFOUND'); },
    'a 500': () => ({ ok: false, json: async () => ({}) }),
    'garbage JSON': () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }),
    'a payload with no answers array': () => ({ ok: true, json: async () => ({ ok: true }) }),
    'an empty answers array': () => ({ ok: true, json: async () => ({ answers: [] }) }),
  };

  for (const [name, impl] of Object.entries(broken)) {
    test(`${name} — no output, no file`, async () => {
      connect();
      const out = await pullAnswers({ root, token: 'secret', fetchImpl: async () => impl() });
      assert.equal(out, null);
      assert.equal(fs.existsSync(path.join(root, ANSWERS)), false, 'nothing is written on a failed pull');
    });
  }

  test('a failed pull does not move a watermark that already exists', async () => {
    connect();
    await pullAnswers({ root, token: 'secret', fetchImpl: stubFetch(payloadOf(answer())) });
    const before = fs.readFileSync(path.join(root, ANSWERS), 'utf8');

    await pullAnswers({ root, token: 'secret', fetchImpl: async () => { throw new Error('offline'); } });

    assert.equal(fs.readFileSync(path.join(root, ANSWERS), 'utf8'), before);
  });
});

describe('origin', () => {
  test('the endpoint is the origin of the project URL, not the project page', () => {
    assert.equal(originOf('https://eduardocruz.com/eduardocruz/throughline/acme'), 'https://eduardocruz.com');
    assert.equal(originOf('not a url'), null);
  });
});

describe('as a script', () => {
  test('a repo with no .throughline/ prints nothing and exits 0', () => {
    const out = execFileSync(
      process.execPath,
      [path.join(import.meta.dirname, '..', 'scripts', 'answers.mjs'), root],
      { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_OPTION_THROUGHLINE_TOKEN: 'secret' } },
    );
    assert.equal(out, '');
  });
});
