# 04. Comment / Footnote family(unified design)

## 4.1 motivation:comment と footnote は同 family

user 提示の構造的洞察 ── footnote は「主文を補足する author 起源の text、用途として空気として扱うことも可能」、これは **comment の仲間**。可視性 / 位置 / 参照可能性 を attribute で differentiate すれば 1 primitive で表現できる。

| 軸 | comment | footnote |
|----|---------|---------|
| 主文を補う情報 | ✓ | ✓ |
| 著者起源 | ✓ | ✓ |
| 主文の流れを切らない | ✓ | ✓ |
| **読者への visibility** | ❌ 不可視 | ✅ 可視 |
| **位置** | 元位置 | 文末 |
| **label / 参照** | なし | あり |

## 4.2 unified design

### 4.2.1 既存維持(隠し comment)

```markdown
%%inline hidden%%                     ← 既存(wave-10-2 L-4)、不可視 default
%%%
block hidden(複数行)
%%%                                    ← 既存、不可視 default
```

### 4.2.2 NEW:可視 footnote として promote

```markdown
%%[fn] 文末 footnote として render される %%
                                       ← 可視、anonymous ID 自動生成、本文末に並ぶ

%%[fn=src1] label 付き %%
                                       ← 可視 + label「src1」、main 本文側から参照可

%%%[fn]
block-level visible footnote
%%%                                    ← block 形、3 文字 wrapping
```

### 4.2.3 NEW:main 本文側からの label 参照(Pandoc 互換)

```markdown
本文中で [^src1] と書く → 上付き marker(¹) が出現、click で文末 footnote へ jump
```

### 4.2.4 NEW:inline 直接アタッチ(最 max わかりやすさ)

```markdown
本文の途中に^[ここに補足テキスト] を直接埋め込む形
                                       ← Pandoc inline footnote、anonymous、本文流れを保ちつつ脚注可視化
```

## 4.3 attribute schema

`%%[…]…%%` の `[…]` 部分の attribute spec:

| 属性 | 値 | 意味 | default |
|------|-----|------|---------|
| `fn` (presence) | 有 / 無 | 可視 footnote として promote | 無(隠し comment 維持)|
| `fn` (with value) | `fn=src1` | promote + label「src1」 | (label なしで anonymous)|
| `id` | id 文字列 | label 別表記(`fn=src1` ≡ `fn id=src1`)| (anonymous)|
| `hidden` | true / false | 明示的 hide(default) | true(`fn` 無し時) |

### 4.3.1 ambiguity 解消

`%%text%%` と `%%[fn] text %%` は明確に違う syntax:

- `%%text%%` の中身が `text`、attribute なし → hidden
- `%%[fn] text %%` の中身は `text`、attribute `[fn]` 付き → visible footnote

`[fn]` を本来の text として書きたい場合は `%%\[fn\] text %%` のように escape、または `%% text [fn] more %%`(attribute は wrapping 開始直後でなければ attribute 扱いしない) で対応。

## 4.4 render 動作

### 4.4.1 inline 隠し comment(既存)

```
input:  本文に %%隠しメモ%% を埋める。
render: 本文に  を埋める。     ← `%%隠しメモ%%` が完全 invisible、source からも reader からも見えない
```

### 4.4.2 visible footnote(NEW)

```
input:  本文の場所 %%[fn] これは脚注 %% 続く本文。
render: 本文の場所 ¹ 続く本文。

        ¹ これは脚注          ← 文末 footnote section に展開
```

### 4.4.3 labeled footnote + reference(NEW)

```
input:  本文 [^src1] を引用。

        他の段落でも [^src1] 同じ脚注を参照可能。

        %%[fn=src1] 脚注の本体テキスト %%

render: 本文 ¹ を引用。

        他の段落でも ¹ 同じ脚注を参照可能。

        ¹ 脚注の本体テキスト
```

### 4.4.4 inline-attached(直接アタッチ、NEW)

```
input:  本文の途中に^[補足テキスト]を直接付ける形。

render: 本文の途中に¹を直接付ける形。

        ¹ 補足テキスト       ← anonymous ID 自動振り、文末展開
```

## 4.5 5 つの設計利点

1. **Primitive 数 最少**:comment 系 1 つで comment + footnote + 参照付き補足 全部表現
2. **smooth gradation**:`%%hidden%% → %%[fn]%% → %%[fn=label]%% + [^label]` で「隠し → 可視 → 参照可」の段階的開示
3. **Pandoc 互換性も確保**:`[^id]` reference + `^[inline]` syntax は Pandoc と同じ、AI / 他 tool との交換性 OK
4. **inline-attached `^[text]`**:Pandoc にもある short form、最 short で「これ補足」と書ける
5. **`^[` と `^^em-dot^^` 非衝突**:`^[` は caret+bracket、`^^` は caret+caret、parser priority で区別容易

## 4.6 衝突 check

### 4.6.1 `^[` (footnote inline) と `^^` (em-dot) の parser priority

```
^^foo^^      → em-dot wrap(`^^` priority)
^[foo]       → inline footnote
^^[foo]^^    → em-dot wrap of `[foo]`(em-dot 内側 text 解釈)
^[foo]^      → inline footnote of `foo`、後続 `^` は literal
```

parser implementation:

1. position 走査時、`^^` を先に検出(em-dot 開始)
2. `^[` は `^^` でない時だけ inline footnote 開始

これで非衝突確保。

### 4.6.2 `[^id]` (footnote reference) と `[label](url)` (link) の区別

- `[^id]` は `[` 直後が `^`、`id` は label/href なし
- `[label](url)` は `[` 直後が non-`^`、`(url)` 必須
- grammar 上区別可能

### 4.6.3 `[^id]: text` (definition syntax、Pandoc 互換) との共存

Pandoc は footnote definition を別行で書く形:

```markdown
本文に [^src1] を入れる。

[^src1]: 脚注の本体。
```

PKC2 でも **同記法 Pandoc 互換に support** する案あり(`%%[fn=src1]%%` と等価):

| PKC2 unified | Pandoc 互換 |
|------------|-----------|
| `%%[fn=src1] 脚注本体 %%`(任意位置) | `[^src1]: 脚注本体`(別行) |

両方 parse して same IR ノードに正規化(可換)。

## 4.7 実例(典型 use case)

### 4.7.1 学術 note

```markdown
PKC2 vision は modern emacs の AI 一級市民版である[^claude]。

%%[fn=claude]
Anthropic Claude モデル系。LLM が markdown source を直接読み書きできる前提を core 設計に含める。
%%

これは Notion / Obsidian と異なる設計判断[^obsidian-comparison]。

%%[fn=obsidian-comparison]
Notion は block-based で source markdown を持たず、Obsidian は plugin に依存して機能拡張する。
%%
```

→ render 時、本文に上付き ¹ ² が出る、文末に footnote 展開。

### 4.7.2 議事録の補足

```markdown
2026-05-09 設計会議

## 議題 1:記法整理

simple-first を確定[^a]。formal-first は frame inversion により却下[^b]。

%%[fn=a] 階層 1-2(prefix/wrapping)主体、頻度高 markup を最低負荷形へ %%
%%[fn=b] formal `:role:[]{}` を universal とする提案を user が「逆」と訂正 %%
```

### 4.7.3 inline 直アタッチ(短い補足)

```markdown
本文の流れに^[これは脚注] を直接埋める方式が^[最も簡潔] な書き方。
```

→ render 時、上付き ¹ ² が本文に出現、文末展開。

## 4.8 implementation outline

### 4.8.1 parser

markdown-it custom rules:

- `%%[attrs] text %%` (block) / `%%[attrs] text %%` (inline) → `Comment{kind, attrs, hidden, ...}` IR
- `[^id]` → `FnRef{id}` IR
- `[^id]: text` (block) → `Comment{visibility=footnote, id, ...}` IR(definition 形式)
- `^[text]` → `Fn{anonymous=true, children}` IR

### 4.8.2 render

- 各 IR ノードを type discriminate
- `Comment{hidden=true}`:no render
- `Comment{visibility=footnote}`:文末 footnote section に展開
- `FnRef{id}`:`<sup><a href="#fn-id">id</a></sup>`、文末への jump link
- `Fn{anonymous}`:auto ID 振り、`Comment{visibility=footnote, id=auto}` と等価動作

### 4.8.3 文末 footnote section

document 内に footnote が 1 つでもあれば、文書末に自動 section:

```html
<aside class="pkc-footnotes">
  <ol>
    <li id="fn-src1"><span>...</span> <a href="#ref-src1">↩</a></li>
    <li id="fn-anon-1"><span>...</span> <a href="#ref-anon-1">↩</a></li>
  </ol>
</aside>
```

## 4.9 設計まとめ

### 確定事項

- comment / footnote を unified system として扱う
- `%%text%%` 既存 syntax を再活用、attribute `[fn]` で promote
- Pandoc-style `[^id]` reference と `^[inline]` を共存実装
- `[^id]: text` block-level definition は別行に書ける Pandoc 互換 form

### implementation 順序(`09-migration-roadmap.md` で詳述)

- Phase 1:`%%[fn]%%` + `[^id]` reference + `[^id]: text` definition
- Phase 2:`^[inline]` shorthand(Pandoc 互換)
- Phase 3:advanced(複数行 footnote、footnote within footnote、…)

## 4.10 レビュー観点

1. **comment と footnote の unified 化判断**:user の構造的洞察(同 family)が技術的にも妥当か?分離していた方がよい場合の判断基準は?
2. **`%%[fn]%%` syntax**:`[fn]` attribute の書き方は学習しやすいか?他の form(e.g. `%%fn:text%%` / `%%fn=src1:text%%` colon-separator)を考えるべきか?
3. **`^[` と `^^` の非衝突**:本当に確保できるか?edge case での parser ambiguity は?
4. **Pandoc 互換 `[^id]:` definition**:同 entry 内のどこに書いても OK にすべきか、本文末限定か?(Pandoc は本文末)
5. **footnote の中で markdown 使えるか**:`%%[fn] **bold** や [link](url) %%` を解釈すべきか?Pandoc は yes、PKC2 は?
6. **複数行 footnote**:継続行は indent 揃え?それとも `%%[fn] line1\nline 2 %%` をそのまま許容?
7. **`%%hidden%%` の既存 user 影響**:reform で attribute syntax 導入により、既存 `%%text%%`(意図 hidden)が将来 typo で `%%[fn] text%%` に近い形になった時の意図ズレリスクは?
