/**
 * Closed catalogue of Throughline snapshot checks.
 *
 * Ten checks, derived 1:1 from the Throughline module library seed — the
 * findings that actually repeated across real client engagements. This
 * catalogue is closed on purpose: the snapshot runs a pre-declared set of
 * checks, it does not analyse freely. Adding a check means adding it here,
 * with a fixture.
 *
 * Every check is a pure function of a `Repo` and returns an array of findings.
 * Every finding carries evidence: a real path and/or a real line. A check that
 * cannot point at something does not fire.
 *
 * Node standard library only. No network. No writes.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SEVERITY_ORDER = { blocker: 0, high: 1, improvement: 2 };

/** Directories that are never the founder's own code. */
const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '__pycache__', '.venv', 'venv', 'storage', 'public',
]);

const MAX_FILES = 8000;

const BINARY_SUFFIXES = new Set([
  '.lock', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.woff', '.woff2',
  '.ico', '.zip', '.gz', '.mp4', '.webp',
]);

function finding({ id, severity, title, evidence, module, fix }) {
  return { id, severity, title, evidence, module, fix };
}

/** Cached, read-only view of a repository directory. */
export class Repo {
  constructor(root) {
    this.root = path.resolve(root);
    this._text = new Map();
    this._files = null;
    this._json = new Map();
  }

  /** All files under root, excluding vendored/build directories. */
  files() {
    if (this._files !== null) return this._files;

    const found = [];
    const walk = (dir) => {
      if (found.length >= MAX_FILES) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (found.length >= MAX_FILES) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name)) continue;
          walk(full);
        } else if (entry.isFile()) {
          found.push(full);
        }
      }
    };

    walk(this.root);
    this._files = found;
    return found;
  }

  /** Read a file as text; unreadable or missing files read as empty. */
  read(filePath) {
    if (this._text.has(filePath)) return this._text.get(filePath);
    let body = '';
    try {
      body = fs.readFileSync(filePath, 'utf8');
    } catch {
      body = '';
    }
    this._text.set(filePath, body);
    return body;
  }

  rel(filePath) {
    return path.relative(this.root, filePath) || path.basename(filePath);
  }

  exists(...relatives) {
    for (const name of relatives) {
      const candidate = path.join(this.root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /** Files matching simple `dir/*.ext` or plain-name patterns, relative to root. */
  globFiles(...patterns) {
    const out = [];
    for (const pattern of patterns) {
      const dir = path.dirname(pattern);
      const base = path.basename(pattern);
      const absDir = path.join(this.root, dir === '.' ? '' : dir);

      if (!base.includes('*')) {
        const candidate = path.join(absDir, base);
        try {
          if (fs.statSync(candidate).isFile()) out.push(candidate);
        } catch { /* not there */ }
        continue;
      }

      const matcher = new RegExp('^' + base.split('*').map(escapeRegExp).join('.*') + '$');
      let entries = [];
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && matcher.test(entry.name)) out.push(path.join(absDir, entry.name));
      }
    }
    return [...new Set(out)];
  }

  bySuffix(...suffixes) {
    const wanted = new Set(suffixes);
    return this.files().filter((f) => wanted.has(path.extname(f)));
  }

  jsonFile(name) {
    if (this._json.has(name)) return this._json.get(name);
    let data = {};
    const file = path.join(this.root, name);
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(this.read(file));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
      } catch { /* malformed manifest is not a finding of ours */ }
    }
    this._json.set(name, data);
    return data;
  }

  composer() { return this.jsonFile('composer.json'); }

  packageJson() { return this.jsonFile('package.json'); }

  isLaravel() {
    const composer = this.composer();
    const require = { ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) };
    return Object.keys(require).some((name) => name.startsWith('laravel/'));
  }

  /**
   * Files that actually drive a deploy.
   *
   * A CI workflow that only runs tests is NOT a deploy path — treating it as
   * one flags every library repo for "no post-deploy verification" of a deploy
   * it never performs. So workflows must show a deploy verb; the dedicated
   * deploy files count on name alone.
   */
  deployScripts() {
    const dedicated = this.globFiles(
      'deploy*.sh', '*.envoyer*', 'Procfile', '.forge/*', 'envoyer.yml', 'fly.toml',
    );

    const deployVerb = /\bdeploy\b|envoyer|forge|rsync|ssh |fly deploy|docker push|kubectl|helm upgrade|vercel|netlify|capistrano/i;
    const workflows = this.globFiles(
      '.github/workflows/*.yml', '.github/workflows/*.yaml', '.gitlab-ci.yml', 'Makefile',
    ).filter((file) => deployVerb.test(this.read(file)));

    return [...new Set([...dedicated, ...workflows])];
  }

  ciFiles() {
    return this.globFiles(
      '.github/workflows/*.yml', '.github/workflows/*.yaml',
      '.gitlab-ci.yml', 'bitbucket-pipelines.yml', '.circleci/config.yml',
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 1-indexed line number of an offset inside a body. */
function lineAt(body, index) {
  return body.slice(0, index).split('\n').length;
}

// ---------------------------------------------------------------------------
// Module #1 — deploy-restart-queue-workers
// ---------------------------------------------------------------------------

export function checkQueueRestart(repo) {
  const composer = repo.composer();
  const require = { ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) };
  const usesHorizon = Object.hasOwn(require, 'laravel/horizon');

  let queueSignal = null;
  for (const file of repo.bySuffix('.php')) {
    const rel = repo.rel(file);
    if (!rel.startsWith('app/Jobs') && !rel.startsWith('app/Console')) continue;
    if (repo.read(file).includes('ShouldQueue')) { queueSignal = rel; break; }
  }

  if (!usesHorizon && !queueSignal) return [];

  const deployFiles = repo.deployScripts();
  for (const file of deployFiles) {
    const body = repo.read(file);
    if (body.includes('horizon:terminate') || body.includes('queue:restart')) return [];
  }

  const what = usesHorizon ? 'laravel/horizon' : queueSignal;
  const evidence = deployFiles.length === 0
    ? `queue in use (${what}) but no deploy script found to inspect`
    : `queue in use (${what}); no horizon:terminate / queue:restart in ${deployFiles.slice(0, 3).map((f) => repo.rel(f)).join(', ')}`;

  return [finding({
    id: 'deploy-restart-queue-workers',
    severity: 'high',
    title: 'Deploy does not restart queue workers',
    evidence,
    module: '#1',
    fix: 'End the deploy with `php artisan horizon:terminate` (Horizon) or '
      + '`php artisan queue:restart`. Without it the worker keeps the old config '
      + 'in memory and dies when the previous release is pruned — queued jobs '
      + 'disappear silently.',
  })];
}

// ---------------------------------------------------------------------------
// Module #2 — sentry-instrumentation-baseline
// ---------------------------------------------------------------------------

export function checkErrorReporting(repo) {
  // Only applies to something that is actually a project. A directory with no
  // manifest is not missing an error reporter, it is just a directory.
  if (Object.keys(repo.composer()).length === 0 && Object.keys(repo.packageJson()).length === 0) {
    return [];
  }

  const composer = repo.composer();
  const pkg = repo.packageJson();
  const composerReq = Object.keys({ ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) });
  const npmReq = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });

  const hasSdk = [...composerReq, ...npmReq].some((name) => /sentry|bugsnag|rollbar/i.test(name));

  const dsn = /https:\/\/[0-9a-f]{16,}@[\w.-]*ingest[\w.-]*\.sentry\.io/;
  for (const file of repo.bySuffix('.php', '.js', '.ts', '.tsx', '.yml', '.yaml')) {
    const rel = repo.rel(file);
    if (rel.startsWith('.env')) continue;
    if (dsn.test(repo.read(file))) {
      return [finding({
        id: 'sentry-instrumentation-baseline',
        severity: 'high',
        title: 'Sentry DSN hardcoded outside .env',
        evidence: `${rel} contains a literal ingest DSN`,
        module: '#2',
        fix: 'Move the DSN to .env and read it through config/. A DSN in source is '
          + 'committed to history forever and cannot be rotated by editing the file.',
      })];
    }
  }

  if (hasSdk) return [];

  return [finding({
    id: 'sentry-instrumentation-baseline',
    severity: 'high',
    title: 'No error reporting SDK',
    evidence: 'no sentry/bugsnag/rollbar package in composer.json or package.json',
    module: '#2',
    fix: 'Install an error reporter and tie releases to the deploy. Without it, '
      + 'production errors are discovered by users rather than by you.',
  })];
}

// ---------------------------------------------------------------------------
// Module #3 — prod-parity-verification
// ---------------------------------------------------------------------------

export function checkProdVerification(repo) {
  const deployFiles = repo.deployScripts();
  if (deployFiles.length === 0) return [];

  const verification = /curl[^\n]*(-w|--write-out|http_code)|healthcheck|smoke[_-]?test/i;
  for (const file of deployFiles) {
    if (verification.test(repo.read(file))) return [];
  }

  return [finding({
    id: 'prod-parity-verification',
    severity: 'high',
    title: 'Deploy has no post-deploy verification of a live route',
    evidence: `no health check or smoke test in ${deployFiles.slice(0, 3).map((f) => repo.rel(f)).join(', ')}`,
    module: '#3',
    fix: 'End the deploy with a real request against a real route and assert the '
      + 'status code. "Works locally" is not verification — a package in '
      + 'require-dev gives a 500 only under --no-dev, in production.',
  })];
}

// ---------------------------------------------------------------------------
// Module #4 — secrets-never-in-git
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Stripe live secret key', /\bsk_live_[0-9a-zA-Z]{16,}/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{36,}\b/],
  ['OpenAI key', /\bsk-(proj-)?[0-9A-Za-z_-]{32,}\b/],
];

const PLACEHOLDER_WORDS = /your|example|sample|test|fake|dummy|placeholder|redacted|changeme|xxxx|here|token|secret|replace|insert|own-|my-|abc123|123456/i;

/**
 * Reject documentation placeholders.
 *
 * `xoxb-your-bot-token` and `xoxb-own-workspace` match the shape of a Slack
 * token but are prose. Real credentials carry entropy: they mix digits into a
 * long body and do not spell words. Getting this wrong in the other direction
 * is cheap (one missed secret); getting it wrong here is expensive (a snapshot
 * whose first finding is wrong is a snapshot nobody trusts again).
 */
export function looksLikeARealSecret(candidate) {
  if (PLACEHOLDER_WORDS.test(candidate)) return false;
  const body = candidate.includes('-') ? candidate.slice(candidate.indexOf('-') + 1) : candidate;
  const digits = [...body].filter((c) => c >= '0' && c <= '9').length;
  return digits >= 2 && body.length >= 12;
}

export function checkSecrets(repo) {
  const envFile = path.join(repo.root, '.env');
  const gitignore = repo.exists('.gitignore');
  const ignoresEnv = gitignore !== null && /^\s*\.env\s*$/m.test(repo.read(gitignore));

  if (fs.existsSync(envFile) && !ignoresEnv) {
    return [finding({
      id: 'secrets-never-in-git',
      severity: 'blocker',
      title: '.env is not gitignored',
      evidence: '.env exists and .gitignore has no bare `.env` rule',
      module: '#4',
      fix: 'Add `.env` to .gitignore and commit `.env.example` with placeholders '
        + 'instead. If it was ever committed, the credentials must be ROTATED — '
        + 'deleting the file does not remove it from history.',
    })];
  }

  for (const file of repo.files()) {
    const rel = repo.rel(file);
    if (rel.startsWith('.env') && rel !== '.env.example') continue;
    if (BINARY_SUFFIXES.has(path.extname(file))) continue;

    const body = repo.read(file);
    if (!body) continue;

    for (const [label, pattern] of SECRET_PATTERNS) {
      const match = pattern.exec(body);
      if (!match) continue;
      // A private key block has no body to score — its presence is the finding.
      if (label !== 'private key block' && !looksLikeARealSecret(match[0])) continue;

      return [finding({
        id: 'secrets-never-in-git',
        severity: 'blocker',
        title: `${label} found in the repository`,
        evidence: `${rel}:${lineAt(body, match.index)}`,
        module: '#4',
        fix: 'Rotate the credential at the provider first — it is in git history '
          + 'permanently. Then move it to .env and add a secret-scanning '
          + 'pre-commit hook so the next one is blocked.',
      })];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Module #5 — dependency-eol-watch
// ---------------------------------------------------------------------------

export function checkDependencyHealth(repo) {
  const composer = repo.composer();
  const pkg = repo.packageJson();

  if (Object.keys(composer).length > 0 && !repo.exists('composer.lock')) {
    return [finding({
      id: 'dependency-eol-watch',
      severity: 'high',
      title: 'composer.lock is not committed',
      evidence: 'composer.json present, composer.lock absent',
      module: '#5',
      fix: 'Commit the lockfile. Without it, builds resolve differently over time '
        + 'and break silently — Packagist v1 going down already made unlocked '
        + 'Composer 1 builds unreproducible.',
    })];
  }

  if (Object.keys(pkg).length > 0 && !repo.exists('package-lock.json', 'yarn.lock', 'pnpm-lock.yaml')) {
    return [finding({
      id: 'dependency-eol-watch',
      severity: 'high',
      title: 'No JavaScript lockfile is committed',
      evidence: 'package.json present, no package-lock/yarn.lock/pnpm-lock',
      module: '#5',
      fix: 'Commit the lockfile so builds are reproducible.',
    })];
  }

  const eol = [
    ['composer.json', composer, /"php"\s*:\s*"[^"]*?(5\.\d|7\.\d|8\.0)/, 'PHP 8.0 and older are end of life'],
    ['package.json', pkg, /"node"\s*:\s*"[^"]*?(1[0-6]|[0-9])\./, 'Node 16 and older are end of life'],
  ];

  for (const [name, source, pattern, message] of eol) {
    if (pattern.test(JSON.stringify(source))) {
      return [finding({
        id: 'dependency-eol-watch',
        severity: 'high',
        title: 'Runtime constraint allows an end-of-life version',
        evidence: `${name}: ${message}`,
        module: '#5',
        fix: 'Raise the floor to a supported version. A runtime out of support is '
          + 'an active security debt, not a future chore.',
      })];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Module #6 — authz-not-just-auth
// ---------------------------------------------------------------------------

export function checkAuthz(repo) {
  if (!repo.isLaravel()) return [];

  const routeFiles = repo.globFiles('routes/*.php');
  if (routeFiles.length === 0) return [];

  const resourceParam = /\{(\w*(id|project|customer|team|account|org)\w*)\}/i;
  let hit = null;
  for (const file of routeFiles) {
    const lines = repo.read(file).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (resourceParam.test(lines[index])) {
        hit = { file: repo.rel(file), detail: `${index + 1}: ${lines[index].trim().slice(0, 90)}` };
        break;
      }
    }
    if (hit) break;
  }

  if (!hit) return [];

  const policiesDir = path.join(repo.root, 'app', 'Policies');
  let hasPolicies = false;
  try {
    hasPolicies = fs.statSync(policiesDir).isDirectory()
      && fs.readdirSync(policiesDir).some((name) => name.endsWith('.php'));
  } catch { /* no policies dir */ }

  const authzMarker = /authorize\(|Gate::|->can\(|can:|Policy/;
  const hasAuthz = hasPolicies || repo.bySuffix('.php')
    .filter((file) => {
      const rel = repo.rel(file);
      return rel.startsWith('app/Http/Controllers') || rel.startsWith('routes/');
    })
    .some((file) => authzMarker.test(repo.read(file)));

  if (hasAuthz) return [];

  return [finding({
    id: 'authz-not-just-auth',
    severity: 'blocker',
    title: 'Routes take a resource id with no authorization layer',
    evidence: `${hit.file} ${hit.detail} — no app/Policies, no authorize()/Gate/can: anywhere`,
    module: '#6',
    fix: 'Authenticated is not authorized. Every route taking a resource id must '
      + 'check OWNERSHIP, not just existence. The test: logged in as tenant A, '
      + "can I read tenant B's data by changing the number in the URL?",
  })];
}

// ---------------------------------------------------------------------------
// Module #7 — public-bucket-audit
// ---------------------------------------------------------------------------

const REMOTE_DRIVERS = new Set(['s3', 'spaces', 'r2', 'gcs', 'azure', 'blob']);

function publicStorageFinding(rel, line, evidence) {
  return finding({
    id: 'public-bucket-audit',
    severity: 'high',
    title: 'Remote object storage is configured public',
    evidence: `${rel}:${line} — ${evidence}`,
    module: '#7',
    fix: 'Prefer short-lived signed URLs to a public bucket. Audit the bucket '
      + 'policy for `Principal: "*"` with Put/Delete and confirm Public Access '
      + 'Block is on before trusting "it\'s private".',
  });
}

export function checkPublicStorage(repo) {
  const candidates = repo.bySuffix('.php', '.yml', '.yaml', '.tf', '.json').filter((file) => {
    const rel = repo.rel(file);
    return rel.toLowerCase().includes('filesystem') || rel.startsWith('config/') || path.extname(file) === '.tf';
  });

  // An explicit public-read ACL is unambiguous wherever it appears.
  const explicitAcl = /['"]public-read(-write)?['"]/;
  // `visibility => public` is ambiguous: Laravel's default `public` disk is a
  // LOCAL disk and is completely fine. It only matters on a remote driver.
  const visibilityPublic = /['"]visibility['"]\s*(=>|:)\s*['"]public['"]/;
  const anyDriver = /['"]driver['"]\s*(=>|:)\s*['"](\w+)['"]/i;

  for (const file of candidates) {
    const body = repo.read(file);

    const aclMatch = explicitAcl.exec(body);
    if (aclMatch) {
      return [publicStorageFinding(repo.rel(file), lineAt(body, aclMatch.index), aclMatch[0])];
    }

    const lines = body.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!visibilityPublic.test(lines[index])) continue;

      // Walk back to the NEAREST driver declaration — that is the one in this
      // disk's own block. A fixed window would reach into the next disk and
      // flag Laravel's stock local `public` disk, which is fine.
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const driver = anyDriver.exec(lines[previous]);
        if (!driver) continue;
        if (REMOTE_DRIVERS.has(driver[2].toLowerCase())) {
          return [publicStorageFinding(repo.rel(file), index + 1, lines[index].trim())];
        }
        break;
      }
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Module #8 — db-migration-discipline
// ---------------------------------------------------------------------------

export function checkMigrationDiscipline(repo) {
  for (const file of [...repo.deployScripts(), ...repo.ciFiles()]) {
    const body = repo.read(file);
    const match = /migrate:fresh|db:wipe|migrate\s+--force\s+--seed/.exec(body);
    if (match) {
      return [finding({
        id: 'db-migration-discipline',
        severity: 'blocker',
        title: 'Destructive migration command in a deploy/CI script',
        evidence: `${repo.rel(file)}:${lineAt(body, match.index)} — ${match[0]}`,
        module: '#8',
        fix: 'Never run migrate:fresh where client data lives. Guard destructive '
          + 'operations behind a verified, recent backup.',
      })];
    }
  }

  const migrations = repo.globFiles('database/migrations/*.php').sort();
  for (const file of migrations) {
    const body = repo.read(file);
    if (!body.includes('Schema::create')) continue;
    if (/->id\(|->\w*[Ii]ncrements\(|->uuid\(|->ulid\(|primary\(/.test(body)) continue;

    return [finding({
      id: 'db-migration-discipline',
      severity: 'high',
      title: 'Migration creates a table with no primary key',
      evidence: `${repo.rel(file)} — Schema::create with no id()/primary()`,
      module: '#8',
      fix: 'Give every table a primary key. Managed MySQL with '
        + 'sql_require_primary_key=ON rejects the migration outright, so this '
        + 'breaks the day you move to managed hosting.',
    })];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Module #9 — payment-settlement-verification
// ---------------------------------------------------------------------------

const PAYMENT_PACKAGES = ['stripe', 'pluggy', 'authorize', 'paypal', 'braintree', 'mercadopago', 'pagarme'];

export function checkPaymentVerification(repo) {
  const require = { ...(repo.composer().require ?? {}), ...(repo.packageJson().dependencies ?? {}) };
  const matched = Object.keys(require).filter(
    (name) => PAYMENT_PACKAGES.some((p) => name.toLowerCase().includes(p)),
  );
  if (matched.length === 0) return [];

  const verification = /retrieve\(|->refresh\(|webhook|charge\.succeeded|payment_intent\.succeeded|settled|settlement|reconcil/i;
  for (const file of repo.bySuffix('.php', '.ts', '.js')) {
    if (verification.test(repo.read(file))) return [];
  }

  return [finding({
    id: 'payment-settlement-verification',
    severity: 'high',
    title: 'Payment SDK with no settlement verification',
    evidence: `${matched[0]} in dependencies; no webhook/retrieve/reconcile path found`,
    module: '#9',
    fix: 'Never mark money as received on a single optimistic signal. Confirm '
      + "against the provider's source of truth (webhook or explicit retrieve) "
      + 'before writing "paid".',
  })];
}

// ---------------------------------------------------------------------------
// Module #10 — ci-quality-gate
// ---------------------------------------------------------------------------

export function checkCiGate(repo) {
  const ci = repo.ciFiles();

  if (ci.length === 0) {
    if (Object.keys(repo.composer()).length === 0 && Object.keys(repo.packageJson()).length === 0) return [];
    return [finding({
      id: 'ci-quality-gate',
      severity: 'improvement',
      title: 'No CI configuration found',
      evidence: 'no .github/workflows, .gitlab-ci.yml, or equivalent',
      module: '#10',
      fix: 'Add a gate that runs formatter + static analysis + tests on every push. '
        + 'Quality that depends on remembering is quality you do not have.',
    })];
  }

  const gate = /pint|prettier|eslint|phpstan|larastan|psalm|tsc|pest|phpunit|vitest|jest|pytest|unittest|node --test|node:test|tox|ruff|black|mypy|golangci|go test|cargo test|rspec|rubocop|mocha/i;
  for (const file of ci) {
    if (gate.test(repo.read(file))) return [];
  }

  return [finding({
    id: 'ci-quality-gate',
    severity: 'improvement',
    title: 'CI runs no formatter, static analysis or tests',
    evidence: `${ci.slice(0, 3).map((f) => repo.rel(f)).join(', ')} — no pint/prettier/eslint/phpstan/tsc/test runner`,
    module: '#10',
    fix: 'A pipeline that only builds does not protect the codebase. Add the '
      + 'formatter and the test run to the same gate.',
  })];
}

export const CATALOGUE = [
  checkSecrets,
  checkAuthz,
  checkMigrationDiscipline,
  checkQueueRestart,
  checkErrorReporting,
  checkProdVerification,
  checkDependencyHealth,
  checkPublicStorage,
  checkPaymentVerification,
  checkCiGate,
];

/**
 * Run the closed catalogue and return findings, most severe first.
 *
 * A check that throws is skipped rather than killing the snapshot: a partial
 * diagnosis is useful, a stack trace in the founder's terminal is not.
 */
export function runAll(repo) {
  const findings = [];
  for (const check of CATALOGUE) {
    try {
      findings.push(...check(repo));
    } catch {
      // one broken check must not sink the run
    }
  }
  return findings.sort((a, b) => {
    const severity = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    return severity !== 0 ? severity : a.id.localeCompare(b.id);
  });
}
