# Markdown Extension — Quote Input Assist

Status: CANDIDATE
Created: 2026-04-12
Category: B. Markdown / Rendering Extensions

---

## 1. 短い結論

引用（`> ...`）の入力を補助する。複数行選択 → shortcut で一括 `>` prefix、
改行時の自動継続、空行で blockquote を抜ける挙動など、
markdown 標準の quote syntax を「打ちやすく」する editor 側の支援。

---

## 2. 背景 / 問題

markdown の blockquote は行頭 `>` だが、
複数行引用を貼り付けた後に手動で各行 `>` を付けるのは面倒。
また、引用中の改行で `>` が自動継続しないと、
毎行 `>` を打つことになりテンポが悪い。

---

## 3. ユーザ価値

- 引用が「入力しやすい機能」になる
- 議事録・読書メモ・対話ログで引用が自然に使える
- markdown 記法を外部ツールに依存せず editor 側で完結できる
- source は素の markdown のまま維持される（portable）

---

## 4. 最小スコープ

- textarea の keydown handler で以下を扱う
  - Enter: 直前行が `>` 始まりなら次行に `> ` を挿入
  - 空 `>` のみの行で Enter: blockquote を抜ける（`>` を消す）
  - 選択範囲に対する shortcut（例: Ctrl+Shift+.）で一括 `>` prefix toggle
- center pane / entry window の textarea 双方で有効
- 既存 textarea の native undo stack を壊さない

---

## 5. やらないこと

- rich text UI / WYSIWYG 化
- 引用の折り畳み UI
- 引用元メタデータ（出典 URL）入力補助
- list / heading / code fence 等、他 syntax の入力補助（別 issue）
- mobile キーボードの virtual key 対応

---

## 6. 設計の方向性

- features 層に pure function `applyQuoteAssist(event, value, selection)` を用意
- 入力 = keyboard event + textarea 状態、出力 = `{ value, selection }` or `null`
- adapter 層の textarea binder から呼び出すだけにし、presenter は変更しない
- undo stack 保護のため `document.execCommand('insertText')` 経路を第一候補
- fallback 可能な形で実装（失敗しても通常入力に戻る）

---

## 7. リスク / 未確定事項

- `execCommand` は deprecated だが現状 undo 保護に唯一現実的
- IME 確定中の keydown 抑制の扱い
- Enter 時の自動継続が「望まないケース」での邪魔さ（opt-out 手段の要否）
- entry window の inline script に同じロジックを同期する重複

---

## 8. 将来拡張の余地

- list / numbered list の入力補助
- heading の `#` 増減 shortcut
- markdown table 入力補助（B-1 との連携）
- citation footnote 入力補助（C-3 link index entry との連携）
- editor shortcut の設定化 UI
