// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  serializePkcData,
  buildExportHtml,
  generateExportFilename,
  exportContainerAsHtml,
} from '@adapter/platform/exporter';
import type { Container } from '@core/model/container';

const T = '2026-04-06T00:00:00Z';

function createTestContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'test-cid-001',
      title: 'Test Container',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'Body 1', archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Entry 2', body: 'Body 2', archetype: 'todo', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

/**
 * Set up the DOM to match the shell.html contract.
 * This simulates the state of a running PKC2 instance.
 */
function setupShellDom(): void {
  document.documentElement.setAttribute('data-pkc-app', 'pkc2');
  document.documentElement.setAttribute('data-pkc-version', '2.0.0');
  document.documentElement.setAttribute('data-pkc-schema', '1');
  document.documentElement.setAttribute('data-pkc-timestamp', '20260406120000');
  document.documentElement.setAttribute('data-pkc-kind', 'dev');

  document.body.innerHTML = `
    <div id="pkc-root"></div>
    <script id="pkc-data" type="application/json">{}</script>
    <script id="pkc-meta" type="application/json">${JSON.stringify({
      app: 'pkc2',
      version: '2.0.0',
      schema: 1,
      kind: 'dev',
      timestamp: '20260406120000',
      build_at: '2026-04-06T12:00:00Z',
      source_commit: 'abc1234',
      code_integrity: 'sha256:deadbeef',
      capabilities: ['core', 'idb'],
    })}</script>
    <script id="pkc-core">console.log("PKC2 bundle")</script>
    <style id="pkc-styles">body { margin: 0; }</style>
    <style id="pkc-theme">/* theme */</style>
  `;
}

beforeEach(() => {
  setupShellDom();
});

describe('serializePkcData', () => {
  it('wraps Container in { container } shape', () => {
    const c = createTestContainer();
    const json = serializePkcData(c);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('container');
    expect(parsed.container.meta.container_id).toBe('test-cid-001');
    expect(parsed.container.entries).toHaveLength(2);
    expect(parsed.container.relations).toHaveLength(1);
  });

  it('does not include runtime state (selectedLid, phase, etc.)', () => {
    const c = createTestContainer();
    const json = serializePkcData(c);

    expect(json).not.toContain('selectedLid');
    expect(json).not.toContain('editingLid');
    expect(json).not.toContain('phase');
  });
});

describe('buildExportHtml', () => {
  it('produces valid HTML with all fixed-ID slots', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('id="pkc-root"');
    expect(html).toContain('id="pkc-data"');
    expect(html).toContain('id="pkc-meta"');
    expect(html).toContain('id="pkc-core"');
    expect(html).toContain('id="pkc-styles"');
    expect(html).toContain('id="pkc-theme"');
  });

  it('embeds Container data in pkc-data slot', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    // Extract pkc-data content
    const match = html.match(/<script id="pkc-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(match).toBeTruthy();
    const data = JSON.parse(match![1]!);
    expect(data.container.meta.container_id).toBe('test-cid-001');
    expect(data.container.entries).toHaveLength(2);
  });

  it('preserves pkc-core content from DOM', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    expect(html).toContain('console.log("PKC2 bundle")');
  });

  it('preserves pkc-styles content from DOM', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    expect(html).toContain('body { margin: 0; }');
  });

  it('preserves data-pkc-* attributes on html element', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    expect(html).toContain('data-pkc-app="pkc2"');
    expect(html).toContain('data-pkc-version="2.0.0"');
    expect(html).toContain('data-pkc-schema="1"');
    expect(html).toContain('data-pkc-kind="dev"');
  });

  it('adds export capability to metadata', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    const metaMatch = html.match(/<script id="pkc-meta" type="application\/json">([\s\S]*?)<\/script>/);
    expect(metaMatch).toBeTruthy();
    const meta = JSON.parse(metaMatch![1]!);
    expect(meta.capabilities).toContain('export');
  });

  it('preserves code_integrity (same code, same hash)', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    const metaMatch = html.match(/<script id="pkc-meta" type="application\/json">([\s\S]*?)<\/script>/);
    const meta = JSON.parse(metaMatch![1]!);
    expect(meta.code_integrity).toBe('sha256:deadbeef');
  });

  it('uses container title as HTML title', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    expect(html).toContain('<title>Test Container</title>');
  });

  it('escapes special characters in HTML title element', () => {
    const c = createTestContainer({
      meta: {
        container_id: 'c1',
        title: 'Test <b>bold</b>',
        created_at: T,
        updated_at: T,
        schema_version: 1,
      },
    });
    const html = buildExportHtml(c);

    // HTML title element has escaped angle brackets
    expect(html).toContain('<title>Test &lt;b&gt;bold&lt;/b&gt;</title>');
  });

  it('escapes </script> in pkc-data JSON to prevent tag closure', () => {
    const c = createTestContainer({
      meta: {
        container_id: 'c1',
        title: 'Has </script> in title',
        created_at: T,
        updated_at: T,
        schema_version: 1,
      },
    });
    const html = buildExportHtml(c);

    // The raw </script> must not appear inside the pkc-data script element
    // (it would prematurely close the tag). serializePkcData escapes it.
    const dataMatch = html.match(/<script id="pkc-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(dataMatch).toBeTruthy();
    const dataContent = dataMatch![1]!;
    expect(dataContent).not.toContain('</script>');
    expect(dataContent).toContain('<\\/script>');

    // The escaped JSON is still parseable (browser handles <\/ correctly in JSON)
    const parsed = JSON.parse(dataContent.replace(/<\\\/script>/gi, '</script>'));
    expect(parsed.container.meta.title).toBe('Has </script> in title');
  });
});

describe('generateExportFilename', () => {
  it('generates pkc2-{slug}-{date}.html format', () => {
    const c = createTestContainer();
    const filename = generateExportFilename(c);

    expect(filename).toMatch(/^pkc2-test-container-\d{8}\.html$/);
  });

  it('uses override when provided', () => {
    const c = createTestContainer();
    const filename = generateExportFilename(c, 'my-export');

    expect(filename).toBe('my-export.html');
  });

  it('handles empty title by falling back to container_id', () => {
    const c = createTestContainer({
      meta: {
        container_id: 'cid-fallback',
        title: '',
        created_at: T,
        updated_at: T,
        schema_version: 1,
      },
    });
    const filename = generateExportFilename(c);

    expect(filename).toMatch(/^pkc2-cid-fallback-\d{8}\.html$/);
  });
});

describe('exportContainerAsHtml', () => {
  const noopDownload = vi.fn();

  it('returns success with filename and size', () => {
    const c = createTestContainer();
    const result = exportContainerAsHtml(c, { downloadFn: noopDownload });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^pkc2-test-container-\d{8}\.html$/);
    expect(result.size).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('calls download function with HTML content and filename', () => {
    const downloadSpy = vi.fn();
    const c = createTestContainer();
    exportContainerAsHtml(c, { downloadFn: downloadSpy });

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [html, filename] = downloadSpy.mock.calls[0]!;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('id="pkc-data"');
    expect(filename).toMatch(/\.html$/);
  });

  it('returns failure when download throws', () => {
    const failingDownload = vi.fn(() => { throw new Error('download failed'); });
    const c = createTestContainer();
    const result = exportContainerAsHtml(c, { downloadFn: failingDownload });

    expect(result.success).toBe(false);
    expect(result.error).toContain('download failed');
  });

  it('accepts filename override via options', () => {
    const c = createTestContainer();
    const result = exportContainerAsHtml(c, { filename: 'custom-name', downloadFn: noopDownload });

    expect(result.filename).toBe('custom-name.html');
  });
});

describe('export round-trip: pkc-data readability', () => {
  it('exported pkc-data can be parsed back to Container', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    // Simulate readPkcData() from main.ts
    const match = html.match(/<script id="pkc-data" type="application\/json">([\s\S]*?)<\/script>/);
    const data = JSON.parse(match![1]!);
    const container = data.container;

    expect(container.meta.container_id).toBe('test-cid-001');
    expect(container.meta.title).toBe('Test Container');
    expect(container.entries).toHaveLength(2);
    expect(container.entries[0].lid).toBe('e1');
    expect(container.relations).toHaveLength(1);
    expect(container.revisions).toHaveLength(0);
  });

  it('exported HTML preserves full Container fidelity', () => {
    const c = createTestContainer();
    const html = buildExportHtml(c);

    const match = html.match(/<script id="pkc-data" type="application\/json">([\s\S]*?)<\/script>/);
    const roundTripped = JSON.parse(match![1]!).container as Container;

    // Deep equality of persistent model
    expect(roundTripped.meta).toEqual(c.meta);
    expect(roundTripped.entries).toEqual(c.entries);
    expect(roundTripped.relations).toEqual(c.relations);
    expect(roundTripped.revisions).toEqual(c.revisions);
    expect(roundTripped.assets).toEqual(c.assets);
  });
});
