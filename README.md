# Pathfinder Tools

Printable card builders for Pathfinder 2nd Edition. Each tool is a single HTML
file — no server, and no build step except the initiative cards (see below). Shared pieces: `fonts.css` + `fonts/` (the
typefaces, also fetched by the PDF exporter) and jsPDF from a CDN for PDF export.

| Page | What it does |
|---|---|
| `index.html` | Landing page linking to the tools |
| `item-cards.html` | Item card builder — 4×5in cards, library, PDF sheet export |
| `feat-cards.html` | Feat card builder — 4×5in cards with prerequisites, action cost, Grants rows (skills, spells, proficiencies…), actions, Special; import by name from Demiplane or pasted from AoN/Demiplane |
| `initiative-cards.html` | Creature / NPC initiative card builder |
| `hazard-cards.html` | Trap / environmental hazard / haunt card builder |
| `fonts.css`, `fonts/` | Typefaces standing in for Paizo's: Eczar (titles), Teko (subheads), Tauri (small headers), EB Garamond (body). Subsetted `.woff` for the pages, `.ttf` twins for the PDF exporter. All SIL OFL; licenses in `fonts/licenses/`. |
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

## Where data lives

Each tool keeps its card library in the browser's `localStorage`, so it is
per device and per browser. Clearing site data clears the library. Export a
PDF to keep a durable copy of your cards.

The tools were originally built as Claude artifacts and still detect the
artifact runtime (`window.claude`) — when present they use its shared database
and asset store instead of `localStorage`. Outside of claude.ai that branch is
simply skipped.
