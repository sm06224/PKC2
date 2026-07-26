/**
 * `getRevisionCount` の索引化(2026-07-25)。
 *
 * sidebar render は全 entry に対してこれを呼ぶため、素朴な線形走査だと
 * **O(N×M)** になる。15000 entries × 45000 revisions の CPU プロファイルで
 * boot 22.9 秒のうち **15.1 秒(65.5%)** をこの 1 関数が占めていた
 * (同 boot の IDB I/O は 1.5%)。
 *
 * 長く露見しなかったのは `revisions.length === 0` の早期 return があり、
 * `bench-fixtures/c-*.json` が全て revisions 0 件だったため。
 * よってこの test は **必ず revisions を持たせて** 検証する。
 */
import { describe, it, expect } from 'vitest';
import { getRevisionCount, snapshotEntry } from '@core/operations/container-ops';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-25T00:00:00Z';

function entry(lid: string): Entry {
  return { lid, title: lid, body: `body-${lid}`, archetype: 'text', created_at: T, updated_at: T };
}

function makeContainer(entryCount: number, revsPerEntry: number): Container {
  const entries: Entry[] = [];
  for (let i = 0; i < entryCount; i++) entries.push(entry(`e${i}`));
  const revisions = [];
  for (let i = 0; i < entryCount; i++) {
    for (let k = 0; k < revsPerEntry; k++) {
      revisions.push({
        id: `r${i}-${k}`,
        entry_lid: `e${i}`,
        snapshot: JSON.stringify(entries[i]),
        created_at: T,
      });
    }
  }
  return {
    meta: { container_id: 'c', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries, relations: [], revisions, assets: {},
  };
}

describe('getRevisionCount', () => {
  it('件数を正しく返す(索引化しても値は変わらない)', () => {
    const c = makeContainer(3, 4);
    expect(getRevisionCount(c, 'e0')).toBe(4);
    expect(getRevisionCount(c, 'e2')).toBe(4);
    expect(getRevisionCount(c, 'unknown')).toBe(0);
  });

  it('revisions が空なら 0(早期 return の経路)', () => {
    const c = makeContainer(3, 0);
    expect(c.revisions).toHaveLength(0);
    expect(getRevisionCount(c, 'e0')).toBe(0);
  });

  it('revision を足すと、同じ lid の件数が増えて見える(memo が失効する)', () => {
    const c = makeContainer(2, 1);
    expect(getRevisionCount(c, 'e0')).toBe(1);
    // snapshotEntry は新しい revisions 配列を作る = memo キーが変わる
    const c2 = snapshotEntry(c, 'e0', 'rev-new', T);
    expect(getRevisionCount(c2, 'e0')).toBe(2);
    // 元の container を汚していない
    expect(getRevisionCount(c, 'e0')).toBe(1);
  });

  it('全 entry を走査しても線形に収まる(O(N×M) では終わらない規模)', () => {
    // 2000 entries × 20 revisions = 40,000 revisions。
    // 素朴実装なら 2000 × 40,000 = 8,000 万回の比較になる。
    const c = makeContainer(2000, 20);
    const started = Date.now();
    let total = 0;
    for (const e of c.entries) total += getRevisionCount(c, e.lid);
    const elapsed = Date.now() - started;
    expect(total).toBe(40_000);
    // 索引化されていれば数 ms。素朴実装だと桁違いに遅くなる。
    // CI のばらつきを見込んでも 2 桁の余裕がある閾値にしてある。
    expect(elapsed).toBeLessThan(1000);
  });
});
