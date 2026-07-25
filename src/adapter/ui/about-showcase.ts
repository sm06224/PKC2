// About entry PKC-Markdown showcase(MASTER.md §2 U-19、pgc-113 wave-γ #14)。
//
// user direction(2026-05-23):
//   「Aboutはかなり味気ないよね しかも最近の変更があまり反映されていない
//    もっとPKC-Markdownをドッグフーディングして、積極的にアピールしたほうがいい」
//
// `shell.about_pkc_markdown_showcase_enabled` flag ON 時に renderAboutView が
// container 頭で本 helper を call し、PKC-Markdown の主要 dialect 機能を
// 散りばめた showcase markdown を `renderMarkdown` で render → DOM 化する。
//
// 既存 About view(hand-rendered の version / license / dependencies 等)は
// 完全維持、その手前に showcase section が prepend されるだけ。

import { renderMarkdown } from '../../features/markdown/markdown-render';
import type { AboutPayload } from '../../core/model/about-payload';

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
 *   - `:::details{summary="…"}` 折りたたみ
 *   - markdown standard list / bold / italic / code
 *
 * ⚠ **block directive の attr は必ず brace 形 `:::name{k="v"}` で書くこと**。
 * `parseBlockDirectiveOpen`(features/markdown/block-directive-attrs.ts)の
 * 受理形は `^:::name(\{…\})?\s*$` のみで、空白区切りの `:::name k="v"` は
 * 方言として認識されず **本文にそのまま literal 表示**される。実際 2026-07-25
 * の視覚監査まで `:::details summary="…"`(brace なし)のまま出荷されており、
 * 空コンテナ初回起動の About で `:::details summary=…` と `:::` が見えていた。
 * showcase に dialect を足すときは
 * `tests/adapter/about-pkc-markdown-showcase.test.ts` の「視覚監査 pin」群
 * (render 後の DOM を assert し、`:::` の literal 漏れも検出する)が守る ──
 * markdown 文字列の存在チェックだけでは同じ壊れを再び見逃す。
 *
 * ⚠ **`{{vars.x}}` を「記法の説明」として書くときは `\{{vars.x}}` と escape する**。
 * vars 展開は inline code span の中でも効くため(markdown-render.ts:1160 の
 * 明示的な trade-off)、escape しないと About 自身に「未定義変数」の赤い
 * 警告マーカーが出る。これも 2026-07-25 の視覚監査まで出荷されていた。
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

:::details{summary="折りたたみ block も使えます"}
\`:::details\` で native \`<details>\` element を生成、summary attr で
タイトルを明示。本文には markdown を完全に書けるので、よくある FAQ や
「詳細は別途…」 系の長い文章に便利。
:::

## Releases

最近の release 情報は下の "Releases" section に build 時
\`docs/release/CHANGELOG_v*.md\` を parse した結果が出ます。

:::section{role=note}
**現 release**: \`v{{vars.version}}\` ({{vars.recent_release_count}} 件の最近
release を About に内包 / build commit \`{{vars.commit}}\`)。
**{{vars.dependency_count}} 件**の runtime dependency と
**{{vars.dev_dependency_count}} 件**の dev dependency を含む。
:::

> このパラグラフは [[em:vars 展開]] のデモです。\`\\{{vars.x}}\` 構文で
> About payload(version / commit / 件数等)を markdown 本文へ動的に
> 埋め込めるため、user direction「最近の変更が反映されていない」
> (2026-05-23、U-19)に応えて release 情報をここで自動表示します。

[^1]: Footnote の中身も markdown を書けます。**bold** や [link](https://example.com) も OK。
`;

/**
 * Build the showcase element. Optional `payload` enables `{{vars.x}}` token
 * expansion in SHOWCASE_MARKDOWN so the rendered body reflects the actual
 * build (version / commit / dependency counts) ── pgc-114 wave-γ #15。
 * Omitting `payload` keeps the v2 string with template tokens literal,
 * which is acceptable for tests that only check structural HTML.
 */
export function buildAboutShowcaseElement(payload?: AboutPayload): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'pkc-about-showcase pkc-md-rendered';
  wrap.setAttribute('data-pkc-region', 'about-showcase');

  // pgc-114:`{{vars.x}}` 展開のための vars。payload 不在時(test
  // stub 等)は token をそのまま literal で残す。
  const vars: Record<string, string> = payload
    ? {
        version: payload.version,
        commit: payload.build.commit.slice(0, 8),
        recent_release_count: String(payload.releases?.length ?? 0),
        dependency_count: String(payload.dependencies.length),
        dev_dependency_count: String(payload.devDependencies.length),
      }
    : {};

  // PKC-Markdown features を expose、`currentContainerId` は About だけの
  // 描画なので空文字で OK(transclusion / card 等 cross-entry 機能は使わない)。
  const html = renderMarkdown(SHOWCASE_MARKDOWN, {
    currentContainerId: '',
    sourceLineAnchors: false,
    vars,
  });
  wrap.innerHTML = html;
  return wrap;
}
