#!/usr/bin/env bash
# Builds the claude.ai artifact copy of the Item Cards tool from the site page.
#
#   ./src/item-cards/build-artifact.sh → src/item-cards/artifact.html
#
# item-cards.html is its own source (there are no parts to assemble). The artifact copy differs
# only in what an artifact can't do: it can't load files beside itself, so the typefaces are
# embedded in #cardCss and the PDF exporter's TrueType twins ride along in #pdfFonts; and it has
# no Toolbag to go back to, so the nav becomes a plain title. claude.ai supplies the doctype,
# head and body around it.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
page="$root/item-cards.html"
out="$here/artifact.html"

b64(){ base64 -w0 "$1"; }

# fonts.css with the files inlined (every url(fonts/x.woff) on a line becomes a data: URL)
embedded_fonts_css(){
  while IFS= read -r line; do
    while [[ "$line" =~ url\(fonts/([^\)]+)\.woff\) ]]; do
      f="${BASH_REMATCH[1]}"
      line="${line//url(fonts\/$f.woff)/url(data:font/woff;base64,$(b64 "$root/fonts/$f.woff"))}"
    done
    printf '%s\n' "$line"
  done < "$root/fonts.css"
}

pdf_fonts(){
  printf '<script type="application/json" id="pdfFonts">{'
  printf '"body":"%s",' "$(b64 "$root/fonts/ebgaramond-400.ttf")"
  printf '"bodyBold":"%s",' "$(b64 "$root/fonts/ebgaramond-600.ttf")"
  printf '"bodyItalic":"%s",' "$(b64 "$root/fonts/ebgaramond-400i.ttf")"
  printf '"bodyBoldItalic":"%s",' "$(b64 "$root/fonts/ebgaramond-600.ttf")"
  printf '"title":"%s",' "$(b64 "$root/fonts/eczar-700.ttf")"
  printf '"sub":"%s",' "$(b64 "$root/fonts/teko-700.ttf")"
  printf '"caps":"%s"' "$(b64 "$root/fonts/tauri-400.ttf")"
  echo '}</script>'
}

title="$(grep -o '<title>[^<]*</title>' "$page" | head -1)"
{
  echo "$title"
  pdf_fonts
  # line 1 is the site's <!doctype…><head>…<body>; the last line closes body and html
  tr -d '\r' < "$page" | sed -e '1d' -e '$s#</body></html>##' | while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ "$line" == '<style id="cardCss">' ]]; then embedded_fonts_css; fi
  done | sed -e '/<nav class="toolbag"/,/<\/nav>/c\    <h1>Item Cards <span class="sub">\&middot; PF2e</span></h1>'
} > "$out"
printf '%s  %s bytes\n' "$out" "$(wc -c < "$out")"
