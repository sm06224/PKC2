/**
 * FI-Settings v1 full UI: remaining 5 settings items.
 *
 * Tests the end-to-end flow: UI control → action-binder → reducer →
 * state.settings → __settings__ entry → DOM / renderer for:
 *   1. Border color
 *   2. Text color
 *   3. Preferred font
 *   4. Language
 *   5. Timezone
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { SETTINGS_LID } from '@core/model/record';
import { resolveSettingsPayload } from '@core/model/system-settings-payload';
import type { SystemSettingsPayload } from '@core/model/system-settings-payload';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = null;
    root.remove();
  };
});

function setup() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));

  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  return { dispatcher, events };
}

function getSettingsBody(dispatcher: ReturnType<typeof createDispatcher>): SystemSettingsPayload {
  const entry = dispatcher.getState().container!.entries.find((e) => e.lid === SETTINGS_LID);
  expect(entry).toBeDefined();
  return resolveSettingsPayload(entry!.body);
}

function fireChange(el: HTMLElement): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fireClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// ── 1. Border color ─────────────────────────────────────────────

describe('border color UI', () => {
  it('renders a color input with data-pkc-action="set-border-color"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('renders a reset button with data-pkc-action="reset-border-color"', () => {
    setup();
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-border-color"]');
    expect(btn).not.toBeNull();
  });

  it('change → dispatches SET_BORDER_COLOR → persists', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    input.value = '#aa1122';
    fireChange(input);
    expect(dispatcher.getState().settings?.theme.borderColor).toBe('#aa1122');
    expect(getSettingsBody(dispatcher).theme.borderColor).toBe('#aa1122');
  });

  it('reset → dispatches RESET_BORDER_COLOR → clears to null', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    input.value = '#aa1122';
    fireChange(input);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-border-color"]')!;
    fireClick(btn);
    expect(dispatcher.getState().settings?.theme.borderColor).toBeNull();
  });

  it('persisted value → DOM --c-border', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    input.value = '#ff5500';
    fireChange(input);
    expect(root.style.getPropertyValue('--c-border')).toBe('#ff5500');
  });
});

// ── 2. Text color ───────────────────────────────────────────────

describe('UI text color UI', () => {
  it('renders a color input with data-pkc-action="set-ui-text-color"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-ui-text-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('change → dispatches SET_UI_TEXT_COLOR → persists', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-ui-text-color"]')!;
    input.value = '#fafafa';
    fireChange(input);
    expect(dispatcher.getState().settings?.theme.uiTextColor).toBe('#fafafa');
    expect(getSettingsBody(dispatcher).theme.uiTextColor).toBe('#fafafa');
  });

  it('reset → clears to null', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-ui-text-color"]')!;
    input.value = '#fafafa';
    fireChange(input);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-ui-text-color"]')!;
    fireClick(btn);
    expect(dispatcher.getState().settings?.theme.uiTextColor).toBeNull();
  });

  it('persisted value → DOM --c-fg', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-ui-text-color"]')!;
    input.value = '#cccccc';
    fireChange(input);
    expect(root.style.getPropertyValue('--c-fg')).toBe('#cccccc');
  });
});

// ── 3. Preferred font ───────────────────────────────────────────

describe('preferred font UI', () => {
  it('renders a select with data-pkc-action="set-preferred-font"', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]');
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('BIZ UDGothic');
  });

  it('selecting a font → dispatches SET_PREFERRED_FONT → persists', () => {
    const { dispatcher } = setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    expect(dispatcher.getState().settings?.display.preferredFont).toBe('Inter');
    expect(getSettingsBody(dispatcher).display.preferredFont).toBe('Inter');
  });

  it('selecting System Default → dispatches RESET_PREFERRED_FONT → null', () => {
    const { dispatcher } = setup();
    let select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    // Re-render rebuilds the DOM — re-query.
    select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = '';
    fireChange(select);
    expect(dispatcher.getState().settings?.display.preferredFont).toBeNull();
  });

  it('persisted value → DOM --font-sans', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    expect(root.style.getPropertyValue('--font-sans')).toContain('Inter');
  });
});

// ── 4. Language ─────────────────────────────────────────────────

describe('language UI', () => {
  it('renders a select with data-pkc-action="set-language"', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]');
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('ja');
    expect(options).toContain('en');
  });

  it('selecting ja → dispatches SET_LANGUAGE → persists', () => {
    const { dispatcher } = setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = 'ja';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.language).toBe('ja');
    expect(getSettingsBody(dispatcher).locale.language).toBe('ja');
  });

  it('selecting System → dispatches RESET_LANGUAGE → null', () => {
    const { dispatcher } = setup();
    let select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = 'en';
    fireChange(select);
    select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = '';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.language).toBeNull();
  });

  it('persisted value → DOM html[lang]', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = 'en-US';
    fireChange(select);
    expect(document.documentElement.getAttribute('lang')).toBe('en-US');
  });
});

// ── 5. Timezone ─────────────────────────────────────────────────

describe('timezone UI', () => {
  it('renders a select with data-pkc-action="set-timezone"', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]');
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('Asia/Tokyo');
    expect(options).toContain('UTC');
  });

  it('selecting Asia/Tokyo → dispatches SET_TIMEZONE → persists', () => {
    const { dispatcher } = setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]')!;
    select.value = 'Asia/Tokyo';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.timezone).toBe('Asia/Tokyo');
    expect(getSettingsBody(dispatcher).locale.timezone).toBe('Asia/Tokyo');
  });

  it('selecting System → dispatches RESET_TIMEZONE → null', () => {
    const { dispatcher } = setup();
    let select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]')!;
    select.value = 'UTC';
    fireChange(select);
    select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]')!;
    select.value = '';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.timezone).toBeNull();
  });
});

// ── 6. Restore round-trip ───────────────────────────────────────

describe('full settings restore round-trip', () => {
  it('all 8 settings survive RESTORE_SETTINGS and reach the DOM', () => {
    const { dispatcher } = setup();
    const payload: SystemSettingsPayload = {
      format: 'pkc2-system-settings',
      version: 1,
      theme: {
        mode: 'dark',
        scanline: true,
        accentColor: '#ff00aa',
        borderColor: '#112233',
        backgroundColor: '#001100',
        uiTextColor: '#fafafa',
        bodyTextColor: '#dddddd',
      },
      display: { preferredFont: 'Inter', fontDirectInput: null },
      locale: { language: 'en-US', timezone: 'Asia/Tokyo' },
    };
    dispatcher.dispatch({ type: 'RESTORE_SETTINGS', settings: payload });

    const s = dispatcher.getState();
    expect(s.settings).toEqual(payload);
    expect(root.getAttribute('data-pkc-theme')).toBe('dark');
    expect(root.getAttribute('data-pkc-scanline')).toBe('on');
    expect(root.style.getPropertyValue('--c-accent')).toBe('#ff00aa');
    expect(root.style.getPropertyValue('--c-border')).toBe('#112233');
    expect(root.style.getPropertyValue('--c-bg')).toBe('#001100');
    expect(root.style.getPropertyValue('--c-fg')).toBe('#fafafa');
    expect(root.style.getPropertyValue('--c-body-text')).toBe('#dddddd');
    expect(root.style.getPropertyValue('--font-sans')).toContain('Inter');
    expect(document.documentElement.getAttribute('lang')).toBe('en-US');
  });
});

// ── 7. Regression guard ─────────────────────────────────────────

describe('existing settings are not broken', () => {
  it('theme mode still dispatches via set-theme click', () => {
    const { dispatcher } = setup();
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="set-theme"][data-pkc-theme-mode="dark"]')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().settings?.theme.mode).toBe('dark');
  });

  it('scanline toggle still works', () => {
    const { dispatcher } = setup();
    const onBtn = root.querySelector<HTMLElement>('[data-pkc-action="set-scanline"][data-pkc-scanline-value="on"]')!;
    onBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().showScanline).toBe(true);
  });

  it('accent color picker still works', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-accent-color"]')!;
    input.value = '#123456';
    fireChange(input);
    expect(dispatcher.getState().accentColor).toBe('#123456');
  });

  it('only one __settings__ entry after all operations', () => {
    const { dispatcher } = setup();
    // Change many settings
    const borderInput = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    borderInput.value = '#aabbcc';
    fireChange(borderInput);
    const uiTextInput = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-ui-text-color"]')!;
    uiTextInput.value = '#ddeeff';
    fireChange(uiTextInput);
    const fontSelect = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    fontSelect.value = 'Inter';
    fireChange(fontSelect);

    const matches = dispatcher.getState().container!.entries.filter((e) => e.lid === SETTINGS_LID);
    expect(matches).toHaveLength(1);
    const body = resolveSettingsPayload(matches[0]!.body);
    expect(body.theme.borderColor).toBe('#aabbcc');
    expect(body.theme.uiTextColor).toBe('#ddeeff');
    expect(body.display.preferredFont).toBe('Inter');
  });
});

// ── 8. Background color ───────────────────────────────────────

describe('background color UI', () => {
  it('renders a color input with data-pkc-action="set-background-color"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-background-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('change → dispatches SET_BACKGROUND_COLOR → persists', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-background-color"]')!;
    input.value = '#112200';
    fireChange(input);
    expect(dispatcher.getState().settings?.theme.backgroundColor).toBe('#112200');
  });

  it('reset → clears to null', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-background-color"]')!;
    input.value = '#112200';
    fireChange(input);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-background-color"]')!;
    fireClick(btn);
    expect(dispatcher.getState().settings?.theme.backgroundColor).toBeNull();
  });

  it('persisted value → DOM --c-bg', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-background-color"]')!;
    input.value = '#112200';
    fireChange(input);
    expect(root.style.getPropertyValue('--c-bg')).toBe('#112200');
  });
});

// ── 9. Body text color ────────────────────────────────────────

describe('body text color UI', () => {
  it('renders a color input with data-pkc-action="set-body-text-color"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-body-text-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('change → dispatches SET_BODY_TEXT_COLOR → persists', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-body-text-color"]')!;
    input.value = '#aabbcc';
    fireChange(input);
    expect(dispatcher.getState().settings?.theme.bodyTextColor).toBe('#aabbcc');
  });

  it('persisted value → DOM --c-body-text', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-body-text-color"]')!;
    input.value = '#aabbcc';
    fireChange(input);
    expect(root.style.getPropertyValue('--c-body-text')).toBe('#aabbcc');
  });
});

// ── 10. Font direct input ─────────────────────────────────────

describe('font direct input', () => {
  it('renders a text input with data-pkc-action="set-font-direct-input"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-font-direct-input"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('text');
  });

  it('direct input wins over dropdown', () => {
    const { dispatcher } = setup();
    // Set dropdown first
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    // Then set direct input
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-font-direct-input"]')!;
    input.value = 'Noto Sans JP';
    fireChange(input);
    expect(dispatcher.getState().settings?.display.fontDirectInput).toBe('Noto Sans JP');
    expect(root.style.getPropertyValue('--font-sans')).toContain('Noto Sans JP');
  });
});

// ── 11. WCAG contrast ratio ───────────────────────────────────

describe('WCAG contrast ratio display', () => {
  it('renders WCAG section with both UI and Body lines', () => {
    setup();
    const wcag = root.querySelector('[data-pkc-region="wcag-contrast"]');
    expect(wcag).not.toBeNull();
    const lines = wcag!.querySelectorAll('.pkc-wcag-line');
    expect(lines.length).toBe(2);
    expect(lines[0]!.textContent).toContain('UI:');
    expect(lines[1]!.textContent).toContain('Body:');
  });

  it('displays a grade badge', () => {
    setup();
    const badges = root.querySelectorAll('.pkc-wcag-badge');
    expect(badges.length).toBe(2);
    const grade = badges[0]!.getAttribute('data-pkc-wcag');
    expect(['AAA', 'AA', 'Fail']).toContain(grade);
  });
});

// ── 12. Menu state persistence (B1/B2 fix) ────────────────────

describe('menu open state', () => {
  it('TOGGLE_MENU opens the menu overlay', () => {
    const { dispatcher } = setup();
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    const menu = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
    expect(menu!.style.display).not.toBe('none');
  });

  it('CLOSE_MENU closes the menu', () => {
    const { dispatcher } = setup();
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'CLOSE_MENU' });
    expect(dispatcher.getState().menuOpen).toBe(false);
  });

  it('settings change does NOT close the menu', () => {
    const { dispatcher } = setup();
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'SET_BORDER_COLOR', color: '#aabbcc' });
    expect(dispatcher.getState().menuOpen).toBe(true);
  });
});

// ── 13. Migration: old textColor → uiTextColor ───────────────

describe('textColor migration', () => {
  it('old textColor maps to uiTextColor on restore', () => {
    const oldPayload = JSON.stringify({
      format: 'pkc2-system-settings',
      version: 1,
      theme: { mode: 'auto', scanline: false, accentColor: null, borderColor: null, textColor: '#ff0000' },
      display: { preferredFont: null },
      locale: { language: null, timezone: null },
    });
    const resolved = resolveSettingsPayload(oldPayload);
    expect(resolved.theme.uiTextColor).toBe('#ff0000');
  });
});
