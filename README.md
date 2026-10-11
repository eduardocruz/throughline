# Throughline

**Give your AI agent the context it is missing about your business.**

Your agent knows your code. It does not know what you are trying to do this
week, or what is still open and on whom. Throughline is where that lives — as
markdown files in your repo that your agent reads every session.

Runs entirely on your machine. No account and no signup. Nothing leaves the
repo unless you opt in: to an anonymous usage ping (off until you say yes — see
[Privacy](#privacy)) or by connecting a hosted Throughline yourself.

## Install

```
/plugin marketplace add eduardocruz/marketplace
/plugin install throughline@eduardocruz-marketplace
```

## Use

One command to remember:

```
/throughline:start
```

It reads the state of the repository and takes you from there — a diagnosis
first if you have nothing yet, filling in the week goal if you do, and a staleness report if you are already set up. Nothing is written until
you say so.

The individual steps, if you already know which one you want:

```
/throughline:snapshot    # diagnose this repo — 10 checks, ~5 seconds, writes nothing
/throughline:init        # create .throughline/
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
└── actions.md      what is open, and who has it
```

From then on the bundled skill makes your agent read these before it proposes
work, estimates, or makes a technical call.

**`/throughline:check`** measures whether that context is still true: a week goal
that stopped moving, action items open and static.

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

If you do connect one, the plugin's one hook earns its place: at the start of a
session it pulls the answers to questions your agent asked, appends them to
`.throughline/answers.md`, and tells the agent they arrived. Answers are
acknowledged when they are read, so they are written to disk before anything
else happens — you get them exactly once, and losing them takes a disk error,
not a crashed session.

The hook does nothing at all unless **both** are true: `.throughline/remote.json`
exists in this repo, and the plugin's `throughline_token` option is set (`/plugin` →
Installed → Throughline → **Configure options**; Claude Code masks it and keeps it
in your OS credential store, never in a file). Without
both it exits immediately, prints nothing, and never opens a connection. When it
does run, all it sends is the token and the timestamp of the newest answer you
already have — no file contents, no findings, no paths.

## Privacy

Full policy, covering the usage ping and the hosted service — what is collected,
how it is used and how long it is kept: <https://eduardocruz.com/privacy-policy>.

Everything runs locally: the snapshot reads your files but never uploads them,
and no finding, path, or file name leaves your machine. The one exception is the
hosted tier, and it is opt-in twice over — the answers hook stays silent until
you have both connected the repo and set the `throughline_token` option yourself.

**Nothing is sent anywhere unless you say yes.** There is no ping on install and
none on first run. `/throughline:start` asks once whether you are willing to send
an anonymous usage ping; until you answer yes, the network is never touched. The
answer is stored in `~/.throughline/config.json` and applies to every repository
on this machine. Change your mind at any time:

```
node scripts/consent.mjs off     # or: on, status
export THROUGHLINE_TELEMETRY=0   # overrides a stored yes
```

If you do say yes, this is the entire payload, every time:

```json
{"event": "snapshot", "repo_hash": "a1b2c3d4e5f60718",
 "plugin_version": "0.6.0", "ts": "2026-08-12T14:00:00Z"}
```

`repo_hash` is an HMAC of your git remote URL, keyed with a random secret
generated on your machine that is never transmitted. It is stable across runs,
so it distinguishes "this repo again" from "a new repo" — and because the key
never leaves your machine, the value cannot be matched back to a repository by
anyone holding it, including us. The same repository on someone else's machine
produces a different value.

To be complete about what a network call reveals regardless of payload: like any
HTTP request, it shows your IP address to the receiving server.

## Requirements

None. Claude Code already requires Node 22+, so the runtime is guaranteed to
be there — and the plugin adds no dependencies of its own.

## Licence

MIT.
