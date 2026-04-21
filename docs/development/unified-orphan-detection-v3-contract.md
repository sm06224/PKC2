# Unified Orphan Detection v3 — Behavior Contract (docs-only)

**Status**: behavior contract — 2026-04-20. **No implementation in this PR**.
**Purpose**: `docs/development/unified-orphan-detection-v3-draft.md` で推奨された方向性（定義 D2 / UX U5）を、実装着手前の **strict pre-implementation contract** として固定する。本書は S3〜S5 の実装 PR を起こす前にすべての条項が合意されている必要がある gate 文書であり、条件を 1 つでも欠けた実装提案は差し戻す。
**Baseline**: `unified-orphan-detection-v3-draft.md` §6 推奨方針、`orphan-detection-ui-v1.md`（v1 canonical）、`unified-backlinks-v0-draft.md §2`（用語分離契約）。

---

## 0. TL;DR

- v3 の canonical 追加概念は **`fully-unconnected`**（relations と markdown 両系で edge が 0）1 つのみ
- 現行 v1 `relations-orphan` は **canonical のまま** / rename しない / 削除しない
- `fully-unconnected` は v1 `relations-orphan` の **部分集合**（`fully-unconnected` ⊆ `relations-orphan`）
- 計算は完全に derived。AppState / container / persistence いずれにも書き込まない
- UI ラベルに `orphan` 単独語は禁止（§1 禁止語リストを UI 側にも伝播）
- `graph` 的意味論（連結成分 / 到達可能性 / hop 数）は一切含まない
- 実装着手条件は §7 のチェックリスト全項目充足。1 項目でも欠ければ S3 PR は起票しない

## 1. Normative terminology（用語規約）

### 1.1 許可用語（spec / commit / コメント）

| 用語 | 意味 | 位置づけ | 短縮可否 |
|-----|------|---------|--------|
| `relations-orphan` | `container.relations[]` の `from` / `to` のいずれにも該当しない entry | **canonical**（v1 継承） | 短縮不可。単独 "orphan" 禁止 |
| `fully-unconnected` | `relations-orphan` **かつ** 本 contract §2 の markdown 次元評価で markdown edge が 0 の entry | **canonical**（v3 新規） | 短縮不可 |
| `markdown-connected` / `relations-connected` | 各系で 1 エッジ以上に参加 | 副次的、spec 内使用可 | 短縮不可 |
| `markdown-evaluated archetype` | 本 contract §3.5 で markdown 次元評価の対象と定めた archetype | 副次的 | — |

### 1.2 禁止用語

| 用語 | 理由 | 違反時の対応 |
|------|------|----------|
| `orphan` 単独 | 範囲が曖昧、v1/v3 の区別が失われる | spec / commit / コメント / UI すべてで差し戻す |
| `unified orphan` | 合算語。`fully-unconnected` を採用したため冗長かつ誤解を生む | 差し戻す |
| `fully orphan` / `total orphan` / `complete orphan` | `fully-unconnected` 以外の合算的命名 | 差し戻す |
| `unreferenced` | inbound-only 意味論を示唆。本 contract scope 外 | 差し戻す |
| `isolated` / `dangling` / `leaf` / `sink` / `source` | graph 用語、意味のオーバーローディングを招く | spec 側差し戻し、UI 側も不可 |
| `disconnected` | connectedness の有無を曖昧に表現 | 差し戻す |

### 1.3 Provisional 用語（contract では canonical に昇格しない）

| 用語 | 目的 | 昇格条件 |
|-----|-----|--------|
| `markdown-orphan` | markdown 次元のみで edge 0 の entry 概念 | v3 では **UI に露出しない**。将来独立マーカー化が提案された時点で別 contract で検討 |
| `connectedness score` / `connectedness level` | 数値化・段階化 | 本 contract §6 で非ゴール |

**UI ラベル規則（§4 で再掲）**: ユーザ可視テキストには `orphan` を一切書かない。常に `"No relations yet"` / `"Fully unconnected"` / `"Only fully unconnected"` のように概念語を翻訳する。

### 1.4 既存 code 名の扱い

§1.2 の禁止は **spec / commit / コメント / UI テキスト** に対する規則であり、**既存 code symbol の rename は行わない**:

- `src/features/relation/selector.ts:buildConnectedLidSet` — 継続
- `src/features/relation/selector.ts:buildInboundCountMap` — 継続
- DOM attribute `data-pkc-orphan="true"` — 継続
- CSS class `.pkc-orphan-marker` — 継続
- `src/features/link-index/link-index.ts:buildLinkIndex` — 継続

新規命名は **addition-only**:
- helper: `buildConnectednessSets`（§5 推奨）
- DOM attribute: `data-pkc-connectedness="fully-unconnected"` または `data-pkc-unconnected="fully"`（§4 で確定）
- CSS class: `.pkc-unconnected-marker`（§4 で確定）

### 1.5 Backlinks 前置規則との整合

`unified-backlinks-v0-draft.md §2` の前置規則と **同水準で** orphan 系にも適用する。spec / commit / コメントで `relations-` / `markdown-` / `fully-` の前置を **必ず**付ける。前置を省略した書式（例: `"the orphan marker"`）はレビュー時に差し戻す。

## 2. Canonical v3 target definition（v3 正規定義）

### 2.1 定義（strict）

```
Let E = container.entries  (filtered to user entries by getUserEntries())
Let R = container.relations
Let L = buildLinkIndex(container)

relationsConnected(e)
  ⇔  e.lid ∈ { r.from : r ∈ R, r.from ≠ r.to }
                ∪ { r.to   : r ∈ R, r.from ≠ r.to }

markdownConnected(e)
  ⇔  |L.outgoingBySource.get(e.lid).filter(ref => ref.resolved)| > 0
    ∨ |L.backlinksByTarget.get(e.lid)|                                > 0

relationsOrphan(e)    ⇔  ¬ relationsConnected(e)
fullyUnconnected(e)    ⇔  ¬ relationsConnected(e) ∧ ¬ markdownConnected(e)
```

- **関係性**: `fullyUnconnected(e) ⟹ relationsOrphan(e)`（部分集合関係）
- **独立性**: `markdownConnected` は **resolved** markdown references のみを数える（broken は次数に寄与しない、§3.2）
- **self-loop 除外**: §3.3 の規則により `r.from === r.to` の relation は connectedness に寄与しない

### 2.2 v1 との差分

| 観点 | v1 `relations-orphan` | v3 `fully-unconnected` |
|------|---------------------|----------------------|
| データソース | relations のみ | relations + link-index resolved refs |
| self-loop 扱い | 寄与する（v1 挙動） | 寄与しない（§3.3） |
| broken ref 扱い | 関係なし | 寄与しない（§3.2） |
| archetype 依存 | 一切なし | `markdownConnected` は markdown-evaluated archetype のみ評価（§3.5） |
| 安定性 | relations 変更時のみ揺らぐ | body 編集でも揺らぎうる（§3.1） |
| 出現条件 | 常にすべての user entry が候補 | `relations-orphan` の部分集合（より稀） |
| v1 marker 挙動 | 保持 | `relations-orphan` = `fully-unconnected` ∨ (`relations-orphan` ∧ `markdownConnected`) のどちらでも v1 marker は出る（**v1 を破らない**） |

### 2.3 v1 継続性の保証

本 contract は v1 `.pkc-orphan-marker` / `data-pkc-orphan` の挙動を **一切変更しない**:
- `data-pkc-orphan="true"` は `relationsOrphan(e)` が真のとき付与。v3 追加後も判定式は同じ
- v1 の tooltip `"No relations yet"` も変更しない
- v1 既存テストは全数 pass 維持

v3 追加は `data-pkc-connectedness="fully-unconnected"` / `.pkc-unconnected-marker` の **新規** 体系として並立させる。

### 2.4 計算単位

- 計算は **entry 単位**。log 行単位 / heading 単位に粒度を下げない（§3.4 textlog 参照）
- 計算結果は render pass あたり 1 回（sidebar / meta 両方で同じ `ConnectednessSets` を共有するのが推奨、§5）

## 3. Edge-case rules（周辺条件）

Draft §3.2 で列挙した 5 落とし穴を条文化し、加えて folder / missing-dangling の 2 条件を追加する。

### 3.1 Body volatility / markdown reparse timing（body 揺らぎ）

**規則**: `fullyUnconnected` は render pass ごとに再評価され、body 変更がある度に状態が変わり得る。この**揺らぎは仕様**であり、debounce / stable-state gate を**追加しない**。

- ユーザが body に `entry:<lid>` を 1 行書いた瞬間に `fullyUnconnected` が外れる
- ユーザが行を消した瞬間に再度 `fullyUnconnected` になる
- この振る舞いは `markdownConnected` の意味（"現状 body に markdown edge があるか"）と**整合的**であり、隠す理由がない
- flicker 軽減は **UI 層の CSS transition** で緩和する余地はあるが（§4.5）、判定式そのものに debounce は入れない

### 3.2 Broken references（解決しない entry-ref）

**規則**: `entry:<lid>` が `container.entries` 上に存在しない target を指す場合、**`markdownConnected` に寄与しない**。

- `L.outgoingBySource` には `{ resolved: false }` として載るが、`fullyUnconnected` 判定では `.filter(ref => ref.resolved)` によって除外
- 理由: ユーザは broken link を「つながっている」と見なさない。broken は link-index-broken として別 UI で可視化する責務を持つ
- 逆向き（他 entry から自 entry を指す broken link）は原理的に `backlinksByTarget` に登場しない（`buildLinkIndex` 側が resolved 前提で pupulate）、したがって自動的に寄与しない

### 3.3 Self-loop relations（`from === to`）

**規則**: `r.from === r.to` の relation は `relationsConnected` に **寄与しない**。

- v1 `buildConnectedLidSet` は self-loop を寄与させる（set に lid を 1 回 add）ため、v1 挙動との乖離が発生
- v3 実装 PR では `buildConnectednessSets` が self-loop を除外する方針。**v1 `buildConnectedLidSet` は変更しない**（破壊的変更を避ける）
- 結果、v1 marker と v3 marker で self-loop 扱いが分岐するが、self-loop 自体が極稀な運用であり実害は小さい
- self-loop を「connectedness に寄与させる」方が妥当と見なされた場合は、本 contract を改訂してから実装する

### 3.4 Textlog entries

**規則**: textlog の連結判定は **entry 単位**で行う。log 行単位 / day 単位には粒度を下げない。

- `buildLinkIndex` 実装は textlog の log 行 body をまとめて走査し、抽出 reference は **textlog entry の lid** 単位で `outgoingBySource` に入る
- したがって `markdownConnected` も textlog entry 全体として評価される
- 「1 個の log 行だけが参照を持つ textlog entry」→ textlog entry 全体が markdownConnected 扱いになる。これは意図的（log 単位判定を始めると粒度爆発する）

### 3.5 Archetype eligibility（archetype 別 gate）

**規則**: `markdownConnected` の評価対象 archetype（**markdown-evaluated archetype**）は以下に限定する:

| archetype | `markdownConnected` 評価 | 理由 |
|----------|-------------------------|------|
| `text` | ○ | body が markdown |
| `textlog` | ○ | log 行内 body を走査 |
| `folder` | ○ | folder description が markdown |
| `todo` | ○ | description が markdown |
| `form` | × | body が form schema、markdown 走査不可 |
| `attachment` | × | body が JSON（添付メタ）、markdown 走査不可 |
| `generic` | × | 形式不問、markdown 走査しない |
| `opaque` | × | opaque 前提、body を走査しない |

`markdownConnected` 評価外の archetype は **`fullyUnconnected` 判定から markdown 次元を除外** する:
- つまり `form` / `attachment` / `generic` / `opaque` 行は `relationsConnected(e)` のみで判定
- これらの archetype の entry は `fullyUnconnected(e) ⇔ ¬ relationsConnected(e)` と等しい（= `relationsOrphan` と一致）
- UI 上は v1 marker と v3 marker が**常に同時に出る / 同時に出ない**挙動になる

### 3.6 Folders

**規則**: folder は他 archetype と**同じ規則で評価**する。folder 特有の例外を設けない。

- 子を持つ folder は `structural` relation を outbound で持つ → `relationsConnected` 真 → marker なし
- 親に属する folder は `structural` relation を inbound で持つ → 同上
- 空かつ root 直下の folder → `relationsOrphan` 真 / `fullyUnconnected` は folder description の markdown 次第
- v1 挙動（folder を特別扱いしない）を継承、v3 でも同じ

### 3.7 Missing / dangling references

**規則**: `from` または `to` が削除済み entry を指す relation（dangling relation）の扱い:

- `relationsConnected(e)`: 他の relation で繋がっていない限り **`e` は connected 扱いにならない**（dangling は相手側に影響しない）
- `markdownConnected(e)`: broken ref 扱いと同じく寄与しない（§3.2）
- dangling relation 自体の存在は `buildConnectednessSets` の計算結果を変えない（`buildConnectedLidSet` 挙動の延長、v1 と同じく harmless）

### 3.8 Provenance relations の扱い

**規則**: `kind === 'provenance'` の relation は、他 kind と**同等に** `relationsConnected` に寄与する。

- provenance は system-generated だが、entry が何らかの派生関係に参加していることは connectedness の要件を満たす
- `fullyUnconnected` の対象から外すと、TEXT → TEXTLOG 変換で derived された entry が "fully unconnected" 扱いになり直感に反する
- kind 特別扱いを v3 でも導入しない（v1 と同方針）

### 3.9 Hidden / soft-deleted entries

**規則**: `getUserEntries()` 通過後の entry 集合を判定対象とする。soft-delete / hidden archetype / system entry は本 contract の評価範囲外。

- v1 と同じ対象集合
- trash 系 entry は判定自体を行わない（sidebar に出ないため）

## 4. UI contract boundaries（UI 契約境界）

### 4.1 Marker が意味するもの

v3 実装段階で追加される **`.pkc-unconnected-marker`** は、**当該 entry が §2.1 の `fullyUnconnected` 述語を真にしている** ことだけを意味する。

許容される意味の言い換え（UI tooltip / aria-label として可）:
- `"Fully unconnected"` ✓
- `"No relations and no markdown refs"` ✓
- `"Not connected to any other entry (currently)"` ✓

### 4.2 Marker が意味しないもの（強制規則）

UI は以下のいずれも示唆してはならない:

1. **削除候補 / 整理対象**: marker は "まだ繋がっていない" 事実を示すだけで、"消してよい" を意味しない。`"Delete"` / `"Clean up"` / `"Remove unused"` 等の文言を marker 由来で出さない
2. **品質低下 / error**: warning icon / 赤色 / danger color は使わない。`.pkc-orphan-marker` と同系統の muted 表現を継承
3. **graph 上の到達可能性**: transitive closure は計算しない。`"Unreachable"` / `"Disconnected from graph"` 等の表現は不可
4. **重要度 / 優先度の示唆**: `"Low priority"` / `"Draft"` 等、marker の有無を priority に結びつけない
5. **link 自動生成の促し**: marker click で relation 作成 dialog を開く / markdown link を挿入する等は **v3 範囲外**（§6 で非ゴール固定）

### 4.3 Filter wording 制約

U5 採用時に追加される `sidebar filter` の選択肢文言は以下に固定:

| 可視ラベル | 内部値 | 意味 |
|-----------|-------|------|
| `"Show all"` | `all` | フィルタ無し（既定） |
| `"Only fully unconnected"` | `fully-unconnected` | `fullyUnconnected(e)` 真のみ |
| `"Only relations-unconnected"` | `relations-orphan` | `relationsOrphan(e)` 真のみ（v1 marker 対象） |

禁止される可視ラベル:
- `"Only orphans"` / `"Show orphans"` — 無修飾 `orphan` が禁止用語
- `"Unified orphan filter"` — 合算語禁止
- `"Unreachable entries"` / `"Isolated entries"` — graph 用語禁止

内部値（state / URL / selector attribute など）は spec 上の `relations-orphan` / `fully-unconnected` をそのまま使い、UI ラベルのみ翻訳する。

### 4.4 DOM 契約

#### 4.4.1 Sidebar 側 attribute

| attribute | 値 | 付与条件 |
|-----------|-----|--------|
| `data-pkc-orphan` | `"true"` | `relationsOrphan(e)` 真（v1 挙動、**変更不可**）|
| `data-pkc-connectedness`（新） | `"fully-unconnected"` | `fullyUnconnected(e)` 真 |
| `data-pkc-connectedness`（新） | `"relations-orphan"` | `relationsOrphan(e)` 真 ∧ `markdownConnected(e)` 真（v1 marker は出るが v3 の fully ではない） |
| `data-pkc-connectedness`（新） | `"connected"` | `relationsConnected(e)` 真 |

`data-pkc-orphan` と `data-pkc-connectedness` は**並立**する。どちらか片方を外す実装は不可。

#### 4.4.2 CSS class

| class | 描画条件 | v1 / v3 |
|-------|---------|--------|
| `.pkc-orphan-marker` | `data-pkc-orphan="true"` | **v1 継続** |
| `.pkc-unconnected-marker`（新） | `data-pkc-connectedness="fully-unconnected"` | **v3 新規** |

2 marker は同一 entry 行で**同時に出うる**（`fullyUnconnected ⟹ relationsOrphan` のため）。実装では sidebar 行末に 2 記号並置、または 1 本化 CSS で表現する選択は §4.5 の優先順位に従う。

### 4.5 表示優先度 / 合成ルール

`fullyUnconnected(e)` 真 ∧ `relationsOrphan(e)` 真の場合（常に真、§2.1 部分集合関係）:

**規則**: marker を 2 個並べるか 1 個に合成するかは実装 PR の裁量だが、**以下の原則を守る**:
- v1 marker（`○`）と v3 marker（暫定 `◌` or 色変化）の視覚的区別がつくこと
- `fully-unconnected` のとき **v1 marker を非表示にしない**（v1 既存テストと挙動を維持）
- "marker 記号は 1 つ、色で fully を示す" 方式も許容（v1 marker を赤系にする等は §4.2-2 に抵触するため不可）

推奨案: v1 marker 右側に小さな v3 marker を**追加表示**。幅狭時は v3 を先に省略して v1 を残す（既存挙動の安定性優先）。

### 4.6 summary row との関係（U2 の境界）

`references-summary-row-v2.md` の summary row に connectedness label を出すか否かは **v3 実装範囲では採らない**。理由:

- summary row は "選択中 entry の現状を 3 値で示す" のがスコープ
- connectedness は sidebar 俯瞰の概念であり、単一 entry 画面で出すとスコープが混じる
- Draft §4 U2 は △ 評価、U5（U1+U3）を推奨した経緯を維持

将来 summary row に出す必要が生じたら、別 contract で追補する。

### 4.7 a11y 要件

- `.pkc-unconnected-marker` は `aria-hidden="true"` + `title` 属性の組み合わせを使う（v1 `pkc-orphan-marker` と同パターン）
- screen reader は marker 自体を読み上げず、entry title とその後の badge count / revision 情報の流れを保つ
- filter UI は `<select>` または `<fieldset>` with radio。ラベルは §4.3 の表を使用

### 4.8 graph 的意味論を一切含まない（規範条項）

marker / filter / tooltip / attribute いずれも以下を **含意しない**:
- entry 間の連結成分分類
- 最短 hop 数 / 距離
- hub / authority / centrality
- 到達可能性（transitive reachability）

これらの語彙・UI・計算は **v3 範囲外**（§6 で非ゴール固定）。将来必要になっても別 feature として独立させ、本 contract は波及させない。

## 5. Data / computation contract（データ・計算契約）

### 5.1 Derived-state only（永続化禁止）

- `relationsConnected` / `markdownConnected` / `fullyUnconnected` はすべて **derived**。container に書き戻さない
- `Container` / `Entry` / `Relation` / `Revision` の schema に新フィールドを**追加しない**
- export / import / merge いずれでも connectedness は計算側の責務、データ側は関わらない

### 5.2 AppState mutation 禁止

- `AppState` に `orphan` / `unconnected` / `connectedness` 系の field を**追加しない**
- reducer の既存 action に connectedness 関連の payload を**追加しない**
- `Dispatcher` に connectedness 専用 event を**追加しない**
- 必要な計算は render pass 内で **毎回** 行う（既存 `buildConnectedLidSet` / `buildInboundCountMap` と同パターン）

### 5.3 Layer 配置（5-layer policy 準拠）

**推奨配置**（Draft §5.3 を contract に昇格）:

```
src/features/connectedness/
  index.ts          // 公開 API
  sets.ts           // buildConnectednessSets 実装
```

- `core/` 配置は禁止（link-index に依存するため依存方向が逆流）
- `adapter/` 配置も禁止（複数箇所で再利用するため features 単位が妥当）
- `features/connectedness/` 単位でモジュールを切ることで、relations selector と link-index の両方を import する唯一の pure module として責務を明確化

代替案（実装 PR の裁量で選択可）:
- `src/features/relation/selector.ts` 内に `buildConnectednessSets` を追加 — 単一ファイル主義を優先する場合
- ただし link-index import が relation selector に入ると依存が増えるので、新ディレクトリ推奨

### 5.4 公開 API 契約（pure helper）

```ts
export interface ConnectednessSets {
  relationsConnected: ReadonlySet<string>;
  markdownConnected: ReadonlySet<string>;
  fullyUnconnected: ReadonlySet<string>;
}

export function buildConnectednessSets(container: Container): ConnectednessSets;
```

- 入力: `Container`（relations + entries + 実体の body へのアクセス）
- 出力: 3 つの `ReadonlySet<string>`（lid 集合）
- 副作用なし。参照透明
- 実装は relations を 1 pass + link-index を 1 pass、計 O(R + N + B)
- `markdownConnected` は `buildLinkIndex` を内部で呼ぶ（呼び出し側が既に LinkIndex を持っていれば overload で共有できるように実装するのも可）

### 5.5 計算頻度 / memoization 方針

- render pass ごとに毎回計算する（stale 回避の単純化、§5.2 と整合）
- memoization は **v3 ではオプトアウト**。必要になった時点で別 contract で検討
- input（container）が変わらない限り同じ結果を返す純性質を利用し、上位の render memoization（既存の AppState → DOM のメモ戦略）に委ねる

### 5.6 Hidden semantic merging の禁止

以下はいずれも **実装しない**:
- `relations-connected` と `markdown-connected` を **1 つの "is-connected" 概念に内部で合成**する
- 合成 score（0〜1、connectedness percentage）を出す
- 閾値で "weakly connected" を追加する
- UI で "kind of" connected のように曖昧な半接続状態を表現する

`fullyUnconnected` は **boolean** でしか表現しない。中間状態を作らない。

### 5.7 Performance 契約

- 1 render pass あたり O(R + N + B)、`R = relations.length`、`N = entries.length`、`B = 全 entry の body 合計文字数`
- References summary row v2 が既に render ごとに `buildLinkIndex` を呼んでいるため、**追加コストは relations 1 pass + set 差分だけ** が理想
- 実装 PR では `LinkIndex` を sidebar / meta 両方で**共有する**ことを推奨（同一 render pass で 2 回計算しない）
- 実測での目標数値は実装 PR で決める（本 contract では O スケールのみ固定）

### 5.8 テスト契約（実装 PR の最低線）

`buildConnectednessSets` の unit test として以下を要求:

1. empty container → 3 set すべて空
2. relations に参加する entry → `relationsConnected` に含まれる
3. body に `entry:<lid>` を持ち、target が存在 → `markdownConnected` に含まれる
4. body に `entry:<lid>` を持ち、target が存在しない → `markdownConnected` に含まれ**ない**（broken 除外、§3.2）
5. self-loop relation のみを持つ entry → `relationsConnected` に含まれ**ない**（§3.3）
6. relations に参加 ∧ body 内 markdown ref なし → `relationsConnected` ∧ `¬markdownConnected` ∧ `¬fullyUnconnected`
7. どちらも 0 → `fullyUnconnected` に含まれる
8. `fullyUnconnected(e)` ⟹ `¬relationsConnected(e)` （部分集合関係の機械的確認）
9. archetype gate: `form` / `attachment` / `generic` / `opaque` は `markdownConnected` から除外される（§3.5）
10. dangling relation（削除済み entry を指す）: 相手側の connectedness に影響しない（§3.7）

### 5.9 既存 helper との関係

- `buildConnectedLidSet` は **変更しない**（v1 互換維持、§3.3 self-loop 扱いの乖離を許容）
- `buildInboundCountMap` は **変更しない**
- `buildLinkIndex` は **変更しない**
- 新 helper `buildConnectednessSets` はこれら 2 関数を内部で再利用する。wrapper layer に徹する

### 5.10 Persistence / Export / Import への影響

- `dist/` output には connectedness 情報を**書き込まない**（derived のまま）
- IndexedDB snapshot にも書き込まない
- merge import / batch import いずれでも connectedness は計算時点で再構築される純粋 derived
- portable HTML 化・manual export いずれにも影響なし

## 6. Explicit non-goals（非ゴール）

### 6.1 本 PR の範囲外
- **実装は一切含まない**。source / tests / dist のいずれも変更しない
- **既存 v1 挙動の改修を含まない**。`orphan-detection-ui-v1.md` は canonical として継続
- **draft 文書の書き換えを含まない**（tiny cross-reference 追加のみ可、今回は追加すらしていない）

### 6.2 将来 (v3 実装後) も採らない選択

#### 6.2.1 Graph view
- 連結成分の可視化 / node-link ダイアグラム / force-directed layout を含むビュー
- `backlink-badge-jump-v1.md §6` の graph defer policy を継承、解除しない

#### 6.2.2 Connectedness score / level / 段階化
- 数値化（0〜1 / 0〜100 / hop 数）
- 段階ラベル（`weakly-connected` / `moderately-connected` 等）
- **`fullyUnconnected` は boolean のみ**。途中状態を作らない（§5.6）

#### 6.2.3 Automatic cleanup / garbage-collection 示唆
- "この entry を削除しますか" 系 prompt
- bulk delete by connectedness filter
- marker click → 削除候補表示

#### 6.2.4 Link 自動生成・relation 自動作成の示唆
- marker click → "Create relation" dialog
- markdown link 挿入の提案
- UI 側は検出だけ、修復は既存の manual flow を使う

#### 6.2.5 合算用語の復活
- `unified orphan` / `total orphan` / `fully orphan` 系の UI / spec 再導入
- `fully-unconnected` 以外の合算的命名

#### 6.2.6 D4 (structural-only) / D5 (inbound-only)
- Draft §3 で "採らない" と決めた 2 定義
- 必要性が出たら別 feature として独立させ、本 contract は波及させない

#### 6.2.7 Broken link との統合
- "broken link があれば orphan 扱い" 等の強結合
- broken は link-index-broken として独立系、本 contract は触らない

#### 6.2.8 kind 別 connectedness（kind-scoped orphan）
- `structural-orphan` / `semantic-orphan` 等、relation kind で切る判定
- provenance 特別扱い（§3.8 で禁止）

### 6.3 プロセス面の non-goal

- **contract → draft への書き戻し**: 本 contract で新たに判明した事柄は、contract 側に書く。draft は方向性 gate として凍結
- **contract 中での実装判断**: 実装 PR で決めるべき項目（色 / 記号 / 具体 file split）は contract で確定させない
- **contract と manual 文書の同時更新**: 実装完了まで manual（`docs/manual/*`）は触らない

## 7. Exit criteria for implementation PR（実装着手条件）

S3（pure helper 実装）を起票するには、以下**すべて**が満たされている必要がある。1 つでも欠ければ差し戻す。

### 7.1 Preconditions（必須条件）

- [ ] **E1 contract merged**: 本 contract（`unified-orphan-detection-v3-contract.md`）が main に merge 済み
- [ ] **E2 draft merged**: `unified-orphan-detection-v3-draft.md` が main に merge 済み（既に充足）
- [ ] **E3 terminology discipline**: 提案 PR の description / commit / code コメントで §1.2 禁止用語を使っていない
- [ ] **E4 archetype gate understood**: §3.5 の markdown-evaluated archetype リストを実装が遵守する旨が明示されている
- [ ] **E5 v1 continuity**: §2.3 に従い v1 `.pkc-orphan-marker` / `data-pkc-orphan` / `buildConnectedLidSet` を **rename / semantic change しない** ことを明示
- [ ] **E6 no persistence**: §5.1〜§5.2 に従い container schema / AppState に connectedness field を追加しない
- [ ] **E7 layer placement**: §5.3 に従い `features/connectedness/` 配置を採る（または代替案を contract 改訂して正当化）
- [ ] **E8 no hidden merging**: §5.6 に従い `fullyUnconnected` を boolean 以外に拡張する設計を含まない
- [ ] **E9 test plan**: §5.8 の 10 項目 unit test がすべて含まれる計画

### 7.2 S3 PR のスコープ境界（実装 PR で**やること** / **やらないこと**）

#### S3 でやること（pure helper 実装）
- `src/features/connectedness/index.ts` + `sets.ts` 新規作成
- `buildConnectednessSets` 実装
- unit tests（§5.8 の 10 項目）
- tsdoc / コメントで本 contract を参照
- spec doc 更新は **不要**（本 contract で足りる）

#### S3 でやらないこと
- adapter / UI touch
- DOM attribute 追加
- CSS class 追加
- CLAUDE.md / manual の touch
- 既存 `buildConnectedLidSet` の変更

### 7.3 S4 PR（sidebar marker）の exit criteria

S4 を起票するには、S3 に加え:
- [ ] **E10 S3 merged**: S3 PR が main に merge 済み
- [ ] **E11 DOM / CSS 契約**: §4.4 の attribute / class を rename / 省略しない
- [ ] **E12 v1 continuity check**: S4 merge 後も v1 既存テスト（`pkc-orphan-marker` / `data-pkc-orphan` 関連）が **全数 pass**
- [ ] **E13 a11y**: §4.7 の要件（`aria-hidden="true"` + `title`）を満たす
- [ ] **E14 no graph wording**: §4.8 を守る UI テキスト

### 7.4 S5 PR（optional filter）の exit criteria

S5 は optional。起票する場合:
- [ ] **E15 S4 merged**: S4 PR が main に merge 済み
- [ ] **E16 filter wording**: §4.3 の可視ラベルのみ使用
- [ ] **E17 existing filter coexistence**: 既存 `archetypeFilter` / `tagFilter` / `sortKey` との共存設計
- [ ] **E18 state model**: filter state を AppState に持つ場合の設計書（§5.2 の derived-only 原則と衝突しないこと — filter は UI state でありデータ state ではないため容認）

### 7.5 差し戻し条件（automatic rejection）

以下のいずれかに該当する提案 PR は **即座に差し戻す**:

- UI テキストに無修飾 `"orphan"` / `"unified"` / `"isolated"` / `"disconnected"` が含まれる
- `Container` / `Entry` / `Relation` schema に field 追加を含む
- v1 `.pkc-orphan-marker` の rename / 色変更 / 挙動変更を含む
- `fullyUnconnected` を boolean 以外で表現する設計
- graph visualization / 連結成分計算 / hop 数計算を含む
- broken ref を `markdownConnected` に寄与させる設計

### 7.6 Contract 改訂のトリガー

以下の状況でのみ本 contract を改訂する:
- 実装着手後に §3 の edge case が不足だと判明した場合
- UI 検証で §4 の marker 視覚設計が現実に合わなかった場合
- performance 目標が §5.7 を超過して実測が必要になった場合

改訂は**必ず docs-only PR** として本 contract を修正し、main merge を得てから実装 PR を続行する。実装 PR 内で契約を変更しない。

## 8. 関連文書

### 前段・直接の親
- `docs/development/unified-orphan-detection-v3-draft.md` — v3 方向性 draft、本 contract の直接の親
- `docs/development/orphan-detection-ui-v1.md` — v1 canonical（`relations-orphan` 挙動）、本 contract が継承する既存挙動
- `docs/development/unified-backlinks-v0-draft.md §2` — 用語分離契約、本 contract §1 の元型
- `docs/development/unified-backlinks-v1.md` — References umbrella、§4.6 関係

### 周辺 spec / development docs
- `docs/development/backlinks-panel-v1.md` — relations-based backlinks sub-panel
- `docs/development/sidebar-backlink-badge-v1.md` — sidebar badge、本 contract §4.4 の属性設計の前例
- `docs/development/backlink-badge-jump-v1.md` — badge jump、§6.2.1 の graph defer policy の原典
- `docs/development/relation-kind-edit-v1.md` — relation kind 編集、provenance 二重ガード
- `docs/development/provenance-metadata-viewer-v1.md` — provenance 読み取り UI、§3.8 の provenance 扱いと対照
- `docs/development/references-summary-row-v2.md` — summary row、§4.6 の境界判断に関係

### link-index 系
- `docs/spec/link-index-v1-minimum-scope.md` — link-index scope 固定
- `docs/spec/link-index-v1-behavior-contract.md` — link-index 挙動 canonical
- `docs/spec/body-formats.md §10` — `entry:<lid>` 記法

### data model 系
- `docs/spec/data-model.md §5` — `Relation` / `RelationKind` 正規定義
- `src/core/model/relation.ts` — `Relation` 型
- `src/core/model/container.ts` — `Container` 型

### 実装時に touch する code（予定、S3〜S5 でのみ）
- `src/features/relation/selector.ts` — `buildConnectedLidSet` / `buildInboundCountMap`（参照のみ、変更なし）
- `src/features/link-index/link-index.ts` — `buildLinkIndex`（参照のみ、変更なし）
- `src/features/connectedness/index.ts`（**新規予定**、S3）
- `src/features/connectedness/sets.ts`（**新規予定**、S3）
- `src/adapter/ui/renderer.ts` — sidebar render（S4 で touch、§4.4 attribute 追加）
- `src/styles/base.css` — `.pkc-unconnected-marker`（S4 で touch）
- 必要に応じ `src/adapter/state/app-state.ts` — filter state（S5 で検討、§7.4 E18）

### 後続文書（実装後）
- S3 実装 PR の `docs/development/` 側 dev doc（pure helper の実装ノート）
- S4 実装 PR の dev doc（sidebar marker の実装ノート）
- S5 実装時の dev doc（filter の実装ノート）
- manual 文書（`docs/manual/*`）への反映は全 S 実装完了後に 1 回で行う
