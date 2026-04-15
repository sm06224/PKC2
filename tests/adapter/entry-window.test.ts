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

/**
 * Extract the view-pane (rendered body) from the captured HTML.
 * Scoping to the view pane avoids false positives from the child's
 * inline `<script>` block, which also references DOM attribute names
 * like `data-pkc-ew-preview-type` as literal strings.
 */
function extractBodyView(html: string): string {
  // Accept either `<div id="view-pane">` or `<div id="view-pane" …>`
  // (the TOC-sidebar layout adds `data-pkc-has-toc` after `id=`).
  const start = html.indexOf('<div id="view-pane"');
  if (start < 0) return html;
  const end = html.indexOf('<div id="edit-pane"', start);
  return html.slice(start, end < 0 ? html.length : end);
}

/** Helper: open an entry window and return the captured HTML. */
async function openAndCapture(
  readonly = false,
  overrides: Record<string, unknown> = {},
  lightSource = false,
  assetContext?: unknown,
  onDownloadAsset?: (key: string) => void,
) {
  capturedHtml = '';
  setupWindowOpenMock();
  const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
  openEntryWindow(
    makeEntry(overrides) as never,
    readonly,
    vi.fn(),
    lightSource,
    assetContext as never,
    onDownloadAsset,
  );
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
      expect(result).toMatch(/<h1[ >]/);
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
      // After A-2 (2026-04-14), TEXT archetype uses the split editor
      // and omits the tab bar. The Source/Preview tab bar is now the
      // fallback editor for non-TEXT, non-structured archetypes
      // (attachment / folder / generic / opaque). Pin the contract on
      // a non-TEXT archetype so this regression test still measures
      // the tab bar emission.
      const html = await openAndCapture(false, { archetype: 'generic' });
      expect(html).toContain('pkc-tab-bar');
      expect(html).toContain('id="tab-source"');
      expect(html).toContain('id="tab-preview"');
      expect(html).toContain('>Source<');
      expect(html).toContain('>Preview<');
    });

    it('showTab preview calls renderMd which uses window.opener.pkcRenderMarkdown', async () => {
      // renderMd is referenced from BOTH the tab-bar `showTab()` path
      // and the A-2 split editor's input listener — emitted in the
      // child script either way, so default archetype is fine.
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

  // ── Archetype-aware display ──

  describe('Text archetype', () => {
    it('renders markdown for text entries', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: '# Hello' });
      expect(html).toMatch(/<h1[ >]/);
      expect(html).toContain('Hello');
    });

    it('shows (empty) for empty text body', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: '' });
      expect(html).toContain('(empty)');
    });
  });

  describe('Attachment archetype', () => {
    const attBody = JSON.stringify({ name: 'report.pdf', mime: 'application/pdf', size: 102400, asset_key: 'a1' });

    it('renders file info card instead of JSON', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
      expect(html).toContain('data-pkc-ew-card="attachment"');
      expect(html).toContain('report.pdf');
      expect(html).toContain('application/pdf');
    });

    it('shows file size formatted', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
      expect(html).toContain('100.0 KB');
    });

    it('shows file extension', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
      expect(html).toContain('pdf');
    });

    it('does not show raw JSON body in the view pane', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
      const viewBody = html.match(/id="body-view">([\s\S]*?)<\/div>/)?.[1] ?? '';
      expect(viewBody).not.toContain('"asset_key"');
      expect(viewBody).toContain('data-pkc-ew-card="attachment"');
    });

    it('no longer shows the Phase 3 "Preview is available in the main window" dead end', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
      expect(html).not.toContain('Preview is available in the main window');
    });
  });

  describe('Todo archetype', () => {
    const todoBody = JSON.stringify({ status: 'open', description: 'Buy groceries', date: '2099-12-31' });

    it('renders todo card instead of JSON', async () => {
      const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
      expect(html).toContain('data-pkc-ew-card="todo"');
      expect(html).toContain('Open');
      expect(html).toContain('Buy groceries');
    });

    it('shows date formatted', async () => {
      const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
      expect(html).toContain('2099');
    });

    it('does not show raw JSON body in the view pane', async () => {
      const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
      // The view body should contain the card, not the raw JSON keys in view context
      const viewBody = html.match(/id="body-view">([\s\S]*?)<\/div>/)?.[1] ?? '';
      expect(viewBody).not.toContain('"status"');
      expect(viewBody).toContain('data-pkc-ew-card="todo"');
    });

    it('shows done status icon for done todo', async () => {
      const doneBody = JSON.stringify({ status: 'done', description: 'Already done' });
      const html = await openAndCapture(false, { archetype: 'todo', body: doneBody });
      expect(html).toContain('Done');
    });

    it('shows archived badge when archived', async () => {
      const archivedBody = JSON.stringify({ status: 'done', description: 'old', archived: true });
      const html = await openAndCapture(false, { archetype: 'todo', body: archivedBody });
      expect(html).toContain('Archived');
    });

    it('marks overdue date with danger color', async () => {
      const overdueBody = JSON.stringify({ status: 'open', description: 'late', date: '2020-01-01' });
      const html = await openAndCapture(false, { archetype: 'todo', body: overdueBody });
      expect(html).toContain('c-danger');
    });
  });

  describe('Form archetype', () => {
    const formBody = JSON.stringify({ name: 'John Doe', note: 'Some note', checked: true });

    it('renders form card instead of JSON', async () => {
      const html = await openAndCapture(false, { archetype: 'form', body: formBody });
      expect(html).toContain('data-pkc-ew-card="form"');
      expect(html).toContain('John Doe');
      expect(html).toContain('Some note');
    });

    it('shows checked status', async () => {
      const html = await openAndCapture(false, { archetype: 'form', body: formBody });
      expect(html).toContain('Yes');
    });

    it('does not show raw JSON body in the view pane', async () => {
      const html = await openAndCapture(false, { archetype: 'form', body: formBody });
      const viewBody = html.match(/id="body-view">([\s\S]*?)<\/div>/)?.[1] ?? '';
      expect(viewBody).not.toContain('"name"');
      expect(viewBody).toContain('data-pkc-ew-card="form"');
    });
  });

  describe('Fallback archetype', () => {
    it('renders markdown for unknown archetype', async () => {
      const html = await openAndCapture(false, { archetype: 'generic', body: '# Test' });
      expect(html).toMatch(/<h1[ >]/);
      expect(html).toContain('Test');
    });

    it('renders markdown for folder archetype', async () => {
      const html = await openAndCapture(false, { archetype: 'folder', body: 'Folder notes' });
      expect(html).toContain('Folder notes');
    });
  });

  describe('Archetype card CSS', () => {
    it('includes pkc-ew-card styles in the window HTML', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: '{"name":"a.txt","mime":"text/plain"}' });
      expect(html).toContain('.pkc-ew-card');
      expect(html).toContain('.pkc-ew-card-icon');
      expect(html).toContain('.pkc-ew-card-fields');
    });
  });

  // ── Light mode notice ──

  describe('Light mode notice in entry window', () => {
    it('shows Light notice for attachment entry when lightSource is true', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: '{"name":"a.txt","mime":"text/plain"}' }, true);
      expect(html).toContain('data-pkc-region="light-notice"');
      expect(html).toContain('Light export');
    });

    it('does not show Light notice for text entry when lightSource is true', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: '# Hello' }, true);
      expect(html).not.toContain('data-pkc-region="light-notice"');
    });

    it('does not show Light notice when lightSource is false', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: '{"name":"a.txt","mime":"text/plain"}' }, false);
      expect(html).not.toContain('data-pkc-region="light-notice"');
    });

    it('includes Light notice CSS', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: '{"name":"a.txt","mime":"text/plain"}' }, true);
      expect(html).toContain('.pkc-light-notice');
    });
  });

  // ── Phase 4: MIME-aware attachment preview ──

  describe('Phase 4 — attachment preview', () => {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const PNG_BODY = JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 123, asset_key: 'a1' });
    const PDF_BODY = JSON.stringify({ name: 'report.pdf', mime: 'application/pdf', size: 456, asset_key: 'a1' });
    const MP4_BODY = JSON.stringify({ name: 'clip.mp4', mime: 'video/mp4', size: 789, asset_key: 'a1' });
    const MP3_BODY = JSON.stringify({ name: 'jingle.mp3', mime: 'audio/mpeg', size: 321, asset_key: 'a1' });
    const HTML_BODY = JSON.stringify({ name: 'page.html', mime: 'text/html', size: 100, asset_key: 'a1' });
    const SVG_BODY = JSON.stringify({ name: 'icon.svg', mime: 'image/svg+xml', size: 50, asset_key: 'a1' });
    const UNK_BODY = JSON.stringify({ name: 'data.bin', mime: 'application/octet-stream', size: 10, asset_key: 'a1' });
    const NO_KEY_BODY = JSON.stringify({ name: 'empty.txt', mime: 'text/plain' });

    it('image preview emits an <img> slot with data-pkc-ew-preview-type="image"', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PNG_BODY }, false, {
        attachmentData: PNG_B64,
      });
      expect(html).toContain('data-pkc-ew-preview-type="image"');
      expect(html).toContain('data-pkc-ew-slot="img"');
      // The script boots inline data URI rendering for images.
      expect(html).toContain("'data:' + mime + ';base64,' + pkcAttachmentData");
    });

    it('image preview embeds the base64 data in the script block', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PNG_BODY }, false, {
        attachmentData: PNG_B64,
      });
      expect(html).toContain(PNG_B64);
      expect(html).toContain('var pkcAttachmentData');
      expect(html).toContain('var pkcAttachmentMime');
    });

    it('PDF preview emits an iframe slot + blob URL boot', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PDF_BODY }, false, {
        attachmentData: 'UERGZGF0YQ==',
      });
      expect(html).toContain('data-pkc-ew-preview-type="pdf"');
      expect(html).toContain('data-pkc-ew-slot="iframe"');
      // Boot path uses URL.createObjectURL with base64ToBlob
      expect(html).toContain('URL.createObjectURL(base64ToBlob');
    });

    it('PDF preview shows an "Open in new tab" action button', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PDF_BODY }, false, {
        attachmentData: 'UERGZGF0YQ==',
      });
      expect(html).toContain('data-pkc-ew-action="open-attachment"');
      expect(html).toContain('Open PDF in new tab');
    });

    it('video preview emits a <video> slot', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: MP4_BODY }, false, {
        attachmentData: 'VklEZGF0YQ==',
      });
      expect(html).toContain('data-pkc-ew-preview-type="video"');
      expect(html).toContain('data-pkc-ew-slot="video"');
    });

    it('audio preview emits an <audio> slot', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: MP3_BODY }, false, {
        attachmentData: 'QVVEZGF0YQ==',
      });
      expect(html).toContain('data-pkc-ew-preview-type="audio"');
      expect(html).toContain('data-pkc-ew-slot="audio"');
    });

    it('HTML preview uses sandboxed iframe with allow-same-origin baseline', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: HTML_BODY }, false, {
        attachmentData: 'SFRNTCBib2R5',
        sandboxAllow: ['allow-scripts'],
      });
      expect(html).toContain('data-pkc-ew-preview-type="html"');
      // The boot script joins allow-same-origin into the sandbox attribute
      expect(html).toContain("setAttribute('sandbox', allow.join(' '))");
      // sandboxAllow makes it into the inline JSON
      expect(html).toContain('allow-scripts');
      // srcdoc is used (not blob:) so the sandbox applies with about:srcdoc origin
      expect(html).toContain('htmlIframe.srcdoc = base64ToText');
    });

    it('SVG preview uses sandboxed iframe (never an <img>)', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: SVG_BODY }, false, {
        attachmentData: 'PHN2Zy8+',
      });
      expect(html).toContain('data-pkc-ew-preview-type="svg"');
      expect(html).not.toContain('data-pkc-ew-preview-type="image"');
      expect(html).toContain('data-pkc-ew-slot="iframe"');
    });

    it('unknown MIME shows info card + download button + "No inline preview"', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: UNK_BODY }, false, {
        attachmentData: 'YmluYXJ5',
      });
      expect(html).toContain('data-pkc-ew-preview-type="none"');
      expect(html).toContain('No inline preview for this file type.');
      expect(html).toContain('data-pkc-ew-action="download-attachment"');
      // No "open" button for unknown types
      expect(html).not.toContain('data-pkc-ew-action="open-attachment"');
    });

    it('Light mode with no data shows explicit reason, no preview, no action row', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PDF_BODY }, true, {
        attachmentData: undefined,
      });
      expect(html).toContain('Light export');
      expect(html).toContain('attachment-preview-reason');
      expect(html).not.toContain('data-pkc-ew-preview-type="pdf"');
      expect(html).not.toContain('data-pkc-ew-action="download-attachment"');
    });

    it('missing data (asset key present, bytes gone) shows "not available" reason', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PDF_BODY }, false, {
        attachmentData: undefined,
      });
      expect(html).toContain('File data is not available in this container');
      expect(html).not.toContain('data-pkc-ew-preview-type="pdf"');
      expect(html).not.toContain('data-pkc-ew-action="download-attachment"');
    });

    it('empty attachment (no name) shows a short empty-state message', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: '{}' }, false);
      const viewBody = extractBodyView(html);
      expect(viewBody).toContain('No file attached');
      // No preview placeholders / action row in the empty state
      expect(viewBody).not.toContain('data-pkc-ew-preview-type');
      expect(viewBody).not.toContain('data-pkc-ew-action');
    });

    it('falls back to the pre-Phase-4 info card when no assetContext is given', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: PDF_BODY });
      const viewBody = extractBodyView(html);
      // Info card still there, but preview region and action row absent
      expect(viewBody).toContain('data-pkc-ew-card="attachment"');
      expect(viewBody).not.toContain('data-pkc-ew-preview-type="pdf"');
      expect(viewBody).not.toContain('data-pkc-ew-action');
    });

    it('legacy body-data attachments (no asset_key) cannot preview without context', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: NO_KEY_BODY });
      // empty.txt has no asset_key and no explicit attachmentData → reason is generic
      expect(html).toContain('File data is not available');
      expect(html).not.toContain('Light export');
    });

    it('never emits javascript: or data:text/html in the preview HTML', async () => {
      const html = await openAndCapture(false, { archetype: 'attachment', body: HTML_BODY }, false, {
        attachmentData: 'SFRNTCBib2R5',
        sandboxAllow: [],
      });
      expect(html.toLowerCase()).not.toContain('javascript:');
      expect(html.toLowerCase()).not.toContain('data:text/html');
    });
  });

  // ── Phase 4: Text body asset resolution ──

  describe('Phase 4 — text body asset resolution via resolvedBody', () => {
    it('uses resolvedBody when provided', async () => {
      const html = await openAndCapture(false, {
        archetype: 'text',
        body: '![cat](asset:ast-001)',
      }, false, {
        resolvedBody: '![cat](data:image/png;base64,FAKEB64==)',
      });
      const viewBody = extractBodyView(html);
      expect(viewBody).toContain('data:image/png;base64,FAKEB64==');
      // The raw asset reference never reaches markdown-it in the rendered view
      expect(viewBody).not.toContain('asset:ast-001');
    });

    it('renders non-image chip fragment links from resolvedBody', async () => {
      const html = await openAndCapture(false, {
        archetype: 'text',
        body: '[file](asset:ast-pdf-1)',
      }, false, {
        resolvedBody: '[📄 file](#asset-ast-pdf-1)',
      });
      expect(html).toContain('href="#asset-ast-pdf-1"');
      expect(html).toContain('📄');
    });

    it('falls back to entry.body when resolvedBody is omitted', async () => {
      const html = await openAndCapture(false, {
        archetype: 'text',
        body: '# Hello',
      });
      expect(html).toMatch(/<h1[ >]/);
    });
  });

  // ── Phase 4: Chip click interception in the child window ──

  describe('Phase 4 — chip click and action-bar interception', () => {
    it('child script intercepts a[href^="#asset-"] clicks and posts to parent', async () => {
      const html = await openAndCapture();
      expect(html).toContain("target.closest('a[href^=\"#asset-\"]')");
      expect(html).toContain("type: 'pkc-entry-download-asset'");
      expect(html).toContain('window.opener.postMessage');
    });

    it('child script intercepts data-pkc-ew-action buttons', async () => {
      const html = await openAndCapture();
      expect(html).toContain("target.closest('[data-pkc-ew-action]')");
      expect(html).toContain("action === 'download-attachment'");
      expect(html).toContain("action === 'open-attachment'");
    });

    it('boot script tracks and revokes blob URLs on unload', async () => {
      const html = await openAndCapture();
      expect(html).toContain("window.addEventListener('unload'");
      expect(html).toContain('URL.revokeObjectURL');
    });
  });

  // ── Phase 4: pkc-entry-download-asset parent message handling ──

  describe('Phase 4 — parent message handling', () => {
    it('routes pkc-entry-download-asset messages to onDownloadAsset callback', async () => {
      const onDownloadAsset = vi.fn();
      const { childWindow } = setupWindowOpenMock();
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      openEntryWindow(
        makeEntry() as never,
        false,
        vi.fn(),
        false,
        undefined,
        onDownloadAsset,
      );

      // Simulate the child posting a download request
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'pkc-entry-download-asset', assetKey: 'ast-xyz' },
          source: childWindow as unknown as Window,
        }),
      );

      expect(onDownloadAsset).toHaveBeenCalledWith('ast-xyz');
    });

    it('ignores pkc-entry-download-asset messages when onDownloadAsset is omitted', async () => {
      const { childWindow } = setupWindowOpenMock();
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      openEntryWindow(makeEntry() as never, false, vi.fn(), false);

      // Should not throw
      expect(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'pkc-entry-download-asset', assetKey: 'ast-xyz' },
            source: childWindow as unknown as Window,
          }),
        );
      }).not.toThrow();
    });
  });

  // ── Edit-mode Preview Asset Resolution ──

  describe('Edit-preview asset resolution', () => {
    // 1 × 1 red PNG used for image embed resolution assertions
    const RED_PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    it('exposes pkcRenderEntryPreview on the parent window', async () => {
      await import('../../src/adapter/ui/entry-window');
      const global = window as unknown as Record<string, unknown>;
      expect(typeof global.pkcRenderEntryPreview).toBe('function');
    });

    it('child renderMd script calls pkcRenderEntryPreview with the current lid first', async () => {
      const html = await openAndCapture();
      // The child should prefer the new per-lid helper over the
      // legacy parent helper. The third argument is the child-local
      // preview context override used for live refresh (see
      // `edit-preview-asset-resolution.md`, Live refresh foundation).
      expect(html).toContain('pkcRenderEntryPreview');
      expect(html).toContain(
        'window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx)',
      );
      // Legacy fallback chain must remain so non-text archetypes keep
      // working even when no previewCtx is registered.
      expect(html).toContain('window.opener.pkcRenderMarkdown(text)');
    });

    it('pkcRenderEntryPreview without context falls back to plain markdown', async () => {
      await import('../../src/adapter/ui/entry-window');
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render('unknown-lid', '# Title');
      expect(result).toMatch(/<h1[ >]/);
      expect(result).toContain('Title');
    });

    it('pkcRenderEntryPreview without context does NOT resolve asset references', async () => {
      await import('../../src/adapter/ui/entry-window');
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render('not-registered', '![alt](asset:ast-abc)');
      // Without a context the resolver does not run — markdown-it sees
      // the raw `asset:` URL and (because asset: is not on the scheme
      // allowlist) strips the href. No data: URI or fragment chip.
      expect(result).not.toContain('data:image/png');
      expect(result).not.toContain('#asset-');
    });

    it('pkcRenderEntryPreview with registered ctx resolves image embeds', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '![red](asset:ast-red)');
      expect(result).toContain('<img');
      expect(result).toContain('data:image/png;base64,' + RED_PNG);
    });

    it('pkcRenderEntryPreview resolves non-image chips to #asset- fragment links', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: { 'ast-doc': 'ZHVtbXk=' }, // base64 for "dummy"
        mimeByKey: { 'ast-doc': 'application/pdf' },
        nameByKey: { 'ast-doc': 'report.pdf' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '[the report](asset:ast-doc)');
      expect(result).toContain('href="#asset-ast-doc"');
      expect(result).toContain('📄');
      expect(result).toContain('the report');
    });

    it('pkcRenderEntryPreview uses nameByKey fallback for empty chip labels', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: { 'ast-doc': 'ZHVtbXk=' },
        mimeByKey: { 'ast-doc': 'application/pdf' },
        nameByKey: { 'ast-doc': 'report.pdf' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '[](asset:ast-doc)');
      expect(result).toContain('report.pdf');
    });

    it('pkcRenderEntryPreview emits missing marker for unknown key', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: {},
        mimeByKey: {},
        nameByKey: {},
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '![alt](asset:ast-missing)');
      expect(result).toContain('missing asset');
      expect(result).toContain('ast-missing');
      expect(result).not.toContain('data:image/png');
    });

    it('pkcRenderEntryPreview emits unsupported marker for disallowed MIME', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: { 'ast-svg': 'PHN2Zy8+' },
        mimeByKey: { 'ast-svg': 'image/svg+xml' },
        nameByKey: { 'ast-svg': 'logo.svg' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '![logo](asset:ast-svg)');
      expect(result).toContain('unsupported asset');
      expect(result).not.toContain('data:image/svg');
    });

    it('pkcRenderEntryPreview skips resolver when text has no asset references', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: {},
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      // Plain markdown — no asset refs at all
      const result = render(entry.lid, '# Heading\n\nSome text with **bold**.');
      expect(result).toMatch(/<h1[ >]/);
      expect(result).toContain('<strong>');
      // Must not accidentally embed the image
      expect(result).not.toContain('data:image/png');
    });

    it('pkcRenderEntryPreview handles empty text without throwing', async () => {
      await import('../../src/adapter/ui/entry-window');
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      expect(() => render('any', '')).not.toThrow();
      expect(() => render('any', undefined as unknown as string)).not.toThrow();
    });

    it('pkcRenderEntryPreview never emits javascript: or data:text/html as href/src', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const previewCtx = {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(
        entry.lid,
        '![x](asset:ast-red)\n\n[click](javascript:alert(1))\n\n<script>alert(1)</script>',
      );
      // The asset embed should still produce a safe data:image/png href.
      expect(result).toContain('data:image/png;base64,');
      // The javascript: link and script tag must NOT become executable
      // HTML attributes. They may appear as escaped plain text (which
      // markdown-it does when a URL is rejected by the scheme allowlist)
      // but never as href="javascript:…" or src="data:text/html…".
      expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
      expect(result).not.toMatch(/href\s*=\s*["']data:text\/html/i);
      expect(result).not.toMatch(/src\s*=\s*["']javascript:/i);
      expect(result).not.toMatch(/src\s*=\s*["']data:text\/html/i);
      // Raw <script> must be escaped (html: false)
      expect(result).not.toMatch(/<script[>\s]/i);
    });

    it('resolver context is cleared when the child window closes', async () => {
      vi.useFakeTimers();
      try {
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        const { childWindow } = setupWindowOpenMock();
        const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
        const previewCtx = {
          assets: { 'ast-red': RED_PNG },
          mimeByKey: { 'ast-red': 'image/png' },
          nameByKey: {},
        };
        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          { previewCtx } as never,
        );
        const global = window as unknown as Record<string, unknown>;
        const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;

        // While open, the context resolves the reference.
        const openResult = render(entry.lid, '![red](asset:ast-red)');
        expect(openResult).toContain('data:image/png;base64,' + RED_PNG);

        // Simulate child closing
        childWindow.closed = true;
        vi.advanceTimersByTime(600); // close poll runs every 500ms

        // After cleanup, the context should be gone — re-rendering
        // falls back to the raw markdown path with no data: URI.
        const closedResult = render(entry.lid, '![red](asset:ast-red)');
        expect(closedResult).not.toContain('data:image/png');
      } finally {
        vi.useRealTimers();
      }
    });

    it('text archetype with TEXTLOG archetype also benefits from the same context', async () => {
      // TEXTLOG bodies are JSON; the child window's raw-body textarea
      // still sees the JSON, and an asset reference embedded inside a
      // textlog log-entry text IS resolvable via the same context.
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupWindowOpenMock();
      const entry = makeEntry({
        archetype: 'textlog',
        body: JSON.stringify({
          entries: [{ id: '1', text: 'note', createdAt: '2026-01-01T00:00:00Z', flags: [] }],
        }),
      });
      const previewCtx = {
        assets: { 'ast-doc': 'ZHVtbXk=' },
        mimeByKey: { 'ast-doc': 'application/pdf' },
        nameByKey: { 'ast-doc': 'report.pdf' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      // Simulate what the user would type into the Source textarea
      // (a flat markdown render, not a JSON-formatted log)
      const result = render(entry.lid, 'See [the report](asset:ast-doc)');
      expect(result).toContain('href="#asset-ast-doc"');
      expect(result).toContain('report');
    });
  });

  describe('Duplicate-open context refresh', () => {
    // 1 × 1 red PNG used as the "new" asset payload after refresh.
    const RED_PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    /**
     * Local helper: mocks `window.open` so that every call returns the
     * same stub child window object. Returns both the stub child and the
     * spy so tests can assert the call count — critical for verifying
     * that the duplicate-open path does NOT create a second child.
     */
    function setupDupMock() {
      const childDoc = {
        open: vi.fn(),
        write: vi.fn((html: string) => {
          capturedHtml = html;
        }),
        close: vi.fn(),
      };
      const childWindow = {
        closed: false,
        focus: vi.fn(),
        document: childDoc,
        postMessage: vi.fn(),
      };
      const openSpy = vi
        .spyOn(window, 'open')
        .mockReturnValue(childWindow as unknown as Window);
      return { childWindow, openSpy };
    }

    it('first open with no existing child registers previewCtx and creates a child', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      const { openSpy } = setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const ctx = {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: ctx } as never,
      );
      // A brand-new open must actually create a child window.
      expect(openSpy).toHaveBeenCalledTimes(1);
      // And the preview context must be live.
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      expect(render(entry.lid, '![red](asset:ast-red)')).toContain(
        'data:image/png;base64,' + RED_PNG,
      );
    });

    it('duplicate open does NOT create a second child window and calls focus()', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      const { childWindow, openSpy } = setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      const ctx = { assets: {}, mimeByKey: {}, nameByKey: {} };
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: ctx } as never,
      );
      // First open: create child, no focus yet.
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(childWindow.focus).not.toHaveBeenCalled();

      // Second open (same lid): duplicate path — focus() but no new child.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: ctx } as never,
      );
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(childWindow.focus).toHaveBeenCalledTimes(1);
    });

    it('duplicate open with a new previewCtx refreshes previewResolverContexts', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

      // First open: ctx has no asset — render yields the missing marker.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const before = render(entry.lid, '![red](asset:ast-red)');
      expect(before).toContain('missing asset');
      expect(before).not.toContain('data:image/png');

      // Second open: fresh ctx WITH the asset — the duplicate-open path
      // must replace the stale snapshot so the very next render resolves.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        {
          previewCtx: {
            assets: { 'ast-red': RED_PNG },
            mimeByKey: { 'ast-red': 'image/png' },
            nameByKey: { 'ast-red': 'red.png' },
          },
        } as never,
      );
      const after = render(entry.lid, '![red](asset:ast-red)');
      expect(after).toContain('data:image/png;base64,' + RED_PNG);
      expect(after).not.toContain('missing asset');
    });

    it('duplicate open WITHOUT previewCtx preserves the existing context (no downgrade)', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

      // First open: register a working context.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        {
          previewCtx: {
            assets: { 'ast-red': RED_PNG },
            mimeByKey: { 'ast-red': 'image/png' },
            nameByKey: { 'ast-red': 'red.png' },
          },
        } as never,
      );

      // Second open: caller passes no asset context at all (undefined).
      // The existing snapshot must NOT be cleared — "focus, don't downgrade".
      openEntryWindow(entry as never, false, vi.fn(), false, undefined);

      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '![red](asset:ast-red)');
      expect(result).toContain('data:image/png;base64,' + RED_PNG);
    });

    it('after close poll cleanup, the NEXT open is treated as fresh (not duplicate)', async () => {
      vi.useFakeTimers();
      try {
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        const { childWindow, openSpy } = setupDupMock();
        const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
        );
        expect(openSpy).toHaveBeenCalledTimes(1);

        // Child closes → poll fires → context and Map entry released.
        childWindow.closed = true;
        vi.advanceTimersByTime(600);

        const global = window as unknown as Record<string, unknown>;
        const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
        // Context is gone — render falls back to plain markdown (no chip).
        expect(render(entry.lid, '![red](asset:ast-red)')).not.toContain('data:image/png');

        // Re-point the spy at a fresh child so the next open can be
        // distinguished from the closed one.
        const freshChild = {
          closed: false,
          focus: vi.fn(),
          document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
          postMessage: vi.fn(),
        };
        openSpy.mockReturnValue(freshChild as unknown as Window);

        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          {
            previewCtx: {
              assets: { 'ast-red': RED_PNG },
              mimeByKey: { 'ast-red': 'image/png' },
              nameByKey: { 'ast-red': 'red.png' },
            },
          } as never,
        );
        // A fresh child MUST be created (not the duplicate-open branch).
        expect(openSpy).toHaveBeenCalledTimes(2);
        // And the new context should be live immediately.
        expect(render(entry.lid, '![red](asset:ast-red)')).toContain(
          'data:image/png;base64,' + RED_PNG,
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('duplicate open never registers a context when none has ever been registered', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

      // Both opens without any previewCtx — the map entry must remain absent,
      // and rendering falls back to the plain markdown path (no resolver).
      openEntryWindow(entry as never, false, vi.fn(), false, undefined);
      openEntryWindow(entry as never, false, vi.fn(), false, undefined);

      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '![x](asset:ast-red)');
      // asset: scheme is not on markdown-it's allowlist so it is stripped,
      // and nothing data:-URI–like should ever appear here.
      expect(result).not.toContain('data:image/png');
      expect(result).not.toContain('#asset-');
    });

    it('textlog archetype also benefits from duplicate-open context refresh', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupDupMock();
      const entry = makeEntry({
        archetype: 'textlog',
        body: JSON.stringify({ entries: [] }),
      });

      // First open: empty ctx.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      // Refresh with a ctx containing a non-image asset.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        {
          previewCtx: {
            assets: { 'ast-doc': 'ZHVtbXk=' },
            mimeByKey: { 'ast-doc': 'application/pdf' },
            nameByKey: { 'ast-doc': 'report.pdf' },
          },
        } as never,
      );

      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, 'See [the report](asset:ast-doc)');
      expect(result).toContain('href="#asset-ast-doc"');
      expect(result).toContain('report');
    });

    // ── Optional / extra coverage ───────────────────────────────────
    it('optional: duplicate-open refresh does not leak unsafe href/src attributes', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

      // First open with empty ctx.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      // Duplicate open with a working ctx.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        {
          previewCtx: {
            assets: { 'ast-red': RED_PNG },
            mimeByKey: { 'ast-red': 'image/png' },
            nameByKey: { 'ast-red': 'red.png' },
          },
        } as never,
      );

      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(
        entry.lid,
        '![x](asset:ast-red)\n\n[click](javascript:alert(1))\n\n<script>alert(1)</script>',
      );
      // The refreshed asset ref should resolve as before.
      expect(result).toContain('data:image/png;base64,');
      // No executable URL schemes may appear as href/src attributes, and
      // raw <script> must remain escaped (html: false).
      expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
      expect(result).not.toMatch(/href\s*=\s*["']data:text\/html/i);
      expect(result).not.toMatch(/src\s*=\s*["']javascript:/i);
      expect(result).not.toMatch(/src\s*=\s*["']data:text\/html/i);
      expect(result).not.toMatch(/<script[>\s]/i);
    });

    it('optional: three-way refresh chain A→B→C exposes only the latest context', async () => {
      const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
      setupDupMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

      // A: no assets.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );
      // B: ast-red present.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        {
          previewCtx: {
            assets: { 'ast-red': RED_PNG },
            mimeByKey: { 'ast-red': 'image/png' },
            nameByKey: { 'ast-red': 'red.png' },
          },
        } as never,
      );
      // C: ast-red REMOVED again (simulates the user deleting an attachment
      // between B and C). The refresh must propagate the removal too.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (lid: string, text: string) => string;
      const result = render(entry.lid, '![red](asset:ast-red)');
      expect(result).toContain('missing asset');
      expect(result).not.toContain('data:image/png');
    });
  });

  describe('Preview context live refresh foundation', () => {
    // 1 × 1 red PNG used as the "new" asset payload after refresh.
    const RED_PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    function setupLiveMock() {
      const childDoc = {
        open: vi.fn(),
        write: vi.fn((html: string) => {
          capturedHtml = html;
        }),
        close: vi.fn(),
      };
      const childWindow = {
        closed: false,
        focus: vi.fn(),
        document: childDoc,
        postMessage: vi.fn(),
      };
      const openSpy = vi
        .spyOn(window, 'open')
        .mockReturnValue(childWindow as unknown as Window);
      return { childWindow, childDoc, openSpy };
    }

    it('exposes pushPreviewContextUpdate and the private message type constant', async () => {
      const mod = await import('../../src/adapter/ui/entry-window');
      expect(typeof (mod as Record<string, unknown>).pushPreviewContextUpdate).toBe('function');
      expect((mod as Record<string, unknown>).ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG).toBe(
        'pkc-entry-update-preview-ctx',
      );
    });

    it('pushPreviewContextUpdate sends pkc-entry-update-preview-ctx to an open child', async () => {
      const { pushPreviewContextUpdate, openEntryWindow } = await import(
        '../../src/adapter/ui/entry-window'
      );
      const { childWindow } = setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      // Fresh ctx containing a newly-added attachment.
      const fresh = {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      };
      const pushed = pushPreviewContextUpdate(entry.lid, fresh);
      expect(pushed).toBe(true);
      expect(childWindow.postMessage).toHaveBeenCalledWith(
        { type: 'pkc-entry-update-preview-ctx', previewCtx: fresh },
        '*',
      );
    });

    it('pushPreviewContextUpdate returns false when no child window is open for the lid', async () => {
      const { pushPreviewContextUpdate } = await import('../../src/adapter/ui/entry-window');
      // No openEntryWindow call — map is empty for this lid.
      const lid = `never-opened-${Date.now()}-${Math.random()}`;
      const pushed = pushPreviewContextUpdate(lid, {
        assets: {},
        mimeByKey: {},
        nameByKey: {},
      });
      expect(pushed).toBe(false);
    });

    it('pushPreviewContextUpdate updates the parent-side per-lid map as the fallback seed', async () => {
      const { pushPreviewContextUpdate } = await import('../../src/adapter/ui/entry-window');
      const lid = `fallback-seed-${Date.now()}-${Math.random()}`;
      // No child open, so only the parent-side map is updated.
      pushPreviewContextUpdate(lid, {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      });
      // Verify via pkcRenderEntryPreview: the map is now primed even
      // though no child was ever open for this lid.
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (
        lid: string,
        text: string,
      ) => string;
      const result = render(lid, '![red](asset:ast-red)');
      expect(result).toContain('data:image/png;base64,' + RED_PNG);
    });

    it('pkcRenderEntryPreview honors the overrideCtx third argument (what the child passes after live refresh)', async () => {
      const { pkcRenderEntryPreviewRaw } = {
        pkcRenderEntryPreviewRaw: (window as unknown as Record<string, unknown>)
          .pkcRenderEntryPreview as (
          lid: string,
          text: string,
          override?: unknown,
        ) => string,
      };
      await import('../../src/adapter/ui/entry-window');
      const render = (window as unknown as Record<string, unknown>)
        .pkcRenderEntryPreview as (
        lid: string,
        text: string,
        override?: unknown,
      ) => string;
      // Unknown lid with NO parent-side map entry — the override must
      // still be honored so the live-refreshed child can resolve.
      const unknownLid = `override-only-${Date.now()}-${Math.random()}`;
      const override = {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      };
      const result = render(unknownLid, '![red](asset:ast-red)', override);
      expect(result).toContain('data:image/png;base64,' + RED_PNG);
      // Sanity: the override is preferred even when nothing is in the map.
      expect(pkcRenderEntryPreviewRaw).toBeDefined();
    });

    it('overrideCtx removal case: pushing an empty ctx (simulating attachment delete) turns data URI back into missing marker', async () => {
      const { pushPreviewContextUpdate, openEntryWindow } = await import(
        '../../src/adapter/ui/entry-window'
      );
      setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        {
          previewCtx: {
            assets: { 'ast-red': RED_PNG },
            mimeByKey: { 'ast-red': 'image/png' },
            nameByKey: { 'ast-red': 'red.png' },
          },
        } as never,
      );
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (
        lid: string,
        text: string,
        override?: unknown,
      ) => string;

      // Before deletion — asset is there, render resolves it.
      expect(render(entry.lid, '![red](asset:ast-red)')).toContain(
        'data:image/png;base64,' + RED_PNG,
      );

      // Simulate attachment deletion at the parent side.
      pushPreviewContextUpdate(entry.lid, {
        assets: {},
        mimeByKey: {},
        nameByKey: {},
      });

      // Now the parent-side map is empty for this lid. Any new render
      // (with no override — e.g. a child that hasn't stored the push
      // yet) must return the missing marker instead of the stale data.
      const result = render(entry.lid, '![red](asset:ast-red)');
      expect(result).toContain('missing asset');
      expect(result).not.toContain('data:image/png');
    });

    it('duplicate-open refresh and live refresh do not conflict — last write wins', async () => {
      const { pushPreviewContextUpdate, openEntryWindow } = await import(
        '../../src/adapter/ui/entry-window'
      );
      const { childWindow } = setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });

      // A) Initial open with empty ctx.
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      // B) Live push with red.
      pushPreviewContextUpdate(entry.lid, {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      });

      // C) Duplicate-open also refreshes — this time with empty again
      //    (simulates a later dbl-click after the asset was removed).
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      // The child must have received BOTH pushes (one from explicit
      // pushPreviewContextUpdate, one from the duplicate-open wiring).
      const msgCalls = childWindow.postMessage.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
      );
      expect(msgCalls.length).toBe(2);

      // The parent-side map reflects the last write (C = empty).
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (
        lid: string,
        text: string,
      ) => string;
      const result = render(entry.lid, '![red](asset:ast-red)');
      expect(result).toContain('missing asset');
    });

    it('live refresh does NOT rewrite the child document (textarea state is untouched)', async () => {
      const { pushPreviewContextUpdate, openEntryWindow } = await import(
        '../../src/adapter/ui/entry-window'
      );
      const { childDoc } = setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );
      // Initial open should have done exactly one document.write (the
      // whole child HTML) and then close().
      const initialWriteCalls = childDoc.write.mock.calls.length;
      const initialCloseCalls = childDoc.close.mock.calls.length;

      // Live push — must NOT cause a new document.write / open / close.
      pushPreviewContextUpdate(entry.lid, {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      });

      expect(childDoc.write.mock.calls.length).toBe(initialWriteCalls);
      expect(childDoc.close.mock.calls.length).toBe(initialCloseCalls);
      expect(childDoc.open).toHaveBeenCalledTimes(1);
    });

    it('fallback: no registered context anywhere leaves pkcRenderEntryPreview in plain-markdown mode', async () => {
      const { pushPreviewContextUpdate } = await import(
        '../../src/adapter/ui/entry-window'
      );
      const lid = `no-ctx-${Date.now()}-${Math.random()}`;
      // No openEntryWindow call, no explicit map seed — the render
      // should fall back to plain markdown with no asset resolution.
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (
        lid: string,
        text: string,
      ) => string;
      const result = render(lid, '![red](asset:ast-red)');
      expect(result).not.toContain('data:image/png');
      expect(result).not.toContain('#asset-');

      // Sanity: pushPreviewContextUpdate exists but is a no-op push
      // (returns false) when no child is open for this lid.
      expect(pushPreviewContextUpdate(lid, {
        assets: {},
        mimeByKey: {},
        nameByKey: {},
      })).toBe(false);
    });

    it('dangerous URLs remain safe after a live refresh push', async () => {
      const { pushPreviewContextUpdate, openEntryWindow } = await import(
        '../../src/adapter/ui/entry-window'
      );
      setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );

      // Live-refresh with a working ctx.
      pushPreviewContextUpdate(entry.lid, {
        assets: { 'ast-red': RED_PNG },
        mimeByKey: { 'ast-red': 'image/png' },
        nameByKey: { 'ast-red': 'red.png' },
      });

      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (
        lid: string,
        text: string,
      ) => string;
      const result = render(
        entry.lid,
        '![x](asset:ast-red)\n\n[click](javascript:alert(1))\n\n<script>alert(1)</script>',
      );
      expect(result).toContain('data:image/png;base64,');
      expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
      expect(result).not.toMatch(/href\s*=\s*["']data:text\/html/i);
      expect(result).not.toMatch(/src\s*=\s*["']javascript:/i);
      expect(result).not.toMatch(/src\s*=\s*["']data:text\/html/i);
      expect(result).not.toMatch(/<script[>\s]/i);
    });

    // ── Child-side script shape (verified via captured HTML) ─────
    it('child window HTML declares a childPreviewCtx variable (initially null)', async () => {
      const html = await openAndCapture();
      expect(html).toContain('var childPreviewCtx = null;');
    });

    it('child window HTML has a message listener for pkc-entry-update-preview-ctx', async () => {
      const html = await openAndCapture();
      expect(html).toContain("e.data.type === 'pkc-entry-update-preview-ctx'");
      // And the listener assigns to the local variable.
      expect(html).toContain('childPreviewCtx = e.data.previewCtx');
    });

    it('child window HTML passes childPreviewCtx as the third arg to pkcRenderEntryPreview', async () => {
      const html = await openAndCapture();
      expect(html).toContain(
        'window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx)',
      );
    });

    it('textlog archetype also receives the live refresh push', async () => {
      const { pushPreviewContextUpdate, openEntryWindow } = await import(
        '../../src/adapter/ui/entry-window'
      );
      const { childWindow } = setupLiveMock();
      const entry = makeEntry({
        archetype: 'textlog',
        body: JSON.stringify({ entries: [] }),
      });
      openEntryWindow(
        entry as never,
        false,
        vi.fn(),
        false,
        { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
      );
      const ctx = {
        assets: { 'ast-doc': 'ZHVtbXk=' },
        mimeByKey: { 'ast-doc': 'application/pdf' },
        nameByKey: { 'ast-doc': 'report.pdf' },
      };
      expect(pushPreviewContextUpdate(entry.lid, ctx)).toBe(true);
      expect(childWindow.postMessage).toHaveBeenCalledWith(
        { type: 'pkc-entry-update-preview-ctx', previewCtx: ctx },
        '*',
      );
      // And the parent-side render (simulating what the child would
      // do after receiving the push) resolves the non-image chip.
      const global = window as unknown as Record<string, unknown>;
      const render = global.pkcRenderEntryPreview as (
        lid: string,
        text: string,
      ) => string;
      const result = render(entry.lid, '[the report](asset:ast-doc)');
      expect(result).toContain('href="#asset-ast-doc"');
    });

    it('after close poll cleanup, a live refresh push no longer reaches any child', async () => {
      vi.useFakeTimers();
      try {
        const { pushPreviewContextUpdate, openEntryWindow } = await import(
          '../../src/adapter/ui/entry-window'
        );
        const { childWindow } = setupLiveMock();
        const entry = makeEntry({ archetype: 'text', body: 'placeholder' });
        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          { previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} } } as never,
        );

        // Close child and let the poll clear the Map entries.
        childWindow.closed = true;
        vi.advanceTimersByTime(600);

        // After cleanup, push returns false and does NOT postMessage.
        const priorCalls = childWindow.postMessage.mock.calls.length;
        const pushed = pushPreviewContextUpdate(entry.lid, {
          assets: { 'ast-red': RED_PNG },
          mimeByKey: { 'ast-red': 'image/png' },
          nameByKey: { 'ast-red': 'red.png' },
        });
        expect(pushed).toBe(false);
        expect(childWindow.postMessage.mock.calls.length).toBe(priorCalls);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getOpenEntryWindowLids', () => {
    function setupLiveMock() {
      const childDoc = {
        open: vi.fn(),
        write: vi.fn((html: string) => {
          capturedHtml = html;
        }),
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

    it('exposes getOpenEntryWindowLids as a named export', async () => {
      const mod = await import('../../src/adapter/ui/entry-window');
      expect(typeof (mod as Record<string, unknown>).getOpenEntryWindowLids).toBe(
        'function',
      );
    });

    it('includes the lid of a freshly opened entry window', async () => {
      const { openEntryWindow, getOpenEntryWindowLids } = await import(
        '../../src/adapter/ui/entry-window'
      );
      setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'x' });
      openEntryWindow(entry as never, false, vi.fn(), false, {
        previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
      } as never);
      expect(getOpenEntryWindowLids()).toContain(entry.lid);
    });

    it('filters out closed child windows that the poller has not yet cleaned up', async () => {
      const { openEntryWindow, getOpenEntryWindowLids } = await import(
        '../../src/adapter/ui/entry-window'
      );
      const { childWindow } = setupLiveMock();
      const entry = makeEntry({ archetype: 'text', body: 'x' });
      openEntryWindow(entry as never, false, vi.fn(), false, {
        previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
      } as never);

      // Mark the child closed but do NOT run the close poller.
      childWindow.closed = true;
      expect(getOpenEntryWindowLids()).not.toContain(entry.lid);
    });

    it('returns multiple lids when several entry windows are open', async () => {
      const { openEntryWindow, getOpenEntryWindowLids } = await import(
        '../../src/adapter/ui/entry-window'
      );
      setupLiveMock();
      const e1 = makeEntry({ archetype: 'text', body: 'a' });
      openEntryWindow(e1 as never, false, vi.fn(), false, {
        previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
      } as never);
      // Fresh mock for the second open so the spy returns a new child.
      setupLiveMock();
      const e2 = makeEntry({ archetype: 'text', body: 'b' });
      openEntryWindow(e2 as never, false, vi.fn(), false, {
        previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
      } as never);

      const lids = getOpenEntryWindowLids();
      expect(lids).toContain(e1.lid);
      expect(lids).toContain(e2.lid);
    });
  });

  describe('Attachment preview Blob URL lifecycle (child-side script)', () => {
    it('bootAttachmentPreview calls revokeAllBlobUrls at the start (idempotent boot)', async () => {
      const html = await openAndCapture();
      // The function revokeAllBlobUrls must exist and be invoked at the
      // top of bootAttachmentPreview before any new URL is created.
      expect(html).toContain('function revokeAllBlobUrls');
      // Boot calls revokeAllBlobUrls before data guards.
      expect(html).toMatch(/function bootAttachmentPreview\(\)[^}]*revokeAllBlobUrls\(\)/);
    });

    it('openAttachmentInNewTab tracks the blob URL via trackBlobUrl', async () => {
      const html = await openAndCapture();
      // The URL must be wrapped in trackBlobUrl so the unload handler
      // catches it if the 1500ms timer is killed by a window close.
      expect(html).toMatch(/openAttachmentInNewTab[\s\S]*?trackBlobUrl\(URL\.createObjectURL/);
    });

    it('downloadAttachmentFromChild tracks the blob URL via trackBlobUrl', async () => {
      const html = await openAndCapture();
      expect(html).toMatch(
        /downloadAttachmentFromChild[\s\S]*?trackBlobUrl\(URL\.createObjectURL/,
      );
    });

    it('openAttachmentInNewTab prunes the URL from pkcActiveBlobUrls after revoke', async () => {
      const html = await openAndCapture();
      // After the setTimeout revoke, the URL should be spliced out of
      // pkcActiveBlobUrls so the unload handler does not double-revoke.
      expect(html).toMatch(
        /openAttachmentInNewTab[\s\S]*?pkcActiveBlobUrls\.splice\(idx, 1\)/,
      );
    });

    it('downloadAttachmentFromChild prunes the URL from pkcActiveBlobUrls after revoke', async () => {
      const html = await openAndCapture();
      expect(html).toMatch(
        /downloadAttachmentFromChild[\s\S]*?pkcActiveBlobUrls\.splice\(idx, 1\)/,
      );
    });

    it('registers pagehide and unload listeners pointing at revokeAllBlobUrls', async () => {
      const html = await openAndCapture();
      expect(html).toContain("addEventListener('pagehide', revokeAllBlobUrls)");
      expect(html).toContain("addEventListener('unload', revokeAllBlobUrls)");
    });

    it('revokeAllBlobUrls resets pkcActiveBlobUrls to an empty array', async () => {
      const html = await openAndCapture();
      // The function must assign a fresh empty array to pkcActiveBlobUrls
      // after revoking — otherwise a subsequent boot would re-process
      // stale entries.
      expect(html).toMatch(/function revokeAllBlobUrls[\s\S]*?pkcActiveBlobUrls = \[\]/);
    });
  });

  // ── Entry window interactive task toggle ──

  describe('Entry window task toggle', () => {
    describe('child-side click handler', () => {
      it('child script intercepts checkbox clicks and posts pkc-entry-task-toggle to parent', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task A\n- [x] Task B',
        });
        expect(html).toContain("type: 'pkc-entry-task-toggle'");
        expect(html).toContain('data-pkc-task-index');
        expect(html).toContain('window.opener.postMessage');
      });

      it('child script calls preventDefault on checkbox click', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task A',
        });
        // The click handler must prevent the default checkbox toggle so
        // the DOM stays in sync with the parent's source of truth.
        expect(html).toContain("e.preventDefault()");
        // Specifically in the task-toggle branch
        expect(html).toMatch(/data-pkc-task-index[\s\S]*?e\.preventDefault\(\)/);
      });

      it('child script reads logId from closest data-pkc-log-id ancestor', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task',
        });
        expect(html).toContain("closest('[data-pkc-log-id]')");
      });
    });

    describe('parent message handling — pkc-entry-task-toggle', () => {
      it('routes task-toggle messages to onTaskToggle callback', async () => {
        const onTaskToggle = vi.fn();
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        const entry = makeEntry({ archetype: 'text', body: '- [ ] Task' });
        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          undefined,
          undefined,
          onTaskToggle,
        );

        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'pkc-entry-task-toggle', lid: entry.lid, taskIndex: 0, logId: null },
            source: childWindow as unknown as Window,
          }),
        );

        expect(onTaskToggle).toHaveBeenCalledWith(entry.lid, 0, null);
      });

      it('routes task-toggle messages with logId for TEXTLOG', async () => {
        const onTaskToggle = vi.fn();
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        const entry = makeEntry({ archetype: 'textlog', body: '{}' });
        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          undefined,
          undefined,
          onTaskToggle,
        );

        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'pkc-entry-task-toggle', lid: entry.lid, taskIndex: 1, logId: 'log-abc' },
            source: childWindow as unknown as Window,
          }),
        );

        expect(onTaskToggle).toHaveBeenCalledWith(entry.lid, 1, 'log-abc');
      });

      it('ignores task-toggle messages when onTaskToggle is omitted', async () => {
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        openEntryWindow(makeEntry() as never, false, vi.fn(), false);

        // Should not throw
        expect(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: 'pkc-entry-task-toggle', lid: 'e-x', taskIndex: 0, logId: null },
              source: childWindow as unknown as Window,
            }),
          );
        }).not.toThrow();
      });

      it('ignores task-toggle messages with non-numeric taskIndex', async () => {
        const onTaskToggle = vi.fn();
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        openEntryWindow(
          makeEntry() as never,
          false,
          vi.fn(),
          false,
          undefined,
          undefined,
          onTaskToggle,
        );

        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'pkc-entry-task-toggle', lid: 'e-x', taskIndex: 'bad' },
            source: childWindow as unknown as Window,
          }),
        );

        expect(onTaskToggle).not.toHaveBeenCalled();
      });
    });

    describe('TEXTLOG view body rendering', () => {
      it('renders TEXTLOG entries with per-log-entry data-pkc-log-id wrappers', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'log1', text: '- [ ] Alpha', createdAt: '2026-01-01T00:00:00Z', flags: [] },
            { id: 'log2', text: '- [x] Beta', createdAt: '2026-01-02T00:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('data-pkc-log-id="log1"');
        expect(viewBody).toContain('data-pkc-log-id="log2"');
        expect(viewBody).toContain('Alpha');
        expect(viewBody).toContain('Beta');
      });

      it('renders empty TEXTLOG as (empty)', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({ entries: [] });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('(empty)');
      });

      it('TEXTLOG task checkboxes have data-pkc-task-index within their log-id wrapper', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'log1', text: '- [ ] Do it', createdAt: '2026-01-01T00:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        // The checkbox should be inside the log-id wrapper
        expect(viewBody).toMatch(/data-pkc-log-id="log1"[\s\S]*?data-pkc-task-index="0"/);
      });
    });

    /*
     * Slice 4-A: rendered viewer common-builder unification. The entry-
     * window view pane emits the same day-grouped `<section id="day-…">
     * <article id="log-…">` tree as the live viewer (textlogPresenter),
     * driven by `buildTextlogDoc({ order: 'asc' })`. These tests pin
     * the structural contract so future slices (print, HTML download,
     * transclusion) can rely on the shared anchors.
     *
     * See docs/development/textlog-viewer-and-linkability-redesign.md.
     */
    describe('TEXTLOG rendered viewer — day-grouped (Slice 4-A)', () => {
      it('wraps each day in <section id="day-yyyy-mm-dd"> with a title heading', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const { toLocalDateKey } = await import('../../src/features/textlog/textlog-doc');
        const iso1 = '2026-04-09T10:00:00.000Z';
        const iso2 = '2026-04-10T11:00:00.000Z';
        const body = serializeTextlogBody({
          entries: [
            { id: 'la', text: 'one', createdAt: iso1, flags: [] },
            { id: 'lb', text: 'two', createdAt: iso2, flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        const key1 = toLocalDateKey(iso1);
        const key2 = toLocalDateKey(iso2);
        expect(viewBody).toContain(`<section class="pkc-textlog-day" id="${`day-${key1}`}"`);
        expect(viewBody).toContain(`<section class="pkc-textlog-day" id="${`day-${key2}`}"`);
        expect(viewBody).toContain('pkc-textlog-day-title');
      });

      it('emits <article id="log-<id>"> with data-pkc-log-id and data-pkc-lid', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: 'hello', createdAt: '2026-04-09T10:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toMatch(
          /<article class="pkc-textlog-log" id="log-lg1" data-pkc-log-id="lg1" data-pkc-lid="[^"]+"/,
        );
      });

      it('uses chronological (asc) ordering for days and logs within a day', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            // storage order: early, later-same-day, next-day-early, next-day-late
            { id: 'a', text: 'aaa', createdAt: '2026-04-09T10:00:00Z', flags: [] },
            { id: 'b', text: 'bbb', createdAt: '2026-04-09T14:00:00Z', flags: [] },
            { id: 'c', text: 'ccc', createdAt: '2026-04-10T09:00:00Z', flags: [] },
            { id: 'd', text: 'ddd', createdAt: '2026-04-10T18:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        const ia = viewBody.indexOf('id="log-a"');
        const ib = viewBody.indexOf('id="log-b"');
        const ic = viewBody.indexOf('id="log-c"');
        const id = viewBody.indexOf('id="log-d"');
        expect(ia).toBeGreaterThan(0);
        expect(ia).toBeLessThan(ib);
        expect(ib).toBeLessThan(ic);
        expect(ic).toBeLessThan(id);
      });

      it('important-flagged logs carry data-pkc-log-important on the article', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'flagged', text: 'urgent', createdAt: '2026-04-09T10:00:00Z', flags: ['important'] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toMatch(
          /<article[^>]*id="log-flagged"[^>]*data-pkc-log-important="true"/,
        );
      });

      it('each article has a log-header containing a timestamp span with ISO title', async () => {
        const iso = '2026-04-09T10:00:00.000Z';
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: 'body', createdAt: iso, flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('class="pkc-textlog-log-header"');
        expect(viewBody).toMatch(
          new RegExp(`pkc-textlog-timestamp" title="${iso.replace(/[.]/g, '\\.')}"`),
        );
      });

      it('undated logs (unparseable createdAt) get id="day-undated" with title "Undated"', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'bad', text: 'broken', createdAt: 'not-a-date', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('id="day-undated"');
        expect(viewBody).toContain('>Undated<');
      });

      it('wraps everything in <div class="pkc-textlog-document">', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: 'x', createdAt: '2026-04-09T10:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('class="pkc-textlog-document"');
      });

      it('embeds day-grouped viewer CSS (.pkc-textlog-document / .pkc-textlog-log) in inline styles', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('.pkc-textlog-document');
        expect(html).toContain('.pkc-textlog-day');
        expect(html).toContain('.pkc-textlog-log-header');
      });

      it('heading inside a log body receives an id anchor (markdown-it slug)', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: '# Morning Notes', createdAt: '2026-04-09T10:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toMatch(/<h1 id="morning-notes">/);
      });

      it('TEXT / todo / form / attachment archetypes are not wrapped in the day-grouped document', async () => {
        const htmlText = await openAndCapture(false, { archetype: 'text', body: '# Hi' });
        expect(extractBodyView(htmlText)).not.toContain('pkc-textlog-document');
        const htmlTodo = await openAndCapture(false, {
          archetype: 'todo',
          body: JSON.stringify({ status: 'open', description: 'x' }),
        });
        expect(extractBodyView(htmlTodo)).not.toContain('pkc-textlog-document');
      });

      it('empty TEXTLOG still falls back to the <em>(empty)</em> placeholder (no empty document)', async () => {
        const html = await openAndCapture(false, {
          archetype: 'textlog',
          body: JSON.stringify({ entries: [] }),
        });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('(empty)');
        expect(viewBody).not.toContain('pkc-textlog-document');
      });
    });

    /*
     * Slice 4-A: opener-exposed helper used by the child's
     * renderBodyView() after a save so the post-save rerender produces
     * the same day-grouped DOM as the initial parent-side render. Keeps
     * the day-grouping logic centralized on the parent.
     */
    describe('pkcRenderTextlogViewBody opener helper (Slice 4-A)', () => {
      it('is exposed on window as a function', async () => {
        await import('../../src/adapter/ui/entry-window');
        const global = window as unknown as Record<string, unknown>;
        expect(typeof global.pkcRenderTextlogViewBody).toBe('function');
      });

      it('produces the same day-grouped HTML shape as the initial render', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        await import('../../src/adapter/ui/entry-window');
        const global = window as unknown as Record<string, unknown>;
        const render = global.pkcRenderTextlogViewBody as (
          lid: string,
          body: string,
        ) => string;
        const body = serializeTextlogBody({
          entries: [
            { id: 'xx', text: 'hello', createdAt: '2026-04-09T10:00:00Z', flags: [] },
          ],
        });
        const out = render('some-lid', body);
        expect(out).toContain('class="pkc-textlog-document"');
        expect(out).toContain('id="log-xx"');
        expect(out).toContain('data-pkc-lid="some-lid"');
      });

      it('returns (empty) placeholder for an empty textlog body', async () => {
        await import('../../src/adapter/ui/entry-window');
        const global = window as unknown as Record<string, unknown>;
        const render = global.pkcRenderTextlogViewBody as (
          lid: string,
          body: string,
        ) => string;
        expect(render('lid', '{}')).toContain('(empty)');
      });
    });

    describe('readonly guard', () => {
      it('applies pointer-events:none to task checkboxes in readonly mode', async () => {
        const html = await openAndCapture(true, {
          archetype: 'text',
          body: '- [ ] Task A',
        });
        expect(html).toContain('.pkc-task-checkbox { pointer-events: none;');
        expect(html).toContain('opacity: 0.6');
      });

      it('does NOT apply pointer-events:none in non-readonly mode', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task A',
        });
        expect(html).not.toContain('.pkc-task-checkbox { pointer-events: none;');
      });
    });

    describe('pushTextlogViewBodyUpdate', () => {
      it('sends per-log-entry HTML to the child window', async () => {
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow, pushTextlogViewBodyUpdate, ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG } =
          await import('../../src/adapter/ui/entry-window');
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');

        const entry = makeEntry({ archetype: 'textlog', body: '{}' });
        openEntryWindow(entry as never, false, vi.fn(), false);

        const newBody = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: '- [x] Done', createdAt: '2026-01-01T00:00:00Z', flags: [] },
          ],
        });
        const result = pushTextlogViewBodyUpdate(entry.lid, newBody);
        expect(result).toBe(true);

        const call = (childWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls.find(
          (c: unknown[]) => (c[0] as { type: string }).type === ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
        );
        expect(call).toBeDefined();
        const payload = call![0] as { viewBody: string };
        expect(payload.viewBody).toContain('data-pkc-log-id="lg1"');
        expect(payload.viewBody).toContain('Done');
      });

      it('returns false when no child window is open for the lid', async () => {
        const { pushTextlogViewBodyUpdate } = await import('../../src/adapter/ui/entry-window');
        const result = pushTextlogViewBodyUpdate('nonexistent-lid', '{}');
        expect(result).toBe(false);
      });
    });

    describe('regression — existing entry window features', () => {
      it('pkc-entry-save still routes to onSave callback', async () => {
        const onSave = vi.fn();
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        const entry = makeEntry();
        openEntryWindow(
          entry as never,
          false,
          onSave,
          false,
          undefined,
          undefined,
          vi.fn(), // onTaskToggle present
        );

        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'pkc-entry-save', lid: entry.lid, title: 'New Title', body: 'New body' },
            source: childWindow as unknown as Window,
          }),
        );

        expect(onSave).toHaveBeenCalledWith(entry.lid, 'New Title', 'New body', expect.any(String));
      });

      it('pkc-entry-download-asset still routes to onDownloadAsset callback', async () => {
        const onDownloadAsset = vi.fn();
        const { childWindow } = setupWindowOpenMock();
        const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
        const entry = makeEntry();
        openEntryWindow(
          entry as never,
          false,
          vi.fn(),
          false,
          undefined,
          onDownloadAsset,
          vi.fn(), // onTaskToggle present
        );

        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'pkc-entry-download-asset', assetKey: 'ast-check' },
            source: childWindow as unknown as Window,
          }),
        );

        expect(onDownloadAsset).toHaveBeenCalledWith('ast-check');
      });
    });
  });

  // ── Entry window task completion badge ──

  describe('Entry window task completion badge', () => {
    describe('badge display', () => {
      it('TEXT entry with tasks shows badge element in title row', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task A\n- [x] Task B\n- [ ] Task C',
        });
        expect(html).toContain('id="task-badge"');
        expect(html).toContain('class="pkc-task-badge"');
      });

      it('TEXTLOG entry with tasks shows badge element in title row', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: '- [x] Done item', createdAt: '2026-01-01T00:00:00Z', flags: [] },
            { id: 'lg2', text: '- [ ] Open item', createdAt: '2026-01-02T00:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        expect(html).toContain('id="task-badge"');
        expect(html).toContain('class="pkc-task-badge"');
      });

      it('TEXT entry with no tasks still renders badge element (hidden by script)', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: 'No tasks here, just plain text.',
        });
        // Badge element exists but starts with display:none
        expect(html).toContain('id="task-badge"');
        expect(html).toContain('style="display:none"');
      });

      it('todo archetype renders badge element (hidden — no checkboxes in todo card)', async () => {
        const todoBody = JSON.stringify({ status: 'open', description: 'Buy groceries' });
        const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
        // Badge element present but todo card has no .pkc-task-checkbox, so script hides it
        expect(html).toContain('id="task-badge"');
      });

      it('badge element is inside view title row, not in edit pane', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task',
        });
        const viewPaneStart = html.indexOf('<div id="view-pane">');
        const editPaneStart = html.indexOf('<div id="edit-pane"');
        const badgePos = html.indexOf('id="task-badge"');
        expect(badgePos).toBeGreaterThan(viewPaneStart);
        expect(badgePos).toBeLessThan(editPaneStart);
      });

      it('badge comes after archetype label in title row', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task',
        });
        const archetypePos = html.indexOf('pkc-archetype-label');
        const badgePos = html.indexOf('id="task-badge"');
        expect(badgePos).toBeGreaterThan(archetypePos);
      });
    });

    describe('badge CSS', () => {
      it('includes .pkc-task-badge CSS in inline styles', async () => {
        const html = await openAndCapture();
        expect(html).toContain('.pkc-task-badge');
        expect(html).toContain('font-size: 0.7rem');
      });

      it('includes complete-state CSS rule', async () => {
        const html = await openAndCapture();
        expect(html).toContain('data-pkc-task-complete="true"');
        expect(html).toContain('var(--c-success)');
      });
    });

    describe('updateTaskBadge function', () => {
      it('child script contains updateTaskBadge function', async () => {
        const html = await openAndCapture();
        expect(html).toContain('function updateTaskBadge()');
      });

      it('updateTaskBadge queries .pkc-task-checkbox elements', async () => {
        const html = await openAndCapture();
        expect(html).toContain(".querySelectorAll('.pkc-task-checkbox')");
      });

      it('updateTaskBadge sets data-pkc-task-complete when all done', async () => {
        const html = await openAndCapture();
        expect(html).toContain("setAttribute('data-pkc-task-complete', 'true')");
      });

      it('updateTaskBadge hides badge when no checkboxes found', async () => {
        const html = await openAndCapture();
        // When checkboxes.length === 0, badge is hidden
        expect(html).toMatch(/checkboxes\.length === 0[\s\S]*?badge\.style\.display = 'none'/);
      });
    });

    describe('badge update hook points', () => {
      it('calls updateTaskBadge on initial load', async () => {
        const html = await openAndCapture();
        // The init badge call appears after the message listener setup,
        // identified by the "Derive initial task badge" comment.
        expect(html).toContain('/* Derive initial task badge from the rendered body */');
        const commentPos = html.indexOf('Derive initial task badge');
        const nextLine = html.indexOf('updateTaskBadge()', commentPos);
        expect(nextLine).toBeGreaterThan(commentPos);
      });

      it('calls updateTaskBadge in pkc-entry-update-view-body handler (clean path)', async () => {
        const html = await openAndCapture();
        // In the view body update handler, after innerHTML assignment
        const viewBodyHandler = html.indexOf("type === 'pkc-entry-update-view-body'");
        expect(viewBodyHandler).toBeGreaterThan(-1);
        const handlerEnd = html.indexOf('}', html.indexOf('hidePendingViewNotice()', viewBodyHandler));
        const badgeCall = html.indexOf('updateTaskBadge()', viewBodyHandler);
        expect(badgeCall).toBeGreaterThan(viewBodyHandler);
        expect(badgeCall).toBeLessThan(handlerEnd + 50);
      });

      it('calls updateTaskBadge in pkc-entry-saved handler', async () => {
        const html = await openAndCapture();
        const savedHandler = html.indexOf("type === 'pkc-entry-saved'");
        expect(savedHandler).toBeGreaterThan(-1);
        // updateTaskBadge() should appear between the saved handler start and the next handler
        const nextHandler = html.indexOf("type === 'pkc-entry-conflict'", savedHandler);
        const badgeCall = html.indexOf('updateTaskBadge()', savedHandler);
        expect(badgeCall).toBeGreaterThan(savedHandler);
        expect(badgeCall).toBeLessThan(nextHandler);
      });

      it('calls updateTaskBadge in flushPendingViewBody', async () => {
        const html = await openAndCapture();
        const flushFn = html.indexOf('function flushPendingViewBody()');
        expect(flushFn).toBeGreaterThan(-1);
        // updateTaskBadge() should appear inside flushPendingViewBody
        const nextFn = html.indexOf('function ', flushFn + 30);
        const badgeCall = html.indexOf('updateTaskBadge()', flushFn);
        expect(badgeCall).toBeGreaterThan(flushFn);
        expect(badgeCall).toBeLessThan(nextFn);
      });
    });

    describe('guard / regression', () => {
      it('no new protocol message types added', async () => {
        const html = await openAndCapture();
        // Only the known message types should appear as handler conditions
        const messageTypes = [
          'pkc-entry-saved',
          'pkc-entry-conflict',
          'pkc-entry-update-preview-ctx',
          'pkc-entry-update-view-body',
        ];
        for (const msgType of messageTypes) {
          expect(html).toContain(msgType);
        }
        // No new badge-specific protocol
        expect(html).not.toContain('pkc-entry-update-task-badge');
        expect(html).not.toContain('pkc-entry-badge');
      });

      it('task toggle click handler is still present', async () => {
        const html = await openAndCapture(false, {
          archetype: 'text',
          body: '- [ ] Task A',
        });
        expect(html).toContain("type: 'pkc-entry-task-toggle'");
        expect(html).toContain('data-pkc-task-index');
      });

      it('readonly entry still renders badge element', async () => {
        const html = await openAndCapture(true, {
          archetype: 'text',
          body: '- [ ] Task A\n- [x] Task B',
        });
        expect(html).toContain('id="task-badge"');
        expect(html).toContain('class="pkc-task-badge"');
      });

      it('attachment archetype entry window is unaffected by badge', async () => {
        const attBody = JSON.stringify({ name: 'report.pdf', mime: 'application/pdf', size: 102400, asset_key: 'a1' });
        const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
        expect(html).toContain('data-pkc-ew-card="attachment"');
        expect(html).toContain('id="task-badge"');
      });
    });
  });

  // ── TEXTLOG save re-render fix ──

  describe('TEXTLOG save re-render', () => {
    describe('renderBodyView function', () => {
      it('child script contains renderBodyView function', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('function renderBodyView(body)');
      });

      it('entryArchetype variable is set for TEXTLOG', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('var entryArchetype = "textlog"');
      });

      it('entryArchetype variable is set for TEXT', async () => {
        const html = await openAndCapture(false, { archetype: 'text', body: 'hello' });
        expect(html).toContain('var entryArchetype = "text"');
      });

      it('renderBodyView parses TEXTLOG JSON and renders per-log-entry with data-pkc-log-id', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        // The function should JSON.parse and wrap each entry with data-pkc-log-id
        expect(html).toContain("JSON.parse(body)");
        expect(html).toContain('data-pkc-log-id');
        expect(html).toContain("le.id");
      });

      it('renderBodyView falls back to renderMd for non-textlog archetypes', async () => {
        const html = await openAndCapture(false, { archetype: 'text', body: 'hello' });
        expect(html).toContain('function renderBodyView(body)');
        // For non-textlog, it returns renderMd(body)
        expect(html).toContain("if (entryArchetype !== 'textlog') return renderMd(body)");
      });
    });

    describe('save handler uses renderBodyView', () => {
      it('pkc-entry-saved handler calls renderBodyView instead of renderMd', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        // The saved handler should use renderBodyView(originalBody) not renderMd(originalBody)
        const savedHandler = html.indexOf("type === 'pkc-entry-saved'");
        const nextHandler = html.indexOf("type === 'pkc-entry-conflict'", savedHandler);
        const savedSection = html.slice(savedHandler, nextHandler);
        expect(savedSection).toContain('renderBodyView(originalBody)');
        expect(savedSection).not.toContain('renderMd(originalBody)');
      });
    });

    describe('TEXTLOG initial render has per-log-entry structure', () => {
      it('TEXTLOG initial body-view has data-pkc-log-id wrappers', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: '- [x] Done', createdAt: '2026-01-01T00:00:00Z', flags: [] },
            { id: 'lg2', text: '- [ ] Open', createdAt: '2026-01-02T00:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        const viewBody = extractBodyView(html);
        expect(viewBody).toContain('data-pkc-log-id="lg1"');
        expect(viewBody).toContain('data-pkc-log-id="lg2"');
        expect(viewBody).toContain('pkc-task-checkbox');
      });
    });

    describe('regression', () => {
      it('TEXT save handler still uses renderBodyView (delegates to renderMd)', async () => {
        const html = await openAndCapture(false, { archetype: 'text', body: '# Hello' });
        const savedHandler = html.indexOf("type === 'pkc-entry-saved'");
        const nextHandler = html.indexOf("type === 'pkc-entry-conflict'", savedHandler);
        const savedSection = html.slice(savedHandler, nextHandler);
        // TEXT also goes through renderBodyView, which delegates to renderMd for non-textlog
        expect(savedSection).toContain('renderBodyView(originalBody)');
      });

      it('entry window task toggle click handler is still present', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: '- [ ] Task', createdAt: '2026-01-01T00:00:00Z', flags: [] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        expect(html).toContain("type: 'pkc-entry-task-toggle'");
        expect(html).toContain('data-pkc-task-index');
      });

      it('entry window badge function is still present', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('function updateTaskBadge()');
      });

      it('update-view-body handler is unchanged (uses pre-rendered HTML from parent)', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        const viewBodyHandler = html.indexOf("type === 'pkc-entry-update-view-body'");
        const handlerEnd = html.indexOf('});', viewBodyHandler);
        const handlerSection = html.slice(viewBodyHandler, handlerEnd);
        // update-view-body handler sets innerHTML directly from e.data.viewBody, not renderBodyView
        expect(handlerSection).toContain('e.data.viewBody');
        expect(handlerSection).not.toContain('renderBodyView');
      });
    });
  });

  // ── Structured editor for TEXTLOG / TODO / FORM ──

  describe('Structured editor', () => {
    describe('TEXTLOG structured editor', () => {
      it('renders per-log-entry textareas instead of raw JSON textarea', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [
            { id: 'lg1', text: 'First entry', createdAt: '2026-01-01T00:00:00Z', flags: [] },
            { id: 'lg2', text: 'Second entry', createdAt: '2026-01-02T00:00:00Z', flags: ['important'] },
          ],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        // Structured editor present
        expect(html).toContain('id="structured-editor"');
        expect(html).toContain('pkc-textlog-editor');
        expect(html).toContain('pkc-textlog-edit-row');
        expect(html).toContain('data-pkc-log-id="lg1"');
        expect(html).toContain('data-pkc-log-id="lg2"');
        expect(html).toContain('data-pkc-field="textlog-entry-text"');
      });

      it('has delete buttons for each log entry', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [{ id: 'lg1', text: 'Entry', createdAt: '2026-01-01T00:00:00Z', flags: [] }],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        expect(html).toContain('data-pkc-field="textlog-delete"');
        expect(html).toContain('pkc-textlog-delete-btn');
      });

      it('hides Source/Preview tab bar for TEXTLOG', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({ entries: [] });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        // Tab bar should not be present for structured editors
        const editPane = html.slice(html.indexOf('id="edit-pane"'));
        expect(editPane).not.toContain('id="tab-bar"');
      });

      it('has hidden body field with original body', async () => {
        const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
        const body = serializeTextlogBody({
          entries: [{ id: 'lg1', text: 'Entry', createdAt: '2026-01-01T00:00:00Z', flags: [] }],
        });
        const html = await openAndCapture(false, { archetype: 'textlog', body });
        expect(html).toContain('data-pkc-field="body"');
      });

      it('includes TEXTLOG editor CSS in inline styles', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('.pkc-textlog-editor');
        expect(html).toContain('.pkc-textlog-edit-row');
        expect(html).toContain('.pkc-textlog-delete-btn');
      });
    });

    describe('TODO structured editor', () => {
      it('renders status select, date input, description textarea', async () => {
        const todoBody = JSON.stringify({ status: 'open', description: 'Buy groceries', date: '2099-12-31' });
        const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
        expect(html).toContain('id="structured-editor"');
        expect(html).toContain('pkc-todo-editor');
        expect(html).toContain('data-pkc-field="todo-status"');
        expect(html).toContain('data-pkc-field="todo-description"');
        expect(html).toContain('data-pkc-field="todo-date"');
        expect(html).toContain('data-pkc-field="todo-archived"');
      });

      it('hides Source/Preview tab bar for TODO', async () => {
        const todoBody = JSON.stringify({ status: 'open', description: 'Test' });
        const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
        const editPane = html.slice(html.indexOf('id="edit-pane"'));
        expect(editPane).not.toContain('id="tab-bar"');
      });

      it('includes TODO editor CSS in inline styles', async () => {
        const todoBody = JSON.stringify({ status: 'open', description: 'Test' });
        const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
        expect(html).toContain('.pkc-todo-editor');
        expect(html).toContain('.pkc-todo-status-select');
      });
    });

    describe('FORM structured editor', () => {
      it('renders name input, note textarea, checked checkbox', async () => {
        const formBody = JSON.stringify({ name: 'John', note: 'Some note', checked: true });
        const html = await openAndCapture(false, { archetype: 'form', body: formBody });
        expect(html).toContain('id="structured-editor"');
        expect(html).toContain('pkc-form-editor');
        expect(html).toContain('data-pkc-field="form-name"');
        expect(html).toContain('data-pkc-field="form-note"');
        expect(html).toContain('data-pkc-field="form-checked"');
      });

      it('includes FORM editor CSS in inline styles', async () => {
        const formBody = JSON.stringify({ name: 'Test', note: '', checked: false });
        const html = await openAndCapture(false, { archetype: 'form', body: formBody });
        expect(html).toContain('.pkc-form-editor');
        expect(html).toContain('.pkc-form-name-input');
      });
    });

    describe('TEXT split editor (A-2, 2026-04-14)', () => {
      it('uses .pkc-text-split-editor and omits the structured editor / tab bar', async () => {
        // A-2 replaced the Source/Preview tab bar with the split
        // view (textarea + live preview) for TEXT archetype.
        // Detailed contract assertions live in
        // tests/adapter/entry-window-split-edit.test.ts; this test
        // pins the headline structural decision.
        const html = await openAndCapture(false, { archetype: 'text', body: '# Hello' });
        expect(html).not.toContain('id="structured-editor"');
        expect(html).not.toContain('id="tab-bar"');
        expect(html).toContain('pkc-text-split-editor');
        expect(html).toContain('id="body-edit"');
      });

      it('uses textarea for attachment', async () => {
        const attBody = JSON.stringify({ name: 'file.txt', mime: 'text/plain' });
        const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
        expect(html).not.toContain('id="structured-editor"');
        expect(html).toContain('id="tab-bar"');
      });
    });

    describe('child-side functions', () => {
      it('has collectStructuredBody function', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('function collectStructuredBody()');
      });

      it('has restoreStructuredEditor function', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('function restoreStructuredEditor()');
      });

      it('useStructuredEditor is true for textlog', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('var useStructuredEditor = true');
      });

      it('useStructuredEditor is true for todo', async () => {
        const todoBody = JSON.stringify({ status: 'open', description: '' });
        const html = await openAndCapture(false, { archetype: 'todo', body: todoBody });
        expect(html).toContain('var useStructuredEditor = true');
      });

      it('useStructuredEditor is false for text', async () => {
        const html = await openAndCapture(false, { archetype: 'text', body: 'hello' });
        expect(html).toContain('var useStructuredEditor = false');
      });

      it('saveEntry uses collectStructuredBody for structured editors', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain('useStructuredEditor ? collectStructuredBody()');
      });

      it('has TEXTLOG delete button click handler', async () => {
        const html = await openAndCapture(false, { archetype: 'textlog', body: '{}' });
        expect(html).toContain("data-pkc-field') !== 'textlog-delete'");
        expect(html).toContain("data-pkc-deleted', 'true'");
      });
    });
  });

  // ── Slice C: Editor sizing policy ───────────────────────────
  //
  // See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C.
  // Entry window (dblclick edit) for non-structured archetypes must follow
  // viewport/pane instead of rows=10. Structured archetypes unaffected.
  describe('Slice C: editor sizing policy', () => {
    it('non-structured TEXT edit-pane marks body-edit as viewport-sized (no rows=10)', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: 'hello' });
      // Body textarea should no longer be rows="10" — it follows viewport.
      const bodyEditTag = html.match(/<textarea[^>]*id="body-edit"[^>]*>/)?.[0] ?? '';
      expect(bodyEditTag).toContain('data-pkc-viewport-sized="true"');
      expect(bodyEditTag).not.toMatch(/\brows="10"/);
    });

    it('non-structured edit-pane has data-pkc-wide="true"', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: 'hello' });
      const editPaneTag = html.match(/<div[^>]*id="edit-pane"[^>]*>/)?.[0] ?? '';
      expect(editPaneTag).toContain('data-pkc-wide="true"');
    });

    it('structured archetypes (textlog) do NOT widen edit-pane', async () => {
      const textlogBody = JSON.stringify({ entries: [] });
      const html = await openAndCapture(false, { archetype: 'textlog', body: textlogBody });
      const editPaneTag = html.match(/<div[^>]*id="edit-pane"[^>]*>/)?.[0] ?? '';
      expect(editPaneTag).not.toContain('data-pkc-wide="true"');
    });

    it('structured archetypes keep hidden body-edit without viewport sizing', async () => {
      const textlogBody = JSON.stringify({ entries: [] });
      const html = await openAndCapture(false, { archetype: 'textlog', body: textlogBody });
      const bodyEditTag = html.match(/<textarea[^>]*id="body-edit"[^>]*>/)?.[0] ?? '';
      expect(bodyEditTag).not.toContain('data-pkc-viewport-sized');
    });

    it('inline CSS includes viewport-sized textarea rule', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: 'x' });
      expect(html).toContain('.pkc-editor-body[data-pkc-viewport-sized="true"]');
      expect(html).toContain('calc(100vh - 12rem)');
    });

    it('inline CSS includes wide edit-pane rule', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: 'x' });
      expect(html).toContain('.pkc-editor[data-pkc-wide="true"]');
    });

    it('pkc-window-content becomes flex column for edit-pane flex:1 chain', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: 'x' });
      // Assert both flex declarations appear in the window-content rule.
      const match = html.match(/\.pkc-window-content\s*\{[^}]*\}/)?.[0] ?? '';
      expect(match).toContain('display: flex');
      expect(match).toContain('flex-direction: column');
    });
  });

  // ── Table of Contents in popped preview ──
  // The popped "More..." window now emits a static <nav class="pkc-toc
  // pkc-toc-preview"> at the top of the view pane so readers can jump
  // to headings (TEXT) or day/log/heading layers (TEXTLOG). The TOC is
  // omitted when an entry has no TOC-producing content (attachment,
  // todo, form, headingless text), since an empty nav would be noise.
  describe('Table of Contents in popped preview', () => {
    it('emits pkc-toc-preview nav for a TEXT entry with headings', async () => {
      const html = await openAndCapture(false, {
        archetype: 'text',
        body: '# Alpha\n\n## Beta\n\n### Gamma\n\nbody',
      });
      expect(html).toContain('class="pkc-toc pkc-toc-preview"');
      expect(html).toContain('data-pkc-region="toc"');
      expect(html).toContain('href="#alpha"');
      expect(html).toContain('href="#beta"');
      expect(html).toContain('href="#gamma"');
    });

    it('emits day / log anchors for a TEXTLOG entry', async () => {
      const { serializeTextlogBody } = await import('../../src/features/textlog/textlog-body');
      const body = serializeTextlogBody({
        entries: [
          { id: 'log-a', text: 'first', createdAt: '2026-04-09T10:00:00Z', flags: [] },
          { id: 'log-b', text: 'second', createdAt: '2026-04-10T11:00:00Z', flags: [] },
        ],
      });
      const html = await openAndCapture(false, { archetype: 'textlog', body });
      expect(html).toContain('class="pkc-toc pkc-toc-preview"');
      expect(html).toContain('href="#day-2026-04-09"');
      expect(html).toContain('href="#day-2026-04-10"');
      expect(html).toContain('href="#log-log-a"');
      expect(html).toContain('href="#log-log-b"');
    });

    it('omits the TOC section for a TEXT entry with no headings', async () => {
      const html = await openAndCapture(false, {
        archetype: 'text',
        body: 'just body with **no** headings',
      });
      // CSS declarations referencing the class still ship; check for
      // the actual <nav> via its class attribute.
      expect(html).not.toContain('class="pkc-toc pkc-toc-preview"');
    });

    it('omits the TOC section for an attachment entry', async () => {
      const attBody = JSON.stringify({ name: 'a.pdf', mime: 'application/pdf', size: 100, asset_key: 'k' });
      const html = await openAndCapture(false, { archetype: 'attachment', body: attBody });
      expect(html).not.toContain('class="pkc-toc pkc-toc-preview"');
    });

    it('includes pkc-toc-preview CSS block so the nav is styled', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: '# Title' });
      expect(html).toContain('.pkc-toc.pkc-toc-preview');
      expect(html).toContain('.pkc-toc-preview .pkc-toc-link');
    });

    // ── Sticky sidebar layout ──
    // The popped view wraps the TOC in an <aside class="pkc-toc-sidebar">
    // that uses position:sticky so readers can jump back to the outline
    // at any scroll position. CSS is scoped via
    // `#view-pane[data-pkc-has-toc="true"]` so only TOC-bearing archetypes
    // get the flex layout; no-TOC entries keep the original single-column.
    it('wraps the view pane in a flex layout with aside sidebar when TOC is present', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: '# A\n\n## B' });
      expect(html).toContain('<div id="view-pane" data-pkc-has-toc="true">');
      expect(html).toContain('<aside class="pkc-toc-sidebar" data-pkc-region="toc-sidebar">');
      expect(html).toContain('<div class="pkc-viewer-main">');
      // The sticky / sidebar CSS block must be inlined.
      expect(html).toMatch(/#view-pane\[data-pkc-has-toc="true"\]\s*\{[^}]*display:\s*flex/);
      expect(html).toMatch(/\.pkc-toc-sidebar\s*\{[^}]*position:\s*sticky/);
    });

    it('does NOT add the data-pkc-has-toc attribute when there is no TOC', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: 'plain body' });
      // The CSS block references the attribute selector by string;
      // check for the actual element attribute form instead.
      expect(html).toContain('<div id="view-pane">');
      expect(html).not.toContain('<div id="view-pane" data-pkc-has-toc');
      // And no sidebar <aside> should be emitted.
      expect(html).not.toContain('<aside class="pkc-toc-sidebar"');
    });

    it('collapses to a single column under narrow viewports via media query', async () => {
      const html = await openAndCapture(false, { archetype: 'text', body: '# A' });
      expect(html).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[^}]*#view-pane\[data-pkc-has-toc="true"\]\s*\{\s*flex-direction:\s*column/);
    });
  });
});
