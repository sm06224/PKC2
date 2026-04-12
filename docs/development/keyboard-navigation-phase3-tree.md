# Keyboard Navigation Phase 3: Arrow Left / Right (Tree Collapse / Expand)

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Scope

### Today

- Arrow Right: collapse 中の folder を展開する
- Arrow Left: expand 中の folder を折りたたむ
- sidebar の現在選択項目 (`selectedLid`) に対して動作
- 既存の `TOGGLE_FOLDER_COLLAPSE` action を再利用
- 選択状態を変更しない（Left/Right は展開/折りたたみ操作のみ）

### Not Today

- Arrow Up / Down の再定義
- Enter の再定義
- Calendar / Kanban のキーボード移動
- Arrow Left で親フォルダへ移動
- Arrow Right で子の先頭を選択
- multi-select keyboard 拡張
- ツリー階層間ジャンプの高度化

---

## B. Guard Conditions

| Condition | Arrow Left/Right fires? | Reason |
|-----------|------------------------|--------|
| `phase === 'ready'`, folder selected | YES | Normal operation |
| `phase === 'editing'` | NO | editing guard |
| `selectedLid === null` | NO | Nothing to act on |
| selected entry is not a folder | NO | Left/Right only affect folders |
| input / textarea / select focused | NO | Browser default (cursor move) |
| contenteditable focused | NO | Same |
| Ctrl / Meta + Arrow | NO | Browser default (word jump) |
| Shift + Arrow | NO | Reserved |
| Alt + Arrow | NO | Reserved |
| readonly mode | YES | Collapse state is runtime-only UI, not data |
| overlay / menu / picker open | NO | Handled by existing early return |

---

## C. Source of Truth

### Collapse State

`AppState.collapsedFolders: string[]` — collapsed folder lids のセット。

- `collapsedFolders.includes(lid)` → collapsed
- `!collapsedFolders.includes(lid)` → expanded (default)

純粋に state ベースで判定可能。DOM を読む必要はない。

### Entry Archetype

`entry.archetype === 'folder'` で folder 判定。
`state.container.entries` から selectedLid に一致する entry を取得して判定する。

---

## D. Action Definitions

| Key | Condition | Action |
|-----|-----------|--------|
| Arrow Right | folder が collapsed | `TOGGLE_FOLDER_COLLAPSE` → expand |
| Arrow Right | folder が expanded | no-op |
| Arrow Left | folder が expanded | `TOGGLE_FOLDER_COLLAPSE` → collapse |
| Arrow Left | folder が collapsed | no-op |
| Either | non-folder selected | no-op |
| Either | no selection | no-op |

### TOGGLE_FOLDER_COLLAPSE の挙動

Reducer は `collapsedFolders` 配列から lid を add/remove するだけ。
Container は変更しない。DomainEvent も emit しない。
readonly でもブロックされない（runtime-only UI state）。

---

## E. Keydown Cascade (updated)

```
handleKeydown:
  1. overlay / menu / autocomplete / import early return
  2. Escape cascade
  3. Arrow Up / Down (sidebar navigation)
  4. Arrow Left / Right (tree collapse/expand)  ← NEW
  5. Enter (begin edit)
  6. Ctrl+N (new entry)
```

---

## F. Non-goals (explicit)

- **親ノードへの移動**: Arrow Left で collapsed folder にいるとき、
  親 folder へ `SELECT_ENTRY` する機能は今回含まない。
  理由: tree 構造の parent 解決が必要で、コスト/リスクが見合わない。
- **子の自動選択**: Arrow Right で展開後に最初の子を選択する機能は含まない。
  Arrow Down で移動すればよく、自動選択は予期しない挙動になりうる。
- **tree grid 型の完全 keyboard UX**: WAI-ARIA tree grid pattern は
  将来の検討対象だが、今回のスコープ外。

> **Note (2026-04-11)**:
> 以下の項目は後続フェーズで実装済み:
> - 親ノードへの移動 → Phase 4 (`keyboard-navigation-phase4-parent.md`)
> - 子ノードの選択 → Phase 5 (`keyboard-navigation-phase5-child.md`)
