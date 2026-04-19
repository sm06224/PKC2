#!/usr/bin/env node
/*
 * Minimal static server for the Tier 3-2 Playwright smoke baseline.
 *
 * Why hand-rolled: Playwright's webServer needs a deterministic
 * "up" signal, and `npx http-server dist` was observed returning
 * 404 during Playwright's port-warmup race. A ~40-line Node http
 * server starts synchronously and is bit-exact reproducible in
 * CI. Kept .cjs so it runs without a TS loader.
 *
 * Scope: development-only tooling. Not bundled, not referenced
 * by production code.
 */

'use strict';

const http = require('node:http');
const { readFile, stat } = require('node:fs/promises');
const { resolve, extname } = require('node:path');

// Search roots in priority order. `dist/` is the main PKC2 artifact
// location (`pkc2.html`). `PKC2-Extensions/` carries the official
// manual artifact (`pkc2-manual.html`). Serving both lets the
// Playwright smoke exercise `/pkc2.html` AND `/pkc2-manual.html`
// from a single webServer without having to duplicate files.
const DIST_ROOT = resolve(__dirname, '..', 'dist');
const EXT_ROOT = resolve(__dirname, '..', 'PKC2-Extensions');
const ROOTS = [DIST_ROOT, EXT_ROOT];
const PORT = Number(process.env.PKC2_SMOKE_PORT || 4173);
const HOST = process.env.PKC2_SMOKE_HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function resolveFile(relative) {
  for (const root of ROOTS) {
    const candidate = resolve(root, '.' + relative);
    // Guard against escaping any root via `..`.
    if (!candidate.startsWith(root)) continue;
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // not in this root — try next
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  // Strip query / hash. The smoke tests fetch /pkc2.html and
  // /pkc2-manual.html; fancy routing is not needed.
  const urlPath = (req.url ?? '/').split('?')[0].split('#')[0];
  const relative = urlPath === '/' ? '/pkc2.html' : urlPath;

  const filePath = await resolveFile(relative);
  if (!filePath) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[smoke-serve] listening on http://${HOST}:${PORT} (roots: ${ROOTS.join(', ')})`);
});
