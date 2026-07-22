/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initUiPrefs,
  getUiPref,
  setUiPref,
  removeUiPref,
  isManagedUiPrefKey,
  __resetUiPrefsForTest,
  __flushUiPrefsForTest,
} from '@adapter/platform/ui-prefs';
import { reduce, createInitialState, type AppState } from '@adapter/state/app-state';
import type { Dispatchable } from '@core/action';
import { createDispatcher } from '@adapter/state/dispatcher';
import { SETTINGS_LID } from '@core/model/record';
import { resolveSettingsPayload } from '@core/model/system-settings-payload';
import type { Container } from '@core/model/container';

/**
 * C11(2026-07-22 user 要望)— localStorage が必ず初期化される環境でも
 * UI prefs が生き残る仕組み。
 *
 * 契約:
 *   - 正本 = container `__settings__` の uiPrefs バッグ。localStorage は
 *     セッション内ミラー(boot 時にバッグから seed)
 *   - 未 init の facade は localStorage passthrough(後方互換)
 *   - 書き込みは debounce して SET_UI_PREFS を 1 回 dispatch
 *   - readonly では dispatch しない(ミラーのみ)
 *   - legacy 値(localStorage にだけある managed key)は採用されて
 *     バッグへ流れる(移行)
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-c11', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), phase: 'ready', container: makeContainer(), ...overrides };
}

beforeEach(() => {
  __resetUiPrefsForTest();
  localStorage.clear();
  return () => {
    __resetUiPrefsForTest();
    localStorage.clear();
  };
});

describe('facade: passthrough(未 init)', () => {
  it('get/set/remove が localStorage に対して動く(従来挙動)', () => {
    expect(getUiPref('pkc2.editMode')).toBeNull();
    setUiPref('pkc2.editMode', 'window');
    expect(localStorage.getItem('pkc2.editMode')).toBe('window');
    expect(getUiPref('pkc2.editMode')).toBe('window');
    removeUiPref('pkc2.editMode');
    expect(localStorage.getItem('pkc2.editMode')).toBeNull();
  });
});

describe('facade: init 済み(container バッグ)', () => {
  function fakeDispatcher(readonly = false) {
    const dispatched: Dispatchable[] = [];
    return {
      dispatched,
      dispatch: (a: Dispatchable) => { dispatched.push(a); },
      getState: () => readyState({ readonly }),
    };
  }

  it('localStorage が空(初期化された環境)でもバッグの値を返す', () => {
    const d = fakeDispatcher();
    initUiPrefs({ 'pkc2.editMode': 'window' }, d);
    expect(getUiPref('pkc2.editMode')).toBe('window');
  });

  it('init はバッグを localStorage へミラー seed する(直読み reader 互換)', () => {
    const d = fakeDispatcher();
    initUiPrefs({ 'pkc2.split-sync-enabled': 'true' }, d);
    expect(localStorage.getItem('pkc2.split-sync-enabled')).toBe('true');
  });

  it('legacy 値(localStorage のみ)は init 時に採用され SET_UI_PREFS で流れる', () => {
    localStorage.setItem('pkc2.panePrefs', '{"sidebar":true,"meta":false}');
    const d = fakeDispatcher();
    initUiPrefs({}, d);
    expect(getUiPref('pkc2.panePrefs')).toBe('{"sidebar":true,"meta":false}');
    __flushUiPrefsForTest();
    expect(d.dispatched).toHaveLength(1);
    expect(d.dispatched[0]).toEqual({
      type: 'SET_UI_PREFS',
      values: { 'pkc2.panePrefs': '{"sidebar":true,"meta":false}' },
    });
  });

  it('set は debounce batch で 1 回だけ dispatch される', () => {
    const d = fakeDispatcher();
    initUiPrefs({}, d);
    setUiPref('pkc2.editMode', 'window');
    setUiPref('pkc2.split-sync-enabled', 'true');
    setUiPref('pkc2.editMode', 'inline'); // 上書き
    expect(d.dispatched).toHaveLength(0); // debounce 窓内
    __flushUiPrefsForTest();
    expect(d.dispatched).toHaveLength(1);
    expect(d.dispatched[0]).toEqual({
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'inline', 'pkc2.split-sync-enabled': 'true' },
    });
  });

  it('remove は null として flush される', () => {
    const d = fakeDispatcher();
    initUiPrefs({ 'pkc2.tabStrip': '{"lids":[],"active":null}' }, d);
    removeUiPref('pkc2.tabStrip');
    expect(getUiPref('pkc2.tabStrip')).toBeNull();
    __flushUiPrefsForTest();
    expect(d.dispatched[0]).toEqual({
      type: 'SET_UI_PREFS',
      values: { 'pkc2.tabStrip': null },
    });
  });

  it('readonly では dispatch されない(ミラーのみ)', () => {
    const d = fakeDispatcher(true);
    initUiPrefs({}, d);
    setUiPref('pkc2.editMode', 'window');
    __flushUiPrefsForTest();
    expect(d.dispatched).toHaveLength(0);
    expect(localStorage.getItem('pkc2.editMode')).toBe('window');
  });

  it('管理対象外 key(debug / bootstrap)は dispatch されない', () => {
    const d = fakeDispatcher();
    initUiPrefs({}, d);
    setUiPref('pkc2.debug', 'split-sync');
    setUiPref('pkc2.storageBackend', 'fs-directory');
    setUiPref('pkc2.windowLayout', '[]');
    __flushUiPrefsForTest();
    expect(d.dispatched).toHaveLength(0);
    // localStorage には従来どおり書かれる
    expect(localStorage.getItem('pkc2.debug')).toBe('split-sync');
  });

  it('isManagedUiPrefKey: allowlist の判定', () => {
    expect(isManagedUiPrefKey('pkc2.editMode')).toBe(true);
    expect(isManagedUiPrefKey('pkc2.imageOptimize.preference.paste')).toBe(true);
    expect(isManagedUiPrefKey('pkc2.debug')).toBe(false);
    expect(isManagedUiPrefKey('pkc2.windowLayout')).toBe(false);
    expect(isManagedUiPrefKey('pkc2.last-known-version')).toBe(false);
  });
});

describe('reducer: SET_UI_PREFS', () => {
  it('merge して __settings__ entry を upsert し SETTINGS_CHANGED を emit', () => {
    const { state: next, events } = reduce(readyState(), {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'window' },
    });
    expect(next.settings!.uiPrefs).toEqual({ 'pkc2.editMode': 'window' });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('SETTINGS_CHANGED');
    const entry = next.container!.entries.find((e) => e.lid === SETTINGS_LID)!;
    expect(resolveSettingsPayload(entry.body).uiPrefs).toEqual({ 'pkc2.editMode': 'window' });
  });

  it('null で key を削除する', () => {
    const s1 = reduce(readyState(), {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'window', 'pkc2.panePrefs': '{}' },
    }).state;
    const { state: s2 } = reduce(s1, {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': null },
    });
    expect(s2.settings!.uiPrefs).toEqual({ 'pkc2.panePrefs': '{}' });
  });

  it('変化なしなら identity 保存・event なし', () => {
    const s1 = reduce(readyState(), {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'window' },
    }).state;
    const { state: s2, events } = reduce(s1, {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'window' },
    });
    expect(s2).toBe(s1);
    expect(events).toHaveLength(0);
  });

  it('readonly では silent no-op', () => {
    const state = readyState({ readonly: true });
    const { state: next, events } = reduce(state, {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'window' },
    });
    expect(next).toBe(state);
    expect(events).toHaveLength(0);
  });

  it('不正 key / 不正 value は黙って落とす', () => {
    const state = readyState();
    const { state: next } = reduce(state, {
      type: 'SET_UI_PREFS',
      values: {
        'not-namespaced': 'x',
        'pkc2.ok': 'fine',
        'pkc2.too-long': 'v'.repeat(20000),
      },
    });
    expect(next.settings!.uiPrefs).toEqual({ 'pkc2.ok': 'fine' });
  });
});

describe('E2E: 「localStorage が必ず初期化される環境」シナリオ', () => {
  it('前セッションの prefs が container 経由で復元される', () => {
    // ── セッション 1: pref を書いて container に保存される ──
    const d1 = createDispatcher();
    d1.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    initUiPrefs({}, d1);
    setUiPref('pkc2.editMode', 'window');
    setUiPref('pkc2.startup-notice.seen', '2026-07-22-refinement-round');
    __flushUiPrefsForTest();
    const savedContainer = d1.getState().container!;
    const settingsEntry = savedContainer.entries.find((e) => e.lid === SETTINGS_LID)!;
    expect(settingsEntry).toBeDefined();

    // ── 環境が localStorage を初期化 ──
    __resetUiPrefsForTest();
    localStorage.clear();

    // ── セッション 2: container(= 保存データ)だけから復元 ──
    const d2 = createDispatcher();
    d2.dispatch({ type: 'SYS_INIT_COMPLETE', container: savedContainer });
    const bag = resolveSettingsPayload(settingsEntry.body).uiPrefs;
    initUiPrefs(bag, d2);
    expect(getUiPref('pkc2.editMode')).toBe('window');
    expect(getUiPref('pkc2.startup-notice.seen')).toBe('2026-07-22-refinement-round');
    // ミラー seed 済み(localStorage 直読みの子 window 互換)
    expect(localStorage.getItem('pkc2.editMode')).toBe('window');
  });
});
