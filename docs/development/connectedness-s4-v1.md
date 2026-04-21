# Connectedness S4 — sidebar marker (Unified Orphan Detection v3)

**Status**: implementation — 2026-04-20.
**Scope**: Unified Orphan Detection v3 contract §4 / §7.3 の **S4 slice** — sidebar の新 marker / attribute 追加のみ。filter UI は S5 の責務、本 PR では触らない。v1 `.pkc-orphan-marker` / `data-pkc-orphan` は **一切変更せず** 並立させる（additive layer）。
**Baseline**: `docs/development/unified-orphan-detection-v3-contract.md` / `docs/development/connectedness-s3-v1.md`（pure helper）。

---

## 1. 実装量

| ファイル | 種別 | 変更 |
|---|---|---|
| `src/adapter/ui/renderer.ts` | UI | `buildConnectednessSets` import / renderSidebar で 1 回構築 / `renderTreeNode` / `renderEntryItem` に `connectednessSets` パラメタ追加 / v1 marker 直下に S4 block 追加 |
| `src/styles/base.css` | CSS | `.pkc-unconnected-marker` + `[data-pkc-selected="true"] .pkc-unconnected-marker` の 2 規則 |
| `tests/adapter/renderer.test.ts` | test | +7 tests（fully-unconnected attribute + marker / v1 coexistence / markdown-only ≠ fully / connected 状態 / readonly / tooltip wording / 無 container ガード）|
| `docs/development/connectedness-s4-v1.md` | 新規 dev doc | 本書 |
| `dist/bundle.{js,css}` / `dist/pkc2.html` / `PKC2-Extensions/pkc2-manual.html` | artifact | rebuild |

v1 helper（`buildConnectedLidSet` / `buildInboundCountMap` / `buildLinkIndex`）**未変更**。v1 既存テストは全数 pass。

## 2. 新 marker / attribute 仕様

### 2.1 DOM attribute — `data-pkc-connectedness`

`<li class="pkc-entry-item">` 自体に付与。値は 3 種の closed set:

| 値 | 条件 | v1 `data-pkc-orphan` との関係 |
|---|---|---|
| `"connected"` | `relationsConnected(e)` 真 | `data-pkc-orphan` 非付与 |
| `"relations-orphan"` | `¬relationsConnected(e) ∧ markdownConnected(e)` | `data-pkc-orphan="true"` も付く（v1 は既存挙動で付与）|
| `"fully-unconnected"` | `¬relationsConnected(e) ∧ ¬markdownConnected(e)` | `data-pkc-orphan="true"` も付く |

`data-pkc-orphan` が**v1 authoritative**、`data-pkc-connectedness` が **v3 additive**。両 attribute は並立。

### 2.2 DOM marker — `.pkc-unconnected-marker`

`data-pkc-connectedness="fully-unconnected"` の行にのみ追加される `<span>`:

```html
<span class="pkc-unconnected-marker"
      title="Fully unconnected (no relations, no markdown refs)"
      aria-hidden="true">◌</span>
```

- 文字: `◌`（U+25CC DOTTED CIRCLE）— v1 `○`（U+25CB WHITE CIRCLE）との視覚的差別化
- 色: `var(--c-muted)` + `opacity: 0.7` — v1 marker と同トーン（contract §4.2「warning 色禁止」準拠）
- 配置: v1 marker の**直後**（DOM 順）、`margin-left: 0.15rem` で軽く離す
- 選択行: `[data-pkc-selected="true"]` 配下で `rgba(255,255,255,0.75)` + `opacity: 0.85`（v1 marker と同パターン）

### 2.3 Tooltip wording

`title="Fully unconnected (no relations, no markdown refs)"` 固定。contract §1.2 禁止用語（`orphan` / `unified` / `isolated` / `disconnected`）を**含まない**ことを test で機械検証。

### 2.4 a11y

`aria-hidden="true"` + `title` の組合せ（v1 marker と同パターン、contract §4.7）。screen reader は marker 自体を読み上げず、entry title + badge count の流れを保つ。

## 3. v1 orphan との並立仕様

### 3.1 v1 marker は**一切触らない**

- `data-pkc-orphan="true"` の付与条件: `!connectedLids.has(entry.lid)`、v1 `buildConnectedLidSet` を使用（self-loop / dangling は v1 の扱いのまま）
- `.pkc-orphan-marker` の文字・色・tooltip すべて不変
- 既存 4 tests（`marks entries with no relations as orphan` / `does not mark entries that participate in any relation as orphan` / `marks only the disconnected entry when one of several is connected` / `shows orphan marker in readonly context`）**すべて pass**

### 3.2 S4 marker との視覚併存

`fully-unconnected(e)` 真のとき、v1 marker + v3 marker が**同時に**行末に並ぶ:

```
[entry title] [task badge] [revision badge] [backlink badge] ○ ◌
                                                              ^  ^
                                                              |  v3 fully-unconnected
                                                              v1 relations-orphan
```

contract §4.5 の要件「視覚的区別 + v1 非表示禁止」を満たす。

### 3.3 self-loop / dangling の v1/v3 乖離

contract §3.3 / §3.7 が明文化した通り:

- **self-loop のみ**の entry: v1 `connectedLids` は lid を持つ → v1 marker **非表示**。v3 は self-loop を skip → `fully-unconnected` 候補に入り、markdown edge なしなら **v3 marker 表示**
- **dangling のみ**の entry: v1 は相手側を set に入れてしまう → v1 marker **非表示**。v3 は両端 user-entry gate で skip → v3 marker 条件次第で表示

つまり稀なケースで「v1 marker なし / v3 marker あり」が発生しうる。これは contract §3.3 「v1 helper を変更しない」の帰結であり、仕様通り。一般運用（self-loop なし・dangling なし）では v3 marker は常に v1 marker の**部分集合**として出る（`fullyUnconnected ⊆ relationsOrphan`）。

## 4. Contract 条項への対応

| Contract 条項 | 実装 |
|---|---|
| §2.3 v1 continuity | v1 attribute / marker / テスト 全数維持 |
| §4.1 marker 意味 | `"Fully unconnected (no relations, no markdown refs)"` のみ。§4.1 許容 tooltip と整合 |
| §4.2 禁止示唆 | warning 色不使用 / delete 文言不使用 / graph wording 不使用 / priority 文言不使用 / link 自動生成動線なし |
| §4.3 filter wording | **本 PR では filter UI を追加しない**。S5 で実装する際に §4.3 ラベル表を使用 |
| §4.4 DOM 契約 | `data-pkc-connectedness` 3 値 + `.pkc-unconnected-marker` 新規。v1 `data-pkc-orphan` / `.pkc-orphan-marker` 不変 |
| §4.5 視覚優先度 | v1 marker を**非表示にしない**。v3 marker を右側に追加表示 |
| §4.6 summary row | **触らない**（S4 範囲外）|
| §4.7 a11y | `aria-hidden="true"` + `title`（v1 と同パターン）|
| §4.8 graph 意味論 | 連結成分 / hop 数 / reachability / hub いずれも含意なし。attribute / marker / tooltip すべて "現状 edge 数 0" 以上は主張しない |
| §5.1 derived-only | container / schema 未変更 |
| §5.2 AppState 不変 | reducer / dispatcher 未変更 |
| §5.5 memoization なし | render ごとに `buildConnectednessSets` を 1 回呼ぶ、キャッシュなし |
| §7.3 E10 | S3 前提（別 PR で merged 想定） |
| §7.3 E11 | §4.4 attribute / class 契約順守 |
| §7.3 E12 | v1 既存テスト全数 pass |
| §7.3 E13 | a11y 要件満たす |
| §7.3 E14 | graph wording 不使用（test で機械検証）|

## 5. readonly / manual context

**v3 marker は readonly でも表示する**。viewing は write 権限を要さない（contract §4 諸条項に edit semantic なし）。既存 v1 の readonly 挙動と同じ方針 / 同じ test pattern で検証。

## 6. テスト結果

- `npm run typecheck`: **OK**
- `npm run lint`: **OK**
- `npm test`: **4763 / 4763 pass**（+7 from S3 baseline 4756）

S4 新規 test（7 件）:
1. `fully-unconnected` attribute + `◌` marker + tooltip + aria-hidden
2. v1 `.pkc-orphan-marker` と v3 `.pkc-unconnected-marker` の共存（§4.5）
3. markdown-only entry → attribute `"relations-orphan"` / v1 marker あり / v3 marker なし
4. relation 参加 entry → attribute `"connected"` / 両 marker なし
5. readonly context での v3 marker 表示維持
6. tooltip が禁止語（orphan / unified / isolated / disconnected）を含まず、canonical phrase `"fully unconnected"` を含む
7. container null（initializing）で attribute / marker 不出現

v1 既存 orphan tests（4 件）は **全数継続 pass**（contract §7.3 E12 の機械充足証明）。

## 7. build 結果

- `npm run build:bundle`: OK（bundle.css 86.18 kB / bundle.js 618.13 kB、S3 baseline からそれぞれ +0.19 kB / +1.07 kB の増加）
- `npm run build:release`: OK（dist/pkc2.html 674.4 KB、+1.2 KB）
- `npm run build:manual`: **実行**（bundle 増加があるため rebuild 対象）

**bundle 増加の理由**: S3 で追加した `buildConnectednessSets` / `isMarkdownEvaluatedArchetype` が renderer から import され、tree-shake 対象外になった。S3 dev doc の予測通り。

## 8. docs / spec / manual 整合性

- `unified-orphan-detection-v3-contract.md` §4 の全条項に実装が対応（§4.3 filter のみ S5 で扱う）
- `connectedness-s3-v1.md` §8 で予告した S4 exit criteria E10〜E14 全数充足
- v1 `orphan-detection-ui-v1.md` の spec は不変（v1 挙動を変えていない）
- `unified-backlinks-v0-draft.md §2` 用語分離契約を順守（UI に `orphan` 単独語を出さない）
- manual（`pkc2-manual.html`）は dist 差分を含めて rebuild 済み。S5 完了時に manual の prose 追記を行う余地あり（contract §5.10）

## 9. 非スコープ（S5 以降）

- sidebar filter（`"Only fully unconnected"` 選択肢、contract §4.3 / §7.4 E15〜E18）— S5 で別 PR
- summary row への connectedness 表示 — contract §4.6 の通り採らない
- provenance metadata pretty-print / copy-export — 別 feature
- graph visualization — contract §6.2.1 で永続的に非ゴール

## 10. 関連文書

- `docs/development/unified-orphan-detection-v3-contract.md` — canonical contract
- `docs/development/unified-orphan-detection-v3-draft.md` — design draft
- `docs/development/connectedness-s3-v1.md` — pure helper 実装記録
- `docs/development/orphan-detection-ui-v1.md` — v1 canonical（継承）
- `src/features/connectedness/` — S3 で作成した pure helper（本 PR が import）
- `src/features/relation/selector.ts` — v1 `buildConnectedLidSet`（**未変更**）
- `src/features/link-index/link-index.ts` — link-index（**未変更**）
- `src/adapter/ui/renderer.ts` — sidebar marker 実装（本 PR で touch）
- `src/styles/base.css` — `.pkc-unconnected-marker`（本 PR で追加）

## 11. 次 slice（S5）への引継ぎ

> **📌 2026-04-21 追補（status）**: S5 は **Defer 確定**。`unified-orphan-detection-v3-contract.md §7.4` の optional 位置づけに従い、S4 marker で "気づき" は完結したため filter は実需待ち。`next-feature-prioritization-after-relations-wave.md §5` / `HANDOVER_FINAL §22.3` / LEDGER §1.1 も同じく Defer として記録済み。以下の exit criteria 表は復活させる時に参照するためそのまま保存する。

S5（optional filter）を起票するときには contract §7.4 の E15〜E18 を確認:
- [ ] E15: 本 PR（S4）が main に merge 済み
- [ ] E16: filter wording は §4.3 の 3 ラベル表から選ぶ
- [ ] E17: 既存 `archetypeFilter` / `tagFilter` / `sortKey` / `searchQuery` と共存設計
- [ ] E18: filter state の置き場（UI state として AppState に載せる場合の設計書）

**S5 は optional**。本 PR（S4）まで来れば marker による "気づき" は完結しているため、filter は必要性が出てから着手する判断で良い。
