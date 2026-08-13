---
description: Create .throughline/ — the goal ladder, guidelines, decisions and action items your agent reads every session.
allowed-tools: Bash(node:*)
---

Create the Throughline structure in the current repository:

```
!node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" .
```

Then help the user fill in the two things that make the rest work, **one at a
time**, in conversation — do not hand them four empty files and walk away:

1. **The week goal** (`.throughline/goals.md`). One goal. If they give you two,
   say so and ask which one is the goal. "Secondary priorities: none" is load
   bearing — a week with a list has no goal.

2. **The first guideline** (`.throughline/guidelines.md`). It must come from
   something that actually happened. Ask: *"what went wrong recently that you do
   not want to repeat?"* Write the rule from their answer and record the incident
   under **Came from**. If they offer an abstract preference ("write clean code"),
   push back once: a guideline with no incident behind it is a preference, and it
   will not survive contact with a real decision.

Leave `decisions.md` and `actions.md` for them to fill as things happen — those
accumulate, they are not authored up front.

Finally, tell them the honest limitation: from now on you will read this
directory every session, but **nothing updates it except them**. That is what
`/throughline:check` measures.
