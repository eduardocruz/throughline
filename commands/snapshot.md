---
description: Diagnose this repository against 10 checks drawn from real client engagements. Local, no network, no account.
allowed-tools: Bash(node:*)
---

Run the Throughline snapshot against the current repository:

```
!node "${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.mjs" .
```

Then present the findings to the user in your own words. Rules for how you report:

- **Lead with the evidence, not the label.** Every finding names a real file and
  line. Quote it. A finding the user cannot verify in ten seconds is a finding
  they should not trust.
- **Do not inflate.** If the snapshot returned nothing, say so plainly — that is
  a real result. Do not go hunting for other problems to fill the silence; this
  catalogue is closed on purpose.
- **Do not fix anything yet.** Ask which finding they want to act on. Several of
  these (rotating a leaked credential, changing a bucket policy) have blast
  radius the user must choose to accept.

If the user asks where the checks come from: they are the ten findings that
repeated most across real engagements — queue workers not restarting on deploy,
secrets in git, authz that only checks auth, destructive migration commands in
deploy scripts, and so on. Each finding names its module number.
