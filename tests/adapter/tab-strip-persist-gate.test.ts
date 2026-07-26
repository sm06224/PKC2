/**
 * @vitest-environment happy-dom
 *
 * `shell.tabs_enabled` OFF のとき tab 状態を **永続化しない**(2026-07-26)。
 *
 * なぜ要るか ── 実測(`docs/development/save-write-volume-2026-07-26.md`):
 * `persistTabState` の書き出し先は container の `__settings__` であり
 * (`ui-prefs.ts:8`「正本 = container の `__settings__` payload `uiPrefs`」)、
 * `setUiPref` → `SET_UI_PREFS` → `__settings__` merge → `SETTINGS_CHANGED`
 * (`SAVE_TRIGGERS` の一員)→ **コンテナ全体の保存**という連鎖になる。
 *
 * `wireTabStrip` は設計上 always-on(tab 履歴をメモリに保持するため)なので、
 * **既定 OFF の opt-in 機能が、全 user の選択ごとに全件書込みを起こしていた**。
 * サイドバーを 1 回クリックするだけで core record が丸ごと put される
 * (5MB コンテナで 5,104 KB、25MB なら 25MB)。
 *
 * メモリ内の記録は残したまま永続化だけ flag に従わせた。本 test はその境界を pin する。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordTabOpen,
  resetTabState,
  getOpenTabs,
  persistTabState,
  restoreTabState,
  clearPersistedTabState,
} from '../../src/adapter/ui/tab-strip';
import { setFlagSource } from '@core/flags';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';

const T = '2026-07-26T00:00:00Z';

function mkEntry(lid: string): Entry {
  return { lid, title: lid, body: '', archetype: 'text', created_at: T, updated_at: T };
}
function mkContainer(): Container {
  return {
    meta: { container_id: 'tg', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [mkEntry('a'), mkEntry('b')],
    relations: [], revisions: [], assets: {},
  };
}

/** flag を差し替えるヘルパ(source は最後に必ず外す)。 */
function setTabsEnabled(on: boolean): void {
  setFlagSource('tab-gate-test', (key) => (key === 'shell.tabs_enabled' ? on : undefined));
}

beforeEach(() => {
  resetTabState();
  clearPersistedTabState();
});
afterEach(() => {
  setFlagSource('tab-gate-test', () => undefined);
});

describe('shell.tabs_enabled OFF では tab 状態を永続化しない', () => {
  it('OFF: recordTabOpen はメモリに残るが、persistTabState は何も書かない', () => {
    setTabsEnabled(false);
    const c = mkContainer();
    recordTabOpen('a', c);
    // 意図(履歴をメモリに保持)は維持される
    expect(getOpenTabs().map((t) => t.lid)).toEqual(['a']);

    persistTabState();

    // 書かれていないので、状態を捨てて復元しても戻らない
    resetTabState();
    expect(restoreTabState(c)).toBeNull();
    expect(getOpenTabs()).toHaveLength(0);
  });

  it('ON: 従来どおり round-trip する(gate が機能を殺していない)', () => {
    setTabsEnabled(true);
    const c = mkContainer();
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    persistTabState();

    resetTabState();
    expect(restoreTabState(c)).toBe('b');
    expect(getOpenTabs().map((t) => t.lid)).toEqual(['a', 'b']);
  });

  it('OFF の間の操作は、ON にした後の保存から普通に溜まる', () => {
    const c = mkContainer();
    setTabsEnabled(false);
    recordTabOpen('a', c);
    persistTabState();          // 書かれない

    setTabsEnabled(true);
    recordTabOpen('b', c);
    persistTabState();          // ここで初めて書かれる(a も一緒に載る)

    resetTabState();
    expect(restoreTabState(c)).toBe('b');
    expect(getOpenTabs().map((t) => t.lid)).toEqual(['a', 'b']);
  });
});
