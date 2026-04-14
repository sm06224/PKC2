# スクリーンショット素材

このディレクトリには、ユーザーマニュアル HTML 版 (`PKC2-Extensions/pkc2-manual.html`) に埋め込まれる画面キャプチャを配置します。

## ファイル一覧

| ファイル | 内容 |
|---------|------|
| `01_detail-view.png` | Detail ビュー全体 |
| `02_calendar-view.png` | Calendar ビュー |
| `03_kanban-view.png` | Kanban ビュー |
| `04_entry-editor.png` | エントリ編集画面 |
| `05_export-panel.png` | Export パネル |
| `06_import-dialog.png` | Import 確認ダイアログ |

## 現状

**初版のプレースホルダー** が入っています（200×150 のベタ塗り PNG）。ビルダー (`build/manual-builder.ts`) は PNG ファイルを単に読み込んで base64 として埋め込むため、実際のスクリーンショットに差し替えるだけで HTML マニュアルに反映されます。

## 差し替え推奨リスト（manual 更新時点）

マニュアル本文はすでに実装済み機能に合わせて更新済みですが、以下の画面は最新 UI の要素が既存キャプチャに写っていない可能性があるため、実スクリーンショットへの差し替えが推奨されます。画像差し替えは必須ではなく、テキストが先行しています。

| ファイル | 旧撮影時に無かった可能性のある要素 |
|---------|--------------------------------|
| `01_detail-view.png` | 常設ドロップゾーン / コンテキストメニュー / 複数選択ハイライト / 右クリック or toast の例 |
| `02_calendar-view.png` | 複数選択状態のハイライト / 期日変更 DnD 中のドラッグゴースト |
| `03_kanban-view.png` | Todo カードの複数選択 / 列間ドラッグのゴースト |
| `04_entry-editor.png` | Markdown プレビュー併走（split editor）/ TODO embed カードのプレビュー |
| `05_export-panel.png` | Share / Archive / Import の 3 グループ化された Data メニュー / Selected-only / フォルダスコープの導線 |
| `06_import-dialog.png` | Batch Import の preview（チェックボックス + 取り込み先フォルダ指定）/ ZIP import 警告 toast |

### 追加推奨キャプチャ（任意）

既存ファイル名では表現しきれない新 UI もあります。必要に応じて下記を新規に追加してください。

| 推奨ファイル名（案） | 内容 |
|------------------|-----|
| `07_textlog-to-text-preview.png` | TEXTLOG 選択モードから TEXT 変換 preview を開いた状態 |
| `08_text-to-textlog-preview.png` | TEXT → TEXTLOG プレビュー（heading / hr radio + log list） |
| `09_entry-window.png` | 別ウィンドウで開いたエントリ + メイン側を並べた 2 ウィンドウの様子 |
| `10_zip-import-warning-toast.png` | ZIP import 成功後に表示される warning toast |

追加する場合は `docs/manual/*.md` 側の参照 `![...](asset:<name>)` も併せて追加してください。

## 差し替え手順

1. `dist/pkc2.html` をブラウザで開き、各画面を用意する
2. OS の標準スクリーンショット機能で該当の領域をキャプチャ
3. 上記の同じファイル名で `.png` として保存し、このディレクトリに置く
4. `npm run build:manual` を実行
5. `PKC2-Extensions/pkc2-manual.html` をブラウザで開いて確認

推奨サイズは幅 1000〜1400 px。サイズが大きすぎると HTML マニュアルのファイルサイズに響くため、長辺 1400 px 以下を目安にしてください。

## Markdown からの参照

各章の Markdown 本文からは次の形式で参照します。

```markdown
![Detail ビュー](asset:01_detail-view)
```

拡張子は省略します。`asset-resolver.ts` が `container.assets` 内のキーと照合して解決します。
