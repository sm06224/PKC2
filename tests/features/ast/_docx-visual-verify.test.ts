/**
 * @vitest-environment happy-dom
 *
 * PR-V19 視覚的 inspection 用ダンプ。failing assert はせず、生成された
 * .docx を /tmp に配置して中身を grep 可能に。
 */
import { describe, it } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Container } from '@core/model/container';

describe('PR-V19 visual dump', () => {
  it('full feature exercise', async () => {
    const md = `# 第一章タイトル(日本語)

序文です。

## サブ見出し

本文段落 with **bold** and _italic_ and ~~strike~~ and \`code\`.

### サブサブ見出し

#### レベル4

本文。

##### レベル5

本文。

###### レベル6

本文。

##### レベル5(2 番目)

#### レベル4(2 番目)

## サブ見出し(2 番目)

リンク例:[内部](entry:target-entry) と [外部](https://example.com)。

- bullet alpha
- bullet beta
- bullet gamma

1. ordered 一
2. ordered 二

> 引用テキスト。
> 複数行になることもある。

\`\`\`js
const greet = (name: string) => \`Hello, \${name}\`;
\`\`\`

| 列1 | 列2 | 列3 |
|---|---|---|
| データA | データB | データC |
| データ1 | データ2 | データ3 |

水平線の前:

---

水平線の後。

# 第二章タイトル

第二章の本文。`;
    const container: Container = {
      meta: { container_id: 'cid', title: 't', created_at: 't', updated_at: 't', schema_version: 1 },
      entries: [
        { lid: 'target-entry', title: '対象 entry の日本語タイトル', body: '', archetype: 'text', created_at: 't', updated_at: 't' },
      ],
      relations: [], revisions: [], assets: {},
    };
    const ast = parseMarkdownToAst(md);
    const blob = await astToDocxBlob(ast, { container });
    const buf = Buffer.from(await blob.arrayBuffer());
    mkdirSync('/tmp/docx-visual', { recursive: true });
    writeFileSync('/tmp/docx-visual/out.docx', buf);
    execSync('cd /tmp/docx-visual && rm -rf u && unzip -q out.docx -d u');
    console.log('docx generated:', buf.length, 'bytes, at /tmp/docx-visual/out.docx');
  });
});
