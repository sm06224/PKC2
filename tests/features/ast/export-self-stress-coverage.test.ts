/**
 * PR-W24 v4(user 指示「私が与えた MD 以外に自分でも複雑なサンプルを作って
 * テストしてください、一々他の AI で生成して持ってくるの面倒です」):
 *
 * Claude 自前生成の全 PKC notation × ネスト × 行頭 ws 寛容 × malformed の
 * 43 ケース matrix。全 case で以下を assert:
 *
 * 1. **docx literal residue 0**:8 種 marker pattern が docx visible text に
 *    残らない(`ind:` `bl:` `al:` `sb:` `fcap:` sentinel + `:::role{` opener +
 *    `:role:[]` formal + `:text:attrs:` simple + `==X==` raw + `[[ruby:` 等)
 * 2. **HTML round-trip identical**:`html(parse(md)) === html(parse(renderPkc(parse(md))))`
 *    が成立(PKC MD copy → 別 entry 貼付 → 再 render が原本と等価)
 *
 * カテゴリ:
 * - M-* :19 件、単一 marker per カテゴリ(基本動作)
 * - N-* :5 件、ネスト combination(if>quote、section>figure 等)
 * - C-* :4 件、連続行 multi-marker(blank line 無し)
 * - W-* :4 件、行頭 whitespace 寛容(tab / 全角 sp)
 * - E-* :5 件、malformed / edge(unclosed quote、over 50 _、深 nest 等)
 * - R-* :4 件、既存 wave Z feature 回帰防止
 * - U-* :2 件、user complaint pattern(`:::` 散文中 mention 等)
 *
 * 43 cases、wave 規律 §4 の 10 件以上を大きく超過。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { renderAstToHtml } from '@features/ast/render-html';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function docxText(md: string): Promise<string> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) if (m[1]) texts.push(m[1]);
  return texts.join('§');
}

function htmlRoundTrip(md: string): { h1: string; h2: string } {
  const ast1 = parseMarkdownToAst(md);
  const pkc = renderAstToMarkdown(ast1, { mode: 'pkc' });
  const ast2 = parseMarkdownToAst(pkc);
  return { h1: renderAstToHtml(ast1), h2: renderAstToHtml(ast2) };
}

const ALL_RESIDUE_PATTERNS: Array<[string, RegExp]> = [
  ['sentinel', /\b(ind|bl|al|sb|fcap):/],
  ['unparsed `:::role{`', /:::[a-z-]+\{/],
  ['unparsed formal `:role:[`', /:(strong|emphasis|code|strike|sup|sub|lead|caption|span):\[/],
  ['unparsed simple `:text:attrs:`', /:[^:\s[{]+:[a-z0-9_%,#-]+:/],
  ['unparsed `==X==`', /==[^=\s]+==/],
  ['ruby literal `[[ruby:`', /\[\[ruby:/],
  ['fcap literal `^^^`', /\^\^\^/],
  ['comment block `%%%`', /%%%/],
];

const CASES: Array<[string, string]> = [
  // M-* single marker
  ['M-1 +++', '+++\n'],
  ['M-2 _3', '_3\n'],
  ['M-3 __indent', '__インデント\n'],
  ['M-4 ||', '||中央\n'],
  ['M-5 |>', '|>右\n'],
  ['M-6 ==X==', '==mark==\n'],
  ['M-7 ==[red]X==', '==[red]X==\n'],
  ['M-8 ^^X^^', '^^em-dot^^\n'],
  ['M-9 ruby', '[[ruby:漢|か]]\n'],
  ['M-10 :strong:', ':strong:[X]\n'],
  ['M-11 :span:', ':span:[X]{class=foo}\n'],
  ['M-12 :text:simple', ':太字:bold,red:\n'],
  ['M-13 $math$', '$E=mc^2$\n'],
  ['M-14 [^foot]', 'a [^x]\n\n[^x]: footnote\n'],
  ['M-15 :::section', ':::section{role=note}\nbody\n:::\n'],
  ['M-16 :::figure', ':::figure{#f1}\n![alt](pkc://a.png)\n^^^ cap\n:::\n'],
  ['M-17 :::quote', ':::quote{author="A"}\nq\n:::\n'],
  ['M-18 :::if{docx}', ':::if{format=docx}\nx\n:::\n'],
  ['M-19 :::break', ':::break{kind=page}\n'],
  // N-* nested combinations
  ['N-1 if>quote', ':::if{format=html}\n:::quote{author="A"}\nq\n:::\n:::\n'],
  ['N-2 section>figure', ':::section{role=note}\n:::figure{#f}\n![a](pkc://a.png)\n^^^ cap\n:::\n:::\n'],
  ['N-3 if>if>quote', ':::if{format=html}\n:::if{format=html}\n:::quote{author="A"}\nq\n:::\n:::\n:::\n'],
  ['N-4 prose mentions :::', ':::quote{author="A"}\n本文中で :::section や __indent や _3 を言及。\n:::\n'],
  ['N-5 figure inline mix', ':::figure{#f}\n^^test^^ + ==[red]X== + :sup:[2]\n^^^ caption\n:::\n'],
  // C-* multi marker per consecutive lines
  ['C-1 multi indent', '__line1\n__line2\n__line3\n'],
  ['C-2 multi align', '||a\n|>b\n<|c\n'],
  ['C-3 multi blank', '_\n_2\n_3\n'],
  ['C-4 mixed inline', '__本文 ^^em^^ ==mark== :sup:[2] {{vars.x}}\n'],
  // W-* line-leading whitespace tolerance
  ['W-1 tab __', '\t__indent\n'],
  ['W-2 全角 ＿', '　＿indent\n'],
  ['W-3 tab ||', '\t||center\n'],
  ['W-4 tab :::section', '\t:::section{role=note}\nbody\n:::\n'],
  // E-* malformed / edge
  ['E-1 unclosed quote', ':::quote{author="X"\ncontent\n'],
  ['E-2 mismatched attrs', ':::section{role=note\nbody\n:::\n'],
  ['E-3 undef var', '{{vars.undef}}\n'],
  ['E-4 over 50 _', '_500\n'],
  ['E-5 deep nest', ':::if{format=html}\n:::section{role=note}\n:::figure{#f}\n![a](pkc://a.png)\n^^^ cap\n:::\n:::\n:::\n'],
  // R-* existing feature regression
  ['R-1 table', '| h1 | h2 |\n|---|---|\n| a | b |\n'],
  ['R-2 code fence', '```js\nconst x = 1;\n```\n'],
  ['R-3 task list', '- [ ] open\n- [x] done\n'],
  ['R-4 heading + para', '# H1\n## H2\nbody\n'],
  // U-* user complaint pattern
  ['U-1 ::: in prose', '本文中で :::if について語る。次行も。\n'],
  ['U-2 _N various', '_\n_2\n_3\n_100\n'],
];

describe('PR-W24 v4 Claude 自前 stress matrix(43 case、全 PKC notation × nest × edge)', () => {
  for (const [name, md] of CASES) {
    it(`${name}:docx literal residue 0 + HTML round-trip 等価`, async () => {
      const text = await docxText(md);
      for (const [pname, pat] of ALL_RESIDUE_PATTERNS) {
        expect(text, `[${name}] docx leaks ${pname}: ${pat}`).not.toMatch(pat);
      }
      const { h1, h2 } = htmlRoundTrip(md);
      expect(h2, `[${name}] HTML round-trip differs`).toBe(h1);
    });
  }
});
