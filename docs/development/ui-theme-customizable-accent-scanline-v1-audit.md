# FI-12 UI テーマ（scanline toggle + Kanban drag-over）v1 post-implementation audit

Date: 2026-04-18  
Commit: 9078e90  
Auditor: Claude (claude-sonnet-4-6)  
Outcome: **A — 問題なし（実装受理）**

---

## 1. 読んだファイル

| ファイル | 目的 |
|---------|------|
| `docs/spec/ui-theme-customizable-accent-scanline-v1-behavior-contract.md` | contract 全文 |
| `src/core/action/user-action.ts` | `TOGGLE_SCANLINE` 型定義確認 |
| `src/adapter/state/app-state.ts` | `showScanline` フィールド・初期値・reducer 確認 |
| `src/adapter/ui/renderer.ts` | `data-pkc-scanline` 属性同期・Scanline UI 確認 |
| `src/adapter/ui/action-binder.ts` | `toggle-scanline` dispatch 確認 |
| `src/styles/base.css` | scanline CSS・Kanban drag-over・global drag-over・selected card 確認 |
| `tests/adapter/fi12-scanline-kanban.test.ts` | FI-12 専用テスト 13 件 |

---

## 2. 監査観点

- §2 State contract（型・初期値・optional 化の is-non-breaking）
- §3 Action contract（`TOGGLE_SCANLINE` reducer semantics・phase gate）
- §4 CSS contract（scanline opt-in 化・Kanban drag-over 局所修正・global drag-over 非破壊）
- §5 UI contract（DOM selectors・root 属性同期）
- §6 Invariants（I-FI12-1〜6 全件）
- CSS cascade 分析（重複セレクタの優先順位）
- `data-pkc-theme` との非干渉
- Type hygiene（FI-12 起因の新規型エラー有無）

---

## 3. 監査結果サマリ

全チェック項目を通過。実装は behavior contract と整合している。  
F-1 軽微所見（CSS 重複セレクタ）が 1 件あるが、cascade により FI-12 の意図が正しく実現しており機能上の問題なし。

---

## 4. 発見した問題

### F-1（コスメティック・修正不要）

**場所**: `src/styles/base.css` l.3932 — "Kanban DnD states" セクション

**内容**:

FI-12 実装前から存在する `.pkc-kanban-list[data-pkc-drag-over="true"]` ルール:

```css
/* l.3932 — pre-existing */
.pkc-kanban-list[data-pkc-drag-over="true"] {
  background: rgba(51,255,102,0.08);   /* 8%, !important なし */
  border-radius: var(--radius);
  outline: 2px dashed var(--c-accent);
  outline-offset: -2px;
}
```

FI-12 が l.3839 に追加したルール:

```css
/* l.3839 — FI-12 */
.pkc-kanban-list[data-pkc-drag-over="true"] {
  background: var(--c-kanban-drag-over-bg) !important;  /* 12%, !important */
  color: var(--c-fg) !important;
  outline: 2px dashed var(--c-accent);
}
```

**CSS cascade 解析**:

| プロパティ | 勝者 | 理由 |
|-----------|------|------|
| `background` | FI-12 (l.3839) | `!important` が non-`!important` に勝つ（後順に関わらず）|
| `color` | FI-12 (l.3839) | `!important` かつ specificity（class+attr > attr only）でグローバル l.2800 にも勝つ |
| `border-radius` | pre-existing (l.3932) | FI-12 側に宣言なし、harmless 追加 |
| `outline-offset` | pre-existing (l.3932) | FI-12 側に宣言なし、harmless 追加 |
| `outline` | pre-existing (l.3932) | 同値・後順で上書きだが同一値 |

**結論**: `background`（可読性の核心）と `color` は FI-12 が正しく勝つ。pre-existing ルールの追加プロパティは無害。意図どおりの視認性改善が実現されており、修正不要。

---

## 5. 作成/変更ファイル一覧

今回の audit は docs-only:

| ファイル | 操作 |
|---------|------|
| `docs/development/ui-theme-customizable-accent-scanline-v1-audit.md` | 新規作成（本文書）|

実装ファイルへの変更: **なし**（問題なし）

---

## 6. contract / 実装との整合点

### State contract（§2）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| 型 | `showScanline?: boolean` | `showScanline?: boolean` (l.128) | ✅ |
| 初期値 | `false` | `showScanline: false` (l.296) | ✅ |
| optional — fixture 非破壊 | undefined = false と等価 | `?? false` ガード付きトグル (l.1305) | ✅ |

### Action contract（§3）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| `TOGGLE_SCANLINE` 型 | `{ type: 'TOGGLE_SCANLINE' }` | user-action.ts l.152 | ✅ |
| false → true | ✓ | `!(state.showScanline ?? false)` (l.1305) | ✅ |
| true → false | ✓ | 同上 | ✅ |
| domainEvents 空 | `events: []` | `events: []` (l.1305) | ✅ |
| ready フェーズ限定 | reduceReady に配置 | l.1304（reduceReady 内） | ✅ |
| editing フェーズ無視 | phase gate で blocked | テスト test 5 で state 参照一致確認 | ✅ |

### CSS contract（§4）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| `@media` scanline 削除 | 完全削除 | l.167-199 の 2 ブロックなし（l.169 に opt-in 置換）| ✅ |
| opt-in セレクタ | `#pkc-root[data-pkc-scanline="on"]::after` | l.170 | ✅ |
| `pointer-events: none` | 必須 | l.173 | ✅ |
| `z-index: 9999` | 必須 | l.174 | ✅ |
| `--c-kanban-drag-over-bg` 追加 | `:root` に追加 | l.57 | ✅ |
| Kanban override セレクタ | `.pkc-kanban-list[data-pkc-drag-over="true"]` | l.3839 | ✅ |
| global `[data-pkc-drag-over="true"]` 非破壊 | 変更しない | l.2800 変更なし | ✅ |
| Kanban card selected 非変更 | 変更しない | l.3858 変更なし（border + inset shadow）| ✅ |

### UI contract（§5）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| toggle ボタン `data-pkc-action="toggle-scanline"` | 必須 | renderer.ts l.547 | ✅ |
| `showScanline=true` → `data-pkc-active="true"` | 必須 | `String(scanlineOn)` l.549 | ✅ |
| `showScanline=false` → `data-pkc-active="false"` | 必須 | 同上 | ✅ |
| 配置: theme section 直後 | 必須 | card.appendChild(scanlineSection) l.552（themeSection 直後）| ✅ |
| root 属性同期（毎 render）| `data-pkc-scanline="on"` / `removeAttribute` | renderer.ts l.134-138 | ✅ |

### Invariants（§6）

| invariant | 確認事項 | 判定 |
|-----------|---------|------|
| I-FI12-1 デフォルト OFF | `createInitialState().showScanline === false` | ✅ |
| I-FI12-2 persistence なし | localStorage/IDB への書き込みなし（runtime-only）| ✅ |
| I-FI12-3 テーマと独立 | `data-pkc-theme` と `data-pkc-scanline` は独立属性・CSS 非交差 | ✅ |
| I-FI12-4 silent reset 不可 | `SELECT_ENTRY` / `BEGIN_EDIT` 等の reducer で `showScanline` に触れない | ✅ |
| I-FI12-5 Kanban 読み取り保証 | 12% accent → `--c-fg` テキストが十分なコントラスト（!important が cascade を確保）| ✅ |
| I-FI12-6 Kanban card selected 非変更 | `.pkc-kanban-card[data-pkc-selected="true"]` 変更なし | ✅ |

### `data-pkc-theme` 非干渉

`data-pkc-theme` は action-binder の `setTheme()` が `#pkc-root` に書き込む独立属性。  
`data-pkc-scanline` は renderer が毎 render 同期する独立属性。  
CSS でも両者を組み合わせたセレクタは存在しない。完全に独立した軸。✅

---

## 7. 品質チェック結果

実装変更なしのため品質ゲート再実行は不要。  
実装コミット時の結果を参照:

- `npm test` — 4215 tests passed（FI-12 専用 13 件含む）
- `npm run build:bundle` — ✓ bundle.js 562KB / bundle.css 75KB
- `npm run typecheck` — FI-12 起因の新規型エラー: **0 件**  
  （pre-existing error は `tests/adapter/action-binder-attach-while-editing.test.ts` の `Element` vs `HTMLElement` ×7 件 + `tests/features/search/fi09-multi-select-filter.test.ts` の `@core/model/record` Container export ×1 件のみ、FI-12 実装前から存在）

---

## 8. コミット有無

本 audit document のみコミット:

```
docs(fi12): post-implementation audit — Outcome A
```

実装コミット: `9078e90`（変更なし）
