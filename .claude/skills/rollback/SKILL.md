---
name: rollback
description: Undo the last deploy of the Pathfinder Tools site (or go back to any earlier version) using GitHub's history, and push it live again. Use when the user says "roll back", "revert", "undo that deploy", "go back to the previous version", or reports that the site broke after a change.
---

# Roll back the Pathfinder Tools site

Every deploy is a commit on `main`, and GitHub keeps all of them. Rolling back means
picking an earlier version from that history and pushing it live again — no files
to dig up, nothing to unzip.

## Steps

1. **Show the recent deploys** so the user can pick a target:
   `git fetch -q origin && git log --oneline --date=short --format='%h  %ad  %s' -10 origin/main`
   The top line is what is live now. If the user just said "roll back", the target is
   the line below it (the previous deploy). If they named a date or feature, match it
   against the messages.

2. **Confirm the target in one line** ("Rolling back to `1a76426` — *Add PF2E item
   and initiative card builders* — is that the one?") and wait for a yes. Rolling
   back is itself a deploy that changes the live site.

3. **Revert by adding history, never by rewriting it.** To undo only the latest
   deploy:
   `git revert --no-edit HEAD`
   To return the site to how it was at an older commit `<hash>`:
   `git revert --no-edit <hash>..HEAD`
   (undoes every commit after `<hash>`, newest first, each as its own revert).
   If a revert reports a conflict, stop, run `git revert --abort`, and show the user
   the conflicting files instead of guessing. Never `git reset --hard` on `main` and
   never force-push — those would erase the history that makes rollback possible.

4. **Deploy the revert** by following the `/deploy` skill from its Push step onward.
   The rollback becomes a new commit, so it can itself be undone the same way.

5. **Report** the commit now live and what it restored. Then ask whether the user
   wants the reverted change fixed and re-applied — the original work is still in
   history (`git revert <the revert commit>` brings it back).
