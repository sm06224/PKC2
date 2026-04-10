/**
 * Rendered viewer: open a TEXT or TEXTLOG entry as a plain,
 * print-friendly HTML page in a new browser window.
 *
 * This is **not** the `entry-window.ts` edit-capable path. There is
 * no editor, no toolbar, no postMessage round-trip. The new window
 * receives a standalone HTML document assembled from the current
 * container state:
 *
 *   1. The entry body is pre-processed with `resolveAssetReferences`
 *      so `![alt](asset:key)` embeds and `[label](asset:key)` chips
 *      are already resolved when markdown-it sees the source.
 *   2. `renderMarkdown` produces the final HTML.
 *   3. A minimal inline CSS block gives the page a readable
 *      light-mode layout and a print stylesheet — it is explicitly
 *      NOT the main app stylesheet.
 *   4. The document is written via `window.open('') +
 *      document.write(…)` so it inherits an `about:blank` origin
 *      and there is no network round-trip.
 *
 * Intended use cases:
 *
 * - Quick read-only preview of a long note.
 * - Print a TEXT / TEXTLOG with the browser's native "Print" dialog.
 * - Simple hand-off: "share this rendered view" by saving the new
 *   window as HTML / PDF, without exporting the whole container.
 *
 * Architectural exception AE-003 (Preview Window Bridge) covers the
 * `document.write` step. Everything else is plain string building.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { renderMarkdown } from '../../features/markdown/markdown-render';
import {
  resolveAssetReferences,
  hasAssetReferences,
} from '../../features/markdown/asset-resolver';
import { parseAttachmentBody } from './attachment-presenter';
import {
  parseTextlogBody,
  serializeTextlogAsMarkdown,
} from '../../features/textlog/textlog-body';

/**
 * Build the standalone HTML document for a rendered viewer window.
 *
 * Exported separately from `openRenderedViewer` so tests can
 * inspect the document without having to mock `window.open`.
 *
 * `entry.archetype` is expected to be `text` or `textlog`; other
 * archetypes are accepted but rendered as their raw body string so
 * the helper is resilient to unexpected inputs. Callers are
 * expected to gate the action on archetype before calling this.
 */
export function buildRenderedViewerHtml(entry: Entry, container: Container | null): string {
  const source = entryToMarkdownSource(entry);
  const resolved = resolveAssetSource(source, container);
  const body = renderMarkdown(resolved);
  const title = escapeForHtml(entry.title || '(untitled)');
  const archetypeLabel = entry.archetype === 'textlog' ? 'Textlog' : 'Text';

  // A tight inline stylesheet. Intentionally NOT the app stylesheet —
  // the viewer is a "print this note" target, not a second copy of
  // the app UI. We favour a readable body width, a sane mono font
  // for code, and a clean `@media print` rule that strips backgrounds.
  const style = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                   "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      background: #fafafa;
      color: #222;
      line-height: 1.65;
      padding: 2.5rem 1.5rem;
    }
    main { max-width: 48rem; margin: 0 auto; }
    header.pkc-viewer-header {
      border-bottom: 1px solid #ddd;
      margin-bottom: 1.5rem;
      padding-bottom: 0.75rem;
    }
    header.pkc-viewer-header h1 {
      font-size: 1.6rem;
      margin: 0 0 0.25rem 0;
    }
    header.pkc-viewer-header .pkc-viewer-meta {
      font-size: 0.85rem;
      color: #666;
    }
    article.pkc-viewer-body h1,
    article.pkc-viewer-body h2,
    article.pkc-viewer-body h3 {
      margin-top: 1.6em;
      margin-bottom: 0.6em;
    }
    article.pkc-viewer-body pre {
      background: #f0f0f0;
      padding: 0.75rem 1rem;
      overflow-x: auto;
      border-radius: 4px;
    }
    article.pkc-viewer-body code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }
    article.pkc-viewer-body p code,
    article.pkc-viewer-body li code {
      background: #f0f0f0;
      padding: 0.08em 0.36em;
      border-radius: 3px;
    }
    article.pkc-viewer-body img { max-width: 100%; height: auto; }
    article.pkc-viewer-body blockquote {
      border-left: 4px solid #ccc;
      margin: 1em 0;
      padding: 0.3em 1em;
      color: #555;
    }
    article.pkc-viewer-body table {
      border-collapse: collapse;
      margin: 1em 0;
    }
    article.pkc-viewer-body th,
    article.pkc-viewer-body td {
      border: 1px solid #ccc;
      padding: 0.4em 0.8em;
    }
    @media print {
      body { background: #fff; padding: 0; color: #000; }
      header.pkc-viewer-header { border-bottom-color: #000; }
    }
  `;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>${style}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '<header class="pkc-viewer-header">',
    `<h1>${title}</h1>`,
    `<div class="pkc-viewer-meta">${archetypeLabel} · rendered view (read-only)</div>`,
    '</header>',
    '<article class="pkc-viewer-body pkc-md-rendered">',
    body,
    '</article>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Open a TEXT / TEXTLOG entry as a rendered, read-only HTML page in
 * a new browser window.
 *
 * `window.open('')` returns `null` when the browser blocks popups;
 * the caller should prompt the user to allow popups for the app
 * origin. We do NOT throw in that case — the function is a no-op
 * and returns the (possibly `null`) window handle so callers can
 * react.
 */
export function openRenderedViewer(entry: Entry, container: Container | null): Window | null {
  const html = buildRenderedViewerHtml(entry, container);
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

// ── helpers ────────────────────────────────────────────

function entryToMarkdownSource(entry: Entry): string {
  if (entry.archetype === 'textlog') {
    try {
      return serializeTextlogAsMarkdown(parseTextlogBody(entry.body));
    } catch {
      return entry.body ?? '';
    }
  }
  return entry.body ?? '';
}

function resolveAssetSource(source: string, container: Container | null): string {
  if (!container) return source;
  if (!hasAssetReferences(source)) return source;
  const mimeByKey: Record<string, string> = {};
  const nameByKey: Record<string, string> = {};
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(e.body);
    if (att.asset_key) {
      if (att.mime) mimeByKey[att.asset_key] = att.mime;
      if (att.name) nameByKey[att.asset_key] = att.name;
    }
  }
  return resolveAssetReferences(source, {
    assets: container.assets ?? {},
    mimeByKey,
    nameByKey,
  });
}

function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
