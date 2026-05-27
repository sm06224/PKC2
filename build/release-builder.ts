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
import { gzipSync } from 'zlib';
import { computeGitStamp } from './git-stamp';
import { buildAboutEntry } from './about-entry-builder';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DIST = resolve(ROOT, 'dist');
const SHELL = resolve(ROOT, 'build', 'shell.html');

// Favicon 差し替えポイント:`build/favicon.{svg,png,ico}` のいずれかに置けば
// release-builder が拾って data URI inline する。優先順は modern format 優先で
// svg > png > ico(svg は最小サイズ + crisp、png は alpha 対応 + 互換、ico は
// legacy / Windows 向け fallback)。iOS Safari ホーム画面アイコンは PNG 推奨
// なので、別ファイル `build/apple-touch-icon.png` を任意で同伴可能。
const FAVICON_CANDIDATES: { path: string; mime: string }[] = [
  { path: resolve(ROOT, 'build', 'favicon.svg'), mime: 'image/svg+xml' },
  { path: resolve(ROOT, 'build', 'favicon.png'), mime: 'image/png' },
  { path: resolve(ROOT, 'build', 'favicon.ico'), mime: 'image/x-icon' },
];
const APPLE_TOUCH_ICON = resolve(ROOT, 'build', 'apple-touch-icon.png');

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

  // pgc-53: CSS / JS 本体を gzip+base64 化して shell へ埋め込む。plain
  // inline 比で初期ダウンロードサイズが約 1/3 に縮む(展開は shell の
  // pkc-loader が DecompressionStream で行う)。code_integrity は従来
  // どおり未圧縮 js の SHA-256(loader 展開後の pkc-core 内容と一致)。
  const cssGzB64 = gzipSync(Buffer.from(css, 'utf8'), { level: 9 }).toString('base64');
  const jsGzB64 = gzipSync(Buffer.from(js, 'utf8'), { level: 9 }).toString('base64');

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

  // Build the __about__ entry and inject as pkc-data
  const aboutEntry = buildAboutEntry(pkg, build_at, source_commit);
  const pkcData = JSON.stringify({ container: {
    meta: {
      container_id: 'default',
      schema_version: SCHEMA_VERSION,
      title: 'PKC2',
      created_at: build_at,
      updated_at: build_at,
    },
    entries: [aboutEntry],
    relations: [],
    revisions: [],
    assets: {},
  }});

  // Build favicon + apple-touch-icon <link> tags. Single-HTML deliverable は
  // 外部参照不可のため必ず data URI inline。FAVICON_CANDIDATES の優先順で
  // 1 件採用、不在なら link tag なし。apple-touch-icon は iOS ホーム画面用に
  // 任意で別 PNG を embed(無ければ favicon の方を iOS が使うので必須ではない)。
  const faviconLinks: string[] = [];
  for (const cand of FAVICON_CANDIDATES) {
    if (!existsSync(cand.path)) continue;
    const buf = readFileSync(cand.path);
    const b64 = buf.toString('base64');
    faviconLinks.push(`<link rel="icon" type="${cand.mime}" href="data:${cand.mime};base64,${b64}">`);
    console.log(`  favicon: ${cand.path.replace(ROOT + '/', '')} (${(buf.length / 1024).toFixed(1)} KB → +${((b64.length) / 1024).toFixed(1)} KB inlined)`);
    break;  // 最優先 1 件のみ採用
  }
  if (existsSync(APPLE_TOUCH_ICON)) {
    const buf = readFileSync(APPLE_TOUCH_ICON);
    const b64 = buf.toString('base64');
    faviconLinks.push(`<link rel="apple-touch-icon" href="data:image/png;base64,${b64}">`);
    console.log(`  apple-touch-icon: build/apple-touch-icon.png (${(buf.length / 1024).toFixed(1)} KB → +${((b64.length) / 1024).toFixed(1)} KB inlined)`);
  }
  const faviconLink = faviconLinks.join('\n  ');

  // PWA manifest(窓の杜 2026-05-26 記事 / Chrome 148+ origin trial `<install>` 要素):
  // 同一 origin のとき manifest の `id` field のみで browser が trusted install
  // button を描画。PKC2 は単一 HTML deliverable なので manifest を data URL で
  // inline、icons は favicon を data URL 経由で再利用。`id` は PKC2 固有の安定
  // identifier(version 不変、PWA install の一意性に使う)。Single-HTML PWA は
  // origin が serving context 依存(file:// / localhost / HTTPS)のため origin
  // trial token は同梱せず、user が Chrome flag `chrome://flags/#install-element`
  // を enable する想定。
  let firstFaviconDataUrl: string | null = null;
  let firstFaviconMime: string | null = null;
  for (const cand of FAVICON_CANDIDATES) {
    if (!existsSync(cand.path)) continue;
    const buf = readFileSync(cand.path);
    const b64 = buf.toString('base64');
    firstFaviconDataUrl = `data:${cand.mime};base64,${b64}`;
    firstFaviconMime = cand.mime;
    break;
  }
  const manifest: Record<string, unknown> = {
    id: 'pkc2-personal-knowledge-container',
    name: 'PKC2 — Personal Knowledge Container',
    short_name: 'PKC2',
    description: '単一 HTML PWA。Markdown / Todo / Calendar / Kanban / Graph view を統合した personal knowledge container 第 2 世代。',
    start_url: '.',
    scope: './',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#0d0f0a',
    background_color: '#0d0f0a',
    lang: 'ja',
    dir: 'ltr',
    categories: ['productivity', 'utilities'],
  };
  if (firstFaviconDataUrl && firstFaviconMime) {
    manifest.icons = [
      {
        src: firstFaviconDataUrl,
        sizes: 'any',
        type: firstFaviconMime,
        purpose: 'any maskable',
      },
    ];
  }
  const manifestJson = JSON.stringify(manifest);
  const manifestB64 = Buffer.from(manifestJson, 'utf8').toString('base64');
  const manifestLink = `<link rel="manifest" href="data:application/manifest+json;base64,${manifestB64}">`;
  console.log(`  manifest: pkc2 PWA manifest (id=${manifest.id}, ${manifestJson.length} bytes → +${(manifestB64.length / 1024).toFixed(1)} KB inlined)`);

  // Read shell template and replace placeholders
  let html = readFileSync(SHELL, 'utf8');
  html = html.replace('{{APP}}', APP_ID);
  html = html.replace('{{VERSION}}', pkg.version);
  html = html.replace('{{SCHEMA}}', String(SCHEMA_VERSION));
  html = html.replace('{{TIMESTAMP}}', timestamp);
  html = html.replace('{{KIND}}', kind);
  html = html.replace('{{FAVICON_LINK}}', () => faviconLink);
  html = html.replace('{{MANIFEST_LINK}}', () => manifestLink);
  html = html.replace('{{PKC_DATA}}', () => pkcData);
  html = html.replace('{{STYLES_GZ}}', () => cssGzB64);
  html = html.replace('{{META}}', () => metaJson);
  html = html.replace('{{CORE_GZ}}', () => jsGzB64);

  if (!existsSync(DIST)) {
    mkdirSync(DIST, { recursive: true });
  }

  const outPath = resolve(DIST, 'pkc2.html');
  writeFileSync(outPath, html, 'utf8');

  console.log(`✓ ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
  console.log(`  payload: js ${(js.length / 1024).toFixed(0)}→${(jsGzB64.length / 1024).toFixed(0)} KB, `
    + `css ${(css.length / 1024).toFixed(0)}→${(cssGzB64.length / 1024).toFixed(0)} KB (gzip+base64)`);
  console.log(`  version: ${pkg.version}-${kind}+${timestamp}`);
  console.log(`  schema:  ${SCHEMA_VERSION}`);
  console.log(`  commit:  ${source_commit}`);
  console.log(`  integrity: ${code_integrity.slice(0, 20)}...`);
}

main();
