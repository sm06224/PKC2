# Connectedness S3 — pure helper implementation note

**Status**: implementation — 2026-04-20.
**Scope**: Unified Orphan Detection v3 contract §5 で規定した pure helper layer（S3 slice）のみを実装する。adapter / renderer / AppState / DOM / CSS に**一切触れない**。UI や filter は後続 S4 / S5 の責務。
**Baseline**: `docs/development/unified-orphan-detection-v3-contract.md`（contract）/ `docs/development/unified-orphan-detection-v3-draft.md`（draft）。

> **📌 2026-04-21 追補（post-S4 訂正）**: 公開 API に `isMarkdownEvaluatedArchetype` を含めるという初版計画は、S4 着地時点で **inline 化**（`MARKDOWN_EVALUATED` という module-private `ReadonlySet<ArchetypeId>` にまとめる）に変更された。現状の `src/features/connectedness/index.ts` の公開 symbol は `buildConnectednessSets` と `ConnectednessSets` 型の **2 点のみ**。§1 / §2 / §4 / §5 / §7 に出てくる `isMarkdownEvaluatedArchetype` 参照は歴史記録として残し、下記 §2 公開 API 表記は `MARKDOWN_EVALUATED` set による内部判定に読み替える。テストも helper 3 件が消えて **合計 15 tests**（contract §5.8 の 10 必須 + 追加不変 5）に収束している。

---

## 1. 実装量

| ファイル | 種別 | 変更 |
|---|---|---|
| `src/features/connectedness/sets.ts` | 新規 pure helper | `buildConnectednessSets` / `isMarkdownEvaluatedArchetype` / `ConnectednessSets` type |
| `src/features/connectedness/index.ts` | 新規 barrel | 上記 3 symbol を再 export |
| `tests/features/connectedness/sets.test.ts` | 新規 test | 18 tests（contract §5.8 の 10 必須 + 追加不変条件 5 + archetype gate helper 3）|
| `docs/development/connectedness-s3-v1.md` | 新規 dev doc | 本書 |

**Adapter / renderer / AppState / persistence / build 設定**: いずれも変更なし。

## 2. 公開 API

```ts
export interface ConnectednessSets {
  readonly relationsConnected: ReadonlySet<string>;
  readonly markdownConnected: ReadonlySet<string>;
  readonly fullyUnconnected: ReadonlySet<string>;
}

export function buildConnectednessSets(container: Container): ConnectednessSets;
export function isMarkdownEvaluatedArchetype(archetype: ArchetypeId): boolean;
```

- 3 set は `ReadonlySet<string>`（lid 集合）
- 実装は `Set<string>` を作って immutable narrow return
- 入力は `Container` 1 個のみ。ArchetypeId gate は内部で判定
- 副作用なし、参照透明

## 3. Contract 条項の実装対応

| Contract 条項 | 実装 |
|---|---|
| §2.1 定義 | 述語は §2.1 の set-builder どおり。実装は relations 1 pass + link-index 1 pass + entries 1 pass、計 O(R + N + B) |
| §2.3 v1 continuity | `buildConnectedLidSet` / `buildInboundCountMap` / `buildLinkIndex` 未変更。v1 既存テストすべて pass |
| §3.1 body volatility | render pass ごとに再構築（memoize しない、§5.5）。本 helper は pure なので呼び出し頻度は上位の責務 |
| §3.2 broken refs | `outgoing.some(ref => ref.resolved)` で解決済みのみ加算、broken は寄与しない |
| §3.3 self-loop | `if (r.from === r.to) continue`、v3 側でだけ除外（v1 helper は変更せず） |
| §3.4 textlog | `buildLinkIndex` の entry 単位集計を再利用、log 行粒度に下げない |
| §3.5 archetype gate | `MARKDOWN_EVALUATED = {text, textlog, folder, todo}` の `ReadonlySet<ArchetypeId>` で closed-set enforcement、evaluation loop 冒頭で gate |
| §3.6 folders | folder を特別扱いする分岐なし、他 archetype と同経路 |
| §3.7 dangling | `!userLids.has(r.from) \|\| !userLids.has(r.to)` で skip、両端とも user entry にある relation だけ加算 |
| §3.8 provenance | `kind` を一切見ない（他 kind と同等扱い） |
| §3.9 hidden/soft-deleted | `container.entries.filter(isUserEntry)` で system-* を除外、3 set すべてが user entry だけに closed |
| §5.1 derived-only | container / schema への書き込みなし |
| §5.2 AppState 汚染禁止 | adapter 側 code 未 touch |
| §5.3 layer 配置 | `src/features/connectedness/` 新設、推奨どおり |
| §5.4 公開 API 契約 | 署名一致 |
| §5.5 memoization 方針 | 一切しない、pure のまま |
| §5.6 hidden semantic merging 禁止 | boolean 3 set のみ、score / level / 半接続状態を作らない |
| §5.7 performance 契約 | O(R + N + B)。`buildLinkIndex` を 1 回呼ぶため link-index 1 pass 相当 |
| §5.9 既存 helper 再利用 | `isUserEntry` / `buildLinkIndex` を利用、既存 helper は未変更 |

## 4. テスト構成

### §5.8 必須 10 点

| # | 項目 | テスト名 |
|---|------|---------|
| 1 | 空 container → 3 set 空 | `#1 empty container → 3 sets empty` |
| 2 | relation 参加 → relationsConnected | `#2 entry participating in a relation → in relationsConnected` |
| 3 | 解決済み outgoing → markdownConnected | `#3 entry with resolved outgoing markdown ref → in markdownConnected` |
| 4 | broken のみ → markdownConnected に含まれない | `#4 entry whose only outgoing ref is broken → NOT in markdownConnected` |
| 5 | self-loop のみ → relationsConnected に含まれない | `#5 entry whose only relation is a self-loop → NOT in relationsConnected` |
| 6 | 関係あり・markdown 無し → 組合せ確認 | `#6 entry with relations but no markdown refs → ...` |
| 7 | 両 0 → fullyUnconnected | `#7 entry with zero edges ... → in fullyUnconnected` |
| 8 | 部分集合関係の機械確認 | `#8 fullyUnconnected(e) ⟹ ¬relationsConnected(e) — subset` |
| 9 | archetype gate | `#9 archetype gate — form/attachment/generic/opaque excluded` |
| 10 | dangling | `#10 dangling relation — neither side gains connectedness` |

### 追加 invariants（5 tests）
- subset 関係の混成シナリオ
- system entries の除外（§3.9）
- provenance kind の通常扱い（§3.8）
- 片方向 inbound-only の markdown-connected
- resolved + broken 混在時の resolved 優先

### Helper tests（3 tests）
- `isMarkdownEvaluatedArchetype` の 4 / 4 / system 判定

合計: **18 tests、すべて pass**。

## 5. Validation

| 項目 | 結果 |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm test` | 4756 / 4756 pass（+18 from provenance-metadata-viewer v1 baseline 4738） |
| `npm run build:bundle` | OK（bundle.css 85.99 kB / bundle.js 617.06 kB、baseline と同サイズ） |
| `npm run build:release` | OK（dist/pkc2.html 673.2 KB、baseline と同サイズ） |
| `npm run build:manual` | **未実行**（bundle 未変更 / 新 helper 未 import / contract §5.10 に従い manual は S5 完了後に 1 回）|

**bundle size 未変動の理由**: 新 helper は pure export のみで、adapter / renderer から import されていない。Vite tree-shaking が dead code として除外。S4 で renderer から import されたタイミングで bundle size が増える想定。

## 6. v1 continuity の検証

- `src/features/relation/selector.ts:buildConnectedLidSet` — diff なし
- `src/features/relation/selector.ts:buildInboundCountMap` — diff なし
- `src/features/link-index/link-index.ts:buildLinkIndex` — diff なし
- DOM attribute `data-pkc-orphan="true"` の付与挙動 — 変更なし（renderer 未 touch）
- CSS `.pkc-orphan-marker` — 変更なし
- v1 既存テスト群 — 全数 pass

## 7. 境界の明示

本 PR で**やらないこと**:
- adapter / renderer の touch（S4 で行う）
- DOM attribute 追加（S4 で `data-pkc-connectedness` を追加）
- CSS class 追加（S4 で `.pkc-unconnected-marker`）
- filter UI（S5 の optional スコープ）
- `buildConnectedLidSet` の挙動変更
- AppState field 追加
- Container schema 変更
- `docs/manual/*` 更新（contract §5.10 / §7.2）

**やること**:
- pure helper 1 ファイル + barrel 1 ファイル + 18 tests + 本 dev doc のみ

## 8. 次 slice（S4）の前提

S4（sidebar marker 追加）を起票するときには contract §7.3 の E10〜E14 を確認:
- [ ] E10: 本 PR（S3）が main に merge 済み
- [ ] E11: §4.4 attribute / class 契約を順守
- [ ] E12: v1 既存テスト（`pkc-orphan-marker` / `data-pkc-orphan`）が全数 pass 維持
- [ ] E13: §4.7 a11y（`aria-hidden="true"` + `title`）
- [ ] E14: §4.8 no graph wording

S3 の `buildConnectednessSets` は S4 の renderer 側で `import { buildConnectednessSets } from '@features/connectedness'` として利用。

## 9. 関連文書

- `docs/development/unified-orphan-detection-v3-contract.md` — 本 helper の canonical contract
- `docs/development/unified-orphan-detection-v3-draft.md` — 設計 draft
- `docs/development/orphan-detection-ui-v1.md` — v1 relations-orphan 挙動（継承）
- `docs/development/unified-backlinks-v0-draft.md` — 用語分離契約
- `src/features/connectedness/sets.ts` — 実装本体
- `src/features/connectedness/index.ts` — barrel
- `src/features/relation/selector.ts` — v1 helpers（未変更）
- `src/features/link-index/link-index.ts` — link-index v1（未変更）
- `src/core/model/record.ts` — `isUserEntry` / `ArchetypeId`
