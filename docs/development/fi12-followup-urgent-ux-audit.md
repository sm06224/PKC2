# FI-12 Follow-up（Kanban selected / scanline segmented / accent picker）post-implementation audit

Date: 2026-04-18
Commit: c68f1da
Branch: `claude/fi12-followup-urgent-ux`
Auditor: Claude (claude-opus-4-7)
Outcome: **A — 問題なし（実装受理）**

---

## 1. 読んだファイル

| ファイル | 目的 |
|---------|------|
| `src/core/action/user-action.ts` | `SET_SCANLINE` / `SET_ACCENT_COLOR` / `RESET_ACCENT_COLOR` 型定義 |
| `src/adapter/state/app-state.ts` | `accentColor` フィールド・初期値・4 reducer |
| `src/adapter/ui/renderer.ts` | `--c-accent` inline style 同期・scanline segmented control・accent picker UI |
| `src/adapter/ui/action-binder.ts` | `set-scanline` / `set-accent-color` (change handler) / `reset-accent-color` |
| `src/styles/base.css` | Kanban card selected override・global selected rule・drag-over・hardcoded rgba |
| `tests/adapter/fi12-scanline-kanban.test.ts` | FI-12 follow-up テスト 32 件 |
| `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md` | Phase B docs 整合 |

---

## 2. 監査観点

1. Kanban 可読性: selected card text / drag-over 非破壊 / global rule の局所無効化 / 他 selected surface 非破壊
2. Scanline UI: segmented control の状態反映 / 初期 OFF / explicit boolean / TOGGLE_SCANLINE 互換
3. Accent picker: `--c-accent` override + reset / hex 検証 / 既存 accent consumer 整合
4. State / reducer: 型 / 初期値 / explicit setter / idempotency / no silent reset
5. 型安全: 新規型エラー有無
6. Phase B doc: docs-only 確認

---

## 3. 監査結果サマリ

全チェック項目を通過。defect なし。
既知制約として 2 点を記録するが、どちらも設計判断として妥当であり修正不要。

---

## 4. 発見した問題

**なし**（defect なし）

### 既知制約（修正不要）

#### L-1. `--c-accent-fg` / `--c-accent-dim` は追従しない

`--c-accent` をユーザーが変更しても、`--c-accent-fg`（accent 上のテキスト色）と `--c-accent-dim` は CSS 定数のまま。ユーザーが極端に暗い accent を選ぶと、global `[data-pkc-selected="true"]` の `color: var(--c-accent-fg)` がダーク on ダークになる場合がある。

**判定**: 設計判断として妥当。
- スコープは「`--c-accent` を中心に最小差分で実装」
- Reset ボタン（Neon Green に戻す）がエスケープハッチ
- auto-compute は `color-contrast()` が実用化されてから検討すべき
- Phase B 永続化時に accent-fg 自動計算を追加する余地がある

#### L-2. 32 箇所の hardcoded `rgba(51,255,102,...)` は追従しない

glow / text-shadow / hover background など 32 箇所が accent を直接 rgba で指定。`--c-accent` CSS 変数ベースではないため、accent 変更時にこれらは neon green のまま残る。

**判定**: pre-existing の設計選択。follow-up で導入されたものではない。
- 全箇所を `color-mix(in srgb, var(--c-accent) N%, transparent)` に書き換えれば解決するが、
  差分が大きく v1 scope 外
- 主要な視認性箇所（selected / drag-over / border）は `var(--c-accent)` 経由なので追従する
- glow / shadow は装飾的で実害は軽微

---

## 5. 作成/変更ファイル一覧

| ファイル | 操作 |
|---------|------|
| `docs/development/fi12-followup-urgent-ux-audit.md` | 新規作成（本文書）|

実装ファイルへの変更: **なし**

---

## 6. contract / 実装との整合点

### A-1. Kanban selected readability

| 確認事項 | 実装 | 判定 |
|---------|------|------|
| global `[data-pkc-selected]` は Kanban card でのみ局所無効化 | `.pkc-kanban-card[data-pkc-selected="true"]` の `!important` が (0,2,0) specificity で勝つ | ✅ |
| background: 14% accent tint | `color-mix(in srgb, var(--c-accent) 14%, var(--c-bg))` | ✅ |
| color: normal fg | `var(--c-fg) !important` | ✅ |
| 選択状態は border + inset shadow で表現 | `border-color: var(--c-accent); box-shadow: inset 0 0 0 1px var(--c-accent), var(--glow)` | ✅ |
| child badges (archetype / status / task) の色復元 | (0,2,1) specificity で global descendant rule に勝つ | ✅ |
| drag-over 非破壊 | l.3852 `.pkc-kanban-list[data-pkc-drag-over]` 変更なし | ✅ |
| sidebar / calendar / slash-menu selected 非破壊 | global rule (l.699) 変更なし、各独自セレクタも変更なし | ✅ |

### A-2. Scanline segmented control

| 確認事項 | 実装 | 判定 |
|---------|------|------|
| 2 ボタン (Off / On) + `data-pkc-action="set-scanline"` | l.564-572 | ✅ |
| `data-pkc-scanline-value="off"` / `"on"` | l.567 | ✅ |
| active ボタンに `data-pkc-active="true"` + `data-pkc-theme-active="true"` | l.569-570 | ✅ |
| OFF デフォルト | `createInitialState().showScanline === false` → Off active | ✅ |
| `SET_SCANLINE` explicit boolean | reducer l.1317-1319: idempotent check → set | ✅ |
| `TOGGLE_SCANLINE` 互換維持 | action-binder l.544 に残存。DOM に対応要素なし = 事実上 dead path だが programmatic dispatch 用。無害 | ✅ |

### A-3. Accent picker

| 確認事項 | 実装 | 判定 |
|---------|------|------|
| `<input type="color">` + `data-pkc-action="set-accent-color"` | renderer l.586-589 | ✅ |
| Reset ボタン `data-pkc-action="reset-accent-color"` | renderer l.595-597 | ✅ |
| `handleChange` で color change を受信 | action-binder l.2434 | ✅ |
| hex validation regex | `/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/` — 3 or 6 digit hex | ✅ |
| invalid → state identity preserved | テスト確認済み | ✅ |
| `--c-accent` inline style 適用 | renderer l.143-144: `root.style.setProperty(...)` | ✅ |
| `--c-accent` inline style 解除 | renderer l.145-146: `root.style.removeProperty(...)` | ✅ |
| color input default seed = `#33ff66` | l.593: `state.accentColor ?? '#33ff66'` | ✅ |
| 既存 `var(--c-accent)` 参照箇所が追従 | CSS 変数 cascade により inline style が `:root` 宣言に勝つ | ✅ |

### State / reducer

| 確認事項 | 実装 | 判定 |
|---------|------|------|
| `showScanline?: boolean` | l.128 | ✅ |
| `accentColor?: string` | l.137 | ✅ |
| 初期値 `showScanline: false`, `accentColor: undefined` | l.305-306 | ✅ |
| SET_SCANLINE idempotent | l.1318 | ✅ |
| SET_ACCENT_COLOR lowercase + validate | l.1327-1330 | ✅ |
| RESET_ACCENT_COLOR no-op when unset | l.1333 | ✅ |
| no silent reset (SELECT_ENTRY / BEGIN_EDIT etc. は触れない) | reducer 確認済み | ✅ |

### Phase B doc 整合

| 確認事項 | 判定 |
|---------|------|
| docs-only（実装コードに `__settings__` / `system` archetype 関連なし）| ✅ |
| `showScanline` / `accentColor` を対象設定として参照 | ✅ |
| runtime-only → hidden entry への移行パスが記述されている | ✅ |

---

## 7. 品質チェック結果

実装変更なしのため品質ゲート再実行は不要。
実装コミット時の結果を参照:

- `npm run typecheck` — exit 0（FI-12 follow-up 起因の新規型エラー: **0 件**）
- `npm run lint` — exit 0
- `npm test` — **4256 tests passed** / 0 failed（FI-12 テスト 32 件含む）
- `npm run build:bundle` — exit 0（bundle.js 553.14 KB / 89.9%、bundle.css 74.04 KB / 82.3%）
- `node build/check-bundle-size.cjs` — exit 0

---

## 8. コミット有無

本 audit document のみコミット:

```
audit(fi12-followup): post-implementation audit — Outcome A
```

実装コミット: `c68f1da`（変更なし）
