# Block-Level Format Attribute Syntax — v1 Minimum Scope

**Status**: 設計中(2026-05-25、user direction「block 要素に CSS class / 属性を 1 行で適用」反映)
**Pipeline position**: minimum scope(behavior contract の前提)
**Related**:
- `docs/development/notation-redesign-2026-05/00-overview-and-principles.md`(4 原則)
- `docs/development/notation-redesign-2026-05/01-notation-catalog.md` §1.2.5 装飾系 directive
- `src/features/markdown/block-directive-attrs.ts`(既存 `{...}` parser、`.class` `#id` `key=value` 受付)
- `src/features/ast/decompose-pkc.ts:687 buildBlockNode`(既存 7 種 directive 分岐 + 未知 fallback)
- `src/features/ast/render-html.ts:222`(`AstSection` → `<section class="pkc-section-callout">`)
- `src/core/ast/index.ts`(AST schema 2.0)

---

## 1. なぜこの記法が必要か

### 1.1 既存の空白

PKC Markdown catalog §1.2.5「装飾系 directive」 を読むと、**conditional / comment / blank line marker** しか登録されておらず、**複数段落を 1 つの class でまとめる構造記法** が欠けている。

| 既存記法 | 適用範囲 | 限界 |
|----------|---------|------|
| `:::section{role=note}` | semantic callout(role が必須、role 値で固定 CSS 当たる) | 「ただの装飾箱」 を作りたいときに semantic role が邪魔 |
| `:::paragraph{align=center indent=2}` | **単段落** の align / indent | 複段落をまとめる用途には使えない |
| `:::figure{id=fig-1}` | 図版 caption 構造 | caption / 採番が必須、装飾用途には重い |
| inline `:text:bold,red:` (catalog #34) | inline span 装飾、限定 vocabulary | block 要素には適用不可 |

### 1.2 User 要求(2026-05-25)

> 複数 paragraph をまとめて CSS class でくくりたい。
> 図版 caption ではなく、ただの「強調 box」「重要 callout」など。
> user CSS と連携できる任意 class 名で。

これを実現するには現状 HTML 直書き `<div class="...">` しかなく、markdown らしさが失われる。

### 1.3 哲学整合(simple-first 原則適用)

`00-overview` §0.2 原則 1「**simple-first**」:

> simple 記法が一級市民、formal は機械 emit 用 serializer
> 可換性が成立すれば formal が "正典" である必要はない

user 直接 feedback(2026-05-25)「**結構使う頻度高い、インライン記法に近い簡単な記法を寛容パースでサポート**」 を受けて、本 spec は **simple-first 2-tier 設計** にする:

| Tier | 形 | 用途 |
|------|---|------|
| **Tier 1: simple** | `:::.highlight.important\nbody\n:::`(名前なし、点連結 class) | 人間が日常 typing(高頻度) |
| **Tier 2: formal** | `:::block{.highlight .important #id key=v}\nbody\n:::` | AI / 機械 emit(canonical) |

可換性: 両 tier とも同じ `AstFormatBlock` に正規化。canonicalize で **default は formal 寄せ**(diff-friendly、原則 5)。

---

## 2. 提案 syntax(2-tier、simple-first)

### 2.0 Tier 1 simple(高頻度、人間 typing)

最短形:
```markdown
:::.highlight.important
第 1 段落。

第 2 段落も同じ class くくり。
- list も OK
:::
```

**寛容パース** で以下 variation を全部受け付け(全て同じ AST):

```markdown
:::.highlight.important              ← packed(空白なし、point 連結、最短)
::: .highlight .important            ← space 区切り
::: {.highlight .important}          ← Pandoc fenced div 互換
::: highlight                        ← 単 class(`.` 省略許容)
:::.highlight#myid                   ← `.cls` + `#id` packed
::: .highlight #myid                 ← space + `#id`
```

**inline `:text:bold,red:` (catalog #34) との symmetric**:

| inline | block |
|--------|-------|
| `:text:bold,red:` | `:::.bold.red\nbody\n:::` |
| 3 `:` markers + class CSV + `:` | 3 `:::` markers + `.class.class` + `:::` |
| 1 token | multi-paragraph |

### 2.1 Tier 2 formal(AI emit / canonical)

全 attrs:
```markdown
:::block{.highlight .important #note-1 indent=2 align=center custom=value}
content
:::
```

- canonical AI emit form(`:::name{attrs}` formal 統一原則、catalog §1.6 継承)
- `#id` / `key=value` / `flag` も含む(Tier 1 simple は `.cls` `#id` のみ受付、`key=value` は formal 必要)
- canonicalize default: simple → formal 寄せ(diff friendly)。user 設定で simple 保持も可(future)

### 2.2 共通仕様(両 tier)

| 項目 | 値 |
|------|---|
| AST kind | `format-block`(同一) |
| HTML 出力 | `<div class="pkc-format-block ..." data-pkc-format-block ...>` |
| nest parse | 完全再帰(段落 / list / table / 他 directive 全て) |
| close marker | `:::` 単独行 |

### 2.3 directive 名「block」 選定理由(Tier 2 のみ、Tier 1 は無名)

| 候補 | 評価 |
|------|------|
| `:::format` | format は意味が広すぎる(file format? text format?)|
| `:::div` | html 由来、markdown らしくない、非開発者に不親切 |
| `:::group` | CSS Grid / Flex「group」 と将来衝突する余地、layout 機能と混同 |
| `:::wrap` | 「wrap」 は word-wrap / wrap-around と混同しやすい |
| **`:::block`** ✅ | **「装飾されたひとかたまり」 を直接表す、markdown / docs 世界で意味が明確、既存 `:::section` (semantic) と意味が被らない** |
| 無名 `::: {...}` (Pandoc 風) | `:::name{attrs}` formal 統一原則(catalog §1.6)を破る、PKC 内一貫性損なう |

### 2.4 既存 directive との衝突確認

`section / figure / quote / if / paragraph / break / comment` と `block` は **意味も名前も非衝突**。`decompose-pkc.ts:687 buildBlockNode` の switch 文に `case 'block':` 追加 + `:::<dot/empty>` opener 認識を parser に追加で対応。

### 2.5 寛容パース実装方針

opener 行 regex を以下に拡張(既存 `BLOCK_OPEN_RE` を継承して 1 階層 fallback):

```ts
// Tier 2 formal: `:::block{...}` (既存 BLOCK_OPEN_RE で既に match、case 'block': 追加で対応)
// Tier 1 simple variations:
const TIER1_VARIATIONS = [
  /^:::\.([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*)(?:#([A-Za-z_][\w-]*))?\s*$/, // :::.cls.cls#id
  /^:::\s+([A-Za-z_][\w-]*(?:\s+[A-Za-z_.#][\w-]*)*)\s*$/,                     // ::: cls cls #id
  /^:::\s*\{([^}]*)\}\s*$/,                                                     // ::: {.cls #id}
];
```

regex match 結果を `parseBlockDirectiveAttrs` 同等の `BlockDirectiveAttrs` に正規化 → AST 生成は formal と同一経路。

### 2.6 attrs 仕様(既存 `parseBlockDirectiveAttrs` 再利用)

`:::block{...}` の `{...}` 内部は既存 parser をそのまま使用:

| 形式 | 意味 | 出力 |
|------|------|------|
| `.cls-name` | class 名(複数可、ABC 順 canonical) | `<div class="pkc-format-block cls-name ...">` |
| `#id-name` | id | `<div id="id-name">` |
| `key=value` | data attr | `<div data-pkc-<key>="<value>">` |
| `flag` | boolean | `<div data-pkc-<flag>>`(空 attr)|

**特殊解釈 key**(以下のみ):
- `indent=<N>`(N は 1〜10 integer)→ `data-pkc-indent="N"` + CSS で `padding-left: <N>em`(既存 `:::paragraph{indent=N}` と同じ規約)
- `align=<left|center|right|justify>` → `data-pkc-align="..."` + CSS

**禁止 key**(security / collision):
- `style`(XSS)
- `on*`(event handler)
- `class`(`.cls` form で書け)
- `id`(`#id` form で書け)
- `tag` / `kind`(将来予約)

未知 key は `data-pkc-<key>` 出力(任意 metadata)。

### 2.7 HTML 出力(canonical)

```markdown
:::block{.highlight .important #note-1 indent=2 align=center custom=value}
content
:::
```
↓
```html
<div class="pkc-format-block highlight important"
     id="note-1"
     data-pkc-format-block
     data-pkc-indent="2"
     data-pkc-align="center"
     data-pkc-custom="value">
  <p>content</p>
</div>
```

**attrs 出力順 canonical**(diff friendly、原則 5):
1. `class`(class 名 ABC 順、`pkc-format-block` 必ず先頭)
2. `id`
3. `data-pkc-format-block`(marker)
4. `data-pkc-*`(key ABC 順)

### 2.8 内側 parse 仕様

既存 `:::section{...}` と同じ **完全再帰 parse**(`decompose-pkc.ts:618` の `decomposeBlocks(innerBlocks, vars)` 呼び出しを継承)。段落 / list / table / 他 `:::name{...}` 全て nest 可。

---

## 3. AST 表現

`src/core/ast/index.ts` に新 node 追加:

```ts
/**
 * Block-level format wrapper(2026-05-25、v2.3 拡張)。
 *
 * `:::block{.cls1 .cls2 #id key=value}` を represent。複数段落 / list / table /
 * 他 directive 等任意 block を children に含める。
 *
 * AstSection との違い:
 *   - AstSection.role は **semantic role**(note / warning / tip 等)で固定 CSS が当たる
 *   - AstFormatBlock は **任意 user-defined class** を持ち、style 適用は user CSS 責任
 */
export interface AstFormatBlock extends AstNodeBase {
  kind: 'format-block';
  /** class 名(`.cls` form の集約、canonical ABC sorted)。 */
  classes: readonly string[];
  /** id(`#id` form)。 */
  blockId?: string;
  /** 数値 indent(1〜10、`indent=N` form、`data-pkc-indent="N"` に出力)。 */
  indent?: number;
  /** align(`align=left|center|right|justify`、`data-pkc-align` に出力)。 */
  align?: 'left' | 'center' | 'right' | 'justify';
  /** その他 attrs(key ABC 順、`data-pkc-<key>` 出力)。 */
  kvs?: Readonly<Record<string, string | boolean>>;
  /** 内部 block 列(再帰 nest 可)。 */
  children: readonly AstBlock[];
}
```

`AstBlock` union に追加。

---

## 4. round-trip 設計(4 経路 byte-equivalent)

| 経路 | 入力 → 出力 | 検証点 |
|------|-----------|--------|
| **MD → HTML** | `:::block{.x #y}\nA\n:::` → `<div class="pkc-format-block x" id="y" data-pkc-format-block><p>A</p></div>` | `render-html.ts` 追加 case |
| **HTML → MD** | 上記 HTML → `:::block{.x #y}\nA\n:::` | `parse-html.ts` で `data-pkc-format-block` 認識、`render-markdown.ts` で復元 |
| **MD → IR → MD stable** | `:::block{.x #y}` → AST → `:::block{.x #y}` 完全一致 | canonical attrs 順、idempotent |
| **IR → HTML → IR stable** | AST → HTML → AST 完全一致(deep equal) | `parse-html.ts` の AST 復元精度 |

**byte-equivalent 比較**(tag 比較ではなく)で 4 経路 test 必須(reform-2026-05 wave 10 §6 規律、tag 比較で改行 bug 見逃した教訓)。

---

## 5. 5 surface CSS 適用

base.css に追加:

```css
/* Block-level format wrapper(2026-05-25) */
.pkc-format-block { /* container 自身は不可視、内部 block を class で装飾 */ }
.pkc-format-block[data-pkc-indent="1"] { padding-left: 1em; }
.pkc-format-block[data-pkc-indent="2"] { padding-left: 2em; }
/* ... 10 まで */
.pkc-format-block[data-pkc-align="center"] { text-align: center; }
.pkc-format-block[data-pkc-align="right"]  { text-align: right; }
.pkc-format-block[data-pkc-align="left"]   { text-align: left; }
.pkc-format-block[data-pkc-align="justify"] { text-align: justify; }
```

**5 surface mirror**(CLAUDE.md §9 規約):
1. **center pane(detail-presenter)**: base.css 経由 ✅
2. **Viewer popup(rendered-viewer)**: inline `<style>` に同 rule mirror 必須
3. **Split View preview**: base.css 経由 ✅(sourceLineAnchors 経路)
4. **entry-window**: base.css 経由 ✅
5. **monitor surface**: 範囲外(markdown render しない、monitor は metric 表示専用)

user 任意 class(`.highlight` 等)は user 側 CSS が責任、本 system は `.pkc-format-block` + `data-pkc-*` の予約名のみ責任。

---

## 6. 既存 PKC catalog への追加(同 commit)

`docs/development/notation-redesign-2026-05/01-notation-catalog.md` §1.2.5 装飾系 directive に追加:

```markdown
| 26 | block format wrapper | — | `:::block{.cls #id indent=N align=A} content :::` | `FormatBlock{classes, blockId, indent, align, kvs, children}` | occasional | 📝 NEW |
```

simple 形なし(formal-only、原則 1 catalog §0.2 許容)。

---

## 7. v1 含まない(意図的除外)

| 項目 | 理由 |
|------|------|
| inline `:text:` vocabulary 拡張(任意 class 受付) | 別 spec(future wave)、scope 限定 |
| `:::block{...}` の simple 短縮形 | 頻度 low、原則 1「simple 形定めない許容」 |
| `style="..."` 直書きサポート | XSS、`.class` 経由を強制 |
| 任意 HTML tag override(`tag=section` 等) | v1 は `<div>` 固定 |
| docx / pptx export 完全対応 | v1 は HTML / markdown / IR の 3 経路のみ、export は future |
| LineMap thread for Split View source-sync 完全保持 | best effort、完全 sync は future |

---

## 8. test plan(MUST pass)

`tests/features/ast/format-block.test.ts` 新規:

| Test case | 確認内容 |
|-----------|---------|
| `md-to-html-basic` | `:::block{.x}\nA\n:::` → 正規 HTML |
| `md-to-html-all-attrs` | `.cls1 .cls2 #id indent=2 align=center custom=v flag` → 全 attr 出力 |
| `md-to-html-canonical-order` | 入力 attrs 順 random → 出力 ABC 順固定 |
| `md-to-html-nested` | `:::block{.outer}\n:::block{.inner}\n A\n:::\n:::` → 二重 nest |
| `md-to-html-with-section` | `:::block{.x}\n:::section{role=note}\n A\n:::\n:::` → mixed |
| `html-to-md-basic` | 1 を逆 parse |
| `html-to-md-all-attrs` | 2 を逆 parse |
| `md-stable-round-trip` | MD → IR → MD で同一 byte |
| `ir-stable-round-trip` | IR → HTML → IR で deep equal |
| `forbidden-keys-rejected` | `style="..."` `onclick=...` は parse 失敗 / silent drop |
| `indent-out-of-range` | `indent=15` → 10 に clip + warning |
| `unknown-key-passthrough` | `custom=value` → `data-pkc-custom="value"` |
| `5-surface-parity`(Playwright) | center / Viewer / Split View / entry-window で同 visual |

**最低 13 test case**(reform-2026-05 wave 10 §4「10 件以上」 規律遵守)。

---

## 9. 実装順序(TDD)

1. `src/core/ast/index.ts` に `AstFormatBlock` interface 追加(type のみ、impl 0 行)
2. `tests/features/ast/format-block.test.ts` test 13 件を red 状態で先に書く
3. `src/features/ast/decompose-pkc.ts:687 buildBlockNode` の switch に `case 'block':` 追加
4. `src/features/ast/render-html.ts` の switch に `case 'format-block':` 追加
5. `src/features/ast/render-markdown.ts` の switch に逆経路追加
6. `src/features/ast/parse-html.ts` で `data-pkc-format-block` marker 認識
7. `src/features/markdown/base.css` に CSS rule 追加 / Viewer popup mirror
8. 13 test case all green
9. Playwright 5-surface parity test 追加(`tests/playwright/format-block-parity.spec.ts`)

---

## 10. 設計まとめ(user 判断仰ぎ)

**設計判断 fix(user 「頻度高い、寛容パース」 feedback 反映)**:
- Tier 1 simple: `:::.cls.cls\nbody\n:::`(+ 寛容 variation 6 種、§2.0)
- Tier 2 formal: `:::block{.cls #id key=v}\nbody\n:::`(§2.1)
- AST: `AstFormatBlock` 新規 node(§3)
- HTML: `<div class="pkc-format-block ...">`(§2.7 / §5)
- indent: 1〜10 整数段階(既存 `:::paragraph{indent=N}` precedent)
- nest: 完全再帰(既存 `:::section` precedent)
- canonicalize default: simple → formal 寄せ(diff friendly)

**確認したい分岐 2 個**:

- **Q1**: directive 名 `block` で OK?(Tier 2 formal の名前。他案: `format` / `wrap` / `box`)
- **Q2**: Tier 1 simple の最短形は `:::.cls.cls`(point packed)で OK?(他案: `::.cls.cls`(2 colon)/ `::: .cls .cls` だけ(packed なし) / `:.cls.cls:`(inline 完全 symmetric、`:::` でなく `:` 単独))

回答後、実装に進む(spec §9 TDD 順、最低 13 test case + 5 surface parity)。

---

## 11. doc lifecycle 自己 binding

- 本 doc を `docs/development/INDEX.md` Active spec に同 commit で登録
- `docs/development/notation-redesign-2026-05/01-notation-catalog.md` §1.2.5 に item #26 追加
- `docs/release/CHANGELOG_v2.3.0.md` に「Block-level format wrapper syntax v1」 を landing 時に 1 行追記
- 関連 doc: `docs/spec/ast-commutative-ir.md` に `AstFormatBlock` link 追加
