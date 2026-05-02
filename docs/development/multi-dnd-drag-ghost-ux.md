# Multi-DnD Drag Ghost UX Improvement

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11
Parent: `archived/multi-select/calendar-kanban-multi-select-phasing.md`

---

## A. Scope

### 今回やること

- multi-drag 時に drag ghost を「N 件」バッジに置き換え、複数件操作中であることを視覚的に示す
- Kanban / Calendar の multi-drag に共通適用（共通ヘルパー関数）
- single-drag では現行挙動維持（ブラウザデフォルトの要素スナップショット）

### 今回やらないこと

- drag preview の全面再設計（カード複製、スタック表示等）
- reducer / action の変更
- selection semantics の変更
- Sidebar DnD
- Phase 2-D の表示順修正

---

## B. 表示方針

### 候補比較

| 案 | 方法 | 利点 | 欠点 |
|----|------|------|------|
| A | `N 件` テキストバッジ (`setDragImage`) | 最小実装。ブラウザ差異に強い。DOM 1 要素 | カード外観を再現しない |
| B | 元カード複製 + 件数オーバーレイ | 見た目が自然 | cloneNode のスタイル解決が環境依存。重い |
| C | 半透明スタック + カウンター | 最もリッチ | 実装コスト大。scope 超過 |

### 採用: 案 A — `N 件` テキストバッジ

**なぜ最小か**:
- DOM 要素 1 個、inline style のみ、CSS クラス不要
- ヘルパー関数 10 行 + cleanup 4 行
- Kanban / Calendar で共通の 1 関数を呼ぶだけ

**なぜ視認性が十分か**:
- アクセントカラー背景 + 白文字の高コントラストバッジ
- `N 件` のテキストが「複数選択中」を即座に伝える
- multi-action bar にも件数表示があるため、バッジはサブ情報で十分

**なぜブラウザ差異に耐えやすいか**:
- `setDragImage` は主要ブラウザ (Chrome/Firefox/Safari/Edge) で安定サポート
- inline style のみ使用（CSS 変数の解決は setDragImage 時点で document 内にあるため安全）
- cloneNode 不使用 → スタイル継承の環境依存問題を回避
- `setDragImage` が効かない環境では、try/catch 不要 — ブラウザデフォルト ghost が表示される（安全側フォールバック）

---

## C. Single vs Multi

| 状況 | drag ghost |
|------|-----------|
| single-drag (`isMultiDrag = false`) | 現行どおり（ブラウザデフォルトの要素スナップショット） |
| multi-drag (`isMultiDrag = true`) | `N 件` テキストバッジ |

判定は既存の `isMultiDrag` flag を使い、dragStart 内で分岐。

---

## D. Fallback

- `setDragImage` が効かない環境: ブラウザデフォルトの ghost（ドラッグ元要素のスナップショット）が表示される
- ghost 用 DOM 要素の作成・追加に失敗しても、DnD 機能自体は正常に動作する
- **機能より安全側優先**: ghost 表示は装飾であり、失敗しても drop 処理に影響しない

---

## E. 実装設計

### 一時 DOM 管理

```
module-level: multiDragGhostEl: HTMLElement | null = null

setMultiDragGhost(e, count):
  ghost = createElement('div')
  ghost.textContent = `${count} 件`
  ghost.style = 固定位置 off-screen + accent 背景 + 白文字
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, 0, 0)
  multiDragGhostEl = ghost

removeMultiDragGhost():
  if (multiDragGhostEl) ghost.remove(); multiDragGhostEl = null
```

### 呼び出し箇所

| イベント | 設定 |
|---------|------|
| `handleKanbanDragStart` | `if (isMultiDrag) setMultiDragGhost(e, selected.length)` |
| `handleCalendarDragStart` | 同上 |
| `handleKanbanDrop` | `removeMultiDragGhost()` |
| `handleCalendarDrop` | `removeMultiDragGhost()` |
| `handleKanbanDragEnd` | `removeMultiDragGhost()` |
| `handleCalendarDragEnd` | `removeMultiDragGhost()` |
| `clearAllDragState` | `removeMultiDragGhost()` |

### cleanup 保証

- drop 成功: drop handler で除去
- drag キャンセル (dragEnd without drop): dragEnd handler で除去
- 異常系: `clearAllDragState` safety net で除去
- 3 重の cleanup 経路で ghost DOM の残留を防止
