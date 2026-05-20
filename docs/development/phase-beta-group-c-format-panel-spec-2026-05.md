# Phase β PR-β3:Group C 書式機能 spec — format panel ワープロ化(2026-05-19)

**Status**:docs-only spec(PR-β3、Phase β の Group C 詳細設計)
**前提 doc**:
- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md)(PR-β0 = Phase β 全体計画)
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md)(PR-β1 = Group A shell 再構成)
- [`phase-beta-group-b-meta-pane-spec-2026-05.md`](./phase-beta-group-b-meta-pane-spec-2026-05.md)(PR-β2 = Group B 右ペイン特化)

**Scope**:v3 提案 **#7 = format panel ワープロ化**(編集モードの書式ツールバーを Word / Notion 相当の richer panel に格上げ)
**実装**:Phase γ-C1〜γ-C3 で順次着手(本 spec は **設計合意 doc**、src 変更なし)
**Audience**:PKC2 を初めて触る engineer、6 ヶ月後でも grep で陳腐化検知できる粒度

---

## 訂正 notice(2026-05-20、reform / scrap-and-build)

本 spec 初版(PR-β3 = PR #483)の §1 / §3 は **事実誤認** を含んでいた。

- **誤**:「desktop 固定 toolbar は未実装、format affordance は
  `snippet-toolbar.ts` の floating popup のみ」
- **実態**:`src/adapter/ui/format-panel.ts`(PR-2JJ v2、398 行、本番
  稼働中)= **選択追従の floating 書式 panel(14 button)** が既に存在
- **原因**:Group C 調査の Explore agent が `format-panel.ts` を grep し
  損ね、Claude が agent report を verify せず spec 化した
  (CLAUDE.md「trust but verify」違反)
- **roadmap §206「14 button」記述は古くない** — この既存 panel を正しく
  指していた

**user 判断(2026-05-20)**:既存 floating panel は **floating + 選択追従
の UX が使いにくい** ため **scrap-and-build**(破棄 → desktop 固定 ribbon
を建て直し)。本訂正 PR(stack PR-pgc-01)で §0 / §1.1 / §3.1 を実態に
合わせ、Phase γ-C wave を scrap-and-build 構成に再定義した。flag は scrap
後 `editor.format_panel_enabled` 1 本を新 panel が引き継ぐ(§5 の
`format_panel.*` 多段 flag 案は破棄、実装 PR で確定)。

---

## §0 本書の位置付け

v3 提案 #7 は「**Word / Notion から来た非プログラマ user の引き止め**」を
狙う UX 提案。現状の PKC2 には書式入力 affordance が **2 つ** ある:touch
向け floating popup(`snippet-toolbar.ts`)と、選択追従の floating 書式
panel(`format-panel.ts`、14 button、§1.1)。後者は **floating + 選択追従
の UX が使いにくい**(2026-05-20 user 判断)。Group C は `format-panel.ts`
を **scrap-and-build** し、font / 段落 / 表 / 番号リスト / 検索置換を
**1 つの desktop 固定 format panel** に集約・再設計する。

**最重要の縛り条件**:Group C は **新しい markdown 記法を作らない**(原則)。
panel の各 operation は **既存 PKC Markdown canonical 記法に書き戻せる
operation のみ** を提供する(§2 invariant)。これは PKC2 の supreme
invariant「Container is source of truth」「Backward compatibility」を
書式 UI 層で守るための制約。

Group C は **領域 6(markdown 方言)** および **領域 8(番号体系)** とは
別 scope だが、番号・リスト operation で領域 8 と連携面を持つ(§2.3 / §7)。

---

## §1 現状の事実関係(spec の前提)

### §1.1 現 format 入力 affordance(2 つ存在、format-panel.ts は scrap 対象)

PKC2 の編集モードには書式入力の affordance が **2 つ** 存在する。

#### (a) snippet-toolbar.ts — touch 向け floating popup(維持)

**File**:[`src/adapter/ui/snippet-toolbar.ts:120-157`](../../src/adapter/ui/snippet-toolbar.ts)

- `renderFloatingTrigger()` / `renderFloatingPopup()`:caret 追従の `+`
  trigger → 横一列 **18 snippet** popup
- iOS / iPad 浮動型、CSS で `pointer: coarse` に gate
- Group C は **これは scrap しない**(touch の素早い記号入力は floating が
  最適、§3.3 で touch 経路として維持)

#### (b) format-panel.ts — 選択追従 floating 書式 panel(★ scrap 対象)

**File**:[`src/adapter/ui/format-panel.ts`](../../src/adapter/ui/format-panel.ts)
(398 行、PR-2JJ v2、本番稼働中)

- 編集モードの textarea で text を **選択すると選択範囲に追従** して出る
  floating panel
- **14 button**:B / I / S / `` ` `` / `==` / `..` / sup / sub / link /
  H1 / H2 / H3 / `>` / `·`(全て PKC MD canonical wrap)
- pure helper:`wrapInline()` / `wrapAsymmetric()` / `prefixLines()` —
  **記法変換ロジックは正しい**、scrap-and-build でも再利用可能
- Tier 0 flag `editor.format_panel_enabled`(default **ON**、現在ユーザーに
  表示中)、`mountFormatPanel()` を `main.ts:386` で wiring
- CSS:`base.css:9712-9752`、test:`tests/adapter/format-panel.test.ts`
- **scrap-and-build 対象**:floating + 選択追従の UX が使いにくい
  (2026-05-20 user 判断)。Group C は本 file を破棄し、desktop 固定
  ribbon として建て直す(§3.1)

**roadmap §206「14 button」記述は古くない** — (b) の format-panel.ts を
正しく指していた。本 spec 初版が「snippet-toolbar の 18 が実態、14 は
古い」と書いたのは誤り(冒頭の訂正 notice 参照)。

**18 snippet 一覧**(snippet-toolbar.ts、`data-pkc-snippet` 値):

| group | snippet 名 |
|---|---|
| code 系 | `backtick`(inline code)/ `fence`(code block)|
| 括弧 系 | `paren` / `bracket` / `brace` / `angle` |
| 区切り | `dash` / `section-break`(`+++`)|
| 引用 | `quote` |
| 見出し | `heading` × 3(h1 / h2 / h3)|
| align | `align-center` / `align-right` / `align-left` |
| 装飾 | `highlight`(`==X==`)/ `simple-inline`(`:X:attrs:`)/ `ruby`(`[[ruby:X|Y]]`)/ `em-dot`(`^^X^^`)/ `comment-inline`(`%%X%%`)|

archetype:snippet-toolbar / format-panel とも **TEXT / TEXTLOG 両対応**。

### §1.2 applySnippet ロジック(wrap / toggle / insert)

**File**:[`snippet-toolbar.ts:281-445`](../../src/adapter/ui/snippet-toolbar.ts)
(`applySnippet(ta, kind)`)

- single entry point:`applySnippet(textarea, snippetKind)`
- selection あり → **wrap**(`==selected==`)、selection なし → 空マーカー
  挿入(`====` + caret 中央配置)
- internal helper:`replaceRange()` / `insertPair()` で textarea value を
  直接操作 → 合成 `input` event で dirty-state へ通知(action-binder 経由)
- toggle:`backtick` は selection あり時 wrap、なし時 空括弧。完全な
  「既にマーク済なら外す」 toggle は snippet ごとに差がある(未統一)

### §1.3 PKC Markdown 記法の全セット

**File**:[`src/features/markdown/markdown-render.ts`](../../src/features/markdown/markdown-render.ts)

**preprocessor 実行順**(L.3327-3463、critical path):
```
processFigureBlocks → processIfBlocks → preprocessAlignPrefix
  → stripComments → processBlankLineMarkers / processQuoteBlocks
```

**inline 記法**:

| 記法 | 意味 | 出力 |
|---|---|---|
| `**X**` | bold | `<strong>`(GFM 標準)|
| `*X*` | italic | `<em>`(GFM 標準)|
| `~~X~~` | strike | `<s>`(GFM 標準)|
| `` `X` `` | inline code | `<code>` |
| `==X==` | highlight | `<mark>` |
| `==[color]X==` | colored highlight | `<mark style="background-color:...">` |
| `^^X^^` | em-dot(圏点、wave-10-2 新形)| `<span class>` |
| `[[ruby:base|reading]]` | ruby furigana | `<ruby>` |
| `[[em:X]]` | em-dot(旧形)| 同上 |
| `:role:[content]{attrs}` | formal inline role(sup / sub / span / mark / code 等)| role 別 |
| `:X:attrs:` | L-6 simple-inline(`bold` / `red` / `lg` / `serif` 等)| `<span style="...">` |
| `%%X%%` | inline comment | (render 時に除去)|

**block 記法**:

| 記法 | 意味 |
|---|---|
| `:::section{role=summary\|warning\|note\|tip\|caution\|important\|info\|danger}` | callout block |
| `:::figure{#id}` / `:::table{#id}` / `:::equation{#id}` + `^^^caption` | figure block |
| `:::toc{depth=N}` | ToC 自動生成 |
| `:::if{format=html}` | conditional block |
| `:::quote{author=...}` | formal citation blockquote |
| `:::paragraph{align=top\|bottom\|physical}` | 段落 vertical / 物理 align |
| `+++` | section break line |
| `\|\|` / `\|>` / `<\|`(行頭)| align prefix(left / center / right)|
| `> X` | CommonMark blockquote |

**表記法**:
- GFM pipe table(`|...|...|`)— markdown-it default 有効
- CSV / TSV / PSV fenced block(```` ```csv ````)— [`csv-table.ts`](../../src/features/markdown/csv-table.ts)
  で専用 parse + render、header 有無 flag 対応
- **両方併存**

### §1.4 見出し / リスト / 番号の現状

**見出し**:
- GFM 標準 `#`〜`######`(h1〜h6)、markdown-it 標準 render
- heading anchor:slugify + 自動 id 付与(L.1013-)
- **折りたたみ(folding)見出しは未実装**(roadmap 領域 6 で計画)

**リスト**:
- 順序リスト(`1.`):CommonMark 標準、自動採番で見た目は整うが **source
  連番は不整合のまま**(`1. 1. 1.` でも表示は `1. 2. 3.`)。source 側の
  auto-renumber は **未実装**(roadmap 領域 8 Layer 1 で計画)
- 箇条書き(`-` / `*`):CommonMark 標準。改行時の自動 indent / marker 継続
  は **未実装**(roadmap 領域 4、PR #198 進行中)

**roadmap 領域 8「番号体系」**(roadmap L.398-476):
- 現状の痛み:順序リスト番号の途中改行で重複、行削除で番号ずれ
- Layer 1 計画:平坦 auto-renumber + uniform-one toggle(全部 `1.` でも
  良い)
- Layer 2:ネスト対応
- Layer 3:見出し型 章節項番号(`# 1.` / `## 1.1`)
- **設計未決**:Layer 3 は「方針 B:レンダラ付与」か「方針 C:ハイブリッド」
  か保留中。将来 Word / PPT export と連動予定

### §1.5 font / 段落書式の現状

**font 変更の現状記法**:
- `==[red]X==` / `==[#hex]==` / `==rgb(r,g,b)==`:**highlight(背景色)**
  指定のみ
- `:X:bold,red:`(L-6 simple-inline):`font-weight:bold; color:red;` を
  `<span style="...">` で出力
- `:X:xs,sm,md,lg,xl:`:font-size 段階(`var(--fs-lg)` 等)
- `:X:serif,sans,mono:`:font-family 指定
- frontmatter 経由の本文 font 指定:**未確認**(Group B §1.2 で扱う
  `writing` / `align` / `layout` は段落軸ではなく document 軸)

**段落書式の現状記法**:
- 行頭 align prefix(`||` / `|>` / `<|`):`preprocessAlignPrefix` で
  block-level apply(left / center / right)
- `:::paragraph{align=top|bottom}`:vertical align
- `:::paragraph{align=physical}`:物理強制 align
- **indent / line-height / justify(両端揃え):記法なし**

### §1.6 検索置換 UI の現状

**File**:[`src/adapter/ui/text-replace-dialog.ts`](../../src/adapter/ui/text-replace-dialog.ts)
+ [`textlog-log-replace-dialog.ts`](../../src/adapter/ui/textlog-log-replace-dialog.ts)

- `text-replace-dialog.ts`:TEXT body 限定、regex opt-in / case-sensitive
  opt-in / Selection-only opt-in
- `textlog-log-replace-dialog.ts`:TEXTLOG current log 限定、同 opt-in 3 種
- Apply 時に synthetic `input` event を fire → dirty-state / preview /
  commit へ通知
- 起動経路:編集モード action bar の 🔎 button(S-26 で追加)

### §1.7 markdown render scope + canonical 往復 invariant

**File**:[`docs/development/markdown-render-scope.md`](./markdown-render-scope.md)

- render 対象:`text.body` / `textlog.text` / `todo.description` /
  `folder.body`(form / attachment / generic / opaque は render しない)
- 共通 selector:`.pkc-md-rendered`
- 3 surface:center pane(detail-presenter)/ Viewer popup
  (rendered-viewer)/ Split View preview(`data-pkc-source-line` anchor)

**canonical 往復 invariant**:`copy-markdown-pkc()`(PR-2JJ、L.7154-7161)が
AST → PKC 正規記法で復元する。Group C の全 operation は **この往復が壊れ
ない範囲** でのみ動く(§2)。

---

## §2 ワープロ化の設計原則(supreme invariant)

### §2.1 「canonical 形に書き戻せる operation のみ」原則

Group C の format panel が提供してよい operation は、**結果が PKC
Markdown canonical 記法として entry.body(string)に書き戻せるもの限定**。

**理由**:
- Container の source of truth は `entry.body`(string)。WYSIWYG editor
  ではなく markdown source editor + preview の構造
- panel operation が canonical でない HTML を生成すると、(a) source
  editor で読めない、(b) export 時に失われる、(c) Split View の
  `data-pkc-source-line` 逆引きが壊れる
- 既存の `copy-markdown-pkc()`(§1.7)の AST 往復が前提

**判定 checklist**(panel に新 operation を足すとき):
1. その operation の結果は entry.body の文字列として表現できるか?
2. その文字列を再 parse して同じ render 結果が出るか(idempotent)?
3. Split View source editor でその文字列を user が読めるか?

3 つすべて Yes でなければ panel に入れない。

### §2.2 inline style 直書きの禁止

`<span style="color:#ff0000">` のような **生の inline style 直書きは
forbidden**。理由:source editor で意味が読めず、削除 / 編集時に壊れ、
copy-markdown 往復で失われる。

**代替**:
- 文字色 → `:X:red:`(simple-inline、§1.5)or `==[red]X==`(highlight)
- font-size → `:X:lg:`
- font-family → `:X:mono:`

simple-inline `:X:attrs:` は **render 結果としては** `<span style>` を
出力するが、**source は canonical marker `:X:attrs:`**。invariant が守る
のは「source が canonical であること」であり、render 後 HTML に style 属性
が出ること自体は許容(source ↔ render の往復が保たれる限り)。

### §2.3 領域 8 番号体系との scope 境界

| 軸 | Group C(本 spec)| 領域 8(番号体系)|
|---|---|---|
| 担当層 | **UI panel の button**(ordered ↔ bullet toggle / level 増減 button)| **preprocessor / renderer の採番ロジック**(auto-renumber / uniform-one / 章節番号)|
| markdown 記法 | 変更しない | 変更しない(採番は render 責任)|
| 依存方向 | Group C の番号 button は領域 8 の renumber engine を **呼ぶ側**(engine 未実装なら素朴 toggle のみ提供、§7.3)|

**契約**:Group C は番号 **button の UI** を提供、領域 8 は **採番の正しさ**
を提供。両者は独立 PR で進められる(Group C の番号 button は領域 8 完成前
でも「`-` ↔ `1.` の prefix 置換」という素朴 operation として動く)。

### §2.4 領域 6 markdown 方言との scope 境界

| 軸 | Group C | 領域 6(markdown 方言)|
|---|---|---|
| 内容 | 既存記法を **panel button から呼ぶ UX** | 新記法(画像 size/align / 折りたたみ見出し / その他方言)の **追加** |
| 新記法 | 作らない(原則)| 作る |

Group C で「画像挿入」button を作る場合、出力する記法は領域 6 が定義する
画像記法に従う(Group C は記法を決めない)。領域 6 未実装の機能(折りたた
み見出し等)は Group C panel に button を出さない。

---

## §3 format panel の構造刷新

### §3.1 scrap-and-build:format-panel.ts を desktop 固定 ribbon に建て直す

§1.1 (b) の既存 `format-panel.ts`(floating + 選択追従)は **scrap**、
同 file を **desktop 固定 format panel** として **build** し直す。

| 環境 | format affordance |
|---|---|
| desktop(pointer: fine + 画面幅広)| **新 desktop 固定 format panel**(編集 mode 上部に常駐 ribbon、本 spec の主対象)|
| iOS / iPad / touch | snippet-toolbar.ts の floating popup を維持(§1.1 (a)、scrap しない)|

scrap-and-build の要点:

- 旧 floating panel の DOM / `mountFormatPanel` / 選択追従ロジック / 旧
  CSS は **全て破棄**
- 旧 `wrapInline()` / `wrapAsymmetric()` / `prefixLines()` の **記法変換
  ロジックは正しいので再利用**(使いにくい UX を捨て、変換 math は残す)
- 旧 flag `editor.format_panel_enabled` は新 panel の gate として引き継ぐ
  (flag contract 維持、§5)
- `data-pkc-region="format-panel"` / `.pkc-format-panel` は新 panel が
  引き継ぐ(旧実装が使っていた名前を再利用、collision ではなく置換)

判定:`matchMedia('(pointer: fine)')` + viewport 幅。OQ-C-6 で最終決定。

### §3.2 panel group 構成

固定 format panel は **6 group** に区切る(Word ribbon 風だが軽量):

| group | operation(§4〜§8 で詳細)|
|---|---|
| **Font** | bold / italic / strike / code / 文字色 / font-size / font-family |
| **段落** | align(left / center / right / justify)/ heading level / blockquote |
| **リスト・番号** | bullet / ordered / level 増減(indent / outdent)/ ordered ↔ bullet toggle |
| **表** | 表挿入 / 行・列 追加削除 / セル整列 |
| **挿入** | link / 画像(領域 6 依存)/ 区切り線 / callout / figure / ruby / em-dot |
| **検索** | find / replace dialog 起動(§1.6)|

各 group は折りたたみ可能、user が使う group のみ展開。

### §3.3 responsive(floating ↔ fixed の出し分け)

- desktop:固定 panel(§3.2 の 6 group)
- touch:floating popup(現状 18 snippet)を維持、ただし snippet 一覧を
  §3.2 の group 構成に合わせて再編(同じ operation set を 2 形態で提供)
- 共通の operation 定義 table(`FORMAT_OPERATIONS` registry)を 1 つ持ち、
  floating / fixed 両方がそれを参照(operation 定義の二重管理を防ぐ)

---

## §4 Font 系 operation

### §4.1 operation → canonical 記法 map

| panel operation | canonical 記法 | toggle 挙動 |
|---|---|---|
| Bold | `**X**` | 既に `**` で囲まれていれば外す |
| Italic | `*X*` | 同上 |
| Strike | `~~X~~` | 同上 |
| Inline code | `` `X` `` | 同上 |
| Highlight | `==X==` | 同上 |
| 文字色 | `:X:red:`(simple-inline)| 色選択 popup → simple-inline marker |
| 背景色(highlight 色)| `==[red]X==` | 色選択 popup |
| font-size | `:X:lg:`(xs / sm / md / lg / xl)| size 選択 popup |
| font-family | `:X:mono:`(serif / sans / mono)| family 選択 popup |
| 上付き | `:sup:[X]`(formal inline)| - |
| 下付き | `:sub:[X]`(formal inline)| - |

### §4.2 文字色 / 背景色 popup

文字色 button click → color popup:
- preset 色(simple-inline が受ける named color の確定集合:red / blue /
  green / orange / purple / gray 等、`simple-inline` parser から動的取得)
- preset 外の hex 指定は **background(highlight)`==[#hex]==` のみ**
  許可(simple-inline の color は named のみという現実装制約があれば
  それに従う、§8 OQ-C で確認)

### §4.3 case matrix(CLAUDE.md §4 規約、最低 10 件)

font operation = inline operation のため case matrix 必須:

| # | 選択範囲 | operation | 期待結果 |
|---|---|---|---|
| 1 | `hello`(plain)| Bold | `**hello**` |
| 2 | `**hello**`(既 bold)| Bold | `hello`(toggle off)|
| 3 | 空選択(caret のみ)| Bold | `****` + caret 中央 |
| 4 | `*hello*`(既 italic)| Bold | `***hello***`(bold 追加、nest)|
| 5 | 複数行選択 | Bold | 各行を `**...**`?or 全体 1 wrap?→ OQ-C-7 |
| 6 | CJK `日本語`(plain)| Bold | `**日本語**` |
| 7 | 絵文字 `🎉`(plain)| Bold | `**🎉**` |
| 8 | 行頭 `# 見出し` の見出しテキスト | Bold | `# **見出し**`(heading 内 inline)|
| 9 | `hello`(plain)| 文字色 red | `:hello:red:` |
| 10 | `:hello:red:`(既 color)| 文字色 blue | `:hello:blue:`(色置換)|
| 11 | `hello` | font-size lg | `:hello:lg:` |
| 12 | `:hello:red:`(既 color)| font-size lg | `:hello:red,lg:`(attr 追加)|
| 13 | code fence 内のテキスト | Bold | 何もしない(fence 内は preprocessor skip、CLAUDE.md §11)|
| 14 | URL `https://x.com` を含む選択 | Bold | `**https://x.com**`(autolink との干渉を確認)|

### §4.4 simple-inline の attr 合成 contract

`:X:red:` に font-size を足すとき、新規 `:X:lg:` を二重に書くのではなく
**既存 marker の attr list に append**(`:X:red,lg:`)。case matrix #12。
simple-inline parser が attr を comma 区切りで複数受ける現仕様に従う。

---

## §5 段落系 operation

### §5.1 operation → canonical 記法 map

| panel operation | canonical 記法 | 備考 |
|---|---|---|
| 左揃え | `<\|`(行頭 prefix)or prefix 除去(left が default)| `preprocessAlignPrefix` |
| 中央揃え | `\|\|`(行頭 prefix)| |
| 右揃え | `\|>`(行頭 prefix)| |
| 両端揃え(justify)| **現状記法なし** → OQ-C-2 | |
| heading level(h1〜h3)| `#` / `##` / `###` | 行頭 marker 増減 |
| blockquote | `> X` | 行頭 `>` |
| インデント増 / 減 | **段落 indent は現状記法なし** → OQ-C-3 | リストの indent は §7 |
| 行間(line-height)| **現状記法なし** → OQ-C-3 | |

### §5.2 align prefix の toggle 挙動

align button は行頭 prefix の置換:
- 中央 button → 選択行の行頭に `||` を付与(既に `|>` なら `||` に置換、
  既に `||` なら除去 = left 復帰)
- 複数行選択 → 各行に適用

### §5.3 justify / indent / line-height の扱い

§1.5 で確認した通り、両端揃え / 段落 indent / 行間 は **現状 canonical
記法が存在しない**。Group C で panel button を出すには 2 択:

- (a) **新 canonical 記法を作る**(§2.1 原則の例外、領域 6 と協調が必要)
- (b) **Group C scope から外す**(panel に button を出さない、将来領域 6
  が記法を定義したら追加)

→ **OQ-C-2 / OQ-C-3 で user 判断**。暫定は (b)(妥協なし方針だが、新記法
創出は領域 6 の管轄で、Group C が勝手に作ると §2.4 scope 境界を侵す)。

### §5.4 case matrix(段落 operation、最低 10 件)

| # | 選択行 | operation | 期待結果 |
|---|---|---|---|
| 1 | `hello`(prefix なし)| 中央揃え | `\|\|hello` |
| 2 | `\|\|hello`(既中央)| 中央揃え | `hello`(toggle off)|
| 3 | `\|\|hello`(既中央)| 右揃え | `\|>hello`(置換)|
| 4 | 3 行選択(prefix なし)| 中央揃え | 各行に `\|\|` |
| 5 | `hello`(plain)| heading h2 | `## hello` |
| 6 | `## hello`(既 h2)| heading h2 | `hello`(toggle off)|
| 7 | `## hello`(既 h2)| heading h1 | `# hello`(level 変更)|
| 8 | `hello` | blockquote | `> hello` |
| 9 | `> hello`(既 quote)| blockquote | `hello`(toggle off)|
| 10 | 空行 | 中央揃え | `\|\|` のみ(空段落 align)|
| 11 | code fence 内の行 | 中央揃え | 何もしない(fence skip)|
| 12 | list item 行 `- item` | heading h2 | OQ:list を heading 化?→ 警告 or 変換 |

---

## §6 表 operation

### §6.1 表挿入

panel「表」group の「表を挿入」button → 行数 × 列数 picker → **GFM pipe
table** の雛形を caret 位置に挿入:

```
| 見出し1 | 見出し2 |
| --- | --- |
| セル | セル |
```

CSV fenced block(§1.3)は「データ貼り付け」用途のため、panel の表挿入は
**GFM pipe table を default**(編集しやすさ優先)。CSV は別 button or
paste 経路で扱う(OQ-C-5)。

### §6.2 行・列の追加削除

caret が pipe table 内にあるとき、panel に contextual button:
- 行を上 / 下に追加
- 列を左 / 右に追加
- 行 / 列を削除

実装は **pipe table の source 文字列操作**(`|` 区切りの行を parse →
行 / 列 を挿入 / 削除 → 再 serialize)。canonical 往復が保たれる
(pipe table はそのまま markdown source)。

### §6.3 セル整列

pipe table の整列行(`| --- |` / `| :-- |` / `| --: |` / `| :-: |`)を
操作して列の整列を変更。これも source 文字列操作で canonical。

### §6.4 case matrix(表 operation、最低 10 件)

| # | 状況 | operation | 期待結果 |
|---|---|---|---|
| 1 | caret が表外 | 表挿入(2×2)| 2×2 pipe table 雛形挿入 |
| 2 | caret が表の 1 行目 | 行を下に追加 | 2 行目に空行追加 |
| 3 | caret が表の最終行 | 行を下に追加 | 最終行の下に空行 |
| 4 | caret が表の中列 | 列を右に追加 | 全行に `|` セル追加 + 整列行も |
| 5 | 1 列の表 | 列を削除 | 表全体が消える?or 1 列維持?→ 警告 |
| 6 | 1 行(header のみ)の表 | 行を削除 | header 維持(削除拒否)|
| 7 | caret が表内 | セル整列 中央 | 該当列の整列行を `:-:` に |
| 8 | CJK / 絵文字を含むセル | 列追加 | 列幅ずれても source は valid |
| 9 | 表内に `\|`(escape 必要文字)| 行追加 | escape 済 `\|` を壊さない |
| 10 | code fence 内の擬似表 | 表 operation | 何もしない(fence skip)|
| 11 | CSV fenced block 内 | 表 operation | GFM 操作は無効、CSV は別経路 |
| 12 | 空のセルだらけの表 | 列削除 | 正常に列が減る |

### §6.5 visual parity test(表は座標依存 UI)

表の行 / 列追加 button は caret 位置に依存する contextual UI のため、
visual parity test 必須(§11)。

---

## §7 番号・リスト operation

### §7.1 operation → canonical 記法 map

| panel operation | canonical 記法 | 領域 8 依存 |
|---|---|---|
| 箇条書き化 | 行頭 `- ` | なし |
| 番号リスト化 | 行頭 `1. ` | なし(素朴 toggle)|
| ordered ↔ bullet toggle | `- ` ↔ `1. ` の行頭置換 | なし(素朴)|
| インデント増(level +)| 行頭に space 2 個追加 | なし |
| インデント減(level −)| 行頭 space 2 個除去 | なし |
| 採番の正規化(`1. 2. 3.` 振り直し)| **領域 8 の auto-renumber 待ち** | **あり** |
| uniform-one(全部 `1.`)| **領域 8 待ち** | **あり** |

### §7.2 素朴 toggle と領域 8 連携の二段構え

§2.3 の scope 境界に従い、Group C は **2 段階** で提供:

**段階 1(領域 8 未実装でも動く)**:
- 箇条書き / 番号 / toggle / indent 増減 = 行頭 marker の単純置換
- 番号リスト化したとき、source は素朴に `1. 1. 1.`(render は自動採番で
  `1. 2. 3.` に見える、§1.4)

**段階 2(領域 8 Layer 1 着地後)**:
- 「採番を正規化」button が有効化、source の `1. 1. 1.` → `1. 2. 3.` に
  振り直し
- uniform-one toggle が有効化

段階 1 だけでも user は「ワープロ的にリストを作る」体験を得られる。段階 2
は領域 8 の進捗次第で後付け。

### §7.3 領域 8 未実装時の panel 表示

採番正規化 / uniform-one button は、領域 8 Layer 1 未着地の間は **panel に
出さない**(or disabled + tooltip「領域 8 番号体系の実装後に有効化」)。
Group C 段階 1 の panel は **箇条書き / 番号 / toggle / indent のみ**。

### §7.4 case matrix(番号・リスト、最低 10 件)

| # | 選択行 | operation | 期待結果 |
|---|---|---|---|
| 1 | `hello`(plain)| 箇条書き化 | `- hello` |
| 2 | `- hello`(既 bullet)| 箇条書き化 | `hello`(toggle off)|
| 3 | `- hello`(既 bullet)| 番号リスト化 | `1. hello` |
| 4 | `1. hello`(既 ordered)| 箇条書き化 | `- hello` |
| 5 | 3 行選択(plain)| 番号リスト化 | 各行 `1. `(素朴、render で 1.2.3.)|
| 6 | `- hello` | インデント増 | `  - hello` |
| 7 | `  - hello`(indent 済)| インデント減 | `- hello` |
| 8 | `- hello`(indent 0)| インデント減 | `- hello`(これ以上減らない)|
| 9 | 空行 | 箇条書き化 | `- ` のみ |
| 10 | code fence 内の `- x` | 箇条書き化 | 何もしない(fence skip)|
| 11 | heading 行 `## h` | 箇条書き化 | OQ:heading を list 化?→ 警告 |
| 12 | ネストした list(`  - sub`)| ordered toggle | `  1. sub`(indent 維持)|

---

## §8 検索置換の panel 統合

### §8.1 既存 dialog の panel quick-access 化

§1.6 の `text-replace-dialog.ts` / `textlog-log-replace-dialog.ts` は
**そのまま再利用**。Group C は panel「検索」group に find / replace
button を置き、既存 dialog を起動する(dialog 自体は変更しない)。

### §8.2 panel からの起動経路

- panel「検索」group の 🔎 button → `open-replace-dialog` action(既存)
- TEXT なら `text-replace-dialog`、TEXTLOG なら `textlog-log-replace-dialog`
  を archetype 判定で出し分け(既存ロジック)

検索置換は **既存実装が完成済**(regex / case / Selection-only opt-in)
のため Group C では **panel への導線追加のみ**、dialog 拡張は scope 外。

---

## §9 Tier 0 flag 一覧

| flag key | type | default | scope |
|---|---|---|---|
| `format_panel.desktop_fixed_enabled` | bool | `false` | desktop 固定 format panel(§3.1)|
| `format_panel.font_group_enabled` | bool | `false` | Font group(§4)|
| `format_panel.paragraph_group_enabled` | bool | `false` | 段落 group(§5)|
| `format_panel.table_ops_enabled` | bool | `false` | 表 operation(§6)|
| `format_panel.numbering_ops_enabled` | bool | `false` | 番号・リスト group 段階 1(§7)|
| `format_panel.numbering_renumber_enabled` | bool | `false` | 採番正規化(§7.2 段階 2、領域 8 連携)|
| `format_panel.search_integration_enabled` | bool | `false` | 検索 group(§8)|

### §9.1 Phase γ-C1〜C3 段階表

| wave | 内容 | flag default 切替 | breakage risk |
|---|---|---|---|
| γ-C1 | desktop 固定 panel 骨格 + Font group + 段落 group(`desktop_fixed` / `font_group` / `paragraph_group` ON)| 低-中(新 panel 追加、floating popup は不変)|
| γ-C2 | 表 operation + 番号・リスト段階 1(`table_ops` / `numbering_ops` ON)| 中(pipe table source 操作、contextual button)|
| γ-C3 | 検索 group 統合 + 採番正規化(領域 8 着地後、`search_integration` / `numbering_renumber` ON)| 低(検索は導線のみ)/ 中(採番は領域 8 依存)|

---

## §10 backward compat contract

### §10.1 floating popup は保持

- 現状 `snippet-toolbar.ts` の floating popup(18 snippet)は **削除しない**
- Tier 0 flag `format_panel.desktop_fixed_enabled = false` で完全に旧
  挙動(floating のみ)
- desktop でも floating popup は引き続き使える(固定 panel と併存)

### §10.2 新記法を作らない(原則)

§2.1 / §2.4 の通り、Group C は **markdown 記法を追加しない**。panel の
全 operation は既存 canonical 記法へ map。例外候補(justify / indent /
line-height)は OQ-C-2 / C-3 で **明示的に user 判断**、勝手に作らない。

### §10.3 schema breaking なし

- container schema は触らない
- AppState 拡張は `state.formatPanelMode`(floating / fixed)+
  `state.formatPanelGroups`(展開中 group の Set)程度、runtime state、
  persistence は localStorage(`pkc2.formatPanel.*`)
- entry.body の内容は **既存 canonical 記法のみ**(往復 invariant 保持)

### §10.4 `data-pkc-*` contract

- 新 region:`format-panel`(固定 panel root)、`format-panel-group`
  (各 group)
- 新 action:`format-op`(operation 実行、`data-pkc-format-op` で種別)、
  `toggle-format-group`(group 折りたたみ)
- 既存 `data-pkc-snippet`(floating popup)は **保持**

---

## §11 visual parity test 計画

### §11.1 Phase γ-C1〜C3 の parity test

| wave | parity test 内容 |
|---|---|
| γ-C1 | desktop 固定 panel の Font button を `elementFromPoint` + `page.mouse.click(x, y)` で実 OS event クリック → textarea の値が canonical 記法に変化 → preview の render 結果が変化、を assert(case matrix §4.3 の 14 cases を smoke 化)|
| γ-C1 | 段落 align button click → 行頭 prefix 付与 → preview の段落整列が変化(§5.4 の 12 cases)|
| γ-C2 | 表内 caret 位置で「行を追加」button click → pipe table source に行追加 → preview の `<table>` 行数 +1(§6.4)。**contextual button は座標依存のため必須**(CLAUDE.md §5)|
| γ-C2 | 番号・リスト toggle で行頭 marker 置換 → preview の `<ul>` / `<ol>` 切替(§7.4)|
| γ-C3 | 検索 group の 🔎 button click → replace dialog 表示 |

### §11.2 順序性 test の鎖(CLAUDE.md §8 規約)

| trigger | consumer 観測点 |
|---|---|
| Bold button click(selection あり)| (a) textarea value に `**X**`、(b) synthetic input event、(c) dirty-state ON、(d) preview の `.pkc-md-rendered` 内に `<strong>` 出現 |
| 表「行を追加」button | (a) textarea value の pipe table 行数 +1、(b) preview `<table>` の `<tr>` 数 +1 |
| 番号リスト化 | (a) 行頭 `1. ` 付与、(b) preview が `<ol>` に変化 |

DOM attribute 遷移で止めず、**preview の render 結果(consumer)** が
user-visible に変化することまで assert。

### §11.3 3 surface dual-render path(CLAUDE.md §9 / §10 / §11 規約)

format panel の operation は **entry.body(source)を編集** するため、その
結果は 3 surface(center pane / Viewer popup / Split View)の **markdown
render path すべてに自動反映**(source が変われば 3 surface とも同じ
canonical 記法を render するため)。

ただし **fence 内 skip**(CLAUDE.md §11)を厳守:format panel の operation
は code fence(```` ``` ````/`~~~`)内の選択に対して **発火しない**
(case matrix §4.3 #13 / §5.4 #11 / §6.4 #10 / §7.4 #10 で網羅)。
`fenceTransition()` helper(CLAUDE.md §11)で fence 内判定。

### §11.4 Split View source-line anchor の保護(CLAUDE.md §10 規約)

format panel が行を **挿入 / 削除**(表の行追加、段落 prefix 付与で行数は
不変だが、表 operation は行数を変える)する場合、Split View の
`data-pkc-source-line` 逆引きがずれないよう、LineMap thread を保つ
(CLAUDE.md §10、preprocessor pipeline で確立済の規約に従う)。

---

## §12 spec 起こし中に出た新 open question(user 追加合意待ち)

### §12.1 OQ-C-1:desktop 固定 panel の配置

§3.1 で「desktop 向け固定 panel」を新設するとして、配置は:
- (i) 編集 mode の本文上部に水平 ribbon
- (ii) 編集 mode の右 or 左に縦型 panel
- (iii) Group A の編集 mode 3 種(透過 / Split / 専用窓)それぞれで配置を
  変える(透過 = floating 寄り、Split = 上部 ribbon、専用窓 = 上部固定)

**暫定**:(i) 上部水平 ribbon(Word / Notion 体感に最も近い)。ただし
Group A の透過 mode では ribbon が本文を隠すため floating fallback。

### §12.2 OQ-C-2:両端揃え(justify)の canonical 記法を新設するか

§5.3 の通り justify は記法なし。
- (i) 新 prefix `|=|` を領域 6 と協調して新設
- (ii) `:::paragraph{align=justify}` を拡張(既存 paragraph directive に
  justify を足す)
- (iii) Group C scope 外(panel に button を出さない)

**暫定**:(ii)。`:::paragraph{align=...}` は既存 directive で §2.4 の
「新記法を作らない」に抵触しにくい(directive の attr 値追加のみ)。

### §12.3 OQ-C-3:段落 indent / line-height を記法化するか

§5.3。
- (i) `:::paragraph{indent=N}` / `{line-height=N}` で directive 拡張
- (ii) Group C scope 外(将来領域 6)

**暫定**:(ii)。段落 indent / line-height は document 全体の組版に近く、
Group B の frontmatter `layout` 軸や領域 6 の管轄。Group C は段落単位の
細かい組版には踏み込まない。

### §12.4 OQ-C-4:番号・リストの段階 1 を領域 8 完成前に出すか

§7.2 / §7.3。段階 1(素朴 toggle)を領域 8 Layer 1 未着地でも提供するか:
- (i) 段階 1 を先行提供(`1. 1. 1.` の素朴 source でも render は揃う)
- (ii) 領域 8 Layer 1 着地まで番号・リスト group 自体を出さない

**暫定**:(i) 先行提供。素朴 toggle でも user 体験価値は十分あり、領域 8
は後付けで「採番正規化」を足せる。

### §12.5 OQ-C-5:表 operation の対象範囲

§6.1。
- (i) GFM pipe table のみ panel 操作対象、CSV fenced block は paste 経路
  専用
- (ii) CSV fenced block も行・列追加の panel 操作対象に含める

**暫定**:(i)。CSV は「spreadsheet からの貼り付け」用途、構造編集は
pipe table に変換してから(変換 button は別途検討)。

### §12.6 OQ-C-6:floating ↔ fixed の出し分け基準

§3.3。
- (i) `matchMedia('(pointer: fine)')` で自動判定
- (ii) viewport 幅 threshold
- (iii) user 設定(`format_panel.mode` = auto / floating / fixed)

**暫定**:(iii) user 設定 + default は (i) auto 判定。

### §12.7 OQ-C-7:複数行選択時の inline operation 挙動

§4.3 case matrix #5。複数行を選択して Bold したとき:
- (i) 選択範囲全体を 1 つの `**...**` で wrap(改行を含む bold)
- (ii) 各行を個別に `**...**`(行ごと wrap)
- (iii) 複数行選択時は inline operation を無効化(段落 operation のみ許可)

**暫定**:(i) 全体 1 wrap(markdown の `**` は改行跨ぎでも有効、最も
直感的)。ただし空行を含む選択は (ii) 寄りの分割が必要 → γ-C1 実装時に
case 精査。

### §12.8 OQ-C-8:floating popup の 18 snippet を group 構成に再編するか

§3.3。floating popup を §3.2 の 6 group 構成に合わせるか、現状の横一列
18 snippet を維持するか:
- (i) floating popup も 6 group に再編(fixed と UX 統一)
- (ii) floating popup は現状維持(touch では横一列スワイプが速い)

**暫定**:(ii) 現状維持。touch の floating は素早さ優先、無理に group 化
しない。`FORMAT_OPERATIONS` registry(§3.3)は共有しつつ表示形態は別。

---

## §13 history

| date | event |
|---|---|
| 2026-05-19 | PR #480(PR-β0)merge:Phase β plan 着地 |
| 2026-05-19 | PR #481(PR-β1)merge:Group A 統合 spec 着地 |
| 2026-05-19 | PR #482(PR-β2)merge:Group B 右ペイン特化 spec 着地 |
| 2026-05-19 | **本書起こし(PR-β3)**:Group C 書式機能 spec。現状 format toolbar(snippet-toolbar.ts、floating 18 snippet、desktop 固定 未実装)+ PKC Markdown 全記法整理 + ワープロ化 invariant(canonical 往復 / inline style 禁止 / 領域 8・6 scope 境界)+ Font / 段落 / 表 / 番号 / 検索 の panel 設計 + case matrix 14+12+12+12 件 + Tier 0 flag 7 件 + visual parity 計画 + 新 OQ-C-1〜C-8 |
| 2026-05-19 | PR #483(PR-β3)merge:Group C 書式機能 spec 着地 |
| 2026-05-19 | PR #484(PR-β4)merge:Phase γ 実装 wave map 着地、Phase β 設計 wave 完了 |
| 2026-05-20 | **訂正(stack PR-pgc-01)**:§1 / §3 の事実誤認を訂正。既存 `format-panel.ts`(選択追従 floating 書式 panel、14 button、本番稼働中)を見落としていた。user 判断で scrap-and-build に方針確定、§0 / §1.1 / §3.1 を実態に合わせ、冒頭に訂正 notice を追加。Phase γ-C は wave map 側で scrap-and-build 構成に再定義 |
| 2026-05-20 | **Phase γ-C1 実装着地(stack PR-pgc-02〜08)**:format-panel.ts を scrap-and-build。固定 format ribbon(6 group / operation 19 種 / value picker 5 種)を実装。§4 Font(B/I/S/code/mark/em-dot/sup/sub + size/family/color/highlight picker)、§5 段落(heading/quote/align)、§6 表挿入、§8 挿入(link/ruby/区切り線)が着地。検索 group(§8)・表の行列編集(§6.2/§6.3)・justify(§5.3)は後続。詳細は CHANGELOG v2.3.0 §Phase γ-C1 |

---

## §14 関連 doc

- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md):
  Phase β 全体計画、本 spec は §2.2 PR-β3 として位置付け
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md):
  PR-β1 Group A、編集 mode 3 種は本 spec §12.1 の panel 配置に影響
- [`phase-beta-group-b-meta-pane-spec-2026-05.md`](./phase-beta-group-b-meta-pane-spec-2026-05.md):
  PR-β2 Group B、frontmatter `layout` 軸は段落組版(本 spec §12.3)と
  scope 境界を共有
- [`v3-architecture-proposals-2026-05-18.md`](./v3-architecture-proposals-2026-05-18.md):
  8 案受領 doc、本 spec は #7 を統合
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md):
  **領域 6(markdown 方言)** / **領域 8(番号体系)** との scope 境界の
  正本(本 spec §2.3 / §2.4)
- [`markdown-render-scope.md`](./markdown-render-scope.md):
  3 surface dual-render path 規約、canonical 往復 invariant の前提
- [`visual-state-parity-testing.md`](./visual-state-parity-testing.md):
  §11 visual parity test の方法論 reference
- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md):
  「非プログラマも操れる」= Group C の動機 doctrine
