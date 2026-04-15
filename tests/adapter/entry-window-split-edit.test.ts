/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A-2 (USER_REQUEST_LEDGER S-13, 2026-04-14) — TEXT split edit in
 * entry window.
 *
 * Contract:
 *   - For `entry.archetype === 'text'`, the entry window's edit pane
 *     renders a split editor (textarea + live preview) instead of the
 *     Source / Preview tab bar. Mirrors the center pane
 *     `.pkc-text-split-editor` grid.
 *   - For TEXTLOG / TODO / FORM (structured editors), markup is
 *     unchanged from pre-A-2 (#62 structured-editor-parity).
 *   - For non-structured non-TEXT archetypes (attachment / folder /
 *     generic / opaque), the Source/Preview tab bar is preserved.
 *
 * Non-goals (deferred):
 *   - Resize handle is rendered but non-interactive in the child
 *     window. The center pane's resize logic is in the parent's
 *     action-binder; replicating it inside the child requires a
 *     separate drag handler. Out of A-2 minimum scope.
 *   - No split ratio persistence.
 *
 * Scope: assertions run against the captured HTML string produced
 * by `buildWindowHtml` (via `openEntryWindow`). The child window's
 * internal script is a string in that HTML; we don't boot a real
 * iframe here. That matches the pattern in `entry-window.test.ts`.
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

type Arch = 'text' | 'textlog' | 'todo' | 'form' | 'attachment' | 'folder' | 'generic' | 'opaque';

function makeEntry(archetype: Arch, body = '# Hello\n\nSome **bold** text.') {
  testCounter++;
  return {
    lid: `e-${testCounter}`,
    title: 'Entry ' + archetype,
    body,
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

async function openAndCapture(archetype: Arch, body?: string) {
  capturedHtml = '';
  setupWindowOpenMock();
  const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
  const entry = makeEntry(archetype, body);
  openEntryWindow(entry as never, /* readonly */ false, vi.fn());
  return capturedHtml;
}

/**
 * Narrow the captured HTML to the edit pane — between
 * `<div id="edit-pane"` and the closing pattern right before the
 * action bar. Keeps assertions tight and avoids false matches in
 * the view pane or the inline script body.
 */
function extractEditPane(html: string): string {
  const start = html.indexOf('<div id="edit-pane"');
  if (start < 0) return html;
  // The next section after the edit-pane div is the action bar.
  const end = html.indexOf('<!-- Fixed action bar', start);
  return html.slice(start, end < 0 ? html.length : end);
}

describe('A-2 — entry window TEXT split editor', () => {
  beforeEach(() => {
    capturedHtml = '';
    vi.restoreAllMocks();
  });

  it('TEXT archetype renders .pkc-text-split-editor and omits the tab bar', async () => {
    const html = await openAndCapture('text');
    const editPane = extractEditPane(html);
    expect(editPane).toContain('pkc-text-split-editor');
    // Tab bar markup must not appear inside the edit pane for TEXT.
    expect(editPane).not.toContain('id="tab-bar"');
    expect(editPane).not.toContain("onclick=\"showTab('source')\"");
    // Both panes (textarea + preview) are emitted.
    expect(editPane).toContain('id="body-edit"');
    expect(editPane).toContain('id="body-preview"');
    // Preview carries the split-view class contract that matches
    // base.css `.pkc-text-edit-preview` (so the UI looks identical
    // to the center pane).
    expect(editPane).toContain('pkc-text-edit-preview');
    expect(editPane).toContain('data-pkc-region="text-edit-preview"');
  });

  it('TEXT archetype renders the initial preview server-side (no empty flash)', async () => {
    // renderedBody is injected into the preview div; the user sees
    // fully rendered markdown the moment the window opens.
    const html = await openAndCapture('text', '# Heading\n\nBody paragraph.');
    const editPane = extractEditPane(html);
    // The preview should contain a rendered heading — assert the
    // opening tag (markdown-it may add attrs, so anchor on `<h1`
    // rather than the exact close).
    const previewStart = editPane.indexOf('id="body-preview"');
    expect(previewStart).toBeGreaterThan(-1);
    const preview = editPane.slice(previewStart, previewStart + 800);
    expect(preview).toMatch(/<h1[ >]/);
    expect(preview).toContain('Heading');
  });

  it('TEXT archetype wires the child-side live preview input listener', async () => {
    // The inline script must declare useSplitEditor=true and attach
    // an `input` listener that updates #body-preview. We assert by
    // searching the <script> block.
    const html = await openAndCapture('text');
    expect(html).toContain('var useSplitEditor = true');
    expect(html).toContain("document.getElementById('body-edit').addEventListener('input'");
    expect(html).toContain("document.getElementById('body-preview').innerHTML = renderMd(src)");
  });

  it('TEXTLOG archetype keeps the structured editor (A-2 only affects TEXT)', async () => {
    const html = await openAndCapture('textlog', '[]');
    const editPane = extractEditPane(html);
    // Structured editor wrapper present, split editor absent.
    expect(editPane).toContain('id="structured-editor"');
    expect(editPane).not.toContain('pkc-text-split-editor');
    // useSplitEditor flag is false for TEXTLOG.
    expect(html).toContain('var useSplitEditor = false');
  });

  it('attachment archetype keeps the Source/Preview tab bar (non-TEXT, non-structured)', async () => {
    const html = await openAndCapture('attachment', JSON.stringify({ name: 'x.pdf', mime: 'application/pdf', size: 10, asset_key: 'k' }));
    const editPane = extractEditPane(html);
    // Tab bar present, split editor absent.
    expect(editPane).toContain('id="tab-bar"');
    expect(editPane).toContain("onclick=\"showTab('source')\"");
    expect(editPane).not.toContain('pkc-text-split-editor');
    // useSplitEditor flag is false for attachment.
    expect(html).toContain('var useSplitEditor = false');
  });

  it('folder archetype keeps the Source/Preview tab bar', async () => {
    const html = await openAndCapture('folder', 'folder description');
    const editPane = extractEditPane(html);
    expect(editPane).toContain('id="tab-bar"');
    expect(editPane).not.toContain('pkc-text-split-editor');
  });

  it('generic and opaque archetypes keep the tab bar (non-TEXT fallback)', async () => {
    for (const arch of ['generic', 'opaque'] as const) {
      const html = await openAndCapture(arch, 'raw content');
      const editPane = extractEditPane(html);
      expect(editPane, `${arch} should keep tab bar`).toContain('id="tab-bar"');
      expect(editPane, `${arch} should not use split editor`).not.toContain('pkc-text-split-editor');
    }
  });

  it('inline CSS includes .pkc-text-split-editor rules so the child window can lay out the grid', async () => {
    const html = await openAndCapture('text');
    // The CSS block is emitted inside the head <style>. Search the
    // full HTML (before the edit pane extraction) so we're looking
    // at the style block.
    expect(html).toContain('.pkc-text-split-editor {');
    expect(html).toContain('grid-template-columns: 1fr 6px 1fr');
    expect(html).toContain('.pkc-text-edit-preview {');
    // Tab bar styles are still present for the non-TEXT path.
    expect(html).toContain('.pkc-tab-bar {');
  });
});
