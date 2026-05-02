# Dead Code Inventory — After Relations / Reference / Provenance Wave

**Status**: audit — 2026-04-21。cleanup — 同 PR 内で Category A を解消。
**Scope**: `provenance-metadata-copy-export-v1` までの一連の wave を閉じた時点で、src/ 配下の **zero-use export / orphan file / dead CSS / stale marker** を棚卸しする。本書は **docs-only**。実削除は本書の Category A 項目を根拠にした follow-up PR で行う。
**Baseline**: main (6c5a831) — PR #81 merged.

---

## 1. サマリ

| 項目 | 結果 |
|---|---|
| Category A（確定 dead、削除安全） | **2 件** / 計 ~10 行 |
| Category B（test-only 参照、保留判断あり） | 0 件 |
| Category C（dead CSS / `data-pkc-*`） | **0 件** |
| Category D（stale marker / `// TODO` / `// FIXME` / `@deprecated`） | **0 件** |
| orphan file（どこからも import されない `.ts`） | **0 件** |

> **結論**: PKC2 の src/ は極めてタイトに保たれている。確定 dead は 2 エクスポート・計 10 行未満。削除しても product 挙動は変わらない。

## 2. 監査方針

各 export に対し:
1. `src/**/*.ts` 配下の import 参照数を確認
2. barrel file (`index.ts`) 経由の再エクスポートをたどる
3. `main.ts` / registration の到達可能性を確認
4. 参照が **tests のみ** の場合、product 使用なしとして Category A に分類

CSS / DOM:
1. `src/styles/base.css` 内の `.pkc-*` クラスを列挙
2. 各クラスについて `src/adapter/ui/**` で使用を検索
3. `data-pkc-*` 属性も同様に renderer と action-binder の pair を確認

## 3. Category A — 確定 dead（本 PR で削除済）

### 3.1 `isMarkdownEvaluatedArchetype(archetype)` — **resolved**

| 項目 | 値 |
|---|---|
| 定義 | `src/features/connectedness/sets.ts:48` |
| 再エクスポート | `src/features/connectedness/index.ts:9` |
| product 参照 | **0** |
| test 参照 | `tests/features/connectedness/sets.test.ts` 計 10 assertion |
| 導入 PR | #77（S3 pure helper） |
| 現状 | S3 で "将来の再利用に備えた" 補助関数として export されたが、S4 以降の呼び出し側（renderer）は `buildConnectednessSets` だけを使い、本関数には触れていない。v3 実装で archetype gate は `MARKDOWN_EVALUATED` set 内包にインライン化されたため、外部 API として提供する理由は消えた |

**判定**: export を取り下げる。`MARKDOWN_EVALUATED` 定数は `sets.ts` 内部でのみ使われているので non-exported のまま残す。test 側は削除または `sets.ts` 内部の挙動テストとして rebase。

**影響**: product バンドルには元々含まれていない（tree-shake 済み）。docs 上の言及は `connectedness-s3-v1.md` / `connectedness-s4-v1.md` にある — follow-up PR で「v3 で inline 化された」旨の注記を 1 行足せば十分。

### 3.2 `SlotId` type alias — **resolved**

| 項目 | 値 |
|---|---|
| 定義 | `src/runtime/contract.ts:14` |
| 参照（全文検索） | **0**（定義行のみ） |
| 導入 | 初期 runtime contract と同時（history は未確認だが成熟期に追加） |
| 現状 | `SLOT` const は `rehydrate` / `export` / `embed` 経路で現役。型エイリアス `SlotId` は一度もパラメータ型 / 戻り値型として使われていない |

**判定**: 型エイリアス 1 行を削除。`SLOT` const はそのまま残す。

**影響**: 型チェックに一切影響しない（import されていない）。

## 4. Category B — 保留（test-only 参照は現時点なし）

今回の監査では「product では未使用だが公開 API として保持すべき」という判断を要する export は発見されなかった。`PendingOfferRef` / `BatchImportPlan*` 系は reducer path で実働しているため active。

## 5. Category C — dead CSS / dead `data-pkc-*`

**該当なし**。

- `src/styles/base.css` の `.pkc-*` クラスはすべて `src/adapter/ui/renderer.ts` または `src/adapter/ui/*-presenter.ts` のいずれかで付与されている
- `data-pkc-*` 属性は renderer 側で付与、action-binder または transport / persistence 側で読み取る pair が揃っている
- `.pkc-orphan-marker`（v1 legacy）と `.pkc-unconnected-marker`（v3）は共存だが、renderer が両方とも付与しており二重にカバーされている。これは intentional — v1 互換維持のため残してよい

## 6. Category D — stale marker

**該当なし**。

- `// TODO` / `// FIXME` / `// DEPRECATED` / `@deprecated`: src/ 配下 0 件
- `XXX` / `HACK`: 0 件

PKC2 のコミット規律（「deprecated にするくらいなら削除する」）が効いている。

## 7. orphan file

**該当なし**。`src/features/**` / `src/adapter/**` の全 `.ts` について、`main.ts` から到達可能であるか、同層内の sibling から import されていることを確認。

## 8. 本 PR で適用した cleanup

本書の Category A を同 PR 内で解消済。

| ファイル | 変更 |
|---|---|
| `src/features/connectedness/sets.ts` | `isMarkdownEvaluatedArchetype` 関数ごと削除（`MARKDOWN_EVALUATED` 定数は `buildConnectednessSets` 内で引き続き使用） |
| `src/features/connectedness/index.ts` | barrel から `isMarkdownEvaluatedArchetype` 除去 |
| `tests/features/connectedness/sets.test.ts` | `describe('isMarkdownEvaluatedArchetype')` ブロック + import を除去。`MARKDOWN_EVALUATED` の挙動は `buildConnectednessSets` 側の既存テストでカバー |
| `src/runtime/contract.ts` | `export type SlotId` 行削除 |

総 diff は極小（src/ -6 行、tests -20 行程度）。型チェック・lint・テスト・build に影響なし。

## 9. 監査では "dead ではない" と確定した領域（参考）

以下は candidate として挙がったが精査で live と判定:

- **archetype presenter 一式**（`text-presenter.ts` / `textlog-presenter.ts` / `todo-presenter.ts` / `form-presenter.ts` / `attachment-presenter.ts` / `folder-presenter.ts` / `generic-presenter.ts` / `opaque-presenter.ts`）: `main.ts:83–87` 付近で registry に登録されている
- **`features/connectedness/sets.ts` の `buildConnectednessSets` / `ConnectednessSets` type**: `src/adapter/ui/renderer.ts` で使用（v3 sidebar marker）
- **`features/provenance/serialize-metadata.ts` の `serializeProvenanceMetadataCanonical`**: `src/adapter/ui/action-binder.ts` の `copy-provenance-metadata` ハンドラで使用
- **`features/markdown/quote-assist.ts`**: `src/adapter/ui/action-binder.ts` で使用
- **`features/text/text-replace.ts`**: `text-replace-dialog.ts` / `textlog-log-replace-dialog.ts` で使用
- **`core/action/system-command.ts` の `PendingOfferRef` / `BatchImportPlan*`**: reducer path で実働

## 10. 非スコープ

- **ランタイム dead code（到達不能 branch）**: 静的解析で追えないため本書では扱わない
- **未使用 npm dependency**: `package.json` 走査は別タスク
- **legacy data schema**: container schema は後方互換維持のため、"使われてない field" でも残すのが原則（本 inventory は対象外）
- **dev docs の過去履歴**: `docs/development/` 下の古い draft / contract は history として保持、削除対象外

## 11. 関連文書

- `docs/development/connectedness-s3-v1.md` — `isMarkdownEvaluatedArchetype` 導入元
- `docs/development/connectedness-s4-v1.md` — S3 → S4 採用遷移
- `docs/development/unified-orphan-detection-v3-contract.md` — archetype gate の canonical 定義
- `CLAUDE.md` §Invariants — "No premature abstraction: three similar lines > one premature helper"
- `src/features/connectedness/sets.ts` — Category A #1
- `src/runtime/contract.ts` — Category A #2

## 12. 今後の再監査トリガ

以下のいずれかが起きたら再び inventory を取り直すと効率が良い:

1. **大型 refactor PR**（例: archetype presenter の統合 / state shape の再編）
2. **半年経過**（自然発生する export drift の回収）
3. **feature 系 wave の閉幕時**（relations wave・provenance wave のような区切り）

今回はトリガ 3（provenance wave 閉幕）に該当。

---

**総評**: PKC2 の src/ は健全。Category A の 2 件だけが現実的な削除対象で、合計インパクトは ~10 行。follow-up PR として最小 patch を入れれば inventory は閉じる。
