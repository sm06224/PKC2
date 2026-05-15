#!/usr/bin/env bash
# vtest.sh — .docx を視覚検証するための render パイプライン
#
# usage:  bash scripts/vtest.sh <input.docx> [<outdir>]
#
# 入力 .docx を:
#   1. LibreOffice headless で PDF に変換
#   2. pdftoppm で各ページを PNG 化(-r 150 dpi default)
#   3. unzip して word/document.xml / word/styles.xml を取り出し
#   4. report.md を吐く(レビュー指示テンプレ + ファイル一覧)
#
# 依存:libreoffice-writer / poppler-utils / fonts-noto-cjk
set -euo pipefail
INPUT="${1:?usage: vtest.sh <input.docx> [<outdir>]}"
OUTDIR="${2:-/tmp/vtest}"
DPI="${VTEST_DPI:-150}"
[ -f "$INPUT" ] || { echo "input not found: $INPUT"; exit 1; }
mkdir -p "$OUTDIR"
rm -f "$OUTDIR"/*.pdf "$OUTDIR"/page-*.png "$OUTDIR"/report.md
rm -rf "$OUTDIR/unpacked"
# 1) PDF render
libreoffice --headless --convert-to pdf "$INPUT" --outdir "$OUTDIR" >/dev/null 2>&1 || {
  echo "[vtest] LibreOffice convert failed"; exit 2;
}
PDF="$OUTDIR/$(basename "$INPUT" .docx).pdf"
[ -f "$PDF" ] || { echo "[vtest] PDF not produced"; exit 3; }
# 2) PNG per page
pdftoppm -png -r "$DPI" "$PDF" "$OUTDIR/page" >/dev/null 2>&1
PNG_COUNT=$(ls "$OUTDIR"/page-*.png 2>/dev/null | wc -l)
# 3) unpack docx
mkdir -p "$OUTDIR/unpacked"
unzip -oq "$INPUT" -d "$OUTDIR/unpacked"
# 4) report
{
  echo "# vtest report — $(basename "$INPUT")"
  echo
  echo "- input: \`$INPUT\`"
  echo "- pdf:   \`$PDF\`"
  echo "- pages: $PNG_COUNT × @${DPI}dpi"
  echo "- xml:   \`$OUTDIR/unpacked/word/document.xml\` / \`$OUTDIR/unpacked/word/styles.xml\`"
  echo
  echo "## PNG list"
  ls "$OUTDIR"/page-*.png 2>/dev/null | sed 's/^/- /'
  echo
  echo "## Review checklist"
  echo "1. 見出し階層(第N章 / x.x / x.x.x / (1)(2) / アイウ / a.b.c)"
  echo "2. H1 直後 page break が機能してるか(2 件目以降)"
  echo "3. 表ヘッダーの薄 shading(EEEEEE)"
  echo "4. 画像が実画像として埋め込まれてるか([image: alt] でないか)"
  echo "5. リンク内部=上付き(N)+ appendix、外部=hyperlink"
  echo '6. 水平線 = 罫線(plain text の連続 dash でなく)'
  echo "7. 変数 {{vars.x}} の展開"
  echo "8. PKC 拡張(==mark==, ..em-dot.., [[ruby:b|r]], %%hidden%%)が書式化"
} > "$OUTDIR/report.md"
echo "[vtest] OK pages=$PNG_COUNT  see $OUTDIR/report.md"
