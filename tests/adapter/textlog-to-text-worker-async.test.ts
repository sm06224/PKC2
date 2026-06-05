/**
 * @vitest-environment happy-dom
 *
 * user bug 報告 2026-05-27「凄まじく重い…遂行は絶対」hotfix verify。
 * `convertTextlogToTextAsync` の挙動:
 *   - 小サイズ body は sync(Promise.resolve 経由でも sync 完了)
 *   - 大サイズ body は worker boot(test env では Worker 不在 → sync fallback)
 *   - abort signal 対応
 *   - onProgress callback
 */

import { describe, it, expect } from 'vitest';
import { convertTextlogToTextAsync } from '@adapter/ui/textlog-to-text-worker-client';
import type { Entry } from '@core/model/record';

const TS = '2026-05-27T10:00:00Z';

function makeTextlogEntry(logCount: number, textLength = 50): Entry {
  const entries = Array.from({ length: logCount }, (_, i) => ({
    id: `log-${i}`,
    text: 'X'.repeat(textLength),
    createdAt: new Date(`2026-05-27T10:${String(i % 60).padStart(2, '0')}:00Z`).toISOString(),
    flags: [],
  }));
  return {
    lid: 'tl1',
    title: 'Test textlog',
    body: JSON.stringify({ entries }),
    archetype: 'textlog',
    created_at: TS,
    updated_at: TS,
  };
}

describe('convertTextlogToTextAsync(user bug 2026-05-27 hotfix)', () => {
  it('case 1: 小サイズ body は sync 完了で result 返却', async () => {
    const ent = makeTextlogEntry(5);
    const result = await convertTextlogToTextAsync(ent, ['log-0', 'log-1', 'log-2']);
    expect(result.title).toContain('Test textlog');
    expect(result.body).toContain('# Test textlog (log extract)');
    expect(result.emittedCount).toBe(3);
  });

  it('case 2: 大サイズ body は worker / sync fallback どちらでも result 返却', async () => {
    const ent = makeTextlogEntry(2000, 200); // ~400KB body
    const selection = Array.from({ length: 100 }, (_, i) => `log-${i}`);
    const result = await convertTextlogToTextAsync(ent, selection, {
      onProgress: () => {
        // happy-dom 環境では Worker 不在 → sync fallback されるので
        // progress は呼ばれないかもしれない、no-op で OK
      },
    });
    expect(result.title).toContain('Test textlog');
    expect(result.emittedCount).toBe(100);
  });

  it('case 3: abort signal 既に aborted → AbortError reject', async () => {
    const ent = makeTextlogEntry(2000, 200);
    const controller = new AbortController();
    controller.abort();
    await expect(
      convertTextlogToTextAsync(ent, ['log-0'], { signal: controller.signal }),
    ).rejects.toThrow(/Aborted/);
  });

  it('case 4: 空 selection でも valid result 返却(emittedCount=0)', async () => {
    const ent = makeTextlogEntry(10);
    const result = await convertTextlogToTextAsync(ent, []);
    expect(result.emittedCount).toBe(0);
    expect(result.body).toContain('Logs: 0 entries');
  });

  it('case 5: non-textlog entry は emittedCount=0 で safe return', async () => {
    const ent: Entry = {
      lid: 't1',
      title: 'Plain text',
      body: 'plain markdown text',
      archetype: 'text',
      created_at: TS,
      updated_at: TS,
    };
    const result = await convertTextlogToTextAsync(ent, ['log-0']);
    expect(result.emittedCount).toBe(0);
  });

  it('case 6: deterministic with explicit `now` option', async () => {
    const ent = makeTextlogEntry(3);
    const fixed = new Date('2026-05-27T00:00:00Z');
    const r1 = await convertTextlogToTextAsync(ent, ['log-0'], { now: fixed });
    const r2 = await convertTextlogToTextAsync(ent, ['log-0'], { now: fixed });
    expect(r1.title).toBe(r2.title);
    expect(r1.body).toBe(r2.body);
  });
});
