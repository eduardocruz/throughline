# Throughline

**Give your AI agent the context it is missing about your business.**

Your agent knows your code. It does not know what you are trying to do this
week, which decisions are already settled, or which mistake you have promised
never to repeat. Throughline is where that lives — as four markdown files in
your repo that your agent reads every session.

Runs entirely on your machine. No account, no signup, no data leaves the repo.

## Install

```
/plugin marketplace add eduardocruz/throughline
/plugin install throughline@eduardocruz
```

## Use

```
/throughline:snapshot    # diagnose this repo — 10 checks, ~5 seconds
/throughline:init        # create .throughline/ and fill in the first entries
/throughline:check       # is the context still true, or has it gone stale?
```

## What each one does

**`/throughline:snapshot`** runs a closed catalogue of ten checks against your
repository and reports the five most severe findings, each with a real file and
line. The checks are not generic best practices — they are the ten findings that
repeated most often across real engagements:

| Check | Catches |
|---|---|
| `secrets-never-in-git` | a live key or an untracked-but-unignored `.env` |
| `authz-not-just-auth` | routes taking a resource id with no ownership check |
| `db-migration-discipline` | `migrate:fresh` in a deploy script, tables with no PK |
| `deploy-restart-queue-workers` | queues in use, deploy never restarts the worker |
| `sentry-instrumentation-baseline` | no error reporting, or a DSN hardcoded in source |
| `prod-parity-verification` | deploy with no check that the live route still answers |
| `dependency-eol-watch` | missing lockfile, end-of-life runtime |
| `public-bucket-audit` | object storage configured public |
| `payment-settlement-verification` | payment SDK with no settlement confirmation |
| `ci-quality-gate` | no CI, or CI that runs no formatter/static analysis/tests |

**`/throughline:init`** creates `.throughline/`:

```
.throughline/
├── goals.md        year → quarter → month → one goal for this week
├── guidelines.md   up to 3 rules, each from a real incident
├── decisions.md    what is settled, and why, with a source
└── actions.md      who owes what, and where it came from
```

From then on the bundled skill makes your agent read these before it proposes
work, estimates, or makes a technical call.

**`/throughline:check`** measures whether that context is still true: a week goal
that stopped moving, guidelines unchanged for weeks, decisions recorded without
a source, action items open and static.

## The honest limitation

Nothing updates `.throughline/` except you. The decisions that should land there
happen in email, in Slack, on calls, in pull requests — and none of those write
to your repo. So the files are accurate in week one and quietly wrong by week
four, which is worse than empty: stale context makes an agent *confidently*
wrong.

`/throughline:check` exists to show you exactly when that has happened. Fixing it
by hand works. [Hosted Throughline](https://eduardocruz.com/throughline) is the
version where those channels feed the directory themselves — it is invite-only,
and the local tier does not expire or degrade without it.

## Privacy

Everything runs locally: the snapshot reads your files but never uploads them,
and no finding, path, or file name leaves your machine.

The one network call is an anonymous usage ping — and this is its entire payload:

```json
{"event": "snapshot", "repo_hash": "a1b2c3d4e5f60718",
 "plugin_version": "0.1.0", "ts": "2026-08-12T14:00:00Z"}
```

`repo_hash` is a truncated SHA-256 of your git remote URL. It lets us count
repositories without knowing which they are.

Turn it off completely:

```
export THROUGHLINE_TELEMETRY=0
```

## Requirements

None. Claude Code already requires Node 22+, so the runtime is guaranteed to
be there — and the plugin adds no dependencies of its own.

## Licence

MIT.
