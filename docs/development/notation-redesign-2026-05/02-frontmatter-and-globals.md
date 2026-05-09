# 02. Frontmatter と document-level globals

## 2.1 frontmatter overview

frontmatter = entry body 先頭の `---\n…\n---\n` fenced YAML block。document-level metadata を declare する場所。

PKC2 の frontmatter は以下の axes をカバー:

| 領域 | 例 | 詳細 |
|------|-----|------|
| **identity** | `kind: book`(filer 振り分け)、`title: 案件報告` | filer base 識別、見出し |
| **document globals** | `writing` `align` `direction` | 本章主題 |
| **vars(変数定義)** | `vars: { project: ALPHA-7 }` | 本文 `{{vars.x}}` 展開 |
| **per-archetype metadata** | book: `author / year / publisher` 等 | filer / card display で表示 |
| **export hints** | `template_kind: report / slide` | 将来の format export 用 |
| **future expansion** | backmatter / property drawer / shadow_references etc. | spec 予約 |

## 2.2 文書 globals(本章 focus)

### 2.2.1 spec

```yaml
---
# 全部省略可、default は inclusive horizontal LTR

writing: horizontal       # horizontal | vertical
align:   left             # horizontal: left | right | center
                          # vertical:   top  | bottom | center
direction: ltr            # ltr | rtl
                          # horizontal 時のみ effect、vertical では writing と組み合わせ
---
```

### 2.2.2 設計判断:writing と align を分離(orthogonal)

**1 設定にまとめる案**(却下):

```yaml
layout: horizontal-left   # horizontal-left | horizontal-right | … | vertical-top | …
```

- ✗ 6+ 値の enum、ハイフン区切りで読みにくい
- ✗ 拡張時に組み合わせ爆発(両端揃えなど)
- ✗ writing 切替で値全体書き換え必要

**2 設定に分離する案**(採用):

```yaml
writing: horizontal
align:   left
```

- ✅ 直交概念は別 key で表現するのが原則(CSS `writing-mode` + `text-align` と同型)
- ✅ writing だけ vertical 切替で align は意味的に持ち越せる(center → center)
- ✅ 拡張容易(`align: justify`、`direction: rtl` 独立追加可)
- ✅ AI 生成時に部分上書き(writing 省略 + align 指定 等)が自然

### 2.2.3 writing × align 組み合わせ matrix

| writing | 有効な align | default align | 不正組み合わせ時の挙動 |
|---------|------------|---------------|--------------------|
| `horizontal` | `left` / `right` / `center` | `left` | `top` / `bottom` 指定で warning + default 復帰 |
| `vertical` | `top` / `bottom` / `center` | `top` | `left` / `right` 指定で warning + default 復帰 |

不正組み合わせは `pkc-frontmatter-warning` banner で可視 warning(`07-security-stance.md` で実装機構と統合)。

### 2.2.4 direction(LTR / RTL)

```yaml
direction: ltr          # default
# or
direction: rtl
```

- `direction: ltr` + `writing: horizontal`:default flow が左→右(英語、日本語、中国語の現代用法)
- `direction: rtl` + `writing: horizontal`:default flow が右→左(Arabic, Hebrew)。`align` の default が `right` になる
- `direction: ltr` + `writing: vertical`:縦書き左起こし(Mongolian)
- `direction: rtl` + `writing: vertical`:縦書き右起こし(Japanese / Chinese 伝統)

### 2.2.5 inclusive design rationale

user 提示「あとから追加するのは差別的な気がする」に基づき、**direction は最初から recognize**。Anglo-centric design の anti-pattern を避ける:

- 初期から RTL を spec で宣言
- 実装は default `ltr` で十分(RTL ロジックは CSS native `direction` property に委ねる)
- 縦書きも同 frame で対応(将来日本語 / 中国語伝統文書 export を視野)

CSS native への mapping(実装一貫性):

```css
.pkc-document[data-pkc-writing="horizontal"][data-pkc-direction="ltr"] {
  writing-mode: horizontal-tb;
  direction: ltr;
}
.pkc-document[data-pkc-writing="horizontal"][data-pkc-direction="rtl"] {
  writing-mode: horizontal-tb;
  direction: rtl;
}
.pkc-document[data-pkc-writing="vertical"][data-pkc-direction="ltr"] {
  writing-mode: vertical-lr;
  direction: ltr;
}
.pkc-document[data-pkc-writing="vertical"][data-pkc-direction="rtl"] {
  writing-mode: vertical-rl;
  direction: ltr;     /* 縦書き右起こしは text 内 direction は ltr */
}
```

### 2.2.6 simple 記法側との対応

frontmatter `align` が「default flow direction」を確定 → 本文の simple 記法 `||` `|>` はそれに対する logical:

```
無印         → frontmatter `align` の default(縮退して書ける)
||text       → 中央(常に物理中央、書字方向 不変)
|>text       → 反対側(default flow の逆)
                 horizontal + align:left  → 右
                 horizontal + align:right → 左(direction:rtl などの RTL setup)
                 vertical   + align:top   → 下
                 vertical   + align:bottom→ 上
```

**`<|` simple は廃止確定**(default は frontmatter で declare、本文で再宣言不要)。物理強制必要時のみ formal `:::paragraph{align=left|right|top|bottom}` で。

### 2.2.7 typo 寛容(user 提示)

`|>` の typo を 4 形受理(canonical = `|>`):

| canonical | typo 受理 | 全 4 形が IR `Paragraph{align=end}` に正規化 |
|-----------|----------|------------------------------------------|
| `\|>` | `<\|`、`\|<`、`>\|` | parser 正規表現:`^\s*(?:\|>|<\||\|<|>\|)` |

`||` center は対称形なので typo パターン少、追加なし。

## 2.3 vars(変数定義)

### 2.3.1 spec(既実装、wave-10-2 M-7)

```yaml
---
vars:
  project: ALPHA-7
  client:  "Acme Corp"
  date:    2026-05-08
# or flat dot-notation
vars.project: ALPHA-7
vars.client:  "Acme Corp"
---

本文中 {{vars.project}} を {{vars.client}} 様向けに送付、提出予定 {{vars.date}}。
```

両形式併用可能、後者(flat)が優先(後勝ち)。

### 2.3.2 設計判断 :nested object 形式採用

flat dot-notation は markdown における先行例なし、独自記法。一方 YAML standard は nested mapping。両方受理することで:

- 人間 → nested(自然な YAML、可読性高)
- AI → flat(emit 簡単、属性 1 行で書ける)

可換性が成立。

### 2.3.3 限界 / out of scope

- macros(複雑な template)は `{{macros.x}}` 記法予約のみ、未実装。block 展開は将来 Phase
- 入れ子 var(`{{vars.a.b}}`)未対応、現状 1 階のみ
- conditional 展開(`{{vars.x if env=prod}}`)未対応

## 2.4 limits(buffer 攻撃防御、既実装 wave-10-2)

frontmatter parser は以下 cap を spec 固定値で持つ。超過は parse 中止 + 可視 warning(`pkc-frontmatter-warning`):

| cap | default | rationale |
|-----|---------|-----------|
| 全 frontmatter サイズ | 16 KB | 通常 entry の 100 倍超は誤入力扱い |
| 全 key 数(全階層合計)| 100 | 典型 metadata は ~20、余裕 5 倍 |
| 階層深度 | 4 | `page.margins.top` が 3、余裕 1 |
| 単一配列の長さ | 500 items | tag list / author list 想定 |
| 単一 string 値の byte 数 | 4 KB | 長文は body へ書かせる |

### 2.4.1 forbidden keys(prototype pollution 防御)

以下 key は parser が reject + warning:

- `__proto__`
- `constructor`
- `prototype`

JavaScript の prototype chain を pollute する攻撃パターン。`Object.create(null)` ではなく filter で reject(downstream `String(meta)` 等で `[object Object]` のような吸収不能エラーが起きないため)。

## 2.5 frontmatter parse の既実装機能(参考)

wave-10-2 + YAML reform で landed:

- nested mapping(深度 ≤ 4)
- block scalar `|`(literal)/ `>`(folded)
- inline 配列 `[a, b, c]` + ブロック配列 `- a\n- b`
- quoted string(single / double)+ escape
- quoted-aware comment strip(`title: "a # b"` の `#` を comment 扱いしない)
- 行頭 / 行末 comment 互換

### 2.5.1 詳細 spec(parse rule 表)

| 構文 | 例 | 解釈 |
|------|-----|------|
| flat key-value | `kind: book` | string |
| number | `year: 2026` | number |
| boolean | `active: true` | boolean |
| null | `note: ~` | null |
| date(string 化) | `read_at: 2024-03-15` | string("2024-03-15") |
| inline array | `tags: [a, b, c]` | array of scalars |
| block array | `tags:\n  - a\n  - b` | array of scalars |
| nested object | `vars:\n  k1: v1\n  k2: v2` | object |
| block scalar literal | `desc: \|\n  line 1\n  line 2` | string("line 1\nline 2") |
| block scalar folded | `desc: >\n  hello\n  world` | string("hello world") |
| quoted string | `name: "with: colon"` | string("with: colon") |
| inline comment | `kind: book  # 蔵書` | comment 部分 strip |
| full-line comment | `# top comment\nkind: book` | line 全体 skip |

## 2.6 future expansion(spec 予約のみ)

### 2.6.1 backmatter

```markdown
---
title: ...
---

本文 ...

---
# backmatter — 末尾の YAML、format 毎に hidden / footer 置換
bibliography:
  - { id: smith2020, title: "...", author: "Smith", year: 2020 }
revision_log:
  - { date: 2026-05-09, by: claude, note: "初版" }
---
```

未実装、Phase 後段で追加検討。学術 / 出版 用途。

### 2.6.2 property drawer(org-mode 風)

```markdown
* Heading
  :PROPERTIES:
  :KEY1: value1
  :KEY2: value2
  :END:

  本文 ...
```

PKC2 では heading attrs `# T {key=v}` で代替可能、property drawer は org-mode 移行 user 向けの compatibility layer 候補。未実装。

### 2.6.3 shadow_references(部分 export 時の自動付与)

`:::quote{author=...}` 等の `:::quote` block を部分 export する時、引用元 entry が same-container 外なら shadow ref で URL を付与。

```yaml
shadow_references:
  - { lid: B, title: "Bの題名", url: "pkc2://container-X/B" }
```

未実装、Phase 後段。

## 2.7 設計まとめ

| 設定 | values | default | inclusive design 配慮 |
|------|--------|---------|---------------------|
| `writing` | horizontal / vertical | horizontal | 縦書きを最初から recognize |
| `align` | left / right / center / top / bottom | left(horizontal) / top(vertical) | 物理 名で直感的 |
| `direction` | ltr / rtl | ltr | RTL を最初から recognize |
| `vars` | nested object or flat dot-notation | (空) | 人間 / AI 双方 friendly |

## 2.8 レビュー観点

1. **inclusive design 妥当性**:`direction` を初期 spec 化する判断は十分か?未対応で起きうる将来コストとどう trade-off するか?
2. **writing × align orthogonal 設計**:単一 enum でなく分離する利点は本当に大きいか?他の design pattern(CSS の `writing-mode` / `text-align` / `direction` という 3 軸独立)は適切に映されているか?
3. **logical vs physical align**:`|>` simple = logical end は user 直感に合うか?`<|` 廃止は本当に問題ないか?
4. **vars limits**:他システム(Obsidian / Hugo)の frontmatter 限度と比較、PKC2 の cap は妥当か?
5. **forbidden keys**:`__proto__` / `constructor` / `prototype` 以外に追加すべき key は?(e.g. `toString`、`valueOf`、`hasOwnProperty` 等)
6. **将来 expansion**:backmatter / property drawer / shadow_references 含めて、frontmatter / globals に置くべき機能は他にあるか?
