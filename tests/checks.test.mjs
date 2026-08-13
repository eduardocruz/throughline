/**
 * Tests for the snapshot catalogue.
 *
 * Run: node --test tests/
 *
 * Every false positive fixed during development gets a regression test here. A
 * snapshot whose first finding is wrong is a snapshot nobody trusts again, so
 * the negative cases matter more than the positive ones.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  Repo,
  checkCiGate,
  checkDependencyHealth,
  checkMigrationDiscipline,
  checkPublicStorage,
  checkSecrets,
  runAll,
} from '../scripts/checks.mjs';
import { analyse } from '../scripts/check.mjs';
import { inspect } from '../scripts/state.mjs';

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'throughline-test-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative, body) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'utf8');
  return full;
}

const repo = () => new Repo(root);

describe('secrets', () => {
  test('flags a high entropy key', () => {
    // Built at runtime so this fixture is not itself a literal that secret
    // scanners (including our own) flag when they read this file.
    const key = `AKIA${'2E0A8F3B5C7D9E1F'}`;
    write('config/services.php', `<?php\nreturn ['k' => '${key}'];\n`);
    write('.gitignore', '.env\n');

    const findings = checkSecrets(repo());
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocker');
  });

  test('ignores documentation placeholders', () => {
    // Regression: `xoxb-your-bot-token` and `xoxb-own-workspace` are prose.
    write('.gitignore', '.env\n');
    write('docs/slack.md', 'SLACK_BOT_TOKEN=xoxb-your-bot-token\n');
    write('tests/SlackTest.php', "<?php\n'access_token' => 'xoxb-own-workspace',\n");

    assert.deepEqual(checkSecrets(repo()), []);
  });

  test('flags an .env that is not gitignored', () => {
    write('.env', 'APP_KEY=base64:abc\n');
    write('.gitignore', 'node_modules\n');

    const findings = checkSecrets(repo());
    assert.equal(findings.length, 1);
    assert.match(findings[0].title, /gitignored/);
  });

  test('accepts a properly ignored .env', () => {
    write('.env', 'APP_KEY=base64:abc\n');
    write('.gitignore', 'node_modules\n.env\n');

    assert.deepEqual(checkSecrets(repo()), []);
  });
});

describe('public storage', () => {
  const LOCAL_PUBLIC_DISK = `<?php
return ['disks' => [
    'public' => [
        'driver' => 'local',
        'root' => storage_path('app/public'),
        'visibility' => 'public',
    ],
    's3' => [
        'driver' => 's3',
        'bucket' => env('AWS_BUCKET'),
    ],
]];
`;

  const REMOTE_PUBLIC_DISK = `<?php
return ['disks' => [
    'do_spaces' => [
        'driver' => 's3',
        'bucket' => env('DO_SPACES_BUCKET'),
        'visibility' => 'public',
    ],
]];
`;

  test("ignores Laravel's stock local public disk", () => {
    // Regression: a fixed line window reached the neighbouring s3 block.
    write('config/filesystems.php', LOCAL_PUBLIC_DISK);
    assert.deepEqual(checkPublicStorage(repo()), []);
  });

  test('flags a remote disk that is public', () => {
    write('config/filesystems.php', REMOTE_PUBLIC_DISK);
    const findings = checkPublicStorage(repo());
    assert.equal(findings.length, 1);
    assert.match(findings[0].evidence, /visibility/);
  });

  test('flags an explicit public-read ACL', () => {
    write('config/filesystems.php', "<?php\n$acl = 'public-read';\n// s3\n");
    assert.equal(checkPublicStorage(repo()).length, 1);
  });
});

describe('migration discipline', () => {
  test('accepts bigIncrements as a primary key', () => {
    // Regression: `bigIncrements('id')` was not matched by the id() pattern.
    write(
      'database/migrations/2014_01_01_000000_create_things_table.php',
      "<?php\nSchema::create('things', function (Blueprint $table) {\n    $table->bigIncrements('id');\n});\n",
    );
    assert.deepEqual(checkMigrationDiscipline(repo()), []);
  });

  test('accepts ulid and uuid keys', () => {
    for (const column of ['ulid', 'uuid']) {
      write(
        `database/migrations/2014_01_01_000000_create_${column}_table.php`,
        `<?php\nSchema::create('t', function ($table) { $table->${column}('id'); });\n`,
      );
    }
    assert.deepEqual(checkMigrationDiscipline(repo()), []);
  });

  test('flags a table with no primary key', () => {
    write(
      'database/migrations/2014_01_01_000000_create_pivot_table.php',
      "<?php\nSchema::create('pivot', function ($table) { $table->string('email'); });\n",
    );
    const findings = checkMigrationDiscipline(repo());
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'db-migration-discipline');
  });

  test('flags a destructive command in CI', () => {
    write('.github/workflows/deploy.yml', 'steps:\n  - run: php artisan migrate:fresh --force\n');
    assert.equal(checkMigrationDiscipline(repo())[0].severity, 'blocker');
  });
});

describe('dependency health', () => {
  test('flags a missing composer.lock', () => {
    write('composer.json', '{"require": {"php": "^8.3"}}');
    const findings = checkDependencyHealth(repo());
    assert.equal(findings.length, 1);
    assert.match(findings[0].title, /composer\.lock/);
  });

  test('accepts a committed lockfile', () => {
    write('composer.json', '{"require": {"php": "^8.3"}}');
    write('composer.lock', '{}');
    assert.deepEqual(checkDependencyHealth(repo()), []);
  });
});

describe('CI gate', () => {
  test('flags CI without any quality step', () => {
    write('composer.json', '{}');
    write('.github/workflows/build.yml', 'steps:\n  - run: echo building\n');
    assert.equal(checkCiGate(repo()).length, 1);
  });

  test('accepts CI that runs tests', () => {
    write('composer.json', '{}');
    write('.github/workflows/tests.yml', 'steps:\n  - run: ./vendor/bin/pest\n');
    assert.deepEqual(checkCiGate(repo()), []);
  });

  test('accepts CI that runs node --test', () => {
    // Regression: the plugin's own CI runs node --test and was flagged.
    write('package.json', '{}');
    write('package-lock.json', '{}');
    write('.github/workflows/tests.yml', 'steps:\n  - run: node --test tests/\n');
    assert.deepEqual(checkCiGate(repo()), []);
  });
});

describe('deploy detection', () => {
  test('a test-only workflow is not a deploy path', () => {
    // Regression: every library repo was flagged for "no post-deploy
    // verification" of a deploy it never performs.
    write('.github/workflows/tests.yml', 'steps:\n  - run: node --test tests/\n');
    assert.deepEqual(repo().deployScripts(), []);
  });

  test('a workflow that deploys is a deploy path', () => {
    write('.github/workflows/ship.yml', 'steps:\n  - run: envoyer deploy\n');
    assert.equal(repo().deployScripts().length, 1);
  });
});

describe('runAll', () => {
  test('an empty directory produces no findings', () => {
    // A non-project directory must not be lectured at.
    assert.deepEqual(runAll(repo()), []);
  });

  test('findings are ordered most severe first', () => {
    write('.gitignore', 'node_modules\n');
    write('.env', 'APP_KEY=x\n');            // blocker
    write('composer.json', '{"require": {}}'); // high (no lockfile)

    const severities = runAll(repo()).map((f) => f.severity);
    const order = { blocker: 0, high: 1, improvement: 2 };
    assert.deepEqual(severities, [...severities].sort((a, b) => order[a] - order[b]));
    assert.equal(severities[0], 'blocker');
  });
});

describe('decay analysis', () => {
  function initFrom() {
    const target = path.join(root, '.throughline');
    fs.mkdirSync(target, { recursive: true });
    for (const name of ['goals.md', 'actions.md']) {
      fs.copyFileSync(path.join(import.meta.dirname, '..', 'templates', name), path.join(target, name));
    }
    return target;
  }

  test('a freshly initialised .throughline is reported as empty, not healthy', () => {
    // Regression: `\s` matches newlines in JS, so `**Goal:**` followed by a
    // blank line looked FILLED. The conversion mechanism never fired.
    const ids = analyse(initFrom()).map((s) => s.id);
    assert.ok(ids.includes('goal-empty'), `expected goal-empty, got ${ids}`);
  });

  test('a filled goal is not reported as empty', () => {
    const target = initFrom();
    fs.writeFileSync(path.join(target, 'goals.md'), '## Week of 2026-08-10\n\n**Goal:** Ship the invite flow\n\n**Secondary priorities:** none\n');
    const ids = analyse(target).map((s) => s.id);
    assert.ok(!ids.includes('goal-empty'), `unexpected goal-empty in ${ids}`);
  });

  test('the actions template does not count as open items', () => {
    // The template documents its format in a fenced example; an example is not
    // an action item.
    const target = initFrom();
    const ids = analyse(target).map((s) => s.id);
    assert.ok(!ids.includes('actions-static'), `unexpected actions-static in ${ids}`);
  });
});

describe('onboarding state', () => {
  function initFrom(templates = true) {
    const target = path.join(root, '.throughline');
    fs.mkdirSync(target, { recursive: true });
    if (templates) {
      for (const name of ['goals.md', 'actions.md']) {
        fs.copyFileSync(path.join(import.meta.dirname, '..', 'templates', name), path.join(target, name));
      }
    }
    return target;
  }

  test('a virgin repo is sent to the snapshot', () => {
    assert.equal(inspect(root).suggested_next, 'snapshot');
  });

  test('a freshly created .throughline is sent to filling, not to check', () => {
    // Regression: `## On you` in the actions template read as content, and the
    // `- [ ]` counter matched across the newline — so a brand new directory
    // looked complete and the flow skipped the only step that matters.
    initFrom();
    const state = inspect(root);
    assert.equal(state.context['actions.md'], 'empty', 'empty template must not read as filled');
    assert.equal(state.suggested_next, 'fill');
  });

  test('a filled goal sends the user to check', () => {
    const target = initFrom();
    fs.writeFileSync(path.join(target, 'goals.md'), '## Week of 2026-08-10\n\n**Goal:** Ship it\n');
    assert.equal(inspect(root).suggested_next, 'check');
  });

  test('reports whether a remote was ever configured', () => {
    const target = initFrom();
    assert.equal(inspect(root).has_remote, false);
    fs.writeFileSync(path.join(target, 'remote.json'), '{"url":"https://example.com/p"}');
    assert.equal(inspect(root).has_remote, true);
  });
});
