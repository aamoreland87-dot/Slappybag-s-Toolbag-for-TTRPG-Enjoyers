#!/usr/bin/env bash
# Builds the Initiative Cards tool from the parts in this folder.
#
#   ./src/initiative-cards/build.sh          → initiative-cards.html   (the site page: fonts.css + Toolbag nav)
#   ./src/initiative-cards/build.sh artifact → src/initiative-cards/artifact.html
#                                              (the claude.ai artifact: one file, typefaces embedded)
#
# Parts: card.css (the card and print sheet), app.css (editor chrome), body.html (markup), app.js.
# The two outputs differ only in how the typefaces arrive and in the nav, marked in body.html with
# <!-- site-only --> … <!-- /site-only --> and <!-- artifact-only … -->.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
target="${1:-site}"

b64(){ base64 -w0 "$1"; }

# @font-face with the files inlined, for the artifact (which can't load files beside itself)
embedded_fonts_css(){
  while IFS= read -r line; do
    if [[ "$line" =~ url\(fonts/([^\)]+)\.woff\) ]]; then
      f="${BASH_REMATCH[1]}"
      line="${line//url(fonts\/$f.woff)/url(data:font/woff;base64,$(b64 "$root/fonts/$f.woff"))}"
    fi
    printf '%s\n' "$line"
  done < "$root/fonts.css"
}

if [ "$target" = "artifact" ]; then
  out="$here/artifact.html"
  {
    echo '<title>Initiative Cards</title>'
    echo '<style id="cardCss">'
    embedded_fonts_css
    cat "$here/card.css"
    echo '</style>'
    echo '<style>'; cat "$here/app.css"; echo '</style>'
    # drop the site nav, restore the plain title
    sed -e '/<!-- site-only -->/,/<!-- \/site-only -->/d' -e 's|<!-- artifact-only \(.*\) -->|\1|' "$here/body.html"
    # TrueType twins for jsPDF
    printf '<script type="application/json" id="pdfFonts">{'
    printf '"body":"%s",' "$(b64 "$root/fonts/ebgaramond-400.ttf")"
    printf '"bodyBold":"%s",' "$(b64 "$root/fonts/ebgaramond-600.ttf")"
    printf '"title":"%s",' "$(b64 "$root/fonts/eczar-700.ttf")"
    printf '"sub":"%s",' "$(b64 "$root/fonts/teko-700.ttf")"
    printf '"caps":"%s"' "$(b64 "$root/fonts/tauri-400.ttf")"
    echo '}</script>'
    echo '<script>'; cat "$here/traits.js" "$here/app.js"; echo '</script>'
  } > "$out"
else
  out="$root/initiative-cards.html"
  {
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Initiative Cards</title><link rel="stylesheet" href="fonts.css"><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>'
    echo '<style id="cardCss">'; cat "$here/card.css"; echo '</style>'
    echo '<style>'; cat "$here/app.css"; echo '</style>'
    sed -e '/<!-- artifact-only /d' -e '/<!-- \/\?site-only -->/d' "$here/body.html"
    echo '<script src="firebase-config.js"></script><script src="cloud.js"></script>'
    echo '<script>'; cat "$here/traits.js" "$here/app.js"; echo '</script>'
    echo '</body></html>'
  } > "$out"
fi
printf '%s  %s bytes\n' "$out" "$(wc -c < "$out")"
