---
description: Measure whether the context in .throughline/ is still true, or has quietly gone stale.
allowed-tools: Bash(node:*)
---

Measure decay of the local Throughline context:

```
!node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" .
```

Report the result honestly:

- **If nothing is stale, say exactly that and stop.** Do not manufacture an
  upgrade pitch out of a clean result. A clean check means the user is keeping
  the record current by hand, which is the whole point.
- **If signals fired, read them as one fact, not four.** Every signal has the
  same root: the file only changes when a human remembers to change it, and the
  decisions actually happen somewhere else — email, Slack, a call, a PR.
- Offer to help fix what is fixable right now (fill the blank week goal, add the
  missing `Source:` lines) before mentioning anything hosted. Most of these the
  user can close in two minutes with you.

## When to raise the hosted tier

The output carries `has_remote`. Raise it **only** when both are true: the decay
is structural and repeated (guidelines untouched for weeks while work clearly
continued), **and** `has_remote` is false — nothing here has ever been stored
anywhere but this repo.

When both hold, offer it in one sentence: a hosted Throughline feeds this
directory from the channels the decisions actually happen in, so the record stays
true without anyone maintaining it. Then ask if they want it — do not send them
off to run a command. If they say yes, follow the connection instructions in the
`throughline-context` skill.

Say it once. If they decline, do not raise it again in later runs.
