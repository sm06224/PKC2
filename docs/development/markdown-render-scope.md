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

## 参照

- 実装中央: `src/features/markdown/markdown-render.ts` の
  `renderMarkdown()`
- 拡張集約点(行番号 / sort / filter / コピー / media viewer 等):
  - `src/adapter/ui/table-interactive.ts` (PR #204)
  - `src/adapter/ui/media-viewer.ts` (PR #203)
  - `src/features/markdown/markdown-render.ts` の `wrapWithCopyButton`
    (PR #196)
- archetype 一覧: `src/core/model/record.ts`、CLAUDE.md
