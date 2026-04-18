/**
 * FI-12: scanline + Kanban + accent color behavior tests
 *
 * Covers:
 * - reducer: TOGGLE_SCANLINE semantics (tests 1-5)
 * - reducer: SET_SCANLINE explicit-value action (follow-up)
 * - reducer: SET_ACCENT_COLOR / RESET_ACCENT_COLOR (follow-up)
 * - renderer: data-pkc-scanline attribute sync
 * - renderer: scanline segmented control DOM (follow-up)
 * - renderer: --c-accent inline style sync (follow-up)
 * - renderer: accent color picker + reset button (follow-up)
 */

/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reduce, createInitialState } from '@adapter/state/app-state';
import { render } from '@adapter/ui/renderer';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

// ── helpers ──────────────────────────────────────────────────

const mockContainer: Container = {
  meta: { container_id: 'c1', schema_version: 1, title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function readyState(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), phase: 'ready', container: mockContainer, ...overrides };
}

function editingState(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), phase: 'editing', container: mockContainer, ...overrides };
}

// ── 1. createInitialState ────────────────────────────────────

describe('createInitialState', () => {
  it('showScanline defaults to false (I-FI12-1)', () => {
    expect(createInitialState().showScanline).toBe(false);
  });

  it('accentColor defaults to undefined (follow-up)', () => {
    expect(createInitialState().accentColor).toBeUndefined();
  });
});

// ── 2. TOGGLE_SCANLINE reducer ───────────────────────────────

describe('TOGGLE_SCANLINE reducer', () => {
  it('false → true', () => {
    const state = readyState({ showScanline: false });
    const { state: next } = reduce(state, { type: 'TOGGLE_SCANLINE' });
    expect(next.showScanline).toBe(true);
  });

  it('true → false', () => {
    const state = readyState({ showScanline: true });
    const { state: next } = reduce(state, { type: 'TOGGLE_SCANLINE' });
    expect(next.showScanline).toBe(false);
  });

  it('emits no domain events', () => {
    const { events } = reduce(readyState({ showScanline: false }), { type: 'TOGGLE_SCANLINE' });
    expect(events).toHaveLength(0);
  });

  it('editing phase: TOGGLE_SCANLINE is ignored', () => {
    const state = editingState({ showScanline: false });
    const { state: next } = reduce(state, { type: 'TOGGLE_SCANLINE' });
    expect(next.showScanline).toBe(false);
    expect(next).toBe(state);
  });

  it('undefined treated as false: undefined → true', () => {
    const state = readyState({ showScanline: undefined });
    const { state: next } = reduce(state, { type: 'TOGGLE_SCANLINE' });
    expect(next.showScanline).toBe(true);
  });
});

// ── 3. SET_SCANLINE reducer (follow-up) ──────────────────────

describe('SET_SCANLINE reducer', () => {
  it('explicit on=true sets showScanline=true', () => {
    const { state: next } = reduce(readyState({ showScanline: false }), { type: 'SET_SCANLINE', on: true });
    expect(next.showScanline).toBe(true);
  });

  it('explicit on=false sets showScanline=false', () => {
    const { state: next } = reduce(readyState({ showScanline: true }), { type: 'SET_SCANLINE', on: false });
    expect(next.showScanline).toBe(false);
  });

  it('idempotent when already in the requested state (identity preserved)', () => {
    const state = readyState({ showScanline: true });
    const { state: next } = reduce(state, { type: 'SET_SCANLINE', on: true });
    expect(next).toBe(state);
  });

  it('emits no domain events', () => {
    const { events } = reduce(readyState(), { type: 'SET_SCANLINE', on: true });
    expect(events).toHaveLength(0);
  });
});

// ── 4. Accent color reducer (follow-up) ──────────────────────

describe('SET_ACCENT_COLOR reducer', () => {
  it('accepts #rrggbb hex and lowercases it', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_ACCENT_COLOR', color: '#AABBCC' });
    expect(next.accentColor).toBe('#aabbcc');
  });

  it('accepts 3-digit hex', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_ACCENT_COLOR', color: '#ABC' });
    expect(next.accentColor).toBe('#abc');
  });

  it('rejects non-hex strings (state identity preserved)', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'SET_ACCENT_COLOR', color: 'rgb(1,2,3)' });
    expect(next).toBe(state);
  });

  it('rejects malformed hex', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'SET_ACCENT_COLOR', color: '#zzz' });
    expect(next).toBe(state);
  });

  it('emits no domain events', () => {
    const { events } = reduce(readyState(), { type: 'SET_ACCENT_COLOR', color: '#112233' });
    expect(events).toHaveLength(0);
  });
});

describe('RESET_ACCENT_COLOR reducer', () => {
  it('clears the override back to undefined', () => {
    const { state: next } = reduce(readyState({ accentColor: '#ff0000' }), { type: 'RESET_ACCENT_COLOR' });
    expect(next.accentColor).toBeUndefined();
  });

  it('no-op when already unset (identity preserved)', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'RESET_ACCENT_COLOR' });
    expect(next).toBe(state);
  });
});

// ── 5. Renderer: data-pkc-scanline attribute ─────────────────

describe('renderer data-pkc-scanline', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('showScanline=false → no data-pkc-scanline attribute', () => {
    render(readyState({ showScanline: false }), root);
    expect(root.hasAttribute('data-pkc-scanline')).toBe(false);
  });

  it('showScanline=true → data-pkc-scanline="on"', () => {
    render(readyState({ showScanline: true }), root);
    expect(root.getAttribute('data-pkc-scanline')).toBe('on');
  });

  it('showScanline undefined → no data-pkc-scanline attribute', () => {
    render(readyState({ showScanline: undefined }), root);
    expect(root.hasAttribute('data-pkc-scanline')).toBe(false);
  });

  it('attribute removed when toggled back to false', () => {
    render(readyState({ showScanline: true }), root);
    expect(root.getAttribute('data-pkc-scanline')).toBe('on');
    render(readyState({ showScanline: false }), root);
    expect(root.hasAttribute('data-pkc-scanline')).toBe(false);
  });
});

// ── 6. Renderer: scanline segmented control (follow-up) ──────

describe('renderer scanline segmented control', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('renders two set-scanline buttons with explicit values', () => {
    render(readyState({ showScanline: false }), root);
    const off = root.querySelector<HTMLElement>('[data-pkc-action="set-scanline"][data-pkc-scanline-value="off"]');
    const on = root.querySelector<HTMLElement>('[data-pkc-action="set-scanline"][data-pkc-scanline-value="on"]');
    expect(off).not.toBeNull();
    expect(on).not.toBeNull();
  });

  it('showScanline=false → Off button is active, On is inactive', () => {
    render(readyState({ showScanline: false }), root);
    const off = root.querySelector<HTMLElement>('[data-pkc-scanline-value="off"]');
    const on = root.querySelector<HTMLElement>('[data-pkc-scanline-value="on"]');
    expect(off?.getAttribute('data-pkc-active')).toBe('true');
    expect(on?.getAttribute('data-pkc-active')).toBe('false');
  });

  it('showScanline=true → On button is active, Off is inactive', () => {
    render(readyState({ showScanline: true }), root);
    const off = root.querySelector<HTMLElement>('[data-pkc-scanline-value="off"]');
    const on = root.querySelector<HTMLElement>('[data-pkc-scanline-value="on"]');
    expect(off?.getAttribute('data-pkc-active')).toBe('false');
    expect(on?.getAttribute('data-pkc-active')).toBe('true');
  });
});

// ── 7. Renderer: accent color picker + inline style (follow-up) ──

describe('renderer accent color picker', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('renders a color input with data-pkc-action="set-accent-color"', () => {
    render(readyState(), root);
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-accent-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('renders a reset button with data-pkc-action="reset-accent-color"', () => {
    render(readyState(), root);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-accent-color"]');
    expect(btn).not.toBeNull();
  });

  it('accentColor undefined → no inline --c-accent on root', () => {
    render(readyState({ accentColor: undefined }), root);
    expect(root.style.getPropertyValue('--c-accent')).toBe('');
  });

  it('accentColor set → writes inline --c-accent to root', () => {
    render(readyState({ accentColor: '#ff00aa' }), root);
    expect(root.style.getPropertyValue('--c-accent')).toBe('#ff00aa');
  });

  it('resetting after a set clears the inline --c-accent', () => {
    render(readyState({ accentColor: '#ff00aa' }), root);
    render(readyState({ accentColor: undefined }), root);
    expect(root.style.getPropertyValue('--c-accent')).toBe('');
  });

  it('color input is seeded with the neon-green default when no override', () => {
    render(readyState(), root);
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-accent-color"]');
    expect(input!.value).toBe('#33ff66');
  });

  it('color input reflects the active override when present', () => {
    render(readyState({ accentColor: '#123456' }), root);
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-accent-color"]');
    expect(input!.value).toBe('#123456');
  });
});
