# PKC2 Markdown 方言:AI 書き手向け規約書 v3

**Audience**: AI(LLM)が PKC2 entry の `body` を生成する際の規約書、特に **テストデータ生成** + **業務文書生成** 用途を想定。
**Reader**: 機械的に処理する LLM。可読性は保つが、構造化と非曖昧化を優先。
**Companion(human-oriented)**: `docs/manual/12_マークダウン拡張記法.md`(末端 user 用)+ `docs/development/notation-redesign-2026-05/`(設計議論)
**Status**: ✅ **canonical**(2026-05-12 promoted、reform-2026-05 Phase 3 wave 16 PR 完了 + AST 公開 API 着地)
**⚠️ Successor draft あり**: 人間向け完全 spec v4 ([`pkc-markdown-complete-spec-v4.md`](./pkc-markdown-complete-spec-v4.md)、2026-05-25 起草、AI 規約 v3 / 設計議論 12 章 / block format spec / IR spec を 1 doc に統合、87 項目早見表 + future 装飾箱提案 + Q1-Q6 未決)。Q1-Q6 user 判断 + block format wrapper 実装着地後、v4 を canonical promote + 本 v3 は AI 向け v4(別 doc)起草と同 commit で archive 候補に。
**Version**: v3(supersedes v2、2026-05-09 起草、2026-05-12 promoted to canonical)
**Phase 反映**: Phase 1(L-1〜L-9 + M-7)+ Phase 2(R-2A〜R-2Q、寛容 parse + html-render + 段組組版)+ Phase 3(IR migration AstDocument 経路 + WCAG resolver + theme switching + AST 公開 API)
**Supersedes**: `markdown-dialect-for-ai-authors-v2.md`(2026-05-09 〜 2026-05-12、v3 promoted で archive 候補)
**AST API**: [`docs/spec/public-ast-api-for-ai.md`](./public-ast-api-for-ai.md)(PR-2GG で着地、`window.PKC.ast` namespace から parseMarkdown / renderHtml / canonicalize / toPandocJson 6 関数を expose)

---

## 0. 使い方(AI が読むときの行動規約)

1. **このファイル単体で完結する**。他 spec を参照しなくても本文書通りに書けば PKC2 が正しく render する。
2. **commonmark + GFM(table / strikethrough / task list) + linkify + typographer** が base。本書はその上の PKC 独自拡張(simple 形 + formal 形 + 寛容 parse alias)を定義。
3. **記法には 3 階層ある**:
   - **simple 形**(人間が日常 typing する短い形、本書 §2 の各記法の `simple:` 行)── default、AI も基本これを使う
   - **formal 形**(機械 emit 用の厳密形、`:::name{attrs}` block / `:role:[content]{attrs}` inline)── round-trip / IR 安全、AI が自動生成する場合に推奨
   - **寛容 alias**(PR-2L、Postel's Law)── AI が hallucinate しがちな形(`:::note` / `:lead:[…]` 等)を寛容 parse + canonical hint log で受理
4. **不確実な markup は使わない**。本書に未記載の構文は使わず、§1.6 deny list 参照。
5. **inline HTML は禁止**。PKC2 の markdown engine は `html: false`(XSS 防止)。複雑 layout / SVG が必要なら `` ```html-render `` fence(§4.2、PR-2M)で iframe sandbox 経由 render 可能。
6. **frontmatter は省略可**。普通の user は触らない。AI が profile 切替 / 変数定義 / layout 指定する時だけ書く(§1.5)。
7. **寛容 alias は警告**:AI が `:::note` 等を書くと PKC2 は寛容 parse するが `console.info` で canonical 形(`:::section{role=note}`)を hint。AI repair tool はこの 3 つ組(detected / interpretedAs / canonical)で round-trip 学習可能(§1.6.y)。
8. **2026-05-12 以降の Phase 3 機能**(WCAG 自動 contrast 探索 / theme 切替整合 / IR migration)は本書で予告のみ、実装後に正規追記。

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
| L-2-c | Em-dot(圏点) | `^^重要^^`(reform 後)/ `[[em:重要]]`(deprecated) | 各文字上に点。PR-2P で内 nested markdown 対応(`^^**bold**^^` 等)|
| L-3 | Blockquote 通常 | `> text` | 引用(commonmark 準拠) |
| L-4-a | Comment(inline) | `%% hidden %%` | 完全削除されるメモ |
| L-4-b | Comment(block) | `%%%\n...\n%%%` | 複数行コメント |
| **R-C** | Align prefix(reform 後)| 行頭 `\|\|`(center)/ `\|>` `<\|` `\|<` `>\|`(全部 end、4 形 typo 寛容)| 段落の中央 / end 寄せ |
| L-6 | Simple inline | `:text:attrs:` | inline 装飾(色 / 太字 / size 等) |
| L-7-a | Figure block | `:::figure{#id}\n...\n^^^ caption\n:::` | 図 + 自動採番 |
| L-7-b | Figure ref | `[@id]` | 図 / 表 / 式の本文中参照 |
| L-8 | Blank-line marker | 行頭 `_` または `_<N>`(N=1〜50)| 縦余白の明示 |
| L-9 | Paragraph indent | 行頭 `__`(半角×2)/ `＿`(全角)| 段落先頭 1 字下げ |
| M-7 | Variables | frontmatter `vars.x` + 本文 `{{vars.x}}` | 文書内変数展開 |

### 1.2 formal 形(reform-2026-05 Phase 1+2 で実装済 allowlist)

| ID | 名称 | formal 構文 | Phase | 用途 |
|----|-----|---------|------|------|
| **R-D** | Quote citation block | `:::quote{author="…" year=…} content :::` | 1 | 著者付き引用、複数 embed をまとめる |
| **R-E-1** | Superscript inline | `:sup:[2]` | 1 | 上付き(`x^2` 等)|
| **R-E-2** | Subscript inline | `:sub:[n]` | 1 | 下付き(`a_n` 等) |
| **R-E-3** | Span inline + attrs | `:span:[text]{class=… #id data-key=…}` | 1 | 一般 inline span |
| **R-F** | Conditional block | `:::if{format=html\|markdown\|docx} content :::` | 1 | format 別本文 |
| **R-2A** | Document globals | frontmatter `writing` / `direction` / `align` / `layout` | 2 | 縦書き / RTL / **段組組版(`a4-2col` 等 9 種)** |
| **R-2B-1〜4** | Strong / Emphasis / Code / Strike formal | `:strong:[text]` / `:emphasis:[text]` / `:code:[text]` / `:strike:[text]` | 2 | `**text**` 等価、AI emit 用 |
| **R-2C** | Caption formal | `:::figure` 内 `:caption:[text]{attrs}` | 2 | `^^^ caption` 等価 |
| **R-2D** | Auto-ref self-closing | `:autoref:{id="fig1"}` | 2 | `[@fig1]` 等価、smart quote 対応 |
| **R-2E** | Paragraph align(物理)| `:::paragraph{align=left\|right\|center\|top\|bottom}` | 2 | 物理 align、formal-only |
| **R-2F** | Section semantic / callout | `:::section{role=summary\|warning\|note\|tip\|caution\|important\|info\|danger}` | 2 | 8 role callout(MkDocs / Material 風)|
| **R-2G** | Comment formal | `:::comment\n…\n:::` | 2 | `%%%` block comment 等価 |
| **R-2H** | Break formal | `:::break{kind=page\|rule role=…}` | 2 | `+++` / `---` 等価 |
| **R-2M** | HTML sandbox fence | `` ```html-render``` | 2 | 複雑 layout / SVG を iframe sandbox で描画 |

**設計原則**:reform 後は **simple 形を first**(人間が見たまま入力)、**formal 形は AI / 機械が emit する serializer**(round-trip 安全)。

### 1.3 寛容 alias(Postel's Law、PR-2L 2026-05-10)

AI が hallucination しがちな形を実 render path に格上げ、`console.info` で 3 つ組 hint(detected / interpretedAs / canonical)を emit。AI repair tool は DOM の `data-pkc-canonical` attr or console から canonical 形を学習可能。

| AI が生成する形 | 寛容 parse 後 | console.info code | canonical(推奨形)|
|----------------|--------------|-------------------|------|
| `:lead:[content]` | `<span class="pkc-lead">content</span>` | `[PKC2005]` | 普通の段落 + `==content==` 等 |
| `:spacing:{size=N}` | `<div class="pkc-blank-line pkc-tolerant-spacing">` | `[PKC2006]` | `_<N>`(L-8)|
| `:align:{position=X}` | standalone:次段落 align 適用(PR-2O)。inline:hint chip(default 非表示)| `[PKC2007]` | 行頭 prefix `\|\|`(center)/ `\|>`(end)/ `<\|`(start)|
| `:quote:{attribution=…}` | `<small class="pkc-attribution">— …</small>` | `[PKC2008]` | block `:::quote{author="…"} content :::` |
| `:::note` `:::warning` `:::tip` `:::info` `:::caution` `:::important` `:::danger` `:::summary` | `:::section{role=NAME}` alias | `[PKC2009]` | `:::section{role=…}` |
| `:::callout{type=X}` | `:::section{role=X}` alias | `[PKC2010]` | 同上 |
| `:::admonition{type=X title=Y}` | `:::section{role=X}` + `## Y` | `[PKC2011]` | 同上 |

各要素の `data-pkc-canonical` attribute に推奨形が転記される(DOM 走査で AI repair tool 取得可能)。

### 1.4 warning signaling(PR-2K 2026-05-10、Phase 3 で `:::toc` 等の正式実装後解消)

structural directive(user が即気付ける category)は寛容 parse せず warning marker:

| AI が生成する形 | 状態 | 推奨形 |
|----------------|-----|--------|
| `:::toc{depth=N}` | ❌ 未実装 **+ PKC1010 signaling**(Phase 3 PR-2V で正式実装予定)| 現状 markdown heading 構造、PR-2V 後は formal block |
| `:::frontmatter` | ❌ 未実装 **+ PKC1010 signaling**(Phase 3 PR-2W で正式実装予定)| 現状 YAML frontmatter、PR-2W 後は region marker |
| `:::body` | ❌ 未実装 **+ PKC1010 signaling**(Phase 3 PR-2W で正式実装予定)| 同上 |

### 1.5 frontmatter(optional)

```yaml
---
notation: pkc-markdown-1.0    # default、省略可
title: ドキュメントタイトル
author: 山田太郎
# document globals(R-2A、2026-05-10 着地)
writing: horizontal           # horizontal | vertical(default horizontal)
direction: ltr                # ltr | rtl(default ltr)
align: left                   # horizontal: left|right|center / vertical: top|bottom|center
layout: a4-2col               # PR-2N、9 種:a4/b5/letter/legal × 1col/2col/3col
vars:
  product: "PKC2"
  version: "2.2"
notation_overrides:
  ruby: false                 # 個別機能 off も可能
---
```

- **notation profile**:`pkc-markdown-1.0`(default)/ `pkc-markdown-1.0-ai-safe`(PR-2I)/ `commonmark` / `gfm` / `pandoc` / `obsidian` / `pkc-markdown-experimental`
- **document layout**(PR-2N):用紙 4 種 × 段組 1/2/3 = 9 種。screen で card 表示、@media print で paper 出力
- **size cap**:frontmatter は SOFT 16KB / HARD 1MB

### 1.6 廃止 / deprecated 記法(parser は引き続き受理、warning 表示)

| 旧 | 状態 | 新形 |
|---|-----|------|
| `[[em:傍点]]` | deprecated | `^^傍点^^` |
| `[[ruby:base\|読み]]` | deprecated | `[base\|読み]`(将来) |
| `<\|text` 物理左寄せ | reform 後 'end' に正規化 | 物理左は `:::paragraph{align=left}`(R-2E) |
| `^x^` superscript | 廃止予定 | `:sup:[x]` または math `$x^2$` |
| `~x~` subscript | 廃止予定 | `:sub:[x]` または math `$a_n$` |

---

## 2. AI のための実用ガイド

### 2.1 「迷ったらこれ」推奨パターン

| user 要求 | AI が書くべき markdown |
|----------|---------------------|
| 強調 | `**bold**`(simple)、formal なら `:strong:[bold]`、両者は等価 |
| 注意喚起 | `:::section{role=warning}\n注意内容\n:::`(8 role 選択肢)|
| 図 + 参照 | `:::figure{#fig1}\n![](url)\n:caption:[図タイトル]\n:::` + 本文中 `[@fig1]` |
| 段組レポート | frontmatter `layout: a4-2col` を追加 |
| 複雑 HTML(SVG / grid)| `` ```html-render \n<svg>...</svg>\n``` `` |
| inline 注釈 / 圏点 | `^^本文^^`(`<em class="pkc-em-dot">`、内部 markdown 効く)|
| variables 展開 | frontmatter `vars: site: 渋谷` → 本文 `{{vars.site}}` |
| AI hallucinate しがちな admonition | `:::note ...` でも OK(PR-2L で `:::section{role=note}` に rewrite)|

### 2.2 fixture 生成 prompt template

LLM(ChatGPT / Claude / Gemini)に渡す prompt:

```
PKC2 markdown 方言(`docs/spec/markdown-dialect-for-ai-authors-v3.md` の §2.1 推奨パターン参照)で、
[X] な fixture を [N 文字 / N 行]書いてください。

必須要素:
- frontmatter で vars 定義 + layout 指定
- `:::section{role=…}` で章構造
- `:::figure{#…}` + `:caption:[…]` で図表
- inline 装飾(`**bold**` / `==hl==` / `^^em-dot^^`)を混在
- 必要なら `` ```html-render `` で複雑 layout

避けるもの(deny list):
- inline HTML(`<div>` 等)
- `:::toc` `:::frontmatter` `:::body`(未実装 deny list)
- 非対応 formal 形(`:lead:` 等は寛容 parse されるが推奨は普通段落)
```

### 2.3 寛容 alias を AI が自己 correct する loop

`data-pkc-canonical` attr / `console.info` で hint を取得:

```ts
// DOM 経路:render 後の document を走査
document.querySelectorAll('[data-pkc-canonical]').forEach((el) => {
  const code = el.getAttribute('data-pkc-warn-code');
  const detected = el.getAttribute('data-pkc-warn-name');
  const canonical = el.getAttribute('data-pkc-canonical');
  console.log({ code, detected, canonical });
  // AI:次回 emit 時に canonical 形を使う(round-trip 学習)
});

// console.info 経路:Playwright / Puppeteer 経由
page.on('console', (msg) => {
  if (msg.type() === 'info' && /\[PKC2(00[5-9]|01[01])\]/.test(msg.text())) {
    // tolerant alias accepted、AI repair instruction
  }
});
```

---

## 3. Phase 3 予告(2026-05-12 設計、後日実装で本書追記)

### 3.1 WCAG 自動 contrast 探索(PR-2T 予定)

- Tier 0 flag `theme.wcag_auto_shift`(default ON)
- 背景 × 前景の組合せが AA(4.5:1)未達なら、同系色 shift で自動補正
- deterministic(同じ組合せ → 同じ shift)
- 設定通りの色にしたいなら Flag で OFF
- 詳細:`docs/development/completed/wcag-contrast-resolver-spec.md`

### 3.2 theme 切替整合(PR-2S 予定)

- system theme 切替(`prefers-color-scheme`)で mermaid graph / 右ペイン TOC / PIP popup が全部追従
- `:root` で `color-scheme: light dark` + `@media (prefers-color-scheme: dark)` で variable override
- popup は opener から theme 継承 + 自身でも matchMedia listen
- 詳細:`docs/development/completed/theme-switching-consistency-audit.md`

### 3.3 IR migration(PR-2Y/2Z/2AA/2BB 予定、可換世界拡大)

- `parseMarkdownToAst()` + `renderAstToHtml()` 整備、`renderMarkdown()` 内部を IR 経由に置換
- canonicalize(simple → formal、idempotent)
- Pandoc filter JSON 出力 → Word / PPT / PDF / LaTeX / ePub 経路
- 詳細:`docs/development/completed/ir-migration-plan-2026-05.md`

### 3.4 `:::toc` / `:::frontmatter` / `:::body` 正式実装(PR-2V/2W 予定)

- `:::toc{depth=N}` を `renderStaticTocHtml` 流用で実装、heading 自動採番
- `:::frontmatter` / `:::body` は rich-copy / Pandoc export 用 region marker(render は no-op wrapper)
- これで PKC1010 deny list を完全消化

---

## 4. やってはいけないこと(deny list)

| ❌ NG | 理由 | 推奨 |
|-------|------|------|
| `<div>` `<style>` 等 inline HTML(本文) | `html: false`、escape されてリテラル表示 | 複雑 layout は `` ```html-render `` fence(§4.2)|
| `[[em:..]]` を新規生成 | deprecated | `^^..^^` |
| `<\|text` を「物理左寄せ」として使う | reform で 'end' に正規化 | 物理左は `:::paragraph{align=left}`(R-2E)|
| `:role:[…]` で未知 role 名 | implementation 形式不一致 → fall-through | §1.2 allowlist 内で書く、`:strong:` `:emphasis:` `:code:` `:strike:` `:caption:` `:autoref:` `:sup:` `:sub:` `:span:` |
| `:span:[…]{style="…"}` | XSS allowlist 外、silent skip | `:span:[…]{class=warn}` で CSS class |
| frontmatter で巨大 nested(>16KB)| size cap 超過、parse 中止 + warning | コンパクトに |
| commonmark 標準と競合する独自 syntax | 例:行頭 `>>>` / `===` 等は parser 衝突 | 本書記載構文のみ |

---

## 5. 関連 doc

| 用途 | doc |
|------|-----|
| **本書 v2(2026-05-09 〜 2026-05-12、Phase 1+2 反映、現用 reference)** | [`markdown-dialect-for-ai-authors-v2.md`](./markdown-dialect-for-ai-authors-v2.md)(v3 として本書 supersede 予定)|
| 旧 AI 規約 v1(Phase 1 stable 時点、v2 で supersede) | [`markdown-dialect-for-ai-authors-v1.md`](./markdown-dialect-for-ai-authors-v1.md) |
| Manual(human-oriented、第 12 章) | [`../manual/12_マークダウン拡張記法.md`](../manual/12_マークダウン拡張記法.md) |
| 設計議論 / IR / 業界事例 / OQ / Phase 計画 | [`../development/notation-redesign-2026-05/`](../development/notation-redesign-2026-05/)(12 章 doc set)|
| simple → canonical formal 写像 spec | [`../development/notation-redesign-2026-05/11-canonicalization-spec.md`](../development/notation-redesign-2026-05/11-canonicalization-spec.md) |
| 寛容 parse doctrine | [`../development/parser-recovery-spec.md`](../development/parser-recovery-spec.md) |
| **IR migration plan**(Phase 3、本 wave で起草)| [`../development/completed/ir-migration-plan-2026-05.md`](../development/completed/ir-migration-plan-2026-05.md) |
| **WCAG resolver spec**(Phase 3)| [`../development/completed/wcag-contrast-resolver-spec.md`](../development/completed/wcag-contrast-resolver-spec.md) |
| **theme 切替 audit**(Phase 3)| [`../development/completed/theme-switching-consistency-audit.md`](../development/completed/theme-switching-consistency-audit.md) |
| **Phase 3 stack 計画**(本 wave 起点)| [`../development/completed/phase3-stack-execution-plan-2026-05.md`](../development/completed/phase3-stack-execution-plan-2026-05.md) |
| Phase 別 wave 進捗 | [`../development/feature-requests-2026-04-28-roadmap.md`](../development/feature-requests-2026-04-28-roadmap.md) |
| リリース履歴 | [`../release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md) |

---

## 6. v2 からの主な変更点(2026-05-12 差分)

1. §1.1〜§1.4 の構成を「simple / formal / 寛容 alias / warning」の 4 階層化(v2 は §1.2 + §1.6 で分散)
2. §1.3 寛容 alias 表で PR-2L PKC2005-2011 の 3 つ組詳細を統合
3. §1.4 warning signaling に Phase 3 PR-2V/2W で消化予定の note を追加
4. §1.5 frontmatter に `layout: a4-2col`(R-2A 拡張、PR-2N)を追加
5. §2.2 fixture 生成 prompt template + §2.3 self-correct loop を新設
6. §3 Phase 3 予告 section 新設(WCAG / theme / IR migration / `:::toc` 正式実装)
7. §5 関連 doc に Phase 3 設計 doc 3 件追加

v2 は v3 の正式 supersede 後 archive 候補(`docs/development/archived/spec-versions/`)。
