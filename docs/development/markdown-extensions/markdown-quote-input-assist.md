# Markdown Extension — Quote Input Assist

Status: **COMPLETED — Slice α(2026-04-14)+ Slice β(2026-05-14)+
Slice γ(2026-05-14)。USER_REQUEST_LEDGER S-17 完了。**
Created: 2026-04-12
Category: B. Markdown / Rendering Extensions

---

## 0. 実装サマリ（2026-04-14 Slice α / 2026-05-14 Slice β + γ 完了）

§4 minimum scope を 3 slice で漸進的に完成。spec § 5「やらないこと」は
全項目守られている。

### Slice α(continuation、2026-04-14 着地)

- **pure helper**: `src/features/markdown/quote-assist.ts` —
  `computeQuoteAssistOnEnter(value, caretPos)` が末尾 + 非空 `> X` 行
  なら `{ type: 'continue', insert: '\n> ' }` を返す
- **wire**: `src/adapter/ui/action-binder.ts` の `handleKeydown`
  内、inline-calc の Enter ブロック直後、Ctrl+Enter(TEXTLOG append)
  ブロックの前。`isSlashEligible(textarea)` で markdown 入力対象に絞る

### Slice β(empty exit + bulk toggle、2026-05-14 着地、PR-V3 wave)

- **空 `> ` 行 + Enter → exit**:`computeQuoteAssistOnEnter` の return
  union が `{ type: 'continue'; insert } | { type: 'exit'; rangeStart;
  rangeEnd; replacement }` に拡張。`> ` の line range を `\n` 置換し、
  caret は新 blank line に来る(markdown 仕様:blank line で blockquote 終端)
- **選択範囲 + Mod+Shift+. で `> ` prefix 一括 toggle**:
  `computeQuoteToggleOnSelection(value, selStart, selEnd)` を追加、
  全行 quote → 剥がす / 1 行でも non-quote → 全行に追加。空選択は
  caret 行に対する 1 行 toggle。action-binder は Mod+Shift+. と
  Mod+Shift+>(US 物理 key 別 layout)の両 keystroke を accept

### Slice γ(entry-window 同期、2026-05-14 着地、PR-V3 wave)

- 親 helper を child window の inline JS としてミラー(`entry-window.ts`
  の template 内に `computeQuoteAssistEnterChild` /
  `computeQuoteToggleChild` / `applyQuoteToggleChild` /
  `replaceRangeChild` を定義)。child の keydown handler は親と同 contract
  で Enter(continue / exit)と Mod+Shift+. を受ける
- IME composition / modifier guard / non-collapsed selection guard は
  親と同じ条件で先に return

### テスト

- `tests/features/markdown/quote-assist.test.ts`(24 件):pure 規則
  網羅 — Slice α 継続(5)/ Slice β exit(4)/ null cases(5)/ bulk
  toggle add(4)/ bulk toggle strip(3)/ edge case(3)
- `tests/adapter/quote-assist-handler.test.ts`(15 件):action-binder
  integration — Slice α(8)/ Slice β exit(2)/ Slice β bulk toggle(5)
- `tests/adapter/entry-window-quote-assist.test.ts`(7 件、新規):
  child-side inline mirror の生成 + 動作 parity — 4 関数存在確認 / 子側
  continue / exit / null / bulk add / bulk strip / 親子 byte-identical fixture

§7 Risk「IME 確定中の keydown 抑制」は `e.isComposing` ガードで解消、
「entry window の inline script 同期」も Slice γ で解消。

---

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
