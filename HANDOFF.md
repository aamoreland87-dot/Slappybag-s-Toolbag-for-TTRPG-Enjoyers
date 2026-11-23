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

**The claude.ai artifacts** (kept for their synced libraries). Since 2026-09-25 all three are built
from the site sources on `main` and republished whenever the user asks them to match:
- Initiative Cards — https://claude.ai/artifact/UEWvCUM2xWWmtdoP2aBpP2 — `src/initiative-cards/build.sh artifact`.
  Holds 4 creatures with art in its `db`/`assets`. Import there queues a link and pings Claude.
- PF2E Item Generator — https://claude.ai/artifact/DYFN4NWai9Cq8YMJ5rt9Qq — `src/item-cards/build-artifact.sh`,
  then copy to `G:\My Drive\TTRPGs\Pathfinder\Gatewalkers\Items\.sync\app.html` and publish that
  (an hourly job mirrors its library to 4×5 PDFs using the card code it lifts out of that file).
- Hazard Cards — https://claude.ai/artifact/LMxUYsTeuiDPHyHSyqk193 — `src/hazard-cards/build.sh artifact`.
- Feat Cards — https://claude.ai/artifact/8H9F6XhrkDcPrwhxqu2Rq2 — `src/feat-cards/build-artifact.sh`, publish with that `url`. Capabilities db (`cards`) + assets + downloads. Import fetches from Demiplane only on the site; the artifact is paste-only.
  Library is per-browser (no db) for now, same as the site.
The site is still the product; the artifacts follow it.

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

## 2026-11 review, batch 2 (speed + storage)

- `toolbag-core.js` is the start of the shared code (see the review doc's Batch 3). All four pages load
  it; all four artifact builds inline it.
- Typing re-fits once per animation frame and writes the draft 400 ms after typing pauses (flushed on
  `pagehide` / tab hidden). Text fitting is a binary search over the same size steps as before
  (`TB.firstFit`), checked to give identical sizes.
- Local libraries and draft pictures live in IndexedDB; see README "Where data lives".
- jsPDF 4.2.1 from cdnjs with an `integrity` hash (`TB.JSPDF`; hash checked against the v4.2.1 tag's
  `dist/jspdf.umd.min.js`). Opaque pictures go into PDFs as JPEG, transparent ones as PNG.
- The site now shows **Save as PDF** (`TB.downloads`); before, the button only appeared in the artifact.
- PDF `.ttf` fonts subset with `pyftsubset --unicodes='*' --layout-features='' --no-hinting`: same
  characters and widths, ~720 KB → ~190 KB; PDFs render pixel-identical.

## 2026-11 review, batch 3 (UI standardization)

- Same toolbar wording on all four tools: Editor · Library · Print sheet; Select all / Select none;
  "Print / PDF" (hazard: "Print", it uses the browser dialog); "Show empty fields"; "Remove background";
  "Saved on this device"; "Fill card from text"; the Imm / Res / Weak panel heading spelled out.
- Tooltips: any `data-tip` or `title` shows on hover, keyboard focus and long-press. Copy for the shared
  controls is the `TIPS` map in `toolbag-core.js` (keyed by selector; per-tool wording via `TB.tool`).
- A **?** button (injected into the toolbar) opens a Help side panel; a dismissible "New here?" strip shows
  once per tool (`tb-intro-<tool>` in localStorage).
- Landing page renamed Slappybag's Toolbag, with the three steps, PF2e tags, and a theme switch.
- Not done: item cards still have no Import (there's no item importer yet).

## Open items / gotchas

- `item-cards.html` should eventually get the same `src/` + build treatment as the
  initiative cards (single source, artifact build optional).
- Demiplane data has typos (e.g. `Stealth+ 23`); the parser tolerates sign/space splits.
- Teko renders small for its em: captions are set at size × 1.25 in CSS and in the PDF.
- The desktop app's preview server picks port from `.claude/launch.json`; 8765 was OS-reserved
  on this machine, hence 8741.
- Claude-side memory files (in the user's Claude memory) hold the same policies plus the
  Demiplane/AoN API notes; this file is the repo's copy.

## 2026-11-21: audit, one paste reader, picture finder

- `tb-parse.js`: one reader for every paste; each tool's own parser now reads the cleaned text, and a paste for
  another tool is offered there. Home page has Paste anything. Item cards got an importer (they had none).
- Hazard parser fixed for Archives of Nethys pastes ("Hidden Pit Hazard 0" on one line, `[reaction]` icons,
  "Trigger …. Effect …", immunities running into the next line).
- Item cards no longer save one-line fields in the capitals the CSS shows (innerText → textContent, as feats do).
- Feat cards: Area and Defense lines with pickers under the card; source line (book and page) bottom right.
  Spell cards got the source line too.
- `tb-images.js`: the picture finder; credits print under the cards with the ORC notice (`TB.pdfFooters`).
  Hazard sheets print through the browser and don't carry the footer yet.
- Cloud: feat and spell cards were set to sync into `items`; now `feats` / `spells`, rules updated (still off).
- The hourly Drive mirror of the item library described above no longer exists as a scheduled task.
- Full findings: the Project doc `claude/code-audit-2026-11.md`.

## 2026-11-22: one engine for every card tool

- Saving, the library, drafts, picture loading and the PDF print pass now live once in `toolbag-core.js`
  (`TB.library`, `TB.saveToLibrary`, `TB.saveDraft`, `TB.img.read`, `TB.pdf.sheet`). The five tools call them;
  their own code is now only the card (about 1,400 duplicated lines gone).
- Every tool loads `cloud.js` and has an account slot (hazards included, kind `hazards`). Cloud sync is kept for
  a possible paid tier with unlimited storage; it stays off until `firebase-config.js` is filled in.
- The hazard and item readers moved into `tb-parse.js` (`TB.cards.hazard`, `TB.cards.item`).
- Demiplane import stays on for creatures and NPCs.
- Hazards still print through the browser sheet; a jsPDF `drawCard` for hazards would put them on `TB.pdf.sheet`
  too (and fix Safari).
