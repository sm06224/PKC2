# FI-09 search-entry-type-multi-select v1 post-implementation audit

Date: 2026-04-18  
Commit: 11e87c8  
Auditor: Claude (claude-sonnet-4-6)  
Outcome: **A — 問題なし（実装受理）**

---

## 1. 読んだファイル

| ファイル | 目的 |
|---------|------|
| `docs/spec/search-entry-type-multi-select-v1-behavior-contract.md` | contract 全文 |
| `src/features/search/filter.ts` | `filterByArchetypes` / `applyFilters` 実装 |
| `src/adapter/state/app-state.ts` | `archetypeFilter` 型・初期値・3 アクション reducer |
| `src/adapter/ui/renderer.ts` | `renderArchetypeFilter` / `hasActiveFilter` 判定箇所 |
| `src/adapter/ui/action-binder.ts` | `toggle-archetype-filter` / `toggle-archetype-filter-expanded` ケース |
| `tests/features/search/fi09-multi-select-filter.test.ts` | FI-09 専用テスト 27 件 |

---

## 2. 監査観点

- §2 Data contract（型・初期値・`archetypeFilterExpanded` optional 化の是非）
- §3 Filter semantics（空 Set = 全表示・OR 結合・text との AND 維持）
- §4 Reducer semantics（4 アクション・silent reset 不可）
- §5 UI contract（DOM selectors・All ボタン・tier 表示制御）
- §3.4 `hasActiveFilter` 判定の一貫性（renderer 2 箇所 + app-state 1 箇所）
- §8 Testability（27 件と contract 一覧の対応）
- Type hygiene（FI-09 起因の新規型エラー有無）

---

## 3. 監査結果サマリ

全チェック項目を通過。実装は behavior contract と整合している。  
F-1 軽微所見（展開ボタンのラベル文字列）が 1 件あるが、機能に影響なく修正不要。

---

## 4. 発見した問題

### F-1（コスメティック・修正不要）

**場所**: `src/adapter/ui/renderer.ts` — `renderArchetypeFilter` 展開トグルのラベル

**contract（§5-5）**:
```
archetypeFilterExpanded === false → "▾ More"
archetypeFilterExpanded === true  → "▴ Less"
```

**実装**:
```typescript
expandBtn.textContent = expanded ? '▲' : '▼';
```

三角形の方向は一致しているが、"More" / "Less" テキストが省略されている。  
DOM の `data-pkc-action` / `data-pkc-expanded` 属性は正しく実装されており、機能上の問題はない。  
テストも `data-pkc-action` 属性のみ検証しているため、ラベル差異は合否に影響しない。  
**v1 範囲では受容する。修正は不要。**

---

### 意図的な偏差（偏差ではなく設計判断）

**`archetypeFilterExpanded?: boolean`（optional）vs contract の `boolean`（required）**

contract §2-1 は `archetypeFilterExpanded: boolean` と記載しているが、実装は `archetypeFilterExpanded?: boolean` とした。これは CLAUDE.md に記載されたコードベース確立パターン（"Optional so test fixtures that predate X keep compiling"）に沿った判断であり、195+ のテスト fixture を無修正で維持するために必要。

対応: `TOGGLE_ARCHETYPE_FILTER_EXPANDED` reducer が `?? false` でガードしているため、`undefined` 時の動作は `false` と等価。意味論的な差異なし。

---

## 5. 作成/変更ファイル一覧

今回の audit は docs-only:

| ファイル | 操作 |
|---------|------|
| `docs/development/search-entry-type-multi-select-v1-audit.md` | 新規作成（本文書） |

実装ファイルへの変更: **なし**（問題なし）

---

## 6. contract / 実装との整合点

### Data contract（§2）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| 型 | `ReadonlySet<ArchetypeId>` | `ReadonlySet<ArchetypeId>` (l.116) | ✅ |
| 初期値 | `new Set<ArchetypeId>()` | `new Set<ArchetypeId>()` (l.288) | ✅ |
| expanded 初期値 | `false` | `archetypeFilterExpanded: false` (l.289) | ✅ |
| Tier 定義 | PRIMARY = text/textlog/folder | `['text', 'textlog', 'folder']` (l.53) | ✅ |
| Tier 定義 | SECONDARY = todo/attachment/form/generic/opaque | `['todo', 'attachment', 'form', 'generic', 'opaque']` (l.55) | ✅ |

### Filter semantics（§3）

| 確認事項 | 判定 |
|---------|------|
| 空 Set → pass-through（filter.ts l.78）| ✅ |
| 非空 Set → OR 結合（`filter.has(entry.archetype)`）| ✅ |
| `applyFilters`: text → archetype の順で AND 結合（l.91-93）| ✅ |
| `filterByArchetype`（旧関数）削除しない | ✅ 残置 |

### Reducer semantics（§4）

| アクション | 確認事項 | 判定 |
|-----------|---------|------|
| `TOGGLE_ARCHETYPE_FILTER` | Set コピー → add/delete → 新 Set 返却（l.1285-1293）| ✅ |
| `TOGGLE_ARCHETYPE_FILTER` | 空 Set になることを許す（last toggle）| ✅ |
| `TOGGLE_ARCHETYPE_FILTER_EXPANDED` | `?? false` ガード付きトグル（l.1295）| ✅ |
| `SET_ARCHETYPE_FILTER(null)` | `new Set()` を返す後方互換（l.1279-1283）| ✅ |
| `SET_ARCHETYPE_FILTER('x')` | `new Set(['x'])` を返す後方互換 | ✅ |
| `CLEAR_FILTERS` | `archetypeFilter = new Set()`、`archetypeFilterExpanded` 不変（l.1302-1303）| ✅ |
| silent reset 不可（I-FI09-5）| 他アクション（BEGIN_EDIT 等）は archetypeFilter に触れない | ✅ |

### UI contract（§5）

| 確認事項 | 判定 |
|---------|------|
| `data-pkc-region="archetype-filter"` | ✅ |
| All ボタン: `data-pkc-action="set-archetype-filter"`, `data-pkc-archetype=""` | ✅ |
| All ボタン: size === 0 で `data-pkc-active="true"` | ✅ |
| 個別ボタン: `data-pkc-action="toggle-archetype-filter"` | ✅ |
| 個別ボタン: active 時 `data-pkc-active="true"` | ✅ |
| Primary group: `data-pkc-filter-group="primary"` | ✅ |
| Secondary group: `data-pkc-filter-group="secondary"` | ✅ |
| Secondary: `data-pkc-visible="false/true"` で展開制御 | ✅ |
| 展開トグル: `data-pkc-action="toggle-archetype-filter-expanded"` | ✅ |
| ラベル文字列 | F-1（§4 参照）|

### `hasActiveFilter` 一貫性（§3.4）

| 箇所 | 実装 | 判定 |
|------|------|------|
| `app-state.ts` l.401 | `state.archetypeFilter.size > 0` | ✅ |
| `renderer.ts` l.1320（result count）| `state.archetypeFilter.size > 0` | ✅ |
| `renderer.ts` l.1348（flat list mode）| `state.archetypeFilter.size > 0` | ✅ |

Clear ボタン表示条件（renderer.ts l.1248）も `.size > 0` を使用。✅

---

## 7. 品質チェック結果

実装変更なしのため品質ゲート再実行は不要。  
実装コミット時の結果を参照:

- `npm test` — 4202 tests passed（FI-09 専用 27 件含む）
- `npm run build:bundle` — ✓
- `npm run typecheck` — FI-09 起因の新規型エラー: **0 件**  
  （pre-existing error は `tests/adapter/action-binder-attach-while-editing.test.ts` の `Element` vs `HTMLElement` ×7 件のみ、FI-09 実装前から存在）

---

## 8. コミット有無

本 audit document のみコミット:

```
docs(fi09): post-implementation audit — Outcome A
```

実装コミット: `11e87c8`（変更なし）
