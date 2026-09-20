---
name: deploy
description: Publish the current state of the Pathfinder Tools site to GitHub Pages — commit any changes, push to main, and confirm the live site updated. Run this automatically after finishing any change to the site; the user does not need to ask. Also use when the user says "deploy", "push the site", "publish my changes", or "update the website".
---

# Deploy Pathfinder Tools to GitHub Pages

The site is served straight from the `main` branch of
`aamoreland87-dot/Slappybag-s-Toolbag-for-TTRPG-Enjoyers`; pushing IS deploying.
Live URL: https://aamoreland87-dot.github.io/Slappybag-s-Toolbag-for-TTRPG-Enjoyers/

**Policy (set by the user 2026-09-20):** after completing a site change, deploy
without asking. Every push is a permanent snapshot in GitHub's history, so any
deploy can be undone with `/rollback` — no separate backup step is needed.

## Steps

1. **See what changed.** Run `git status --short` and `git diff --stat`. If nothing
   is changed and `git status -sb` shows nothing ahead of `origin/main`, tell the user
   the site is already up to date and stop.

2. **Sanity-check HTML edits.** For any changed `.html` file, confirm it still starts
   with `<!doctype html>` and ends with `</body></html>`. Don't run a build — there
   isn't one.

3. **Commit.** Stage everything with `git add -A` (the `.gitignore` already excludes
   `desktop.ini` and preview logs). Write a one-line commit message describing the
   change in plain words (e.g. `Add Bulk field to item cards`). If the user gave a
   message, use theirs. End the message with the attribution line from the session's
   system reminder if one is present.

4. **Push.** `git push origin main`. Credentials are stored on this machine; no prompt
   is expected. If the push is rejected as non-fast-forward, run `git pull --rebase
   origin main` and push again — never force-push.

5. **Confirm it's live.** Poll the live URL of each changed page with
   `curl -s -o /dev/null -w '%{size_download}' "$URL?v=$RANDOM"` every 10 s for up
   to 2 minutes until the size matches the committed blob: `git cat-file -s HEAD:<file>`.
   Compare against the blob, not the working file — git stores LF endings but checks
   out CRLF on Windows, so `wc -c` on the local file is always larger than what
   GitHub serves. Pages builds usually finish in 20–60 s.

6. **Report.** One short block: the commit hash and message, the direct link to each
   page that changed. If the poll timed out, say so
   and suggest checking the repo's **Actions** tab for the `pages-build-deployment`
   run. Remind the user to hard-refresh (Ctrl+Shift+R) if they have the page open.

## Notes

- Files map 1:1 to URLs: `item-cards.html` → `/item-cards.html`. A new HTML file is
  live at its filename with no other setup; add a link to it in `index.html` and in
  the tool-switch dropdown (`<ul class="menu">`) of every existing tool page.
- The user's card libraries live in browser `localStorage`, not in the repo — a deploy
  never touches them.
- To undo a deploy, use `/rollback`.
