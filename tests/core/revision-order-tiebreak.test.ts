/**
 * revisions 配列順が持つ意味を pin する(2026-07-26)。
 *
 * なぜ要るか ── 保存断面の実測(`docs/development/save-write-volume-2026-07-26.md`)で
 * `marker.revOrder`(全 revision id を毎保存で書く)が O(M) の固定費だと分かり、
 * これを core record から外す設計(#2)を検討している。
 *
 * その前提調査で、**revisions 配列順に依存している箇所が 1 つだけある**ことが分かった。
 * `findLatestRevisionIdForLid`(`container-ops.ts:359-371`)の doc:
 *
 * > "Most recent" is defined as the revision with the greatest `created_at` string
 * > among those matching `entry_lid === lid`; **ties are broken by array position
 * > (later wins, matching insertion order)**.
 *
 * 消費側の 3 箇所(`getEntryRevisions` / `:460` / `getRestoreCandidates`)は
 * すべて `created_at` で並べ替えるので順序に依存しない。依存しているのはここだけ。
 *
 * ⚠ **この契約はコメントにしか無く、test で固定されていなかった。**
 * `revOrder` の持ち方を変えると replay 順が変わりうるので、
 * **触る前に契約を pin する**のが本 test の目的である。
 *
 * (`findLatestRevisionIdForLid` は file-local なので、公開 API の
 *  `snapshotEntry` が付ける `prev_rid` を通して観測する)
 */
import { describe, it, expect } from 'vitest';
import { snapshotEntry, getRestoreCandidates } from '@core/operations/container-ops';
import type { Container, Revision } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';
const SAME = '2026-07-26T12:00:00.000Z';

function entry(lid: string): Entry {
  return { lid, title: lid, body: `body-${lid}`, archetype: 'text', created_at: T, updated_at: T };
}

function makeContainer(revisions: Revision[]): Container {
  return {
    meta: { container_id: 'c', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1'), entry('e2')],
    relations: [],
    revisions,
    assets: {},
  };
}

function rev(id: string, lid: string, createdAt: string): Revision {
  return { id, entry_lid: lid, snapshot: JSON.stringify(entry(lid)), created_at: createdAt };
}

describe('revisions 配列順は prev_rid の tie-break として意味を持つ', () => {
  it('created_at が異なるなら、配列順によらず「最も新しい」が prev_rid になる', () => {
    const older = rev('r-old', 'e1', '2026-07-26T10:00:00.000Z');
    const newer = rev('r-new', 'e1', '2026-07-26T11:00:00.000Z');

    // 新しい方を配列の**前**に置いても、created_at で選ばれる
    const c = makeContainer([newer, older]);
    const next = snapshotEntry(c, 'e1', 'r-next', T);
    expect(next.revisions.at(-1)?.prev_rid).toBe('r-new');
  });

  it('🔴 created_at が同一なら、**配列の後ろ**が prev_rid になる(挿入順 = 後勝ち)', () => {
    const first = rev('r-first', 'e1', SAME);
    const second = rev('r-second', 'e1', SAME);

    const c = makeContainer([first, second]);
    expect(snapshotEntry(c, 'e1', 'r-next', T).revisions.at(-1)?.prev_rid).toBe('r-second');

    // 配列順を入れ替えると結果も入れ替わる = 順序が効いていることの直接証明
    const flipped = makeContainer([second, first]);
    expect(snapshotEntry(flipped, 'e1', 'r-next', T).revisions.at(-1)?.prev_rid).toBe('r-first');
  });

  it('tie-break は entry ごとに独立(他 entry の revision に引きずられない)', () => {
    const c = makeContainer([
      rev('r-e2-late', 'e2', '2026-07-26T23:00:00.000Z'),
      rev('r-e1-a', 'e1', SAME),
      rev('r-e1-b', 'e1', SAME),
    ]);
    expect(snapshotEntry(c, 'e1', 'r-next', T).revisions.at(-1)?.prev_rid).toBe('r-e1-b');
  });

  it('🔴 getRestoreCandidates は同着で **先勝ち**(prev_rid とは逆向き)', () => {
    // 2026-07-26: 設計レビューの指摘で判明 ── 配列順に依存する消費者は 2 つある。
    //   findLatestRevisionIdForLid : `created_at >= best` → **後勝ち**
    //   getRestoreCandidates       : `created_at >  existing` → **先勝ち**
    // 向きが逆なので、順序を保つ実装は両方を同時に守らなければならない。
    const a = rev('r-a', 'e-gone', SAME);
    const b = rev('r-b', 'e-gone', SAME);
    // entries に居ない lid = 削除済み扱い
    const base = makeContainer([a, b]);
    const c1: Container = { ...base, entries: [entry('e1')] };
    expect(getRestoreCandidates(c1).map((r) => r.id)).toEqual(['r-a']);

    const c2: Container = { ...c1, revisions: [b, a] };
    expect(getRestoreCandidates(c2).map((r) => r.id)).toEqual(['r-b']);
  });

  it('その entry の revision が無ければ prev_rid は付かない', () => {
    const c = makeContainer([rev('r-e2', 'e2', SAME)]);
    const next = snapshotEntry(c, 'e1', 'r-next', T);
    expect(next.revisions.at(-1)?.prev_rid).toBeUndefined();
  });
});
