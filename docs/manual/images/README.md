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
