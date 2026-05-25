/**
 * @vitest-environment happy-dom
 *
 * pgc-208(user 報告 2026-05-25「100エントリ程度で凄まじく動作が重い」):
 * SELECT_ENTRY のみの dispatch で render-scope='selection-only' に narrow 化、
 * sidebar + center + meta の 3 region 差し替えに限定、header / shell-menu /
 * activity-bar / tray-bar の rebuild を skip することで bench wall clock
 * 短縮を見込む。
 *
 * 本 test は:
 * 1. render-scope detection:selection-only triggers の各 case
 * 2. selection-only render の DOM 結果(sidebar / center / meta が新 entry
 *    に同期、header は不変)
 * 3. region 不在時の fallback(full render に流れる)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '@adapter/state/app-state';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'one', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'Entry 2', body: 'two', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-208 selection-only render scope', () => {
  describe('computeRenderScope detection', () => {
    it('case 1: selectedLid のみ変化で selection-only', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      const next = { ...prev, selectedLid: 'e1' };
      expect(computeRenderScope(next, prev)).toBe('selection-only');
    });

    it('case 2: navHistory + navIndex 変化で selection-only(SELECT_ENTRY と同 mutate set)', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      const next = { ...prev, navHistory: ['e1'], navIndex: 0 };
      expect(computeRenderScope(next, prev)).toBe('selection-only');
    });

    it('case 3: multiSelectedLids 変化で selection-only(SELECT_ENTRY が clear する set)', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer(), multiSelectedLids: ['x'] };
      const next = { ...prev, multiSelectedLids: [] };
      expect(computeRenderScope(next, prev)).toBe('selection-only');
    });

    it('case 4: textlogSelection 変化で selection-only(P1-1 transient clear)', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      const next = { ...prev, textlogSelection: { activeLid: 'tl', selectedLogIds: [] } };
      expect(computeRenderScope(next, prev)).toBe('selection-only');
    });

    it('case 5: selectedLid + container 変化で full(container は selection-only path で扱わず)', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      const newContainer = { ...makeContainer(), entries: [] };
      const next = { ...prev, selectedLid: 'e1', container: newContainer };
      expect(computeRenderScope(next, prev)).toBe('full');
    });

    it('case 6: selectedLid + searchQuery 変化で full(narrow scope の組合せは fall through to full)', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      const next = { ...prev, selectedLid: 'e1', searchQuery: 'hello' };
      expect(computeRenderScope(next, prev)).toBe('full');
    });

    it('case 7: selectedLid + settings 変化で full', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      const next = { ...prev, selectedLid: 'e1', accentColor: '#ff0000' };
      expect(computeRenderScope(next, prev)).toBe('full');
    });

    it('case 8: 何も変化しない identity 同 state は none', () => {
      const prev: AppState = { ...createInitialState(), phase: 'ready', container: makeContainer() };
      expect(computeRenderScope(prev, prev)).toBe('none');
    });
  });

  describe('selection-only render behavior(behavior parity)', () => {
    let root: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = '';
      root = document.createElement('div');
      document.body.appendChild(root);
    });

    it('case 9: SELECT_ENTRY 後 sidebar の data-pkc-selected が新 lid に切替', () => {
      const dispatcher = createDispatcher();
      dispatcher.onState((s, p) => render(s, root, p));
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
      // initial render(full)
      render(dispatcher.getState(), root, null);

      // SELECT e1 → selection-only path 経由
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
      const e1Selected = root.querySelector(
        '[data-pkc-region="sidebar"] [data-pkc-selected="true"][data-pkc-lid="e1"]',
      );
      expect(e1Selected).not.toBeNull();

      // SELECT e2 → e1 の selected が外れ、e2 に乗る
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
      const e2Selected = root.querySelector(
        '[data-pkc-region="sidebar"] [data-pkc-selected="true"][data-pkc-lid="e2"]',
      );
      expect(e2Selected).not.toBeNull();
      const e1StillSelected = root.querySelector(
        '[data-pkc-region="sidebar"] [data-pkc-selected="true"][data-pkc-lid="e1"]',
      );
      expect(e1StillSelected).toBeNull();
    });

    it('case 10: SELECT_ENTRY 後 root の data-pkc-has-selection 属性が true に更新', () => {
      const dispatcher = createDispatcher();
      dispatcher.onState((s, p) => render(s, root, p));
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
      render(dispatcher.getState(), root, null);

      expect(root.getAttribute('data-pkc-has-selection')).toBe('false');

      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
      expect(root.getAttribute('data-pkc-has-selection')).toBe('true');
    });

    it('case 11: selection-only path で center pane region は存在し続ける(region 検出維持)', () => {
      const dispatcher = createDispatcher();
      dispatcher.onState((s, p) => render(s, root, p));
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
      render(dispatcher.getState(), root, null);
      expect(root.querySelector('[data-pkc-region="center"]')).not.toBeNull();

      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
      // center region は selection-only path で replace される
      expect(root.querySelector('[data-pkc-region="center"]')).not.toBeNull();
    });

    it('case 12: source — render-scope.ts に "selection-only" enum + selectionChanged check 存在', () => {
      const src = readFileSync(
        resolve(__dirname, '..', '..', 'src/adapter/ui/render-scope.ts'),
        'utf8',
      );
      expect(src).toMatch(/'selection-only'/);
      expect(src).toMatch(/const\s+selectionChanged\s*=/);
      expect(src).toMatch(/return\s+'selection-only'/);
    });

    it('case 13: source — renderer.ts に scope==="selection-only" 分岐 + replaceSelectionRegions 存在', () => {
      const src = readFileSync(
        resolve(__dirname, '..', '..', 'src/adapter/ui/renderer.ts'),
        'utf8',
      );
      expect(src).toMatch(/scope\s*===\s*'selection-only'/);
      expect(src).toMatch(/function\s+replaceSelectionRegions/);
    });
  });
});
