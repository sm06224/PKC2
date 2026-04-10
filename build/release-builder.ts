/**
 * release-builder: Stage 2 of the PKC2 build pipeline.
 *
 * Takes Vite's bundle output (dist/bundle.js, dist/bundle.css)
 * and inlines them into shell.html to produce dist/pkc2.html.
 *
 * Generates pkc-meta with:
 * - app identity, semver, schema version
 * - release kind (dev/stage/product via PKC_KIND env)
 * - 14-digit timestamp version
 * - build provenance (git commit)
 * - code integrity (SHA-256 of bundle.js)
 * - capability list
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import { computeGitStamp } from './git-stamp';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DIST = resolve(ROOT, 'dist');
const SHELL = resolve(ROOT, 'build', 'shell.html');

// Source-side constants (mirrored from src/runtime/release-meta.ts)
const APP_ID = 'pkc2';
const SCHEMA_VERSION = 1;
const CAPABILITIES = ['core', 'idb', 'export'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildTimestamp14(): string {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function computeSha256(content: string): string {
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${hash}`;
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

  // Build metadata
  const kind = process.env.PKC_KIND ?? 'dev';
  const timestamp = buildTimestamp14();
  const build_at = new Date().toISOString();
  const source_commit = computeGitStamp();
  const code_integrity = computeSha256(js);

  const meta = {
    app: APP_ID,
    version: pkg.version,
    schema: SCHEMA_VERSION,
    kind,
    timestamp,
    build_at,
    source_commit,
    code_integrity,
    capabilities: CAPABILITIES,
  };

  const metaJson = JSON.stringify(meta, null, 2);

  // Read shell template and replace placeholders
  let html = readFileSync(SHELL, 'utf8');
  html = html.replace('{{APP}}', APP_ID);
  html = html.replace('{{VERSION}}', pkg.version);
  html = html.replace('{{SCHEMA}}', String(SCHEMA_VERSION));
  html = html.replace('{{TIMESTAMP}}', timestamp);
  html = html.replace('{{KIND}}', kind);
  html = html.replace('{{STYLES}}', () => css);
  html = html.replace('{{META}}', () => metaJson);
  html = html.replace('{{CORE}}', () => js);

  if (!existsSync(DIST)) {
    mkdirSync(DIST, { recursive: true });
  }

  const outPath = resolve(DIST, 'pkc2.html');
  writeFileSync(outPath, html, 'utf8');

  console.log(`✓ ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
  console.log(`  version: ${pkg.version}-${kind}+${timestamp}`);
  console.log(`  schema:  ${SCHEMA_VERSION}`);
  console.log(`  commit:  ${source_commit}`);
  console.log(`  integrity: ${code_integrity.slice(0, 20)}...`);
}

main();
