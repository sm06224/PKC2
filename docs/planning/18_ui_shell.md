# 18. 最小 UI Shell

---

## 18.1 目的

Dispatcher + AppState を起点として、state/action/event と DOM 描画の
接続様式を確立する。feature 実装に進むのではなく、
**PKC2 の UI が何をどう描き、どう反応するかの骨格**を固める。

---

## 18.2 責務分離

| コンポーネント | 置き場 | 責務 | やらないこと |
|--------------|--------|------|------------|
| **Renderer** | `adapter/ui/renderer.ts` | AppState → DOM 投影 | Action dispatch, Event 購読 |
| **ActionBinder** | `adapter/ui/action-binder.ts` | DOM event → UserAction dispatch | DOM 描画, State 管理 |
| **EventLog** | `adapter/ui/event-log.ts` | DomainEvent の開発用表示 | State 変更, Action dispatch |
| **Dispatcher** | `adapter/state/dispatcher.ts` | Action → Reducer → State/Event 配信 | DOM 操作 |
| **main.ts** | `src/main.ts` | 上記の配線 + rehydrate | ビジネスロジック |

### データフロー

```
┌──────────────────────────────────────────────────────────┐
│                    main.ts (配線)                          │
│                                                          │
│  Dispatcher ──onState──→ Renderer ──→ DOM                │
│      ↑                                  │                │
│      └────── ActionBinder ←── click/key ┘                │
│      │                                                   │
│      └──onEvent──→ EventLog ──→ DOM (debug panel)        │
└──────────────────────────────────────────────────────────┘
```

---

## 18.3 Renderer の設計

### 方針

- **一方向**: `render(state, root)` — state から DOM を生成
- **全置換**: `root.innerHTML = ''` して再構築。仮想 DOM は使わない
- **minify-safe**: 機能セレクタは `data-pkc-*` 属性のみ。class は装飾用

### data-pkc-* 属性一覧

| 属性 | 用途 | 例 |
|------|------|-----|
| `data-pkc-phase` | root 要素の現在 phase | `data-pkc-phase="ready"` |
| `data-pkc-action` | クリック可能な action 識別 | `data-pkc-action="select-entry"` |
| `data-pkc-lid` | 対象 Entry の LID | `data-pkc-lid="entry-001"` |
| `data-pkc-selected` | 選択状態 | `data-pkc-selected="true"` |
| `data-pkc-field` | 編集フォームのフィールド名 | `data-pkc-field="title"` |
| `data-pkc-mode` | 詳細領域のモード | `data-pkc-mode="view"` / `"edit"` |
| `data-pkc-region` | UI 領域の識別 | `data-pkc-region="sidebar"` |
| `data-pkc-phase-value` | phase badge の値 | `data-pkc-phase-value="editing"` |

### Shell 構成

```
#pkc-root [data-pkc-phase]
  └── .pkc-shell
      ├── header.pkc-header
      │   ├── span.pkc-header-title (container.meta.title)
      │   ├── span.pkc-phase-badge [data-pkc-phase-value]
      │   └── button [data-pkc-action="create-entry"] (ready時のみ)
      │
      ├── div.pkc-main
      │   ├── aside.pkc-sidebar [data-pkc-region="sidebar"]
      │   │   └── ul.pkc-entry-list
      │   │       └── li [data-pkc-action="select-entry"][data-pkc-lid]
      │   │
      │   └── section.pkc-detail [data-pkc-region="detail"]
      │       ├── (view mode) [data-pkc-mode="view"]
      │       │   ├── h2, pre (title, body)
      │       │   ├── button [data-pkc-action="begin-edit"]
      │       │   └── button [data-pkc-action="delete-entry"]
      │       │
      │       └── (edit mode) [data-pkc-mode="edit"]
      │           ├── input [data-pkc-field="title"]
      │           ├── textarea [data-pkc-field="body"]
      │           ├── button [data-pkc-action="commit-edit"]
      │           └── button [data-pkc-action="cancel-edit"]
```

---

## 18.4 ActionBinder の設計

### 方針

- **イベント委譲**: root に単一の click listener
- **data-pkc-action からの dispatch**: `closest('[data-pkc-action]')` で action を特定
- **キーボード**: document に単一の keydown listener、phase に応じた処理

### action 変換マップ

| data-pkc-action | UserAction | 備考 |
|----------------|------------|------|
| `select-entry` | `SELECT_ENTRY` | `data-pkc-lid` から lid 取得 |
| `begin-edit` | `BEGIN_EDIT` | `data-pkc-lid` から lid 取得 |
| `commit-edit` | `COMMIT_EDIT` | `data-pkc-field` から title/body 取得 |
| `cancel-edit` | `CANCEL_EDIT` | — |
| `create-entry` | `CREATE_ENTRY` | archetype='text', title='New Entry' |
| `delete-entry` | `DELETE_ENTRY` | `data-pkc-lid` から lid 取得 |

### キーボードショートカット

| キー | phase | UserAction |
|------|-------|------------|
| Ctrl+S / Cmd+S | editing | `COMMIT_EDIT` |
| Escape | editing | `CANCEL_EDIT` |
| Escape | ready (selected) | `DESELECT_ENTRY` |
| Ctrl+N / Cmd+N | ready | `CREATE_ENTRY` |

---

## 18.5 DomainEvent の UI 側での扱い

### 現状

DomainEvent は開発用 EventLog で表示するのみ。
UI の描画は **AppState のみ** に基づく（event-driven rendering ではない）。

### 将来

- Undo/Redo: DomainEvent を蓄積して逆操作を生成
- IDB 永続化: `ENTRY_CREATED`, `ENTRY_UPDATED` 等を listen して保存
- 通知: `ERROR_OCCURRED` を listen してトースト表示

---

## 18.6 テスト一覧

| テストファイル | テスト数 | 環境 | 検証内容 |
|--------------|---------|------|---------|
| `tests/adapter/renderer.test.ts` | 9 | happy-dom | 全 phase の描画, data-pkc-* 属性, 選択/編集表示 |
| `tests/adapter/action-binder.test.ts` | 7 | happy-dom | click→dispatch, keyboard→dispatch, cleanup |
| `tests/core/app-state.test.ts` | 17 | node | reducer (既存) |
| `tests/core/dispatcher.test.ts` | 7 | node | dispatcher (既存) |
| `tests/core/action-types.test.ts` | 6 | node | 型境界 (既存) |
| `tests/core/model.test.ts` | 3 | node | domain model (既存) |
| `tests/core/contract.test.ts` | 3 | node | SLOT 定数 (既存) |

合計: **52 テスト**, 7 ファイル

---

## 18.7 今回あえて入れなかったもの

| 項目 | 理由 |
|------|------|
| 仮想 DOM / 差分更新 | 現時点では全置換で十分。パフォーマンス問題が出たら導入 |
| feature 実装 | Shell は feature を持ち込まない |
| persistent mutation | reducer は intent のみ。mutation は次段で |
| i18n | 構造は用意済み（msg() 関数は後で接続） |
| ルーティング | 単一画面 shell では不要 |
| Message transport | Phase 2 |

---

## 18.8 次に着手すべき Issue

| 優先 | Issue | 内容 |
|------|-------|------|
| 次 | **release metadata / manifest** | pkc-meta の型・生成・表示 |
| 次 | **Container mutation** | reducer の ENTRY_CREATED/UPDATED を container に反映 |
| 後 | **IDB 永続化** | DomainEvent listener として実装 |
| 後 | **PKC-Message transport** | Phase 2 |
