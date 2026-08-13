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

Only if the decay is structural and repeated — guidelines untouched for weeks
while work clearly continued — is it worth naming the hosted tier, which feeds
this directory from those channels automatically. Say it once. Do not repeat it
on later runs.
