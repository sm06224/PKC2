/**
 * @vitest-environment happy-dom
 *
 * OneNote 送信拡張の payload builder(pure)unit test。
 * 設計正本: docs/development/onenote-export-extension-design-2026-07.md
 *   - 会議メモ markdown サブセット → well-formed XHTML
 *   - `![..](asset:k)` 画像 → img part(上限 5、超過は警告 + 省略)
 *   - `[..](asset:k)` 添付(録音)→ object part(上限 1)
 *   - 未受領 asset → 警告(送信は可能なまま)
 *   - multipart 組み立て(Presentation + binary parts + 終端 boundary)
 */
import { describe, it, expect } from 'vitest';
import {
  buildOneNotePage,
  buildMultipart,
  base64ToBytes,
  MAX_IMAGE_PARTS,
  type DeliveredAsset,
} from '../../PKC2-Extensions/onenote/src/onenote-payload';

function assets(entries: Record<string, Partial<DeliveredAsset>>): Map<string, DeliveredAsset> {
  const m = new Map<string, DeliveredAsset>();
  for (const [k, v] of Object.entries(entries)) {
    m.set(k, { mime: v.mime ?? 'image/png', filename: v.filename ?? `${k}.png`, base64: v.base64 ?? 'QUJD' });
  }
  return m;
}

const MEMO = [
  '# 定例会議',
  '',
  '議題は **予算** と *日程*。`code` も。',
  '',
  '- 決定事項 A',
  '- [資料](https://example.com/doc)',
  '',
  '> 注意書き',
  '',
  '| 項目 | 値 |',
  '| --- | --- |',
  '| a | 1 |',
  '',
  '```python',
  'print("x")',
  '```',
  '',
  '録音: [rec.webm](asset:kaud)',
  '',
  'スクショ: ![board](asset:kimg)',
].join('\n');

describe('buildOneNotePage', () => {
  it('markdown サブセットを well-formed XHTML に変換する', () => {
    const page = buildOneNotePage({
      title: '定例会議 2026-07-17',
      markdown: MEMO,
      assets: assets({ kaud: { mime: 'audio/webm', filename: 'rec.webm' }, kimg: {} }),
      createdIso: '2026-07-17T10:00:00Z',
    });
    // XML として parse できる = well-formed(OneNote API 要件)
    const doc = new DOMParser().parseFromString(page.xhtml, 'text/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(page.xhtml).toContain('<title>定例会議 2026-07-17</title>');
    expect(page.xhtml).toContain('<h1>定例会議</h1>');
    expect(page.xhtml).toContain('<b>予算</b>');
    expect(page.xhtml).toContain('<i>日程</i>');
    expect(page.xhtml).toContain('<code>code</code>');
    expect(page.xhtml).toContain('<li>決定事項 A</li>');
    expect(page.xhtml).toContain('href="https://example.com/doc"');
    expect(page.xhtml).toContain('<td>a</td>');
    expect(page.xhtml).toContain('print("x")');
    expect(page.warnings).toEqual([]);
  });

  it('録音は object part(data-attachment)、画像は img part(data-render-src)になる', () => {
    const page = buildOneNotePage({
      title: 't',
      markdown: '録音: [rec.webm](asset:kaud)\n\n![b](asset:kimg)',
      assets: assets({ kaud: { mime: 'audio/webm', filename: 'rec.webm' }, kimg: { filename: 'b.png' } }),
    });
    expect(page.parts.map((p) => p.name)).toEqual(['file1', 'img1']);
    expect(page.xhtml).toContain('data-attachment="rec.webm"');
    expect(page.xhtml).toContain('data="name:file1"');
    expect(page.xhtml).toContain('type="audio/webm"');
    expect(page.xhtml).toContain('data-render-src="name:img1"');
  });

  it('画像 6 枚目以降と添付 2 個目は省略 + 警告(part 上限)', () => {
    const many = Array.from({ length: 7 }, (_, i) => `![i${i}](asset:k${i})`).join('\n\n')
      + '\n\n[a1](asset:a1)\n\n[a2](asset:a2)';
    const a: Record<string, Partial<DeliveredAsset>> = { a1: { mime: 'audio/webm', filename: 'a1.webm' }, a2: { mime: 'audio/webm', filename: 'a2.webm' } };
    for (let i = 0; i < 7; i++) a[`k${i}`] = { filename: `i${i}.png` };
    const page = buildOneNotePage({ title: 't', markdown: many, assets: assets(a) });
    expect(page.parts.filter((p) => p.name.startsWith('img'))).toHaveLength(MAX_IMAGE_PARTS);
    expect(page.parts.filter((p) => p.name.startsWith('file'))).toHaveLength(1);
    expect(page.warnings.some((w) => w.includes('5 枚まで'))).toBe(true);
    expect(page.warnings.some((w) => w.includes('1 個まで'))).toBe(true);
    // 省略分は本文にプレースホルダとして残る(黙って消えない)
    expect(page.xhtml).toContain('[画像(省略):');
    expect(page.xhtml).toContain('[添付(省略):');
  });

  it('未受領 asset は警告 + プレースホルダ(送信自体は可能)', () => {
    const page = buildOneNotePage({ title: 't', markdown: '[rec](asset:missing)', assets: new Map() });
    expect(page.parts).toHaveLength(0);
    expect(page.warnings.some((w) => w.includes('未受領'))).toBe(true);
    expect(page.xhtml).toContain('[添付: rec]');
  });

  it('同じ asset の複数参照は 1 part を再利用する', () => {
    const page = buildOneNotePage({
      title: 't',
      markdown: '![a](asset:k)\n\n![b](asset:k)',
      assets: assets({ k: {} }),
    });
    expect(page.parts).toHaveLength(1);
    expect(page.xhtml.match(/data-render-src="name:img1"/g)).toHaveLength(2);
  });
});

describe('buildMultipart', () => {
  it('Presentation + binary parts + 終端 boundary を組む', () => {
    const page = buildOneNotePage({
      title: 't',
      markdown: '[rec](asset:kaud)',
      assets: assets({ kaud: { mime: 'audio/webm', filename: 'rec.webm', base64: 'QUJD' } }),
    });
    const { contentType, bodyParts } = buildMultipart(page, 'BOUNDARY');
    expect(contentType).toBe('multipart/form-data; boundary=BOUNDARY');
    const text = bodyParts.filter((p): p is string => typeof p === 'string').join('');
    expect(text).toContain('--BOUNDARY\r\nContent-Disposition: form-data; name="Presentation"');
    expect(text).toContain('Content-Type: application/xhtml+xml');
    expect(text).toContain('name="file1"');
    expect(text).toContain('Content-Type: audio/webm');
    expect(text.endsWith('--BOUNDARY--\r\n')).toBe(true);
    // binary part は Uint8Array で 'ABC'
    const bin = bodyParts.find((p): p is Uint8Array => p instanceof Uint8Array)!;
    expect(Array.from(bin)).toEqual([65, 66, 67]);
  });

  it('base64ToBytes round-trip', () => {
    expect(Array.from(base64ToBytes('QUJD'))).toEqual([65, 66, 67]);
  });
});
