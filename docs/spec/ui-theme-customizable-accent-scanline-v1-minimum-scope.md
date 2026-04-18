# FI-12 UI テーマ設定化（視認性改善） v1 — Minimum Scope

Status: DRAFT 2026-04-18  
Pipeline position: minimum scope  
Predecessor: `docs/planning/file-issues/12_ui-theme-customizable-accent-scanline.md`

---

## 0. 問題の切り分け

FI-12 には以下の 3 つの要素が混在している。v1 minimum scope では **どれをユーザー設定にするか** を明確に切り分ける。

| 要素 | v1 分類 | 理由 |
|------|---------|------|
| スキャンライン ON/OFF | **ユーザー設定** | シンプルな boolean、UX インパクト大 |
| Kanban ハイライト強度 | **CSS 修正（非設定）** | 現行値が過剰なバグに近い、ユーザーが調整する必然性なし |
| アクセントカラー変更 | **v1.x** | カラーピッカー or プリセット UI が必要で重い |

---

## 1. Scope / 非対象

### v1 対象

| 変更 | 種別 |
|------|------|
| スキャンライン（走査線装飾）の ON/OFF トグル | ユーザー設定（AppState + localStorage） |
| Kanban 選択カード ハイライト強度の緩和 | CSS 修正（設定不要、1 回のみ変更） |

### 非対象

- アクセントカラーの自由選択・プリセット選択
- ダーク / ライトモード本格切替（既存の `data-pkc-theme` 機構で対応済み）
- フォント変更
- 印刷用スタイル
- テーマプリセットの保存 / インポート
- CSS 変数の全面ユーザー設定化

---

## 2. スキャンライン設定（user-configurable）

### 2-1. 現状

```css
/* base.css: 現行実装（ダークモード限定で常時 ON） */
@media (prefers-color-scheme: dark) {
  #pkc-root::after { /* repeating-linear-gradient scanline */ }
}
@media not all and (prefers-color-scheme: light) {
  #pkc-root::after { /* 同上 */ }
}
```

ユーザーが OFF にする手段がない。

### 2-2. v1 変更方針

現行の `@media` ベース常時 ON を **opt-in 方式**に切り替える。

```css
/* base.css: v1 変更後（opt-in） */
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

`@media (prefers-color-scheme: dark)` ブロックの `::after` は削除する。  
ライトモードではスキャンラインを提供しない（現行と同じ）。

### 2-3. デフォルト値

| 項目 | 値 |
|------|-----|
| デフォルト | **OFF**（`data-pkc-scanline` 属性なし = スキャンライン非表示） |
| ON にする条件 | ユーザーが設定 UI でトグルした場合のみ |

デフォルトを OFF にする理由: 視認性問題の主因であり、ON がほしいユーザーは明示的に有効化できる。

### 2-4. State

```typescript
// AppState に追加（optional — 既存テスト fixture を壊さない established pattern）
showScanline?: boolean;  // undefined = false と等価

// 初期値
showScanline: false,
```

### 2-5. Persistence

localStorage キー: `pkc-theme-scanline` (`"on"` | `"off"`)  
ブート時に読み出し → AppState に反映 → `#pkc-root` に `data-pkc-scanline` を設定する。  
既存の `pkc-pane-prefs` と同系の localStorage 流儀に従う。

### 2-6. DOM contract

```
#pkc-root[data-pkc-scanline="on"]  → スキャンライン表示
#pkc-root（属性なし）              → スキャンライン非表示（デフォルト）
```

### 2-7. Action

```typescript
{ type: 'TOGGLE_SCANLINE' }
// または
{ type: 'SET_SCANLINE'; on: boolean }
```

behavior contract で決定する（どちらでもよい）。

### 2-8. UI 配置

既存のテーマ設定セクション（Dark / Light / Auto ボタン列）の隣 or 直下に `Scanline` トグルボタンを追加する。  
実装詳細は behavior contract で固定する。

---

## 3. Kanban ハイライト緩和（CSS 修正、非設定）

### 3-1. 現状の問題

Kanban の選択状態 / hover ハイライトが `--c-accent`（`#33ff66` ネオングリーン, 100% opacity）をそのまま使用しており、カード本文が読めなくなる場合がある。

### 3-2. v1 修正方針

Kanban 選択カードの背景色を alpha を落とした **half-tone accent** に変更する（ユーザー設定なし、CSS 定数変更のみ）。

```css
/* 例: 10〜15% alpha 程度に抑える */
/* 現行: background: var(--c-accent); — 変更前 */
/* 修正後: background: rgba(51, 255, 102, 0.12); or --c-kanban-select-bg */
```

具体的な値は behavior contract ではなく implementation 段階で視認性テストを経て確定する（選択時に文字が読めることが合格基準）。

新 CSS 変数 `--c-kanban-select-bg` をテーマ変数として切り出すことを推奨する（将来の accent color 変更のフック点になる）。

### 3-3. 対象箇所

behavior contract で下記の CSS クラス / セレクタを列挙してから実装に入る:
- Kanban カード選択状態（`data-pkc-selected="true"` 系）
- Kanban ドラッグ中ゴースト
- Kanban hover 状態

---

## 4. 設定値のデフォルトまとめ

| 設定 | デフォルト | 最初の render |
|------|-----------|--------------|
| スキャンライン | OFF | `data-pkc-scanline` 属性なし |
| Kanban ハイライト | 緩和済み（CSS 定数） | CSS 変数で固定 |

---

## 5. Persistence モデル（概要）

```
ブート時:
  localStorage.getItem('pkc-theme-scanline')
  → 'on'  → AppState.showScanline = true  → root に data-pkc-scanline="on" 付与
  → それ以外 → AppState.showScanline = false → 属性付与なし

設定変更時:
  TOGGLE_SCANLINE dispatch → reducer → AppState.showScanline 更新
  → renderer が #pkc-root に data-pkc-scanline を反映
  → localStorage.setItem('pkc-theme-scanline', ...) を副作用で実行
```

AppState への格納は runtime-only だが、 UI 表示に必要なため AppState に持つ（`lightSource` と同じ扱い）。

---

## 6. 既存設計との整合

| 項目 | 既存パターン | FI-12 での扱い |
|------|------------|--------------|
| テーマ属性 | `data-pkc-theme="light/dark"` on `#pkc-root` | `data-pkc-scanline="on"` を同じ root に追加 |
| 設定 UI | renderer の theme section に Dark/Light/Auto ボタン | 同セクションに Scanline トグル追加 |
| optional state フィールド | `archetypeFilterExpanded?: boolean` など | `showScanline?: boolean` で同パターン |
| localStorage 永続化 | `pkc-pane-prefs` | `pkc-theme-scanline` を独立キーで追加 |

CSS 変数構造（`--c-accent` 等）は v1 では変更しない。アクセントカラー変更は v1.x 以降で `--c-accent` を CSS 変数経由でオーバーライドする設計にする。

---

## 7. 非対象の明確化

| 項目 | 理由 |
|------|------|
| アクセントカラーピッカー | カラーUI が重い。behavior contract 前にコストが定まらない |
| ダーク / ライト mode 切替 | `data-pkc-theme` で既存実装あり。FI-12 の責務外 |
| テーマプリセット | 保存 / 読み込み機能が別途必要 |
| `.pkc-tok-*` トークン変更 | planning doc で「分離して設計する」と明記 |
| Calendar / タグカラー | Kanban ハイライトと独立した問題 |
| CSS カスタムプロパティ全公開 | over-engineering |

---

## References

- `docs/planning/file-issues/12_ui-theme-customizable-accent-scanline.md`
- `src/styles/base.css` — `:root` / `data-pkc-theme` / `::after` 実装
- `src/adapter/state/app-state.ts` — `lightSource: boolean` パターン（optional フィールドの先例）
- `src/adapter/ui/renderer.ts` — `set-theme` action / `data-pkc-theme-mode` セクション
