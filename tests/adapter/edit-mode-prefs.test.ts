/**
 * @vitest-environment happy-dom
 *
 * Phase γ-A2 A2-3:編集モード localStorage 永続化。
 *
 * loadEditMode / saveEditMode の round-trip + 異常系、および boot restore
 * mechanism(saveEditMode → loadEditMode → SET_EDIT_MODE dispatch →
 * state.editMode)の end-to-end を検証する。main.ts の
 * restoreEditModeFromStorage は本テストの「boot restore」section と同一の
 * 2 ステップ(loadEditMode → 条件付き dispatch)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadEditMode,
  saveEditMode,
  EDIT_MODE_STORAGE_KEY,
} from '@adapter/platform/edit-mode-prefs';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';

function readyState(): AppState {
  return { ...createInitialState(), phase: 'ready' };
}

describe('edit-mode-prefs (Phase γ-A2 A2-3)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('storage key は pkc2.editMode', () => {
    expect(EDIT_MODE_STORAGE_KEY).toBe('pkc2.editMode');
  });

  it('未設定:loadEditMode は null(= 既定 inline を使う契約)', () => {
    expect(loadEditMode()).toBeNull();
  });

  it("saveEditMode('window') → loadEditMode() === 'window'", () => {
    saveEditMode('window');
    expect(loadEditMode()).toBe('window');
  });

  it("saveEditMode('inline') → loadEditMode() === 'inline'", () => {
    saveEditMode('inline');
    expect(loadEditMode()).toBe('inline');
  });

  it('save は上書きされる(window → inline)', () => {
    saveEditMode('window');
    saveEditMode('inline');
    expect(loadEditMode()).toBe('inline');
  });

  it('不正な格納値 → null(inline 既定に fallback)', () => {
    localStorage.setItem(EDIT_MODE_STORAGE_KEY, 'overlay');
    expect(loadEditMode()).toBeNull();
  });

  it('空文字の格納値 → null', () => {
    localStorage.setItem(EDIT_MODE_STORAGE_KEY, '');
    expect(loadEditMode()).toBeNull();
  });

  // ── boot restore mechanism(end-to-end)──

  it('永続値あり:boot restore で state.editMode が復元される', () => {
    saveEditMode('window');
    // main.ts restoreEditModeFromStorage と同じ 2 ステップ。
    const mode = loadEditMode();
    expect(mode).toBe('window');
    let state = readyState();
    if (mode) {
      state = reduce(state, { type: 'SET_EDIT_MODE', mode }).state;
    }
    expect(state.editMode).toBe('window');
  });

  it('永続値なし:boot restore は dispatch せず editMode は undefined(legacy = inline)', () => {
    const mode = loadEditMode();
    expect(mode).toBeNull();
    let state = readyState();
    if (mode) {
      state = reduce(state, { type: 'SET_EDIT_MODE', mode }).state;
    }
    expect(state.editMode).toBeUndefined();
  });
});
