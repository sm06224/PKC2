# FI-01 Dual-Edit Safety v1 — Post-Implementation Audit

Status: COMPLETED 2026-04-17
Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
Scope: pure slice + state/save slice + reject overlay UI slice の統合監査。
Outcome: **DEFECT 0 件、OBSERVATION 3 件**。production code 修正なし。

---

## 1. 監査対象ファイル

| Layer | File | Lines touched |
|-------|------|---------------|
| pure | `src/core/operations/dual-edit-safety.ts` | 232（全新規） |
| state | `src/adapter/state/app-state.ts` | +180 |
| action | `src/core/action/user-action.ts` | +30 |
| event | `src/core/action/domain-event.ts` | +10 |
| UI | `src/adapter/ui/dual-edit-conflict-overlay.ts` | 180（全新規） |
| UI | `src/adapter/ui/renderer.ts` | +7 |
| UI | `src/adapter/ui/action-binder.ts` | +52 |
| test | `tests/core/dual-edit-safety.test.ts` | 329（20 tests） |
| test | `tests/core/dual-edit-safety-state.test.ts` | 320（17 tests） |
| test | `tests/adapter/dual-edit-conflict-ui.test.ts` | 332（12 tests） |

合計: tests 49 件（pure 20 + state 17 + UI 12）。

---

## 2. 不変条件 I-Dual1〜10 逐条照合

### I-Dual1 — Silent overwrite 不可

**結論: OK**。

- `COMMIT_EDIT` で `checkSaveConflict(base, container).kind !== 'safe'` の場合、`rejectedState` の spread は `dualEditConflict` の追加のみ。`state.container` は unchanged（spread の `container` key は書かない）。
- State test 6: `next.container === containerBefore` で identity 検証済み。
- UI test 6 / 7: Save as branch 後に元 entry の body が remote 値のまま保持。

### I-Dual2 — Edit buffer 即時破棄不可

**結論: OK**。

- reject 時の `dualEditConflict` に `draft: { title, body, assets? }` を保持。
- overlay に Escape listener / backdrop listener なし。
- action-binder の Escape handler 冒頭に `if (state.dualEditConflict) return;` ガード追加済み。
- UI test 9 / 10: Escape / backdrop click で overlay + state 不変。

### I-Dual3 — Pure 判定

**結論: OK**。

- `captureEditBase` / `checkSaveConflict` / `isSaveSafe` / `branchFromDualEditConflict` は全て pure。
- 乱数 / 時計 / IDB / DOM への依存なし。
- テスト 20: 同一入力で `deepEqual` 一致。

### I-Dual4 — 既存 reducer 非破壊

**結論: OK**。

- safe save path: 既存の snapshot + updateEntry + mergeAssets 経路に `editingBase: null, dualEditConflict: null` の 2 key を追加したのみ。pre-FI-01 tests はこの 2 key を参照しないため非破壊。
- RESTORE_ENTRY 回帰テスト（state test 16）pass。
- 全 4153 tests pass。既存テスト壊れなし。

### I-Dual5 — Revision chain 不変

**結論: OK**。

- reject 経路: `snapshotEntry` を呼ばない。
- `branchFromDualEditConflict`: `addEntry` + `updateEntry` + relation append のみ。revisions array は touch しない。
- Pure test 20: `r1.revisions === c.revisions` で参照一致確認。

### I-Dual6 — Entry 単位判定

**結論: OK**。

- `checkSaveConflict` は `container.entries.find(e => e.lid === base.lid)` の 1 entry のみ参照。
- `getLatestRevision(container, base.lid)` も同一 lid 限定。
- Container 全体 diff / Relation / 他 entry は一切参照しない。

### I-Dual7 — `updated_at` 主、`content_hash` 補助

**結論: OK**。

- Decision table の実装順序:
  1. entry-missing（lid 不在）
  2. archetype-changed
  3. `updated_at !== base.updated_at` → version-mismatch
  4. 両 side に content_hash が present かつ不一致 → version-mismatch
  5. 上記全 pass → safe
- pre-H-6 fallback: 片方 undefined なら content_hash 比較 skip → safe（pure test 8 で検証）。

### I-Dual8 — C-1 branch restore と別 operation

**結論: OK**。

- `conversion_kind = 'concurrent-edit'`（C-1 は `'revision-branch'`）。
- `source_revision_id` は metadata に含めない（pure test 15 で `source_revision_id === undefined` を検証）。
- 別 pure helper 名: `branchFromDualEditConflict` vs `branchRestoreRevision`。
- 別 event 名: `ENTRY_BRANCHED_FROM_DUAL_EDIT` vs `ENTRY_BRANCHED_FROM_REVISION`。

### I-Dual9 — Gate は既存 blocked() 経路再利用

**結論: OK**。

- `RESOLVE_DUAL_EDIT_CONFLICT` の conflict-null / lid-mismatch: `blocked(state, action)` 呼び出し → state identity 保持。
- `branchFromDualEditConflict` の collision guard: container identity 返却 → reducer が `container === state.container` で blocked に落とす。
- State test 12 / 13: `next === state` で identity 検証。

### I-Dual10 — 採番決定性

**結論: OK**。

- Pure helper は `newLid` / `relationId` / `now` を引数で受け取り、内部で乱数 / 時計を読まない。
- Reducer が `generateLid()` / `now()` を呼んで注入。
- テストでは固定値を直接渡して deterministic に検証。

---

## 3. End-to-end 経路照合

### 並行 save → overlay → Save as branch

- UI test 6: setupInConflict（base override で forced mismatch）→ Save as branch click → 新 entry（`branch.title === 'My Draft Title'`）+ source 不変（`source.body === 'remote'`）+ provenance relation（`conversion_kind='concurrent-edit'` / canonical direction）+ overlay 消失 + phase → ready。
- State test 9: 同上の state 層検証。

### 並行 save → overlay → Discard

- UI test 7 / State test 10: container identity 保持、state clear、DUAL_EDIT_DISCARDED event。

### 並行 save → overlay → Copy → Copy

- UI test 8: writeText 呼ばれる（user gesture 内）、ticket 1→2 monotonic、overlay 維持、draft.body 保持。re-query 後の second click も正常。

### Stray / missing / blocked

- State test 12: conflict null → blocked identity。
- State test 13: lid mismatch → blocked identity。
- UI test 9: Escape → no-op（dualEditConflict guard）。
- UI test 10: backdrop click → no-op。

---

## 4. 発見事項

### DEFECT: 0 件

実装は contract に 1:1 で対応しており、不変条件・state 遷移・UI 契約・end-to-end 経路のいずれにも逸脱は見つからなかった。

### OBSERVATION: 3 件（非 defect、記録のみ）

#### OBS-1: action-binder の文字列リテラルとオーバーレイモジュールの定数が二重管理

overlay module は `ACTION_SAVE_AS_BRANCH` / `ACTION_DISCARD` / `ACTION_COPY` を `export const` で定義しているが、action-binder 側は文字列リテラル `'resolve-dual-edit-save-as-branch'` 等を直接 case 文に書いている。機能上は一致しており tests で end-to-end 検証されているため defect ではない。整流は v1.x の hygiene タスクとして扱える。

#### OBS-2: 並行 save 保護のスコープは同一 dispatcher 内に限定

version guard は reducer 層で機能するため、**同一 dispatcher に到達する save** 間で有効。Entry Window が postMessage 経由で main dispatcher に dispatch する経路ではこの guard が機能する。一方、もし Entry Window が独自 dispatcher を持ち IDB に直接書く経路があれば、guard の射程外になる。contract §9 non-goal（別 container / 別デバイス / 別ブラウザ間の同期）に該当し、v1 の対象範囲外。Entry Window の具体的な dispatch 経路は本 audit のスコープ外であり、FI-01 UI slice の pipeline 外で別途確認可能。

#### OBS-3: DualEditConflictState.kind の型導出

`kind` フィールドの型は `Exclude<SaveConflictCheck, { kind: 'safe' }>['kind']` で導出されている。これは `'entry-missing' | 'archetype-changed' | 'version-mismatch'` に等しく、domain-event 側の `DUAL_EDIT_SAVE_REJECTED.kind` の直書き union と互換。どちらかの type が拡張された場合に食い違う可能性はあるが、現時点で defect ではない。

---

## 5. テストカバレッジ概観

| Layer | File | Tests | Category |
|-------|------|------:|----------|
| pure | `tests/core/dual-edit-safety.test.ts` | 20 | capture (4) / conflict check (7) / branch builder (9) |
| state | `tests/core/dual-edit-safety-state.test.ts` | 17 | BEGIN_EDIT capture (3) / safe save (2) / conflict reject (3) / save-as-branch (1) / discard (1) / copy (1) / blocked (2) / CANCEL_EDIT (1) / override (1) / RESTORE_ENTRY regression (1) / shape (1) |
| UI | `tests/adapter/dual-edit-conflict-ui.test.ts` | 12 | mount (5) / button dispatch (3) / non-dismiss (2) / unmount (1) / regression (1) |
| **合計** | | **49** | |

**全 49 件 pass。既存 4104 件（FI-01 投入前 baseline）も全 pass。**

---

## 6. 結論

FI-01 dual-edit-safety v1 の 3 slice（pure / state / UI）は contract に整合しており、defect は 0 件。I-Dual1〜10 のすべてが実装 + テストで担保されている。

production code の修正は不要。audit doc 1 本のみで本ステップを閉じる。

---

## References

- Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
- Minimum scope: `docs/spec/dual-edit-safety-v1-minimum-scope.md`
- Pure slice: `docs/development/dual-edit-safety-pure-slice.md`
- State slice: `docs/development/dual-edit-safety-state-slice.md`
- UI slice: `docs/development/dual-edit-safety-ui-slice.md`
- C-1 revision-branch-restore audit: `docs/development/archived/v1-audits/revision-branch-restore-v1-audit.md`
