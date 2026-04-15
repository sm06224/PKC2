/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  applyPaneCollapsedToDOM,
  applyOnePaneCollapsedToDOM,
} from '@adapter/ui/pane-apply';

/**
 * USER_REQUEST_LEDGER S-19 (H-7, 2026-04-14) — DOM apply helper.
 *
 * The helper is the single source of truth for the collapsed-pane
 * attribute contract used by togglePane and by the renderer. These
 * tests pin the exact attributes / display values the UX depends on.
 */

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.innerHTML = `
    <div data-pkc-region="tray-left" style="display:none;">SIDEBAR</div>
    <aside data-pkc-region="sidebar"></aside>
    <div data-pkc-resize="left"></div>
    <div data-pkc-resize="right"></div>
    <aside data-pkc-region="meta"></aside>
    <div data-pkc-region="tray-right" style="display:none;">META</div>
  `;
  document.body.appendChild(root);
});

afterEach(() => {
  document.body.removeChild(root);
});

describe('applyPaneCollapsedToDOM', () => {
  it('sets collapsed attributes when prefs say collapsed', () => {
    applyPaneCollapsedToDOM(root, { sidebar: true, meta: true });
    expect(root.querySelector('[data-pkc-region="sidebar"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
    expect(root.querySelector('[data-pkc-region="meta"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-pkc-region="tray-left"]')!.style.display).toBe('');
    expect(root.querySelector<HTMLElement>('[data-pkc-region="tray-right"]')!.style.display).toBe('');
    expect(root.querySelector('[data-pkc-resize="left"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
    expect(root.querySelector('[data-pkc-resize="right"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
  });

  it('clears collapsed attributes when prefs say expanded', () => {
    // Seed as collapsed
    applyPaneCollapsedToDOM(root, { sidebar: true, meta: true });
    // Then expand
    applyPaneCollapsedToDOM(root, { sidebar: false, meta: false });
    expect(root.querySelector('[data-pkc-region="sidebar"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
    expect(root.querySelector('[data-pkc-region="meta"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-pkc-region="tray-left"]')!.style.display).toBe('none');
    expect(root.querySelector<HTMLElement>('[data-pkc-region="tray-right"]')!.style.display).toBe('none');
    expect(root.querySelector('[data-pkc-resize="left"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
    expect(root.querySelector('[data-pkc-resize="right"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
  });

  it('applies asymmetric prefs (sidebar collapsed, meta expanded)', () => {
    applyPaneCollapsedToDOM(root, { sidebar: true, meta: false });
    expect(root.querySelector('[data-pkc-region="sidebar"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
    expect(root.querySelector('[data-pkc-region="meta"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
  });

  it('is a silent noop when the pane element is absent', () => {
    // Meta pane is absent (e.g. no entry selected).
    root.innerHTML = `
      <div data-pkc-region="tray-left" style="display:none;">SIDEBAR</div>
      <aside data-pkc-region="sidebar"></aside>
    `;
    expect(() =>
      applyPaneCollapsedToDOM(root, { sidebar: true, meta: true }),
    ).not.toThrow();
    // Sidebar still got applied.
    expect(root.querySelector('[data-pkc-region="sidebar"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
  });
});

describe('applyOnePaneCollapsedToDOM', () => {
  it('collapses only the requested pane', () => {
    applyOnePaneCollapsedToDOM(root, 'sidebar', true);
    expect(root.querySelector('[data-pkc-region="sidebar"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
    // Meta untouched.
    expect(root.querySelector('[data-pkc-region="meta"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
  });

  it('expands only the requested pane', () => {
    applyOnePaneCollapsedToDOM(root, 'sidebar', true);
    applyOnePaneCollapsedToDOM(root, 'meta', true);
    applyOnePaneCollapsedToDOM(root, 'sidebar', false);
    expect(root.querySelector('[data-pkc-region="sidebar"]')!.hasAttribute('data-pkc-collapsed')).toBe(false);
    expect(root.querySelector('[data-pkc-region="meta"]')!.getAttribute('data-pkc-collapsed')).toBe('true');
  });
});
