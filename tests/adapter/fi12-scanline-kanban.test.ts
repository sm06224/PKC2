/**
 * FI-12: scanline toggle + Kanban drag-over behavior tests
 *
 * Covers (per behavior contract §8):
 * - reducer: TOGGLE_SCANLINE pure semantics (tests 1-4)
 * - reducer: editing phase gate (test 5)
 * - renderer: data-pkc-scanline attribute sync (tests 6-7)
 * - renderer: toggle button DOM attributes (tests 8-10)
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
});

// ── 2. TOGGLE_SCANLINE reducer ───────────────────────────────

describe('TOGGLE_SCANLINE reducer', () => {
  it('false → true (test 2)', () => {
    const state = readyState({ showScanline: false });
    const { state: next } = reduce(state, { type: 'TOGGLE_SCANLINE' });
    expect(next.showScanline).toBe(true);
  });

  it('true → false (test 3)', () => {
    const state = readyState({ showScanline: true });
    const { state: next } = reduce(state, { type: 'TOGGLE_SCANLINE' });
    expect(next.showScanline).toBe(false);
  });

  it('emits no domain events (test 4)', () => {
    const { events } = reduce(readyState({ showScanline: false }), { type: 'TOGGLE_SCANLINE' });
    expect(events).toHaveLength(0);
  });

  it('editing phase: TOGGLE_SCANLINE is ignored (test 5)', () => {
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

// ── 3. Renderer: data-pkc-scanline attribute ─────────────────

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

  it('showScanline=false → no data-pkc-scanline attribute (test 6)', () => {
    render(readyState({ showScanline: false }), root);
    expect(root.hasAttribute('data-pkc-scanline')).toBe(false);
  });

  it('showScanline=true → data-pkc-scanline="on" (test 7)', () => {
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

// ── 4. Renderer: toggle button DOM ───────────────────────────

describe('renderer scanline toggle button', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('toggle button has data-pkc-action="toggle-scanline" (test 8)', () => {
    render(readyState({ showScanline: false }), root);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="toggle-scanline"]');
    expect(btn).not.toBeNull();
  });

  it('showScanline=true → toggle button data-pkc-active="true" (test 9)', () => {
    render(readyState({ showScanline: true }), root);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="toggle-scanline"]');
    expect(btn?.getAttribute('data-pkc-active')).toBe('true');
  });

  it('showScanline=false → toggle button data-pkc-active="false" (test 10)', () => {
    render(readyState({ showScanline: false }), root);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="toggle-scanline"]');
    expect(btn?.getAttribute('data-pkc-active')).toBe('false');
  });
});
