/**
 * @vitest-environment happy-dom
 *
 * PR-V19(2026-05-14、user audit 12 項目)の strict 出力検証。
 * 各項目を unzip した document.xml に対し grep で確認。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Container } from '@core/model/container';

async function gen(md: string, opts: { container?: Container } = {}, dirName = 'docx-v19'): Promise<string> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast, opts);
  const buf = Buffer.from(await blob.arrayBuffer());
  const dir = `/tmp/${dirName}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/out.docx`, buf);
  execSync(`cd ${dir} && rm -rf u && unzip -q out.docx -d u`);
  return readFileSync(`${dir}/u/word/document.xml`, 'utf-8');
}

describe('PR-V19 user audit 全 12 項目検証', () => {
  it('(2)(3) default font は bilingual stack(Inter + Noto Sans CJK JP)、色指定なし(PR-W7 で BIZ UDGothic から更新)', async () => {
    const xml = await gen('# Heading\n\nbody.');
    const stylesPath = '/tmp/docx-v19/u/word/styles.xml';
    const styles = readFileSync(stylesPath, 'utf-8');
    // PR-W7(Wave X P1):欧文 Inter + 和文 Noto Sans CJK JP の bilingual stack
    expect(styles).toContain('Inter');
    expect(styles).toContain('Noto Sans CJK JP');
    // 本文に色指定が無いことを確認(`<w:color w:val=...` が rPrDefault 以外で出ない)
    expect(xml).not.toContain('w:color w:val="363636"');
  });

  it('(5) Heading numbering: 第1章 / 1.1 / 1.1.1 / (1) / アイウ / abc', async () => {
    const md = [
      '# Intro',
      '## Sub',
      '### Subsub',
      '#### Para',
      '##### Item',
      '###### Leaf',
      '##### Item2',
      '#### Para2',
      '# Next chapter',
      '## SubNext',
    ].join('\n\n');
    const xml = await gen(md, {}, 'docx-v19-num');
    expect(xml).toContain('第1章');
    expect(xml).toContain('1.1');
    expect(xml).toContain('1.1.1');
    expect(xml).toContain('(1)');
    expect(xml).toContain('ア');
    expect(xml).toContain('a.');
    expect(xml).toContain('イ'); // 5th level 2nd
    expect(xml).toContain('(2)'); // 4th level 2nd(reset 後)
    expect(xml).toContain('第2章');
  });

  it('(8) PKC 内リンク → 上付き括弧連番 + appendix list', async () => {
    const container: Container = {
      meta: { container_id: 'cid', title: 't', created_at: 't', updated_at: 't', schema_version: 1 },
      entries: [
        { lid: 'src', title: 'Source', body: '', archetype: 'text', created_at: 't', updated_at: 't' },
        { lid: 'target', title: 'Target Entry', body: '', archetype: 'text', created_at: 't', updated_at: 't' },
      ],
      relations: [], revisions: [], assets: {},
    };
    const md = 'See [linked](entry:target) for details.';
    const xml = await gen(md, { container }, 'docx-v19-link-internal');
    expect(xml).toContain('linked');
    expect(xml).toContain('(1)');
    expect(xml).toContain('リンク先一覧'); // appendix heading
    expect(xml).toContain('Target Entry'); // target title in appendix
  });

  it('(8) 外部 hyperlink → ExternalHyperlink 再現', async () => {
    const md = 'Visit [GitHub](https://github.com) site.';
    const xml = await gen(md, {}, 'docx-v19-link-external');
    // hyperlink element
    expect(xml).toMatch(/<w:hyperlink[^>]*>/);
    expect(xml).toContain('GitHub');
    // relationships.xml に link target がある
    const rels = readFileSync('/tmp/docx-v19-link-external/u/word/_rels/document.xml.rels', 'utf-8');
    expect(rels).toContain('https://github.com');
  });

  it('(9) 表ヘッダーに薄 shading(PR-W8 で `EEEEEE` → `F4F4F5` 統一)', async () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
    const xml = await gen(md, {}, 'docx-v19-table');
    expect(xml).toMatch(/<w:shd[^>]+w:fill="F4F4F5"/);
  });

  it('(10) ページ区切り AstBreak(kind=page)→ PageBreak', async () => {
    // 直接 AstDocument を構築(`:::break` syntactical parser wire は別 PR)
    const ast = {
      kind: 'document' as const,
      astVersion: '2.0' as const,
      children: [
        { kind: 'paragraph' as const, children: [{ kind: 'text' as const, value: 'before' }] },
        { kind: 'break' as const, breakKind: 'page' as const },
        { kind: 'paragraph' as const, children: [{ kind: 'text' as const, value: 'after' }] },
      ],
    };
    const blob = await astToDocxBlob(ast);
    const buf = Buffer.from(await blob.arrayBuffer());
    mkdirSync('/tmp/docx-v19-pagebreak', { recursive: true });
    writeFileSync('/tmp/docx-v19-pagebreak/out.docx', buf);
    execSync('cd /tmp/docx-v19-pagebreak && rm -rf u && unzip -q out.docx -d u');
    const xml = readFileSync('/tmp/docx-v19-pagebreak/u/word/document.xml', 'utf-8');
    expect(xml).toMatch(/<w:br w:type="page"\/>/);
  });

  it('(11) H1 は 2 件目以降 page break before', async () => {
    const md = '# First\n\nbody\n\n# Second\n\nbody2';
    const xml = await gen(md, {}, 'docx-v19-h1-break');
    expect(xml).toMatch(/<w:pageBreakBefore\/>/);
  });

  it('(12) 水平線 --- → border-bottom', async () => {
    const md = 'before\n\n---\n\nafter';
    const xml = await gen(md, {}, 'docx-v19-hr');
    // pBdr で bottom border が存在
    expect(xml).toMatch(/<w:pBdr>[\s\S]*<w:bottom[^>]+w:color="666666"/);
  });

  it('(4) 画像 asset 解決 → ImageRun 埋め込み', async () => {
    // 1x1 transparent PNG
    const PNG_1x1_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const container: Container = {
      meta: { container_id: 'cid', title: 't', created_at: 't', updated_at: 't', schema_version: 1 },
      entries: [{
        lid: 'img-att',
        title: 'pic',
        archetype: 'attachment',
        body: JSON.stringify({ name: 'pic.png', mime: 'image/png', asset_key: 'k1' }),
        created_at: 't',
        updated_at: 't',
      }],
      relations: [], revisions: [], assets: { k1: PNG_1x1_B64 },
    };
    const md = 'Image embed: ![alt](asset:k1)';
    const xml = await gen(md, { container }, 'docx-v19-image');
    // ImageRun → <w:drawing> tag
    expect(xml).toContain('<w:drawing>');
    // media folder に画像が入っている(.png / .jpg / .gif / .bmp のいずれか)
    const mediaFiles = execSync('ls /tmp/docx-v19-image/u/word/media/ 2>/dev/null || echo none', { encoding: 'utf-8' });
    expect(mediaFiles).toMatch(/\.(png|jpg|jpeg|gif|bmp)/);
  });
});
