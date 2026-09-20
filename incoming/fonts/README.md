# Font update — toolbag site

Four open-licensed typefaces that approximate the Pathfinder Second Edition
rulebook look. Everything needed is in this folder.

```
fonts/          web-ready font files (woff + ttf)
licenses/       OFL license text, one per family — must ship with the fonts
fonts.css       drop-in @font-face blocks, tokens, and applied styles
```

**Not included, deliberately:** Paizo's `Pathfinder-Icons` font. It's free to
download but its license forbids redistributing the file, and serving it as a
webfont counts as redistribution. If the site renders action symbols, they need
to be SVG or PNG.

---

## Step 1 — generate woff2

The files here are `woff` and `ttf`. `woff2` is roughly 30% smaller and is what
every current browser prefers, but it needs a Brotli encoder that wasn't
available where these were prepared. One command, run in `fonts/`:

```bash
pip install fonttools brotli
for f in *.ttf; do pyftsubset "$f" --unicodes="*" --layout-features='*' \
  --flavor=woff2 --output-file="${f%.ttf}.woff2"; done
```

Or with Google's `woff2_compress` if it's already on the box:

```bash
for f in *.ttf; do woff2_compress "$f"; done
```

`fonts.css` already references the `.woff2` paths first with `.woff` as
fallback, so once the files exist it just works. If you'd rather skip this,
delete the `woff2` `src` lines — `woff` alone is supported everywhere that
matters, you just pay the extra bytes.

## Step 2 — place the files

Copy `fonts/` to `/assets/fonts/` and `licenses/` somewhere that ships with the
build. Adjust the `url()` paths in `fonts.css` if your asset root differs.

The license text genuinely has to travel with the font files — that's the one
hard requirement the OFL imposes. Nothing else about this is restrictive.

## Step 3 — wire it up

Import `fonts.css` before any component styles so the tokens are defined when
components reference them.

Add preloads for the two faces that appear above the fold on essentially every
page — body regular and the title weight. Don't preload the rest; preloading
everything is the same as preloading nothing.

```html
<link rel="preload" href="/assets/fonts/ebgaramond-400.woff2" as="font"
      type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/eczar-700.woff2" as="font"
      type="font/woff2" crossorigin>
```

---

## What's in the box

| File | Family | Weight | woff size |
|---|---|---|---|
| `ebgaramond-400` | EB Garamond | 400 | 72 KB |
| `ebgaramond-400i` | EB Garamond | 400 italic | 81 KB |
| `ebgaramond-600` | EB Garamond | 600 | 78 KB |
| `eczar-400` | Eczar | 400 | 28 KB |
| `eczar-600` | Eczar | 600 | 28 KB |
| `eczar-700` | Eczar | 700 | 28 KB |
| `teko-var` | Teko | 300–700 variable | 22 KB |
| `tauri-400` | Tauri | 400 | 21 KB |

Roles: Eczar for page and section titles, Teko for subheads and stat-block
labels, Tauri for small headers and table headers, EB Garamond for body copy.

Eczar, Teko and EB Garamond were subsetted to Latin and Latin Extended. The
originals carry Devanagari and Greek coverage that this site has no use for —
that's why Eczar dropped from 302 KB to 55 KB. Tauri ships unsubsetted because
it has a Reserved Font Name in its license and it's already small.

EB Garamond is shipped as three static files rather than the variable font. The
variable version plus its separate italic came to 483 KB against 230 KB for the
three statics, and nothing here needs arbitrary weights between 400 and 800.
Teko is the opposite case: its variable file is 22 KB, so it ships variable and
any weight from 300 to 700 is available free.

---

## Three things that will bite you

**No italics exist in Eczar, Teko, or Tauri.** None of the three families has an
italic cut at all, and Tauri additionally has no bold. If CSS asks for one, the
browser synthesizes it by shearing or smearing the glyphs, which looks visibly
wrong. Check the Rendered Fonts panel in dev tools for any "synthetic" flags.
If a design needs emphasis in a subhead, change weight in Teko rather than
reaching for italic.

**Eczar's natural line box is 1.78em.** Its vertical metrics are sized for
Devanagari, which stacks marks well above and below the Latin range. At default
`line-height` your headings will float in enormous gaps. `fonts.css` caps it at
1.15; don't remove that without looking at the result.

**These four fonts disagree sharply about apparent size.** At an identical
`font-size`, EB Garamond's x-height is 0.40em while Tauri's is 0.55em — Tauri
looks nearly 40% bigger. That's why body copy is set at ~19px rather than the
usual 16, and why Tauri is stepped down to 0.9em wherever it sits beside body
text. If you change one of those numbers, change the other.

---

## Checklist

- [ ] woff2 generated, or woff2 `src` lines removed
- [ ] License files ship with the build
- [ ] No synthesized bold or italic anywhere (dev tools → Rendered Fonts)
- [ ] Heading gaps look right — Eczar's line-height cap is doing its job
- [ ] Fallback stacks tested with fonts blocked; layout shouldn't collapse
- [ ] Body measure stays under ~75 characters at desktop widths
- [ ] Old `font-family` declarations removed, not just overridden

## Open questions

1. Are there existing `font-family` declarations scattered through component
   CSS? Consolidating those into the four tokens is the actual work here; the
   font loading is the easy part.
2. Does anything currently render action symbols, and if so is it already
   images rather than a font?
3. Is there a Content Security Policy with a `font-src` directive that needs
   `'self'` added?
