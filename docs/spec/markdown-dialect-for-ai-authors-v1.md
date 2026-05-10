# PKC2 Markdown 方言:AI 書き手向け規約書 v1

> **⚠ SUPERSEDED**: 本 v1 は **`markdown-dialect-for-ai-authors-v2.md`** に置き換えられました(2026-05-09、reform-2026-05 Phase 1 反映)。新規生成では v2 を使ってください。本 v1 は historical reference として残置。

**Audience**: AI(LLM)が PKC2 entry の `body` を生成する際の規約書。
**Reader**: 機械的に処理する LLM。可読性は保つが、構造化と非曖昧化を優先。
**Companion(human-oriented)**: `docs/development/markdown-dialect-extensions-spec-2026-05.md`(§1.2 IR 連動 / 業界事例 / 設計議論を含む)
**Status**: superseded(reform-2026-05 Phase 1 着地で v2 へ移行)
**Version**: v1
**Last updated**: 2026-05-08
**Superseded**: 2026-05-09 by v2

---

## 0. 使い方(AI が読むときの行動規約)

1. **このファイル単体で完結する**。他 spec を参照しなくても本文書通りに書けば PKC2 が正しく render する。
2. **commonmark + GFM(table / strikethrough / task list) + linkify + typographer** が base。本書はその上の PKC 独自拡張のみを定義。
3. **不確実な markup は使わない**。本書に未記載の構文(例:HTML タグ直書き、独自 JSX 風 syntax)は安全のため避ける。
4. **round-trip 安全**: 本書の構文だけで書けば、PKC2 export → 再 import で意味を失わない。
5. **inline HTML は禁止**: PKC2 の markdown engine は `html: false`(XSS 防止)。`<div>` / `<style>` 等は escape されてリテラル表示になる。

---

## 1. 仕様マップ(全 markup の一覧表)

| ID | 名称 | 構文(行頭 prefix は leading whitespace 許容) | 用途 |
|----|-----|-----------------------------------------|------|
| commonmark | 見出し / 強調 / link / list / table / fence | 標準 markdown | 通常 |
| L-1 | Section break | `+++` または `+++ {role=ROLE}` | 改ページ / 章区切り |
| L-2-a | Highlight | `==text==` | 黄色マーカー |
| L-2-b | Ruby(ふりがな) | `[[ruby:漢字\|かんじ]]` | 振り仮名 |
| L-2-c | Em-dot(圏点) | `[[em:重要]]` | 各文字上に点 |
| L-3 | Blockquote 通常 | `> text` | 引用(commonmark 準拠) |
| L-4-a | Comment(inline) | `%% hidden %%` | 完全削除されるメモ |
| L-4-b | Comment(block) | `%%%\n...\n%%%` | 複数行コメント |
| L-5 | Align prefix | 行頭 `\|\|` `\|>` `<\|` | 段落の中 / 右 / 左寄せ |
| L-6 | Simple inline | `:text:attrs:` | inline 装飾(色 / 太字 / size 等) |
| L-7-a | Figure block | `:::figure{#id}\n...\n^^^ caption\n:::` | 図 + 自動採番 |
| L-7-b | Figure ref | `[@id]` | 図 / 表 / 式の本文中参照 |
| L-8 | Blank-line marker | 行頭 `_` または `_<N>`(N=1〜20) | 縦余白の明示 |
| L-9 | Paragraph indent | 行頭 `__`(半角×2)or `＿`(全角 U+FF3F) | 段落先頭 1 字下げ |
| M-7 | Variables(Phase 2) | frontmatter `vars.x` + 本文 `{{vars.x}}` | 文書内変数展開、宛先別 variant 生成 |

**行頭マーカー共通規則**: 行頭の半角空白 / TAB / 全角空白(U+3000)はすべて strip して判定。`   |>` も `\t__段落` も `　_3` も有効。

---

## 2. 各 markup の精密規約

### 2.1 L-1: Section break(改ページ / 章区切り)

```
+++
+++ {role=section}
+++ {role=cover}
+++ {role=body}
```

- 行内容は `+++` のみ(空白除去後)。`role` 属性 optional。
- HTML: `<hr class="pkc-section-break" data-pkc-role="ROLE">`。default role は `auto`。
- Word / PPT export 時は role に応じて page break / slide separator にマップ。
- 連続する `+++` 行は **複数の section break** として扱われる(まとめない)。

### 2.2 L-2-a: Highlight(黄色マーカー)

```
本文中の ==重要== を強調。
```

- inline 限定。block にはかからない。
- HTML: `<mark>重要</mark>`。
- 両端 `==` 必須、`==`〜`==` 内に改行を含めない。

### 2.3 L-2-b: Ruby(ふりがな)

```
[[ruby:漢字|かんじ]]
[[ruby:Tokyo|とうきょう]]
```

- `[[ruby:base|ruby]]` の 2 部構成。`|` は半角必須。
- HTML: `<ruby>漢字<rt>かんじ</rt></ruby>`。
- base / ruby に markdown markup を入れない(plain text のみ)。

### 2.4 L-2-c: Em-dot(圏点)

```
[[em:重要]]
```

- 「圏点(けんてん)」= 各文字の上に「・」を打つ日本語の強調。CSS `text-emphasis: dot` で表現。
- HTML: `<em class="pkc-em-dot">重要</em>`。
- 内容は plain text。

### 2.5 L-3: Blockquote(commonmark 準拠)

```
> 引用内容
> 複数行可
```

- commonmark 標準と同じ。PKC2 独自挙動なし。
- 注意:blockquote 内では L-5 align prefix は **無効**。

### 2.6 L-4: Comments(render 時に完全削除)

```
%% inline コメント、export では消える %%

%%%
block コメント
複数行
削除される
%%%
```

- inline `%% ... %%`:同一行内、改行を含めない。
- block `%%%`:単独行で開始 + 単独行で終了。
- HTML: 何も出力されない(完全削除、CSS hide ではない)。

### 2.7 L-5: Align prefix(段落寄せ)

```
|| この段落はセンター寄せ
|> この段落は右寄せ
<| この段落は左寄せ
```

- 行頭 `||` / `|>` / `<|` の直後に空白 0〜1 文字、それ以降が paragraph 本文。
- prefix 行から **空行 / 構造区切り(heading / list / fence / table 等)まで** が paragraph 全体に適用。継続行の prefix は省略可。
- 連続する prefix 行は **異 align ごとに別 paragraph** として分離(2026-05-07 確定挙動):
  ```
  || center 1 行目
  <| left 1 行目
  |> right 1 行目
  ```
  → 3 paragraph、それぞれ別 align。
- HTML: `<p data-pkc-align="center|right|left">`。

### 2.8 L-6: Simple inline(`:text:attrs:`)

```
:文字:attr1, attr2, attr3:
```

- 内容と attrs を `:` で 3 区画に分割。
- attrs は半角カンマ区切り、順不同、複数併用可。

#### attrs vocabulary(全て or 一部の組合せ可)

| カテゴリ | 値 | 意味 |
|--------|----|------|
| 強調 | `bold` | font-weight: bold |
| 強調 | `italic` | font-style: italic |
| 強調 | `underline` | text-decoration: underline |
| 強調 | `strikethrough` / `strike` | line-through |
| 強調 | `code` | monospace 表示 |
| サイズ | `xs` / `sm` / `md` / `lg` / `xl` / `2xl` / `3xl` | 0.75em / 0.875 / 1 / 1.25 / 1.5 / 1.875 / 2.5em |
| サイズ自由値 | `<N>%` / `<N>em` / `<N>rem` / `<N>px` | そのまま font-size に適用(例 `120%`、`1.5em`) |
| 色(文字) | CSS color name / `#hex` / `rgb(...)` | color: 値 |
| 色(背景) | `bg-<color>` / `bg-#hex` | background-color: 値 |
| font-family | `serif` / `sans` / `mono` | font-family: 対応値 |

**衝突回避**: attrs 区画は `[a-zA-Z0-9#%, \s\-.()]` のみ許容。`12:30:45` 等の時刻表記は **attrs に該当しないため誤発火しない**(parser が `30` を vocab で reject)。

例:

```
:重要:bold, red:
:大きく:lg, bg-yellow:
:120%サイズ:120%:
:綜合:bold, italic, underline, red, bg-#fefce8:
```

### 2.9 L-7: Figure / Table / Equation block + 自動採番

```
:::figure{#fig-1}
画像 / 表 / 数式の中身(複数行可、markdown OK)
^^^ キャプション本文(markdown 装飾可)
:::
```

- `:::figure{#id}` で開始、`:::` で終了、間に `^^^ caption` 行 1 つ(任意)。
- `kind` を `figure` / `table` / `equation` のいずれかで切替:`:::figure{#fig-1}` / `:::table{#tbl-1}` / `:::equation{#eq-1}`。
- 自動採番:同 entry 内の出現順で `1, 2, 3...` を割当。caption に `図 1: ...` / `表 1: ...` / `式 1: ...` の prefix が付く。
- HTML: `<figure id="fig-1" class="pkc-fig pkc-fig-figure" data-pkc-fig-kind="figure" data-pkc-fig-num="1">...<figcaption class="pkc-fig-caption">図 1: ...</figcaption></figure>`。
- 本文中参照は L-7-b: `[@fig-1]` / `[@tbl-2]` → render 時に **`図 1` / `表 2`** リンク化(クリックで対象 figure に飛ぶ)。

### 2.10 L-8: Blank-line marker(縦余白の明示)

```
本文 1

_

本文 2(1 空行ぶん下)
```

```
本文 1

_3

本文 2(3 空行ぶん下)
```

- 単独行 `_` → 1 空行ぶん。`_<N>`(N=1〜20)→ N 空行ぶん。
- 21 以上は 20 にクランプ、`_0` / `_-1` / `_3a` 等は marker 扱いせず通常テキスト。
- 行頭空白許容(`   _` / `\t_2` も有効)。
- HTML: `<div class="pkc-blank-line" data-pkc-blank-count="N" aria-hidden="true">`、CSS で 1em × N の高さ。
- markdown CommonMark の連続空行 collapse(複数空行も 1 paragraph break と等価)を回避するための明示マーカー。

### 2.11 L-9: Paragraph indent(段落先頭 1 字下げ)

```
__段落本文。先頭が 1 字下がる。
__ 半角空白挟みも OK。
＿全角アンダースコアも等価。
```

- 行頭 `__`(半角 `_` × 2)or `＿`(全角 U+FF3F)→ paragraph 全体に 1 字下げ(`text-indent: 1em`)。
- 衝突回避:
  - `___text___`(`_` 3 連以上)は markdown horizontal rule / strong として通常処理、indent 化しない。
  - 行末が `__` で閉じる場合(`__bold__`)は markdown bold の単独行として残す(indent 化しない)。
- L-5 align と併用可:`|| __センター字下げ` → 中央寄せ + 字下げの両方適用。
- HTML: `<p data-pkc-indent="1">`。

### 2.12 M-7: Variables `{{vars.x}}`(Phase 2、2026-05-08 着地)

**frontmatter で定義した変数を本文中で展開** する markup。同じ文書を複数の宛先 / 用途で再利用できる(=「一資料から宛先別の variant 生成」が AI prompting の延長で可能)。

```markdown
---
vars:
  project: ALPHA-7
  client: Acme Corp
  date: 2026-05-08
  signature: 田中
---

# 案件 {{vars.project}} 進捗

本通知は {{vars.client}} 様向け、提出予定 {{vars.date}}。

|> 担当: {{vars.signature}}
```

→ render 時に展開される。

#### 構文

- frontmatter で `vars:` block(YAML object 形式)or `vars.<key>: <value>`(flat dot 形式)で定義
- 本文で `{{vars.<key>}}` で参照、`<key>` は `[A-Za-z_][\w-]*`(英字始まり、英数字 / `_` / `-`)
- 展開 timing は **render 時**(parse 時でなく)、format 別 variant に対応可能な設計
- `{{ vars.x }}`(内側空白)も許容
- escape:`\{{vars.x}}` で literal `{{vars.x}}` を出力(展開しない)

#### 衝突回避 / 制約

- fenced code block(``` / ~~~)の中では展開しない
- inline backtick code span(`` ` `` ... `` ` ``)の中も **展開される**(2026-05-08 hotfix)。L-2 highlight(`==xxx==`) / L-2 em-dot(`[[em:xxx]]`)/ L-6 simple-inline(`:xxx:attrs:`)等の中で展開できるようにするための trade-off。code span 内で literal にしたい場合は `\{{vars.x}}` で escape
- 改行を跨ぐ `{{vars.x\nname}}` は無効、literal で残置
- `{{macros.x}}` `{{export.x}}` 等 **vars 以外の名前空間は Phase 2 では未対応** → literal で残る(将来対応)
- 値内の HTML(`<script>` 等)は escape されて表示される(XSS 安全、markdown-it `html: false` で確保)

#### 未定義変数の扱い(visible warning)

`{{vars.unknown}}` のように **未定義 key を参照**すると、silent fail せず:

```html
<span class="pkc-variable-undefined" title="未定義変数: vars.unknown">{{vars.unknown}}</span>
```

として、赤点線下線の visible warning が paragraph 内に残る。Author / AI が気付いて修正できるための fail-safe。

#### TEXTLOG での適用範囲(2026-05-08 hotfix-2)

TEXTLOG の各 log でも `---` fenced frontmatter から **per-log で** vars を抽出 + 展開可能。TEXT entry と同 contract、log 単位で独立した variants を作れる。frontmatter 自体は preview に出ない(strip 済)。

#### AI 書き手の活用パターン

```markdown
---
vars:
  audience: 経営層       # ← AI が自動 fill / user が変えるたびに variant 生成
  tone: formal           # ← 文体プロンプト
  project: ALPHA-7
  date: 2026-05-08
  signature: 田中
---

{{vars.audience}} 様向け {{vars.project}} 進捗報告({{vars.date}} 時点)

...本文...

|> 担当: {{vars.signature}}
```

AI に対する prompt 例:
> 「以下の vars だけ書き換えて、同じ本文を `経営層 / formal` 用と `現場 / casual` 用の 2 variant に分岐させて」

→ frontmatter の `vars` だけ書き換えて 2 つの entry 生成、本文は単一 source。

#### Format mapping

| Format | 出力 |
|--------|------|
| HTML | 値 text に inline 展開、未定義は warning span |
| Word / PPT | (Phase 3 export engine で)同じ展開ルール |
| Markdown export(canonical) | frontmatter + `{{vars.x}}` のまま round-trip(idempotent) |

#### IR 表現

```ts
{ type: 'variable-ref', namespace: 'vars', key: 'project' }
```

render 時に env.vars[key] を読んで `text` ノードへ評価、未定義は `variable-undefined` ノードへ評価。

---

## 3. AI 向け執筆判断ガイド(when-to-use)

### 3.1 「強調したい」とき

| 意図 | 使う markup | 例 |
|----|-----------|----|
| 太字 | `**` | `**重要**` |
| 斜体 | `*` または `_` 1 個 | `*emphasis*` |
| 黄色マーカー | `==` | `==注意==` |
| 圏点(日本語強調) | `[[em:...]]` | `[[em:重要]]` |
| 色 + 太字等の組合せ | L-6 simple inline | `:重要:bold, red:` |
| 大きく見せる | L-6 size | `:大事:lg, bold:` / `:特大:2xl:` |

### 3.2 「段落の見た目を整えたい」とき

| 意図 | 使う markup |
|----|-----------|
| 中央寄せ paragraph | 行頭 `\|\|` |
| 右寄せ paragraph(差出人 / 日付など) | 行頭 `\|>` |
| 段落先頭を 1 字下げる(日本語慣習) | 行頭 `__` または `＿` |
| 段落間に 2〜3 行の余白 | `_2` または `_3`(空行マーカー) |
| 章 / 節の区切り | `+++ {role=section}` |

### 3.3 「図表を入れたい」とき

```
:::figure{#fig-introduction}
![](attachment:abc-image.png)
^^^ 全体構成
:::

本文 → 図 [@fig-introduction] 参照。
```

- 図 / 表 / 式は **必ず** `:::figure / :::table / :::equation` でラップ + `#id`。
- `[@id]` で本文中参照、自動採番が走る。
- caption の `^^^` 行は省略可、その場合 caption なし。

### 3.4 「メモを残したい(render に出さない)」とき

```
本文 %% この一文は要再考、後で削除 %%

%%%
メモ:この section は仮置き。
最終版では削除する。
%%%
```

### 3.5 「同じ文書を宛先 / 用途別の variant にしたい」とき(M-7 variables)

frontmatter に `vars:` block を作り、本文の固有名詞 / 日付 / 担当者 / 文体トーン等を `{{vars.x}}` 経由で参照する:

```markdown
---
vars:
  audience: 経営層
  tone: formal
  project: ALPHA-7
---

{{vars.audience}} 様向け {{vars.project}} 進捗報告
```

→ vars だけ差し替えれば本文 1 つから複数の variant を生成できる。AI に「audience を `経営層 → 現場` に、tone を `formal → casual` に変えて再生成して」と指示すれば文体ごと作り直さずに済む。

### 3.6 「日本語文書として整える」とき(典型 pattern)

```
|> 2026年5月8日

# 件名

__本文の段落 1 では字下げを使い、
継続行も自動で同 paragraph に入る。

__段落 2 も字下げ。

_

|| ==中央の強調==

|> 以上
```

→ 日付右寄せ + 見出し + 字下げ段落 × 2 + 余白 + 中央強調 + 末尾右寄せ「以上」。

---

## 4. やってはいけないこと

| ❌ NG | 理由 |
|------|------|
| `<div>` / `<span>` / `<style>` の HTML 直書き | `html: false` で escape される(literal 表示) |
| `<br>` 直書き | markdown engine が `breaks: true` で改行 → `<br>` 自動。明示は不要 |
| `&nbsp;` の直書き | rich-paste 時の round-trip で予期せぬ空白 |
| `_` を強調目的で `_text_` のみで使う | L-8 marker と衝突しないが、`*text*` を推奨 |
| 行頭 `___` を horizontal rule として使う | `---`(ハイフン 3 個)を使う(明確) |
| `>` を quote 外で多重使い | quote ネストの誤発火を避ける |
| L-6 attrs 内に CJK 文字 | parser が attrs と認識しない、意図せず通常 text 化 |
| 図 / 表で `#id` を欠く | `[@id]` 参照ができない、自動採番されない |
| L-5 prefix の後に 4 空白以上 | code block 化のリスク(現状 1 空白までを推奨) |

---

## 5. 出力時のチェックリスト(AI が markdown を返す前に走らせるべき検査)

1. [ ] 全ての `:::figure / :::table / :::equation` ブロックが `:::` で閉じているか
2. [ ] 全ての L-7 figure に `#id` が付いているか(本文中で参照される場合)
3. [ ] L-6 simple inline `:text:attrs:` の attrs に CJK / 変な記号が混じっていないか
4. [ ] L-2 ruby / em-dot に必須引数が揃っているか(`[[ruby:base|ruby]]` の `|` 等)
5. [ ] L-4 block comment `%%%` が単独行で開閉しているか
6. [ ] HTML タグ `<...>` が一切混入していないか(escape される)
7. [ ] 全ての L-1 section break / L-5 align prefix / L-8 blank / L-9 indent が **行頭**(空白許容)から始まっているか
8. [ ] 連続する別 align の L-5 行は意図通り段落分離されるか(`|| center` → `<| left` は別段落)
9. [ ] 表は通常 markdown(`| col1 | col2 |` の pipe table)または fenced CSV(```csv ... ```)。`csv` fence 内 cell も markdown inline parser が走るので L-2 / L-6 が cell 内で有効。
10. [ ] M-7 variables を使う場合、本文中の `{{vars.x}}` のすべての key が frontmatter の `vars:` で定義されているか(未定義 → 赤点線下線の警告として残る)。`{{macros.x}}` `{{export.x}}` 等 vars 以外の名前空間は Phase 2 では未対応 = literal で残るので本文に書かない。

---

## 6. 例:複合 fixture(典型 PKC entry の AI 生成例)

```markdown
|> 2026年5月8日 発信
<| To: どこどこのほにゃららへ
|> From: へのへののモニャモニャから

|| ほにゃららのシステムについて、制約事項と対策予定の通知

_

|| 記

_

### 1. 概要

__本通知は、システム障害解消までの間、暫定対応として ==非常運用モード==
を継続する旨を伝えるものである。

### 2. 経緯

```csv
日付, 時刻, 内容
2026/05/08, 09:54:44, ":非常時の措置適用開始:bold, red, bg-yellow:"
2026/05/08, 09:54:50, "==重要==な事項を確認"
```

### 3. 制約

__本件制約は[[em:システム障害解消まで]]継続する必要がある。
緩和措置として、:2026年5月9日:italic: に緊急的にデータメンテナンスを行う。

### 4. 対策

1. 対策予定日:2026年5月11日
2. 対策内容(本通知時点の調査結果に基づく):
   - メッセージ定義の更新
   - キャッシュクリア

%% TODO: 詳細手順は別 entry [@fig-procedure] に記載 %%

### 5. 問い合わせ先

__問い合わせは社内チケットシステム経由でお願いします。

|> 以上
```

---

## 7. version policy

- 本書の **マイナー追補(L-9 → L-10、新 size keyword 追加 等)は backward compat 必須**。既存 markup の意味を変更しない。
- メジャー破壊的変更は v2 として別ファイル(`-v2.md`)で起こし、PKC2 release-builder の `data-pkc-md-dialect-version` メタを bump する。

---

## 8. 参照(human 向け補足を読みたいとき)

- 設計議論 / IR との連動 / 業界事例:`docs/development/markdown-dialect-extensions-spec-2026-05.md`
- Phase 1 実装ステータス:`docs/development/feature-requests-2026-04-28-roadmap.md` §10-2
- リリースノート:`docs/release/CHANGELOG_v2.2.0.md`
