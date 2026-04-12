# Spreadsheet Entry Archetype

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

セル単位で編集できる spreadsheet 型 entry archetype を追加する。
B-1（CSV → table）が表示専用なのに対し、こちらは表計算的な入力 UI を持つ。

---

## 2. 背景 / 問題

表形式データの扱いで、PKC2 には現在：

- markdown table syntax（書きにくい）
- B-1 CSV block（表示のみ、セル単位編集不可）

しかない。
家計簿 / タスク表 / 簡易 DB のような用途で
「セル単位の編集 UI」が欠けている。

---

## 3. ユーザ価値

- 表形式データを直接セル編集できる
- 行 / 列の追加・削除が直感的
- markdown text では扱いにくい構造化データを保持できる
- CSV import / export が標準経路として成立する

---

## 4. 最小スコープ

- 新 archetype `spreadsheet` を登録
- body は CSV / JSON（`string[][]`）のいずれかの正規化 format
- presenter: view = `<table>` 描画、edit = セル単位 input
- 行 / 列追加 / 削除の最小 toolbar
- row 数 / col 数に初期上限（performance 予防）

---

## 5. やらないこと

- 数式 / formula（将来）
- セル書式（色 / 太字 / merge）
- ソート / フィルタ UI
- pivot / チャート
- 他 entry の参照 / vlookup 相当

---

## 6. 設計の方向性

- core に `SpreadsheetBody` 型を追加、body は JSON 文字列として保存
- features 層に CSV / JSON 相互変換の pure function
- presenter は既存 registry に追加（text fallback に頼らない）
- editor はセル input 集約 → body JSON を保存
- QUICK_UPDATE_ENTRY 相当の dispatcher action でセル単位 diff 保存

---

## 7. リスク / 未確定事項

- body JSON のサイズ上限
- セル内 markdown 評価の可否
- 大規模表の rendering パフォーマンス
- undo / redo の粒度（セル単位 vs 全体）
- mobile / small screen での編集 UX

---

## 8. 将来拡張の余地

- 数式 / 計算列
- チャート export
- B-1 CSV block との相互変換
- C-3 link index entry への参照セル
- import from Excel / Google Sheets（.xlsx → JSON）
