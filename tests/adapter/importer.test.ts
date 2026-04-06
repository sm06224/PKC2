// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  importFromHtml,
  formatImportErrors,
} from '@adapter/platform/importer';
import { buildExportHtml } from '@adapter/platform/exporter';
import type { Container } from '@core/model/container';
import type { ReleaseMeta } from '../../src/runtime/release-meta';

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

function createValidMeta(): ReleaseMeta {
  return {
    app: 'pkc2',
    version: '2.0.0',
    schema: 1,
    kind: 'dev',
    timestamp: '20260406120000',
    build_at: '2026-04-06T12:00:00Z',
    source_commit: 'abc1234',
    code_integrity: 'sha256:deadbeef',
    capabilities: ['core', 'idb', 'export'],
  };
}

/**
 * Build a minimal PKC2 HTML string for testing.
 */
function buildTestHtml(
  container: Container,
  meta?: Partial<ReleaseMeta>,
): string {
  const fullMeta = { ...createValidMeta(), ...meta };
  const dataJson = JSON.stringify({ container }, null, 2);
  const metaJson = JSON.stringify(fullMeta, null, 2);

  return `<!DOCTYPE html>
<html lang="ja" data-pkc-app="pkc2" data-pkc-version="2.0.0" data-pkc-schema="1">
<head><meta charset="UTF-8"><title>PKC2</title></head>
<body>
  <div id="pkc-root"></div>
  <script id="pkc-data" type="application/json">${dataJson}</script>
  <script id="pkc-meta" type="application/json">${metaJson}</script>
  <script id="pkc-core">console.log("bundle")</script>
</body>
</html>`;
}

describe('importFromHtml', () => {
  describe('valid import', () => {
    it('parses valid PKC2 HTML and returns Container', () => {
      const c = createTestContainer();
      const html = buildTestHtml(c);
      const result = importFromHtml(html);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.container.meta.container_id).toBe('test-cid-001');
      expect(result.container.entries).toHaveLength(2);
      expect(result.container.relations).toHaveLength(1);
    });

    it('returns meta from the imported HTML', () => {
      const c = createTestContainer();
      const html = buildTestHtml(c);
      const result = importFromHtml(html);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.meta.app).toBe('pkc2');
      expect(result.meta.version).toBe('2.0.0');
      expect(result.meta.schema).toBe(1);
    });

    it('sets source to provided value or default', () => {
      const c = createTestContainer();
      const html = buildTestHtml(c);

      const r1 = importFromHtml(html, 'test-file.html');
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.source).toBe('test-file.html');

      const r2 = importFromHtml(html);
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.source).toBe('html-string');
    });

    it('preserves empty entries and relations arrays', () => {
      const c = createTestContainer({ entries: [], relations: [] });
      const html = buildTestHtml(c);
      const result = importFromHtml(html);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.container.entries).toEqual([]);
      expect(result.container.relations).toEqual([]);
    });
  });

  describe('validation failures', () => {
    it('rejects non-HTML input', () => {
      const result = importFromHtml('not html at all');
      // DOMParser doesn't fail on invalid HTML, it produces a document
      // But without pkc-meta it should fail
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.code).toBe('MISSING_PKC_META');
      }
    });

    it('rejects HTML without pkc-meta', () => {
      const html = `<!DOCTYPE html><html><body>
        <script id="pkc-data" type="application/json">{"container":{}}</script>
      </body></html>`;
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.code).toBe('MISSING_PKC_META');
      }
    });

    it('rejects HTML with empty pkc-meta', () => {
      const html = `<!DOCTYPE html><html><body>
        <script id="pkc-meta" type="application/json">{}</script>
        <script id="pkc-data" type="application/json">{"container":{}}</script>
      </body></html>`;
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.code).toBe('MISSING_PKC_META');
      }
    });

    it('rejects wrong app ID', () => {
      const c = createTestContainer();
      const html = buildTestHtml(c, { app: 'not-pkc2' as 'pkc2' });
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'INVALID_APP_ID')).toBe(true);
        expect(result.errors[0]!.message).toContain('not-pkc2');
      }
    });

    it('rejects schema version mismatch', () => {
      const c = createTestContainer();
      const html = buildTestHtml(c, { schema: 99 });
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'SCHEMA_MISMATCH')).toBe(true);
        expect(result.errors[0]!.message).toContain('99');
      }
    });

    it('rejects HTML without pkc-data', () => {
      const meta = createValidMeta();
      const html = `<!DOCTYPE html><html><body>
        <script id="pkc-meta" type="application/json">${JSON.stringify(meta)}</script>
      </body></html>`;
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.code).toBe('MISSING_PKC_DATA');
      }
    });

    it('rejects pkc-data without container key', () => {
      const meta = createValidMeta();
      const html = `<!DOCTYPE html><html><body>
        <script id="pkc-meta" type="application/json">${JSON.stringify(meta)}</script>
        <script id="pkc-data" type="application/json">{"notContainer": true}</script>
      </body></html>`;
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.code).toBe('INVALID_CONTAINER');
        expect(result.errors[0]!.message).toContain('missing "container" key');
      }
    });

    it('rejects Container without meta', () => {
      const meta = createValidMeta();
      const container = { entries: [], relations: [], revisions: [], assets: {} };
      const html = `<!DOCTYPE html><html><body>
        <script id="pkc-meta" type="application/json">${JSON.stringify(meta)}</script>
        <script id="pkc-data" type="application/json">${JSON.stringify({ container })}</script>
      </body></html>`;
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'INVALID_CONTAINER')).toBe(true);
      }
    });

    it('rejects Container without entries array', () => {
      const meta = createValidMeta();
      const container = {
        meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
        relations: [], revisions: [], assets: {},
      };
      const html = `<!DOCTYPE html><html><body>
        <script id="pkc-meta" type="application/json">${JSON.stringify(meta)}</script>
        <script id="pkc-data" type="application/json">${JSON.stringify({ container })}</script>
      </body></html>`;
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.message.includes('entries'))).toBe(true);
      }
    });

    it('collects multiple validation errors', () => {
      const c = createTestContainer();
      const html = buildTestHtml(c, { app: 'wrong' as 'pkc2', schema: 99 });
      const result = importFromHtml(html);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
        const codes = result.errors.map((e) => e.code);
        expect(codes).toContain('INVALID_APP_ID');
        expect(codes).toContain('SCHEMA_MISMATCH');
      }
    });
  });
});

describe('formatImportErrors', () => {
  it('formats errors for display', () => {
    const errors = [
      { code: 'INVALID_APP_ID' as const, message: 'Expected "pkc2"' },
      { code: 'SCHEMA_MISMATCH' as const, message: 'Expected schema 1' },
    ];
    const formatted = formatImportErrors(errors);

    expect(formatted).toContain('[INVALID_APP_ID]');
    expect(formatted).toContain('[SCHEMA_MISMATCH]');
    expect(formatted).toContain('Expected "pkc2"');
  });
});

describe('export → import round-trip', () => {
  /**
   * Set up the DOM for buildExportHtml (which reads live DOM).
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
      <script id="pkc-meta" type="application/json">${JSON.stringify(createValidMeta())}</script>
      <script id="pkc-core">console.log("bundle")</script>
      <style id="pkc-styles">body { margin: 0; }</style>
      <style id="pkc-theme">/* theme */</style>
    `;
  }

  it('round-trips Container through export → import', () => {
    setupShellDom();
    const original = createTestContainer();

    // Export
    const html = buildExportHtml(original);

    // Import
    const result = importFromHtml(html, 'exported.html');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verify Container fidelity
    expect(result.container.meta).toEqual(original.meta);
    expect(result.container.entries).toEqual(original.entries);
    expect(result.container.relations).toEqual(original.relations);
    expect(result.container.revisions).toEqual(original.revisions);
    expect(result.container.assets).toEqual(original.assets);
    expect(result.source).toBe('exported.html');
  });

  it('round-trips Container with special characters', () => {
    setupShellDom();
    const original = createTestContainer({
      entries: [
        {
          lid: 'e1',
          title: 'Test </script> and "quotes"',
          body: 'Body with <b>html</b> & entities',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });

    const html = buildExportHtml(original);
    const result = importFromHtml(html);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.entries[0]!.title).toBe('Test </script> and "quotes"');
    expect(result.container.entries[0]!.body).toBe('Body with <b>html</b> & entities');
  });
});

describe('reducer: SYS_IMPORT_COMPLETE', () => {
  // Test the reducer integration indirectly via the dispatcher
  it('is handled by the dispatcher in ready phase', async () => {
    // Dynamic import to avoid env issues
    const { createDispatcher } = await import('@adapter/state/dispatcher');

    const dispatcher = createDispatcher();
    const c = createTestContainer();

    // Initialize first
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: createTestContainer({ entries: [] }) });
    expect(dispatcher.getState().phase).toBe('ready');

    // Import
    const events: string[] = [];
    dispatcher.onEvent((e) => events.push(e.type));

    dispatcher.dispatch({ type: 'SYS_IMPORT_COMPLETE', container: c, source: 'test.html' });

    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().container?.entries).toHaveLength(2);
    expect(dispatcher.getState().selectedLid).toBeNull();
    expect(events).toContain('CONTAINER_IMPORTED');
  });
});
