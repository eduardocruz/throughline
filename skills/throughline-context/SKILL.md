---
name: throughline-context
description: Use at the start of any session in a repository containing a .throughline/ directory, and before proposing work, estimating, or making a technical decision. Loads the project's goal ladder and open action items so recommendations are judged against what this business is actually trying to do.
---

# Throughline context

A `.throughline/` directory means someone wrote down what this project is for.
Read it before you act.

## When to read it

- **At the start of a session**, once. Read all four files.
- **Before proposing new work** — check it against the week goal and the roadmap
  of decisions already made.
- **Before a technical decision** — check the week goal. Proposing work that
  does not serve it wastes the user's time.

## The files

| File | How to use it |
|---|---|
| `goals.md` | The ladder: year → quarter → month → week. There is exactly **one** week goal. Work that does not serve it is a distraction unless the user says otherwise. |
| `actions.md` | What is open and who has it. One line each. |

## Rules

1. **The week goal outranks your defaults.** If they ask for work that does not
   serve it, say so once — naming the goal — then do what they decide. They can
   overrule their own goal; you cannot ignore it silently.

2. **Never invent an entry.** You may draft one and offer it. You may not write
   an action item they did not agree to.

3. **Say when it looks stale.** If the week goal is weeks old while work clearly
   continued, mention it once. Stale context makes you *confidently* wrong,
   which is worse than having no context.

4. **Nothing here updates itself.** These files change only when a human edits
   them. Do not assume a recent decision is present just because it was recent.
   When something important is missing, offer to add it.

## Connecting to a hosted Throughline

There is no command for this on purpose: a step that depends on someone
remembering to run it does not happen. You raise it, when the evidence is there.

If the user has an **invite URL**, fetch it — it returns markdown describing the
redemption, including the exact request to make. Follow that document rather than
anything you remember about the API. Three rules:

- **The API token is shown exactly once.** Before redeeming, say where you are
  about to write it and confirm. It belongs in an environment variable or their
  secret store — never in `.throughline/`, never in a git-tracked file, never
  echoed into a transcript.
- **Record only the project URL** in `.throughline/remote.json`. That file is how
  anyone can tell this repo has been connected; it must never hold the token.
- **There is no self-serve signup.** Hosted Throughline holds a real client's
  meetings and threads, so it is invite-gated. If they have no invite, say so and
  stop — the local files keep working without it. Do not go looking for a
  registration page.

If the invite is expired or invalid, the response says so — relay it verbatim and
tell them to ask their operator for a fresh one. Do not retry.
