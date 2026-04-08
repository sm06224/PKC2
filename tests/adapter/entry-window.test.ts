/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for entry-window.ts — verifies:
 * 1. Child window HTML uses the same CSS class names as center pane
 * 2. DOM structure mirrors center pane (view-title-row, view-body, editor, action-bar)
 * 3. Preview re-renders from current textarea value (not stale content)
 * 4. Parent's renderMarkdown is exposed as window.pkcRenderMarkdown
 * 5. Theme variables are inherited from parent
 */

let capturedHtml = '';
let testCounter = 0;

function setupWindowOpenMock() {
  const childDoc = {
    open: vi.fn(),
    write: vi.fn((html: string) => { capturedHtml = html; }),
    close: vi.fn(),
  };
  const childWindow = {
    closed: false,
    focus: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(childWindow as unknown as Window);
  return { childWindow };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  testCounter++;
  return {
    lid: `e-${testCounter}`,
    title: 'Test Entry',
    body: '# Hello\n\nSome **bold** text.',
    archetype: 'text' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

/** Helper: open an entry window and return the captured HTML. */
async function openAndCapture(readonly = false) {
  capturedHtml = '';
  setupWindowOpenMock();
  const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
  openEntryWindow(makeEntry() as never, readonly, vi.fn());
  return capturedHtml;
}

describe('Entry Window', () => {
  beforeEach(() => {
    capturedHtml = '';
    vi.restoreAllMocks();
  });

  describe('pkcRenderMarkdown global', () => {
    it('exposes renderMarkdown on window', async () => {
      await import('../../src/adapter/ui/entry-window');
      const global = window as unknown as Record<string, unknown>;
      expect(typeof global.pkcRenderMarkdown).toBe('function');
    });

    it('pkcRenderMarkdown produces valid HTML', async () => {
      await import('../../src/adapter/ui/entry-window');
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderMarkdown as (text: string) => string;
      const result = render('# Title');
      expect(result).toContain('<h1>');
      expect(result).toContain('Title');
    });
  });

  describe('HTML structure mirrors center pane', () => {
    it('uses pkc-view-title-row and pkc-view-title in view mode', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-view-title-row');
      expect(html).toContain('pkc-view-title');
    });

    it('uses pkc-view-body pkc-md-rendered for body display', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-view-body pkc-md-rendered');
    });

    it('uses pkc-editor-title-row and pkc-editor-title in edit pane', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-editor-title-row');
      expect(html).toContain('pkc-editor-title');
    });

    it('uses pkc-editor-body for textarea', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-editor-body');
    });

    it('uses pkc-action-bar with same structure as center pane', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-action-bar');
      expect(html).toContain('pkc-action-bar-status');
      expect(html).toContain('pkc-action-bar-info');
    });

    it('uses pkc-btn and pkc-btn-primary for buttons', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-btn');
      expect(html).toContain('pkc-btn-primary');
    });

    it('uses pkc-archetype-label badge', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-archetype-label');
    });
  });

  describe('CSS theme inheritance', () => {
    it('includes parent CSS variables in :root', async () => {
      const html = await openAndCapture();
      expect(html).toContain(':root {');
      expect(html).toContain('color-scheme');
    });

    it('includes markdown rendering styles (pkc-md-rendered)', async () => {
      const html = await openAndCapture();
      expect(html).toContain('.pkc-md-rendered h1');
      expect(html).toContain('.pkc-md-rendered code');
      expect(html).toContain('.pkc-md-rendered blockquote');
    });
  });

  describe('Tab bar and preview', () => {
    it('has Source and Preview tabs using pkc-tab class', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-tab-bar');
      expect(html).toContain('id="tab-source"');
      expect(html).toContain('id="tab-preview"');
      expect(html).toContain('>Source<');
      expect(html).toContain('>Preview<');
    });

    it('showTab preview calls renderMd which uses window.opener.pkcRenderMarkdown', async () => {
      const html = await openAndCapture();
      expect(html).toContain('renderMd(src)');
      expect(html).toContain('window.opener.pkcRenderMarkdown');
    });

    it('preview div re-renders from textarea value (not stale)', async () => {
      const html = await openAndCapture();
      // showTab reads body-edit.value (current value), not a cached variable
      expect(html).toContain("var src = document.getElementById('body-edit').value");
      expect(html).toContain("document.getElementById('body-preview').innerHTML = renderMd(src)");
    });
  });

  describe('Readonly mode', () => {
    it('hides Edit button element when readonly', async () => {
      const html = await openAndCapture(true);
      // No <button> with id="btn-edit" rendered in the HTML body
      expect(html).not.toContain('id="btn-edit"');
    });

    it('shows Edit button when not readonly', async () => {
      const html = await openAndCapture(false);
      expect(html).toContain('btn-edit');
    });
  });

  describe('Conflict banner', () => {
    it('includes conflict banner element', async () => {
      const html = await openAndCapture();
      expect(html).toContain('pkc-conflict-banner');
      expect(html).toContain('id="conflict-banner"');
    });
  });

  describe('View/Edit mode switching', () => {
    it('enterEdit hides view-pane and shows edit-pane', async () => {
      const html = await openAndCapture();
      expect(html).toContain("document.getElementById('view-pane').style.display = 'none'");
      expect(html).toContain("document.getElementById('edit-pane').style.display = ''");
    });

    it('sets data-pkc-editing on action-bar during edit', async () => {
      const html = await openAndCapture();
      expect(html).toContain("setAttribute('data-pkc-editing', 'true')");
    });

    it('shows editing status in action bar', async () => {
      const html = await openAndCapture();
      expect(html).toContain('Editing');
    });
  });

  describe('No old CSS theme', () => {
    it('does not contain the old hardcoded blue theme colors', async () => {
      const html = await openAndCapture();
      expect(html).not.toContain('#1a1a2e');
      expect(html).not.toContain('#16213e');
    });

    it('does not use old class names (body-view, body-edit, title-input as class)', async () => {
      const html = await openAndCapture();
      expect(html).not.toContain('class="body-view"');
      expect(html).not.toContain('class="body-edit"');
      expect(html).not.toContain('class="title-input"');
    });
  });
});
