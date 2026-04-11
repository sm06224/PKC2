# Task Completion Badge

Status: CANDIDATE
Created: 2026-04-11

---

## 1. Summary

TEXT / TEXTLOG エントリに含まれる markdown task list の進捗を、
小さな badge（例: `2/5`）として sidebar と detail pane title row に表示する。

badge は entry.body からの **純粋な派生物** であり、
既存の `findTaskItems()` を再利用して checked / total を算出する。
task が 0 件のエントリには badge を表示しない。

---

## 2. 現状棚卸し

### task list helper

| Helper | File | Lines | 仕様 |
|--------|------|-------|------|
| `findTaskItems(body)` | `markdown-task-list.ts` | 36-78 | body 文字列から `TaskItem[]` を返す。fenced code block を除外。 |
| `toggleTaskItem(body, idx)` | `markdown-task-list.ts` | 89-106 | taskIndex 指定で `[ ]` ↔ `[x]` を toggle。失敗時 `null`。 |
| `TaskItem` | `markdown-task-list.ts` | 11-18 | `{ line, checked, text }` |

`findTaskItems` は行単位の regex scan で、fenced code block 内は除外する。
返り値から `total = items.length`、`done = items.filter(t => t.checked).length` を即座に算出可能。

### main window の task toggle

- `action-binder.ts` `handleTaskCheckboxClick()` (840-885)
- TEXT: `toggleTaskItem(entry.body, taskIndex)` → `QUICK_UPDATE_ENTRY`
- TEXTLOG: `parseTextlogBody` → find log entry by `data-pkc-log-id` → `toggleTaskItem(logEntry.text, taskIndex)` → `serializeTextlogBody` → `QUICK_UPDATE_ENTRY`
- toggle 後 `render(state, root)` が自動発火 → sidebar / detail pane が再描画される

### entry window の task toggle

- `entry-window.ts` — child → parent `pkc-entry-task-toggle` → 親で `QUICK_UPDATE_ENTRY` + `pushViewBodyUpdate`
- entry window は postMessage 経由で再描画される

### badge 配置候補

| 場所 | 現状 | 備考 |
|------|------|------|
| Sidebar entry title 右側 | todo status badge / revision badge / folder count が存在 | 同一パターンで追加可能 |
| Detail pane title row | archetype label のみ | breadcrumb の前に badge 配置可能 |
| Entry window title row | archetype label のみ | HTML テンプレート内。動的更新には追加プロトコルが必要 |

### TEXTLOG の task 数え上げ

TEXTLOG の body は JSON (`TextlogBody`)。task list は各 log entry の `text` フィールド内に存在する。

`findTaskItems(entry.body)` は JSON 文字列を渡すため **正しく動作しない**。
log entry 単位で `findTaskItems(le.text)` を呼び、合算する必要がある。

---

## 3. 最小スコープ

### やること

- `countTaskProgress(entry): { done: number; total: number } | null` pure helper を features 層に追加
  - TEXT: `findTaskItems(entry.body)` から算出
  - TEXTLOG: `parseTextlogBody(entry.body).entries` を走査し、各 `findTaskItems(le.text)` を合算
  - task が 0 件 → `null` を返す
- Sidebar: entry title の右側に `done/total` badge を表示（task ≥ 1 のときのみ）
- Detail pane title row: archetype label の右側に `done/total` badge を表示（task ≥ 1 のときのみ）
- CSS: 既存の `pkc-revision-badge` / `pkc-todo-archived-sidebar` パターンに準拠

### やらないこと

| 項目 | 理由 |
|------|------|
| グラフ / 進捗バー | UX 過剰。badge で十分 |
| パーセント表示 | task 件数が少ない場合に不正確に見える |
| multi-entry 集計 | folder 単位の集計は複雑。別 issue |
| todo archetype との統合 | todo は status/date で管理。task list とは別概念 |
| filter/sort への組み込み | 検索/ソートの軸として使うのは別 issue |
| entry window での badge | 動的更新に追加プロトコルが必要。Phase 2 候補 |
| per-log-entry badge | TEXTLOG の各 row に badge は情報過多。合算のみ |

---

## 4. Badge Semantics

### 表示形式

**`done/total`** を推奨する。

| 形式 | 例 | 利点 | 欠点 |
|------|-----|------|------|
| `done/total` | `2/5` | 直感的。小さい。 | — |
| `done/total ✓` | `2/5 ✓` | 完了時に視覚強調 | emoji 追加でサイズ増 |
| パーセント | `40%` | — | 少数 task で不正確に見える（1/3 = 33%?） |
| `done of total` | `2 of 5` | — | 英語圏以外で非直感的 |

**推奨: `done/total`** — 最小・直感的・locale 非依存。

### 0 件時

- task が 0 件（`findTaskItems` が空配列）→ **badge を表示しない**
- `0/0` は無意味。表示する理由がない

### 全完了時

- `total === done && total > 0` → badge テキストは `done/total`（例: `5/5`）
- CSS で success 色（`var(--c-success)`）を適用
- `data-pkc-task-complete="true"` attribute で状態を表現

### 部分完了時

- `done > 0 && done < total` → muted 色で `done/total`
- 特別な色は付けない（success でも danger でもない）

### 未着手時

- `done === 0 && total > 0` → muted 色で `0/total`
- badge は表示する（task が存在することを示す価値がある）

---

## 5. 表示場所

### 結論: Sidebar + Detail pane title row の 2 箇所

### 場所 1: Sidebar — entry title の右側

**配置**: `pkc-entry-title` の後、`pkc-todo-status-badge` / `pkc-revision-badge` の前

```
[📝 Entry Title] [2/5] [r3]
```

**理由**:
- entry 一覧を見ながら task 進捗を把握できる（最も高頻度な閲覧パス）
- 既存の badge パターン（todo status, revision, folder count）と同一の視覚言語
- `renderEntryItem()` に数行追加するだけで実装可能
- 認知負荷が低い: ユーザは既に sidebar badge を読む習慣がある

**なぜ最小か**:
- `renderEntryItem` は全 entry で共有される単一関数
- archetype guard（text / textlog のみ）で 1 箇所の分岐
- CSS は `pkc-revision-badge` と同一パターン

### 場所 2: Detail pane title row — archetype label の右側

**配置**: `pkc-archetype-label` の後（breadcrumb の前）

```
Entry Title    [📝 Text] [3/7]
```

**理由**:
- entry を選択した状態で body と共に badge を確認できる
- archetype label の隣に置くことで「この entry の属性情報」として一貫
- `renderView()` に数行追加するだけ

**なぜ認知負荷が低いか**:
- title row に既存の archetype label が並んでおり、badge を 1 つ追加しても視覚的に自然
- body 内の checkbox と badge が同一 view 内にあるため、整合性が即座に確認可能

### 除外: Entry window

- entry window は HTML テンプレート（`buildWindowHtml`）で生成される static HTML
- badge を動的に更新するには `pushViewBodyUpdate` に相当する追加プロトコルが必要
- Phase 1 では不要。必要になれば body の push と同時に badge を更新する protocol を追加

---

## 6. Source of Truth / Sync

### source of truth

**`entry.body`** が唯一の source of truth。

badge は `entry.body` からの **純粋な派生計算** であり、
独自の state を持たない。

### sync モデル

```
entry.body → countTaskProgress(entry) → { done, total } → badge DOM
```

1. task toggle（main window / entry window） → `QUICK_UPDATE_ENTRY` dispatch
2. reducer が `entry.body` を更新
3. `dispatcher.onState()` が `render(state, root)` を発火
4. `render` → `renderEntryItem` → `countTaskProgress(entry)` → badge 更新
5. `render` → `renderView` → `countTaskProgress(entry)` → badge 更新

**追加の state は不要**。render 関数が毎回 body から再計算する。

### task toggle 後の badge 更新

- main window: `QUICK_UPDATE_ENTRY` → state 変更 → `render()` 自動発火 → badge 即時更新
- entry window: `pkc-entry-task-toggle` → 親で `QUICK_UPDATE_ENTRY` → `render()` 自動発火 → **sidebar / detail pane の badge は自動更新**
- entry window 内の badge は Phase 1 非対象（前述の通り）

### performance

- `findTaskItems` は行単位 regex scan で O(n) — body サイズに比例
- TEXTLOG は log entry 数 × text サイズ — entry 数が数百でも ms 未満
- render ごとに再計算するが、sidebar に数十〜数百 entry があっても問題ない
  - 仮に 100 entries × 50 行 = 5000 行の regex scan → 数 ms 以下
- **memoization は不要**（render の頻度と body サイズの積が十分小さい）

---

## 7. TEXTLOG の扱い

### 全 log entry 合算

**推奨: 全 log entry を合算する。**

```typescript
function countTextlogTasks(body: string): { done: number; total: number } | null {
  const log = parseTextlogBody(body);
  let done = 0;
  let total = 0;
  for (const le of log.entries) {
    const items = findTaskItems(le.text);
    done += items.filter(t => t.checked).length;
    total += items.length;
  }
  return total > 0 ? { done, total } : null;
}
```

理由:
- ユーザにとって「この TEXTLOG entry に task がいくつあるか」が最も自然な粒度
- log entry 単位の badge は sidebar では情報過多
- detail pane では各 log entry の checkbox が見えるため、per-row badge は冗長

### log entry 内の markdown task

- **含む**。各 log entry の `text` に `- [ ]` / `- [x]` が含まれる場合、カウント対象
- これは main window の task toggle と同じ粒度

### per-log-entry badge

- **今回は不要**。
- 各 log entry の task count は body 内の checkbox で視覚的に把握可能
- 必要になれば TEXTLOG presenter に badge を追加する別 issue で対応

---

## 8. Archetype 別の扱い

| Archetype | 対応 | 理由 |
|-----------|------|------|
| text | ○ | body が plain markdown。`findTaskItems(entry.body)` で直接 |
| textlog | ○ | body が JSON。log entry 単位で `findTaskItems(le.text)` を合算 |
| generic / opaque | ○ | markdown render されるため task list が存在し得る。text と同じ扱い |
| todo | × | body は JSON (status/description)。task list の概念が異なる |
| form | × | body は JSON (key-value)。task list なし |
| attachment | × | body は JSON (name/mime/size)。task list なし |
| folder | △ | body は通常空だが markdown 可。task があれば badge 表示 |

### 実装上の分岐

```typescript
function countTaskProgress(entry: Entry): { done: number; total: number } | null {
  switch (entry.archetype) {
    case 'todo':
    case 'form':
    case 'attachment':
      return null;  // JSON body — task list なし
    case 'textlog':
      return countTextlogTasks(entry.body);
    default:
      // text, generic, opaque, folder
      return countPlainTasks(entry.body);
  }
}
```

---

## 9. 実装変更箇所（見積もり）

| File | Change | Lines |
|------|--------|-------|
| `features/markdown/markdown-task-list.ts` | `countTaskProgress(entry)` 新規追加 | ~25 |
| `adapter/ui/renderer.ts` | `renderEntryItem` に sidebar badge 追加 | ~10 |
| `adapter/ui/renderer.ts` | `renderView` に detail pane badge 追加 | ~10 |
| `styles/base.css` | `.pkc-task-badge` + selected/complete 状態 CSS | ~20 |
| テスト | 新規テストファイル | ~60 |

### 新規ファイル

なし（既存ファイルへの追加のみ）。

### import 追加

- `renderer.ts` に `countTaskProgress` を追加 import
- `markdown-task-list.ts` に `parseTextlogBody` を追加 import

### 層違反チェック

`countTaskProgress` を features 層に置く場合:
- `findTaskItems` は同一 features/markdown 内 → OK
- `parseTextlogBody` は features/textlog 内 → features 間 import → OK（features ← features は許可）
- `Entry` 型は core/model → features ← core → OK

**層違反なし。**

---

## 10. テスト計画

### Pure helper

| # | Test | Expect |
|---|------|--------|
| 1 | TEXT: task あり `- [ ] A\n- [x] B\n- [ ] C` | `{ done: 1, total: 3 }` |
| 2 | TEXT: task なし `# Title\nparagraph` | `null` |
| 3 | TEXT: 全完了 `- [x] A\n- [x] B` | `{ done: 2, total: 2 }` |
| 4 | TEXT: 全未完了 `- [ ] A\n- [ ] B` | `{ done: 0, total: 2 }` |
| 5 | TEXT: empty body | `null` |
| 6 | TEXTLOG: 複数 log entry 合算 | entries 跨ぎで合算 |
| 7 | TEXTLOG: task なし log entries | `null` |
| 8 | TEXTLOG: 空 entries | `null` |
| 9 | todo archetype → `null` | JSON body はスキップ |
| 10 | attachment archetype → `null` | JSON body はスキップ |
| 11 | generic archetype → text と同じ | markdown body |

### Sidebar badge (renderer)

| # | Test | Expect |
|---|------|--------|
| 12 | TEXT entry with tasks → badge 表示 | `pkc-task-badge` 要素が存在、テキスト `1/3` |
| 13 | TEXT entry without tasks → badge 非表示 | `pkc-task-badge` 要素なし |
| 14 | TEXTLOG entry with tasks → badge 表示 | 合算値 |
| 15 | todo entry → badge 非表示 | archetype guard |
| 16 | all complete → `data-pkc-task-complete="true"` | 属性あり |
| 17 | selected entry → badge 色が accent-fg | CSS attribute selector |

### Detail pane badge (renderer)

| # | Test | Expect |
|---|------|--------|
| 18 | TEXT entry selected → detail pane に badge | title row 内に `pkc-task-badge` |
| 19 | task なし entry → badge 非表示 | |
| 20 | all complete → complete 属性 | |

### Sync

| # | Test | Expect |
|---|------|--------|
| 21 | task toggle → re-render → badge 更新 | `1/3` → `2/3` |
| 22 | entry window task toggle → sidebar badge 更新 | 親 state 変更で再描画 |

### Regression

| # | Test | Expect |
|---|------|--------|
| 23 | todo status badge 不変 | archetype todo に task badge なし |
| 24 | revision badge 不変 | 共存 |
| 25 | folder count badge 不変 | 共存 |

---

## 11. Non-goals

| 項目 | 理由 |
|------|------|
| entry window 内 badge | 動的更新に追加 protocol 必要。Phase 2 |
| 進捗バー / グラフ | badge で十分 |
| パーセント表示 | 少数 task で不正確 |
| multi-entry 集計 | folder scope の集計は別 issue |
| filter/sort | task 進捗での絞り込みは別 issue |
| per-log-entry badge | checkbox で視覚的に把握可能 |
| memoization | render 頻度 × body サイズが十分小さい |

---

## 12. CSS 設計

### badge class: `pkc-task-badge`

```css
/* ── Task completion badge ── */
.pkc-task-badge {
  font-size: 0.6rem;
  color: var(--c-muted);
  white-space: nowrap;
}

[data-pkc-task-complete="true"] .pkc-task-badge {
  color: var(--c-success);
}

[data-pkc-selected="true"] .pkc-task-badge {
  color: rgba(255,255,255,0.7);
}

[data-pkc-selected="true"][data-pkc-task-complete="true"] .pkc-task-badge {
  color: var(--c-accent-fg);
}
```

理由:
- `pkc-revision-badge` と同一のサイズ・色パターン
- 全完了時のみ `--c-success` で視覚強調
- selected 時は既存の accent-fg パターンを踏襲
- 追加の background/border は不要（small badge pattern に準拠）

### detail pane 用

```css
.pkc-view-title-row .pkc-task-badge {
  font-size: 0.7rem;
}
```

sidebar より若干大きく（detail pane は表示面積に余裕がある）。
