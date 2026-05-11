# PKC2 Markdown 方言:AI 書き手向け規約書 v2

**Audience**: AI(LLM)が PKC2 entry の `body` を生成する際の規約書、特に **テストデータ生成** 用途を想定。
**Reader**: 機械的に処理する LLM。可読性は保つが、構造化と非曖昧化を優先。
**Companion(human-oriented)**: `docs/development/notation-redesign-2026-05/` 12 章 doc set(設計議論 / IR / 移行計画を含む)
**Status**: stable for L-1〜L-9 + M-7 + reform-2026-05 Phase 1 全件着地(R-C / R-D / R-E / R-F)
**Version**: v2(2026-05-09、reform-2026-05 Phase 1 反映)
**Supersedes**: `markdown-dialect-for-ai-authors-v1.md`(2026-05-08)

---

## 0. 使い方(AI が読むときの行動規約)

1. **このファイル単体で完結する**。他 spec を参照しなくても本文書通りに書けば PKC2 が正しく render する。
2. **commonmark + GFM(table / strikethrough / task list) + linkify + typographer** が base。本書はその上の PKC 独自拡張(simple 形 + formal 形)のみを定義。
3. **記法には 2 階層ある**:
   - **simple 形**(人間が日常 typing する短い形、本書 §2 の各記法の `simple:` 行)── default、AI も基本これを使う
   - **formal 形**(機械 emit 用の厳密形、`:::name{attrs}` block / `:role:[content]{attrs}` inline)── round-trip / IR 安全、AI が自動生成する場合に推奨
4. **不確実な markup は使わない**。本書に未記載の構文(例:HTML タグ直書き、独自 JSX 風 syntax)は安全のため避ける。
5. **inline HTML は禁止**。PKC2 の markdown engine は `html: false`(XSS 防止)。`<div>` / `<style>` 等は escape されてリテラル表示になる。**ただし**、複雑 layout / SVG / interactive widget が必要な場合は \`\`\`html-render fence(§4.2、PR-2M)で iframe sandbox 経由 render 可能。
6. **frontmatter は省略可**。普通の user は触らない。AI が profile 切替 / 変数定義をする時だけ書く(§1.5)。

---

## 1. 仕様マップ(全 markup の一覧表)

### 1.1 simple 形(人間 / AI 共通の日常 markup)

| ID | 名称 | simple 構文 | 用途 |
|----|-----|--------|------|
| commonmark | 見出し / 強調 / link / list / table / fence | 標準 markdown | 通常 |
| L-1 | Section break | `+++` または `+++ {role=ROLE}` | 改ページ / 章区切り |
| L-2-a | Highlight | `==text==` | 黄色マーカー |
| L-2-a' | Highlight 色付き | `==[red]text==` | 色指定 |
| L-2-b | Ruby(ふりがな) | `[[ruby:漢字\|かんじ]]` | 振り仮名(deprecated:今後 `[base\|読み]`) |
| L-2-c | Em-dot(圏点) | `^^重要^^`(2026-05-09 reform 後)/ `[[em:重要]]`(deprecated) | 各文字上に点 |
| L-3 | Blockquote 通常 | `> text` | 引用(commonmark 準拠) |
| L-4-a | Comment(inline) | `%% hidden %%` | 完全削除されるメモ |
| L-4-b | Comment(block) | `%%%\n...\n%%%` | 複数行コメント |
| **R-C** | Align prefix(reform 後)| 行頭 `\|\|`(center)/ `\|>` `<\|` `\|<` `>\|`(全部 end、4 形 typo 寛容)| 段落の中央 / end 寄せ |
| L-6 | Simple inline | `:text:attrs:` | inline 装飾(色 / 太字 / size 等) |
| L-7-a | Figure block | `:::figure{#id}\n...\n^^^ caption\n:::` | 図 + 自動採番 |
| L-7-b | Figure ref | `[@id]` | 図 / 表 / 式の本文中参照 |
| L-8 | Blank-line marker | 行頭 `_` または `_<N>`(N=1〜50、reform 後 cap raise)| 縦余白の明示。N>50 は cap される + 視認できる警告表示 |
| L-9 | Paragraph indent | 行頭 `__`(半角×2)/ `＿`(全角)| 段落先頭 1 字下げ |
| M-7 | Variables | frontmatter `vars.x` + 本文 `{{vars.x}}` | 文書内変数展開 |

### 1.2 formal 形(reform-2026-05 Phase 1 で実装済み allowlist)

**重要**:formal vocabulary は **本表の 5 形のみ**。それ以外の `:::name{}` block / `:role:[]` inline は parser fall-through(literal text)、AI が hallucination で生成しがち(後述 §1.6)。

| ID | 名称 | formal 構文 | 用途 |
|----|-----|---------|------|
| **R-D** | Quote citation block | `:::quote{author="…" year=…} content :::` | 著者付き引用、複数 embed をまとめる |
| **R-E-1** | Superscript inline | `:sup:[2]` | 上付き(`x^2` 等)、math `$$` 不使用時に |
| **R-E-2** | Subscript inline | `:sub:[n]` | 下付き(`a_n` 等) |
| **R-E-3** | Span inline + attrs | `:span:[text]{class=… #id data-key=…}` | 一般 inline span |
| **R-2B-1** | Strong formal | `:strong:[text]` | `**text**` 等価(Phase 2 PR-2B、2026-05-10) |
| **R-2B-2** | Emphasis formal | `:emphasis:[text]` | `*text*` 等価 |
| **R-2B-3** | Inline code formal | `:code:[text]` | `` `text` `` 等価 |
| **R-2B-4** | Strike formal | `:strike:[text]` | `~~text~~` 等価 |
| **R-F** | Conditional block | `:::if{format=html\|markdown\|docx} content :::` | format 別本文(format 不一致は完全 strip) |
| **R-2A** | Document globals | frontmatter `writing` / `direction` / `align` | 縦書き / 横書き / RTL / LTR の writing matrix |
| **R-2C** | Caption formal | `:::figure` 内 `:caption:[text]{attrs}` | `^^^ caption` 等価、AI emit 用 |
| **R-2D** | Auto-ref self-closing | `:autoref:{id="fig1"}` | `[@fig1]` 等価、smart quote 対応 |
| **R-2E** | Paragraph align(物理)| `:::paragraph{align=left\|right\|center\|top\|bottom}` | 物理 align(formal-only、`<\|` の workaround) |
| **R-2F** | Section semantic / callout | `:::section{role=summary\|warning\|note\|tip\|caution\|important\|info\|danger}` | callout 表現(MkDocs / Material 風) |
| **R-2G** | Comment formal | `:::comment\n…\n:::` | `%%%` block comment 等価、attrs(`block=true` 等)は無視 |
| **R-2H** | Break formal | `:::break{kind=page\|rule role=…}` | `+++` / `---` 等価、kind=page で page break + role 指定 |

**設計原則**:reform 後は **simple 形を first**(人間が見たまま入力)、**formal 形は AI / 機械が emit する serializer**(round-trip 安全)。AI がテストデータを作る時は混在 OK。

### 1.6 ⚠ AI が生成しがちな formal 構文の受容方針

ChatGPT / Claude / Gemini 等の LLM は Pandoc / RST / Bootstrap / Tailwind / JSX / MDX 知識から **PKC2 でサポートされていない formal 構文** を hallucination で生成することがある。

**PKC2 の対応方針**(2026-05-10 確定、PR-2K + PR-2L):

1. **critical(HTML / CSS / framework component 想起、user が気付きにくい)**:**寛容 parse + parse log(PR-2L)**。 inline 4 件(`:lead:` `:spacing:` `:align:` `:quote:`)+ admonition alias 群(`:::note` 等)を受理し、`data-pkc-canonical` attribute + `console.info` で 3 つ組 hint(detected / interpretedAs / canonical)を emit。AI repair tool が round-trip 学習可能。
2. **less-critical(structural、user が即気付ける)**:**warning marker + console.warn(PR-2K)**。 block 3 件(`:::toc` `:::frontmatter` `:::body`)は literal を残しつつ橙背景で signaling。

#### 1.6.a 寛容 parse(PR-2L):critical inline 4 件 + admonition alias 群

| AI が生成する形 | 寛容 parse 後 | console.info code | canonical(推奨形) |
|----------------|--------------|-------------------|--------------------|
| `:lead:[content]` | `<span class="pkc-lead">content</span>` | `[PKC2005]` | 普通の段落として書く(`==content==` で強調も可) |
| `:spacing:{size=N}` | `<div class="pkc-blank-line pkc-tolerant-spacing">` | `[PKC2006]` | `_<N>`(L-8 blank-line marker、`_2` = 2 行空ける)|
| `:align:{position=X}` | `<span class="pkc-align-hint">[align: X]</span>` | `[PKC2007]` | 行頭 prefix `||`(center)/ `|>`(end)/ `<|`(start)または `:::paragraph{align=…}` |
| `:quote:{attribution=…}` | `<small class="pkc-attribution">— …</small>` | `[PKC2008]` | block `:::quote{author="…"} content :::` |
| `:::note` `:::warning` `:::tip` `:::info` `:::caution` `:::important` `:::danger` `:::summary` | `:::section{role=NAME}` alias | `[PKC2009]` | `:::section{role=…}` |
| `:::callout{type=X}` | `:::section{role=X}` alias | `[PKC2010]` | 同上 |
| `:::admonition{type=X title=Y}` | `:::section{role=X}` + `## Y` | `[PKC2011]` | 同上 |

各要素の `data-pkc-canonical` attribute に推奨形が転記される(DOM 走査で AI repair tool 取得可能)。

#### 1.6.b warning signaling(PR-2K):less-critical block 3 件

| AI が生成する形 | 状態 | 推奨形 |
|----------------|-----|--------|
| `:::toc{depth=N}` | ❌ 未実装 **+ PKC1010 signaling** | markdown heading(`# ## ###`)構造、TOC は別 feature |
| `:::frontmatter` | ❌ 未実装 **+ PKC1010 signaling** | YAML frontmatter `---` 囲み top で書く |
| `:::body` | ❌ 未実装 **+ PKC1010 signaling** | structural directive 不要、heading で region 表現 |

#### 1.6.c 過去実装済(simple/formal 等価)

| AI が生成する形 | 状態 | 推奨 simple 形(workaround)|
|----------------|-----|-------------------------|
| ~~`:::section{role=summary\|warning\|…}`~~ | ✅ **実装済(Phase 2 PR-2F、2026-05-10)** | 8 known role(summary / warning / note / tip / caution / important / info / danger)で callout、CSS で role 別 color scheme |
| ~~`:::comment\n…\n:::`~~ | ✅ **実装済(Phase 2 PR-2G、2026-05-10)** | `%%%` block comment 等価、attrs(`block=true` / `visibility=hidden` 等)は今のところ無視、render 完全削除 |
| ~~`:lead:[text]`~~ | ✅ **寛容 parse(Phase 2 PR-2L、2026-05-10)** | `<span class="pkc-lead">` で描画、canonical は普通段落 |
| ~~`:strong:[text]`~~ | ✅ **実装済(Phase 2 PR-2B、2026-05-10)** | `**text**` 等価、AI emit 用に formal 形提供 |
| ~~`:emphasis:[text]`~~ | ✅ **実装済(Phase 2 PR-2B)** | `*text*` 等価 |
| ~~`:code:[text]`~~ | ✅ **実装済(Phase 2 PR-2B)** | `` `text` `` 等価 |
| ~~`:strike:[text]`~~ | ✅ **実装済(Phase 2 PR-2B)** | `~~text~~` 等価 |
| ~~`:caption:[text]`~~ | ✅ **実装済(Phase 2 PR-2C、2026-05-10)** | `:::figure` block 内で行頭 `:caption:[…]` が `^^^ caption` 等価 |
| ~~`:quote:{attribution="…"}`~~ | ✅ **寛容 parse(Phase 2 PR-2L)** | `<small class="pkc-attribution">` で描画、canonical は block `:::quote{author=…}` |
| ~~`:align:{position=end}`~~ | ✅ **寛容 parse(Phase 2 PR-2L)** | `<span class="pkc-align-hint">[align: end]</span>`、canonical は `\|>` 等の行頭 prefix |
| ~~`:spacing:{size=2}`~~ | ✅ **寛容 parse(Phase 2 PR-2L)** | `<div class="pkc-tolerant-spacing">`、canonical は `_<N>` |
| ~~`:autoref:{id="fig1"}`~~ | ✅ **実装済(Phase 2 PR-2D、2026-05-10)** | `[@fig1]` 等価、ASCII / smart quote / unquoted 全形受理 |
| `:::toc` `:::frontmatter` `:::body` | ❌ warning signaling(PR-2K)| structural directive は markdown heading で表現 |
| `:strong:` `:emphasis:` 等 が parser fall-through すると?| `:strong:` は **literal text** として残る | parser は形式合致しない `:role:` を inline role として認識せず、L-6 simple-inline `:text:attrs:` パスへ fall-through する |

#### 1.6.y parse log 詳細(PR-2L、2026-05-10、寛容 parse + hint)

AI が `:lead:[content]` を生成すると、PKC2 は以下を emit する:

1. **render**:`<span class="pkc-lead" data-pkc-warn-code="PKC2005" data-pkc-warn-name="lead" data-pkc-canonical="普通の段落として書く(`==content==` で強調も可)" title="lead paragraph (寛容 parse)。(canonical: …)">content</span>`
2. **console.info**:`[PKC2005] tolerant alias :lead: accepted. detected=":lead:[content]" interpretedAs="lead-paragraph (large/styled first content)" canonical="普通の段落として書く(`==content==` で強調も可)"`

AI repair tool / test harness は以下で 3 つ組(detected / interpretedAs / canonical)を取得可能:

```ts
// Playwright で console.info を capture(寛容 parse PKC2005-2011)
page.on('console', (msg) => {
  if (msg.type() === 'info' && /\[PKC20(0[5-9]|1[01])\]/.test(msg.text())) {
    // tolerant alias accepted、parse log を AI に feedback
    //   "次は ==content== の simple 形で書くと round-trip 安全"
  }
});

// または rendered HTML から DOM 走査
document.querySelectorAll('[data-pkc-canonical]').forEach((el) => {
  console.log({
    code: el.getAttribute('data-pkc-warn-code'),
    name: el.getAttribute('data-pkc-warn-name'),
    canonical: el.getAttribute('data-pkc-canonical'),
  });
});
```

fenced code(`` ``` `` / `~~~`)内は寛容 parse 対象外(documentation 用途を保護)。

#### 1.6.z PR-2K warning signaling 詳細(less-critical block のみ)

`:::toc` `:::frontmatter` `:::body` は寛容 parse せず literal を残す:

- **visible marker**:`<div class="pkc-warning-hallucination-block" data-pkc-warn-code="PKC1010" data-pkc-warn-name="NAME">literal</div>`
- **console.warn**:`[PKC1010] hallucinated block directive :::NAME detected. Use … instead.`
- **CSS**:橙背景(`#fef3c7` / `#92400e` text)+ 左 border、tooltip で推奨形提示

### 1.6.x multi-line `[content]` 受理(2026-05-10、PR-2J)

ChatGPT 等 AI は inline role の content を **複数行に展開** する習慣があり、reform PR-2J で受理されるようになった:

```markdown
:emphasis:[
本作業中、一時的に監視系通信が停止する可能性があります
]

:strong:[
運転監視側への事前周知をお願いします
]

:::figure{id="topology-overview"}
![](image.png)
:caption:[
更新対象ネットワーク構成
]
:::
```

- `[content]` 内の改行(`\n`)は受理、blank line(`\n\n`)で reject(paragraph 境界)
- content は trim 済(先頭末尾 whitespace 削除)→ 単行と等価出力
- `:caption:[\n…\n]` も `:::figure` 内で multi-line 受理(複数行 caption は space で join)

**ただし以下の hallucination 形は引き続き未実装**(§1.6 deny list 参照、AI には引き続き使わないよう指示推奨)。

**現時点で AI が **生成して安全** な formal 形は §1.2 の allowlist + 既存 simple 形(§1.1)のみ**。それ以外は simple 形へ正規化する。

### 1.7 future Phase 候補(spec / 実装どちらも未確定)

以下は Phase 2 以降で議論される候補。AI は **生成しないこと**:

- ~~`:::section{role=...}`~~ ✅ **実装済(Phase 2 PR-2F)**:8 known role の callout
- `:::aside{type=note|warning|tip}`(callout、Pandoc 互換)
- ~~`:strong:` / `:emphasis:` / `:code:` / `:strike:`~~ ✅ **実装済(Phase 2 PR-2B)**:simple 形と完全等価、AI / serializer の formal emit 用
- ~~`:autoref:{id=...}`~~ ✅ **実装済(Phase 2 PR-2D)**:`[@id]` 等価、ASCII / smart quote / unquoted 全形受理
- ~~`:caption:[...]`~~ ✅ **実装済(Phase 2 PR-2C)**:`:::figure` 内で `^^^ caption` 等価
- inline `:quote:{attribution=...}`(`<q cite="…">`)

### 1.3 行頭マーカー共通規則

行頭の半角空白 / TAB / 全角空白(U+3000)はすべて strip して判定。`   |>` も `\t__段落` も `　_3` も有効。

### 1.4 廃止 / deprecated 記法(parser は引き続き受理、warning 表示)

| 旧 | 状態 | 新形 |
|---|-----|------|
| `[[em:傍点]]` | deprecated | `^^傍点^^` |
| `[[ruby:base\|読み]]` | deprecated | `[base\|読み]`(将来) |
| `<\|text` 物理左寄せ | reform 後 'end' に正規化 | 物理左は `:::paragraph{align=left}`(formal-only、Phase 2 PR-2E で実装済) |
| `^x^` superscript | 廃止予定 | `:sup:[x]` または math `$x^2$` |
| `~x~` subscript | 廃止予定 | `:sub:[x]` または math `$a_n$` |

### 1.5 frontmatter(optional)

```yaml
---
notation: pkc-markdown-1.0    # default、省略可
title: ドキュメントタイトル
author: 山田太郎
# document globals(reform Phase 2 PR-2A、2026-05-10 着地)
writing: horizontal           # horizontal | vertical(default horizontal)
direction: ltr                # ltr | rtl(default ltr)
align: left                   # horizontal: left|right|center / vertical: top|bottom|center
vars:
  product: "PKC2"
  version: "2.2"
notation_overrides:
  ruby: false                  # 個別機能 off も可能
---
```

- **notation profile**:`pkc-markdown-1.0`(default)/ `commonmark` / `gfm` / `pandoc` / `obsidian` / `pkc-markdown-experimental`
- **document globals**(2026-05-10):
  - `writing: horizontal | vertical` — CSS `writing-mode` 切替
  - `direction: ltr | rtl` — HTML `dir` 属性 + CSS `direction`、RTL は Arabic / Hebrew / 縦書き右起こし
  - `align: left | right | center | top | bottom` — 文書全体の default text-align
  - 不正組み合わせ(horizontal × top 等)は warning + default 復帰
- **vars.<key>**:本文中 `{{vars.<key>}}` で展開
- **size cap**:frontmatter は SOFT 16KB / HARD 1MB(超過時 parse 中止 + warning)

---

## 2. 各 markup の精密規約

### 2.1 L-1: Section break(改ページ / 章区切り)

```
+++
+++ {role=section}
+++ {role=cover}
```

- 行内容は `+++` のみ(空白除去後)。`role` 属性 optional。
- HTML: `<hr class="pkc-section-break" data-pkc-role="ROLE">`。default `auto`。
- Word / PPT export 時は role に応じて page break / slide separator にマップ。

### 2.2 L-2-a: Highlight(黄色マーカー)

```
本文中の ==重要== を強調。
==[red]赤マーカー== / ==[blue]青== / ==[#fde68a]hex== / ==[rgb(255,200,0)]rgb==
```

- inline 限定、`==`〜`==` 内に改行不可。
- HTML: `<mark>重要</mark>` / `<mark style="background-color:red">赤</mark>`。

### 2.3 L-2-b: Ruby(ふりがな)

```
[[ruby:漢字|かんじ]]
[[ruby:Tokyo|とうきょう]]
```

- `[[ruby:base|ruby]]` の 2 部構成。`|` は半角必須。
- HTML: `<ruby>漢字<rt>かんじ</rt></ruby>`。
- **deprecated:将来 `[base|読み]` 短縮形に移行**(parser は両形受理、deprecation 期間 ≥ 6 ヶ月)。

### 2.4 L-2-c: Em-dot(圏点 / 傍点)

```
^^重要^^                ← 2026-05 reform 後の正式形
[[em:重要]]             ← 旧形(deprecated)
```

- HTML: `<em class="pkc-em-dot">重要</em>` + `text-emphasis: dot`。
- 各文字上に点(縦書きでは右に点)。

### 2.5 L-3: Blockquote(commonmark 準拠)

```
> 単純な引用
> 複数行も
```

通常引用は GFM 通り。**著者付き / 複数 embed を纏めた引用は §2.13 R-D `:::quote` を使う**。

### 2.6 L-4: Comments(render 時に完全削除)

```
%% inline 隠しメモ %%
%%%
block 隠しメモ
複数行可
%%%
```

- inline `%%…%%` / block `%%%\n…\n%%%`。
- render 後の HTML には一切残らない(source dump にのみ存在)。

### 2.7 R-C: Align prefix(段落寄せ、reform-2026-05 PR-C)

```
|| 中央寄せ段落           ← center
|> 右寄せ canonical       ← end(LTR で右、RTL で左)
<| 右寄せ typo1           ← end(typo 寛容、|> と同じ)
|< 右寄せ typo2           ← end(同)
>| 右寄せ typo3           ← end(同)
通常段落                   ← 既定 flow
```

- HTML: `<p data-pkc-align="center">` / `<p data-pkc-align="end">`。
- CSS: `text-align: center` / `text-align: end`(logical value、`writing-mode` / `direction` 切替で自動 flip)。
- **reform 仕様**:`|>` 4 形(`|>` `<|` `|<` `>|`)は **全部 'end'** に正規化(typo 寛容、Postel's law)。
- 物理 left / right を強制したい場合は formal **`:::paragraph{align=left|right|center|top|bottom}` block directive**(Phase 2 PR-2E、2026-05-10 実装済)。formal-only、AI / serializer 用。
- **line scope contract(2026-05-09 hotfix)**:各 prefix 行は **独立 `<p>` paragraph**。継続行(prefix なし)は **default 段落として分離**される(同 align は伝播しない)。複数行を同 align にしたい場合は **各行に prefix を付ける**:
  ```
  |> 1 行目 end
  |> 2 行目 end(同 align、別 paragraph)
  prefix なし行 → default 段落、独立
  |> 4 行目 end
  ```

### 2.8 L-6: Simple inline(`:text:attrs:`)

```
:強調したい:bold:                       → <span style="font-weight:bold">…</span>
:大きい:lg:                             → <span style="font-size:1.25em">…</span>
:120%:120%:                            → <span style="font-size:120%">…</span>
:組合せ:bold,red,lg:                    → 太字+赤+大きい
:背景:bg-yellow,black:                  → 黄色背景+黒文字
```

vocabulary(順不同):
- `bold` / `italic` / `underline` / `strikethrough` / `code`
- `xs` / `sm` / `md` / `lg` / `xl` / `2xl` / `3xl`(em-based 相対 size)
- 自由値 size:`120%` / `1.5em` / `12px` / `0.75rem`
- 色:`red` / `#fde68a` / `rgb(...)` / `bg-…`(背景色)
- font-family:`serif` / `sans` / `mono`

未知 attr が混じると false で fall through(literal text として残る)。

### 2.9 L-7: Figure / Table / Equation block + 自動採番

```
:::figure{#fig-flow}
![flow](pkc://entry/x123)
^^^ システム全体のフロー
:::

参照は本文中で [@fig-flow] と書くと「図 1」と展開される。
```

- 開き行 `:::figure{#id}`、内容、`^^^ caption`(optional)、閉じ `:::`。
- HTML: `<figure class="pkc-fig" id="…"><figcaption class="pkc-fig-caption">図 N caption</figcaption>…</figure>`。
- `:::table{#id}` / `:::equation{#id}` も同様、auto-numbered。
- 本文参照 `[@id]` → `<a class="pkc-fig-ref" href="#id">図 1</a>`。

### 2.10 L-8: Blank-line marker(縦余白の明示)

```
段落 1
_
段落 2(1 空行 = 1em 縦 spacing)

段落 3
_3
段落 4(3 空行)

_50
最大 50 行(reform 後 cap raise、印刷組版 / page break 用途)

_100
↑ N>50 は cap=50 + 視認警告表示「⚠ _100 (上限 cap)」
```

- 行頭 `_` / `_<N>`(**N=1〜50**、reform-2026-05 で 20→50 に raise)
- 連続テキストの間に意図した縦余白を持たせる。
- N が 50 を超えた場合、cap=50 が適用され、blank line の上に **視認できる警告**(⚠ _N (上限 cap))が表示される(silent fail を avoid)。

### 2.11 L-9: Paragraph indent(段落先頭 1 字下げ)

```
__段落の先頭を 1 字分インデントする。
　＿全角アンダースコアでも同等。
```

- 行頭 `__`(半角×2)or `＿`(全角 U+FF3F)。
- HTML: `<p data-pkc-indent="1" style="text-indent: 1em">…</p>`。

### 2.12 M-7: Variables `{{vars.x}}`

```yaml
---
vars:
  product: "PKC2"
  version: "2.2.0"
---
```

```
{{vars.product}} version {{vars.version}} のリリースノート。
```

- frontmatter `vars.<key>` で定義(値は string)。
- 本文中 `{{vars.<key>}}` で展開。
- 未定義変数は `<span class="pkc-variable-undefined" title="未定義変数: vars.x">{{vars.x}}</span>`。
- `\{{vars.x}}` で escape literal。

### 2.13 R-D: Quote citation block(reform-2026-05 PR-D)

```markdown
:::quote{author="Smith" year=2020}
本文の引用テキスト。
:::

:::quote{author="Tanaka" year=2024 source="pkc://main/origin"}
別の引用本文。==重要== な部分も含む。

複数 paragraph も保持される。
:::

:::quote{#cite-1 .important author="Yamada"}
`#id` / `.class` / boolean flag 全部受理。
:::
```

- `:::quote{attrs}` 〜 `:::` block、attrs は Pandoc style(`#id` `.class` `key=v` `flag`)。
- HTML: `<blockquote class="pkc-quote-citation" data-pkc-quote-author="…" data-pkc-quote-year="…">…</blockquote>`。
- attrs は **全 kv** が `data-pkc-quote-<key>="…"` に展開(author / year / source / page / volume etc.)。
- 内部 content は通常 markdown render(highlight / em-dot / 段落 等保持)。
- XSS:author 値内 `<` `>` `&` `"` は HTML escape。
- 閉じ `:::` 無しでも EOF まで content として処理(parser tolerance)。

### 2.14 R-E: Inline role(formal、reform-2026-05 PR-E)

```markdown
本文中の :sup:[2]                       → <sup>2</sup>
水分子 H:sub:[2]O                       → <sub>2</sub>
:span:[警告]{class=warn}                → <span class="warn">警告</span>
:span:[refs]{#cite-1 data-key=val}      → <span id="cite-1" data-key="val">refs</span>
:span:[multi]{class="a b" title="hint"} → <span class="a b" title="hint">multi</span>
```

- `:role:[content]{attrs}` / `:role:[content]` / `:role:{attrs}` の 3 形。
- 対応 role(Phase 1):
  - `:sup:[…]` → `<sup>`(superscript)
  - `:sub:[…]` → `<sub>`(subscript)
  - `:span:[…]{…}` → `<span>`(汎用)
- `:span:` の attrs allowlist:`class` / `id`(via `#id`) / `title` / `lang` / `dir` / `data-*`。
- **XSS skip**:`style` / `onclick` 等 unknown attrs は silent skip。
- **content は plain text 扱い**(Phase 1 制約、nested markdown は後続 PR で促進)。
- L-6 simple-inline `:text:attrs:` との衝突:`:role:` の後に `[` または `{` がある場合のみ inline role として match、それ以外は L-6 へ fall-through。

### 2.15 R-F: Conditional block(formal、reform-2026-05 PR-F)

```markdown
:::if{format=html}
HTML render 時のみ表示される本文。
:::

:::if{format=docx}
DOCX export 時のみ表示。HTML render では完全に消える。
:::

:::if
format 省略は **always match**(plain wrapper として効く)。
:::

:::if{format=html}
:::quote{author=Inner}
nested directive も OK(depth tracking で正しく処理)。
:::
:::
```

- target format に match した時のみ content が render される。
- PKC2 の HTML renderer では target='html' 固定(export 系で別 format dispatch 拡張余地あり)。
- format mismatch 時は **content 全部 strip**(空行に置換、line count 維持で Split View 行ズレ回避)。
- nested `:::name{attrs}` 対応(directive depth tracking)。
- fenced code block(``` / ~~~)内の `:::if` は marker 扱いしない。

---

## 3. AI 向け執筆判断ガイド(when-to-use)

### 3.1 「強調したい」とき

| 強さ | markup | 例 |
|------|--------|-----|
| 黄色マーカー | `==text==` | `==重要==な点` |
| 色付きマーカー | `==[red]text==` | `==[blue]情報==` |
| 圏点(縦書きで効果的)| `^^text^^` | `^^必読^^` |
| 太字 | `**text**` | `**緊急**` |
| 太字+色+大 | `:text:bold,red,lg:` | `:警告:bold,red,lg:` |
| 上下付き | `:sup:[…]` `:sub:[…]` | `H:sub:[2]O` `e=mc:sup:[2]` |

### 3.2 「段落の見た目を整えたい」とき

| 寄せ | markup |
|------|-------|
| 中央 | 行頭 `\|\|`(simple)/ `:::paragraph{align=center}`(formal) |
| 右(LTR の場合)| 行頭 `\|>` または typo 3 形(`<\|` `\|<` `>\|`、全部 end) |
| 物理 left / right 強制 | `:::paragraph{align=left}` / `{align=right}`(formal-only、Phase 2 PR-2E 実装済) |
| 縦書き top / bottom | `:::paragraph{align=top}` / `{align=bottom}`(formal-only、`writing: vertical` と組み合わせ) |
| インデント | 行頭 `__` / `＿` |
| 縦余白 | `_` `_3` |

### 3.3 「図表 / 引用を入れたい」とき

| 用途 | markup |
|------|-------|
| 単純引用 | `> text`(commonmark) |
| **著者付き引用 / 複数 embed まとめ** | `:::quote{author="…" year=…} … :::` |
| 図 + 自動採番 | `:::figure{#id} … ^^^ caption :::` + `[@id]` |

### 3.4 「メモを残したい(render に出さない)」とき

```
%% inline メモ %%

%%%
block メモ
複数行
%%%
```

### 3.5 「format 別に本文を切り替えたい」とき

```
:::if{format=html}
HTML preview / web render での見た目最適化本文
:::

:::if{format=docx}
Word export 時の段落構成
:::

:::if{format=markdown}
markdown source export 時の本文
:::
```

### 3.6 「同じ文書を宛先 / 用途別の variant にしたい」とき(M-7 variables)

```yaml
---
vars:
  customer: "ACME 社"
  date: "2026-05-15"
---
```

```
{{vars.customer}} 様

ご依頼の件、{{vars.date}} までに納品いたします。
```

### 3.7 「日本語文書として整える」とき(典型 pattern)

```
__本文の冒頭は 1 字下げ。

__次の段落も 1 字下げ。^^重要^^な点を強調。==[blue]補足== は色マーカーで。

|| 中央寄せのキャッチコピー
_
|> 右寄せの署名(end)

%%%
内部メモ:配布前に上司レビュー必須。
%%%
```

---

## 4.2 ```html-render fence(HTML sandbox 描画、PR-2M)

AI が「複雑 layout / SVG / interactive widget は HTML 生成の方が render が綺麗」と判断した場合、`html-render` info string で iframe sandbox 経由の seamless 描画が可能:

````markdown
```html-render
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
  <article>左カラム</article>
  <article>右カラム</article>
</div>
```
````

→ `<iframe class="pkc-html-render" sandbox="allow-scripts" srcdoc="…">` で描画。

### セキュリティ規約(PR-2M)

| 項目 | 設計 |
|------|------|
| iframe sandbox | `sandbox="allow-scripts"` のみ。`allow-same-origin` は付けず cross-origin 隔離、parent の localStorage / cookie / IndexedDB へのアクセス不可 |
| CSP meta(auto inject) | `default-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; script-src 'unsafe-inline'` — 外部 fetch / 再帰 iframe / 外部 script src すべて拒否 |
| referrerpolicy | `no-referrer`、外部 URL に referrer 漏洩しない |
| auto-resize | iframe 内 ResizeObserver で height を計算、`postMessage({type:'pkc-html-render-resize', id, height})` で parent に通知、cap 5000px |
| loading | `loading="lazy"`、scroll 外 iframe は遅延 load |

### 推奨用途

- 複雑 grid / flex layout(段組レポート、ダッシュボード)
- SVG / canvas / mermaid 以外の vector graphics
- A4 印刷組版(`@page` + `@media print` を iframe 内 CSS で完結)
- 装飾的な interactive widget(button hover / animation)

### 非推奨用途

- 単純な見出し / 段落 → 通常 markdown を使う
- 外部 fetch / API call → CSP で拒否される
- iframe を入れ子にする → CSP `frame-src 'none'` で拒否

通常の \`\`\`html(without `-render`)は引き続き code block として escape 表示される(誤発火防止)。

---

## 4. やってはいけないこと

| ❌ NG | 理由 |
|-------|------|
| `<div>` `<style>` 等 inline HTML(本文) | `html: false`、escape されてリテラル表示。複雑 layout が必要なら \`\`\`html-render fence(§4.2、PR-2M) |
| `[[em:..]]` を新規生成 | deprecated、`^^..^^` を使う |
| `<\|text` を「物理左寄せ」として使う | reform で 'end' に正規化(LTR で右寄せ)、物理左は formal-only |
| `:role:[…]` で未知 role 名 | PR-E は sup / sub / span のみ、それ以外は L-6 fall-through で literal 残る |
| `:span:[…]{style="…"}` | XSS allowlist 外、silent skip される |
| frontmatter で巨大 nested(>16KB) | size cap 超過、parse 中止 + warning |
| commonmark 標準と競合する独自 syntax | 例:行頭 `>>>` / `===` / `~~~~` 等は parser 衝突 |

---

## 5. AI が markdown を返す前のチェックリスト

1. [ ] inline HTML(`<div>`, `<span>` 直書きなど)を含めていないか
2. [ ] 行頭マーカー(`||` `|>` `__` `_` `:::` 等)が **必ず行頭** にあるか(全角空白 / TAB は許容)
3. [ ] `:::` block(figure / quote / if)の **閉じ `:::` がある** か(EOF tolerance はあるが推奨 close)
4. [ ] L-2 highlight `==`〜`==` が同 1 行内で完結しているか
5. [ ] `:::quote` の attrs `author="…"` 等で **`"` を escape していない** か(`\"` 不要、parseBlockDirectiveAttrs が unquote)
6. [ ] `:role:[…]{…}` の `[` `]` `{` `}` が balanced か
7. [ ] `{{vars.x}}` の `x` が frontmatter で定義済みか(未定義は visible warning に展開される)
8. [ ] `:::if{format=docx}` 内に重要本文を入れていないか(format mismatch で完全 strip)
9. [ ] deprecated `[[em:..]]` `[[ruby:..]]` を使っていないか(parser は受理するが warning)
10. [ ] 全体長が極端に大きくないか(body soft cap 256KB)

---

## 6. 例:複合 fixture(典型 PKC entry の AI 生成例)

### 6.1 短文メモ(plain to markdown)

```markdown
__短いメモ。^^重要^^なのは ==決定事項== のみ。

|> 右寄せ署名(2026-05-09)
```

### 6.2 中規模ドキュメント(reform 機能フル活用)

```markdown
---
notation: pkc-markdown-1.0
title: API 仕様変更案
author: 山田太郎
vars:
  product: "PKC2 API"
  version: "v2.3"
---

# {{vars.product}} {{vars.version}} 変更案

## 1. 概要

__{{vars.product}} は ==[red]breaking change== を含む。

|| 重要:必ず読んでください
_

## 2. 変更内容

公式は :sup:[*1] 参照。引用元は次。

:::quote{author="Smith" year=2025 source="https://example.com/spec"}
The API change introduces breaking semantics for `v2.3`.

==Backward compatibility== will be deprecated by Q3 2026.
:::

## 3. 数式

水分子は H:sub:[2]O、運動エネルギーは E = mc:sup:[2]。

:::figure{#fig-arch}
![architecture](pkc://main/arch-diagram)
^^^ 新アーキテクチャ概要
:::

詳細は [@fig-arch] 参照。

## 4. format 別 export

:::if{format=html}
HTML preview:本セクションは web 上で表示される。
:::

:::if{format=docx}
DOCX export:本セクションは Word 出力にのみ含まれる。
:::

%% 内部メモ:Q2 レビュー時に法務チェック必須 %%

%%%
block 内部メモ
- 担当者:山田
- 期限:2026-06-01
- レビュアー:佐藤、鈴木
%%%

|> 起案者:山田太郎
```

### 6.3 長大ドキュメント(scroll / 段落ストレステスト)

```markdown
# 長大ドキュメント

## §1 イントロ

__本文 1。^^重要^^ ==[red]色付き== :sup:[1] :sub:[a] :span:[警告]{class=warn}。

__本文 2。混在マークアップの組み合わせテスト。

(以降、上記 pattern を 30+ 段落繰り返し、reform 全機能を共存させる)

|| 中央寄せ
|> end 寄せ canonical
<| end 寄せ typo1
|< end 寄せ typo2
>| end 寄せ typo3

:::quote{author="A"}
quote 1
:::

:::quote{author="B" year=2020}
quote 2 with year
:::

:::if{format=html}
:::quote{author="Nested"}
nested in if
:::
:::

:::figure{#fig-1}
^^^ figure caption
:::

参照: [@fig-1]
```

### 6.4 plain text(markdown 構文を意図的に含めない)

```
これは markdown を含まない単純なテキスト。
複数行可、しかし markdown 構文は何も適用されない。
```

→ HTML render 経路ではなく plain `<pre>` で表示。`hasMarkdownSyntax` が false を返すため。

### 6.5 textlog(複数行 log 形式)

```
2026-05-09 10:00 朝の作業開始
2026-05-09 10:30 ==重要== な決定事項を整理
2026-05-09 11:00 ^^必読^^ section 完了
2026-05-09 14:00 |> 右寄せメモ
2026-05-09 15:00 :sup:[1] 注釈付きの記録
```

各行が独立 log entry として扱われる(textlog archetype)。

---

## 7. AI がテストデータを生成する時のレシピ集

### 7.1 全 archetype 網羅(text / textlog / todo / form / attachment / folder / generic)

| archetype | body 形式 |
|-----------|----------|
| text | markdown body(本書のすべての markup 適用)|
| textlog | 複数行(各行 = 1 log entry、markdown は各行内で適用) |
| todo | JSON `{ status, description, date?, archived? }`(markdown 適用は description にのみ) |
| form | JSON form structure |
| attachment | meta JSON + asset 参照 |
| folder | 子 entry 参照 list |
| generic | free-form text |
| opaque | binary / 不明形式 |

### 7.2 reform 機能を端から端まで網羅したい時

```markdown
# reform 全機能 fixture

## R-C 4 形 align
|| center
|> end1
<| end2
|< end3
>| end4

## R-D quote citation
:::quote{author="A" year=2020}
quote A
:::

:::quote{author="B" #cite-2}
quote B with id
:::

## R-E inline role
sup :sup:[2] sub :sub:[n] span :span:[ok]{class=ok #s1 data-x=y}

## R-F conditional
:::if{format=html}
html-only
:::

:::if{format=docx}
docx-only(stripped in html)
:::

## 既存機能 regression
==hi== / [[em:em]] / ^^em-new^^ / [[ruby:漢|か]] / :foo:bold:

:::figure{#f1}
^^^ caption
:::

ref: [@f1]

## scroll stress(20+ paragraph)

(20+ 段落、各々 reform + 既存 markup を混在)
```

### 7.3 edge case を狙う時

| edge | 期待される挙動 |
|------|--------------|
| `:::quote` で閉じ `:::` 無し | EOF まで content、parser tolerance |
| `:::if{format=html}` 内 `:::quote` nested | depth tracking で正しく処理 |
| 長大 author 名(>200 文字)| そのまま data-pkc-quote-author に escape |
| author に `<script>` | `&lt;script&gt;` に escape、XSS 防止 |
| fenced code 内の `:::if{}` `:::quote{}` | marker 扱いしない、literal 残る |
| inline code `` `:sup:[x]` `` | inline role 化しない、literal 残る |
| 4 形 align 連続 4 行 | 4 paragraph 独立(merge しない) |
| frontmatter 16KB 超過 | parse 中止 + warnings |
| 未定義 `{{vars.x}}` | `<span class="pkc-variable-undefined">` で warning 表示 |

---

## 8. version policy

- **v1**: 2026-05-08(L-1〜L-9 + M-7 着地時点)
- **v2**: 2026-05-09(reform-2026-05 Phase 1 着地、本書)
- 後方互換は parser 側で **deprecation 期間 ≥ 6 ヶ月** で維持
- 本書を AI に渡す時は本書のみで完結、他 spec を読む必要なし

---

## 9. 参照(human 向け補足を読みたいとき)

- 設計議論 / IR / 移行計画:`docs/development/notation-redesign-2026-05/` 12 章 doc set
  - `01-notation-catalog.md`:全 50+ 記法一覧
  - `02-frontmatter-and-globals.md`:profile / vars / size cap
  - `03-link-embed-card.md` §3.5:quote citation 詳細
  - `07-security-stance.md`:HTML off / cap / URL allowlist
- v1 doc(historical):`docs/spec/markdown-dialect-for-ai-authors-v1.md`
- reform 完了時に v3(IR persist + cross-PKC 互換)を起こす予定(post-reform Phase Z)
