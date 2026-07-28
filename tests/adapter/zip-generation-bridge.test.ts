/** @vitest-environment happy-dom */
/**
 * **世代を越える橋** ── ZIP export → import が無損失であることを pin する
 * (2026-07-28、user 方針)。
 *
 * > 「zip インポートとエクスポートで世代を越えればコンバートはできるはず」(user)
 *
 * ## なぜこの pin が要るか
 *
 * 階層ストレージ / 派生層の設計で最大の制約は Invariant 5「互換は双方向」だった。
 * 「旧ビルドが新データを読めない」が塞がりだと考えていたが、**世代間の移動を
 * ストレージ互換ではなく交換形式(ZIP)で担保する**なら、内部表現は自由に変えられる。
 *
 * ただしそれは **ZIP が本当に全部運べる**ときだけ成り立つ。1 次元でも落ちていれば、
 * 「コンバートできる」という前提そのものが崩れ、user のデータが世代を越える途中で
 * 失われる。**戦略の土台なので、想像ではなく test で固定する。**
 *
 * ## 落ちやすい次元を意図的に全部入れる
 *
 * 過去に実際に静かに消えた / 消えかけた次元を優先して並べてある:
 *   - `relations` と `meta.entry_order`(#1022 のサイドカーで実際に消えた)
 *   - `revisions`(順序 `ord` と `bulk_id` ── 差分保存の退役時に順序が失われた)
 *   - `tags` / `color_tag`(additive optional。「知らない読み手が落とす」型)
 *   - todo の `archived` / `date`(本日 12-1 で消える経路を塞いだばかり)
 *   - `assets`(ZIP では別ファイルへ分離されるので、経路が本文と違う)
 */
import { describe, expect, it } from 'vitest';
import type { Container } from '@core/model/container';
import { buildPackageZip, importFromZipBuffer } from '@adapter/platform/zip-package';

const T = '2026-07-01T00:00:00.000Z';

/** 落ちやすい次元を全部埋めた container。 */
function makeRichContainer(): Container {
  return {
    meta: {
      container_id: 'bridge-src',
      title: '世代橋テスト',
      created_at: T,
      updated_at: T,
      schema_version: 1,
      // 手動並べ替えの順序 ── #1022 で実際に消えた次元
      entry_order: ['e3', 'e1', 'e2'],
    },
    entries: [
      {
        lid: 'e1', title: 'テキスト', archetype: 'text',
        body: '# 見出し\n\n本文 **強調** と `code`',
        created_at: T, updated_at: T,
        tags: ['タグA', 'tag-b'],
        color_tag: 'red',
      },
      {
        lid: 'e2', title: 'やること', archetype: 'todo',
        // 12-1 で消える経路を塞いだ次元(date / archived)
        body: JSON.stringify({
          status: 'open', description: '説明文', date: '2026-08-15', archived: true,
        }),
        created_at: T, updated_at: T,
      },
      {
        lid: 'e3', title: '添付', archetype: 'attachment',
        body: '[file.bin](asset:k1)',
        created_at: T, updated_at: T,
      },
    ],
    relations: [
      { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'e2', to: 'e3', kind: 'semantic', created_at: T, updated_at: T },
    ],
    revisions: [
      { id: 'v1', entry_lid: 'e1', created_at: T, snapshot: { title: '旧', body: '旧本文' } },
      { id: 'v2', entry_lid: 'e1', created_at: T, snapshot: { title: '旧2', body: '旧本文2' } },
      { id: 'v3', entry_lid: 'e2', created_at: T, snapshot: { title: '旧todo', body: '{}' } },
    ],
    // base64 の 'PKC2' (assets は ZIP では別ファイルへ出る)
    assets: { k1: 'UEtDMg==' },
  } as unknown as Container;
}

describe('世代を越える橋: ZIP export → import が無損失', () => {
  it('全次元が往復する(relations / entry_order / revisions / tags / color_tag / todo / assets)', async () => {
    const src = makeRichContainer();
    // buildPackageZip → importFromZipBuffer が「ZIP に詰めて取り出す」最短経路
    // (exportContainerAsZip / importContainerFromZip は download / File を挟む)。
    const blob = buildPackageZip(src);
    const result = await importFromZipBuffer(await blob.arrayBuffer());

    expect(result.ok, `unpack が失敗した: ${result.ok ? '' : result.error}`).toBe(true);
    if (!result.ok) return;
    const out = result.container;

    // ── entries: 件数と各列
    expect(out.entries.map((e) => e.lid).sort()).toEqual(['e1', 'e2', 'e3']);
    const e1 = out.entries.find((e) => e.lid === 'e1')!;
    expect(e1.body, '本文が変わった').toBe(src.entries[0]!.body);
    expect(e1.tags, 'tags が落ちた').toEqual(['タグA', 'tag-b']);
    expect(e1.color_tag, 'color_tag が落ちた').toBe('red');

    // ── todo の date / archived(12-1 の次元)
    const todo = JSON.parse(out.entries.find((e) => e.lid === 'e2')!.body);
    expect(todo.date, 'todo の期日が落ちた').toBe('2026-08-15');
    expect(todo.archived, 'todo の archived が落ちた').toBe(true);
    expect(todo.description, 'todo の説明文が落ちた').toBe('説明文');

    // ── relations(#1022 で実際に消えた次元)
    expect(out.relations.length, 'relations の件数が変わった').toBe(2);
    expect(out.relations.map((r) => `${r.from}->${r.to}:${r.kind}`).sort())
      .toEqual(['e1->e2:structural', 'e2->e3:semantic']);

    // ── meta.entry_order(手動並べ替え。同じく #1022 の次元)
    expect(
      (out.meta as unknown as { entry_order?: string[] }).entry_order,
      'entry_order が落ちた ── 手動並べ替えが失われる',
    ).toEqual(['e3', 'e1', 'e2']);

    // ── revisions(件数と順序)
    expect(out.revisions.length, 'revisions の件数が変わった').toBe(3);
    expect(out.revisions.map((r) => r.id), 'revisions の順序が変わった')
      .toEqual(['v1', 'v2', 'v3']);

    // ── assets(ZIP では別ファイルへ分離される = 本文と違う経路)
    expect(Object.keys(out.assets), 'asset が落ちた').toEqual(['k1']);
    expect(out.assets.k1, 'asset の中身が変わった').toBe('UEtDMg==');
  });

  it('container_id は付け替わる(取り込み先で衝突させない)が、中身は同一', async () => {
    const src = makeRichContainer();
    const blob = buildPackageZip(src);
    const result = await importFromZipBuffer(await blob.arrayBuffer());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // import 時に**意図的に変わる 2 つ**を除いて全一致を見る:
    //   - `container_id`: 取り込み先で衝突させないため振り直す
    //     (zip-package.ts「Reassemble container with assets and new cid」)
    //   - `meta.updated_at`: 取り込みという更新が起きた時刻に触れる
    // ⚠ この 2 つ以外が 1 フィールドでも変わったら、それは**世代を越える途中の
    //   データ喪失**である。除外リストを増やすときは、それが本当に
    //   「意図した変化」かを疑うこと。
    const strip = (c: Container): unknown => ({
      ...c,
      meta: { ...c.meta, container_id: '<cid>', updated_at: '<touched>' },
    });
    expect(strip(result.container)).toEqual(strip(src));
  });
});
