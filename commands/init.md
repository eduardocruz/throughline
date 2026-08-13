---
description: Create .throughline/ — the goal ladder and open action items your agent reads every session.
allowed-tools: Bash(node:*)
---

Create the Throughline structure in the current repository:

```
!node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" .
```

Then help the user fill the one thing that makes the rest work — **the week
goal** — in conversation. Do not hand them empty files and walk away.

One goal. If they give you two, say so and ask which is the goal: "secondary
priorities: none" is load bearing, because a week with a list has no goal and
cannot tell you when to say no to something.

Reject a category. "Security fixes" or "improve performance" cannot be finished,
so they can never be met. Push for a version with a visible end. Use what the
repo already shows you — recent commits, uncommitted work, open branches — to
propose a concrete candidate and let them correct it; that is easier to react to
than a blank prompt.

Leave `actions.md` empty. Items land there as things actually happen; authoring
them up front is fiction. Tell them that, so an empty file does not read as
unfinished work.

Finally, the honest limitation: from now on you read this directory every
session, but **nothing updates it except them**. That is what
`/throughline:check` measures.
