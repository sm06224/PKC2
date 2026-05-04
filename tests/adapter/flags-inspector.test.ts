/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderFlagsInspector } from '@adapter/ui/flags-inspector';
import {
  defineFlag,
  setContainerFlagSource,
  __resetRegistry,
  __resetUrlCache,
} from '@runtime/flags';

declare global {
  // eslint-disable-next-line no-var
  var __PKC_FLAGS_URL__: Record<string, string> | undefined;
}

describe('flags inspector — overlay rendering', () => {
  beforeEach(() => {
    __resetRegistry();
    delete (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
      .__PKC_FLAGS_URL__;
    __resetUrlCache();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    __resetRegistry();
  });

  it('renders overlay with header / toolbar / body / footer', () => {
    defineFlag('a.b', 1, { category: 'ui', description: 'a b' });
    const overlay = renderFlagsInspector();
    expect(overlay.matches('[data-pkc-region="flags-inspector-overlay"]')).toBe(true);
    expect(overlay.querySelector('[data-pkc-region="flags-inspector-panel"]')).not.toBeNull();
    expect(overlay.querySelector('.pkc-flags-inspector-header')).not.toBeNull();
    expect(overlay.querySelector('.pkc-flags-inspector-toolbar')).not.toBeNull();
    expect(overlay.querySelector('.pkc-flags-inspector-body')).not.toBeNull();
    expect(overlay.querySelector('.pkc-flags-inspector-footer')).not.toBeNull();
  });

  it('backdrop click target dispatches close-flags-inspector', () => {
    defineFlag('a.b', 1);
    const overlay = renderFlagsInspector();
    const backdrop = overlay.querySelector('.pkc-flags-inspector-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.getAttribute('data-pkc-action')).toBe('close-flags-inspector');
  });

  it('× button dispatches close-flags-inspector', () => {
    const overlay = renderFlagsInspector();
    const closeBtn = overlay.querySelector('.pkc-flags-inspector-close');
    expect(closeBtn!.getAttribute('data-pkc-action')).toBe('close-flags-inspector');
    expect(closeBtn!.textContent).toBe('✕');
  });

  it('renders one row per registered flag with key + description', () => {
    defineFlag('alpha.x', 5, { description: 'alpha description' });
    defineFlag('beta.y', false, { description: 'beta description' });
    const overlay = renderFlagsInspector();
    const rows = overlay.querySelectorAll('[data-pkc-region="flag-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0]!.querySelector('.pkc-flag-key')!.textContent).toBe('alpha.x');
    expect(rows[1]!.querySelector('.pkc-flag-key')!.textContent).toBe('beta.y');
    expect(
      Array.from(overlay.querySelectorAll('.pkc-flag-description')).map((d) => d.textContent),
    ).toEqual(['alpha description', 'beta description']);
  });

  it('numeric flag → number input bound to set-flag-numeric', () => {
    defineFlag('count.x', 10, { range: [1, 100] });
    const overlay = renderFlagsInspector();
    const input = overlay.querySelector(
      '[data-pkc-action="set-flag-numeric"][data-pkc-key="count.x"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('number');
    expect(input.value).toBe('10');
    expect(input.min).toBe('1');
    expect(input.max).toBe('100');
    expect(input.disabled).toBe(false);
  });

  it('boolean flag → checkbox bound to set-flag-boolean', () => {
    defineFlag('toggle.x', true);
    const overlay = renderFlagsInspector();
    const cb = overlay.querySelector(
      '[data-pkc-action="set-flag-boolean"][data-pkc-key="toggle.x"]',
    ) as HTMLInputElement;
    expect(cb).not.toBeNull();
    expect(cb.type).toBe('checkbox');
    expect(cb.checked).toBe(true);
  });

  it('enum flag → dropdown bound to set-flag-enum', () => {
    defineFlag('choice.x', 'a', { enum: ['a', 'b', 'c'] });
    const overlay = renderFlagsInspector();
    const select = overlay.querySelector(
      '[data-pkc-action="set-flag-enum"][data-pkc-key="choice.x"]',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(3);
    expect(select.options[0]!.value).toBe('a');
    expect(select.options[0]!.selected).toBe(true);
  });

  it('Tier 1 flag is rendered grayed (disabled editor)', () => {
    defineFlag('locked.x', 5, { tier: 1 });
    const overlay = renderFlagsInspector();
    const input = overlay.querySelector(
      '[data-pkc-key="locked.x"] input',
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('default-source flag has no reset button', () => {
    defineFlag('untouched.x', 5);
    const overlay = renderFlagsInspector();
    const row = overlay.querySelector('[data-pkc-key="untouched.x"]')!;
    expect(row.querySelector('.pkc-flag-reset')).toBeNull();
  });

  it('container-source flag has reset button', () => {
    setContainerFlagSource({ 'tweaked.x': 50 });
    defineFlag('tweaked.x', 10);
    const overlay = renderFlagsInspector();
    const row = overlay.querySelector('[data-pkc-key="tweaked.x"]')!;
    const reset = row.querySelector('.pkc-flag-reset');
    expect(reset).not.toBeNull();
    expect(reset!.getAttribute('data-pkc-action')).toBe('reset-flag');
    expect(reset!.getAttribute('data-pkc-key')).toBe('tweaked.x');
  });

  it('URL-source flag shows note + has no editable editor (read-only)', () => {
    (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
      .__PKC_FLAGS_URL__ = { 'urlflag.x': '99' };
    __resetUrlCache();
    defineFlag('urlflag.x', 1);
    const overlay = renderFlagsInspector();
    const row = overlay.querySelector('[data-pkc-key="urlflag.x"]')!;
    expect(row.querySelector('.pkc-flag-url-note')).not.toBeNull();
    // URL override is still tier 0, so reset button (returns to next layer) is present
    expect(row.querySelector('.pkc-flag-reset')).not.toBeNull();
  });

  it('"Save URL → Container" button enabled only when URL flags exist', () => {
    defineFlag('a.x', 1);
    let overlay = renderFlagsInspector();
    let btn = overlay.querySelector(
      '[data-pkc-action="save-url-flags-to-container"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    __resetRegistry();
    (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
      .__PKC_FLAGS_URL__ = { 'a.x': '99' };
    __resetUrlCache();
    defineFlag('a.x', 1);
    overlay = renderFlagsInspector();
    btn = overlay.querySelector(
      '[data-pkc-action="save-url-flags-to-container"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('groups flags by category; uncategorised land in "general"', () => {
    defineFlag('a.x', 1, { category: 'ui' });
    defineFlag('b.y', 1, { category: 'perf' });
    defineFlag('c.z', 1); // no category → general
    const overlay = renderFlagsInspector();
    const cats = Array.from(
      overlay.querySelectorAll('[data-pkc-flag-category]'),
    ).map((b) => b.getAttribute('data-pkc-flag-category'));
    expect(cats.sort()).toEqual(['general', 'perf', 'ui']);
  });

  it('renders empty state when no flags registered', () => {
    const overlay = renderFlagsInspector();
    expect(overlay.querySelector('.pkc-flags-inspector-empty')).not.toBeNull();
  });

  it('footer summary counts tiers and active diff-from-default', () => {
    defineFlag('a.x', 1, { tier: 0 });
    defineFlag('b.y', 1, { tier: 1 });
    setContainerFlagSource({ 'c.z': 99 });
    defineFlag('c.z', 1, { tier: 0 });
    const overlay = renderFlagsInspector();
    const summary = overlay.querySelector('.pkc-flags-inspector-summary')!.textContent!;
    expect(summary).toContain('Total: 3');
    expect(summary).toContain('Tier 0: 2');
    expect(summary).toContain('Tier 1: 1');
    expect(summary).toContain('Active (≠ default): 1');
  });

  it('includes Build Features section with read-only marker', () => {
    const overlay = renderFlagsInspector();
    const buildSection = overlay.querySelector(
      '[data-pkc-region="flags-build-features"]',
    );
    expect(buildSection).not.toBeNull();
    expect(buildSection!.querySelector('.pkc-flags-build-features-note')).not.toBeNull();
    const items = buildSection!.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0]!.textContent).toContain('BUILD_FEATURES');
    expect(items[1]!.textContent).toContain('MESSAGE_CAPABILITIES');
  });

  it('search box and category filter exist with correct field names', () => {
    defineFlag('a.x', 1);
    const overlay = renderFlagsInspector();
    expect(
      overlay.querySelector('[data-pkc-field="flags-search"]'),
    ).not.toBeNull();
    expect(
      overlay.querySelector('[data-pkc-field="flags-category"]'),
    ).not.toBeNull();
  });

  it('"Reset all" button is present in toolbar', () => {
    const overlay = renderFlagsInspector();
    const reset = overlay.querySelector(
      '[data-pkc-action="reset-all-flags"]',
    );
    expect(reset).not.toBeNull();
  });
});
