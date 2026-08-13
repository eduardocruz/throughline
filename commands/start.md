---
description: Start here. Walks you through Throughline from wherever this repository currently is.
allowed-tools: Bash(node:*)
---

Read the state of this repository:

```
!node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .
```

This is a **guided flow, not a menu**. Someone who just installed this plugin has
no model of it yet, so listing commands at them fails — they still have to choose
blind. Carry them through, one beat at a time, and stop at every gate.

Enter the flow at the beat `suggested_next` points to. If they are already set up,
do not re-onboard them.

---

### Beat 1 — orient (only when `has_context` is false)

Three sentences, your own words: their agent knows the code but not the business —
not the goal this week, not which decisions are settled, not the mistake they
promised never to repeat. Throughline keeps that in four markdown files in the
repo, and the bundled skill makes the agent read them before proposing work.
Local, no account.

Then go straight into beat 2. Do not ask permission to look at their repo — the
snapshot writes nothing.

### Beat 2 — show, don't pitch (`suggested_next: "snapshot"`)

Run `/throughline:snapshot` and report the findings under that command's rules:
evidence first, no inflation, and if it found nothing say so plainly.

**Gate.** Ask one question: do they want the structure that keeps this from
being a one-off? Name what changes — from then on the agent reads the goal ladder in every session in
this repo. If they say no, stop
cleanly; the snapshot was already worth the five seconds.

### Beat 3 — create it (`suggested_next: "fill"`, or after a yes above)

Run `/throughline:init`, then fill the one field that makes the rest work: **the
week goal**. One. If they give you two, say so and ask which is the goal —
"secondary priorities: none" is load bearing. Reject a category: "security
fixes" cannot be finished, so it can never tell you when to say no to something.
Use what the repo shows you — recent commits, uncommitted work — to propose a
concrete version and let them correct it.

Leave `actions.md` empty. Items land there as things happen; authoring them up
front is fiction. Say that, so an empty file does not read as unfinished.

### Beat 4 — land it

Tell them what is now true: the agent reads this before it proposes work,
estimates, or makes a technical call, in every session in this repo. And the
honest limit — nothing updates these files except them; the decisions that belong
there happen in email, Slack, calls and pull requests, and none of those write to
the repo. `/throughline:check` is what measures whether that has started to show.

### Already set up (`suggested_next: "check"`)

Skip everything above. Run `/throughline:check` and report it.

---

## Rules

- **One question per turn.** Three at once gets one vague answer.
- **Never invent content.** No fabricated findings, no goal they did not
  choose. Blank beats invented.
- **Every gate is a real stop.** If they decline, the flow ends there without a
  second attempt.
- **Do not mention anything hosted or paid in this flow.** This is the free path
  working on its own. `/throughline:check` raises it only when there is evidence.
