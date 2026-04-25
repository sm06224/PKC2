/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  renderColorPickerTrigger,
  renderColorPickerPopover,
} from '@adapter/ui/color-picker';

/**
 * Color tag picker — Slice 3 presenter tests.
 *
 * The presenter is markup-only: open / close / outside-click logic
 * lives in `action-binder.ts` and is exercised through DOM
 * integration. These tests pin the markup contract that
 * `action-binder` and CSS depend on.
 */

describe('renderColorPickerTrigger', () => {
  it('renders a button with the open-color-picker action attribute', () => {
    const btn = renderColorPickerTrigger(null);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('data-pkc-action')).toBe('open-color-picker');
    expect(btn.getAttribute('aria-haspopup')).toBe('true');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the empty-dot variant when no color is set', () => {
    const btn = renderColorPickerTrigger(null);
    const dot = btn.querySelector('.pkc-color-picker-trigger-dot');
    expect(dot).not.toBeNull();
    expect(dot?.classList.contains('pkc-color-picker-trigger-dot-empty')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('カラーを設定');
  });

  it('reflects a known palette ID via data-pkc-color-tag-current and dot color', () => {
    const btn = renderColorPickerTrigger('red');
    expect(btn.getAttribute('data-pkc-color-tag-current')).toBe('red');
    expect(btn.getAttribute('aria-label')).toBe('カラー: 赤');
    const dot = btn.querySelector('.pkc-color-picker-trigger-dot');
    expect(dot?.getAttribute('data-pkc-color')).toBe('red');
  });

  it('preserves an unknown palette ID without theming the dot', () => {
    const btn = renderColorPickerTrigger('teal');
    expect(btn.getAttribute('data-pkc-color-tag-current')).toBe('teal');
    expect(btn.getAttribute('aria-label')).toContain('teal');
    const dot = btn.querySelector('.pkc-color-picker-trigger-dot');
    // Unknown IDs do not get the data-pkc-color theming attribute.
    expect(dot?.getAttribute('data-pkc-color')).toBeNull();
    expect(dot?.classList.contains('pkc-color-picker-trigger-dot-empty')).toBe(true);
  });

  it('disables the button when options.disabled is true', () => {
    const btn = renderColorPickerTrigger('blue', { disabled: true });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('renderColorPickerPopover', () => {
  it('renders eight swatches in palette canonical order', () => {
    const panel = renderColorPickerPopover(null);
    const swatches = panel.querySelectorAll(
      '[data-pkc-action="apply-color-tag"]',
    );
    expect(swatches).toHaveLength(8);
    const ids = Array.from(swatches).map((s) => s.getAttribute('data-pkc-color'));
    expect(ids).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'gray',
    ]);
  });

  it('renders a "なし" affordance with clear-color-tag', () => {
    const panel = renderColorPickerPopover(null);
    const clear = panel.querySelector('[data-pkc-action="clear-color-tag"]');
    expect(clear).not.toBeNull();
    expect(clear?.getAttribute('aria-label')).toBe('色なし');
  });

  it('marks the active swatch when currentColor is a known palette ID', () => {
    const panel = renderColorPickerPopover('blue');
    const blue = panel.querySelector('[data-pkc-color="blue"]');
    expect(blue?.getAttribute('data-pkc-active')).toBe('true');
    expect(blue?.getAttribute('aria-pressed')).toBe('true');
    const red = panel.querySelector('[data-pkc-color="red"]');
    expect(red?.getAttribute('data-pkc-active')).toBeNull();
    expect(red?.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the clear affordance when currentColor is null', () => {
    const panel = renderColorPickerPopover(null);
    const clear = panel.querySelector('[data-pkc-action="clear-color-tag"]');
    expect(clear?.getAttribute('data-pkc-active')).toBe('true');
  });

  it('does NOT mark the clear affordance when currentColor is an unknown ID', () => {
    // Unknown ID: the picker shows no swatch as active (because the
    // user has no UI to reproduce that exact value), but the clear
    // affordance also stays inactive — clicking it would change state.
    const panel = renderColorPickerPopover('teal');
    const clear = panel.querySelector('[data-pkc-action="clear-color-tag"]');
    expect(clear?.getAttribute('data-pkc-active')).toBeNull();
    expect(clear?.getAttribute('aria-pressed')).toBe('false');
  });

  it('exposes a Japanese aria-label on each swatch', () => {
    const panel = renderColorPickerPopover(null);
    const expected: Record<string, string> = {
      red: '赤',
      orange: 'オレンジ',
      yellow: '黄',
      green: '緑',
      blue: '青',
      purple: '紫',
      pink: 'ピンク',
      gray: 'グレー',
    };
    for (const [id, label] of Object.entries(expected)) {
      const sw = panel.querySelector(`[data-pkc-color="${id}"]`);
      expect(sw?.getAttribute('aria-label')).toBe(label);
    }
  });

  it('declares itself as a dialog with an accessible label', () => {
    const panel = renderColorPickerPopover(null);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('カラー選択');
    expect(panel.getAttribute('data-pkc-region')).toBe('color-picker-popover');
  });
});
