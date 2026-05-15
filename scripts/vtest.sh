#!/usr/bin/env bash
# vtest.sh — .docx / .pptx を視覚検証するための render パイプライン
#
# usage:  bash scripts/vtest.sh <input.docx|pptx> [<outdir>]
#
# 入力 .docx / .pptx を:
#   1. LibreOffice headless で PDF に変換
#   2. pdftoppm で各ページ / 各スライドを PNG 化(-r 150 dpi default)
#   3. unzip して word/document.xml(docx)or ppt/slides/*.xml(pptx)を取り出し
#   4. report.md を吐く(レビュー指示テンプレ + ファイル一覧)
#
# 依存:libreoffice-writer / libreoffice-impress / poppler-utils / fonts-noto-cjk
set -euo pipefail
INPUT="${1:?usage: vtest.sh <input.docx|pptx> [<outdir>]}"
OUTDIR="${2:-/tmp/vtest}"
DPI="${VTEST_DPI:-150}"
[ -f "$INPUT" ] || { echo "input not found: $INPUT"; exit 1; }
# 拡張子で kind 判定
EXT="${INPUT##*.}"
EXT="${EXT,,}"  # lowercase
case "$EXT" in
  docx) KIND="docx";;
  pptx) KIND="pptx";;
  *) echo "[vtest] unsupported extension: .$EXT (docx / pptx only)"; exit 4;;
esac
mkdir -p "$OUTDIR"
rm -f "$OUTDIR"/*.pdf "$OUTDIR"/page-*.png "$OUTDIR"/report.md
rm -rf "$OUTDIR/unpacked"
# 1) PDF render
libreoffice --headless --convert-to pdf "$INPUT" --outdir "$OUTDIR" >/dev/null 2>&1 || {
  echo "[vtest] LibreOffice convert failed"; exit 2;
}
PDF="$OUTDIR/$(basename "$INPUT" ".$EXT").pdf"
[ -f "$PDF" ] || { echo "[vtest] PDF not produced"; exit 3; }
# 2) PNG per page / slide
pdftoppm -png -r "$DPI" "$PDF" "$OUTDIR/page" >/dev/null 2>&1
PNG_COUNT=$(ls "$OUTDIR"/page-*.png 2>/dev/null | wc -l)
# 3) unpack docx / pptx
mkdir -p "$OUTDIR/unpacked"
unzip -oq "$INPUT" -d "$OUTDIR/unpacked"
# 4) report
{
  echo "# vtest report — $(basename "$INPUT")  (kind=$KIND)"
  echo
  echo "- input: \`$INPUT\`"
  echo "- pdf:   \`$PDF\`"
  echo "- pages: $PNG_COUNT × @${DPI}dpi"
  if [ "$KIND" = "docx" ]; then
    echo "- xml:   \`$OUTDIR/unpacked/word/document.xml\` / \`$OUTDIR/unpacked/word/styles.xml\`"
  else
    echo "- xml:   \`$OUTDIR/unpacked/ppt/slides/slide*.xml\`"
  fi
  echo
  echo "## PNG list"
  ls "$OUTDIR"/page-*.png 2>/dev/null | sed 's/^/- /'
  echo
  echo "## Review checklist"
  if [ "$KIND" = "docx" ]; then
    echo "1. 見出し階層(第N章 / x.x / x.x.x / (1)(2) / アイウ / a.b.c)"
    echo "2. H1 直後 page break が機能してるか(2 件目以降)"
    echo "3. 表ヘッダーの薄 shading(EEEEEE)"
    echo "4. 画像が実画像として埋め込まれてるか([image: alt] でないか)"
    echo "5. リンク内部=上付き(N)+ appendix、外部=hyperlink"
    echo '6. 水平線 = 罫線(plain text の連続 dash でなく)'
    echo "7. 変数 {{vars.x}} の展開"
    echo "8. PKC 拡張(==mark==, ..em-dot.., [[ruby:b|r]], %%hidden%%)が書式化"
  else
    echo "1. レベル1 = セクション名(扉スライドの大タイトル)"
    echo "2. レベル2 = セクションサブタイトル(扉スライドの小タイトル、同 slide 内)"
    echo "3. レベル3 = スライドタイトル(各 content slide の見出し)"
    echo "4. ページ区切り / 水平線 = スライド境界"
    echo "5. 表 / 画像 / リンク / 変数展開 / PKC 拡張"
    echo "6. 各 slide に title placeholder が定義されているか(ppt/slides/slide*.xml の sp/p:ph type='title' / 'ctrTitle')"
  fi
} > "$OUTDIR/report.md"
echo "[vtest] OK kind=$KIND pages=$PNG_COUNT  see $OUTDIR/report.md"
