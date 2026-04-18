# C-3 link-index v1 Post-Implementation Audit

Status: COMPLETE
Date: 2026-04-17
Scope: pure slice + UI slice の統合監査
Contract: `docs/spec/link-index-v1-behavior-contract.md`
Commits: `835685f` (pure) · `bbcae24` (UI)

---

## 1. 読んだファイル

| ファイル | 目的 |
|---|---|
| `docs/spec/link-index-v1-behavior-contract.md` | 正本 contract |
| `src/features/link-index/link-index.ts` | pure slice 実装 |
| `src/features/entry-ref/extract-entry-refs.ts` | 流用 helper の動作確認 |
| `src/features/textlog/textlog-body.ts` | parseTextlogBody の malformed 耐性確認 |
| `src/adapter/ui/renderer.ts`（link-index 箇所のみ） | UI slice 実装 |
| `tests/features/link-index/link-index.test.ts` | pure テスト 20 件 |
| `tests/adapter/link-index-ui.test.ts` | UI テスト 9 件 |

---

## 2. 監査観点

1. **data / pure contract** — types / 順序 / 重複 / self-link / fragment strip / broken 判定
2. **invariance** — I-LinkIdx1〜10 + I-LinkIdx-NoState + I-LinkIdx-Selectors
3. **UI semantics** — 表示境界 / broken marker / empty state / 表示モード独立
4. **navigation** — resolved 行のクリック動作 / broken 行の no-op 性
5. **end-to-end** — pure 出力 ↔ UI 描画の一致 / 既存 meta pane への影響

---

## 3. 監査結果サマリ

**問題なし**。機能欠陥・データ破壊・invariant 違反は検出されなかった。
contract から意図的に絞られた 2 箇所（D-1, D-2）と、contract にない追加 wrapper selector（N-1）を記録する。
いずれも defect ではなく、supervisor 承認済みの scope narrowing または無害な additive 要素。

---

## 4. 発見した問題

### 欠陥

**なし**。

### 記録（defect ではない scope narrowing）

**D-1: Broken セクションのスコープ**

- Contract §4.4: Broken 全体 view は container 全体の broken ref を表示し、各行が `select-entry + sourceLid`（source entry へ飛ぶ）
- 実装: `[data-pkc-region="link-index-broken"]` は **選択中 entry の unresolved outgoing のみ** を表示し、click なし（raw targetLid のテキスト表示）
- 経緯: supervisor が "broken = selected entry の unresolved outgoing のみ" と scope を縮小した。container 全体 modal は state/overlay が必要となり I-LinkIdx-NoState と衝突するため除外
- 影響: broken refs は Outgoing セクション（broken marker 付き）と Broken セクションに重複して表示されるが、ユーザーには視覚的な整合性がある

**D-2: `open-link-index-broken` ボタン未実装**

- Contract §4.6 / §4.7: `[data-pkc-action="open-link-index-broken"]` ボタンを meta pane フッタに配置し、Broken 全体 view を起動
- 実装: ボタンなし（D-1 と同理由。container 全体 broken modal は scope 外）
- 影響: 無し（機能はない、既存 DOM も壊れない）

### 記録（additive、無害）

**N-1: `[data-pkc-region="link-index"]` wrapper**

- Contract §4.6 の selector 表に `link-index` wrapper は明記されていない
- 実装は `<div data-pkc-region="link-index">` を 3 セクションの親として追加
- I-LinkIdx-Selectors 違反の可能性を確認: 同 invariant は "functional selector として使う CSS class 名を禁止" が主旨であり、`data-pkc-region` の追加使用は contract の intent に反しない
- UI テストが `metaPane.querySelector('[data-pkc-region="link-index"]')` でスコープ限定に使用しており、合理的

**N-2: contract §3.2 の `extractRefsFromEntry` 疑似シグネチャ**

- Contract §3.2: `function extractRefsFromEntry(entry: Entry): LinkRef[]`
- 実装: `function extractRefsFromEntry(entry: Entry, existingLids: ReadonlySet<string>): LinkRef[]`
- 理由: `resolved` の算出には container の既存 LID 集合が必要なため、`existingLids` を引数に追加した
- 公開 API `buildLinkIndex(container)` は contract と完全一致。`extractRefsFromEntry` のシグネチャ相違は内部実装の詳細であり behavior に影響しない

**N-3: contract §3.3 `.logs` 記述 vs 実装の `.entries`**

- Contract §3.3 pseudocode: `parseTextlogBody(entry.body).logs`
- 実装・`TextlogBody` 型: `.entries`（`{ entries: TextlogEntry[] }`）
- 実装が正しい。contract の pseudocode は `.logs` と記述したが、実際のフィールド名は `.entries`
- テスト通過により実装の正しさは確認済み

---

## 5. 作成/変更ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| `docs/development/link-index-v1-audit.md` | 新規（本書） | audit 記録 |

production コード・テストは変更なし（欠陥が検出されなかったため）。

---

## 6. contract / 実装との整合点

### data / pure contract

| 観点 | 結果 |
|---|---|
| `LinkRef` / `LinkIndex` 型定義 | contract §2.1 と完全一致 |
| `entry:` scheme のみを対象 | `extractEntryReferences` regex `/entry:([A-Za-z0-9_-]+)/g` で保証 |
| fragment strip | `Set<string>` 出力が lid のみ（# 以降なし）|
| duplicate dedupe | `Set` により同一 source・同一 target は 1 件に収束 |
| container.entries 走査順 | `collectLinkRefs` が entries 配列を前から走査 |
| self-link | outgoing + backlinks 両方に resolved=true で出現、broken には出現しない |
| broken 判定 | `existingLids.has(targetLid)` のみ（独自正規化なし、I-LinkIdx10）|
| malformed textlog | `parseTextlogBody` の try/catch で `{ entries: [] }` を返し、refs なし |
| malformed todo | `parseTodoBody` の安全な fallback を経由 |
| 非 scannable archetype | `SCANNABLE` Set で弾き、空配列を返す |

### invariance

| 項番 | 名前 | 検証結果 |
|---|---|---|
| I-LinkIdx1 | read-only derivation | `buildLinkIndex` は container を mutate しない。純粋関数 ✓ |
| I-LinkIdx2 | schema 不変 | Container / Entry / Relation / Revision への追加フィールドなし ✓ |
| I-LinkIdx3 | relation 非干渉 | `container.relations` は一切参照しない ✓ |
| I-LinkIdx4 | revision 非干渉 | `container.revisions` は一切参照しない ✓ |
| I-LinkIdx5 | provenance 非干渉 | provenance kind に触れない ✓ |
| I-LinkIdx6 | readonly/lightSource 整合 | `renderLinkIndexSections` は `canEdit` 非依存、常に描画 ✓ |
| I-LinkIdx7 | search 非干渉 | `buildLinkIndex` は `container.entries` 全件を受け取り、AppState の filter を通さない ✓ |
| I-LinkIdx8 | ordering 非干渉 | entry_order (C-2) を読まない ✓ |
| I-LinkIdx9 | merge 非干渉 | merge / conflict 系コードに触れない ✓ |
| I-LinkIdx10 | broken 判定一意性 | `existingLids.has(targetLid)` のみ。LID 正規化なし ✓ |
| I-LinkIdx-NoState | state slice skip | AppState に link-index フィールドなし。render 時に直呼び ✓ |
| I-LinkIdx-Selectors | selector 固定 | functional 操作は `data-pkc-*` 属性のみ（N-1 は無害な additive）✓ |

### UI semantics

| 観点 | 結果 |
|---|---|
| selected entry に対してのみ表示 | `entry.lid` でルックアップ。entry 未選択は renderMetaPane 自体が呼ばれない ✓ |
| Outgoing 表示境界 | `outgoingBySource.get(entry.lid)` — resolved + broken 両方を含む（§4.2 準拠）✓ |
| Backlinks 表示境界 | `backlinksByTarget.get(entry.lid)` — resolved=true のみ（§4.3 準拠）✓ |
| Broken 行に action なし | `ref.resolved` の条件分岐。false 時は `link.textContent = lid` のみ ✓ |
| broken marker | LI に `data-pkc-broken="true"` を付与 ✓ |
| empty state 文言 | "No outgoing links." / "No backlinks." / "No broken links."（§4.5 準拠）✓ |
| self-link | Outgoing 1 件 + Backlinks 1 件、broken 0 件（UI テスト category 5 確認）✓ |

### navigation

| 観点 | 結果 |
|---|---|
| resolved 行 | `.pkc-link-index-peer[data-pkc-action="select-entry"][data-pkc-lid]` — 既存 select-entry に乗る ✓ |
| broken 行 | action 属性なし。action-binder 変更不要 ✓ |
| duplicate 増殖なし | `extractEntryReferences` の `Set` による dedupe が保証 ✓ |

---

## 7. 品質チェック結果

production コード変更なし。

参考（コミット時点での確認値）:

| チェック | 結果 |
|---|---|
| `npm run typecheck` | エラー 0 |
| `npm run lint` | エラー 0 |
| `npm test` | 4068 pass（baseline 4059 + 新規 9）|
| `npm run build:bundle` | dist/bundle.js 548.19 kB 生成 |
| `npm run build:release` | dist/pkc2.html 594.1 KB 生成 |

---

## 8. コミット有無

本書（audit doc）のみ新規作成。

```
docs(audit): C-3 link-index v1 post-implementation audit
```

production コード・テストの修正コミットなし（欠陥なし）。
