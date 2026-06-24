/**
 * @vitest-environment happy-dom
 *
 * 埋め込み画像の自動サムネ廃止(user direction 2026-06-24):本文に埋め込んだ
 * 画像(`asset:` / `data:`)を card / hero サムネに自動採用するのをやめ、サムネは
 * YAML frontmatter `thumbnail:` 指定時のみ。attachment 画像(ファイル本体)は
 * 「埋め込み画像」ではないのでサムネ維持(contact-sheet 等)。
 */
import { describe, it, expect } from 'vitest';
import { pickImageAssetForEntry } from '@adapter/ui/renderer';
import type { Entry } from '@core/model/record';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
const T = '2026-06-24T00:00:00Z';
const txt = (body: string): Entry => ({ lid: 'e1', title: 'T', body, archetype: 'text', created_at: T, updated_at: T });

describe('pickImageAssetForEntry — 埋め込み画像の自動サムネ廃止', () => {
  it('frontmatter thumbnail: asset を指定 → サムネを返す(step 0 維持)', () => {
    const e = txt('---\nthumbnail: asset:k1\n---\n# Doc\nbody');
    expect(pickImageAssetForEntry(e, { k1: PNG })).toBe(`data:image/png;base64,${PNG}`);
  });

  it('本文埋め込み画像(asset:)だけ・frontmatter 無し → null(自動サムネ廃止)', () => {
    const e = txt('# Doc\n\n![](asset:k1)\nmore');
    expect(pickImageAssetForEntry(e, { k1: PNG })).toBeNull();
  });

  it('本文に data: 埋め込み + frontmatter 無し → null', () => {
    const e = txt(`# Doc\n![](data:image/png;base64,${PNG})`);
    expect(pickImageAssetForEntry(e, {})).toBeNull();
  });

  it('frontmatter 無しの素の text → null(従来から変わらず)', () => {
    expect(pickImageAssetForEntry(txt('# Doc\njust text'), {})).toBeNull();
  });

  it('attachment 画像はサムネ維持(step 1、埋め込みではなくファイル本体)', () => {
    const att: Entry = {
      lid: 'a1', title: 'img',
      body: JSON.stringify({ asset_key: 'k1', mime: 'image/png' }),
      archetype: 'attachment', created_at: T, updated_at: T,
    };
    expect(pickImageAssetForEntry(att, { k1: PNG })).toBe(`data:image/png;base64,${PNG}`);
  });
});
