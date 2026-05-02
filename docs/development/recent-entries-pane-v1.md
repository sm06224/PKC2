# Recent Entries Pane v1

**Status**: design + implementation — 2026-04-21.
**Scope**: sidebar に **最近アクティブな user entry を最大 10 件列挙する pane** を 1 つ追加する。derived-only、container 変更ゼロ、reducer / action 追加は click handler 1 ケースのみ。
**Baseline**: `next-feature-prioritization-after-relations-wave.md` の P1（inbox 軸）。

---

## 1. Explicit design answers

### Q1. "recent" の判定キー
**`updated_at` desc を主キー**。`created_at` は存在するが:
- 新規作成直後は `updated_at === created_at`、つまり top に出る → 新規側の気づきが自動で成立
- 編集すると `updated_at` が更新されて再浮上 → "最近アクティブ" 意図が表現できる
- 別 sort key を持たないため **field の二重管理が不要**

同時刻のタイブレーク:
1. `created_at` desc（同じ updated でも新しく作られた方を上）
2. `lid` asc（完全決定論にする）

### Q2. 対象範囲
**user entry のみ**（`isUserEntry` gate）。system-about / system-settings は除外。archetype 限定はしない（folder / attachment 等も候補）。

### Q3. 表示件数
**固定 10 件**。sidebar の縦占有を抑えるため。11 件目以降は tree / 検索で到達する設計。

### Q4. 配置
**sidebar 内**、sort-controls の直後 / archive-toggle の直前。
形式: `<details data-pkc-region="recent-entries" open>` + `<summary>` + `<ul>`。

- `open` 既定で発見性を確保
- native `<details>` なので keyboard 操作は browser 任せ（Tab で summary focus、Enter で開閉）

### Q5. クリック挙動
- **single click**: `SELECT_ENTRY` + 必要なら `SET_VIEW_MODE: detail` へ遷移（tree と同じ）
- **double click**: `handleDblClickAction` を経由して editor open（tree と同じ）
- **ctrl/meta click / shift click**: **無効**（v1 では multi-select / range-select を recent pane から開始させない。概念として "recent は補助ビュー" なので選択集合構成の起点にはしない）
- 新 action name: `select-recent-entry`。reducer 側の dispatch は `SELECT_ENTRY` を流用

理由: tree の `select-entry` action と**同じ名前を使わない**ことで、sidebar keyboard-nav / 他 view の DOM 走査クエリが recent pane を巻き込まない。contract 面でも "recent pane は独自クリック窓" と明示される。

### Q6. empty state
- **user entry が 0 件**: pane 自体を描画しない（orphan marker の非描画 gate と同じポリシー）
- **10 件未満**: 現にある件数だけ並べる（埋め草の placeholder は出さない）

### Q7. 選択状態との相互作用
- 選択中 lid が recent pane 内に出現する場合: **同じ `[data-pkc-selected]` 属性**で tree 側と同じスタイル適用
- 選択しても tree 側の展開 / スクロール挙動には触れない（SELECT_ENTRY 経由で reducer が一本化しているため自動追従）

## 2. 配置と表示仕様

### 2.1 DOM

sort-controls 直後、archive-toggle 直前に:

```html
<details class="pkc-recent-pane" data-pkc-region="recent-entries" open>
  <summary class="pkc-recent-summary">Recent (10)</summary>
  <ul class="pkc-recent-list">
    <li class="pkc-recent-item"
        data-pkc-action="select-recent-entry"
        data-pkc-lid="<lid>"
        data-pkc-selected?="true">
      <span class="pkc-recent-icon">📝</span>
      <span class="pkc-recent-title">Entry title</span>
    </li>
    <!-- up to 10 -->
  </ul>
</details>
```

### 2.2 行の内容

- **archetype icon**: `archetypeIcon()` を流用（tree と同じ絵文字）
- **title**: `entry.title || '(untitled)'`
- **時刻表示なし**（v1）: 順序そのものが recency を表現する。行が詰まらない

### 2.3 summary の件数表示
`<summary>` は `"Recent (N)"` 形式。N は実際に列挙した件数（max 10）。ユーザが container の規模を把握する補助に使う。

### 2.4 非描画条件
- `state.container` が `undefined` / `null`
- user entries が 0 件

どちらも orphan marker と同じ gate 方針。

## 3. pure helper 契約

`src/features/entry-order/recent-entries.ts`:

```ts
export function selectRecentEntries(
  entries: readonly Entry[],
  limit?: number,   // default 10
): Entry[];
```

### 3.1 仕様
- **評価スコープ**: `isUserEntry(entry)` を満たすもののみ（system-* は除外）
- **sort key**:
  1. `updated_at` desc
  2. `created_at` desc（tie 時）
  3. `lid` asc（tie 時）
- **limit**: デフォルト 10。0 以下なら `[]`、`entries.length` 未満なら先頭 `limit` 件、以上なら全件
- **in-place 変更しない**: 入力 `entries` は変更しない（`[...entries].sort(...)`）
- **decoration なし**: 戻り値は `Entry` 配列そのまま。renderer 側で見せ方を決める

### 3.2 determinism
同一 `(updated_at, created_at, lid)` tuple の input に対して戻り値は**必ず同一順**。fixture test での安定を担保。

## 4. action-binder 契約

### 4.1 新ケース `select-recent-entry`

```text
case 'select-recent-entry': {
  if (!lid) break;
  const me = e as MouseEvent;
  if (me.detail >= 2) {
    handleDblClickAction(target, lid);
    break;
  }
  if (dispatcher.getState().viewMode !== 'detail') {
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
  }
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  break;
}
```

### 4.2 tree の `select-entry` と異なる点
- `ctrl/meta + click` → multi-select しない（tree のみ）
- `shift + click` → range-select しない（tree のみ）

→ v1 では recent pane からの選択は**単独選択 / 開くのどちらか**のみ。複数選択を始めたいなら tree 側で開始する。

### 4.3 dispatch 履歴
single click で:
1. `SET_VIEW_MODE` dispatch（非 detail 時のみ）
2. `SELECT_ENTRY` dispatch

reducer 側は既存経路を一切変更しない。

## 5. CSS

新規追加（`src/styles/base.css`）:

- `.pkc-recent-pane` — container
- `.pkc-recent-summary` — `<summary>` の font / padding / cursor
- `.pkc-recent-list` — list-style none / margin / padding
- `.pkc-recent-item` — flex / gap / hover
- `.pkc-recent-item[data-pkc-selected="true"]` — 選択時背景
- `.pkc-recent-icon` — archetype 絵文字の固定幅
- `.pkc-recent-title` — ellipsis / 1 行省略

v1 viewer / sidebar 既存 CSS には触れない（完全 additive）。

## 6. 既存挙動の維持

- `container` schema 不変、reducer 不変、新 UserAction ゼロ、新 DomainEvent ゼロ
- sidebar keyboard-nav（`[data-pkc-action="select-entry"]` スキャン）は pane items を**拾わない**（異なる action name `select-recent-entry`）
- calendar / kanban / detail 各 view のロジック不変
- archetype filter / sort controls / search box は recent pane に**影響しない**（recent pane は生の `container.entries` から直接派生、filter state を読まない）
- tag-filter 有効時でも recent pane は container 全体から出す（"最近" の軸で絞り込まない、UX 一貫性優先）
- v1 orphan marker / v3 connectedness marker は tree 内の per-row 装飾であり、recent pane には付けない（混雑回避）

## 7. 実装量

| ファイル | 変更 |
|---|---|
| `src/features/entry-order/recent-entries.ts` | 新規 pure helper |
| `src/adapter/ui/renderer.ts` | `renderRecentEntriesPane(state)` 追加、`renderSidebar` から呼び出し |
| `src/adapter/ui/action-binder.ts` | `case 'select-recent-entry'` 追加 |
| `src/styles/base.css` | `.pkc-recent-pane` 系 6 クラス |
| `tests/features/entry-order/recent-entries.test.ts` | 新規 pure unit tests |
| `tests/adapter/renderer.test.ts` | recent pane DOM tests（存在 / ordering / selected highlight / 非描画 gate） |
| `tests/adapter/recent-entries.test.ts` | 新規 E2E（click → SELECT_ENTRY / double click → editor） |
| `docs/development/recent-entries-pane-v1.md` | 本書 |
| `dist/{bundle.js,bundle.css,pkc2.html}` / `PKC2-Extensions/pkc2-manual.html` | rebuild |

## 8. Validation

| 項目 | 基準 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 全 pass（新規 unit + DOM + E2E 込み） |
| `npm run build:bundle` | OK（bundle.css / bundle.js は additive 増分） |
| `npm run build:release` | OK |
| `npm run build:manual` | OK |

## 9. 非スコープ（v1+）

- **時刻表示**（"5m ago" / ISO）: v1 では省略。必要性が実需で出たら v1.x で追加
- **pane 内検索 / filter**: v1 で入れない。sidebar の filter を使う
- **ranking の高度化**（archetype 重み / 編集頻度など）: v1 は timestamp only
- **pinned recents**: 明示固定は v1 では入れない
- **multi-select / range-select from recent pane**: v1 で禁止（§4.2）
- **keyboard navigation の recent pane 独自化**: native `<details>`/`<summary>` に委譲
- **telemetry / activity history timeline**: 近い将来入れない（prioritization memo §5）

## 10. 関連文書

- `docs/development/next-feature-prioritization-after-relations-wave.md` — P1 出典
- `docs/development/connectedness-s4-v1.md` — orphan marker（対の概念）
- `docs/development/archived/entry-autocomplete/entry-autocomplete-v1.3-recent-first.md` — "書き" 側の recent 実装
- `docs/spec/entry-ordering-v1-behavior-contract.md` — snapshotEntryOrder の sort 規範
- `src/features/entry-order/recent-entries.ts` — pure helper
- `src/adapter/ui/renderer.ts` — `renderRecentEntriesPane`
- `src/adapter/ui/action-binder.ts` — `select-recent-entry` case
- `src/styles/base.css` — `.pkc-recent-*`
