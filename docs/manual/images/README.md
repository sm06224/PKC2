# スクリーンショット素材

このディレクトリには、ユーザーマニュアル HTML 版 (`PKC2-Extensions/pkc2-manual.html`) に埋め込まれる画面キャプチャを配置します。

## ファイル一覧

| ファイル | 内容 | サイズ | 出典 |
|---------|------|-------|-----|
| `01_detail-view.png` | Detail ビュー（左サイドバー + 中央本文 + 右メタパネル） | 1400×900 | `PKC2-Extensions/pkc2-manual.html` |
| `02_calendar-view.png` | Calendar ビュー（月カレンダーに期日付き Todo が表示） | 1400×900 | 同上 |
| `03_kanban-view.png` | Kanban ビュー（Todo / Done 2 列構成） | 1400×900 | 同上 |
| `04_entry-editor.png` | テキストエントリ編集画面（エディタ + Markdown プレビュー併走） | 1400×900 | `dist/pkc2.html` |
| `05_export-panel.png` | Data パネル展開状態（Share / Archive / Import の 3 グループ） | 1400×900 | 同上 |
| `06_import-dialog.png` | Data パネルの Import グループをクローズアップした横長ストリップ | 940×80 | 同上 |

## 現状

**v0.1.0 に合わせて実機キャプチャに差し替え済み**（2026-04-14）。プレースホルダーだった 200×150 のベタ塗り PNG はすべて上書きされました。ビルダー (`build/manual-builder.ts`) は PNG ファイルを base64 として単に読み込むため、再ビルドだけで HTML マニュアルに反映されます。

## 撮影方法

ヘッドレス Chromium（Playwright）で `dist/pkc2.html` および `PKC2-Extensions/pkc2-manual.html` を開き、スクリプトで操作しながらキャプチャしました。サンプルデータを含む `pkc2-manual.html` は Detail / Calendar / Kanban の 3 ビュー用、空の `dist/pkc2.html` は編集画面と Data パネル用に使い分けています。

- Viewport: 1400×900（06 のみ横長ストリップ切り抜き）
- deviceScaleFactor: 1
- フォント: システムフォントの IPAGothic（headless 環境）

再生成したいときは監督側で `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node /tmp/capture.cjs` のように同等のスクリプトを回してください。素材の再現性が壊れたら手動差し替えに戻って構いません。

## 差し替え手順（手動の場合）

1. `dist/pkc2.html` をブラウザで開き、各画面を用意する
2. OS の標準スクリーンショット機能で該当の領域をキャプチャ
3. 同じファイル名で `.png` として保存し、このディレクトリに置く
4. `npm run build:manual` を実行
5. `PKC2-Extensions/pkc2-manual.html` をブラウザで開いて確認

推奨サイズは幅 1000〜1400 px。サイズが大きすぎると HTML マニュアルのファイルサイズに響くため、長辺 1400 px 以下を目安にしてください。

## Markdown からの参照

各章の Markdown 本文からは次の形式で参照します。

```markdown
![Detail ビュー](asset:01_detail-view)
```

拡張子は省略します。`asset-resolver.ts` が `container.assets` 内のキーと照合して解決します。

現在の参照箇所:

| 画像 | 参照章 |
|------|-------|
| 01_detail-view | 03 画面とビュー |
| 02_calendar-view | 03 画面とビュー |
| 03_kanban-view | 03 画面とビュー |
| 04_entry-editor | 03 画面とビュー / 04 エントリの種類 |
| 05_export-panel | 07 保存と持ち出し |
| 06_import-dialog | 07 保存と持ち出し |

## 未差し替え / 追加候補（任意）

今回のキャプチャは **placeholder 撲滅** を最優先に、既存 6 ファイルのみを対象としました。以下は v0.1.0 時点の UI 機能として記述はあるが画像がない項目です。必要になったら手動キャプチャを足してください。

| 推奨ファイル名 | 内容 | 参照予定章 |
|----------------|-----|-----------|
| `07_textlog-to-text-preview.png` | TEXTLOG 選択モードから TEXT 変換の preview を開いた状態 | 05 日常操作 |
| `08_text-to-textlog-preview.png` | TEXT → TEXTLOG プレビュー（heading / hr radio + log list） | 05 日常操作 |
| `09_entry-window.png` | 別ウィンドウで開いたエントリとメイン側の 2 ウィンドウ | 05 日常操作 |
| `10_zip-import-warning-toast.png` | ZIP import 成功後に表示される warning toast | 07 保存と持ち出し |
| `11_storage-profile.png` | Storage Profile パネル（IndexedDB 消費状況） | 07 保存と持ち出し |
| `12_shortcut-help.png` | `Ctrl+?` で開くショートカット一覧モーダル | 06 キーボードショートカット |

追加する場合は `docs/manual/*.md` 側の参照 `![...](asset:<name>)` も併せて追記してください。

## 差し替え履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 01〜06 を Playwright によるヘッドレス実機キャプチャに差し替え（v0.1.0 固定）。Data パネル 3 グループ / 編集画面の Markdown プレビュー併走 / サンプル Todo による Calendar・Kanban が視認できる |
| 初版 | 200×150 のベタ塗り PNG placeholder |
