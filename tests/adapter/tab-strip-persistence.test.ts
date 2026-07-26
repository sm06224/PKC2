/**
 * @vitest-environment happy-dom
 *
 * Tab persistence test(pgc-86、MASTER.md §4.3)。
 * - persistTabState / restoreTabState の round-trip
 * - 削除済 entry を skip
 * - active 保存 / 復元
 * - closeActiveTab / reopenLastClosedTab
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTabOpen,
  recordTabClose,
  resetTabState,
  getOpenTabs,
  getActiveTabLid,
  persistTabState,
  restoreTabState,
  clearPersistedTabState,
  closeActiveTab,
  reopenLastClosedTab,
} from '../../src/adapter/ui/tab-strip';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import { setFlagSource } from '@core/flags';

function mkEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text'): Entry {
  return {
    lid, title, body: '', archetype,
    created_at: '2026-05-23T00:00:00Z',
    updated_at: '2026-05-23T00:00:00Z',
  };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 't', title: 't', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 't' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}


// 2026-07-26: `persistTabState` は `shell.tabs_enabled` OFF では書かなくなった
// (既定 OFF の opt-in 機能が、選択のたびに container 全体保存を起こしていたため
//  ── docs/development/save-write-volume-2026-07-26.md)。
// 本ファイルは **永続化そのもの** の round-trip を検証するので flag を ON にする。
beforeEach(() => {
  setFlagSource('tab-persistence-test', (key) => (key === 'shell.tabs_enabled' ? true : undefined));
  resetTabState();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('persistTabState / restoreTabState round-trip', () => {
  it('saves and restores open tabs', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B'), mkEntry('c', 'C')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    recordTabOpen('c', c);
    persistTabState();
    expect(getOpenTabs().length).toBe(3);
    expect(getActiveTabLid()).toBe('c');

    resetTabState();
    expect(getOpenTabs().length).toBe(0);

    const restored = restoreTabState(c);
    expect(restored).toBe('c');
    expect(getOpenTabs().length).toBe(3);
    expect(getActiveTabLid()).toBe('c');
  });

  it('skips entries no longer in container', () => {
    const c1 = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c1);
    recordTabOpen('b', c1);
    persistTabState();
    resetTabState();

    // b は container から消えた
    const c2 = mkContainer([mkEntry('a', 'A')]);
    const restored = restoreTabState(c2);
    expect(restored).toBe('a');
    expect(getOpenTabs().length).toBe(1);
    expect(getOpenTabs()[0]?.lid).toBe('a');
  });

  it('returns null when nothing saved', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    expect(restoreTabState(c)).toBeNull();
  });

  it('returns null when container is null', () => {
    localStorage.setItem('pkc2.tabStrip', JSON.stringify({ lids: ['a'], active: 'a' }));
    expect(restoreTabState(null)).toBeNull();
  });

  it('ignores corrupted JSON', () => {
    localStorage.setItem('pkc2.tabStrip', 'not-valid-json');
    const c = mkContainer([mkEntry('a', 'A')]);
    expect(restoreTabState(c)).toBeNull();
    expect(getOpenTabs().length).toBe(0);
  });

  it('ignores malformed payload(wrong shape)', () => {
    localStorage.setItem('pkc2.tabStrip', JSON.stringify({ foo: 'bar' }));
    const c = mkContainer([mkEntry('a', 'A')]);
    expect(restoreTabState(c)).toBeNull();
  });

  it('falls back to last tab when active lid is invalid', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    localStorage.setItem('pkc2.tabStrip', JSON.stringify({ lids: ['a', 'b'], active: 'gone' }));
    const restored = restoreTabState(c);
    expect(restored).toBe('b');
  });

  it('skips opaque archetype entries on restore', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('hidden', 'Hidden', 'opaque')]);
    localStorage.setItem('pkc2.tabStrip', JSON.stringify({ lids: ['a', 'hidden'], active: 'hidden' }));
    const restored = restoreTabState(c);
    // active が opaque だったので a が新 active
    expect(restored).toBe('a');
    expect(getOpenTabs().length).toBe(1);
  });

  it('clearPersistedTabState removes saved state', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    persistTabState();
    expect(localStorage.getItem('pkc2.tabStrip')).not.toBeNull();
    clearPersistedTabState();
    expect(localStorage.getItem('pkc2.tabStrip')).toBeNull();
  });
});

describe('closeActiveTab', () => {
  it('closes active and returns new active', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    expect(getActiveTabLid()).toBe('b');
    const newActive = closeActiveTab();
    expect(newActive).toBe('a');
    expect(getOpenTabs().length).toBe(1);
  });

  it('returns null when nothing to close', () => {
    expect(closeActiveTab()).toBeNull();
  });
});

describe('reopenLastClosedTab', () => {
  it('returns lid of most recently closed', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    recordTabClose('a');
    recordTabClose('b');
    expect(reopenLastClosedTab()).toBe('b');
    expect(reopenLastClosedTab()).toBe('a');
    expect(reopenLastClosedTab()).toBeNull();
  });
});
