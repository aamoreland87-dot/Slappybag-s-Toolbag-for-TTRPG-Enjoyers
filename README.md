# Pathfinder Tools

Printable card builders for Pathfinder 2nd Edition. Each tool is a single
self-contained HTML file — no build step, no server, no dependencies beyond
a browser (PDF export loads jsPDF from a CDN).

| Page | What it does |
|---|---|
| `index.html` | Landing page linking to the tools |
| `item-cards.html` | Item card builder — 4×5in cards, library, PDF sheet export |
| `initiative-cards.html` | Creature / NPC initiative card builder |

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
