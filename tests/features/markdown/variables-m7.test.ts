/**
 * M-7(2026-05-08、wave-10-2 Phase 2):Variables `{{vars.x}}` の unit test。
 *
 * Spec(`markdown-dialect-extensions-spec-2026-05.md` §3.6 + OQ-6):
 *   - frontmatter `vars.<key>` を本文 `{{vars.<key>}}` で展開
 *   - 展開 timing は render 時(parse 時ではない、env.vars 経由で値受領)
 *   - 未定義変数は visible warning(`<span class="pkc-variable-undefined">`)
 *   - escape:`\{{vars.x}}` で literal `{{vars.x}}` を出力
 *   - code span / fenced 内では rule が走らない(他 inline 拡張と同 contract)
 *   - `{{macros.x}}` 等 vars 以外は Phase 2 では未対応 = literal
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { extractVars } from '@features/markdown/frontmatter';

describe('extractVars (frontmatter helper)', () => {
  it('nested object 形式から vars を抽出', () => {
    const body = ['---', 'vars:', '  project: ALPHA-7', '  client: Acme', '---', '本文'].join('\n');
    expect(extractVars(body)).toEqual({ project: 'ALPHA-7', client: 'Acme' });
  });

  it('flat dot-notation 形式から vars を抽出', () => {
    const body = ['---', 'vars.project: ALPHA-7', 'vars.client: Acme', '---', '本文'].join('\n');
    expect(extractVars(body)).toEqual({ project: 'ALPHA-7', client: 'Acme' });
  });

  it('nested + flat 併用、flat が優先(後勝ち)', () => {
    const body = [
      '---',
      'vars:',
      '  project: NESTED',
      'vars.project: FLAT',
      '---',
    ].join('\n');
    expect(extractVars(body)).toEqual({ project: 'FLAT' });
  });

  it('quoted string をアンエスケープ', () => {
    const body = ['---', 'vars:', '  q: "hello world"', '---'].join('\n');
    expect(extractVars(body).q).toBe('hello world');
  });

  it('frontmatter なし → 空 record', () => {
    expect(extractVars('普通の本文だけ')).toEqual({});
  });

  it('vars 不在の frontmatter → 空 record', () => {
    const body = ['---', 'title: Hello', '---'].join('\n');
    expect(extractVars(body)).toEqual({});
  });
});

describe('M-7 Variables `{{vars.x}}` rendering', () => {
  it('基本展開:vars が定義済なら値で置換', () => {
    const html = renderMarkdown('プロジェクト {{vars.project}} について', {
      vars: { project: 'ALPHA-7' },
    });
    expect(html).toContain('プロジェクト ALPHA-7 について');
    expect(html).not.toContain('{{vars.project}}');
  });

  it('未定義変数:visible warning span で残す', () => {
    const html = renderMarkdown('未定義は {{vars.unknown}} で警告', { vars: {} });
    expect(html).toContain('class="pkc-variable-undefined"');
    expect(html).toContain('title="未定義変数: vars.unknown"');
    expect(html).toContain('{{vars.unknown}}');
  });

  it('vars opt 自体未指定 → 全て未定義扱い', () => {
    const html = renderMarkdown('{{vars.x}}');
    expect(html).toContain('pkc-variable-undefined');
    expect(html).toContain('{{vars.x}}');
  });

  it('行内多重展開', () => {
    const html = renderMarkdown('{{vars.a}} と {{vars.b}}', { vars: { a: 'A', b: 'B' } });
    expect(html).toContain('A と B');
  });

  it('escape:`\\{{vars.x}}` で literal 出力(展開しない)', () => {
    const html = renderMarkdown('\\{{vars.x}}', { vars: { x: 'EXPANDED' } });
    expect(html).toContain('{{vars.x}}');
    expect(html).not.toContain('EXPANDED');
  });

  it('vars 以外(`{{macros.x}}`)は Phase 2 では literal', () => {
    const html = renderMarkdown('{{macros.signature}}', { vars: { signature: 'X' } });
    expect(html).toContain('{{macros.signature}}');
    expect(html).not.toContain('class="pkc-variable-undefined"');
  });

  it('code span 内でも展開される(2026-05-08 hotfix で trade-off):escape は `\\{{vars.x}}`', () => {
    // pre-process 段階で text 置換するため、inline backtick code span 内も
    // 展開される(L-2/L-6 等の content 内でも展開させるための trade-off)。
    // user が literal で残したい場合は `\{{vars.x}}` で escape。
    const html = renderMarkdown('`{{vars.x}}`', { vars: { x: 'EXPANDED' } });
    expect(html).toContain('<code>EXPANDED</code>');
    // escape 形式は literal で残る
    const escaped = renderMarkdown('`\\{{vars.x}}`', { vars: { x: 'EXPANDED' } });
    expect(escaped).toContain('{{vars.x}}');
    expect(escaped).not.toContain('EXPANDED');
  });

  it('fenced code 内では展開しない', () => {
    const html = renderMarkdown('```\n{{vars.x}}\n```', { vars: { x: 'EXPANDED' } });
    expect(html).toContain('<pre>');
    expect(html).toContain('{{vars.x}}');
    expect(html).not.toContain('EXPANDED');
  });

  it('改行を跨ぐ {{vars.x\\nname}} は展開しない', () => {
    const html = renderMarkdown('{{vars.\nbroken}}', { vars: { broken: 'X' } });
    // 展開されず、literal として残る(改行込み)
    expect(html).not.toContain('class="pkc-variable-undefined"');
  });

  it('値内の HTML は escape されて表示される(XSS 安全)', () => {
    const html = renderMarkdown('{{vars.x}}', { vars: { x: '<script>alert(1)</script>' } });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('inline markdown と併用可', () => {
    const html = renderMarkdown('**{{vars.name}}** さん', { vars: { name: '田中' } });
    expect(html).toMatch(/<strong>田中<\/strong>/);
  });

  it('全 13 ケース matrix:展開 / 未定義 / escape / 衝突回避 / 文字種', () => {
    const cases: { input: string; vars: Record<string, string>; expectContain?: string; expectNotContain?: string; describe: string }[] = [
      { input: '{{vars.x}}', vars: { x: 'V' }, expectContain: 'V', describe: '基本展開' },
      { input: '{{vars.漢字key}}', vars: {}, expectNotContain: 'pkc-variable-undefined', describe: '非 ASCII key は不一致(literal)' },
      { input: '{{vars.x}} {{vars.x}}', vars: { x: 'V' }, expectContain: 'V V', describe: '同 var 多重展開' },
      { input: '{{vars.empty}}', vars: { empty: '' }, expectNotContain: 'pkc-variable-undefined', describe: '空文字値は展開済(warning なし)' },
      { input: '本文 {{vars.cjk}} 末尾', vars: { cjk: '日本語' }, expectContain: '本文 日本語 末尾', describe: 'CJK 値' },
      { input: '{{vars.emoji}}', vars: { emoji: '🎉' }, expectContain: '🎉', describe: '絵文字値' },
      { input: '{{ vars.x }}', vars: { x: 'V' }, expectContain: 'V', describe: '内側空白許容' },
      { input: '{{vars.}}', vars: {}, expectNotContain: 'pkc-variable-undefined', describe: '空 key は literal' },
      { input: '{{export.format}}', vars: {}, expectContain: '{{export.format}}', describe: 'vars 以外 literal' },
      { input: '`{{vars.x}}`', vars: { x: 'V' }, expectContain: '<code>V</code>', describe: 'code span 内も展開(trade-off)' },
      { input: '`\\{{vars.x}}`', vars: { x: 'V' }, expectContain: '{{vars.x}}', describe: 'escape で literal' },
      { input: '==xxx {{vars.x}} xxx==', vars: { x: 'V' }, expectContain: '<mark>xxx V xxx</mark>', describe: 'highlight 内で展開' },
      { input: '[[em:{{vars.x}}]]', vars: { x: 'V' }, expectContain: '<em class="pkc-em-dot">V</em>', describe: 'em-dot 内で展開' },
      { input: '{{vars.X-Y}}', vars: { 'X-Y': 'V' }, expectContain: 'V', describe: 'hyphen key' },
      { input: '{{vars.snake_case}}', vars: { snake_case: 'V' }, expectContain: 'V', describe: 'underscore key' },
      { input: '{{vars.unknown}}', vars: {}, expectContain: 'pkc-variable-undefined', describe: '未定義 warning' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input, { vars: c.vars });
      if (c.expectContain) expect(html, c.describe).toContain(c.expectContain);
      if (c.expectNotContain) expect(html, c.describe).not.toContain(c.expectNotContain);
    }
  });
});
