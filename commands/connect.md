---
description: Connect this repository to a hosted Throughline using an invite link, so the context feeds itself.
argument-hint: "[invite URL or token]"
---

The user wants to connect to a hosted Throughline. Invite: $ARGUMENTS

Hosted Throughline is **invite-gated on purpose** — it holds a real client's
meetings, decisions and threads, so there is no self-serve signup and you should
not go looking for one.

Steps:

1. **If no invite was given**, stop and tell the user they need one from their
   operator, and that the local `.throughline/` keeps working without it. Do not
   attempt to register, guess an endpoint, or scrape a signup page.

2. **If an invite URL was given**, fetch it — it returns markdown describing the
   redemption, including the exact request to make. Follow what that document
   says rather than anything you remember about the API.

3. **The API token is shown exactly once** in the redeem response. Before you
   redeem, tell the user where you are about to write it and confirm. It belongs
   in an environment variable or their secret store — **never** in
   `.throughline/`, never in a file that git tracks, never echoed into a
   transcript they might paste somewhere.

4. **After redeeming**, confirm what changed in one line: the hosted Throughline
   now feeds this project's goals, guidelines, decisions and action items, and
   `.throughline/` becomes a mirror rather than something they hand-maintain.

If the invite is expired or invalid the response says so — relay that verbatim
and tell them to ask their operator for a fresh one. Do not retry.
