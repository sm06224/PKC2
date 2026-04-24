# FI-12 UI テーマ（scanline / Kanban highlight） v1 Behavior Contract

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。FI-12 v1 本体は 2026-04-18 commit `9078e90`、FI-12 follow-up は commit `c68f1da` で closing。実装の現物は `src/adapter/state/app-state.ts` の `showScanline` / `accentColor` / `TOGGLE_SCANLINE` / `SET_ACCENT_COLOR` 系 / `tests/adapter/fi12-scanline-kanban.test.ts` / Shell menu の scanline + accent UI。本書は behavior contract / historical design record として保持。
Pipeline position: behavior contract  
Predecessor: `docs/spec/ui-theme-customizable-accent-scanline-v1-minimum-scope.md`

---

## 0. 位置づけ

本文書は FI-12 v1 の実装者が迷わず進めるための確定仕様書。  
minimum scope で「何を対象にするか」を定義したのに対し、本文書は「state の形・action・CSS contract・UI DOM・不変条件」を逐条で固定する。

---

## 1. Scope

### 1-1. 対象

| 対象 | 変更内容 |
|------|---------|
| `AppState.showScanline` | 新規追加: `boolean?`（undefined = false） |
| `UserAction` 型 | `TOGGLE_SCANLINE` 新規追加 |
| `base.css` — スキャンライン | `@media` 常時 ON → `data-pkc-scanline="on"` opt-in に変更 |
| `base.css` — Kanban drag-over | `background: var(--c-accent)` → 半透明化（非設定） |
| `renderer.ts` — スキャンライン UI | theme section に toggle ボタン追加 |
| `renderer.ts` — root 属性 | `data-pkc-scanline` 属性を showScanline に連動して付与/削除 |

### 1-2. 非対象

- localStorage / IndexedDB への scanline 設定の永続化（v1 はセッション限り）
- アクセントカラーの変更（v1.x）
- ダーク/ライトモードの切替（既存 `data-pkc-theme` の責務）
- Kanban 以外のドラッグ drag-over ハイライト変更（sidebar drop zone は現行維持）
- Kanban 選択カードの border/inset shadow（現行の `data-pkc-selected="true"` は問題なし）

---

## 2. State contract

### 2-1. AppState 型変更

```typescript
// 追加フィールド（optional — 既存テスト fixture を壊さない）
showScanline?: boolean;  // undefined は false と等価
```

### 2-2. 初期値

```typescript
showScanline: false,
```

### 2-3. `showScanline` の意味

| 値 | 意味 | `#pkc-root` の状態 |
|----|------|-------------------|
| `false` / `undefined` | スキャンライン非表示 | `data-pkc-scanline` 属性なし |
| `true` | スキャンライン表示 | `data-pkc-scanline="on"` |

---

## 3. Action contract

### 3-1. `TOGGLE_SCANLINE`

```typescript
{ type: 'TOGGLE_SCANLINE' }
```

**Reducer**（`reduceReady` に追加）:

```typescript
case 'TOGGLE_SCANLINE': {
  return { state: { ...state, showScanline: !(state.showScanline ?? false) }, events: [] };
}
```

- ドメインイベントを発行しない
- `ready` フェーズ限定（editing / exporting 中は無視 — 既存の phase dispatch パターン）

---

## 4. CSS contract

### 4-1. スキャンライン（opt-in 化）

**現行（削除する）**:

```css
@media (prefers-color-scheme: dark) {
  #pkc-root::after { content: ''; position: fixed; inset: 0; z-index: 9999;
    background: repeating-linear-gradient(...); }
}
@media not all and (prefers-color-scheme: light) {
  #pkc-root::after { /* 同上 */ }
}
```

**変更後（opt-in）**:

```css
#pkc-root[data-pkc-scanline="on"]::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,0.04) 2px,
    rgba(0,0,0,0.04) 4px
  );
}
```

- `@media` ブロックは完全削除
- `data-pkc-theme="dark"` ブロックへの scanline 追加は**しない**（テーマとスキャンラインは独立）
- ライトモードで `showScanline=true` にした場合も `::after` が表示されるが、薄いグラデーションのため視認性への影響は軽微で許容する

### 4-2. Kanban drag-over ハイライト緩和

**現行**（Kanban 列の drag-over — 問題箇所）:

```css
/* base.css l.2816 — 全 drag-over ターゲット共通 */
[data-pkc-drag-over="true"] {
  background: var(--c-accent) !important;      /* 100% opacity — 問題 */
  color: var(--c-accent-fg) !important;
  ...
}
```

**変更後**（Kanban 列専用セレクタを追加して上書き）:

```css
/* Kanban column drop target: accent 12% + border のみ（テキスト読める）*/
.pkc-kanban-list[data-pkc-drag-over="true"] {
  background: color-mix(in srgb, var(--c-accent) 12%, transparent) !important;
  color: var(--c-fg) !important;
  outline: 2px dashed var(--c-accent);
}
```

- **`[data-pkc-drag-over="true"]` グローバルセレクタは変更しない**（sidebar folder drop target に影響するため）
- Kanban column（`.pkc-kanban-list`）のみ上書きで緩和
- `color-mix(in srgb, var(--c-accent) 12%, transparent)` は既存 `base.css:4427` で使用済みの確立値
- 新 CSS 変数 `--c-kanban-drag-over-bg` を追加し、実際の値はこの変数経由にする（v1.x でのテーマ依存変更のフック点）

```css
:root {
  --c-kanban-drag-over-bg: color-mix(in srgb, var(--c-accent) 12%, transparent);
}
.pkc-kanban-list[data-pkc-drag-over="true"] {
  background: var(--c-kanban-drag-over-bg) !important;
  color: var(--c-fg) !important;
  outline: 2px dashed var(--c-accent);
}
```

### 4-3. Kanban カード選択状態（変更しない）

```css
/* 現行のまま維持 — border + inset shadow で十分読める */
.pkc-kanban-card[data-pkc-selected="true"] {
  border-color: var(--c-accent);
  box-shadow: inset 0 0 0 1px var(--c-accent);
}
```

---

## 5. UI contract（DOM selectors）

### 5-1. スキャンライン toggle ボタン

```
data-pkc-action="toggle-scanline"
data-pkc-active="true"  when showScanline === true
data-pkc-active="false" when showScanline === false / undefined
```

配置: 既存の theme section（Dark / Light / Auto ボタン列）の直後に専用行として追加。

### 5-2. root 属性（renderer が render ごとに同期）

```
showScanline === true  → #pkc-root に data-pkc-scanline="on" をセット
showScanline === false → #pkc-root から data-pkc-scanline 属性を削除（removeAttribute）
```

renderer は `state.showScanline` の変化を毎 render 反映する（既存の `data-pkc-theme` 反映と同じパターン）。

---

## 6. Invariants

### I-FI12-1 — デフォルト OFF

`createInitialState()` の `showScanline` は `false`。ページ読み込み直後にスキャンラインが表示されることはない。

### I-FI12-2 — persistence なし

`TOGGLE_SCANLINE` はセッション内のみ有効。ページリロード後は必ず OFF に戻る（AppState は再初期化されるため）。

### I-FI12-3 — テーマと独立

`SET_THEME`（dark/light/system）アクションは `showScanline` を変更しない。スキャンラインとテーマは独立した軸。

### I-FI12-4 — silent reset 不可

`SELECT_ENTRY` / `BEGIN_EDIT` / `CLEAR_FILTERS` / `SET_VIEW_MODE` など、スキャンラインをリセットする意図のないアクションで `showScanline` は変化しない。

### I-FI12-5 — Kanban 読み取り保証

`pkc-kanban-list[data-pkc-drag-over="true"]` の背景に対して、`--c-fg` 色テキストが **4.5:1 以上** のコントラスト比を持つ（WCAG AA 準拠）。  
`color-mix(in srgb, var(--c-accent) 12%, transparent)` は dark theme で `#0d0f0a` bg 上で約 `#0d0f0a + 0.12 × #33ff66` = ~`#0f1a0d`。`--c-fg`（`#c8d8b0`）とのコントラストは十分。

### I-FI12-6 — Kanban カード選択状態は変更しない

`.pkc-kanban-card[data-pkc-selected="true"]` のスタイルは今回変更しない。border + inset shadow は読み取りを妨げない。

---

## 7. Error paths / edge cases

| 状況 | 挙動 |
|------|------|
| `TOGGLE_SCANLINE` を editing 中に dispatch | phase gate で無視（state 変化なし） |
| ライトモード + `showScanline=true` | `::after` が表示されるが色が薄いため実害なし |
| `data-pkc-scanline` 属性を手動で設定した場合 | renderer の次回 render で `showScanline` に合わせて上書き |
| Container が null の状態で `TOGGLE_SCANLINE` | ready phase ではないため gate で無視 |

---

## 8. Testability

### Pure unit（CSS 変数の存在確認）

| # | テスト |
|---|--------|
| 1 | `createInitialState().showScanline` が `false` |
| 2 | `TOGGLE_SCANLINE` on `showScanline=false` → `true` |
| 3 | `TOGGLE_SCANLINE` on `showScanline=true` → `false` |
| 4 | `TOGGLE_SCANLINE` で domainEvents は空 |
| 5 | editing フェーズで `TOGGLE_SCANLINE` → state 変化なし |

### Renderer（DOM / attribute）

| # | テスト |
|---|--------|
| 6 | `showScanline=false` → `#pkc-root` に `data-pkc-scanline` 属性なし |
| 7 | `showScanline=true` → `#pkc-root[data-pkc-scanline="on"]` |
| 8 | toggle ボタンが `data-pkc-action="toggle-scanline"` を持つ |
| 9 | `showScanline=true` → toggle ボタンに `data-pkc-active="true"` |
| 10 | `showScanline=false` → toggle ボタンの `data-pkc-active` が `"false"` または属性なし |

---

## 9. Non-goal / v1.x 余地

| 項目 | フェーズ |
|------|---------|
| Persistence（localStorage / IDB） | v1.x（設定統合 FI） |
| アクセントカラー変更 | v1.x（`--c-accent` CSS 変数オーバーライド経路が必要） |
| スキャンライン強度調整（opacity パラメータ） | v1.x |
| `--c-kanban-drag-over-bg` のユーザー設定化 | v1.x |
| global `[data-pkc-drag-over="true"]` の緩和 | 別途評価（sidebar UX への影響確認が必要） |

---

## References

- Minimum scope: `docs/spec/ui-theme-customizable-accent-scanline-v1-minimum-scope.md`
- `src/styles/base.css` — `:root` / `data-pkc-theme` / `::after` / `.pkc-kanban-*`
- `src/adapter/state/app-state.ts` — `lightSource?: boolean` パターン（established）
- `src/adapter/ui/renderer.ts` — `getCurrentThemeMode()` / `set-theme` action / `buildStorageProfileOverlay`
