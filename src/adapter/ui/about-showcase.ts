// About entry PKC-Markdown showcase(MASTER.md §2 U-19、pgc-113 wave-γ #14)。
//
// user direction(2026-05-23):
//   「Aboutはかなり味気ないよね　しかも最近の変更があまり反映されていない
//    もっとPKC-Markdownをドッグフーディングして、積極的にアピールしたほうがいい」
//
// `shell.about_pkc_markdown_showcase_enabled` flag ON 時に renderAboutView が
// container 頭で本 helper を call し、PKC-Markdown の主要 dialect 機能を
// 散りばめた showcase markdown を `renderMarkdown` で render → DOM 化する。
//
// 既存 About view(hand-rendered の version / license / dependencies 等)は
// 完全維持、その手前に showcase section が prepend されるだけ。

import { renderMarkdown } from '../../features/markdown/markdown-render';

/**
 * Showcase markdown content。PKC-Markdown の主要 dialect 機能を一通り
 * 散りばめて、「これが PKC-Markdown でできることだ」と user に視覚で
 * 伝える。new dialect が追加されたらここに 1〜2 例を append すること。
 *
 * 含む dialect:
 *   - `:::section{role=tip}` callout(8 role variant)
 *   - `==highlight==` mark
 *   - `[[em:em-dot]]` 圏点
 *   - `[[ruby:漢字|かんじ]]` ふりがな
 *   - footnote `[^1]`
 *   - table
 *   - `# heading`(toc 連動)
 *   - `:::details summary="…"` 折りたたみ
 *   - markdown standard list / bold / italic / code
 */
const SHOWCASE_MARKDOWN = `# About PKC2 — Powered by PKC-Markdown

PKC2 は ==自分自身を PKC-Markdown で書ける== ── このページ自体が
**dogfooding** の例です。下に主要 dialect の動作例を並べます。

:::section{role=tip}
**Tip**: \`:::section{role=...}\` で 8 種類の callout(summary / info / note /
tip / important / warning / caution / danger)を書けます。
:::

:::section{role=info}
**Info**: callout は本文 markdown を完全に支援するため、リスト・コード・
さらに ==mark== や [[em:em-dot]] もそのまま使えます。
:::

## Inline 修飾

- \`==X==\` で highlight: ==重要部分==
- \`[[em:X]]\` で 圏点(em-dot): [[em:強調したい単語]]
- \`[[ruby:漢字|かんじ]]\` で ふりがな(ruby): [[ruby:漢字|かんじ]]
- footnote 参照[^1]
- 通常の **bold** / *italic* / \`inline code\` / [link](https://example.com)

## Table

| Feature | Status | Notes |
|---------|--------|-------|
| Section callouts | ✓ | 8 role variants |
| Mark / em-dot | ✓ | inline 修飾 |
| Ruby | ✓ | 振り仮名 |
| Footnote | ✓ | 自動採番 |
| TOC | ✓ | h1〜h3 から自動生成 |

:::details summary="折りたたみ block も使えます"
\`:::details\` で native \`<details>\` element を生成、summary attr で
タイトルを明示。本文には markdown を完全に書けるので、よくある FAQ や
「詳細は別途…」 系の長い文章に便利。
:::

## Releases

最近の release 情報は下の "Releases" section に build 時 \`docs/release/
CHANGELOG_v*.md\` を parse した結果が出ます。本 PR で wave-γ #14 までの
13 件の変更も自動的に表示されているはず。

[^1]: Footnote の中身も markdown を書けます。**bold** や [link](https://example.com) も OK。
`;

export function buildAboutShowcaseElement(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'pkc-about-showcase pkc-md-rendered';
  wrap.setAttribute('data-pkc-region', 'about-showcase');
  // PKC-Markdown features を expose、`currentContainerId` は About だけの
  // 描画なので空文字で OK(transclusion / card 等 cross-entry 機能は使わない)。
  const html = renderMarkdown(SHOWCASE_MARKDOWN, {
    currentContainerId: '',
    sourceLineAnchors: false,
  });
  wrap.innerHTML = html;
  return wrap;
}
