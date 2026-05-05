# Markdown rendering scope — archetype contract

**Status**: spec(handover-grade)
**Updated**: 2026-04-29

## Contract

PKC2 は markdown を **複数の archetype の body / description フィールド**
で render する。markdown を render するすべての surface は CSS class
`.pkc-md-rendered` を要素に付与する。

### markdown を render する archetype と surface

| Archetype | Field | Presenter | DOM class |
|---|---|---|---|
| `text` | `body` | `detail-presenter.ts` | `pkc-md-rendered` |
| `textlog` | 各 log entry の `text` | `textlog-presenter.ts` | `pkc-md-rendered` |
| `todo` | `description`(parsed body の `description`) | `todo-presenter.ts` | `pkc-md-rendered` |
| `folder` | `body`(folder description) | `folder-presenter.ts` | `pkc-md-rendered` |

### markdown を render **しない** archetype

| Archetype | 理由 |
|---|---|
| `form` | 構造化 fields(name / checked / note)。`note` も markdown は適用しない(plain text) |
| `attachment` | binary asset、preview のみ。 markdown 概念なし |
| `generic` | escape hatch、生 string のみ |
| `opaque` | 不可視データ、render しない |

ユーザー視点: 「**TEXT 系の archetype(TEXT / TEXTLOG / TODO / FOLDER)
は markdown を理解する**」と覚えれば良い。 form / attachment 系は
markdown を持たない。

## なぜ contract として明文化するのか

- 新しい markdown 拡張(table interactivity / 方言 / プラグイン等)を
  実装するとき、**どの surface に作用するか** が一目で分かる
- `.pkc-md-rendered` selector で scope を絞れば自動的に正しい範囲を
  カバーできる
- 新 archetype を追加するときに「これは markdown 系か?」の判断
  根拠になる(yes なら presenter で `pkc-md-rendered` を付与)

## 拡張時の規約

新しく markdown を render する surface を追加する場合:

1. presenter で `renderMarkdown()` を呼んで生成した HTML を
   `<div class="pkc-md-rendered">…</div>` の中に置く
2. 既存の他クラス(`pkc-view-body`、`pkc-todo-description` 等)と
   併記して構わない
3. `.pkc-md-rendered` を付与すれば、本 contract に登録された
   markdown 拡張(コピーボタン、media viewer、table interactivity
   等)が自動で適用される

新 markdown 拡張を実装する場合:

1. selector は `.pkc-md-rendered xxx` を起点にする
2. 例外として markdown を render しないが似た見た目を持つ要素
   (例: kanban の表) には適用したくない場合、その scope の
   class を別に取る

## 拡張時の source-line anchor 規約(領域 10-1 PR 2、2026-05-05)

`renderMarkdown(text, { sourceLineAnchors: true })` を opt-in で
渡すと、内部 helper `tagSourceLines` が block-level token に
`data-pkc-source-line` / `data-pkc-source-end` 属性を `token.attrSet`
で書き込む。これは split editor の caret ↔ preview 同期スクロール
(`source-preview-sync.ts`)が「caret 行 → 該当 preview block」を
逆引きするための anchor。

**問題**: markdown-it の default renderer は `token.attrs` を
rendered element に自動コピーするが、`md.renderer.rules.<type>` で
独自実装した custom renderer が **HTML 文字列を直接組み立てて
return する**場合、`token.attrs` は **silent に捨てられる**。すると
preview block に anchor が無い → sync layer が caret 行を見失う。

**規約**: custom renderer を新設または変更する際、以下を必ず守る。

1. 必ず `collectSourceLineAttrs(token)`(`markdown-render.ts` から
   export)を呼んで attr 文字列を取得する
2. その文字列を **outermost element** に splice する。
   inner element に付けても sync layer は動くが、ブロック全体を
   highlight する規約と合わなくなる(子要素だけが highlight される)

```ts
// 良い例(領域 10-1 PR 2 で確立)
md.renderer.rules.my_block = function (tokens, idx, options, env, self) {
  const token = tokens[idx]!;
  const sourceLineAttrs = collectSourceLineAttrs(token);
  return `<div class="my-wrapper"${sourceLineAttrs}>${innerHtml}</div>`;
};

// 悪い例(anchor 消失、sync layer が壊れる)
md.renderer.rules.my_block = function (tokens, idx, options, env, self) {
  const token = tokens[idx]!;
  return `<div class="my-wrapper">${innerHtml}</div>`;  // ← attrs 消失
};
```

**block 単位の anchor が user の体感と合わない場合**、
`SOURCE_LINE_TOKEN_TYPES` Set に該当 token type(`tr_open` など、行
単位や cell 単位)を追加して anchor 粒度を細かくする。領域 10-1
PR 2 で `tr_open` を追加したのは、長い table の row click が全て
table_open の行に jump して使えなかったため。

**関連 reform doctrine**:
- `visual-state-parity-testing.md` §6 — 描画と生成の分離 assert
- `pr-206-paused.md` — block 単位 anchor の限界(過去 paused 理由)
- 本 §「source-line anchor 規約」が拡張開発側の防御線

**将来の IR 経路への配慮(2026-05-05、領域 10-3 着手前の予防線)**:
領域 10-3 で内部 IR(intermediate representation)を導入する際、
HTML / Word / PPT renderer が同一 IR から派生するように再構成
する計画。その時に source-line anchor 概念は IR 経路でも維持され
るべきもので、「**どの renderer 経路を通っても、生成 HTML には
同じ `data-pkc-source-line` 属性が outermost element に乗る**」
契約を変えない。

そのため `markdown-render.ts` から **token-agnostic な
`makeSourceLineAttrs(start, end)`** を export しており、IR walker
が来たときに直接 `makeSourceLineAttrs(irNode.startLine, irNode.endLine)`
を呼ぶ移行経路を確保している。markdown-it Token に依存する
`collectSourceLineAttrs(token)` は薄い wrapper で、IR 経路では
別の equivalent helper(`collectSourceLineAttrsFromIR(node)` 等)
を新設する想定。階層を「がちがちに固める」のは避け、入口だけ
generic 化して、IR の具体仕様が決まったら自然に乗り換えられる
形にしている。`source-preview-sync.ts` 側は DOM 属性しか見て
いないので、renderer 切り替えに完全に不可知。

## 参照

- 実装中央: `src/features/markdown/markdown-render.ts` の
  `renderMarkdown()`
- 拡張集約点(行番号 / sort / filter / コピー / media viewer 等):
  - `src/adapter/ui/table-interactive.ts` (PR #204)
  - `src/adapter/ui/media-viewer.ts` (PR #203)
  - `src/features/markdown/markdown-render.ts` の `wrapWithCopyButton`
    (PR #196)
- archetype 一覧: `src/core/model/record.ts`、CLAUDE.md
