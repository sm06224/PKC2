/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A-2 × B-2 integration pin (USER_REQUEST_LEDGER §1 S-13 ×
 * P-13, 2026-04-14).
 *
 * Why this test exists: B-2 (syntax highlight) shipped in commit
 * `92921ec` (2026-04-13); A-2 (entry window TEXT split editor)
 * shipped in commit `7d717de` (2026-04-14). The split editor's
 * preview pane is populated server-side by `renderViewBody` →
 * `renderMarkdown`, which routes through markdown-it's `highlight:`
 * hook → `highlightCode`. Both components compose by construction,
 * but there's no test that fails if either side is regressed in a
 * way that breaks the combo (e.g. the split editor begins escaping
 * the highlight HTML, or the highlighter stops emitting `pkc-tok-*`
 * spans that base.css styles).
 *
 * Contract under test:
 *   - For `archetype === 'text'`, the entry-window's `body-preview`
 *     pane must contain syntax-highlighted spans for fenced code
 *     blocks with a known language tag.
 *   - The `language-typescript` class is set on `<code>`.
 *   - Token spans (`pkc-tok-keyword`, `pkc-tok-string`, ...) appear.
 *   - Plain code remains escaped — the test injects `<script>` inside
 *     a string literal and asserts the angle brackets are escaped.
 *
 * Scope: this is a 1-test integration pin, not a re-test of the
 * tokenizer (covered by `tests/features/markdown/code-highlight.test.ts`).
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
}

function makeTextEntry(body: string) {
  testCounter++;
  return {
    lid: `eh-${testCounter}`,
    title: 'highlight test',
    body,
    archetype: 'text' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

async function openAndCapture(body: string): Promise<string> {
  capturedHtml = '';
  setupWindowOpenMock();
  const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
  openEntryWindow(makeTextEntry(body) as never, false, vi.fn());
  return capturedHtml;
}

/** Slice the rendered preview pane out of the captured HTML. */
function extractPreviewPane(html: string): string {
  const start = html.indexOf('id="body-preview"');
  if (start < 0) throw new Error('body-preview pane not found');
  // Walk forward to the closing `</div>` for body-preview; the next
  // sibling is `</div>` (close `.pkc-text-split-editor`). Use the
  // next `</div>` after a reasonable window.
  const fenceClose = html.indexOf('</div>', start);
  return html.slice(start, fenceClose + '</div>'.length);
}

describe('A-2 × B-2 — entry window split editor preview shows syntax highlight', () => {
  beforeEach(() => {
    capturedHtml = '';
    vi.restoreAllMocks();
  });

  it('TEXT archetype split-editor preview emits language class + highlight tokens for ```ts blocks', async () => {
    const body = [
      '# Demo',
      '',
      '```ts',
      'const greet = (name: string) => `<script>${name}</script>`;',
      '```',
    ].join('\n');
    const html = await openAndCapture(body);
    const preview = extractPreviewPane(html);

    // markdown-it sets the language class from the literal info string,
    // so a `\`\`\`ts` fence becomes `class="language-ts"` (the alias is
    // preserved on the DOM; the highlighter canonicalises internally).
    expect(preview).toContain('class="language-ts"');

    // B-2 token spans are emitted by code-highlight.ts. Pin the two
    // most visible ones (keyword + string) so a regression that
    // dropped the highlight pipeline would fail here.
    expect(preview).toContain('pkc-tok-keyword');
    expect(preview).toContain('pkc-tok-string');

    // Safety: angle brackets inside the string literal must be
    // escaped, never emitted as raw `<script>`. The highlighter is
    // expected to escape every chunk before wrapping in spans.
    expect(preview).toContain('&lt;script&gt;');
    // Sanity: the dangerous raw form is absent (the leading `<` of
    // the script tag is the only place `<script` could appear in
    // preview content; if it does, the escape pipeline is broken).
    const scriptTagInBody = preview.indexOf('<script');
    expect(scriptTagInBody).toBe(-1);
  });
});
