# Pathfinder Tools

Printable card builders for Pathfinder 2nd Edition. Each tool is a single HTML
file — no server, and no build step except the initiative cards (see below). Shared pieces: `fonts.css` + `fonts/` (the
typefaces, also fetched by the PDF exporter) and jsPDF from a CDN for PDF export.

| Page | What it does |
|---|---|
| `index.html` | Landing page (Slappybag's Toolbag): the three-step workflow and links to the tools |
| `item-cards.html` | Item card builder — 4×5in cards, library, PDF sheet export |
| `feat-cards.html` | Feat card builder — 4×5in cards with prerequisites, action cost, Grants rows (skills, spells, proficiencies…), actions, Special; import by name from Demiplane or pasted from AoN/Demiplane |
| `initiative-cards.html` | Creature / NPC initiative card builder |
| `spell-cards.html` | Spell card builder — spells, cantrips, focus spells and rituals on 4×5in cards: traditions, cast, range, area, targets, defense, duration, Heightened rows; import by name from Demiplane or pasted from AoN/Demiplane. Built from the feat card page (same layout and PDF drawing), violet accent. Edit it directly. |
| `session-prep.html` | **Next Session**: saved sessions, each with a booklet (recap, read-aloud intro, scene-by-scene plan with beats and checks picked out) and picks from every card library (PCs, NPCs, creatures, hazards, loot with PC assignment, spells, feats, locations), details pages and full stat blocks. Every tab lists its library with search and filters (trait, level, sort, in-docket only); **All libraries** lists every card from every tool with type chips. ＋ on a card adds it to the **print docket**, the pull-down at the top, which lists everything that will print, in print order, with Print preview and Save PDF. The PDF is one file: booklet → stat blocks → initiative cards → hazard cards → item / spell / feat cards → quick cards and details pages. |
| `hazard-cards.html` | Trap / environmental hazard / haunt card builder |
| `toolbag-core.js` | Shared helpers every tool page loads first: text fitting, debounced saves, the IndexedDB store, PDF picture encoding, the pinned jsPDF version, and the shared UI — tooltips (`TIPS`), the ? Help panel (`HELP`), the first-visit hint. Tooltip and help wording lives here, once, for all four tools. The artifact builds inline it. |
| `fonts.css`, `fonts/` | Typefaces standing in for Paizo's: Eczar (titles), Teko (subheads), Tauri (small headers), EB Garamond (body). Subsetted `.woff` for the pages, `.ttf` twins for the PDF exporter (also subset: same characters, layout tables and hinting dropped). All SIL OFL; licenses in `fonts/licenses/`. |
| `src/initiative-cards/` | Source of `initiative-cards.html` — don't edit the built page. Edit the parts and run `bash src/initiative-cards/build.sh` (site page) or `bash src/initiative-cards/build.sh artifact` (the claude.ai artifact copy, with the fonts embedded). |
| `src/item-cards/build-artifact.sh` | Builds the claude.ai artifact copy of `item-cards.html` (typefaces embedded, no Toolbag nav) into `src/item-cards/artifact.html`. The item page has no parts — edit it directly, then rebuild. |
| `src/feat-cards/build-artifact.sh` | Same for `feat-cards.html` → `src/feat-cards/artifact.html`. |
| `src/hazard-cards/` | Source of `hazard-cards.html` — same drill: edit the parts, run `bash src/hazard-cards/build.sh` (or `... artifact`). Prints hazards, not creatures — Stealth/Disable DCs and a routine of triggered actions in place of Perception/skills/speed, and its sheet is printed via the browser's own Print dialog rather than a PDF exporter. |

## Running locally

Open `index.html` in a browser. That's it.

## Hosting (GitHub Pages)

1. Push this folder to a GitHub repository.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.

Netlify, Cloudflare Pages, or any static host works the same way — there is
nothing to build.

## How Next Session prints the tools' cards

Each tool page registers `TBExport` (`TB.exportApi` in `toolbag-core.js`): `TBExport.pdf(ids)` lays those
library cards out on the tool's own print sheet and returns what its Print button makes — a PDF Blob, or for
the hazard cards (which print through the browser) one JPEG per letter page, drawn from the sheet's HTML
through an SVG `foreignObject` (`TB.rasterPages`; Chrome/Edge/Firefox — Safari refuses, and the PDF then
notes the hazard part failed). Next Session loads each tool in a hidden frame, asks it, copies the bytes
out before removing the frame, and joins everything with pdf-lib 1.17.1 (jsDelivr, SRI-pinned). Without
pdf-lib the parts are saved as separate PDFs. The booklet, stat blocks, quick cards and details pages are
drawn in the page itself with jsPDF in the site typefaces.

Imports in Initiative Cards and Hazard Cards now keep the whole pasted / fetched stat block on the card
(`block`), which Next Session prints as the full stat block. Older creature cards with a Demiplane link can
fetch it on their details page.

## Where data lives

Next Session keeps its sessions, quick cards, details pages and edited stat blocks under `ns-v3` in the same store (Back up / Restore in its panel writes and reads a JSON file); the old single-session key `pf2-prep-cards-v2` is read once and becomes Session 1.

Each tool keeps its card library in the browser's IndexedDB (`TB.store` in
`toolbag-core.js`, database `toolbag`, one key per tool), so it is per device
and per browser. Clearing site data clears the library. Export a PDF to keep a
durable copy of your cards. The editor draft's text stays in `localStorage`;
its picture goes to IndexedDB under `<draft key>.pic`, written only when it
changes. Libraries saved by older versions in `localStorage` move across on
first load. Where IndexedDB is unavailable, everything falls back to
`localStorage` as before.

The tools were originally built as Claude artifacts and still detect the
artifact runtime (`window.claude`) — when present they use its shared database
and asset store instead of `localStorage`. Outside of claude.ai that branch is
simply skipped.

Signed in with Google (the "Sign in to sync" button in Options), the library
lives in Firebase instead: cards in Firestore under `users/{uid}/creatures` and
`users/{uid}/items`, art in Storage at the same path. `cloud.js` is that third
mode; `firebase-config.js` holds the project settings and, while it is `null`,
the button never appears. The free cap (4 creatures + 4 items synced; local is
unlimited) is enforced by `firestore.rules` through per-user counters, and a
`plan` field on the user record picks the limit. Deploy the rules with
`firebase deploy --only firestore:rules,storage` and set the bucket CORS with
`gsutil cors set cors.json gs://<bucket>` so cloud art can reach the PDF canvas.
