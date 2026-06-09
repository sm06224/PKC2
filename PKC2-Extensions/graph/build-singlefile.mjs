/**
 * Post-build single-file packager.
 *
 * Reads the Vite lib output (`dist/graph.js` IIFE + the extracted CSS) and
 * emits a single self-contained `pkc2-graph.html` with the CSS in a `<style>`
 * and the JS in a **classic** `<script>` (NOT `type="module"`). A classic
 * script runs when the HTML is injected via `document.write` (the launcher /
 * "Open in New Window" path) on every browser, including Firefox.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const dist = resolve(dir, 'dist');

const files = readdirSync(dist);
const cssFile = files.find((f) => f.endsWith('.css'));

const js = readFileSync(resolve(dist, 'graph.js'), 'utf8')
  // A literal </script> inside the bundle would close the tag early.
  .replace(/<\/script>/gi, '<\\/script>');
const css = cssFile ? readFileSync(resolve(dist, cssFile), 'utf8') : '';

const html = `<!doctype html>
<html lang="ja" data-pkc-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PKC2 Graph — Extension</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="graph-root"></div>
    <script>
${js}
    </script>
  </body>
</html>
`;

const out = resolve(dir, 'pkc2-graph.html');
writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`wrote ${out} (${kb} KB, single-file, classic script)`);
