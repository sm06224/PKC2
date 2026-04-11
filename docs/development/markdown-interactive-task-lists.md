# Interactive Task Lists

## 1. 概要

TEXT / TEXTLOG の rendered markdown 内にある GFM task list checkbox を
クリックして、対応する markdown source の `- [ ]` / `- [x]` を安全に
切り替える軽量 inline convenience 機能。

TODO archetype の代替ではなく、markdown 本文中のチェックボックスを
ワンクリックで切り替えるためだけのもの。

---

## 2. スコープ

### 対象

- 対象 archetype: TEXT / TEXTLOG の rendered markdown
- 対象記法: GFM task list (`- [ ]`, `- [x]`, `* [ ]`, `+ [x]`)
- 操作: view mode でチェックボックスをクリック → body 文字列を toggle → 再 render

### 非対象

- TODO archetype との統合
- ネスト task の一括親子連動（子の toggle が親を自動変更等）
- partial checked state（indeterminate）
- markdown editor の全面再設計
- entry window (別ウィンドウ) 内での toggle — 読み取り専用表示のまま
- edit mode preview pane 内での toggle — CSS で `pointer-events: none`

---

## 3. Source of Truth

- **真実は常に `entry.body` の markdown 文字列**
- rendered checkbox は body から派生した表示
- DOM 上の checkbox state を先に変えてはならない
  (`e.preventDefault()` で browser の visual toggle を阻止)
- body 更新 → `QUICK_UPDATE_ENTRY` dispatch → 同期 re-render → UI が変わる

---

## 4. 行対応付けルール

### 4.1 Task index

rendered checkbox に `data-pkc-task-index` 属性を付与する。
値は 0-based の連番で、markdown body 中の task item の出現順に一致する。

### 4.2 Pure helper による管理

`features/markdown/markdown-task-list.ts` に以下の pure function を配置:

- `findTaskItems(body: string): TaskItem[]`
  - body を行分割し、fenced code block をスキップしつつ
    task list line (`\s*[-*+] \[[ xX]\]`) を列挙
  - 返り値は `{ line, checked, text }` の配列 (document order)

- `toggleTaskItem(body: string, taskIndex: number): string | null`
  - `findTaskItems` で Nth item を特定
  - 該当行の `[ ]` ↔ `[x]` を書き換え
  - 範囲外なら `null` を返す

### 4.3 Index の一致保証

- markdown-it の task list plugin と `findTaskItems` は
  同じパターン (`[-*+] \[[ xX]\]`) で task item を検出する
- asset resolution は行の追加/削除をしないため、
  resolved source 上の task index と original body 上の task index は一致する
- fenced code block 内の task-like 行はスキップされる（both sides）

---

## 5. 操作シーケンス

### 5.1 TEXT

1. ユーザが view mode で checkbox をクリック
2. action-binder が `input[data-pkc-task-index]` への click を検出
3. `e.preventDefault()` で visual toggle を阻止
4. `state.selectedLid` から entry を取得
5. `toggleTaskItem(entry.body, taskIndex)` で新 body を生成
6. `QUICK_UPDATE_ENTRY` dispatch → 同期 re-render

### 5.2 TEXTLOG

1. ユーザが log entry 内の checkbox をクリック
2. action-binder が click を検出、
   DOM を上方走査して `[data-pkc-log-id]` を持つ textlog row を探す
3. `data-pkc-lid` + `data-pkc-log-id` で owning entry と log entry を特定
4. `parseTextlogBody` → 該当 log entry の `.text` に `toggleTaskItem` を適用
5. `serializeTextlogBody` → `QUICK_UPDATE_ENTRY` dispatch

---

## 6. ガード

| 条件 | 動作 |
|------|------|
| `state.readonly` | click を無視 |
| `state.phase === 'editing'` | click を無視 |
| `taskIndex` が範囲外 | `toggleTaskItem` が `null` → no-op |
| entry が見つからない | no-op |
| TEXTLOG で `logId` 不一致 | no-op |
| edit preview pane 内 | CSS `pointer-events: none` で click が届かない |
| entry window | checkbox に task index 属性なし → handler が発火しない |

---

## 7. 操作順序バグ対策

### 複数 checkbox

`data-pkc-task-index` で個別の task を一意に特定するため、
隣接 checkbox の誤対応は起きない。

### TEXTLOG markdown block

各 log entry の `text` は独立して `renderMarkdown` に渡されるため、
task index は log entry 内で 0 からリセットされる。
handler 側も log entry の `text` を単位に `toggleTaskItem` を呼ぶ。

### 再 render 後の index 安定

`QUICK_UPDATE_ENTRY` dispatch 後、re-render は同期的に発生する。
`toggleTaskItem` は対象行の `[ ]` / `[x]` のみを書き換え、
他の行を一切変更しないため、再 render 後も task index は安定。

---

## 8. Markdown renderer の変更

`markdown-render.ts` の task list plugin:

- **追加**: checkbox の `html_inline` content に `data-pkc-task-index="${i}"` を付与
- **変更**: `disabled` 属性を削除（click イベントが発火するように）
- task index カウンタはパース単位 (= `core.ruler` コールバック単位) でリセット

---

## 9. CSS の変更

### base.css

- `.pkc-view-body .pkc-task-checkbox, .pkc-textlog-text .pkc-task-checkbox`:
  `cursor: pointer` に変更（interactive であることを示す）
- `.pkc-text-edit-preview .pkc-task-checkbox`:
  `pointer-events: none; cursor: default` を追加（edit preview は非 interactive）

---

## 10. State update 経路

既存の `QUICK_UPDATE_ENTRY` を使用。新しい action は追加しない。

- `QUICK_UPDATE_ENTRY` は body のみ更新、title 保持、phase 遷移なし
- revision snapshot を自動作成するため、toggle 操作も undo 対象
- 既存の toggle-todo-status, toggle-log-flag と同一パターン

---

## 11. テストカバレッジ

### pure helper (markdown-task-list.test.ts)

- 空 body → 空配列
- task なし body → 空配列
- 単一 unchecked / checked task
- 複数 task の列挙と index 確認
- 各マーカ (`-`, `*`, `+`) 対応
- ネストされた task (indent)
- fenced code block 内の task-like 行はスキップ
- toggleTaskItem: unchecked → checked
- toggleTaskItem: checked → unchecked
- toggleTaskItem: 複数 task で特定 index だけ toggle
- toggleTaskItem: 範囲外 → null
- toggleTaskItem: 元の行を壊さない

### renderer (renderer.test.ts)

- rendered checkbox に data-pkc-task-index 属性が付く
- index が 0, 1, 2... の連番
- disabled 属性がない

### action-binder (action-binder.test.ts)

- TEXT: checkbox click → body が QUICK_UPDATE_ENTRY で更新される
- TEXTLOG: checkbox click → 該当 log entry の text が toggle される
- readonly → 更新されない
- editing 中 → 更新されない
- 通常の markdown render / link / asset click と競合しない

---

## 12. Intentionally not done

- TODO archetype のチェックボックスとの連動
- nested task の親子連動
- entry window 内での interactive toggle
- edit mode preview 内での toggle
- Markdown editor 内での visual toggle
- drag/drop による task reorder
- task 完了率の表示
- keyboard shortcut による toggle

---

## 13. 5 層構造の適合

| 層 | 変更 |
|---|---|
| core | 変更なし |
| features | `markdown-task-list.ts` 新規 (pure helper) |
| features | `markdown-render.ts` — task list plugin に `data-pkc-task-index` 追加 |
| adapter | `action-binder.ts` — click handler 追加 |
| adapter | `base.css` — cursor / pointer-events 調整 |
| runtime | 変更なし |

層間の依存: adapter → features のみ。core への変更なし。

---

## 14. 次候補

- entry window 内での interactive toggle
- keyboard shortcut (Space / Enter) による toggle
- task 完了率バッジ (sidebar に表示)
- task list の filtering / sorting
