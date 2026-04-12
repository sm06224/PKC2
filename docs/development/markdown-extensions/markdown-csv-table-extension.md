# Markdown Extension — CSV Code Block to Table

Status: CANDIDATE
Created: 2026-04-12
Category: B. Markdown / Rendering Extensions

---

## 1. 短い結論

fenced code block の言語指定が `csv` の場合、rendered view で `<table>` として表示する。
source は CSV のまま保持（編集は textarea で行う）、描画時にのみ table 化。

---

## 2. 背景 / 問題

markdown 標準の table syntax はセル数が増えると手で書くのが辛い。
一方、CSV は外部データをそのまま貼り付けるだけで生成できる。
現状は CSV を貼ると fenced block として等幅テキストで表示されるだけで、読みにくい。

---

## 3. ユーザ価値

- スプレッドシートから CSV をコピペすれば即座に table になる
- source は CSV のまま editable なので、セル追加・編集が直感的
- markdown 標準 syntax（`| ... |`）より圧倒的に書き心地が良い
- C-4（spreadsheet entry）への橋渡しにもなる

---

## 4. 最小スコープ

- markdown renderer に fenced block 言語解析を追加（`csv`, `tsv`, `psv` 等）
- CSV → `<table>` 変換（1 行目を header として扱う / プレーン行のまま扱う 両対応）
- 既存 `.pkc-md-rendered table` スタイルに合流
- source の保存 format は既存 markdown そのまま（CSV 文字列を fenced block に包むだけ）
- export（text-markdown-zip 等）は CSV ブロックのままで問題なし

---

## 5. やらないこと

- セル単位編集 UI（これは C-4 spreadsheet entry の責務）
- ソート / フィルタ UI
- セル内 markdown 評価
- 大規模 CSV の virtual scroll
- CSV dialect の自動判定（delimiter は言語指定で明示）

---

## 6. 設計の方向性

- features 層に CSV parser を新設（pure function）
- 入力 = CSV 文字列、出力 = `string[][]`
- renderer 層で parsed 結果を `<table>` に変換
- header 判定は fenced block の info string（例: `csv header`）で制御
- エラー時は fallback して元の fenced block 表示を維持

---

## 7. リスク / 未確定事項

- CSV エスケープ（quote, escape char, multiline cell）の実装範囲
- delimiter variants（TSV / PSV / カスタム）の扱い
- header 有無の指定方法（info string の予約語 vs 先頭行 heuristic）
- table 幅が widget より広い場合の overflow 処理（既存 `overflow-x: auto` で足りるか）

---

## 8. 将来拡張の余地

- `csv-with-types` で型推論（number / date）→ 右寄せ / 書式化
- `csv-sortable` で column ヘッダクリックによるソート
- C-4 spreadsheet entry との相互変換
- TOC（A-3）への table caption 追加
- B-2 syntax highlighting と共存する fenced block の info string 規約整理
