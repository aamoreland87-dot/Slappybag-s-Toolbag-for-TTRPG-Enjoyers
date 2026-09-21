# Slappybag's Toolbag — handoff

State of the project as of 2026-09-20, and the direction agreed for turning it from a
personal GM tool into a product. Written for whoever picks this up next (human or Claude).

## What exists

**The site** — https://aamoreland87-dot.github.io/Slappybag-s-Toolbag-for-TTRPG-Enjoyers/
GitHub Pages, served straight from `main` of `aamoreland87-dot/Slappybag-s-Toolbag-for-TTRPG-Enjoyers`.
No build server; pushing is deploying (`.claude/skills/deploy`, `/rollback` to undo).

| Page | Notes |
|---|---|
| `index.html` | Landing page linking the tools |
| `item-cards.html` | PF2e item cards, 4×5 in. Edited directly — it is its own source. |
| `initiative-cards.html` | Creature initiative cards, 2.6×7.8 in tent-fold. **Generated** from `src/initiative-cards/` — never edit the built page. `bash src/initiative-cards/build.sh` (site) / `… build.sh artifact` (claude.ai copy). |
| `cloud.js`, `firebase-config.js`, `firestore.rules`, `storage.rules`, `cors.json`, `firebase.json` | Cloud library (see step 1 below). |
| `fonts.css`, `fonts/` | Eczar / Teko / Tauri / EB Garamond, subsetted woff for pages, ttf twins for the PDF exporter (jsPDF from cdnjs). OFL licences in `fonts/licenses/`. |

Card style: black on white with one accent — item cards deep red `#5E1622`, initiative
cards deep blue `#16325E` — Eczar names, Teko captions, Tauri small labels, EB Garamond body.

**Libraries today** live in each browser's `localStorage` (per device). PDF export is the
durable copy.

**The claude.ai artifacts** (older, kept for their synced libraries):
- Initiative Cards — https://claude.ai/artifact/UEWvCUM2xWWmtdoP2aBpP2 — current (v28, same source).
  Holds 4 creatures with art in its `db`/`assets`. Import there queues a link and pings Claude.
- PF2E Item Generator — https://claude.ai/artifact/DYFN4NWai9Cq8YMJ5rt9Qq — **stale** (pre-font,
  one action per type). Its page and the repo's `item-cards.html` have diverged.
Decision: the site is the product; artifacts are not being carried forward unless someone asks.

## Creature import (the feature that makes the site worth using)

- **Demiplane** is read directly from the browser — link or just a creature name. Their GraphQL
  API (`https://apiv4.demiplane.com/v1/graphql`) answers with no login and allows any origin;
  `element_display` is the stat block HTML, `element_image` the official art, served with open
  CORS from `images.demiplane.com/<path>?format=webp&width=900`. Query details in
  `src/initiative-cards/app.js` (`fetchDemiplane`). **Unofficial API** — if it changes, the
  paste-the-page-text import still works and is the fallback.
- **Archives of Nethys** has a structured search API (`elasticsearch.aonprd.com/aon/_search`)
  but it is CORS-locked to its own site; from the page it's paste-text only. AoN has also lost
  most official art, so Demiplane is the better source anyway.
- Recall Knowledge DC is computed (level DC table + rarity; skill from creature-type traits,
  all matching types listed). AoN's printed line is used when pasting an AoN page.

## Working agreement (how the user wants this run)

- Iterate locally: rebuild, look at it in the preview pane (`.claude/launch.json` → `static`
  on :8741). **Do not commit/push after every tweak.** Batch; deploy only when asked
  ("push", "deploy"). Artifacts publish only when asked. Reports: one line.
- Cards store what the user typed; Title Case / abbreviation is applied at print time.
- Watch line endings: repo is autocrlf; `*.sh` forced LF via `.gitattributes`.

## Direction: making it a product

Agreed plan, in order. Steps 1–3 cost nothing to run.

1. **Cloud library (Firebase)** — **built, waiting on the config** (2026-09-20). `cloud.js` is
   the third `Lib` mode (`"cloud"`) on both site pages; `firebase-config.js` is `null` until the
   owner pastes `firebaseConfig`, and until then nothing loads and no button shows. Data model:
   `users/{uid}` = `{plan, creatures, items, last_creatures, last_items}`; cards in
   `users/{uid}/creatures|items/{id}`; one picture per card in Storage at the same path, kept on
   the card as `imageUrl`. Signed out = local library, unchanged; the two libraries are separate
   (no automatic upload of local cards — deliberate, the cap would bite). Import in cloud mode
   behaves like local ("Fill the card"); Send-to-Claude stays artifact-only.
   *Owner to do:* Firebase project (Spark) → enable Google sign-in, Firestore, Storage; add
   `aamoreland87-dot.github.io` (and `localhost`) to Auth → authorized domains; paste the config
   into `firebase-config.js`; `firebase deploy --only firestore:rules,storage` (or paste
   `firestore.rules` / `storage.rules` in the console); `gsutil cors set cors.json gs://<bucket>`
   so cloud art can be drawn to the PDF canvas (without it the PDF just omits the picture).
   *Then test:* sign in, save 4 creatures, the 5th must be refused with the "library is full"
   toast (that's the rules working — the client check is only for the message), delete one,
   save again, art in the PDF. Not yet done: migrating the artifact libraries into the owner's
   account (4 creatures with art in the Initiative Cards artifact).
2. **Free tier cap** — **in `firestore.rules`** (`limitFor`: free 4, pro 500) and mirrored in
   `cloud.js` `LIMITS` for the friendly message. Local: unlimited. A create must arrive in a
   batch that moves the owner's counter by +1 and names the card in `last_<kind>`; the counter
   can only move alongside such a card — so the client can neither exceed the cap nor reset its
   count. 8 was floated as the friendlier number; it's one constant in each file.
3. **`plan` field** — **done**: on the user record, `free` on creation, client may never change
   it; the rules read it to pick the limit. Upgrading is a server-side data change.
4. **Paid tier** (only when there's demand) — Stripe Checkout; a webhook flips `plan` to
   `pro`. The webhook needs Cloud Functions (Blaze plan; still free at this volume but needs a
   card on file). Define lapse behaviour (cards stay, sync freezes at the cap), receipts, a
   support address.
5. **Licensing before charging** — read Paizo's Community Use Policy / ORC terms. Free fan
   tools are clearly fine; a paid product reproducing Paizo text and art has conditions. Also
   note Paizo's `Pathfinder-Icons` font may not be redistributed (action glyphs are SVG here —
   keep it that way).

Scale notes: Firebase free tier ≈ 50k reads/day, 1 GiB Firestore, 5 GB art, **1 GB art
download/day** (the real ceiling — ~3k art views/day at 300 KB each). Hobby-scale is free;
hundreds of daily users → Blaze, a few dollars a month; beyond that, cache art behind a CDN.

Alternative kept in the back pocket: art in each user's own Google Drive (Drive API) —
scales free forever, no live sync, more OAuth friction.

## Open items / gotchas

- `item-cards.html` should eventually get the same `src/` + build treatment as the
  initiative cards (single source, artifact build optional).
- Demiplane data has typos (e.g. `Stealth+ 23`); the parser tolerates sign/space splits.
- Teko renders small for its em: captions are set at size × 1.25 in CSS and in the PDF.
- The desktop app's preview server picks port from `.claude/launch.json`; 8765 was OS-reserved
  on this machine, hence 8741.
- Claude-side memory files (in the user's Claude memory) hold the same policies plus the
  Demiplane/AoN API notes; this file is the repo's copy.
