/**
 * @vitest-environment happy-dom
 *
 * pgc-205 (user 報告 2026-05-24「エクスポート導線が壊れたままだ」):
 *
 * main.ts の export handler が phase='exporting' 中の他 dispatch
 * (SET_THEME / TOGGLE_MENU 等、phase guard 無し reducer)で再 fire し
 * `exportContainerAsHtml` を多重起動していた事故の regression guard。
 *
 * 直接的な main.ts の listener を test するのは難しい(main() 内 closure)
 * ため、本 test は:
 *
 * 1. main.ts に `exportInFlight` guard pattern が存在することを file
 *    string grep で確認(構造的 regression guard)
 * 2. 同等の guard pattern を local に再現し、phase='exporting' 中に
 *    state 変化が複数回起きても export call が 1 回だけになることを assert
 *    (behavior 検証)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const ROOT = resolve(__dirname, '..', '..');
const mainTs = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8');

const TS = '2026-01-01T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-205 export race condition guard', () => {
  it('case 1: main.ts に `exportInFlight` guard 変数が宣言されている(structural)', () => {
    expect(mainTs).toMatch(/let\s+exportInFlight\s*=\s*false/);
  });

  it('case 2: listener が `!exportInFlight` check を行う(structural)', () => {
    expect(mainTs).toMatch(/state\.phase\s*===\s*'exporting'\s*&&\s*state\.container\s*&&\s*!exportInFlight/);
  });

  it('case 3: 多重起動禁止 ── exportInFlight=true を set してから call し、`.finally` で reset(structural)', () => {
    expect(mainTs).toMatch(/exportInFlight\s*=\s*true/);
    expect(mainTs).toMatch(/\.finally\(\s*\(\s*\)\s*=>\s*\{[\s\S]*exportInFlight\s*=\s*false/);
  });

  it('case 4: behavior ── 同等 guard pattern で、phase=exporting 中の複数 state 変化でも export call は 1 回のみ', async () => {
    // main.ts と同じ guard pattern を local に再現。
    let exportInFlight = false;
    let exportCallCount = 0;
    let resolveExport!: () => void;
    const exportPromise = new Promise<void>((r) => { resolveExport = r; });

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });

    dispatcher.onState((state) => {
      if (state.phase === 'exporting' && state.container && !exportInFlight) {
        exportInFlight = true;
        exportCallCount += 1;
        // mock async export
        exportPromise.then(() => {
          dispatcher.dispatch({ type: 'SYS_FINISH_EXPORT' });
        }).finally(() => {
          exportInFlight = false;
        });
      }
    });

    // 1) BEGIN_EXPORT を発火 → phase: ready → exporting
    dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });
    expect(exportCallCount).toBe(1);
    expect(exportInFlight).toBe(true);

    // 2) phase=exporting 中に他 dispatch が複数回発生(theme 切替、menu 開閉等を simulate)
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'SET_THEME_MODE', mode: 'dark' });
    dispatcher.dispatch({ type: 'SET_THEME_MODE', mode: 'light' });

    // 3) いずれも phase は 'exporting' のままで、guard で export call は 1 回のまま
    expect(dispatcher.getState().phase).toBe('exporting');
    expect(exportCallCount).toBe(1);

    // 4) export 完了 → SYS_FINISH_EXPORT → phase: ready
    resolveExport();
    await exportPromise.then(() => Promise.resolve()).then(() => Promise.resolve());
    expect(dispatcher.getState().phase).toBe('ready');
    expect(exportInFlight).toBe(false);
    expect(exportCallCount).toBe(1);
  });
});
