# PR #196 — Markdown copy button overlay (table + code block)

**Status**: implemented
**Date**: 2026-04-28
**Roadmap**: 領域 7(コピーボタン拡充)— 順 2

User direction:
> 表とコードブロックのコピーボタンの追加、リッチタイプテキストとプレーン
> テキスト両方

## 1. 動機

コードブロック / 表は「コピーして他所に貼る」が頻繁。標準ブラウザの
selection コピーは:
- 表のセル間が連続して 1 行になりがち(TSV 期待が外れる)
- コードブロックは行頭インデントが消える / シンタックス装飾が混入

専用ボタンで:
- **plain**:fenced は raw source、表は TSV(エクセル / Numbers にそのまま)
- **html**:rendered HTML(リッチエディタ — Word, Slack, mail に書式維持)

の両方を multi-MIME で書き込む。

## 2. 実装

### renderer rules(`src/features/markdown/markdown-render.ts`)

```ts
md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const html = renderCsvFence(token.content, token.info);
  if (html !== null) return wrapWithCopyButton(html, 'code');
  const fenceHtml = defaultFence(...);
  return wrapWithCopyButton(fenceHtml, 'code');
};

md.renderer.rules.table_open = (...) =>
  `<div class="pkc-md-block" data-pkc-md-block-kind="table"><button class="pkc-md-copy-btn" data-pkc-action="copy-md-block" data-pkc-copy-kind="table" type="button" aria-label="コピー" title="コピー">⧉</button>${self.renderToken(...)}`;

md.renderer.rules.table_close = (...) =>
  `${self.renderToken(...)}</div>`;
```

`wrapWithCopyButton` は code blocks を `<div class="pkc-md-block">` で
ラップし、絶対配置のコピーボタンを top-right に乗せる。`data-pkc-action`
で action-binder の event delegation に乗る。

### action handler(`src/adapter/ui/action-binder.ts`)

```ts
case 'copy-md-block': {
  const block = target.closest<HTMLElement>('.pkc-md-block');
  const inner = block.querySelector(':scope > pre, :scope > table');
  const plain = extractMdBlockPlainText(inner);
  const html = inner.outerHTML;
  void copyMarkdownAndHtml(plain, html).then((ok) => {
    if (ok) {
      target.setAttribute('data-pkc-flash', 'true');
      setTimeout(() => target.removeAttribute('data-pkc-flash'), 700);
    }
  });
}
```

`extractMdBlockPlainText`:
- `<pre>` → `textContent` 直接(raw code)
- `<table>` → 各 `<tr>` を tab-join、行は newline-join(TSV)
- それ以外 → fallback `textContent`

### CSS (`src/styles/base.css`)

`.pkc-md-block` に position:relative、ボタンは absolute top-right。
hover / focus-within で opacity 0 → 1。touch (`pointer:coarse`) では
常時 opacity 0.85 + tap target 大きめ。成功時は `data-pkc-flash` で
緑フラッシュ 700 ms。

## 3. テスト

新規 `tests/features/markdown/copy-button-overlay-pr196.test.ts`(5 件):
- fenced code block の wrapper + button 属性
- table の wrapper + button 属性、`<table>` 全体を `<div>` がラップ
- inline code は wrap されない
- plain paragraph も wrap されない
- 複数 block それぞれに 1 個ずつ button(N=3 で 3 個)

合計 5971 / 5971 unit pass + 11 / 11 smoke pass。

## 4. 制限と未対応

### iPhone / iPad のバッククォート入力(別 issue)

ユーザー指摘(2026-04-28):
> iPhoneとiPadはコードブロックのバッククォート入力がデフォルトの
> キーボードで対応できていない 入力支援が必要なことが判明
> インラインコードも同様ですね

**コピーボタン(本 PR)** は出力(rendered)側の改善。**入力側**(`` ` ``
や ``` ``` ``` を打ちたい)は別の課題。roadmap 領域 4(編集支援)に
追記済:
- 編集中 textarea の下にスニペット ツールバーを表示(``、```、code
  fence with lang、ペア括弧 等)
- iPhone / iPad で keyboard が出ている時に optionally 表示

優先度の関係で本 PR には含めない。次の PR で対応予定。

## 5. 後方互換性

- markdown 出力に `<div class="pkc-md-block">` ラッパーが追加される
  — 既存の `.pkc-md-rendered table` / `.pkc-md-rendered pre` 等の
  CSS selector は壊れない(child セレクタを使うルールはなく、すべて
  descendant セレクタのため)
- export(html / pdf / markdown bundle)経路は raw markdown を出力する
  ため、コピーボタンの HTML wrapper は永続化されない
- bundle.js +0.7 KB / bundle.css +1.2 KB

## 6. roadmap 残り

- 順 1 ✓ iPhone textarea zoom 抑制(PR #195)
- 順 2 ✓ コピーボタン拡充(本 PR)
- 順 3 戻る進む / Alt+←/→ ナビゲーション
- 順 4 編集支援 indent / brackets / list **+ iPhone/iPad バッククォート入力支援**(2026-04-28 追記)
- 順 5-11 残り領域

## 7. Files touched

- 修正: `src/features/markdown/markdown-render.ts`
  (`fence` rule で `wrapWithCopyButton`、`table_open` / `table_close`
  rule 追加、~30 行)
- 修正: `src/adapter/ui/action-binder.ts`
  (`copy-md-block` action handler + `extractMdBlockPlainText` ヘルパー、
  ~50 行)
- 修正: `src/styles/base.css`
  (`.pkc-md-block` + `.pkc-md-copy-btn` ルール、touch 用 media query、
  ~50 行)
- 修正: `docs/development/feature-requests-2026-04-28-roadmap.md`
  (領域 4 に iPhone/iPad バッククォート入力支援追記)
- 新規: `tests/features/markdown/copy-button-overlay-pr196.test.ts`(5 件)
- 新規: `docs/development/copy-buttons-pr196-findings.md` (this doc)
