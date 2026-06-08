> 🔒 **凍結(2026-06-06、L4 #775)**:本 doc は「機能を足す」系の計画 / tracking で、現在のプライム・ディレクティブ「機能を足さない・削る/選る/着陸」と両立しないため **frozen**。**正本は [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)**、保全台帳は GitHub Issue #776。参照のみ、再開には user の明示 go が要る。

---

# Phase β PR-β2:Group B 右ペイン特化 spec — relation wire editor + YAML graphical editor(2026-05-19)

**Status**:docs-only spec(PR-β2、Phase β の Group B 詳細設計)
**前提 doc**:
- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md)(PR-β0 = Phase β 全体計画、open Q4〜Q5 暫定回答済)
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md)(PR-β1 = Group A shell 再構成、meta pane は Group A 触らない契約済)

**Scope**:v3 提案 **#6 = (a) relation wire editor + (b) YAML frontmatter graphical editor** を 1 spec に統合
**実装**:Phase γ-B1〜γ-B3 で順次着手(本 spec は **設計合意 doc**、src 変更なし)
**Audience**:PKC2 を初めて触る engineer、6 ヶ月後でも陳腐化せず読める粒度

---

## §0 本書の位置付け

v3 提案 #6 は右ペイン(meta pane)の **専門化** = power user / AI authoring の
要求に応える 2 つの specialized editor を追加する提案。**(a) relation
wire editor**(現 graph view を edit mode 化、線で繋ぐ操作)と **(b) YAML
frontmatter graphical editor**(現 read-only `<dl>` を table form 編集 UI
に格上げ)は **独立だが、共に「右ペインを mode 切替 UI 化する」共通基盤
を必要とする** ため 1 spec で扱う。

Phase β plan §3.2 で確定済の暫定回答(Q4 = graph view 統合 / Q5 = 両モード
対応 default graphical)を、本 spec で **技術詳細** に落とし込む。新 OQ
は §8 で user 追加合意待ち。

---

## §1 現状の事実関係(spec の前提)

### §1.1 meta pane の 13 section

**File**:[`src/adapter/ui/renderer.ts:7439-7600+`](../../src/adapter/ui/renderer.ts)
(`renderMetaPane` / `renderMetaPaneImpl`)

DOM root:`<aside class="pkc-meta-pane" data-pkc-region="meta">`
表示順(archetype 依存で section が省略される):

| # | section | `data-pkc-region` | archetype condition |
|---|---|---|---|
| 1 | Meta header(icon + label + copy permalink)| `meta`(root)| 全 archetype |
| 2 | Timestamps(created / updated)| (label only)| 全 archetype |
| 3 | Frontmatter("Properties")| `frontmatter` | TEXT のみ |
| 4 | TOC("Contents")| `toc` | TEXT / TEXTLOG |
| 5 | Entry tags chips | `entry-tags` | 全 archetype、canEdit で追加 UI |
| 6 | Categorical section(structural relation peer tag)| `tags` | 全 archetype |
| 7 | Move to Folder | `move-to-folder` | folder + canEdit |
| 8 | Filer display profile | `filer-display-profile-editor` | folder + canEdit |
| 9 | Folder description editor | `folder-description-editor` | folder + canEdit |
| 10 | References umbrella(relations + link-index 統合)| `references` | 全 archetype、entries > 1 |
| 11 | Revision info | `revision-info` + `revision-history` | 全 archetype |
| 12 | Sandbox control | `sandbox-control` | attachment HTML/SVG のみ |
| 13 | Relation create form | `relation-create` | canEdit + entries > 1 |

**契約 doctrine**:`data-pkc-region` 値は **immutable**(既存 CSS / sidebar
badge scroll / test assertion 依存)。新 section 追加時は本 spec で region
id を明記、変更時は deprecation plan 必須。

### §1.2 frontmatter の現状(read-only、flat YAML)

**File**:[`src/features/markdown/frontmatter.ts`](../../src/features/markdown/frontmatter.ts)
+ [`renderer.ts:8335`](../../src/adapter/ui/renderer.ts) (`renderFrontmatterSection`)

実装:
- `parseFrontmatter(entry.body)` → `parseFlatYaml()` で flat key:value のみ
  抽出(**nested / anchor / alias は非サポート**、silent drop)
- cap enforcement:default **16 KB**、HARD **1 MB**、warnings 配列で返却
- 表示:`<dl class="pkc-frontmatter-list">` で key/value pair(URL key は
  `<a href>` link)
- **編集 UI は存在しない**(read-only display のみ)

**Supported frontmatter keys**(grep で抽出した実装上の現実セット):

| key | type | scope | 用途 |
|---|---|---|---|
| `kind` | enum | TEXT | media kind(`book` / `video` / `novel` / `audio`)|
| `provider` | string | TEXT | 提供元(e.g. `youtube` / `vimeo`)|
| `thumbnail_url` | URL | TEXT | サムネ画像 |
| `title` | string | TEXT | display title override |
| `author` | string | TEXT | 著者 |
| `url` | URL | TEXT | source URL |
| `vars.*` | nested(string)| TEXT | `{{vars.x}}` 展開用 variables |
| `notation_overrides` | object | TEXT | notation profile override |
| `limits` | object | TEXT | notation cap override |
| `writing` | enum | TEXT | `horizontal-tb` / `vertical-rl` 等 |
| `align` | enum | TEXT | `left` / `center` / `right` / `justify` |
| `layout` | enum | TEXT | `a4-2col` 等の page layout |

flat YAML 制約のため `vars.foo` は flat key として扱い、`vars: { foo: x }`
の nested 形式は **非サポート**(後述 §3.4 で扱う)。

### §1.3 relations の現 UI(2-tier、References umbrella 配下)

**File**:[`renderer.ts:8066-8074`](../../src/adapter/ui/renderer.ts)
(`renderRelationGroup`)+ [`renderer.ts:8105`](../../src/adapter/ui/renderer.ts)
(`renderLinkIndexSections`)

**層 1: Categorical relations**(`data-pkc-region="relations"` 配下):
- `renderRelationGroup('Outgoing relations', 'outgoing', ...)` →
  `<div class="pkc-relation-group" data-pkc-relation-direction="outgoing">`
- `renderRelationGroup('Backlinks', 'backlinks', ...)` →
  同 direction="backlinks"
- 各 item:`<li class="pkc-relation-item" data-pkc-relation-id>` with
  peer link / kind select(editable unless provenance)/ delete button

**層 2: Link-index(markdown references)**(`data-pkc-region="link-index"`):
- `renderLinkIndexSections()` が 3 subsection:
  - `link-index-outgoing`(Outgoing links)
  - `link-index-backlinks`(Backlinks)
  - `link-index-broken`(Broken links)

**操作 action 名**:
- `create-relation`(form target / kind select)
- `update-relation-kind`(inline select)
- `delete-relation`(× button)
- provenance kind は **read-only badge**(編集不可)

**RELATION_KIND_OPTIONS**:`structural` / `categorical` / `semantic` /
`temporal`(色分けあり、§1.4 graph link cssColor で同色を共有)

### §1.4 graph view の実装(線引き edit 非サポート)

**File**:[`src/adapter/ui/graph-canvas.ts`](../../src/adapter/ui/graph-canvas.ts)
(PR-H G16、**Canvas ベース**、SVG 非採用)

データ型:
```typescript
interface GraphCanvasNode {
  id: string
  label: string
  archetype: Archetype
  degree: number
  preview?: string
  depth: number  // z-axis fold hierarchy / galaxy mode
}
interface GraphCanvasLink {
  from: string
  to: string
  kind: RelationKind  // 色分け
  cssColor?: string   // override
}
```

**操作 gesture**:
- Wheel:cursor 中心 zoom(`graph.zoom.wheel_sensitivity` flag)
- Mouse drag(背景):pan / region-select mode 別
- 2-finger pinch / 1-touch drag:zoom / pan
- Node click:`hitTestNodeAt()` → coordinate-based hit-test → `SELECT_ENTRY`
- Node drag(PR-Δ33):`dragLid` / `dragOrigUser` / `dragNeighborFactor`
  で 1/2-hop neighbor 同時 move
- Region-select:drag-rect 解放 → `pkc-graph-region-selected` CustomEvent

**「線を引く」edit 機能**:**現状なし**。graph view は閲覧 + ナビゲーション
専用、relation 作成は §1.3 の meta pane form のみが canonical。

**Layout**:force-directed / hierarchy(depth z-axis)/ circular(未実装)。
zoom range:**0.05〜32**(galaxy 超広域対応)。

### §1.5 right pane の resize / collapse

**File**:[`renderer.ts:796-824`](../../src/adapter/ui/renderer.ts)
+ [`src/adapter/platform/pane-prefs.ts`](../../src/adapter/platform/pane-prefs.ts)

- Resize handle:`<div class="pkc-resize-handle" data-pkc-resize="right">`
- Collapse state:`data-pkc-collapsed="true"` attribute(DOM hold)
- Persistence:localStorage key `pkc2.panePrefs` = `{ sidebar: boolean,
  meta: boolean }`
- `setPaneCollapsed('meta', bool)` → toggle + localStorage write
- **Tier 0 flag は現状なし**(`meta_pane.*` は存在しない、plain boolean
  collapse のみ)

### §1.6 TOC(table of contents)抽出経路

**File**:[`renderer.ts:8404`](../../src/adapter/ui/renderer.ts)
(`renderTocSection`)

実装:
- `extractTocFromEntry(entry)` で h1〜h3 heading + day/log(TEXTLOG)を
  `TocNode[]` 化
- `<ul class="pkc-toc-list">` で render、各 item は
  `<button class="pkc-toc-link" data-pkc-action="toc-jump"
   data-pkc-toc-slug>`
- click → action-binder が target selector(`#${slug}`)解決 → 本文 heading
  へ scroll

**Group B 統合への含意**:TOC section は Group B では **触らない**(第三者
spec が TOC 拡張する余地はあるが、本 spec scope 外)。

---

## §2 提案 #6a relation wire editor

### §2.1 graph view edit mode 切替 UX

現 graph view(§1.4)に **edit mode toggle** を追加。view-mode tab の
`graph` 内に小さな mode toggle UI:

```
<button data-pkc-action="toggle-graph-mode" data-pkc-graph-mode="view">
  👁 View
</button>
<button data-pkc-action="toggle-graph-mode" data-pkc-graph-mode="edit">
  ✎ Edit
</button>
```

state field:`state.graphMode: 'view' | 'edit'`(localStorage persist key
`pkc2.graphMode.default`、default `'view'` で完全互換)。

edit mode に切替時:
- node の visual feedback:hover 時に薄い「+」マーク(drag-out で edge
  を引ける hint)
- 既存 zoom / pan / region-select は edit mode でも使える(view mode と
  base 操作は共通)
- 既存 node drag(neighbor 同時移動)は edit mode で **無効化**(drag は
  edge 作成専用に切替、Shift+drag で view mode の node drag を保持)

### §2.2 drag → edge prototype → kind selector → relation 確定 flow

操作シーケンス:

1. **drag-start**(edit mode + node hit)
   - `hitTestNodeAt(x, y)` で source node 取得
   - `state.graphEdit.dragSource = { lid, x, y }`
   - canvas に prototype line(半透明、点線)を描画開始

2. **drag-move**
   - mouse 位置を `state.graphEdit.dragTarget = { x, y }` に更新
   - prototype line を毎 frame redraw
   - hover 中の node を highlight(target candidate)

3. **drag-end**(別 node hit)
   - `hitTestNodeAt(endX, endY)` で target node 取得
   - **kind selector popup** を出す:
     ```
     [popup at (endX, endY) — 4 button + cancel]
     - structural(folder/parent 用)
     - categorical(tag-like)
     - semantic(意味的関連)
     - temporal(時系列)
     - cancel
     ```
   - kind 選択 → `create-relation` action dispatch
   - cancel → state reset、prototype line 消去

4. **drag-end**(空白 hit、source = target、self-loop)
   - prototype line 消去、何もしない

**self-loop の扱い**:source = target はデフォルト無視(temporal 軸の
self-relation は将来拡張、本 spec では作らない)。

**衝突チェック**:source → target に既存 relation(同 kind)があれば
popup で「Already exists」表示 + 既存 relation の kind 編集にフォール
バック。

### §2.3 multi-select + bulk operation

**multi-select**(graph view の region-select で複数 node 選択後):
- 選択中の node に対し、**bulk relation 作成**(全選択 → 1 target に
  bulk outgoing relation)
- header bar に「Bulk relate to...」button 追加、click で target picker
  popup

**bulk operation 一覧**:
| 操作 | UI | dispatch |
|---|---|---|
| 全選択 → 1 target に bulk outgoing relation | "Bulk relate to..." button → target picker → kind selector | N × `create-relation` |
| 全選択 → 全選択 内で kind 一括変更 | "Change kind..." button → kind selector | N × `update-relation-kind` |
| 全選択 内の全 relation を削除 | "Delete all relations..." button → confirm | N × `delete-relation` |

**case matrix**(CLAUDE.md §4 規約、最低 10 件):

| # | source | target | kind | 期待結果 |
|---|---|---|---|---|
| 1 | text entry | text entry | structural | success、Outgoing relation 追加 |
| 2 | folder | text entry | structural(child)| success |
| 3 | text entry | folder | structural(parent)| success |
| 4 | textlog | text entry | semantic | success |
| 5 | text entry | text entry(既存 relation あり)| structural | popup「Already exists」+ kind 編集にフォールバック |
| 6 | text entry | self(同 node)| any | 無視、何もしない |
| 7 | text entry | provenance peer | structural | popup「provenance kind は protected」表示 + cancel |
| 8 | text entry | attachment(HTML)| categorical | success |
| 9 | 空白 → text entry | (drag が空白起点)| - | 無視、何もしない |
| 10 | text entry × 3(multi-select)| 1 target | structural | 3 relation 一括作成 |
| 11 | 1000+ node graph で drag(performance)| - | - | 60fps 維持、frame drop なし |
| 12 | drag 中に zoom(wheel)| - | - | prototype line が新 zoom 比に追従 |

### §2.4 既存 meta pane form との並走 contract

**契約**:graph view の wire editor と meta pane の form は **同じ
`create-relation` / `update-relation-kind` / `delete-relation` action
を共有**。container mutation path を centralize、どちらの UI でも同じ
relation が作成される(differential なし)。

**UI 重複の回避**:
- graph view edit mode のときも、meta pane の relation form は **保持**
- user は「meta pane で精密に form 入力」または「graph view で直感的に
  drag」の好みに応じて選べる
- 両 UI とも同 dispatch path、event listener で双方 re-render

### §2.5 RELATION_KIND_OPTIONS の選択 UX

§1.3 で確認した 4 kind(`structural` / `categorical` / `semantic` /
`temporal`)を kind selector popup で全 4 button + cancel として提示。
各 button に kind の意味を short tooltip:

| kind | tooltip |
|---|---|
| structural | "親子関係 / folder 階層 / 構造的所属" |
| categorical | "tag-like、分類軸の関連" |
| semantic | "意味的関連、参照 / 引用" |
| temporal | "時系列 / 順序関係" |

将来 RELATION_KIND_OPTIONS が拡張された場合、popup は dynamically 全 kind
を表示(spec hardcode しない、`RELATION_KIND_OPTIONS` array を import)。

### §2.6 provenance kind の保護

§1.3 で確認した通り、provenance kind は read-only。wire editor でも
provenance peer node に drag-end したら popup で「provenance kind は
protected」表示 + cancel(create-relation は dispatch しない)。

既存の provenance relation を delete することも禁止(meta pane の delete
button が disabled なのと同じ)。

### §2.7 visual parity test 仕様

CLAUDE.md §5 規約「視覚を持つ feature は parity test 最低 1 件」+ §10
「dual-render path = 3 surface(center pane / Viewer popup / Split View)」
は graph view にどう適用?

**結論**:graph view は **center pane 内 view-mode** で完結、Viewer popup
/ Split View には render しない(graph 自体は preview surface 化されて
いない)。よって parity test は **center pane の graph view 内 canvas
pixel 描画 + dispatch chain** で完結する。

**parity test 要件**:
- `elementFromPoint(x, y)` で graph view canvas の source node が hit
  test できる(canvas coordinate → CSS pixel mapping)
- `page.mouse.down(srcX, srcY)` → `page.mouse.move(midX, midY)` →
  `page.mouse.move(tgtX, tgtY)` → `page.mouse.up()` で drag シーケンス
  実行
- popup の kind button を `elementFromPoint` + click で選択
- dispatch 後の `state.container.relations` に新 relation が追加されている
  ことを assert(consumer 観測:DOM 上の Outgoing relation list 行数が
  +1、graph view canvas に新 edge が描画される)

**順序性 test**(CLAUDE.md §8 Phase 8 規約):
boot → graphMode 'edit' に切替 → drag → kind 選択 → consumer 観測
(`Outgoing relations` list 行数 + canvas edge + sidebar badge count)の
**鎖を全件 covered** で assert。DOM 属性遷移だけで止めず、consumer 数値
が変化することまで確認。

---

## §3 提案 #6b YAML frontmatter graphical editor

### §3.1 graphical mode の field-type-aware editor

meta pane の Frontmatter section(`data-pkc-region="frontmatter"`)を
**read-only `<dl>` から table-form editor に格上げ**。default mode は
plan §3.2 Q5 で確定済の `'graphical'`(user 設定で `'raw'` に切替可)。

**field-type-aware UI 構成**:

| key | type | UI control |
|---|---|---|
| `kind` | enum | `<select>` 4 option:book / video / novel / audio + (none)|
| `provider` | string | `<input type="text">`、kind 連動の suggestion(youtube / vimeo / amazon 等)|
| `thumbnail_url` | URL | `<input type="url">` + 📁 file picker button(IndexedDB asset から選択)|
| `title` | string | `<input type="text">` |
| `author` | string | `<input type="text">` |
| `url` | URL | `<input type="url">` |
| `vars.*` | nested(string)| **table form**(key/value pair × N row、+ row / − row button)|
| `notation_overrides` | object | nested toggle UI(`{ q_block: 'role-aware', list_em_dot: 'enabled', ... }` の各 sub-key を toggle)|
| `limits` | object | numeric input × N(`yaml_max_size_bytes` / `image_max_dimension` 等)|
| `writing` | enum | `<select>` 3 option:horizontal-tb / vertical-rl / sideways(none)|
| `align` | enum | `<select>` 4 option:left / center / right / justify(none)|
| `layout` | enum | `<select>` page layout(a4-2col 等、`layout` registry から動的取得)|

**generation 方向**(graphical → YAML):
- 各 field の値を `serializeYaml(values)` で flat YAML 文字列化
- entry.body の `---...---` block を新 YAML で置換(`---` boundary は維持)
- COMMIT_EDIT action で container mutation

**parse 方向**(YAML → graphical):
- 既存 `parseFrontmatter(entry.body)` で flat key:value 取得
- 各 field UI に値を bind(unknown key は §3.5 参照)

### §3.2 raw mode toggle UI

frontmatter section header に **mode toggle**:

```
<div class="pkc-frontmatter-header">
  <h3>Properties</h3>
  <div class="pkc-frontmatter-mode-toggle">
    <button data-pkc-action="set-frontmatter-mode"
            data-pkc-frontmatter-mode="graphical">📋 Form</button>
    <button data-pkc-action="set-frontmatter-mode"
            data-pkc-frontmatter-mode="raw">{ } YAML</button>
  </div>
</div>
```

state field:`state.frontmatterMode: 'graphical' | 'raw'`(localStorage
persist key `pkc2.frontmatterMode.default`、default `'graphical'`)。

per-entry override:**しない**(全 entry で同じ mode、user の preference
として扱う)。

raw mode:現状の read-only `<dl>` を `<textarea>` に置換、YAML を直接編集
可能。Tier 0 flag `meta_pane.yaml_graphical_enabled = false` で完全に
graphical 経路を OFF → raw のみ。

### §3.3 不正 YAML 時の fallback(raw mode 自動切替 + 赤バー警告)

graphical mode のときに YAML parse error が出た場合(user が直接
entry.body の `---` block を書き換えて invalid syntax を入れた等):

1. `parseFrontmatter(entry.body)` が **warnings + 部分 parse 結果** を返す
2. UI 上部に **赤バー警告**:「YAML 構文エラーが含まれています。raw mode
   で確認 / 修正してください。」+ click で raw mode 切替
3. graphical mode の field は **parse できた key のみ表示**、不正部分は
   raw mode で見せる
4. user が直すまで graphical save は **blocked**(save button disabled)

**case matrix**(CLAUDE.md §4 規約、最低 10 件):

| # | YAML 内容 | 期待結果 |
|---|---|---|
| 1 | `kind: book` 単独 | graphical mode で kind = book |
| 2 | `kind: book\ntitle: X` 複数 | 両 field 表示 |
| 3 | 空 YAML(`---\n---`)| 全 field empty、graphical mode default |
| 4 | nested `vars:\n  foo: x`(現 non-supported)| §3.4 参照、flat `vars.foo` に変換表示 |
| 5 | invalid YAML(`kind: : book`)| 赤バー警告 + raw mode 推奨 |
| 6 | unknown key `unknownX: Y` | §3.5 参照、graphical mode で hide、raw mode で見える |
| 7 | cap 16 KB 超(中 cap) | 警告表示 + 保存可、HARD cap 1 MB は block |
| 8 | cap 1 MB 超(HARD cap)| save 拒否、エラー表示 |
| 9 | URL field に non-URL 文字列 | warning("Invalid URL format")+ 保存可(soft check)|
| 10 | enum field に不正 value(`kind: invalid`)| warning("Unknown kind value")+ 保存可 |
| 11 | `vars.foo: $X`(変数展開構文)| literal として保存(展開は別経路)|
| 12 | 同 key 重複(`kind: book\nkind: video`)| YAML parser の last-wins、UI も last 値表示 |

### §3.4 cap enforcement(16 KB default / 1 MB hard)の UI 表示

§1.2 で確認した cap:default 16 KB、HARD 1 MB、warnings 配列で返却。

graphical mode の UI:
- frontmatter section の footer に「Size: 5.2 KB / 16 KB」表示
- 16 KB 近づくと warning 色(orange)、超過すると赤
- HARD cap 1 MB 近づいたら save button disabled + エラー説明

raw mode でも同様の size 表示。

### §3.5 unsupported keys の保護(unknown keys は raw section に残す)

`parseFrontmatter()` は flat YAML 制約のため unknown key も `Record<string,
string>` で取得できる。

graphical mode の扱い:
- **既知 key**(§1.2 table 12 keys)→ field-type-aware UI で編集
- **unknown keys** → "Other properties" subsection で `<dl>` read-only
  表示(誤って消さないよう protect、編集は raw mode 経由)

serialize 時、unknown keys は **保持**(graphical save が unknown key を
削除しない、merge して書き戻す)。

### §3.6 nested YAML 形式の扱い(`vars.foo` vs `vars: { foo: x }`)

現 `parseFlatYaml()` は flat key のみサポート、`vars: { foo: x }` 形式は
silent drop。

**spec 決定**(OQ-B-2 暫定):
- graphical mode では **flat `vars.x` 形式のみ**(現状互換)
- 将来 nested YAML support は Phase γ-B3 以降で別 PR、本 spec scope 外
- graphical UI で vars table form を編集すると、保存時は flat `vars.foo:
  X` 形式で出力(現 parser と整合)

---

## §4 右ペイン pane mode 切替設計

### §4.1 mode 一覧

| mode | 内容 | enabling flag |
|---|---|---|
| `default` | 現 13 section の標準 meta pane(§1.1)| (always)|
| `relation-editor` | graph view edit mode + meta pane の References subsection 拡大表示 | `meta_pane.relation_editor_enabled = true` |
| `yaml-editor` | frontmatter section を full-size 表示(他 section minimize)| `meta_pane.yaml_graphical_enabled = true` |

### §4.2 mode 切替 UI

meta pane の上部に **horizontal tab strip**:

```
<div class="pkc-meta-pane-mode-bar" data-pkc-region="meta-mode-bar">
  <button data-pkc-action="set-meta-pane-mode"
          data-pkc-meta-pane-mode="default">📋 Default</button>
  <button data-pkc-action="set-meta-pane-mode"
          data-pkc-meta-pane-mode="relation-editor">🔗 Relations</button>
  <button data-pkc-action="set-meta-pane-mode"
          data-pkc-meta-pane-mode="yaml-editor">{ } Properties</button>
</div>
```

state field:`state.metaPaneMode: 'default' | 'relation-editor' |
'yaml-editor'`(localStorage persist key `pkc2.metaPaneMode.default`、
default `'default'` = 現状互換)。

**注**:`relation-editor` mode のときは、graph view tab(view-mode bar
の graph)が自動で edit mode に切替(§2.1)、meta pane が **graph view
の補助 panel** として relation list を大きく表示。

### §4.3 既存 collapse state との互換性

meta pane mode 切替は **`pkc2.panePrefs.meta`(collapse boolean)とは
独立**:
- `panePrefs.meta = true`(meta collapse 中)でも mode 設定は保持
- expand したときに最後の mode を復元

migration:既存 user は `pkc2.metaPaneMode.default` 未設定 = `'default'`
で完全互換。

---

## §5 Tier 0 flag 一覧

本 spec で導入する Tier 0 flag:

| flag key | type | default | scope |
|---|---|---|---|
| `meta_pane.relation_editor_enabled` | bool | `false` | graph view edit mode + relation-editor mode 経路を有効化 |
| `meta_pane.yaml_graphical_enabled` | bool | `false` | YAML graphical editor mode を有効化 |
| `meta_pane.yaml_graphical_fallback` | bool | `true` | 不正 YAML 時の raw mode 自動切替 + 赤バー警告 |
| `meta_pane.mode_default` | string | `'default'` | meta pane 初期 mode(Phase γ-B3 で `'graphical'` 切替検討)|
| `graph.edit_mode_enabled` | bool | `false` | graph view edit mode toggle UI 表示 |
| `graph.kind_selector_show_cancel` | bool | `true` | kind selector popup の cancel button 表示(誤操作対策)|

### §5.1 Phase γ-B1〜B3 の段階表

| wave | 内容 | flag default 切替 | breakage risk |
|---|---|---|---|
| γ-B1 | YAML graphical editor(`meta_pane.yaml_graphical_enabled = true`)+ flag default ON | 低-中(read-only `<dl>` → editable form、既存 user は raw mode 経由で互換)|
| γ-B2 | graph view edit mode(`graph.edit_mode_enabled = true`)+ wire editor + multi-select | 中(graph view 操作系の拡張、既存 node drag は Shift+drag に escape)|
| γ-B3 | meta pane mode 切替 UI(`meta_pane.mode_default = 'graphical'` 切替検討)| 中(meta pane 上部 tab strip 追加、collapse state 互換性確認) |

---

## §6 backward compat contract

### §6.1 既存 frontmatter `<dl>` は保持

- Tier 0 flag `meta_pane.yaml_graphical_enabled = false` で完全に旧
  read-only `<dl>` 表示に戻る(Phase γ-B1 でも flag OFF で旧挙動維持)
- raw mode toggle で **YAML 直接編集** も常時提供(power user / AI
  authoring 用)
- unknown frontmatter keys は **保持**(graphical save が消さない、merge)

### §6.2 既存 relation form は保持

- meta pane の §1.3 `relation-create` form + Categorical relations
  section は **保持**、graph view wire editor と並走
- どちらの UI でも同じ `create-relation` action を dispatch、container
  mutation は centralized
- Tier 0 flag `meta_pane.relation_editor_enabled = false` / `graph.edit_mode_enabled
  = false` で graph view 側を OFF → meta pane form のみで関係作成

### §6.3 schema breaking なし

- container schema(`entries / relations / revisions / assets`)は **触らない**
- AppState 拡張は `state.metaPaneMode` / `state.graphMode` / `state.frontmatterMode` の
  3 string field 追加のみ(runtime state、persistence は localStorage)
- `state.graphEdit`(drag state)は **runtime 揮発**、persistence なし

### §6.4 `data-pkc-region` の immutability

§1.1 で確認した既存 13 region は **保持**、本 spec で追加する新 region:
- `meta-mode-bar`(§4.2 mode 切替 tab strip)

新 region 追加のみ、既存 region 削除は **なし**。

---

## §7 visual parity test 計画

### §7.1 Phase γ-B1〜B3 の parity test 一覧

| wave | parity test 内容 |
|---|---|
| γ-B1 | YAML graphical editor の各 field type click → state mutation → entry.body 内 `---` block の YAML 内容が更新を実 OS event ベースで assert(case matrix §3.3 の 12 cases を smoke test として記述)|
| γ-B1 | 不正 YAML 入力 → 赤バー警告表示 → raw mode 自動切替 を `elementFromPoint` 経由で assert |
| γ-B2 | graph view edit mode toggle で canvas 内 node に「+」hover hint が表示、`page.mouse.down/move/up` で drag シーケンス → kind selector popup 表示 → kind button click → `state.container.relations` に新 relation 追加 を **canvas pixel + DOM 双方** で assert |
| γ-B2 | bulk relation 作成(region-select 3 node → 1 target に bulk)で 3 個の relation が atomic に dispatch、Outgoing relations list 行数が +3 を assert |
| γ-B3 | meta pane mode 切替 tab strip 表示、`set-meta-pane-mode` action で meta pane DOM root の `data-pkc-meta-pane-mode` attribute が変化、各 mode で section の可視性が確定値に遷移 |

### §7.2 順序性 test の要件(CLAUDE.md §8 Phase 8 規約)

各 parity test は **boot → action → consumer 観測の鎖** を全件 covered:

| trigger action | consumer 観測点 |
|---|---|
| graphical editor で `kind` field を `book` に変更 | (a) DOM 内 form value 変化、(b) entry.body 内 YAML が `kind: book` を含む、(c) container revisions に新 revision、(d) sidebar の link-index badge count 不変(relation 系でないため) |
| graph view edit mode で drag → kind 選択 | (a) state.graphEdit.dragSource set、(b) prototype line canvas 描画、(c) popup DOM 表示、(d) kind 選択後の state.container.relations に新 relation、(e) Outgoing list 行数 +1、(f) graph canvas に新 edge 描画、(g) sidebar badge count +1 |
| meta pane mode 切替 | (a) state.metaPaneMode 更新、(b) localStorage `pkc2.metaPaneMode.default` 更新、(c) DOM root attribute 変化、(d) section 可視性遷移 |

DOM attribute 遷移だけで止めず、**consumer 数値** が user-visible に変化する
ことまで確認(CLAUDE.md §8 規約)。

### §7.3 3 surface dual-render path への影響(CLAUDE.md §9 規約)

§2.7 で結論した通り、graph view + meta pane は **center pane 専用**、
Viewer popup / Split View 経路には render しない。3 surface verify は
本 spec では **center pane のみ** で完結(残り 2 surface は不要)。

ただし frontmatter の **render 結果**(`{{vars.x}}` 展開等)は 3 surface で
共通する markdown render path を経由するため、graphical editor で
`vars.x` を変更したら 3 surface 全部で同じ結果が反映されることは
**既存 markdown render contract**(`markdown-render-scope.md`)で保証されて
おり、本 spec で再確認は不要。

---

## §8 spec 起こし中に出た新 open question(user 追加合意待ち)

### §8.1 OQ-B-1:graph view edit mode は default に edit UI を出す? 明示 toggle?

§2.1 で「edit mode toggle button を graph view tab 内に出す」と書いたが、
default は (i) view mode で edit toggle を user 明示クリックで切替 / (ii)
edit mode を最初から表示 / (iii) user 設定(`graph.edit_mode_default`)で
選択、のいずれが良いか。

**暫定**:(i) view mode default、edit toggle 明示(誤操作で意図せず
relation 作るリスク低減)。

### §8.2 OQ-B-2:nested YAML(`vars: { foo: x }`)support

§3.6 で「flat `vars.x` 形式のみ」と決めたが、power user(AI authoring)が
nested 形式を望む声があれば Phase γ-B3 以降で扱う。

**暫定**:Phase γ-B 全体では **flat のみ**、nested は v3.0 lineup で別 spec。

### §8.3 OQ-B-3:relation editor の multi-select modifier

graph view region-select は **drag-rect** で既存基盤あり(§1.4)。
multi-select の追加 modifier は:
- (i) Shift+click で node を追加選択(Mac/Win 標準)
- (ii) Ctrl/Cmd+click で同上
- (iii) 両方サポート

**暫定**:(iii) 両方サポート、Mac は Cmd+click、Win/Linux は Ctrl+click。

### §8.4 OQ-B-4:drag-create 中の visual feedback

prototype line の **色 / 太さ / 点線パターン** をどう決めるか:
- (i) **kind 未確定なので neutral 灰色**、kind 選択後に kind 色に変化
- (ii) drag 中に keyboard で kind を pre-select(K キーで kind 切替)し、
  色を即時反映
- (iii) source node の **dominant outgoing kind 色** を default にする

**暫定**:(i) neutral 灰色 + 半透明 + 点線、popup で kind 選択後に
solid + kind 色。

### §8.5 OQ-B-5:unknown frontmatter keys の扱い

§3.5 で「graphical mode では Other properties subsection に read-only
表示」と書いたが:
- (i) read-only `<dl>` で表示、編集は raw mode 経由
- (ii) graphical mode でも `<input type="text">` で編集可能(type 推測なし)
- (iii) hide(graphical mode では非表示、raw mode のみで見せる)

**暫定**:(i) read-only 表示で誤って消さない保護、編集は raw mode 経由。

### §8.6 OQ-B-6:大規模 graph(1000+ node)での edit mode performance

§2.3 case matrix #11 で「1000+ node graph で drag 中 60fps 維持」と
書いたが、実機検証が必要(canvas redraw cost + hitTest cost)。

**暫定**:Phase γ-B2 着手時に bench 試走、必要なら spatial index(quadtree)
導入を Phase γ-B2 内で別 PR。

### §8.7 OQ-B-7:relation 編集の undo / redo

§2.3 multi-select bulk operation で「3 relation 一括作成」した後、user
が undo したら **1 step で全 3 relation を取り消し** すべきか:
- (i) **bulk dispatch** を 1 reducer action にまとめ、undo step 1 で取り消し
- (ii) N 個の dispatch を順次行い、undo step N で順次取り消し
- (iii) Tier 0 flag `relation.bulk_undo_atomic`(default ON = (i))

**暫定**:(i) atomic bulk undo(user 体感が自然)、Tier 0 flag は不要。

---

## §9 history

| date | event |
|---|---|
| 2026-05-19 | PR #480(PR-β0)merge:Phase β plan 着地 |
| 2026-05-19 | PR #481(PR-β1)merge:Group A 統合 spec 着地、OQ-A-1〜A-5 未合意のまま |
| 2026-05-19 | **本書起こし(PR-β2)**:Group B 右ペイン特化 spec、現状 meta pane 13 section + graph view 線引き非サポート整理 + relation wire editor + YAML graphical editor 詳細設計 + Tier 0 flag 6 件 + visual parity 計画 + 新 OQ-B-1〜B-7 |
| 2026-05-20 | **Phase γ-B 実装着地(stack PR-pgc-15〜26)**:§3 YAML graphical editor(serialize / 編集 form / field-type-aware / warnings 可視化)、§2 graph relation wire editor(edit mode / wire drag / kind popup / CREATE_RELATION / Shift+drag 退避 / multi-select 一括 / visual parity test)、§4 meta pane mode tabs が着地。すべて flag gate。詳細は CHANGELOG v2.3.0 §Phase γ-B |

---

## §10 関連 doc

- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md):
  Phase β 全体計画、本 spec は §2.2 PR-β2 として位置付け
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md):
  PR-β1 Group A shell 再構成、meta pane は **Group A 触らない契約**(本
  spec の前提)
- [`v3-architecture-proposals-2026-05-18.md`](./v3-architecture-proposals-2026-05-18.md):
  8 案受領 doc、本 spec は #6 を統合
- [`backlinks-panel-v1.md`](./backlinks-panel-v1.md):
  Backlinks Panel v1 spec(2026-04-19、S-34)、meta pane の relations
  layer 2 = link-index の起点 doc。本 spec はその拡張
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md):
  既存 roadmap、領域 4(edit support)とは独立だが UX 改善で参照
- [`markdown-render-scope.md`](./markdown-render-scope.md):
  3 surface dual-render path 規約、`{{vars.x}}` 展開 path 共有
- [`visual-state-parity-testing.md`](./visual-state-parity-testing.md):
  §7 visual parity test の方法論 reference
- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md):
  power user / AI authoring 受容性 = Group B の動機 doctrine
