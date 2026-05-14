/**
 * @vitest-environment happy-dom
 *
 * PR-V19 user audit:PPT slide split logic 完全再設計 + CSV table 出力 +
 * task list. 実際 slide<N>.xml を unzip + grep で確認。
 */
import { describe, it, expect } from 'vitest';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

async function gen(md: string, dir = 'pptx-v19'): Promise<string[]> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToPptxBlob(ast, { title: 'Test' });
  const buf = Buffer.from(await blob.arrayBuffer());
  const path = `/tmp/${dir}`;
  mkdirSync(path, { recursive: true });
  writeFileSync(`${path}/out.pptx`, buf);
  execSync(`cd ${path} && rm -rf u && unzip -q out.pptx -d u`);
  const slideFiles = execSync(`ls ${path}/u/ppt/slides/slide*.xml | sort`, { encoding: 'utf-8' })
    .trim().split('\n');
  return slideFiles.map((f) => readFileSync(f.trim(), 'utf-8'));
}

describe('PR-V19 PPT slide split logic', () => {
  it('H1 → section 扉スライド title', async () => {
    const xmls = await gen('# Section Title');
    expect(xmls.length).toBe(1);
    expect(xmls[0]).toContain('Section Title');
  });

  it('H1 + H2 → 同 1 枚に subtitle として併記', async () => {
    const xmls = await gen('# Main Section\n\n## Section Subtitle');
    expect(xmls.length).toBe(1); // 同じ扉スライド
    expect(xmls[0]).toContain('Main Section');
    expect(xmls[0]).toContain('Section Subtitle');
  });

  it('H3 → 通常スライド title', async () => {
    const xmls = await gen('# Section A\n\n## Sub\n\n### Slide 1\n\nbody1\n\n### Slide 2\n\nbody2');
    expect(xmls.length).toBe(3); // section扉 + 2 content slide
    expect(xmls[0]).toContain('Section A');
    expect(xmls[0]).toContain('Sub');
    expect(xmls[1]).toContain('Slide 1');
    expect(xmls[1]).toContain('body1');
    expect(xmls[2]).toContain('Slide 2');
    expect(xmls[2]).toContain('body2');
  });

  it('AstBreak(page) → スライド区切り(新スライド開始)', async () => {
    // 直接 AST 構築(readonly array 制約を回避)
    const ast = {
      kind: 'document' as const,
      astVersion: '2.0' as const,
      children: [
        { kind: 'heading' as const, level: 3 as const, children: [{ kind: 'text' as const, value: 'Slide A' }] },
        { kind: 'paragraph' as const, children: [{ kind: 'text' as const, value: 'body A' }] },
        { kind: 'break' as const, breakKind: 'page' as const },
        { kind: 'heading' as const, level: 3 as const, children: [{ kind: 'text' as const, value: 'Slide B' }] },
        { kind: 'paragraph' as const, children: [{ kind: 'text' as const, value: 'body B' }] },
      ],
    };
    const blob = await astToPptxBlob(ast, { title: 'BreakTest' });
    const buf = Buffer.from(await blob.arrayBuffer());
    mkdirSync('/tmp/pptx-v19-break', { recursive: true });
    writeFileSync('/tmp/pptx-v19-break/out.pptx', buf);
    execSync('cd /tmp/pptx-v19-break && rm -rf u && unzip -q out.pptx -d u');
    const files = execSync('ls /tmp/pptx-v19-break/u/ppt/slides/slide*.xml | wc -l', { encoding: 'utf-8' }).trim();
    expect(parseInt(files, 10)).toBeGreaterThanOrEqual(2);
  });

  it('CSV code-block → slide table rendering(addTable 経由)', async () => {
    const md = '### CSV slide\n\n```csv\nA,B,C\n1,2,3\n4,5,6\n```';
    const xmls = await gen(md, 'pptx-v19-csv');
    // pptx の table element は <a:tbl>
    expect(xmls[0]).toMatch(/<a:tbl>/);
    // セルの text content
    expect(xmls[0]).toContain('A');
    expect(xmls[0]).toContain('B');
    expect(xmls[0]).toContain('1');
    expect(xmls[0]).toContain('2');
  });

  it('Task list → ☐ / ☑ prefix で render', async () => {
    const md = '### Tasks\n\n- [ ] open task\n- [x] done task';
    const xmls = await gen(md, 'pptx-v19-task');
    expect(xmls[0]).toContain('☐ open task');
    expect(xmls[0]).toContain('☑ done task');
  });
});
