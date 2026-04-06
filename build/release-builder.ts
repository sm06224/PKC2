/**
 * release-builder: Stage 2 of the PKC2 build pipeline.
 * Takes Vite's bundle output (dist/bundle.js, dist/bundle.css)
 * and inlines them into shell.html to produce dist/pkc2.html.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DIST = resolve(ROOT, 'dist');
const SHELL = resolve(ROOT, 'build', 'shell.html');

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function main(): void {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

  // Read Vite bundle outputs
  const jsPath = resolve(DIST, 'bundle.js');
  const cssPath = resolve(DIST, 'bundle.css');

  if (!existsSync(jsPath)) {
    console.error('ERROR: dist/bundle.js not found. Run build:bundle first.');
    process.exit(1);
  }

  const js = readFileSync(jsPath, 'utf8');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

  const kind = process.env.PKC_KIND ?? 'dev';
  const build_at = buildTimestamp();

  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // not in a git repo or git not available
  }

  const meta = JSON.stringify({
    version: pkg.version,
    schema: 1,
    build_at,
    kind,
    code_integrity: '',  // TODO: SHA-256 hash of JS
    source_commit: commit,
  }, null, 2);

  // Read shell template and replace placeholders
  let html = readFileSync(SHELL, 'utf8');
  html = html.replace('{{VERSION}}', pkg.version);
  html = html.replace('{{SCHEMA}}', '1');
  html = html.replace('{{BUILD_AT}}', build_at);
  html = html.replace('{{KIND}}', kind);
  html = html.replace('{{STYLES}}', css);
  html = html.replace('{{META}}', meta);
  html = html.replace('{{CORE}}', js);

  if (!existsSync(DIST)) {
    mkdirSync(DIST, { recursive: true });
  }

  const outPath = resolve(DIST, 'pkc2.html');
  writeFileSync(outPath, html, 'utf8');
  console.log(`✓ ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
}

main();
