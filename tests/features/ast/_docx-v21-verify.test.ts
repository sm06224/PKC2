/**
 * @vitest-environment happy-dom
 *
 * PR-V21:Word 出力の追加 user audit
 *   1. H4 以降は heading style ではなく箇条書きとして (1) / ア / a. を prefix
 *   2. {{vars.x}} の変数展開
 *   3. PKC 拡張記法(`==mark==` / `..em-dot..` / `[[ruby:b|r]]` / `:::section{role}`)
 *      が AST decompose → docx で書式化される
 *   4. 画像 pkc:// / asset: 両形式の embed
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Container } from '@core/model/container';

async function gen(md: string, opts: { container?: Container } = {}, dir = 'docx-v21'): Promise<string> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast, opts);
  const buf = Buffer.from(await blob.arrayBuffer());
  const path = `/tmp/${dir}`;
  mkdirSync(path, { recursive: true });
  writeFileSync(`${path}/out.docx`, buf);
  execSync(`cd ${path} && rm -rf u && unzip -q out.docx -d u`);
  return readFileSync(`${path}/u/word/document.xml`, 'utf-8');
}

describe('PR-V21 docx 追加 audit', () => {
  it('H1-H3 は heading style(Heading1/2/3)で出る', async () => {
    const xml = await gen('# H1\n## H2\n### H3');
    expect(xml).toMatch(/pStyle w:val="Heading1"/);
    expect(xml).toMatch(/pStyle w:val="Heading2"/);
    expect(xml).toMatch(/pStyle w:val="Heading3"/);
  });

  it('H4 以降は heading style **ではなく** 箇条書き形式の段落(prefix + indent)', async () => {
    const xml = await gen('#### L4\n##### L5\n###### L6', {}, 'docx-v21-h456');
    // Heading4/5/6 style は **使われない**(箇条書きに切替)
    expect(xml).not.toMatch(/pStyle w:val="Heading4"/);
    expect(xml).not.toMatch(/pStyle w:val="Heading5"/);
    expect(xml).not.toMatch(/pStyle w:val="Heading6"/);
    // Prefix が text 中に出る
    expect(xml).toContain('(1)');
    expect(xml).toContain('ア ');
    expect(xml).toContain('a. ');
    // indent 属性 (360, 720, 1080)
    expect(xml).toMatch(/<w:ind[^>]+w:left="360"/);
    expect(xml).toMatch(/<w:ind[^>]+w:left="720"/);
    expect(xml).toMatch(/<w:ind[^>]+w:left="1080"/);
  });

  it('変数 {{vars.x}} が展開される', async () => {
    const md = '---\nvars:\n  name: 田中\n  org: PKC\n---\n\nHello {{vars.name}} at {{vars.org}}.';
    const xml = await gen(md, {}, 'docx-v21-vars');
    // 値が展開された text run が存在
    expect(xml).toContain('田中');
    expect(xml).toContain('PKC');
    // literal `{{vars.name}}` が残らない
    expect(xml).not.toContain('{{vars.name}}');
  });

  it('未定義変数は literal `{{...}}` で fallback', async () => {
    const md = 'Hello {{vars.undefined_key}} world.';
    const xml = await gen(md, {}, 'docx-v21-vars-fallback');
    expect(xml).toContain('{{vars.undefined_key}}');
  });

  it('PKC 拡張:==mark== が highlight 付き run', async () => {
    const xml = await gen('text ==marker== text', {}, 'docx-v21-mark');
    // mark = yellow highlight
    expect(xml).toMatch(/<w:highlight w:val="yellow"\/>/);
    expect(xml).toContain('marker');
    expect(xml).not.toContain('==marker==');
  });

  it('PKC 拡張:[[ruby:漢字|かんじ]] が base(rt)で展開', async () => {
    const xml = await gen('読みは [[ruby:漢字|かんじ]] です', {}, 'docx-v21-ruby');
    expect(xml).toContain('漢字(かんじ)');
    expect(xml).not.toContain('[[ruby:');
  });

  it('PKC 拡張:..em-dot.. が italic として', async () => {
    const xml = await gen('text ..emphasized.. text', {}, 'docx-v21-emdot');
    expect(xml).toContain('emphasized');
    expect(xml).not.toContain('..emphasized..');
    // italic marker
    expect(xml).toMatch(/<w:i\/>/);
  });

  it('PKC 拡張:%%hidden%% inline comment は drop', async () => {
    const xml = await gen('visible %%secret%% visible-tail', {}, 'docx-v21-comment');
    expect(xml).not.toContain('secret');
    expect(xml).not.toContain('%%');
  });

  it('H1 なしで H3 が来ても 0.0.X にならない(暗黙の親 = 1)', async () => {
    const xml = await gen('### Heading 3 no parent', {}, 'docx-v21-orphan');
    expect(xml).not.toContain('0.0');
    expect(xml).toContain('1.1.1');
  });

  it('H1 → H2 → H3 → H1 → H2 → H3 の二章で counter が reset(2.1.1)', async () => {
    const md = '# Chap1\n\n## Sec\n\n### Sub\n\n# Chap2\n\n## Sec\n\n### Sub';
    const xml = await gen(md, {}, 'docx-v21-chapters');
    expect(xml).toContain('第1章');
    expect(xml).toContain('第2章');
    expect(xml).toContain('1.1.1');
    expect(xml).toContain('2.1.1');
  });

  it('画像 pkc://<cid>/asset/<key> も埋め込みされる', async () => {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const container: Container = {
      meta: { container_id: 'my-cid', title: 't', created_at: 't', updated_at: 't', schema_version: 1 },
      entries: [{ lid: 'att', title: 'pic', archetype: 'attachment',
        body: JSON.stringify({ name: 'p.png', mime: 'image/png', asset_key: 'k' }),
        created_at: 't', updated_at: 't' }],
      relations: [], revisions: [], assets: { k: PNG },
    };
    const md = '![alt](pkc://my-cid/asset/k)';
    const xml = await gen(md, { container }, 'docx-v21-image-pkc');
    expect(xml).toContain('<w:drawing>');
    const media = execSync('ls /tmp/docx-v21-image-pkc/u/word/media/ 2>/dev/null || echo none', { encoding: 'utf-8' });
    expect(media).toMatch(/\.(png|jpg|gif|bmp)/);
  });
});
