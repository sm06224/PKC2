/**
 * PR-W10(Wave X P4)用 fixture generator。
 *
 * 各 layout template を docx / pptx に export して /tmp/vtest-templates/
 * に書き出す。後続で `vtest.sh` を call して PNG 化、`docs/manual/images/`
 * に配置する。
 *
 * usage:
 *   npx vitest run tests/features/templates/_generate-template-vtest-fixtures.test.ts
 *   for k in rp pn tc mn ln cp co jl; do
 *     bash scripts/vtest.sh /tmp/vtest-templates/$k.docx /tmp/vtest-templates/$k-docx
 *     bash scripts/vtest.sh /tmp/vtest-templates/$k.pptx /tmp/vtest-templates/$k-pptx
 *   done
 */
import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { astToDocxBlob } from '@features/ast/export-docx';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { getActiveUserTemplates } from '@features/templates/template-flag';

const outdir = '/tmp/vtest-templates';

const LAYOUT_KEYS = ['rp', 'pn', 'tc', 'mn', 'ln', 'cp', 'co', 'jl'];

describe('Generate template vtest fixtures(PR-W10)', () => {
  it('writes 8 layout template fixtures to /tmp/vtest-templates', async () => {
    mkdirSync(outdir, { recursive: true });
    const templates = getActiveUserTemplates();
    for (const key of LAYOUT_KEYS) {
      const t = templates.find((x) => x.key === key);
      if (!t) throw new Error(`template ${key} missing from default`);
      // Template body は manual で使う見本として user 視点で記入された
      // 状態に近い形を出力。空 field は placeholder のまま、`(本文を
      // 書いてください)` は demo 用に内容を仮入れする。
      const ast = parseMarkdownToAst(t.body);
      const docxBlob = await astToDocxBlob(ast);
      const docxBuf = Buffer.from(await docxBlob.arrayBuffer());
      writeFileSync(resolve(outdir, `${key}.docx`), docxBuf);
      const pptxBlob = await astToPptxBlob(ast);
      const pptxBuf = Buffer.from(await pptxBlob.arrayBuffer());
      writeFileSync(resolve(outdir, `${key}.pptx`), pptxBuf);
      writeFileSync(resolve(outdir, `${key}.md`), t.body);
    }
  });
});
