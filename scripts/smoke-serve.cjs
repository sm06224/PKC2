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

const ROOT = resolve(__dirname, '..', 'dist');
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

const server = http.createServer(async (req, res) => {
  // Strip query / hash, default to index-equivalent. The smoke test
  // only fetches /pkc2.html so we don't need fancy routing.
  const urlPath = (req.url ?? '/').split('?')[0].split('#')[0];
  const relative = urlPath === '/' ? '/pkc2.html' : urlPath;
  const filePath = resolve(ROOT, '.' + relative);

  // Guard against escaping ROOT.
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }

  try {
    const s = await stat(filePath);
    if (!s.isFile()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
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
  console.log(`[smoke-serve] listening on http://${HOST}:${PORT} (root: ${ROOT})`);
});
