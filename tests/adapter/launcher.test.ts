/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ(2026-05-12 hotfix、PR #432 stack):App Launcher overlay rendering
 * + reducer + boot URL flag parser の test。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderLauncher } from '@adapter/ui/launcher';
import { reduce, createInitialState } from '@adapter/state/app-state';
import { LAUNCHER_APPS } from '@features/launcher/app-registry';

describe('PR-2JJ App Launcher overlay rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders overlay with header / grid / hint', () => {
    const overlay = renderLauncher();
    expect(overlay.matches('[data-pkc-region="launcher-overlay"]')).toBe(true);
    expect(overlay.querySelector('[data-pkc-region="launcher-panel"]')).not.toBeNull();
    expect(overlay.querySelector('.pkc-launcher-header')).not.toBeNull();
    expect(overlay.querySelector('[data-pkc-region="launcher-grid"]')).not.toBeNull();
    expect(overlay.querySelector('.pkc-launcher-hint')).not.toBeNull();
  });

  it('backdrop dispatches close-launcher', () => {
    const overlay = renderLauncher();
    const backdrop = overlay.querySelector('.pkc-launcher-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.getAttribute('data-pkc-action')).toBe('close-launcher');
  });

  it('× button dispatches close-launcher', () => {
    const overlay = renderLauncher();
    const closeBtn = overlay.querySelector('.pkc-launcher-close');
    expect(closeBtn!.getAttribute('data-pkc-action')).toBe('close-launcher');
    expect(closeBtn!.textContent).toBe('✕');
  });

  it('renders one tile per registered app', () => {
    const overlay = renderLauncher();
    const tiles = overlay.querySelectorAll('.pkc-launcher-tile');
    expect(tiles.length).toBe(LAUNCHER_APPS.length);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i] as HTMLElement;
      const app = LAUNCHER_APPS[i]!;
      expect(tile.getAttribute('data-pkc-action')).toBe('launch-app');
      expect(tile.getAttribute('data-pkc-app-id')).toBe(app.id);
      expect(tile.querySelector('.pkc-launcher-tile-icon')!.textContent).toBe(app.icon);
      expect(tile.querySelector('.pkc-launcher-tile-label')!.textContent).toBe(app.label);
    }
  });

  it('tile aria-label / title 設定済', () => {
    const overlay = renderLauncher();
    const detailTile = overlay.querySelector(
      '[data-pkc-app-id="detail"]',
    ) as HTMLElement;
    expect(detailTile.getAttribute('aria-label')).toBe('Launch Detail');
    expect(detailTile.getAttribute('title')).toBeTruthy();
  });
});

describe('PR-2JJ launcher reducer', () => {
  it('OPEN_LAUNCHER sets launcherOpen=true and closes menu', () => {
    const s0 = { ...createInitialState(), phase: 'ready' as const, menuOpen: true };
    const { state: s1 } = reduce(s0, { type: 'OPEN_LAUNCHER' });
    expect(s1.launcherOpen).toBe(true);
    expect(s1.menuOpen).toBe(false);
  });

  it('OPEN_LAUNCHER twice is idempotent', () => {
    const s0 = {
      ...createInitialState(),
      phase: 'ready' as const,
      launcherOpen: true,
    };
    const { state: s1 } = reduce(s0, { type: 'OPEN_LAUNCHER' });
    expect(s1).toBe(s0);
  });

  it('CLOSE_LAUNCHER sets launcherOpen=false', () => {
    const s0 = {
      ...createInitialState(),
      phase: 'ready' as const,
      launcherOpen: true,
    };
    const { state: s1 } = reduce(s0, { type: 'CLOSE_LAUNCHER' });
    expect(s1.launcherOpen).toBe(false);
  });

  it('CLOSE_LAUNCHER when already closed is idempotent', () => {
    const s0 = { ...createInitialState(), phase: 'ready' as const };
    const { state: s1 } = reduce(s0, { type: 'CLOSE_LAUNCHER' });
    expect(s1).toBe(s0);
  });
});
