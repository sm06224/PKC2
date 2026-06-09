/**
 * Post-build single-file packager.
 *
 * Reads the Vite `dist/` output and inlines the JS bundle into a
 * `<script type="module">` and the CSS into a `<style>`, producing a
 * single self-contained `pkc2-graph.html` — an iframe-embeddable,
 * portable artifact in the same shape as `PKC2-Extensions/pkc2-manual.html`.
 *
 * Run after `vite build` (wired as `npm run build:single`).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const dist = resolve(dir, 'dist');
const assetsDir = resolve(dist, 'assets');

let html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const files = readdirSync(assetsDir);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('no JS bundle found in dist/assets');

const js = readFileSync(resolve(assetsDir, jsFile), 'utf8')
  // Guard against a literal </script> inside the bundle terminating the tag.
  .replace(/<\/script>/gi, '<\\/script>');
const css = cssFile ? readFileSync(resolve(assetsDir, cssFile), 'utf8') : '';

// Inline CSS (drop the <link>).
html = html.replace(/\s*<link[^>]*rel="stylesheet"[^>]*>/i, css ? `\n    <style>\n${css}\n    </style>` : '');
// Inline JS (replace the module <script src>).
html = html.replace(
  /<script[^>]*src="[^"]*\.js"[^>]*><\/script>/i,
  `<script type="module">\n${js}\n</script>`,
);

const out = resolve(dir, 'pkc2-graph.html');
writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`wrote ${out} (${kb} KB, single-file)`);
