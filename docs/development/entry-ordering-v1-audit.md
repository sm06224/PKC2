# C-2 Entry Ordering v1 — Post-Implementation Audit

Status: Completed（1 defect found → minimum fix applied）
Date: 2026-04-17
Auditor: Claude Code
Scope: C-2 entry-ordering v1 の contract / pure / state / UI slice を通した統合監査
Contract: `docs/spec/entry-ordering-v1-behavior-contract.md`

---

## 0. 位置づけ

本書は C-2 entry-ordering v1 の implementation が contract に沿っているかを確認する post-implementation audit。docs-first pipeline の最後から 2 番目のステップであり、この後 manual 同期で C-2 を閉じる。

## 1. 監査範囲（読んだファイル）

| # | file | 用途 |
|---|------|------|
| 1 | `docs/spec/entry-ordering-v1-behavior-contract.md` | 契約（基準） |
| 2 | `src/features/entry-order/entry-order.ts` | pure helper |
| 3 | `src/adapter/state/app-state.ts`（§C-2 関連範囲のみ） | reducer / AppState 差分 |
| 4 | `src/adapter/ui/renderer.ts`（sidebar list / tree / move button 周辺のみ） | UI projection |
| 5 | `src/adapter/ui/action-binder.ts`（`move-entry-*` case のみ） | action dispatch |
| 6 | `tests/features/entry-order/entry-order.test.ts` | pure test 23 件 |
| 7 | `tests/adapter/entry-order-reducer.test.ts` | reducer test 18 → 19 件 |
| 8 | `tests/adapter/entry-order-ui.test.ts` | UI test 13 件 |

read しなかった: unrelated specs, replace / merge / boot subsystem, manual, calendar / kanban / textlog 本体（I-Order4 / I-Order-View は「触らない」契約なので、触っていないことを状態コードの読み取り範囲で確認）。

## 2. 監査観点（checklist 5 軸）

1. Data contract: `Container.meta.entry_order` の additive 契約 / dangling / missing append の determinism
2. Invariance: I-Order1〜10 + I-Order-MS + I-Order-View の保持
3. State semantics: reducer gate の網羅性・一貫性
4. UI semantics: list / tree reorder、move 可視性、edge 安全性、stopPropagation
5. End-to-end: filter 中 swap の global 反映、manual on/off 往復、既存 sortEntries path 非破壊

## 3. 監査結果サマリ

| 観点 | 判定 | 備考 |
|------|------|------|
| 1. Data contract | ✓ | additive のみ、SCHEMA_VERSION 据置、dangling / missing 処理は deterministic |
| 2. Invariance | ✓ | 参照同一性（entries / relations / revisions / assets / multiSelectedLids）は test で検証済 |
| 3. State semantics | **一部不整合** | F-1（editing phase gate）を検出 → 最小修正済 |
| 4. UI semantics | ✓ | 4 gate + stopPropagation + edge 自然 no-op |
| 5. End-to-end | ✓ | filter 中 swap の global 反映、sortKey 往復、既存 sortEntries path 全てテスト済 |
| test hygiene | **一部不整合** | F-2（UI test に TS 型エラー 5 件）を検出 → 最小修正済 |

総合判定: **軽微な問題 2 件あり → 最小修正済**（残件なし）。

## 4. 発見した問題

### F-1（defect、修正済）: `editing` phase で MOVE_ENTRY が blocked されていた

**Contract § 6.1（Gate 表）抜粋**:

| 条件 | `MOVE_ENTRY_UP/DOWN` |
|------|---------------------|
| `phase === 'ready'` / `'editing'` | 許可（他 pre 条件を満たせば） |

**修正前の実装**:

- `reduce()` は phase-first switch。`phase==='editing'` 時は `reduceEditing()` に dispatch。
- `reduceEditing()` は `COMMIT_EDIT` / `CANCEL_EDIT` / `PASTE_ATTACHMENT` のみ明示 handle し、それ以外は `default: blocked(state, action)`（console.warn + 同一 state ref）。
- 結果: editing 中に Move up/down を押すと reducer で silent に block され、contract §6.1 と矛盾。
- UI 側の gate（`state.selectedLid && sortKey==='manual' && viewMode==='detail' && !readonly && importPreview===null && batchImportPreview===null`）は **phase を見ない** ので、editing 中でも sidebar に ↑/↓ ボタンが出る。user 視点では「ボタンを押しても動かない」という状態だった。

**修正（最小）**:

`reduceEditing()` の switch に MOVE_ENTRY_UP / DOWN を追加し、`reduceReady` へ委譲する（既存の `PASTE_ATTACHMENT` と同一パターン）:

```ts
case 'MOVE_ENTRY_UP':
case 'MOVE_ENTRY_DOWN': {
  // C-2 v1 contract §6.1: MOVE_ENTRY is allowed during `editing`.
  // Delegate to reduceReady → reduceMoveEntry, which only touches
  // `container.meta.entry_order` and preserves phase / editingLid
  // via the identity spread at the tail of reduceMoveEntry.
  return reduceReady(state, action);
}
```

`reduceMoveEntry()` 内部は `{ ...state, container: nextContainer }` の identity spread で phase / editingLid / selectedLid / multiSelectedLids を全て保持するので、editing 中に delegate しても editor modal は閉じず、編集中 body は失われない。

**追加した test**（`tests/adapter/entry-order-reducer.test.ts`）:

```ts
describe('MOVE_ENTRY_UP: editing phase is allowed (contract §6.1)', () => {
  it('moves selected entry during editing and preserves phase + editingLid', () => {
    // entries = [a, b], entry_order = ['a', 'b'], selectedLid = 'b',
    // phase = 'editing', editingLid = 'b'
    // → entry_order becomes ['b', 'a'], phase / editingLid 不変
  });
});
```

reducer test 総数 18 → 19。全体 4038 → 4039 pass。

### F-2（test hygiene、修正済）: UI slice commit の `tests/adapter/entry-order-ui.test.ts` に 5 件の TS 型エラー

**背景**: UI slice commit（78e3a36）で追加した `entry-order-ui.test.ts` は vitest（esbuild ベース）では pass するが、`tsc --noEmit`（project の lint 用 typecheck）ではエラーを出していた。UI slice commit 時に `npm run typecheck` を UI test 追加後に再実行し損ねていたため検出漏れ。

**エラー内訳**:

- `SystemCommand` を `@core/action/user-action` から import していた（実際の export 位置は `@core/action/system-command`、統合 `Dispatchable` は `@core/action` index 経由）
- `Relation` literal に `id` / `created_at` / `updated_at` が欠けていた（3 件）
- FakeDispatcher の `dispatch()` が `void` を返していたが `Dispatcher` interface は `ReduceResult` を要求

**修正（最小、test-only）**:

```ts
// import 修正
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { Dispatchable } from '@core/action';
import type { ReduceResult } from '@adapter/state/app-state';

// Relation shape 正規化（id + 時刻付き）
const relations: Relation[] = [
  { id: 'r1', kind: 'structural', from: 'folder', to: 'child1',
    created_at: ts, updated_at: ts },
  // ...
];

// FakeDispatcher.dispatch が ReduceResult を返すよう修正
dispatch(action: Dispatchable): ReduceResult {
  received.push(action);
  return { state: createInitialState(), events: [] };
}
```

**判定**: test-file の型契約 rehearsal のみ。behavior / assertion は変更していないので contract / invariant に対する影響なし。UI slice の出荷済み production code は touch していない。

**再発防止**: 以降の slice 作業では `npm test` だけでなく `npm run typecheck` を新 test 追加後に必ず走らせる運用を維持する（CLAUDE.md の「Before every commit」に既に記載、遵守徹底）。

### 監査で確認した「defect ではない」項目

以下は契約と整合。defect ではないが、audit log として残す:

- **lazy snapshot（§2.5）**: container 復元直後に `sortKey === 'manual'` かつ `entry_order === undefined` の round-trip 稀ケースでは、最初の Move up/down が実行されるまで `entry_order` は populate されない。この間 UI は `applyManualOrder(filtered, [])` により filtered 入力順で描画する。contract §2.5 は「manual mode 切替 OR 初回 Move」の時点で snapshot を義務付けているので、初回 Move で `ensureEntryOrder()` の snapshot fallback が作動する実装は契約準拠。
- **archive filter の try/catch 差**: reducer 側は `parseTodoBody` を try/catch で囲み、renderer 側は囲まない。reducer は I-Order3（filter-visible 計算）の精度優先、renderer は既存パターン踏襲。両者の filter 結果は正常 todo body に対して一致する。異常 todo body は別 issue の領域。
- **UI gate の phase 非チェック**: UI は phase を見ないが、reducer の top-level phase switch が `initializing` / `exporting` / `error` を全て default-blocked にしているので、二重防御としては reducer 側だけで十分。UI に phase gate を追加しても contract §4.3 の no-op 表現は変わらない。
- **domain decision tree（§1.2）**: reducer `reduceMoveEntry` は `hasActiveFilter` → flat、`parent == null` → root 集合、`else` → folder 子集合、の 3 分岐を実装。`getStructuralParentLid` は first-match（relation 配列の先頭から最初に `to === childLid` な structural relation の `from`）で決める。tree.ts の `getStructuralParent` と同じ論理。非 folder archetype の「想定外親」が来ても `parent.archetype === 'folder'` のような追加 filter は契約に無いので実装で追加していない。
- **tree children reorder**: `reorderTreeByEntries` は `entries`（= `applyManualOrder(filtered, entry_order)`）の index を rank map に使う。その index 自体が `entry_order` を反映しているので、children も `entry_order` 順に並ぶ。不在 lid は `INF` rank で末尾に落ちるが、そもそも tree に乗る entry は filtered に含まれる entry のみなので rank miss は発生しない。
- **import preview / batch preview**: reducer と UI 両方で個別 gate。test あり（reducer: importPreview、UI: importPreview）。batchImportPreview は reducer test では欠けているが、実装は `state.batchImportPreview !== null` の 1 行で同形に gate されており論理的に同値。新 test は追加しない（contract 逸脱ではない）。
- **relation / revision / provenance / assets 非干渉**: reducer test `non-interference` で `next.container?.relations === container.relations` 等を ref equality で検証済。I-Order5 / I-Order8 に準拠。
- **calendar / kanban / textlog 非干渉（I-Order4 / I-Order-View）**: reducer は `viewMode !== 'detail'` で早期 no-op。renderer の manual-mode 分岐も `renderSidebar` 内（＝ detail mode 限定の render path）のみに閉じている。calendar-view.ts / kanban-view.ts / textlog-presenter.ts は読んでいないが、C-2 slice の変更ファイル一覧に含まれていないことから touch 不可。
- **sortDirection 扱い（契約 §5.1 (a) or (b)）**: 実装は (a) を選択（`sortKey='manual'` のとき `sortDirection` は触らない、値は保持）。reducer `SET_SORT` は `sortDirection: action.direction` をそのまま反映するのみ。contract は (a) / (b) どちらも許容しているので準拠。

## 5. 作成 / 変更ファイル一覧

| file | 変更種別 | 行数差 |
|------|---------|-------|
| `docs/development/entry-ordering-v1-audit.md` | 新規（本書） | +1 |
| `src/adapter/state/app-state.ts` | 最小修正（F-1） | +10 / -0 |
| `tests/adapter/entry-order-reducer.test.ts` | 最小追加（F-1 test） | +20 / -0 |
| `tests/adapter/entry-order-ui.test.ts` | 最小修正（F-2 test 型） | +5 / -4 |

dist 再生成: `dist/bundle.js` + `dist/pkc2.html`（docs-first audit だが state 修正を含むため integrity を更新）

## 6. Contract / 実装との整合点

- **D1（Option A: Container.meta.entry_order）**: 実装済、SCHEMA_VERSION 据置。
- **D2（manual は明示モード）**: `sortKey === 'manual'` が自動 sort と排他。reducer SET_SORT は両方向に通る（manual → auto、auto → manual）。
- **D3（sidebar detail のみ）**: reducer / UI 両方で `viewMode === 'detail'` gate。calendar / kanban / textlog は touch しない（code diff で確認）。
- **D4（Move up / down のみ）**: 公開 action は 2 種。DnD / bulk / top-bottom jump / keyboard shortcut は未実装（§7 Non-goal と一致）。
- **I-Order1〜10 + I-Order-MS + I-Order-View**: 全 12 件が reducer test または UI test または pure test でカバー済。F-1 修正により I-Order6 / §6.1 の editing phase 側も回復。
- **§4.3 no-op 条件**: 7 項目全て reducer gate で保証、`reduceMoveEntry` の先頭 8 guard で表現。
- **§6.1 Gate 表**: F-1 修正で完全一致（editing 許可）。`lightSource` / `viewOnlySource` は既存 readonly 判定の外にあり、contract 通り「readonly=false の範囲で許可」。

## 7. 品質チェック結果

| コマンド | 結果 |
|---------|------|
| `npx vitest run tests/features/entry-order/entry-order.test.ts` | ✓ 23 pass |
| `npx vitest run tests/adapter/entry-order-reducer.test.ts` | ✓ 19 pass（+1） |
| `npx vitest run tests/adapter/entry-order-ui.test.ts` | ✓ 13 pass |
| `npm test` | ✓ 4039 pass（+1） |
| `npm run typecheck` | ✓ |
| `npm run lint` | ✓ |
| `npm run build:bundle` | ✓ |
| `npm run build:release` | ✓ |

## 8. 残作業・次ステップ

- C-2 v1 の implementation は本書をもって契約準拠。
- 次は **manual 同期**（end-user doc に manual mode の使い方を追記）で C-2 v1 を閉じる。
- v1.x 以降の拡張余地（DnD / bulk / top-bottom / keyboard shortcut 正式化 / multi-host ordering import）は contract §8 を参照。
