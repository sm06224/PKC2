/**
 * @vitest-environment happy-dom
 *
 * PR-OO (2026-05-06):export 時に live `#pkc-root` の theme 適用
 * 状態(`data-pkc-theme` + inline style 内の CSS variable
 * override)を snapshot して export HTML の `<div id="pkc-root">`
 * 開きタグに inline する。これにより:
 *   - imported HTML が **first paint** で正しい theme を出す
 *     (boot 後の RESTORE_SETTINGS まで待たない)
 *   - light source mode(boot 抑制 = `__settings__` re-apply 抑制)
 *     でも theme 値が描画に効く
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildExportHtml } from '@adapter/platform/exporter';
import type { Container } from '@core/model/container';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'theme-export-test',
      title: 'Theme Export',
      created_at: '2026-05-06T00:00:00Z',
      updated_at: '2026-05-06T00:00:00Z',
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setupShellDom(): HTMLElement {
  document.documentElement.setAttribute('data-pkc-app', 'pkc2');
  document.documentElement.setAttribute('data-pkc-version', '2.2.0');
  document.documentElement.setAttribute('data-pkc-schema', '1');
  document.documentElement.setAttribute('data-pkc-timestamp', '20260506000000');
  document.documentElement.setAttribute('data-pkc-kind', 'dev');
  document.body.innerHTML = `
    <div id="pkc-root"></div>
    <script id="pkc-data" type="application/json">{}</script>
    <script id="pkc-meta" type="application/json">{}</script>
    <script id="pkc-core">/* bundle */</script>
    <style id="pkc-styles">body{margin:0}</style>
    <style id="pkc-theme">/* theme */</style>
  `;
  return document.getElementById('pkc-root')!;
}

describe('PR-OO: theme snapshot in export', () => {
  beforeEach(() => {
    setupShellDom();
  });

  it('inlines `data-pkc-theme` from live root onto exported #pkc-root', async () => {
    const root = document.getElementById('pkc-root')!;
    root.setAttribute('data-pkc-theme', 'dark');

    const html = await buildExportHtml(makeContainer());
    expect(html).toContain('<div id="pkc-root" data-pkc-theme="dark"');
  });

  it('inlines `style` (CSS variable overrides) from live root onto exported #pkc-root', async () => {
    const root = document.getElementById('pkc-root')!;
    root.style.setProperty('--c-accent', '#ff5722');
    root.style.setProperty('--c-bg', '#0e1116');

    const html = await buildExportHtml(makeContainer());
    expect(html).toMatch(/<div id="pkc-root"[^>]*style="[^"]*--c-accent: #ff5722/);
    expect(html).toMatch(/<div id="pkc-root"[^>]*style="[^"]*--c-bg: #0e1116/);
  });

  it('combines theme attribute and inline style on the exported #pkc-root', async () => {
    const root = document.getElementById('pkc-root')!;
    root.setAttribute('data-pkc-theme', 'light');
    root.style.setProperty('--c-accent', '#3b82f6');

    const html = await buildExportHtml(makeContainer());
    expect(html).toMatch(/<div id="pkc-root" data-pkc-theme="light" style="[^"]*--c-accent: #3b82f6/);
  });

  it('omits attributes when no theme is applied (auto theme, no overrides)', async () => {
    const html = await buildExportHtml(makeContainer());
    // No data-pkc-theme, no style — exact match on the bare div tag.
    expect(html).toContain('<div id="pkc-root"></div>');
  });

  it('escapes attribute values to prevent injection', async () => {
    const root = document.getElementById('pkc-root')!;
    root.style.setProperty('--c-accent', '#fff');
    // Force a malicious-looking attribute through (DOM-safe, then we
    // round-trip via getAttribute which returns the literal value).
    root.setAttribute('data-pkc-theme', 'dark"><script>alert(1)</script>');

    const html = await buildExportHtml(makeContainer());
    // The `"` must be escaped → no raw `"><script>` inside the export
    // root element's attribute area.
    expect(html).not.toContain('"><script>alert(1)');
    // Confirm the `&quot;` escape sequence is present.
    expect(html).toContain('&quot;');
  });
});
