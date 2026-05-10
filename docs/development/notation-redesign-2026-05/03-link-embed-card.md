# 03. Link / Card / Embed の 4 段階 strength spectrum

## 3.1 motivation

PKC2 における「entry を doc 内で **参照 / 埋込み** する仕組み」は、**情報密度 / 視覚的存在感 / 著者意図** によって 4 段階のスペクトラムを成す。これを simple 記法 で 1 文字の差分で表現可能にすることが目標。

| # | 段階 | semantic | 情報密度 | 視覚的存在感 |
|---|------|---------|---------|-----------|
| 1 | link | 「ここに関連 entry がある」 | 最低(text のみ)| 軽(`<a>` 1 行)|
| 2 | card | 「概要をチラ見せしたい」 | 中(thumbnail + title + excerpt)| 中(枠 / カード)|
| 3 | embed seamless(NEW default)| 「この内容を文書に取り込む」 | 高(本文 inline 結合) | 軽(chrome なし、文書一部) |
| 4 | embed quote | 「他者の文献を引用する」 | 高(本文)+ 出典 chrome | 重(border / attribution) |

## 3.2 記法対応表

| 段階 | simple | formal | IR ノード |
|------|--------|--------|---------|
| link | `[label](entry:LID)` | `:link:[label]{ref="entry:LID"}` | `Link{kind="entry", label, ref}` |
| card | `@[label](entry:LID)` | `:card:[label]{ref="entry:LID"}` | `Card{label, ref}` |
| embed seamless | `![label](entry:LID)` | `:embed:[label]{ref="entry:LID"}` | `Embed{label, ref, mode="seamless"}` |
| embed quote(単一)| `![label](entry:LID){quote}` | `:embed:[label]{ref="entry:LID" mode="quote"}` | `Embed{mode="quote", attrs}` |
| embed quote(群、scope 拡張)| `:::quote{author=… year=…}\n![](entry:A)\n![](entry:B)\n:::` | 同左 | `Directive{name="quote", attrs, children: [Embed, Embed]}` |

**1 文字差分の design**:`[]()` (link) → `@[]()` (card prefix `@`) → `![]()` (embed prefix `!`)。`!` は既存 markdown image と同記号、entry と asset 両方で「埋込み」semantic で統一。

## 3.3 default 動作の重要変更:embed seamless化

### 3.3.1 現状(reform 前)

`![label](entry:LID)` → `<section class="pkc-transclusion">` 内に header + border-left + ↳backlink の "引用 chrome" を被せて render。「外から引いてきた感」が強い、引用専用の用途。

### 3.3.2 reform 後の design

`![label](entry:LID)` → **chrome なし**で本文 inline 結合(seamless)。document 編集者が「他 entry の内容を取り込んで自分の文書の一部にする」用途を default に。

引用 chrome が欲しい場合は明示的 attribute `{quote}` を付与。

### 3.3.3 設計理由

1. **頻度の inverted assumption**:現状の "外から引用" は学術 / 報道など特殊用途、PKC2 想定 user(議事録 / 計画 / 知識集積)では「他 entry の内容を流し込んで結合」用途の方が圧倒的多い
2. **PKC philosophy**:simplicity = 短い記法で frequent な動作を、冗長記法で稀な動作を
3. **breaking change を厭わない方針**(user 確認済):default を user 期待に近づけるために spec 変更
4. **explicit `{quote}` で互換性回復可能**:既存 user は 1 文字付加で従来動作

## 3.4 archetype 別の seamless 動作

`![](entry:LID)` の embed が seamless mode の時、参照先 archetype ごとに以下の動作:

| archetype | seamless render |
|-----------|----------------|
| **TEXT** | body を markdown render、host 文書の段落の一部として inline 結合(chrome なし)|
| **TEXTLOG** | 全 log を時系列 inline で並べる(day section / log article chrome なし、本文だけ流す)|
| **TEXTLOG fragment**(`#log/X`) | 単一 log の本文だけ inline |
| **attachment(image)** | `<img>` 直接(asset 経路と同等の seamless)|
| **attachment(file)** | file アイコン + 名前(現 link 動作)|
| **TODO** | 現 chrome 付き(`pkc-todo-embed`)維持(seamless 想定が薄いため)|
| **FORM / FOLDER / OPAQUE** | link fallback(seamless 不能 archetype)|

quote mode の時は全 archetype で chrome 付き(現状の transclusion render を retain)。

## 3.5 quote mode の付け方(2 つ提供)

### 3.5.1 inline attribute `{quote}`

```markdown
![Smith 2020](entry:cited-paper-X){quote}
```

→ 単一 embed に対して chrome 付き(border-left + 出典 + ↳backlink)。最も簡潔。

### 3.5.2 `:::quote` block directive(scope 拡張)

```markdown
:::quote{author="Smith" year=2020}
![](entry:cited-paper-A)
![](entry:cited-paper-B)
:::
```

→ **複数の embed を 1 つの引用 block にまとめ**、共通 attribution(author / year / source)を block 全体に付与。学術 / 法律 / 報道で「同じ著者の複数文献をまとめて引用」用途に。

block directive の attribute は YAML / Pandoc-style、複数行記法もサポート:

```markdown
:::quote
author: Smith
year: 2020
source: pkc://container-X/origin
---
![](entry:A)
![](entry:B)
:::
```

`---` で attrs と本文を区切る(frontmatter と同記号)、長い属性が読みやすい。

## 3.6 inline / block 切替の 3 ルール適用

embed 系記法は本文の context で inline / block が変わる。`00-overview-and-principles.md` の 3 ルールに照合:

### Rule 1:delimiter 倍化 → 該当しない

inline / block で同記法、parser が自動判定。

### Rule 2:context-dependent → 適用される

```markdown
本文の途中で ![label](entry:LID) を挟む    ← inline 結合(seamless splice)
                                             paragraph 内、文の流れを保つ

![label](entry:LID)                          ← 行単独 = block 結合
                                             文書の独立 block として展開
```

### Rule 3:scope 拡張(複数 → block group)→ 適用される

```markdown
single embed:    ![](entry:A){quote}              ← inline 単独 + chrome
multiple embed:  :::quote{author=...}             ← block group + 共通 chrome
                 ![](entry:A) ![](entry:B)
                 :::
```

## 3.7 card との明確区別

card と embed は **情報密度** で区別される:

| 軸 | card | embed |
|----|------|-------|
| 表示量 | 抜粋(thumbnail + title + 1 行 excerpt)| 本文全体 |
| 用途 | 「概要だけ見せる、詳細は click で別 view」 | 「本文を取り込む、追加 click 不要」 |
| 視覚 | 小カード(1 行〜数行) | 段落〜block(文書の連続部) |
| 移動 | click → 別 view にナビゲート | inline 展開済みでナビゲート不要 |
| 複数並列 | grid 配置で多数並ぶ(10〜100)| 数個 |
| 情報密度設計 | 短く視覚的にまとまる、index doc 向け | 重い、専用 doc 向け |

card 用途例:

```markdown
今月読んだ書籍:
@[](entry:book-1) @[](entry:book-2) @[](entry:book-3) @[](entry:book-4)

→ thumbnail + title + author / year の 4 grid
```

embed seamless 用途例:

```markdown
プロジェクト ALPHA-7 計画書

## 概要
![](entry:alpha-7-overview)         ← 別 entry の概要文を inline 取込み

## メンバー
![](entry:alpha-7-team)              ← 別 entry のメンバー一覧を inline 取込み

## マイルストーン
![](entry:alpha-7-milestones)        ← 別 entry の milestone 一覧を inline 取込み

→ 1 つの entry の中に複数の "components" を組み合わせる、
   composable doc design
```

embed quote 用途例:

```markdown
本論の根拠は以下:

:::quote{author="Smith" year=2020}
![](entry:smith-2020-paper)
:::

これに対し、批判的見解は以下:

:::quote{author="Tanaka" year=2022}
![](entry:tanaka-2022-counter)
:::
```

## 3.8 architecture impact

### 3.8.1 transclusion expander

既存 `expandTransclusions` (transclusion.ts) を拡張:

```typescript
function expandTransclusions(root, ctx) {
  for (const placeholder of root.querySelectorAll('.pkc-transclusion-placeholder')) {
    const ref = placeholder.dataset.pkcEmbedRef;
    const mode = placeholder.dataset.pkcEmbedMode ?? 'seamless';  // NEW
    if (mode === 'seamless') {
      renderSeamlessEmbed(placeholder, ref, ctx);   // NEW、chrome なし
    } else if (mode === 'quote') {
      renderQuoteEmbed(placeholder, ref, ctx);       // 現 transclusion 経路 維持
    }
  }
}
```

- markdown-it の `image_open` rule で `entry:` URL を検出 → `data-pkc-embed-mode` を attribute から決定
- `:::quote` block directive は markdown-it block parser で `Directive{name="quote"}` IR ノードに変換、render 時に内部 embed を quote モードで再帰

### 3.8.2 6 surface 整合性

既存の 6 surface(center pane / Split View live preview / Split View edit-mode preview / Viewer popup / textlog log / 平文 fallback)全部で seamless / quote 両 mode が動作する必要。

CSS は共通 `pkc-transclusion-seamless`(chrome なし)/ `pkc-transclusion-quote`(現 chrome retain)を base.css と Viewer popup inline style 両方に mirror。

### 3.8.3 cycle / depth guard

- 既存の cycle 検出(`embedChain`)は seamless / quote 両 mode で機能、変更なし
- depth ≤ 1 の不変条件も維持(embed 内 embed は link fallback)
- seamless mode 内の `:::quote` block(その中の embed)は quote chrome 付きで render される(network nesting 許容、ただし depth 制約は適用)

## 3.9 移行手順(breaking change)

### 3.9.1 既存 entry への影響

reform 前 `![label](entry:LID)` を書いた user が想定する動作は「引用 chrome 付き embed」(現状)。reform 後はこれが chrome なし seamless になる。

**自動 migration script 案**:

- 既存 entry を scan、`![](entry:...)` を全列挙
- user が「引用としてあった」と判断するなら一括 `{quote}` 付与する option
- 既存 chrome を視覚的に好んでいる user 向けに「default を quote に固定する flag(`embed.default_mode = "quote"`)」を提供、frontmatter / 設定 で declare

### 3.9.2 spec deprecation period

- Phase 1 着地時:default seamless で実装、ただし「**既存 entry 検出 → warning 表示**」(parser が `![](entry:..)` を検出したら inspector で「default 動作変更により表示が変わっている」警告)
- Phase 2 着地時:warning を info-level に格下げ、user が概ね認識した
- 完全 silent は Phase 3 以降

詳細は `09-migration-roadmap.md` で。

## 3.10 設計まとめ + 確定事項

### 確定

- **link / card / embed seamless / embed quote の 4 段階 spectrum**
- **embed default は seamless**(breaking change、explicit `{quote}` で chrome 取り戻し可)
- **`:::quote{attrs}` block directive で複数 embed を引用 group 化**(scope 拡張、新記法)
- **inline / block は context-dependent**(行単独 = block / 文中 = inline、自動判定)
- **archetype 別 seamless 動作 matrix を spec 化**(TEXT inline 結合、TEXTLOG 全 log 並列、image `<img>` 直接 等)

### 議論待ち

- migration script の詳細設計(誰が、いつ、どう実行するか)
- 「default mode を quote にしたい既存 user 向け frontmatter flag」を提供するかの判断
- TODO embed の seamless 化(現状 chrome 維持としているが、user 需要次第)
- network nesting(quote の中の embed の中の seamless 等)の rendering 詳細

## 3.11 レビュー観点

1. **default seamless の判断**:本当に頻度高は seamless か?引用 chrome がほしい用途を default にすべきという反論はあるか?
2. **`{quote}` attribute syntax**:Pandoc / Quarto 系標準と整合しているか?他の syntax(`>!` prefix 等)を採用すべき場合の判断基準は?
3. **`:::quote` block group**:`author / year / source` 等の attribute に他に必要なものはあるか(e.g. `cite-style="apa"` / `quote-type="block|inline"`)?
4. **archetype 別動作**:TODO embed を chrome 維持としたが、seamless にすべきか?他 archetype で漏れているケースは?
5. **migration**:既存 entry に対する自動変換 / warning の運用 mode、user 影響をどう minimize するか?
6. **card と embed の区別**:この 4 段階 spectrum で表現しきれない 5 段階目はあるか(e.g. side-by-side 比較、tab 切替)?
