# Unified Backlinks v0 — Design Draft (docs-only)

**Status**: design draft — 2026-04-20. **No implementation in this PR**.
**Purpose**: PKC2 には現在「**relations-based backlinks**」と「**link-index / markdown-reference backlinks**」という **2 種類のバックリンク概念** が並立している。将来これらを unified に見せる可能性を検討する前段として、terminology / 境界 / UX 選択肢 / incremental 経路 を先に固定する。

---

## 0. TL;DR

- 2 概念は **意味論的に別物** (first-class relations vs derived markdown references) なので、**"backlinks" 単独語で混合表示するのは禁止**
- v1 の推奨は **"References" という umbrella heading 下に 2 つの sub-panel を縦積み**（Option E）
- Tab / Merged summary は **v2+ 候補**、graph は引き続き defer
- kind 編集 UI は本 draft より **後** に着手（umbrella 決定が前提のほうが置き場判断がしやすい）

---

## 1. Current state

### 1.1 Relations-based backlinks
- **データソース**: `container.relations[]` のうち `to === entry.lid` のもの（inbound 側）
- **first-class data**: `{ id, from, to, kind, created_at, updated_at, metadata? }` として保存、エクスポートに載る
- **kind**: `structural` / `categorical` / `semantic` / `temporal` / `provenance` の 5 種類が意味論として区別される
- **UI 出現箇所**:
  - Meta pane の `[data-pkc-region="relations"]` セクション（`backlinks-panel-v1.md`）
  - Sidebar 行末の `pkc-backlink-badge`（count badge、クリックでセクションへジャンプ）
  - Sidebar 行末の `pkc-orphan-marker`（relations-based orphan のみ）
- **ユーザ操作**:
  - Relations セクション内でクリック → peer entry へ navigate
  - 削除ボタン `×` → confirm → `DELETE_RELATION` dispatch（relation delete UI v1）
  - 作成フォーム（relation-create）で `from/to/kind` 指定して `CREATE_RELATION`
- **semantics**: 削除は explicit。peer entry の title が変わっても relation 自体は壊れない。

### 1.2 Link-index / markdown-reference backlinks
- **データソース**: `buildLinkIndex(container)` が各 entry の body から `entry:<lid>[#fragment]` 形式の markdown リンクを抽出し、`Map<lid, LinkRef[]>` を構築
- **derived data**: 保存されない。render 時に毎回再計算。エクスポートには "body の中の markdown link" として間接的に載る
- **kind 区別なし**（markdown reference に種類はない）
- **UI 出現箇所**:
  - Meta pane の `[data-pkc-region="link-index"]` セクション
    - `Outgoing links` — この entry から他 entry への markdown リンク
    - `Backlinks` — 他 entry から自分への markdown リンク
    - `Broken links` — 解決できない `entry:<lid>` リンク
  - Sidebar には**出ない**
- **ユーザ操作**:
  - クリック → peer entry へ navigate（relations と同じ DOM action）
  - **削除不可**（body を編集して markdown link を除去するしかない）
  - 作成は自然言語として body に書くだけ（autocomplete 経由の補助はある）
- **semantics**: body の内容に依存。entry を rename しても markdown link の label は古いまま（canonical form は lid なので navigate は壊れない）。body を書き換えれば reference も消える。

### 1.3 同じ名前だけど別概念
両者の meta-pane セクションに **"Backlinks" という見出しが 2 箇所ある**:
- `[data-pkc-relation-direction="backlinks"]` 配下の見出し `"Backlinks (N)"`（relations ベース）
- `[data-pkc-region="link-index-backlinks"]` 配下の見出し `"Backlinks (N)"`（markdown 参照ベース）

現状これは意図的に許容している（PR #53 の spec で terminology を明文化したため混乱は抑えられている）が、将来 unification を語る際の **最重要混乱源**。

---

## 2. Terminology

### 2.1 Canonical（今後も変わらない）

| 用語 | 意味 |
|------|------|
| **entry-ref** | URL scheme `entry:<lid>[#fragment]` |
| **internal entry link** | markdown 形式 `[label](entry:lid)` の 1 本 |
| **relation** | `container.relations[]` の要素（構造化データ） |
| **relation kind** | `semantic` / `categorical` / `structural` / `temporal` / `provenance` |

### 2.2 Provisional（本 draft で再評価対象）

| 用語 | 現状位置 | 曖昧さ |
|------|---------|--------|
| **backlinks** | 2 箇所で使われている | **単独使用は禁止**。前置修飾が必須 |
| **relations-based backlinks** | PR #53 で確立 | OK、unified 後も残す |
| **link-index backlinks** | 同上、PR #53 で確立 | OK だが "link-index" 自体が general な語感で誤解を生む可能性 |
| **markdown-reference backlinks** | 同義の代替表現 | より specific。将来 canonical にしてもよい |
| **`Backlinks Panel`**（relations 側） | backlinks-panel-v1 の機能名 | relations のみを指すと spec 中で固定済 |
| **"References"**（本 draft 新提案） | 未使用 | umbrella 語として適格。下記 §4 参照 |

### 2.3 Conflict / 誤解しやすい語

- **"backlinks"**: 2 概念の曖昧語。本プロジェクトの**最大の terminology debt**。常に前置修飾を要求する運用で封じ込めている
- **"link-index"**: 機能名が general 過ぎる。"markdown reference index" の略と読めるが初見では分からない
- **"reference"**: まだ canonical には登場していない。unified 化の umbrella 語として都合がよい反面、新語導入コストあり

### 2.4 Guidance（docs / commit message / コード内コメント向け）

- `"backlinks"` 単独は書かない。必ず `"relations-based backlinks"` / `"link-index backlinks"` / `"markdown-reference backlinks"` のどれか
- UI 文言で両者を **umbrella 化** する場合は `"References"` を推奨。ただし "relation" / "markdown reference" の区別は sub-panel 見出しで明示
- CSS class / DOM attribute の `pkc-backlink-*` は **relations-based only** に固定（sidebar badge / orphan marker が該当）
- `data-pkc-region="relations"` / `data-pkc-region="link-index*"` の 2 系統を維持。unified panel が導入された場合でも内部 region 識別子は分離を保つ

---

## 3. Unification goals

### 3.1 解決したい user problem

1. **「この entry を参照しているもの全部」を一目で見たい**: 現在は 2 セクションを目で往復する必要がある。relations と markdown refs は意味が違うが、"誰かが自分に言及している" という体感は同じ
2. **セクションの配置場所のばらつき**: relations section と link-index section は meta pane 内で離れて描画される（tags / move / revision などが間に挟まる）。連続して見えないので相互参照の感覚が持ちにくい
3. **件数の合算が欲しい場面がある**: sidebar backlink badge は現在 relations のみをカウント。link-index 側の件数は見えない

### 3.2 維持すべき distinct な部分

| 要素 | relations | markdown refs |
|------|-----------|---------------|
| 操作性 | delete UI あり（first-class） | delete UI なし（body 編集要） |
| kind の意味論 | 5 種類で区別 | 無し |
| データ永続化 | `container.relations[]` として保存 | body 内の markdown、derived |
| peer title 変更耐性 | 影響なし（lid 参照） | label は古いまま（lid は壊れない） |
| broken state | ない（dangling は render で skip） | "Broken links" として明示 |

**これらを unified 表示で潰してはいけない**。semantic な混合（例: 件数を単純合算して「N 個の backlink」と表示する、削除ボタンを両方に出す）は禁止。

### 3.3 Unify しないもの

- **relation の削除 UI と markdown reference の削除 UI**（markdown reference の "削除" はそもそも UI に存在しない。body 編集の hint を出すのは別議論）
- **relation kind と markdown reference の「種類」**（後者は "種類" の概念自体がない）
- **データスキーマ**: `container.relations[]` と body 文字列は統合しない。unified 表示は render 時の cosmetic 統合にとどめる
- **orphan 判定ロジック**: 本 draft では維持（relations-based only）。"markdown も含む fully-orphan" は別 draft が必要（§6.4 参照）

---

## 4. UX options

以下 5 案を検討。**推奨は Option E**。

### 4.1 Option A — Single panel with grouped sections
現在の 2 panel を外側に 1 つの `<div class="pkc-references">` でくくり、内部に既存の `pkc-relations` / `pkc-link-index` を積む。見出しは維持。

| 観点 | 評価 |
|------|------|
| Clarity | ★★★ 両方が近接、分類は維持 |
| Impl risk | ★ 小 — 外枠 `<div>` 追加のみ、内部 DOM は保持 |
| Terminology risk | ★ 低 — 既存の `"Backlinks (N)"` 見出しがそのままで曖昧さは既存レベル |
| Fit | ★★★ 既存 meta pane パターンと整合 |

### 4.2 Option B — Tabbed panel
`<Relations>` / `<Markdown refs>` / `<All>` のタブ切替。

| 観点 | 評価 |
|------|------|
| Clarity | ★★ タブで分離、`All` の定義次第でぼやける |
| Impl risk | ★★ 中 — tab state + render 分岐 |
| Terminology risk | ★★ 中 — `All` タブは結局「backlinks 単独」を作る誘惑がある |
| Fit | ★ PKC2 の meta pane は tabs を使っていない |

### 4.3 Option C — Summary + drill-down
`"References: N relations, M markdown refs"` の 1 行サマリ + 折り畳み可の詳細。

| 観点 | 評価 |
|------|------|
| Clarity | ★★ サマリは簡潔だが、詳細を開かないと peer が見えない |
| Impl risk | ★★ 中 — 折り畳み state（collapsedFolders と同系） |
| Terminology risk | ★★★ 低 — サマリで両種の件数を並記 |
| Fit | ★★ 折り畳みは folder で既に使用。patten 流用可 |

### 4.4 Option D — Keep separate, cross-link only
現状維持 + 2 セクションの見出しに相互リンク（`"See also: markdown references"` 等）。

| 観点 | 評価 |
|------|------|
| Clarity | ★ 大きな改善はない |
| Impl risk | ★ 極小 |
| Terminology risk | ★★★ 低 — 現状と同じ |
| Fit | ★★★ 極端に保守的 |

### 4.5 Option E — **"References" umbrella heading + 2 sub-panels（推奨）**
Meta pane に 1 つの `<section class="pkc-references" data-pkc-region="references">` を作り、内部に:
- Heading: `"References"`（英語）
- Summary: `"Relations: N  |  Markdown refs: M"`（後段の件数内訳、省略可）
- Sub-panel 1: 既存 `pkc-relations`（Outgoing relations / Backlinks）
- Sub-panel 2: 既存 `pkc-link-index`（Outgoing links / Backlinks / Broken links）

| 観点 | 評価 |
|------|------|
| Clarity | ★★★ 一画面で両方見え、しかも kind 区別が残る |
| Impl risk | ★★ 小〜中 — 外枠 + heading + オプションのサマリ |
| Terminology risk | ★ 低 — umbrella に "References" という新語を導入するが、中の 2 panel は従来どおり分離 |
| Fit | ★★★ meta pane 既存 region (relations / link-index) を入れ子にするだけ |

"References" は曖昧性が低い一般語で、"backlinks" の二義性問題を避けつつ両者を包含できる umbrella として機能する。**サマリ行は `relations-based X / markdown-reference Y` と前置修飾を必ず付ける**。

### 4.6 比較表（推奨判断）

| Option | Clarity | Impl risk | Term risk | Fit | 総合 |
|--------|---------|-----------|-----------|-----|------|
| A | ★★★ | ★ | ★ | ★★★ | 良い |
| B | ★★ | ★★ | ★★ | ★ | 避ける |
| C | ★★ | ★★ | ★★★ | ★★ | 候補 |
| D | ★ | ★ | ★★★ | ★★★ | 保守的 |
| **E** | **★★★** | **★★** | **★** | **★★★** | **推奨** |

---

## 5. Data / model implications

### 5.1 現在のモデルで実装可能な範囲
- Option A / D / E は **データモデル変更ゼロ**。renderer でのレイアウト合成のみ
- Option C（summary）は件数計算に追加 helper が必要:
  - relations-based inbound count: 既存 `buildInboundCountMap`
  - link-index backlinks count: `buildLinkIndex().backlinksByTarget.get(lid)?.length ?? 0`
  - **合算しない**（§3.2 参照）、2 件として並記
- Option B（tabs）は `AppState` に tab 状態を持たせる必要あり → runtime-only slice 追加（`collapsedFolders` と同系列）

### 5.2 新 helper 候補（v1 以降）
- `features/references/build-reference-summary.ts`: `{ relationsInbound: N, linkIndexBacklinks: M, linkIndexBroken: K }` を 1 pass で返す
- 現状 `selector.ts:buildInboundCountMap` と `link-index.ts:buildLinkIndex` は別ファイル。統合せずに wrapper だけ作るのが妥当

### 5.3 Adapter-only で閉じるか、深い変更が要るか
- **Option A / D / E（推奨）**: adapter-only。core / features 変更なし
- **Option B**: AppState + reducer（新 UserAction `SET_REFERENCES_TAB`）
- **Option C**: summary helper を features に追加、reducer は不要

推奨 Option E は **adapter-only で完結**。5 層違反なし。

---

## 6. Incremental rollout plan

### 6.1 v0（本 draft）
- 設計 doc のみ、実装なし
- terminology を固定
- Option E を推奨として明記

### 6.2 v1（次の実装 PR 候補）
- **Option E の minimum viable 版**:
  - `<section class="pkc-references" data-pkc-region="references">` 外枠を追加
  - 見出し `"References"` を 1 つだけ
  - 内部は既存 `pkc-relations` + `pkc-link-index` をそのまま（DOM は非破壊）
  - サマリ行は v1 ではまだ**入れない**（kind 合算の意味論検討を兼ねて遅らせる）
  - CSS 追加のみ、既存 region attribute は完全維持
- 回帰: 既存テストの selector は変わらない（内部 region を温存するため）
- 実装量見積もり: renderer 20 行、CSS 10 行、test 2–3 本

### 6.3 v2（後続候補）
- **サマリ行追加**（Option E + C のハイブリッド）:
  - `"Relations: N  |  Markdown refs: M  |  Broken: K"` 形式
  - umbrella 下に小さな summary bar
- sidebar backlink badge に markdown refs 件数を別 attribute で併記する案の検討
- **tabs は導入しない**（terminology risk のため）

### 6.4 v3+ / deferred
- **Unified orphan detection**: relations-based orphan + markdown-reference orphan の合算（別 spec doc を要する）
- **Unified kind-style filtering**: 意味論が根本から違うので v3+ でも慎重に
- **Graph visualization**: 継続的に defer（`backlink-badge-jump-v1.md` §6 / `orphan-detection-ui-v1.md` §6 と同方針）

### 6.5 relation kind 編集 UI との順序関係
relation kind 編集（既存 relation の kind を後から変更する UI）は **本 draft より後** に着手する:
- 編集 UI の置き場所は relations section 内の行レベル。References umbrella が入ると **kind editor が umbrella 下にあることが視覚的に伝わる**
- 先に kind 編集を入れてしまうと、References umbrella 化の際に editor の位置を動かす必要が出て、2 段階変更になる

推奨順: **Unified v0 draft → Unified v1（Option E 最小実装） → relation kind 編集 UI → Unified v2**

---

## 7. Explicit non-goals

- **Graph visualization**: core bundle には入れない（`backlink-badge-jump-v1.md` §6 で確立済）。unified 表示に graph へのリンクや preview を入れることも本 draft 対象外
- **本 PR での実装**: docs-only、source 変更なし
- **relations と markdown refs の semantic mixing**:
  - 削除ボタンを markdown refs にも出す（body 編集を示唆する別 UI が必要なため）
  - 件数を単純合算して "N backlinks" と表示する（kind 意味を失う）
  - どちらも v1/v2 では採用しない
- **Backlinks Panel v1 の既存挙動変更**: kind badge / 削除ボタン / 空状態 / empty state 文言などは不変
- **link-index の仕様変更**: Outgoing / Backlinks / Broken の 3 分類はそのまま。unified umbrella の下で視覚的に統合されるだけ

---

## 8. 関連文書

- `docs/development/backlinks-panel-v1.md` — relations-based backlinks の確立（terminology の出発点）
- `docs/development/sidebar-backlink-badge-v1.md` — sidebar count badge（relations-based only）
- `docs/development/relation-delete-ui-v1.md` — delete UI（relations-based only）
- `docs/development/backlink-badge-jump-v1.md` — badge click jump + graph defer policy
- `docs/development/orphan-detection-ui-v1.md` — relations-based orphan
- `src/features/link-index/link-index.ts` — markdown-reference backlinks の抽出ロジック
- `src/features/relation/selector.ts` — relations-based の index helper 群

---

## 9. 次のアクション

本 draft が approve されたら:
1. **Unified Backlinks v1** PR を起こす（Option E の minimum viable 実装、renderer 限定、既存 region 属性を全維持）
2. その後 **relation kind 編集 UI** PR（umbrella 下に収まる前提で kind editor の配置を決める）
3. 必要なら v2 で summary bar 追加

本 draft は **discussion 起点**として、section ごとに review 可能。terminology 章と UX option 章が特に user confirmation の価値が高い。
