/**
 * Rendered viewer: open a TEXT or TEXTLOG entry as a standalone,
 * print-friendly HTML page in a new browser window.
 *
 * Not the `entry-window.ts` edit-capable path. There is no editor,
 * no postMessage round-trip. The new window receives a standalone
 * HTML document assembled from the current container state:
 *
 *   1. TEXT: the body is pre-processed with `resolveAssetReferences`
 *      so `![alt](asset:key)` embeds and `[label](asset:key)` chips
 *      are already resolved when markdown-it sees the source.
 *   2. TEXTLOG: the common `buildTextlogDoc` representation drives a
 *      day-grouped `<section id="day-..."><article id="log-...">`
 *      tree (Slice 4-B unifies rendered-viewer, print, and HTML
 *      download on this single representation — the legacy
 *      `serializeTextlogAsMarkdown` flatten path has been removed).
 *   3. A minimal inline CSS block gives the page a readable light
 *      layout and a print stylesheet. Slice 4-B adds a toolbar with
 *      Print / HTML Download buttons; the toolbar is hidden under
 *      `@media print` so saved PDFs / print output stay clean.
 *   4. An inline `<script data-pkc-viewer-script>` wires the two
 *      toolbar buttons. The Download path clones the document, removes
 *      the toolbar + script, and emits a self-contained HTML Blob.
 *   5. The assembled document is written via `window.open('') +
 *      document.write(…)` so it inherits an `about:blank` origin and
 *      there is no network round-trip.
 *
 * Architectural exception AE-003 (Preview Window Bridge) covers the
 * `document.write` step. Everything else is plain string building.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { renderMarkdown } from '../../features/markdown/markdown-render';
import {
  extractTocFromEntry,
  renderStaticTocHtml,
} from '../../features/markdown/markdown-toc';
import {
  resolveAssetReferences,
  hasAssetReferences,
} from '../../features/markdown/asset-resolver';
import { parseAttachmentBody } from './attachment-presenter';
import { formatLogTimestampWithSeconds } from '../../features/textlog/textlog-body';
import { buildTextlogDoc } from '../../features/textlog/textlog-doc';

/**
 * Build the standalone HTML document for a rendered viewer window.
 *
 * Exported separately from `openRenderedViewer` so tests can inspect
 * the document without having to mock `window.open`.
 *
 * `entry.archetype` is expected to be `text` or `textlog`; other
 * archetypes are accepted but rendered as their raw body string so
 * the helper is resilient to unexpected inputs. Callers are expected
 * to gate the action on archetype before calling this.
 */
export function buildRenderedViewerHtml(
  entry: Entry,
  container: Container | null,
): string {
  const title = escapeForHtml(entry.title || '(untitled)');
  const archetypeLabel = entry.archetype === 'textlog' ? 'Textlog' : 'Text';
  const bodyHtml = buildBodyHtml(entry, container);
  // Static TOC HTML for TEXT / TEXTLOG. Empty string for other
  // archetypes. Native-anchor navigation — no JS needed.
  const tocHtml = renderStaticTocHtml(extractTocFromEntry(entry));
  const exportedAt = new Date().toISOString();
  const filename = buildDownloadFilename(entry, exportedAt);

  // A tight inline stylesheet. Intentionally NOT the app stylesheet —
  // the viewer is a "print this note" target, not a second copy of
  // the app UI. We favour a readable body width, a sane mono font
  // for code, and a clean `@media print` rule that strips backgrounds
  // and hides the toolbar.
  //
  // Width policy (screen-first):
  //   - On screen `main` grows with the viewport:
  //       clamp(40rem, 90vw, 72rem)
  //     i.e. it is never narrower than ~40rem (the A5-ish floor),
  //     scales naturally with the viewport, and caps at 72rem so
  //     ultra-wide monitors still hold a readable measure.
  //   - Under `@media print` the cap reverts to 48rem — A4 body
  //     width — so paper output stays dense and laid out like the
  //     original print-target design.
  const style = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                   "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      background: #fafafa;
      color: #222;
      /* Prose density aligned with the main app (which runs at 1.4 body
         / 1.4 .pkc-md-rendered). The previous 1.65 felt loose, read by
         users as "A4-print-optimised" even on screen. Print below can
         loosen slightly for paper breathing room. */
      line-height: 1.5;
      padding: 2.5rem 1.5rem;
    }
    /* Explicitly pin the rendered markdown density so it cannot drift
       from the main-app .pkc-md-rendered baseline if body changes. */
    article.pkc-viewer-body { line-height: 1.35; }
    main { max-width: clamp(40rem, 90vw, 72rem); margin: 0 auto; }
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
    .pkc-viewer-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(250, 250, 250, 0.96);
      backdrop-filter: blur(4px);
      border-bottom: 1px solid #ddd;
      margin: -2.5rem -1.5rem 1.25rem -1.5rem;
      padding: 0.55rem 1.5rem;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }
    .pkc-viewer-toolbar button {
      font: inherit;
      font-size: 0.88rem;
      padding: 0.25rem 0.75rem;
      border: 1px solid #c0c0c0;
      background: #fff;
      color: #222;
      border-radius: 3px;
      cursor: pointer;
    }
    .pkc-viewer-toolbar button:hover { background: #f0f0f0; }
    .pkc-viewer-toolbar button:focus-visible {
      outline: 2px solid #1a6b35;
      outline-offset: 2px;
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
    /* Syntax highlight tokens — print-safe shades that stay legible
       on both screen and paper. Kept self-contained here because the
       exported HTML is a standalone document without access to the
       main app's theme variables. See
       docs/development/markdown-code-block-highlighting.md. */
    article.pkc-viewer-body pre code .pkc-tok-comment { color: #6a737d; font-style: italic; }
    article.pkc-viewer-body pre code .pkc-tok-string { color: #8a5a00; }
    article.pkc-viewer-body pre code .pkc-tok-keyword { color: #1a6b35; font-weight: 600; }
    article.pkc-viewer-body pre code .pkc-tok-number { color: #5d3c9a; }
    article.pkc-viewer-body pre code .pkc-tok-builtin { color: #0f4c81; }
    article.pkc-viewer-body pre code .pkc-tok-variable { color: #a83f00; }
    article.pkc-viewer-body pre code .pkc-tok-type { color: #117260; }
    article.pkc-viewer-body pre code .pkc-tok-attr { color: #6a5400; }
    article.pkc-viewer-body pre code .pkc-tok-punct { color: #586069; }
    article.pkc-viewer-body pre code .pkc-tok-regex { color: #8a5a00; }
    article.pkc-viewer-body pre code .pkc-tok-tag { color: #1a6b35; }
    article.pkc-viewer-body pre code .pkc-tok-meta { color: #6a737d; }
    article.pkc-viewer-body pre code .pkc-tok-ins { color: #1e7a36; }
    article.pkc-viewer-body pre code .pkc-tok-del { color: #a01a1a; }
    article.pkc-viewer-body pre code .pkc-tok-hunk { color: #1f3c91; font-weight: 600; }
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
    /* TEXTLOG day-grouped rendering (Slice 4-B: day+log article tree
       via buildTextlogDoc). Mirrors the live viewer's class names so
       downstream tooling (e.g. exported HTML re-imported somewhere) can
       still recognise the structure. */
    .pkc-textlog-document { display: flex; flex-direction: column; gap: 1.25rem; }
    .pkc-textlog-day {
      border: 1px solid #e2ddd0;
      border-radius: 4px;
      background: #fff;
    }
    .pkc-textlog-day-header {
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid #e2ddd0;
      background: #f6f1e4;
    }
    .pkc-textlog-day-title {
      margin: 0;
      font-size: 0.95rem;
      font-family: "SFMono-Regular", Consolas, monospace;
      color: #4a4030;
    }
    .pkc-textlog-log {
      padding: 0.6rem 0.9rem;
      border-bottom: 1px dashed #ece6d5;
    }
    .pkc-textlog-log:last-child { border-bottom: none; }
    .pkc-textlog-log[data-pkc-log-important="true"] {
      background: #fffbeb;
      border-left: 3px solid #c07000;
    }
    .pkc-textlog-log-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.78rem;
      color: #666;
    }
    .pkc-textlog-log-flag { color: #c07000; }
    .pkc-textlog-text > :first-child { margin-top: 0; }
    .pkc-textlog-text > :last-child { margin-bottom: 0; }
    /* TEXTLOG-scoped markdown density — mirrors base.css. Log
       articles pack tight; the big density fix here is flipping
       white-space back to normal so markdown-it inter-block
       newlines do not render as literal blank lines between
       paragraphs (which was making TEXTLOG feel far looser than
       TEXT). TEXT entries in the same exported document are
       unaffected — this selector only matches log bodies. */
    .pkc-textlog-text.pkc-md-rendered { line-height: 1.35; white-space: normal; }
    .pkc-textlog-text p { margin: 0.2em 0; }
    .pkc-textlog-text ul,
    .pkc-textlog-text ol { margin: 0.2em 0; padding-left: 1.3em; }
    .pkc-textlog-text li { margin: 0.05em 0; }
    .pkc-textlog-text blockquote { margin: 0.25em 0; }
    .pkc-textlog-text pre { margin: 0.25em 0; }
    /* Two-column layout with a sticky TOC sidebar.
       The sidebar pins to the top of the viewport so the outline
       stays visible while the reader scrolls through long bodies.
       Body is the scroll container (no intermediate overflow box)
       so position: sticky works against the window viewport.
       Below 720px the layout collapses to a single column and the
       TOC returns to a top-of-document block. */
    .pkc-viewer-layout { display: flex; gap: 1.5rem; align-items: flex-start; }
    .pkc-toc-sidebar {
      flex: 0 0 16rem;
      position: sticky;
      top: 1rem;
      align-self: flex-start;
      max-height: calc(100vh - 2rem);
      overflow-y: auto;
    }
    .pkc-toc-sidebar .pkc-toc.pkc-toc-preview { margin: 0; }
    .pkc-viewer-main { flex: 1 1 auto; min-width: 0; }
    @media (max-width: 720px) {
      .pkc-viewer-layout { flex-direction: column; }
      .pkc-toc-sidebar {
        flex: 0 0 auto;
        position: static;
        max-height: none;
        width: 100%;
      }
    }
    /* Preview-surface Table of Contents — print-safe, standalone
       colours (no main-app theme vars in exported HTML). */
    .pkc-toc.pkc-toc-preview {
      padding: 0.5rem 0.75rem;
      margin: 0 0 1.25rem;
      border: 1px solid #d8d2c2;
      border-radius: 4px;
      background: #fbf9f1;
      font-size: 0.88rem;
    }
    .pkc-toc-preview .pkc-toc-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      color: #6a604a;
      margin-bottom: 0.25rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .pkc-toc-preview .pkc-toc-list { list-style: none; margin: 0; padding: 0; }
    .pkc-toc-preview .pkc-toc-item { margin: 0; padding: 0; }
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="2"] { padding-left: 0.9rem; }
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="3"] { padding-left: 1.8rem; }
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="4"] { padding-left: 2.7rem; }
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="5"] { padding-left: 3.6rem; }
    .pkc-toc-preview .pkc-toc-link {
      display: block;
      padding: 0.1rem 0.3rem;
      color: #222;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-radius: 2px;
    }
    .pkc-toc-preview .pkc-toc-link:hover,
    .pkc-toc-preview .pkc-toc-link:focus-visible {
      background: #ece6d5;
      color: #1a6b35;
    }
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="day"] > .pkc-toc-link,
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="log"] > .pkc-toc-link {
      color: #6a604a;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.78rem;
    }
    .pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="day"] > .pkc-toc-link {
      font-weight: 600;
    }
    @media print {
      body { background: #fff; padding: 0; color: #000; }
      /* Restore A4-ish body width for paper output. Screen gets the
         wider clamp above; print keeps the original 48rem measure so
         saved PDFs / physical prints lay out predictably. */
      main { max-width: 48rem; }
      /* Paper tolerates a touch more breathing room than screen.
         Keeps print output close to its historical appearance while
         the screen default stays dense. */
      article.pkc-viewer-body { line-height: 1.5; }
      header.pkc-viewer-header { border-bottom-color: #000; }
      .pkc-viewer-toolbar { display: none; }
      /* Keep the TOC in printed output — it doubles as an index
         page for long exports. Drop the background tint so it
         prints cleanly on white paper. */
      .pkc-toc.pkc-toc-preview { background: transparent; border-color: #000; }
      /* Print collapses the two-column layout so the TOC prints
         as a front-of-document index and the body flows normally
         across pages. Sticky + column flow behave badly in print. */
      .pkc-viewer-layout { display: block; }
      .pkc-toc-sidebar {
        position: static;
        max-height: none;
        width: 100%;
        margin-bottom: 1rem;
      }
      .pkc-textlog-day { break-inside: avoid; }
      .pkc-textlog-log { break-inside: avoid; }
    }
  `;

  const filenameJson = JSON.stringify(filename);
  const script = `
(function(){
  var printBtn = document.getElementById('pkc-viewer-print-btn');
  var dlBtn = document.getElementById('pkc-viewer-download-btn');
  if (printBtn) printBtn.addEventListener('click', function(){ window.print(); });
  if (dlBtn) dlBtn.addEventListener('click', function(){
    var root = document.documentElement.cloneNode(true);
    var tb = root.querySelector('[data-pkc-region="viewer-toolbar"]');
    if (tb && tb.parentNode) tb.parentNode.removeChild(tb);
    var s = root.querySelector('script[data-pkc-viewer-script]');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    var html = '<!DOCTYPE html>\\n' + root.outerHTML;
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = ${filenameJson};
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 0);
  });
})();
`;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="pkc-source-lid" content="${escapeForAttr(entry.lid)}">`,
    `<meta name="pkc-exported-at" content="${escapeForAttr(exportedAt)}">`,
    `<meta name="pkc-archetype" content="${escapeForAttr(entry.archetype)}">`,
    `<title>${title}</title>`,
    `<style>${style}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '<header class="pkc-viewer-toolbar" data-pkc-region="viewer-toolbar">',
    '<button type="button" id="pkc-viewer-print-btn" data-pkc-action="viewer-print">🖨 Print</button>',
    '<button type="button" id="pkc-viewer-download-btn" data-pkc-action="viewer-download">💾 Download HTML</button>',
    '</header>',
    '<header class="pkc-viewer-header">',
    `<h1>${title}</h1>`,
    `<div class="pkc-viewer-meta">${archetypeLabel} · rendered view (read-only)</div>`,
    '</header>',
    // Two-column layout when a TOC is present: sticky sidebar on
    // the left, content on the right. When the TOC is empty (e.g.
    // a headingless TEXT body) the wrapper collapses and the
    // article fills the column — no empty sidebar shows up.
    tocHtml
      ? '<div class="pkc-viewer-layout">'
        + `<aside class="pkc-toc-sidebar" data-pkc-region="toc-sidebar">${tocHtml}</aside>`
        + '<div class="pkc-viewer-main">'
        + '<article class="pkc-viewer-body pkc-md-rendered">'
        + bodyHtml
        + '</article>'
        + '</div>'
        + '</div>'
      : '<article class="pkc-viewer-body pkc-md-rendered">'
        + bodyHtml
        + '</article>',
    '</main>',
    `<script data-pkc-viewer-script>${script}</script>`,
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
export function openRenderedViewer(
  entry: Entry,
  container: Container | null,
): Window | null {
  const html = buildRenderedViewerHtml(entry, container);
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

// ── helpers ────────────────────────────────────────────

/**
 * Build the body HTML fragment that goes inside
 * `<article class="pkc-viewer-body">`. Dispatches on archetype:
 *
 *   - TEXTLOG → day-grouped `<section>`/`<article>` tree driven by
 *     `buildTextlogDoc`. The same builder powers the live viewer,
 *     entry-window, and (Slice 5-B) transclusion — there is a single
 *     source of truth for what a rendered textlog looks like.
 *   - TEXT / everything else → asset references resolved, then
 *     markdown-it.
 */
function buildBodyHtml(entry: Entry, container: Container | null): string {
  if (entry.archetype === 'textlog') {
    return buildTextlogBodyHtml(entry, container);
  }
  const resolved = resolveAssetSource(entry.body ?? '', container);
  return renderMarkdown(resolved);
}

/**
 * Render a TEXTLOG entry as a day-grouped HTML tree.
 *
 * Slice 4-B: replaces the previous `serializeTextlogAsMarkdown`
 * flatten-then-render path with the common `buildTextlogDoc`
 * representation. The emitted structure matches the live viewer
 * (`<section class="pkc-textlog-day">` → `<article class="pkc-textlog-log">`)
 * so all four surfaces (live / rendered / print / download) share a
 * single DOM vocabulary.
 */
function buildTextlogBodyHtml(entry: Entry, container: Container | null): string {
  const doc = buildTextlogDoc(entry, { order: 'asc' });
  if (doc.sections.length === 0) {
    return '<em style="color:#999">(empty log)</em>';
  }

  const parts: string[] = [];
  parts.push('<div class="pkc-textlog-document">');

  for (const section of doc.sections) {
    const dayId =
      section.dateKey === '' ? 'day-undated' : `day-${section.dateKey}`;
    const dayTitle = section.dateKey === '' ? 'Undated' : section.dateKey;
    parts.push(
      `<section class="pkc-textlog-day" id="${escapeForAttr(dayId)}" data-pkc-date-key="${escapeForAttr(section.dateKey)}">`,
      '<header class="pkc-textlog-day-header">',
      `<h2 class="pkc-textlog-day-title">${escapeForHtml(dayTitle)}</h2>`,
      '</header>',
    );

    for (const log of section.logs) {
      const importantAttr = log.flags.includes('important')
        ? ' data-pkc-log-important="true"'
        : '';
      const resolved = resolveAssetSource(log.bodySource ?? '', container);
      const logHtml = renderMarkdown(resolved) || '';
      const flagMark = log.flags.includes('important')
        ? '<span class="pkc-textlog-log-flag" aria-label="important">★</span>'
        : '';

      parts.push(
        `<article class="pkc-textlog-log" id="log-${escapeForAttr(log.id)}" data-pkc-log-id="${escapeForAttr(log.id)}" data-pkc-lid="${escapeForAttr(entry.lid)}"${importantAttr}>`,
        '<header class="pkc-textlog-log-header">',
        flagMark,
        `<span class="pkc-textlog-timestamp" title="${escapeForAttr(log.createdAt)}">${escapeForHtml(formatLogTimestampWithSeconds(log.createdAt))}</span>`,
        '</header>',
        `<div class="pkc-textlog-text pkc-md-rendered">${logHtml}</div>`,
        '</article>',
      );
    }

    parts.push('</section>');
  }

  parts.push('</div>');
  return parts.join('');
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

/**
 * Produce a safe download filename: `<slug>-<yyyymmdd>.<ext>.html`.
 *
 * `slug` is derived from the entry title (alphanumerics + hyphens,
 * ASCII-only) with a `untitled` fallback. Non-ASCII titles get
 * collapsed to an empty slug and fall back to the lid + archetype
 * tail so downloads from Japanese / CJK titles still produce usable
 * filenames.
 *
 * `.textlog.html` / `.text.html` makes the archetype obvious to
 * downstream tooling (e.g. an importer keyed on filename extension).
 */
function buildDownloadFilename(entry: Entry, exportedAtIso: string): string {
  const date = isoToDateStamp(exportedAtIso);
  const slug = slugifyTitle(entry.title || '');
  const body = slug || entry.lid || 'untitled';
  const kind = entry.archetype === 'textlog' ? 'textlog' : 'text';
  return `${body}-${date}.${kind}.html`;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isoToDateStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '00000000';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${y}${pad(m)}${pad(day)}`;
}

function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeForAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
