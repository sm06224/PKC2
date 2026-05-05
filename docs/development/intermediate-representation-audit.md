# 領域 10-3 — Intermediate Representation (IR) audit

**Status**: 📝 **DRAFT** (2026-05-05、領域 10-1 hotfix-5 を契機に起草)
**Trigger**: 領域 10-1 Split View 同期スクロール再実装での block-level anchor 限界発見、IR 経由でしか解けない問題が顕在化
**Related**: `feature-requests-2026-04-28-roadmap.md` §10-3 / §10-5、`pr-206-paused.md`、`markdown-render-scope.md`

---

## 1. なぜ IR が必要になったか(2026-05-05 trigger)

領域 10-1 (Split View) で以下の構造的問題が露呈した:

### 1.1 source line ↔ rendered position の N:M 関係

markdown の意味論として、source 1 行と rendered HTML 1 行は対応しない:

| Source | Rendered |
|---|---|
| `# Heading`(1 source line) | `<h1>` 1 line だが高さは段落と異なる |
| `Para...wrap...wrap`(1 source line) | wrap で visible N rows |
| Table 3 source rows | thead + tbody + cell wrap で更に増える |
| 連続空行(N source lines) | rendered では 0 row(margin に圧縮) |
| ```` ```csv ```` 8 source rows | table-as-fence、cell wrap で更に増える |

これは markdown-it や PKC2 の bug ではなく markdown 仕様の本質。block レベル anchor で「どの block か」までは取れるが、行レベル一致は原理的に達成不能。

### 1.2 markdown-it Token-based anchor の限界

現状実装(領域 10-1 PR 2 + hotfix-1)は markdown-it の Token に `data-pkc-source-line` を `attrSet` し、custom renderer ごとに `collectSourceLineAttrs(token)` で wrapper に伝搬している。問題:

- **renderer ごとに hot fix が必要**:CSV→table の独自 renderer、table_open の `pkc-md-block` wrapper、それぞれで attrs 伝搬を手動書き。新しい custom renderer(clickable image、ToC、per-archetype embed 等)を追加するたびに同じ罠に落ちる
- **token level は markdown-it 固有の構造**:Word / PPT / PDF など他の renderer 経路を将来的に持つとき、同じ anchor 機構を使えない
- **inline content には anchor がない**:paragraph 内 wrap 行や fence 内行ごとは anchor を持たない(tr_open 単位までで限界)

### 1.3 「マーカー要素を生のマークダウンに含ませる」アプローチの根拠

ユーザー提案(2026-05-05):

> 「私がこの問題に立ち向かうとしたら、生のマークダウンに何らかのマーカー要素を含ませてレンダリングし、ブロックレベルでの一致をさせようとすると思います / そう言った時にそれを叶える方向で中間表現を持つというのはアリなのでは?」

**核心**: source ≠ token tree であり、source の各 block に **明示的な ID マーカー** を持たせれば、どの renderer 経路を通っても ID が伝搬する。markdown-it Token の `.map` に頼らない。

具体例(stripe-style):

```markdown
# Heading {#blk-1}

Paragraph {#blk-2}.

| a | b | {#blk-3}
|---|---|
| 1 | 2 |

```js {#blk-4}
function foo() {}
```

または HTML comment 形式:

```markdown
<!-- pkc:block id=1 -->
# Heading

<!-- pkc:block id=2 -->
Paragraph.
```

これらのマーカーが IR token として保持され、HTML / Word / PPT renderer が outermost element に `data-pkc-block-id` を付ける。

---

## 2. IR スコープ(draft)

### 2.1 IR が表現すべきもの

| 要素 | 内容 | source ↔ ID |
|---|---|---|
| Block | paragraph / heading / list / table / fence / blockquote / hr / html / image-ref など top-level structural unit | 1 source block = 1 IR block = 1 stable ID |
| Inline | link / emphasis / code-span / image / asset-ref / entry-ref / per-line span(fence 内) | block 内 child、ID は parent block + offset で導出可能(future work) |
| Marker | source 内の ID 注入記法(`{#blk-N}` or HTML comment) | optional、IR pre-process pass で auto-generate も可 |

### 2.2 IR の token shape(draft)

```typescript
interface IRBlock {
  /** Stable ID (auto-generated unless source-marker provides one) */
  id: string;                      // e.g. "blk-3"
  /** Block type (markdown semantics) */
  kind: 'paragraph' | 'heading' | 'list' | 'list_item' | 'table'
      | 'table_row' | 'fence' | 'blockquote' | 'hr' | 'html'
      | 'image' | 'thematic_break' | 'unknown';
  /** Source line range [startLine, endLineInclusive] */
  sourceRange: [number, number];
  /** For headings */
  level?: number;
  /** For fences / code blocks */
  language?: string;
  /** For tables */
  align?: ReadonlyArray<'left' | 'center' | 'right' | null>;
  /** Children (lists / tables / blockquotes are nested) */
  children?: IRBlock[];
  /** Inline tokens (paragraphs / headings / table cells) */
  inlines?: IRInline[];
  /** Original source text for this block (round-trip preservation) */
  raw: string;
}

interface IRInline {
  kind: 'text' | 'emphasis' | 'strong' | 'code' | 'link' | 'image'
      | 'asset_ref' | 'entry_ref' | 'permalink' | 'softbreak'
      | 'hardbreak' | 'html_inline';
  text?: string;
  href?: string;
  title?: string;
  children?: IRInline[];
}
```

### 2.3 Renderer 契約

各 renderer(HTML / Word / PPT / Plaintext)は IR を入力に取り、各 block の outermost element に `data-pkc-block-id="<id>"` を付与する義務を負う。

```typescript
interface IRRenderer<TOutput> {
  renderBlock(block: IRBlock): TOutput;
  renderInline(inline: IRInline): TOutput;
}
```

これで「どの renderer を通しても block ID は output に残る」が保証される。領域 10-1 の sync layer は ID lookup でカップリングを切れる:

```typescript
// 現状(markdown-it 固有):
preview.querySelector('[data-pkc-source-line="5"]');

// IR 経由(renderer 不可知):
preview.querySelector(`[data-pkc-block-id="${irBlockIdAtSourceLine(5)}"]`);
```

---

## 3. 段階移行計画(draft)

### Phase 1: IR spec + audit
- 本 doc draft レビュー → spec 確定 → `docs/spec/ir-v1.md` 起こし
- IR token shape / source-marker 記法 / renderer contract を固定
- 既存 markdown-it 経路を IR 経由に置き換える migration plan
- 期間: spec 1〜2 週

### Phase 2: parser layer(markdown → IR)
- `markdown-it parse` 結果を IR token tree に変換する `mdToIR(text): IRBlock[]`
- 既存 token attrs(`data-pkc-source-line` 等)は IR の `sourceRange` から再計算
- 単体テスト中心、render 経路は触らない
- 期間: 2〜3 週

### Phase 3: HTML renderer を IR 経由に
- 現 `renderMarkdown(text)` を `renderHTML(IR.from(text))` に切り替え
- markdown-it 直接 render は internal 経路として残す(deprecation flag)
- `data-pkc-source-line` を `data-pkc-block-id` に置き換える(後方互換 alias 1 release)
- sync layer (`source-preview-sync.ts`) を ID lookup ベースに切り替え
- 期間: 3〜4 週

### Phase 4: 領域 10-1 を IR 上で再構築
- block-level highlight + caret auto-scroll は IR 経由でも同等以上に動作
- inline marker(per-line fence span 等)を **IR レベルで** 追加するか議論
- 期間: 1〜2 週

### Phase 5: Word / PPT renderer の前準備
- IR を入力に Word XML / PPT XML を出力する renderer skeleton
- ID 伝搬 contract が他 renderer でも機能することを実証
- 期間: 大、別 wave(領域 10-5 PKC-Message extension と合流可能)

---

## 4. オープンクエスチョン

| # | 質問 | 提案 / 候補 |
|---|------|-----------|
| Q1 | source-marker の記法 | (a) `{#blk-N}` Pandoc-style、(b) HTML comment `<!-- pkc:block id=N -->`、(c) auto-generate のみ、source markup なし(暗黙) |
| Q2 | ID 安定性 | source の文字を 1 字書き換えても block ID は変わらないべき?それとも reflow に応じて再採番される? |
| Q3 | inline anchor の粒度 | block-only? それとも paragraph 内の per-source-line span も IR で持つ? |
| Q4 | markdown-it 依存をどこまで残すか | parser pass のみ markdown-it を使い token → IR 変換、render は完全自前?あるいは markdown-it renderer をベースにしつつ wrapper 層で attrs 注入? |
| Q5 | round-trip 保証 | IR → markdown source の逆変換も提供するか?(将来 WYSIWYG 対応の前提) |
| Q6 | 既存 archetype との関係 | text / textlog / form / todo の各 archetype は IR をどう活用するか?(textlog は既に独自 token 構造を持つ) |
| Q7 | 他 PKC component との合流 | PKC-Message v2 (領域 10-5) は IR を直接 dispatch する?シリアライズ形式は JSON?CBOR? |

---

## 5. 業界事例調査(2026-05-05、領域 10-1 hotfix-5 と並行で実施)

PKC2 の方向性が独自路線でないことを確認するため、主要 markdown editor の source ↔ preview 同期実装を調査した(Agent 調査、出典 30 件以上 1 次資料あり)。

### 5.1 横軸まとめ

| 戦略 | 採用事例 | N:M 解決 |
|---|---|---|
| **block-level anchor + 線形内挿** | VS Code 内蔵 / Markdown Preview Enhanced / Joplin / Marp(VS Code) / Markdown-Edit(新版) | **試みず** (block boundary までで止める) |
| **Pandoc AST sourcepos(IR)** | Codebraid Preview のみ | block 単位までで止める(IR でも N:M は解いていない) |
| **scroll fraction(比率)** | StackEdit / Dillinger / Markdown-Edit(旧版) | **誰も試みない**、image / table で必ず破綻 |
| **WYSIWYG / inline render**(問題回避) | Typora / Obsidian Live Preview / Bear / Notion / Zettlr | 構造的に問題が発生しない |
| **top element matching** | iA Writer | top alignment 1 点に局所化、下方向はずれを許容 |

### 5.2 業界の 4 つの法則

1. **N:M 問題を「解いた」事例はゼロ**。最も真面目な Codebraid ですら block 単位までで止めている。
2. **Source map は markdown-it / Pandoc などの parser token に source line を仕込み、HTML 属性に書き出すのがデファクト**(`data-line` / `data-source-line` / `data-pos` / `source-line` と命名は様々だが構造同じ)。
3. **scroll fraction 単独は破綻パターン**。image / table / math block / collapsed details で必ず壊れる。多くの editor が "fraction → block anchor" へ移行した記録がある。
4. **「同期」の最良 UX は「同期しないで済む」**。Typora / Obsidian Live Preview / Bear / Zettlr / Notion はそもそも preview pane を排除している。

### 5.3 IR 導入は overkill かどうか

- **IR を真面目に通している事例は Codebraid Preview のみ**。Pandoc AST という既存の重量級 IR を借りており、ゼロから自作している例はゼロ。
- **markdown-it の token 列をそのまま IR と見做す**(VS Code パターンの拡張)が最小コストで業界事例も多い。
- **Phase 1 spec 起こし時の重要設計判断**:本 audit が想定している `IRBlock { id, kind, sourceRange, ... }` 型 vs markdown-it `state.tokens` 直接利用、を比較検討する必要がある。後者で十分なら IR 専用層を作る ROI は低い。

### 5.4 領域 10-1 の最終形(hotfix-5 で着地)に対する業界の支持

- block-level anchor + caret highlight + caret 追従 editor scroll = **VS Code / Joplin と同型**
- 「行レベル一致を諦める」判断 = **業界全体の方向**
- ⇄ toggle button = VS Code の `markdown.preview.scrollPreviewWithEditor` / `scrollEditorWithPreview` 設定の UI 化
- caret 行 highlight = VS Code の `markdown.preview.markEditorSelection` / `code-active-line` class と同じ概念

PKC2 が独自に発明した部分はゼロで、業界の堅実な実装パターンの組み合わせ。

### 5.5 業界事例から学ぶ「やってはいけない」(IR Phase 2 以降の警戒事項)

1. **boolean lock でループ防止**:VS Code が `scrollDisabledCount`(counter)に変更した理由 — typing 中の event burst で boolean は必ず beat される
2. **hidden 要素を filter しない**:Joplin issue #9920 で `<details>` 閉じ時に scroll target が暴れた事例。IR レベルでも `display:none` / collapsed / 0 サイズの除外は必須
3. **block 内部の行精度を保証する API を出す**:N:M 問題の本丸。**一切公開しない**契約にして、user に「保証しない」と明示する(本 doc §1.1)

### 5.6 IR が業界より一歩進む可能性のある領域

調査で「IR があれば改善する」という業界の声 / 自分達の要件 が見えた領域:

- **dual-cursor / dual-marker**(preview 側に fake caret 表示):block highlight の上位互換、preview 側から caret 位置を逆引きするのに block ID lookup が必要
- **outline navigator**(heading-only navigation):IR の heading kind フィルタで簡単に実装可能
- **複数 renderer 経路(HTML / Word / PPT)で同一 ID 伝搬**:領域 10-5 PKC-Message extension dispatch の前提
- **debug overlay**:IR token tree を visualize する `?pkc-debug=ir-source-map` 系(reform-2026-05 §debug-via-url-flag-protocol に整合)

これらが Phase 4 / 5 の主要動機になる。

## 6. 関連 doc

- `pr-206-paused.md` — 行レベル sync 試行の保留経緯(verification methodology が paused 理由として記録、本 doc はそこに無い root cause 整理を補完)
- `markdown-render-scope.md` — 拡張時の source-line anchor 規約(IR 移行後は ID 規約に置き換わる)
- `feature-requests-2026-04-28-roadmap.md` §10-3 / §10-5 — IR + extension dispatch の roadmap entry
- `USER_REQUEST_LEDGER.md` — IR ニーズの user 発端記録

---

## 7. 次のアクション

1. 本 draft を user に共有 → スコープ / Q1〜Q7 への方針合意を得る
2. `docs/spec/ir-v1.md` を spec として起こす(本 draft を昇格 + 詳細化)
3. Phase 1 spec landing 後、Phase 2 parser layer 着手
4. 領域 10-1 hotfix-5 で着地した「block 対応ハイライト」は **IR 移行までの中間状態** として明示し、`source-preview-sync.ts` の header にもその旨を記録(完了済 2026-05-05)
