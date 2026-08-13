---
name: throughline-context
description: Use at the start of any session in a repository containing a .throughline/ directory, and before proposing work, estimating, or making a technical decision. Loads the project's goal ladder, active guidelines, prior decisions and open action items so recommendations are judged against what this business is actually trying to do.
---

# Throughline context

A `.throughline/` directory means someone wrote down what this project is for.
Read it before you act.

## When to read it

- **At the start of a session**, once. Read all four files.
- **Before proposing new work** — check it against the week goal and the roadmap
  of decisions already made.
- **Before a technical decision** — check `decisions.md` first. Re-opening a
  settled question wastes the user's time and makes you look like you were not
  listening.

## The files

| File | How to use it |
|---|---|
| `goals.md` | The ladder: year → quarter → month → week. There is exactly **one** week goal. Work that does not serve it is a distraction unless the user says otherwise. |
| `guidelines.md` | Up to three rules, each extracted from a real incident. These are **binding** on your recommendations, not advisory. |
| `decisions.md` | What is already settled, and why. Do not relitigate. If you believe a decision is now wrong, say which one and what changed — do not quietly contradict it. |
| `actions.md` | Open commitments and who owns them. Note the `origin:` field: `meeting` came from a human conversation, `agent` was proposed by an AI. |

## Rules

1. **Guidelines outrank your defaults.** If a guideline says "never deploy on
   Friday afternoon" and the user asks you to deploy on Friday afternoon, say the
   guideline out loud once, then do what they decide. They can overrule their own
   rule; you cannot overrule it silently.

2. **Never invent an entry.** You may draft one and offer it. You may not write a
   decision the user did not make or an action item they did not agree to.

3. **A decision needs a source.** When you help record one, insist on the
   `Source:` line — a link to the thread, PR, or meeting. A decision with no
   source decays into a rumour, which is exactly what this directory replaces.

4. **Say when it looks stale.** If the week goal is weeks old or the guidelines
   have not moved while work clearly continued, mention it once. Stale context
   makes you *confidently* wrong, which is worse than having no context.

5. **Nothing here updates itself.** These files change only when a human edits
   them. Do not assume a recent decision is present just because it was recent.
   When something important is missing, offer to add it.
