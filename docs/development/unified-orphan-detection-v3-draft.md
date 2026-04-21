# Unified Orphan Detection v3+ — Design Draft (docs-only)

**Status**: design draft — 2026-04-20. **No implementation in this PR**.
**Purpose**: 現在の orphan 判定（`orphan-detection-ui-v1.md`）が意図的に relations-based only である前提を維持しつつ、将来 link-index / markdown-reference を含む broader な "unconnected" 概念を扱うための **terminology 分離 / 定義候補 / UX 選択肢 / データ面での負荷** を先に設計面で整理する。本書は実装着手の合意文書ではなく、**実装に踏み込む前に用語と境界を固定する** gate draft である。

---

## 0. TL;DR

- 現行 v1 orphan = **"`container.relations[]` に一切参加していない entry"**。定義として意図的に狭く、relations-based "connectedness" しか見ない
- markdown-reference 側の connectedness（`buildLinkIndex` の outgoing + backlinks）を合算する "unified orphan" は **概念として混乱しやすい**。単純和集合だと「body に `entry:<lid>` を 1 個書いただけで orphan 判定が外れる」ため **semantic overreach** のリスクがある
- 推奨: **一意の "unified orphan" 概念を作らない**。代わりに **複数のはっきり名付けられた connectedness 状態**を並立させ、UI は「どの観点で unconnected か」を明示する（例: `relations-orphan` / `markdown-orphan` / `fully-unconnected`）
- v1 `pkc-orphan-marker` は **"relations-orphan" の別名として保持**。将来 `fully-unconnected` を追加するときも `.pkc-orphan-marker` を rename しない（CSS / DOM contract の破壊を避ける）
- 実装は本 draft で合意後の別 PR。docs-first、実装段階で behavior contract を別 spec として起こす前提

## 1. Current state（現状整理）

### 1.1 v1 orphan marker が意味するもの

`orphan-detection-ui-v1.md` §2 / `src/features/relation/selector.ts:buildConnectedLidSet` で確定した定義:

```
connectedLids = { r.from for r in container.relations } ∪ { r.to for r in container.relations }
isOrphan(entry) ⇔ entry.lid ∉ connectedLids
```

- 判定対象: sidebar に表示される user entry（`getUserEntries()` 後、`system-*` は元々 sidebar に出ないため marker 対象外）
- archetype による区別なし。folder も同じ規則で判定する
- readonly / lightSource / manual sort でも **判定と視覚は同一**
- DOM: `<li data-pkc-orphan="true">` + 行末に `<span class="pkc-orphan-marker">○</span>`
- tooltip: `"No relations yet"`
- 複雑度: `O(R + N)`（relations 1 pass で set 構築、sidebar 各行 O(1) lookup）

### 1.2 v1 orphan marker が**意味しないもの**

本 draft 執筆時点で混同を避けたい事柄:

1. **"本当にどこからも辿れない"** を意味しない。body に `entry:<lid>` の markdown link があっても、**relations にエントリしていなければ** orphan marker が出る
2. **"削除候補"** を意味しない。orphan = 整理が追いついていないだけの自然な状態（draft / WIP）でも生じる
3. **"broken link 起点"** を意味しない。broken は link-index 由来の概念、orphan は relations 由来の概念で別系統
4. **"folder 構造から外れている"** を意味しない。folder 構造も `structural` relation として relations-based に組み込まれているので、root 直下の entry は基本的に orphan にならない
5. **graph 上の連結成分**を意味しない。v1 は 1 エッジでも触れていれば connected 扱い。連結性（transitive closure）は計算していない

### 1.3 link-index が v1 で除外されている理由

`orphan-detection-ui-v1.md` §5 / `unified-backlinks-v0-draft.md` §2.4 で明記された分離契約の系として:

1. **データソースが異なる**: relations は first-class persisted edge、link-index は body 解析由来の derived state
2. **削除の責務が異なる**: relation は explicit delete、markdown reference は body 編集でしか消えない。同じ "orphan" という一語で扱うと、ユーザが `pkc-orphan-marker` を見て何を直せばいいか分からなくなる
3. **kind 意味論が違う**: relations は `structural` / `categorical` / `semantic` / `temporal` / `provenance` の 5 種、markdown-reference には種類が無い。"connected" を同格に扱うと kind-blind になり、本当は `structural` で繋がっているべき entry が `semantic` 風の markdown link 1 本で orphan 脱出扱いされる
4. **body 変更頻度による不安定さ**: markdown-reference は body 編集で毎回変動する。orphan 状態が user の軽い編集で振動すると "気づき" として価値が下がる
5. **body 暴露の懸念**: link-index の内部実装は body を走査するので、orphan 判定を link-index ベースに寄せると、body の中身が marker の on/off に影響する副作用を sidebar に持ち込む（render コスト / プライバシの敷居が上がる）

この 5 点は **v1 の判断の根拠**であって、v3 で必ずしも踏襲しないが、**踏襲しない選択をするなら各点の解消策を draft 段階で明示する** のがルール。

## 2. Terminology（用語）

### 2.1 用語テーブル（v3 以降）

| 用語 | 定義 | 使用可否 | 由来 / 備考 |
|------|------|----------|------|
| **relations-orphan** | `container.relations[]` の `from` / `to` のいずれにも該当しない entry | **canonical**（v1 で既に実体がある、rename しない） | v1 `orphan-detection-ui-v1.md` の "relations-based orphan" の短縮形 |
| **markdown-orphan** | body に `entry:<lid>` 形式 outgoing reference を 1 件も持たず、他 entry から markdown-reference backlinks も受けていない entry | **provisional**（v3 で導入するか未確定） | link-index derived。作用は body 編集で変動 |
| **fully-unconnected** | relations-orphan **かつ** markdown-orphan（= どちらの系でも 1 本も edge が無い） | **provisional** / **canonical 候補**（v3 の中核） | 「本当に孤立」を意味する。単独で "orphan" と呼ばない |
| **relations-connected / markdown-connected** | 各系で 1 エッジ以上に参加している entry | 副次的用語、spec 文書内で可 | "non-orphan" の系別表現 |
| **unified orphan** | relations + markdown 合算で "orphan" を 1 概念化する呼称 | **使用禁止** | 合算の方法次第で意味が揺れる / ユーザに混乱を与える。明示的 alias の `fully-unconnected` を採る |
| **orphan**（無修飾） | — | **使用禁止** | spec / commit / UI テキスト・コメントいずれも禁止。必ず `relations-` / `markdown-` / `fully-` のいずれかを前置する |
| **isolated** / **dangling** / **leaf** / **sink** / **source** | — | **別文脈で使用（graph 用語）** | "orphan" に寄せない |

### 2.2 "backlinks" 前置規則との対応

`unified-backlinks-v0-draft.md §2` で固定した前置ルール:
- `"Backlinks"` 単独語は UI 見出しの 2 箇所（sub-panel 内）に限定、その他は必ず `"relations-based backlinks"` / `"link-index backlinks"` / `"markdown-reference backlinks"` を前置

本 draft は **同じ前置規則を orphan 系にも適用** する:
- spec / commit / コメントでは `"relations-orphan"` / `"markdown-orphan"` / `"fully-unconnected"` を **短縮せず**使う
- UI ラベルで短縮が必要なら `"No relations"` / `"No markdown refs"` / `"Fully unconnected"` のように **概念語を翻訳する**（"orphan" をそのまま UI に出さない）

### 2.3 provisional マーキングの扱い

`markdown-orphan` / `fully-unconnected` は **provisional** として書き、PR 段階の差し戻しを受け付ける:

- v3 が **"unified" 方向を採らない** と決めた場合 → `markdown-orphan` / `fully-unconnected` は本 draft で破棄、§6 推奨方針で別名に置き換え
- v3 が **採用方向** に進む場合 → 次段階 `unified-orphan-detection-v3-contract.md` で canonical に昇格
- 本 draft の merge 時点では **いずれもまだ UI / code に出さない**。provisional 期間中に code へ流出させないのが最重要ルール

### 2.4 既存 code との互換性

既に code 側に実在する名前は **rename しない**:

- `src/features/relation/selector.ts:buildConnectedLidSet` — そのまま
- DOM attribute `data-pkc-orphan="true"` — そのまま
- CSS class `.pkc-orphan-marker` — そのまま
- `getRelationsForEntry` / `buildInboundCountMap` — そのまま

将来 `fully-unconnected` を追加する際は **addition-only**:
- 新 attribute 例: `data-pkc-unconnected="fully"` または `data-pkc-connectedness="fully-unconnected"`
- 新 CSS class 例: `.pkc-unconnected-marker`
- 既存 `pkc-orphan-*` は `relations-orphan` 用途として**継続利用**し、意味を変えない

## 3. Possible definitions（orphan 定義の候補比較）

候補 5 本を列挙し、意味論・誤検出リスク・ユーザ期待との一致・複雑度を比較する。判定対象はいずれも user entry（sidebar 掲出対象）のみ。

### D1. Relations-only（= 現行 v1）

```
isOrphan(e) ⇔ e.lid ∉ connectedLids(container.relations)
```

| 評価軸 | 結果 |
|------|------|
| 意味論 | relations-based "connectedness" のみ。明快で 1 層 |
| 誤検出 | ほぼ無い（relations は explicit） |
| ユーザ期待との一致 | "relations を全く張っていない" ≒ "整理が追いついていない" と一致 |
| 実装コスト | 既存、追加ゼロ |
| ユーザ教育 | `"No relations yet"` tooltip で足りる |
| 限界 | body に markdown link があっても relations 0 だと marker が出る（= 意図的、body の変動で orphan 判定が揺れないメリット）|

**強み**: 現行そのもの。安定している。
**弱み**: 「relations は使わないが markdown link で繋いでいる」運用スタイルでは marker が出すぎる可能性。

### D2. Strict union（relations ∪ markdown-index 両方とも 0）

```
isOrphan(e) ⇔ e.lid ∉ connectedLids(relations)
           ∧ outgoing(linkIndex, e.lid).length == 0
           ∧ backlinks(linkIndex, e.lid).length == 0
```

"どちらの系でも 1 本も edge を持たない" = D1 の結果に対し `markdown-orphan` の両系 zero 条件を **AND** する厳しい定義。

| 評価軸 | 結果 |
|------|------|
| 意味論 | 「本当に孤立」。fully-unconnected と同値 |
| 誤検出 | 極小（D1 より narrow） |
| ユーザ期待との一致 | "消し忘れ WIP / 放置メモ" を強く示唆、発見価値が高い |
| 実装コスト | D1 + link-index 呼び出し。`buildLinkIndex` は container 全体で 1 pass、追加は既存構造の再利用 |
| ユーザ教育 | `"Fully unconnected"` tooltip 等で意味伝達可能 |
| 限界 | body 編集で markdown link を 1 本書いた瞬間に解除される（body 依存の揺らぎ） |

**強み**: 「relations だけでは捉えきれない小さな orphan」も拾える余地を失わない。
**弱み**: D1 より marker が出にくい = 既存 marker の厳しさが**下がる** 方向。v1 user の体感では「減った」ように見える。

### D3. Relations-only + broken marker 併記（D1 拡張）

D1 の判定はそのままに、**別 layer** で「broken link を 1 本以上抱えている entry」を別 marker（例: `⚠`）として出す。

| 評価軸 | 結果 |
|------|------|
| 意味論 | orphan 判定自体は relations-based のまま。broken は**別概念**として並列に可視化 |
| 誤検出 | orphan は D1 と同じ。broken は link-index source of truth |
| ユーザ期待との一致 | orphan と broken を**分離**することで用語負債が増えない |
| 実装コスト | link-index を sidebar に持ち込む必要がある（1 pass は既に References summary で計算済みだが、per-entry で broken 数を持ってくるには builderが必要） |
| ユーザ教育 | `"No relations yet"` と `"Has broken links"` の 2 tooltip |
| 限界 | marker が増える → 行末の情報密度が上がる |

**強み**: orphan と broken を区別して扱える。
**弱み**: "unified orphan" という本 draft の問いに対しては、そもそも unify せず並列表示する立場。

### D4. Structural-relation-only

```
isOrphan(e) ⇔ ∀r ∈ relations : (r.from === e.lid ∨ r.to === e.lid) ⇒ r.kind ≠ 'structural'
```

folder 配下にも所属せず、かつ親構造 relation が 1 本も無い entry を orphan とする。kind 別の connectedness。

| 評価軸 | 結果 |
|------|------|
| 意味論 | 「folder から外れている」に近い |
| 誤検出 | categorical / semantic / temporal の relation を持つ entry も orphan 判定 → root 直下の非構造 entry が全員 orphan になりかねず、当初意図から逸れる |
| ユーザ期待との一致 | folder 中心運用では直感的、tag / semantic 中心運用ではノイズ |
| 実装コスト | relations 1 pass + kind 判定 |
| 限界 | "orphan" 概念を kind に縛る = v1 の kind-agnostic 性を壊す |

**強み**: folder 構造を主軸にした運用に強い。
**弱み**: relation kind の 5 種それぞれが別々の UX を要求し始める前段になりかねない。本 draft では**採らない**方向が自然。

### D5. Inbound-only（辿り着けない entry）

```
isOrphan(e) ⇔ {r ∈ relations : r.to === e.lid}.length == 0
           ∧ {ref ∈ linkIndex : ref.targetLid === e.lid ∧ ref.resolved}.length == 0
```

"どこからも参照されていない" = inbound 0。outbound は問わない。

| 評価軸 | 結果 |
|------|------|
| 意味論 | 「辿り着けない」= dead-end ではなく unreachable |
| 誤検出 | hub entry（outbound 多い / inbound 0）の draft で出やすい |
| ユーザ期待との一致 | wiki 的運用で「このページに入る経路が無い」を可視化 |
| 実装コスト | relations + link-index の inbound 両方で zero 確認 |
| 限界 | v1 orphan とは意味が**別物**になる。rename 必須 |

**強み**: graph 的に最も自然な "unreachable"。
**弱み**: "orphan" という語を v1 から**転用**するため混乱大。独立 feature として別 tracker で追うのが安全。

### 3.1 比較サマリ

| ID | 定義 | 包含性（既存 v1 との関係） | provisional name | 本 draft 内での立ち位置 |
|----|------|-----------|---------|---------|
| D1 | relations-only | **v1 そのもの** | `relations-orphan` | **canonical**、継続利用 |
| D2 | strict union | D1 の sub-set（D1 ⊇ D2） | `fully-unconnected` | **v3 新規**、導入候補最有力 |
| D3 | D1 + broken marker（並列） | D1 そのまま + 別系 | — | **v3 候補**、broken は orphan 系とは独立 |
| D4 | structural-only | D1 と **非比較可能**（kind で切るため） | `folder-detached` 等 | **非推奨**。採用しない方向 |
| D5 | inbound-only | D1 と **別概念** | `unreachable` | **採用しない**、別 feature として独立させる |

### 3.2 D2 採用時の落とし穴（事前列挙）

D2 を採る場合、次を v3 contract で解消する必要:

1. **body 編集による揺らぎ**: body に markdown link を 1 本書けば marker が消える。連続した編集中の flicker を防ぐため、debounce / stable-state 判定を入れるかは contract 段階で決める
2. **broken reference の扱い**: `entry:<lid>` が解決しない link は outgoing 集計に入れるか？ → **解決不能な link はあってもなくても connectedness に寄与しない** 方針が自然（ユーザは「壊れたリンクで繋がっている」と見なさない）
3. **self-loop**: relations / markdown いずれかで `from === to` を持つ entry の扱い → self-reference は connectedness に**寄与しない**（v1 の `buildConnectedLidSet` は寄与させるが、意味論としては独立） → v3 で明示的に決める
4. **textlog の log 行単位の link**: textlog body 内 log に markdown link がある場合は 1 件としてカウント → 既存 `link-index` の集計単位（entry 単位）を流用で足りる
5. **form / attachment / opaque archetype**: body 解析対象外の archetype は automatically markdown-orphan 判定される → **これらは relations-orphan のみで評価** とし、markdown の次元を評価から外す（archetype による gate を contract で明文化）

## 4. UX options（UX 選択肢の比較）

v3 実装フェーズで選ぶ UI 表出戦略。複数同時採用は可能だが、全部盛りは情報過多なので v3 では 1〜2 個選ぶ前提で比較する。

### U1. Sidebar marker only（既存拡張 minimal）

現行 `pkc-orphan-marker` を relations-orphan のまま残し、**別 marker を並列追加**して `fully-unconnected` を示す。

| 評価軸 | 結果 |
|------|------|
| 明快さ | 高（行ごとに記号が出るだけ） |
| 情報密度 | 1 行に 2〜3 種の marker（task / revision / backlink / orphan + 新 marker）、狭幅で崩れる可能性 |
| 実装コスト | 低〜中（per-entry で link-index を見る必要あり） |
| 誤読リスク | marker 記号の意味を区別する学習コストが発生 |
| backward-compat | 既存 `.pkc-orphan-marker` を rename しないので安全 |

採用時の具体案:
- 既存 `○` (U+25CB) を relations-orphan に keep
- `fully-unconnected` には `◌` (U+25CC dotted circle) / `∅` / 色付き `○` など - contract で確定
- tooltip: `"No relations yet"` / `"Fully unconnected (no relations, no markdown refs)"`

### U2. References summary integration（v2 summary row 拡張）

References summary row（`references-summary-row-v2.md`）は既に `Relations: N · Markdown refs: M · Broken: K` を出している。ここに **self-evaluation としての unconnected 判定** を足す方向。

| 評価軸 | 結果 |
|------|------|
| 明快さ | 中（summary は現在選択中の entry のみ評価） |
| 情報密度 | 追加 label 1 個で済む |
| 実装コスト | 低（既存 renderReferencesSummary に 1 フィールド追加） |
| 誤読リスク | summary は "現選択 entry についての数字" なので "orphan marker（sidebar 一覧）" とは意味が違う点をラベルで明示する必要がある |
| backward-compat | summary row の attribute は拡張のみで OK |

採用時の具体案:
- summary row に `Connectedness: relations-orphan` / `fully-unconnected` / `connected` を state label として 1 項追加
- または色味で暗示（今は Broken のみ赤） → 拡張すると **色の意味が増えすぎ**

### U3. Dedicated filter（search / view filter）

sidebar に `Show: all / relations-orphan only / fully-unconnected only / broken-links only` のような filter 追加。

| 評価軸 | 結果 |
|------|------|
| 明快さ | 高（ユーザが意図して切り替える） |
| 情報密度 | marker を増やさないので行は素 |
| 実装コスト | 中〜高（search と state 追加、既存 archetypeFilter と設計揃える必要） |
| 誤読リスク | 低（選んだ filter を UI が示す） |
| backward-compat | 既存 filter (`archetypeFilter`) と共存する設計が必要 |

採用時の具体案:
- `sidebar filter` 系の既存 UI に新しい "Connectedness" 軸を追加
- 「orphan だけ一覧表示して bulk tag」のような運用パスを開く
- v1 `orphan-detection-ui-v1.md §6` で "orphan 一覧パネル / フィルタ UI" は **非スコープ** としていたが、v3 で**正面から検討**対象

### U4. Separate marker per orphan type（多階層 marker）

relations-orphan / markdown-orphan / fully-unconnected を**全部別 marker** で同時表示。

| 評価軸 | 結果 |
|------|------|
| 明快さ | 中（marker 読み取り負荷が大） |
| 情報密度 | 過剰。狭幅では破綻 |
| 実装コスト | 高 |
| 誤読リスク | 高（どの marker がどの意味か覚えづらい） |
| backward-compat | — |

**採用しない方向**。情報過多。

### U5. Hybrid — U1 + U3（sidebar marker + optional filter）

v1 に最も近く、拡張余地が大きい折衷案。

- sidebar: `fully-unconnected` だけ新 marker を控えめに出す（既存 relations-orphan marker はそのまま）
- filter: 明示的にユーザが開くと「unconnected だけ一覧」が可能
- summary row には直接出さない（summary は選択 entry 単体の情報、orphan は複数 entry を並べたときの概念）

| 評価軸 | 結果 |
|------|------|
| 明快さ | 高（普段は marker 1 追加、深掘りしたいユーザに filter） |
| 情報密度 | 低〜中 |
| 実装コスト | 中 |
| backward-compat | 高 |

### 4.1 UX 比較サマリ

| ID | 戦略 | 主目的 | 本 draft での推奨度 |
|----|------|-------|----------|
| U1 | sidebar marker 追加 | 俯瞰 | ○ |
| U2 | summary row 拡張 | 選択 entry 個別 | △ |
| U3 | dedicated filter | 調査 / 一括 | ○ |
| U4 | 全部別 marker | — | × |
| U5 | U1 + U3 併用 | 俯瞰 + 調査 | **◎** |

### 4.2 UX 採用時の命名契約

U1 / U2 / U3 いずれを選んでも、UI ラベルは §2.2 の **"orphan" を UI に出さない** ルールを守る:

- 可視 UI ラベル: `"No relations yet"` / `"No markdown refs"` / `"Fully unconnected"` / `"Unconnected"`
- tooltip / aria-label: 同上
- filter 選択肢: `"Show all"` / `"Only relations-unconnected"` / `"Only fully unconnected"` / `"Only with broken links"`
- spec / commit / コメント: **"orphan"** OK（ただし常に前置修飾あり、§2.1 の禁止規則は UI 側のみ）

## 5. Data / model implications（データ面の影響）

### 5.1 既存 helper で賄えるもの

| helper | 場所 | 提供情報 |
|--------|-----|---------|
| `buildConnectedLidSet(relations)` | `src/features/relation/selector.ts` | relations-connected lid 集合（D1 そのもの） |
| `buildInboundCountMap(relations)` | 同上 | inbound relation 数（D5 候補） |
| `buildLinkIndex(container)` | `src/features/link-index/link-index.ts` | outgoingBySource / backlinksByTarget / broken（D2 / D3 候補） |
| `extractEntryReferences(markdown)` | `src/features/entry-ref/extract-entry-refs.ts` | body 内 `entry:<lid>` 抽出、`buildLinkIndex` の下位 |

**つまり D1〜D5 すべて、追加の core / features 関数ゼロで算出可能**。新規 helper は optional（合成結果のキャッシュ用）。

### 5.2 追加する価値がある helper（v3 採用時）

D2 採用（= `fully-unconnected` 導入）の場合、以下の pure helper を 1 本加えると sidebar render が明快になる:

```ts
// 仮名: 実装 PR で確定
export interface ConnectednessSets {
  relationsConnected: ReadonlySet<string>;
  markdownConnected: ReadonlySet<string>;
  fullyUnconnected: ReadonlySet<string>;
}

export function buildConnectednessSets(container: Container): ConnectednessSets;
```

- `buildConnectedLidSet` + `buildLinkIndex` を内部で 1 回ずつ呼ぶ
- 3 つの set を 1 pass で同時構築、sidebar render で共有
- complexity: O(R + N + B) （R=relations, N=entries, B=body 合計）

### 5.3 どの layer に置くか

5-layer rule（`CLAUDE.md`）での配置:

| 候補 layer | 適合度 | 理由 |
|-----------|-------|------|
| `core/` | × | DOM / browser API に触れないのは ok だが、link-index が `features/` に依存しているため core に置くと逆流 |
| **`features/`** | **○（推奨）** | relations selector / link-index どちらも features 配下、本合成は純関数で依存方向が自然。配置案: `src/features/connectedness/` 新設 or `src/features/relation/selector.ts` に追加 |
| `adapter/` | △ | render 側での one-shot 計算は可能だが、複数箇所で再利用しづらい |

**推奨**: `src/features/connectedness/index.ts` を新設し `buildConnectednessSets` をここに置く。relations selector と link-index の両方に import する唯一のモジュールとして責務を明確化。

### 5.4 AppState 汚染を避ける契約

以下は AppState に **持ち込まない**:
- `connectedness` map / `orphan` flag / `fullyUnconnected` set のいずれも AppState field 化しない
- render 時に `buildConnectednessSets` を **毎回呼ぶ**（既存 `buildConnectedLidSet` / `buildInboundCountMap` と同パターン）
- 複雑度は render pass あたり O(R + N + B)、現行 sidebar render と同スケール

これで reducer / dispatcher / persistence 層に一切変更を出さずに実装可能。

### 5.5 persistence への影響

**なし**。orphan 判定は derived state で、container に永続化しない。既存 v1 `pkc-orphan-marker` も derived、本 v3 も同方針を維持。

### 5.6 performance 見積もり

- relations pass: O(R) （v1 既存）
- link-index pass: O(B) （既存 References summary / link-index section で既に計算中）
- set 差分: O(N)
- sidebar render: per-row O(1)
- 既存 References summary row で link-index はすでに 1 render に 1 回計算されているので、**追加コストはほぼゼロ**（同じ `LinkIndex` を sidebar / meta 両方で共有する実装にするのが理想）

### 5.7 stale listener / memoization

既存 `buildConnectedLidSet` は render ごとに再構築して O(R) で済んでいる。**memoization を v3 では付けない** のが 5-layer policy の精神（renderer は pure、上流が変わったら再計算）。
- 入力が変わる頻度 = container が更新されるとき = 既存 render トリガと同じ
- memoize する場合は `adapter/` に置いた上で invalidation を dispatcher.onState にフックする必要 → v3 で必須ではない

### 5.8 テスト戦略（将来実装時）

`buildConnectednessSets` の spec テスト観点（後続 contract PR で具体化）:

1. empty container → 3 set すべて空 / N = 0
2. 全 entry が relations に参加 → relationsConnected = all / fullyUnconnected = ∅
3. 全 entry が body に `entry:<lid>` を持つ → markdownConnected = all / fullyUnconnected = ∅
4. 両方 0 の entry → fullyUnconnected に含まれる
5. self-loop の扱い: §3.2 の契約に従い contract で確定
6. broken entry-ref（解決しない target）: connectedness に寄与しない
7. archetype による gate（form / attachment / opaque は markdown 次元を評価しない）

## 6. Recommended direction（推奨方針）

### 6.1 推奨: D2（fully-unconnected）+ U5（sidebar marker + optional filter）

本 draft の推奨方向は **定義 D2 を導入し、UX は U5（marker + filter）で出す** ことを v3 実装 PR の起点とする。

### 6.2 なぜ D2 か

- D1 は既に code に入っており、v1 の価値は保たれている。**D1 を残しつつ D2 を足す** のが最小拡張
- D2 の `fully-unconnected` は意味が **明快に 1 個**（「どちらの系でも 0 本」）。定義の揺れが構造的に無い
- D3（broken の並列可視化）は「orphan とは別 feature」として扱うのが自然 → 本 draft の範囲外に押し出せる
- D4 / D5 は "orphan" 概念を v1 から転用する方向で、用語負債が累積する

### 6.3 なぜ U5 か

- U1 単独では「深掘り動線」が無く、ユーザが "orphan を一覧したい" 需要に応えられない
- U3 単独では「たまたま開いたときしか気付けない」（discoverability 不足）
- U2（summary row）は "選択中 entry の現状" を見る場所であり、"複数 entry の俯瞰" には向かない
- U4 は marker 過多
- **U1 + U3 併用** = 普段は軽い marker 1 個、必要なときに filter で一覧、という two-tier 動線が既存 UI パラダイム（archetypeFilter / sortKey 等）に合う

### 6.4 取らない選択の明示

- **"unified orphan" を 1 概念に合算しない**。§2.1 で禁止用語に明記したとおり、UI に `"Unified orphan"` や `"Orphan (total)"` のような合算ラベルを出さない
- **orphan 単独語の UI 露出禁止**。tooltip / filter label / summary label 全部 §4.2 のルールに従う
- **D4（structural-only）を v3 で採らない**。folder 構造を主軸にした orphan 判定は別 feature（`folder-detached-view` 等）として独立させる
- **graph visualization を採らない**。`backlink-badge-jump-v1.md §6` の graph-defer policy を継続

### 6.5 段階的 rollout（提案）

本 draft merge 後の想定スライス:

| スライス | 内容 | PR 分離基準 |
|---|---|---|
| **S1** docs | 本 draft（本 PR）| docs-only |
| **S2** contract | `unified-orphan-detection-v3-contract.md` で D2 / U5 を behavior contract 化（archetype gate / self-loop / broken ref 等の §3.2 未解決項目を条文化） | docs-only |
| **S3** pure | `src/features/connectedness/index.ts` 新設、`buildConnectednessSets` 実装 + unit tests | 実装 PR（adapter touch なし）|
| **S4** sidebar marker | `fully-unconnected` 用 marker + DOM attribute、`.pkc-orphan-marker` は relations-only のまま継続 | 実装 PR |
| **S5** filter | connectedness filter 軸を sidebar filter に追加、既存 `archetypeFilter` と共存 | 実装 PR（要件次第で defer 可） |

S3〜S5 は独立に進められる。S4 単体でも価値は出せる（S5 は optional）。

### 6.6 リスク整理

| リスク | 対応 |
|-------|------|
| marker 過多による sidebar UI の情報密度超過 | S4 で 1 marker 追加に留める、S5 で filter 提供すれば marker を "そもそも減らす" 運用も可能 |
| body 編集で marker が振動する（D2 特有） | contract 段階で stable-state 判定 / throttle を決める。または揺れを許容する UX 設計（"Fully unconnected" の意味から言って、body 編集で解除されるのは正しい挙動） |
| 用語負債の再発 | §2.1 の禁止用語リストを commit / spec で強制。UI ラベルは `"Fully unconnected"` のように "orphan" を避ける |
| 既存 code / DOM との互換性破壊 | §2.4 ルール（既存名 rename 禁止 / addition-only）を contract で再確認 |

### 6.7 意思決定チェックリスト（v3 実装 PR 起票前）

- [ ] 本 draft §3 の 5 候補を確認し、D2 を採ることで合意
- [ ] §4 の 5 UX option を確認し、U5 を採ることで合意
- [ ] §3.2 の 5 落とし穴（body 揺らぎ / broken / self-loop / textlog / archetype gate）が contract spec で解消される見込みがある
- [ ] §5 の layer 配置（`features/connectedness/`）で合意
- [ ] §2.1 の禁止用語（`unified orphan` / 無修飾 `orphan`）が UI / commit / spec 全面で守られる
- [ ] 実装を始めるのは contract PR merge 後

## 7. Explicit non-goals（非ゴール）

### 7.1 本 PR の範囲外
- **実装一切なし**。code / test / dist への変更は本 PR に含まない
- **behavior contract を兼ねない**。実装判断の根拠となる挙動仕様は別 PR で `unified-orphan-detection-v3-contract.md` として起票する想定
- **既存 v1 orphan の改修を含まない**。`orphan-detection-ui-v1.md` が canonical として継続

### 7.2 将来 (v3+) も採らない選択
- **graph visualization との統合**: `backlink-badge-jump-v1.md §6` の graph defer policy を継承、本 draft / contract / 実装のいずれでも採らない
- **合算語 "unified orphan" の UI 露出**: §2.1 禁止用語を破らない。合算ラベル / 合算 count を UI に出さない
- **D4 (structural-only) / D5 (inbound-only) を "orphan" 名義で採用**: 独立 feature として別 tracker で扱う
- **orphan 状態を container に永続化**: derived のままにする（§5.5）
- **AppState に connectedness 系 field を増設**: §5.4 の契約
- **relations と markdown の semantic merge**: §2.1 / `unified-backlinks-v0-draft.md §2.4` の分離契約を変えない

### 7.3 ラベルの境界
本 draft は **用語と境界** を固定するのが目的であり、以下は意図的に決めない:
- UI で出す具体的な記号 / 色 / 順序（contract / 実装 PR で決める）
- 新 filter 軸の UX wording（contract で決める）
- archetype ごとの具体 gate 挙動（contract §3.2 で決める）
- performance 目標の数値（実装 PR で計測ベースに決める）

本 draft の責任範囲は **§1〜§6 の方向を示すこと** であり、pixel-level / wording-level の決定は含まない。

## 8. 関連文書

### 前提・直接の親となる spec
- `docs/development/orphan-detection-ui-v1.md` — 現行 v1 orphan marker（relations-based only）の実装 spec。本 draft の直接の親
- `docs/development/unified-backlinks-v0-draft.md` — 用語分離契約（relations-based / markdown-reference / Backlinks 前置ルール）の canonical。本 draft の §2 はこの系譜
- `docs/development/unified-backlinks-v1.md` — References umbrella 実装。本 draft の §4 U2（summary 連携）と接点を持つ
- `docs/development/references-summary-row-v2.md` — summary row 設計。本 draft の §4 U2 候補の直接の拡張対象

### 周辺機能の既存 spec
- `docs/development/backlinks-panel-v1.md` — relations-based backlinks sub-panel 成立
- `docs/development/sidebar-backlink-badge-v1.md` — sidebar 行末の count badge、本 draft の marker 設計の前例
- `docs/development/backlink-badge-jump-v1.md` — badge click → scroll. §6 で graph defer policy を確立（本 draft も継承）
- `docs/development/relation-kind-edit-v1.md` — relation kind 編集 UI。provenance 二重ガードの前例
- `docs/development/provenance-metadata-viewer-v1.md` — provenance metadata 読み取り UI。本 draft とは独立だが relations sub-panel の情報密度観点で前例

### link-index 側の canonical spec
- `docs/spec/link-index-v1-minimum-scope.md` — link-index v1 の scope 固定
- `docs/spec/link-index-v1-behavior-contract.md` — link-index 挙動 canonical
- `docs/spec/body-formats.md §10` — `entry:<lid>` 参照記法

### data model 側
- `docs/spec/data-model.md §5` — `Relation` / `RelationKind` 正規定義
- `src/core/model/relation.ts` — `Relation` / `RelationKind` 型
- `src/core/model/container.ts` — `Container` 型

### 将来の実装候補として参照する source
- `src/features/relation/selector.ts` — `buildConnectedLidSet` / `buildInboundCountMap`（v1 helper、本 draft §5.1 の再利用対象）
- `src/features/link-index/link-index.ts` — `buildLinkIndex`（本 draft §5.1 の再利用対象）
- `src/features/entry-ref/extract-entry-refs.ts` — `extractEntryReferences`（link-index の下位）
- `src/adapter/ui/renderer.ts` — sidebar renderer / References umbrella renderer（§4 U1 / U2 の touch 先候補）

### 後続に作る想定の文書
- `docs/development/unified-orphan-detection-v3-contract.md`（**未作成**、v3 実装着手前の behavior contract）
- 実装 PR 対応の development doc（contract 合意後）
