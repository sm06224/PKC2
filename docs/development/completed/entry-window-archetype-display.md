# entry-window archetype-aware display

## 問題

entry-window（ダブルクリックで開く別窓）が entry の archetype を考慮せず、
すべてのエントリを markdown としてレンダリングしていた。

- attachment エントリ: `{"name":"report.pdf","mime":"application/pdf","asset_key":"a1"}` が markdown テキストとして表示
- todo エントリ: `{"status":"open","description":"Buy milk"}` が markdown テキストとして表示
- form エントリ: `{"name":"John","note":"note","checked":true}` が markdown テキストとして表示

## archetype ごとの最小表示方針

### text / textlog / generic / opaque / folder
- 既存の markdown レンダリングを維持
- 空の場合は `(empty)` を表示

### attachment
- ファイル情報カード表示（`pkc-ew-card`）
- 表示項目: ファイル名、MIMEタイプ、サイズ、拡張子、asset_key
- 「Preview is available in the main window」の案内テキスト
- 完全なプレビュー（画像/PDF/HTML sandbox）は future

### todo
- Todo 情報カード表示
- 表示項目: ステータス（Open/Done + アイコン）、日付（ロケール表示）、
  アーカイブバッジ、説明文
- 期限超過は `--c-danger` 色でハイライト
- `features/todo/todo-body` の純粋関数を再利用

### form
- フォーム情報カード表示
- 表示項目: Name、Note、Checked（Yes/No）
- `adapter/ui/form-presenter` の `parseFormBody` を再利用

## foundation について

今回は foundation（基盤）のみ。

やったこと:
- `renderViewBody()` 関数で archetype 判別・分岐
- archetype ごとの HTML カード生成関数
- カード用 CSS（`.pkc-ew-card` 系）
- 19 件のテスト追加

やっていないこと:
- attachment の完全プレビュー（画像表示、PDF、HTML sandbox）
- attachment のダウンロードボタン（メインウィンドウへの誘導のみ）
- todo の編集機能（status toggle 等）
- form の編集フォーム

## fallback archetype の扱い

未知のアーキタイプ（generic, opaque, 将来追加されるもの）は
すべて markdown レンダリングにフォールバック。
エラーや空白にはならない。
