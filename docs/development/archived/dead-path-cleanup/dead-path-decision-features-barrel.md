# Dead Path Decision — `src/features/index.ts` barrel

## 目的

inventory round 5 (PR #43) で発見した **`src/features/index.ts` barrel が src/tests いずれからも import されていない** 問題について、削除の単独判定を行う。同時に、barrel が再 export していた `entryMatchesQuery` の扱いも決定する。

## 判定 1: `src/features/index.ts` barrel

### 検査結果

```
$ Grep "from ['\"]@features['\"]" src/ tests/    # → 0 件
$ Grep "from ['\"].*features['\"]" src/ tests/   # → 0 件 (テスト description 文字列の "features" 1 件除く)
$ Grep "features/index" src/ tests/ build/        # → 0 件
```

barrel は src / tests / build / vite.config いずれからも import されていない。

barrel が公開していた export 群 (filterEntries / entryMatchesQuery / filterByArchetype / applyFilters / sortEntries 各種 / SortKey / SortDirection / getRelationsForEntry / resolveRelations / Direction / DirectedRelation / ResolvedRelation / getTagsForEntry / getAvailableTagTargets / Tag / entryHasTag / filterByTag / formatDate 系 6 個) は、すべて **本来のサブモジュールから直接 import** されている (renderer / action-binder / app-state / tests など)。

### 分類: **A**（即削除可能）

| 観点 | 結果 |
|------|------|
| src 参照 | 0 |
| test 参照 | 0 |
| build 参照 | 0 |
| docs 参照 | 0 (検索の barrel パスとしての言及なし) |
| 5 層構造影響 | なし (barrel が消えるだけ、各 importer は直接 path を使用) |
| bundle 影響 | tree-shake 済み想定で byte-identical (要確認) |

### 削除する

---

## 判定 2: `entryMatchesQuery` (`src/features/search/filter.ts:50`)

### 検査結果

| 観点 | 結果 |
|------|------|
| src caller | **0 件** (barrel の re-export のみ) |
| test caller | `tests/features/search/filter.test.ts:2` で `@features/search/filter` から **直接 import** (not via barrel)。4 case で振る舞いをテスト |
| docs / spec 言及 | なし |
| docstring intent | "Useful for highlighting or per-entry match checks." → **forward intent あり** (highlighting 機能を将来追加する想定) |

### 同型ケースとの比較

| Helper | 削除 PR | smoking gun の強さ |
|--------|--------|--------------------|
| `isPreviewableMedia` | PR #36 削除 | 強 (classifier との挙動矛盾 + docs drift) |
| `updateLogEntry` | PR #41 削除 | 強 (architectural mismatch — collectBody が DOM 再構築) |
| `entryMatchesQuery` | **本 PR 保留** | 弱 (挙動矛盾なし / architectural mismatch なし / docstring forward intent あり) |

`entryMatchesQuery` は `filterEntries` / `applyFilters` の inline check と挙動が一致しており、`isPreviewableMedia` のような "smoking gun" を欠く。docstring が "highlighting" 用途を明示している点で、`isUlid` の "debugging / audit tooling only" と同じく **forward intent を docstring で宣言したヘルパー** に近い。

### 分類: **B (保留)**

barrel 削除後も `entryMatchesQuery` は filter.ts から export され続け、tests は直接 import で動作する。barrel 削除の影響を受けない。

prompt 指示 "If any uncertainty remains: prefer deleting only the barrel" に従い、**本 PR では `entryMatchesQuery` を削除しない**。

将来 highlighting feature が追加されないと確定した時点で別 PR で再検討する。

---

## 削除アクション

### 削除対象

- `src/features/index.ts` (33 行)

### 保持対象

- `entryMatchesQuery` (filter.ts:50) と対応 test (filter.test.ts:72-89): docstring の forward intent + smoking gun 不在のため retain

### roll-back 戦略

barrel ファイル単独削除のため、`git revert` 1 コミットで完全復元可能。production / test の動作には影響なし (barrel が初めから誰にも使われていない)。

---

## 変更ファイル

```
 src/features/index.ts                                     | -33 (deleted)
 docs/development/dead-path-decision-features-barrel.md    | +N (this doc)
```

---

## Validation

- `npm run typecheck`: 次セクションで実行
- `npm test`: 次セクションで実行
- `npm run build:bundle`: 次セクションで実行 + bundle 影響確認

---

## Backward compat / migration 影響

なし。barrel は誰からも import されていないため、削除しても外部 API surface に変化なし。schema / migration / external contract いずれも影響なし。

---

## 結論

| 対象 | 判定 |
|------|------|
| `src/features/index.ts` | **A: 即削除** (zero importers, zero tests/docs reference) |
| `entryMatchesQuery` | **B: 保留** (barrel と独立に test 維持、docstring forward intent あり、smoking gun 不在) |

inventory 05 が示した最強候補のうち、barrel 単独を本 PR で処理する。`entryMatchesQuery` は次回以降の判断材料を蓄積してから扱う。

## 次 PR 候補

1. **推奨**: transport の `record:accept` / `record:reject` capability spec consistency review (inventory 05 §Track B)
2. action-binder の `calendar-prev` / `calendar-next` 月計算統合 (inventory 05 §Track A)
3. inventory round 1-4 docs に "resolved by PR #" マーク追記 (PR #36 / #40 / #41 の reflect)
4. `entryMatchesQuery` 単独再判定 (highlighting feature 計画が固まってから)
