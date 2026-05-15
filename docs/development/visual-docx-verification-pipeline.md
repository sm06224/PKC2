# Visual docx verification pipeline(PR-V23、2026-05-15)

## 動機

User audit(2026-05-14)で「視覚テストせよ、絶対おかしいのが分かるはず」と
指摘された通り、生成 .docx の **実機 render を画像として確認** するループが
欠けていた。XML レベル strict test は「false green」(私の test では opts に
container 直接渡しで動くが、caller が渡してないと動かない)を許す。

User 提案の二段構え:
1. **LibreOffice headless で PDF 化 → pdftoppm で PNG 化 → Claude が画像を Read**
2. **`word/document.xml` + `word/styles.xml` を unzip + 機械的構造検査**

を実装。

## Pipeline

```text
input.docx
  ↓ libreoffice --headless --convert-to pdf
input.pdf
  ↓ pdftoppm -png -r 150
page-N.png  (Claude が Read で読む)

  + 並列:
input.docx
  ↓ unzip → word/document.xml
  ↓ scripts/vtest_struct.py
JSON {headings, tables, images, pageBreaks, hyperlinks, varResidue, pkcExtensionResidue}
```

## 1 コマンド使用

```bash
bash scripts/vtest.sh /path/to/input.docx [/path/to/outdir]
```

出力:
- `<outdir>/<basename>.pdf` — LibreOffice 経由の PDF
- `<outdir>/page-1.png` ... `page-N.png` — pdftoppm @150dpi
- `<outdir>/unpacked/word/document.xml` — unzip した内容
- `<outdir>/report.md` — レビュー checklist + ファイル一覧

構造検査:

```bash
python3 scripts/vtest_struct.py /path/to/unpacked/word
```

JSON 出力例:

```json
{
  "headings": [{"level": 1, "style": "Heading1", "text": "第1章 ..."}],
  "pageBreaks": 3,
  "hyperlinks": 1,
  "tables": [{"rows": 2, "hasHeaderShading": true}],
  "images": {"count": 1, "mediaFiles": ["abc.png"]},
  "varResidue": 0,
  "pkcExtensionResidue": {"mark": 0, "em_dot": 0, "hidden_comment": 0, "ruby": 0}
}
```

## 視覚 checklist(`vtest/report.md` template)

1. 見出し階層(第N章 / x.x / x.x.x / (1)(2) / アイウ / a.b.c)
2. H1 直後 page break が機能してるか(2 件目以降)
3. 表ヘッダーの薄 shading(EEEEEE)
4. 画像が実画像として埋め込まれてるか(`[image: alt]` でないか)
5. リンク内部=上付き(N)+ appendix、外部=hyperlink
6. 水平線 = 罫線(plain text の連続 dash でなく)
7. 変数 `{{vars.x}}` の展開
8. PKC 拡張(`==mark==` / `..em-dot..` / `[[ruby:b|r]]` / `%%hidden%%`)が書式化

## 依存

```bash
sudo apt-get install -y libreoffice-writer poppler-utils fonts-noto-cjk
```

macOS:

```bash
brew install --cask libreoffice
brew install poppler
```

## 制約

- LibreOffice の Word 互換は完全ではない(複雑な表組み、SmartArt、フォント置換
  で Word 本体との微差は残る)
- ページ数が多いとトークン消費線形 → 章単位で分割、または `pdftoppm -f / -l` で
  範囲指定
- フォント未インストール環境で字形ズレ → `fonts-noto-cjk` 等で固定化

## 差分回帰(将来拡張)

- `baseline/` に旧 docx、`current/` に新 docx
- 同 pipeline で PNG 化 → `compare -metric AE` でピクセル差分マスク
- 差分閾値超のページのみ Claude にレビュー = トークン節約 + 回帰検出

## PR-V22 視覚 verification 結果(2026-05-15)

User audit 全項目を **実機画像で確認**:
- ✅ 第1章 / 1.1 / 1.1.1 数字 hierarchy
- ✅ H4 以降は箇条書き化:(1)/(2)/ア/イ/a./b. + indent
- ✅ 変数展開:`{{vars.name}}` → 「田中」、`{{vars.org}}` → 「PKC2」
- ✅ PKC 拡張:==マーカー== 黄色 / ..em-dot.. italic / `[[ruby:漢字|かんじ]]` → 漢字(かんじ) / %%秘密%% drop
- ✅ 表ヘッダー薄 shading、水平線罫線、ordered/bullet/task list、引用 indent
- ✅ pageBreakBefore で H1(第2章、第3章)が新ページ
- ✅ リンク appendix(リンク先一覧、(1) 内部 link → リンク先 エントリー [entry:...])
- ✅ 内部リンク 上付き(1)、外部リンク は hyperlink
