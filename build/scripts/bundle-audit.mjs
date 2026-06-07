// bundle-audit.mjs — 機能単位の bundle 寄与 KB 棚卸し(L1 #767)
//
// 目的: dist/bundle.js(IIFE single bundle)を「どのソース/dep が何 KB か」に
// 分解し、subtract(L2 #763)の意思決定材料にする。
//
// 計測手段: esbuild の metafile(bytesInOutput = 各 input が minified output に
// 寄与する実バイト数)。本番ビルドは Vite+terser(2-pass, toplevel mangle)だが、
// esbuild は IIFE で dynamic import を inline する(= 本番の inlineDynamicImports:true
// と同じ単一 bundle 構成)。絶対値は terser と ~10-20% ずれるが、機能間の
// 相対寄与(=何を削れば効くか)は正確に取れる。これは subtract 判断に十分。
//
// usage: node build/scripts/bundle-audit.mjs [--json]
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, '../..');
const R = (p) => resolve(repo, p);

const result = await build({
  entryPoints: [R('src/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  write: false,
  metafile: true,
  logLevel: 'silent',
  alias: {
    '@core': R('src/core'),
    '@adapter': R('src/adapter'),
    '@features': R('src/features'),
    '@runtime': R('src/runtime'),
  },
  // CSS / assets は本番では bundle.js に入らない(cssCodeSplit:false → bundle.css)。
  // JS サイズ監査なので空ローダで除外。
  loader: {
    '.css': 'empty',
    '.svg': 'empty',
    '.png': 'empty',
    '.ico': 'empty',
    '.woff': 'empty',
    '.woff2': 'empty',
  },
  // Vite が注入する define 相当。無いと未定義参照になるだけでサイズ影響は微小だが、
  // ビルドを通すために最小限置く。
  define: {
    'import.meta.env.MODE': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
  },
});

const output = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]];
const inputs = output.inputs; // { path: { bytesInOutput } }
const total = output.bytes;

// --- 機能バケットへの分類 -------------------------------------------------
function bucketOf(path) {
  // node_modules → dep:<package>
  const nm = path.lastIndexOf('node_modules/');
  if (nm !== -1) {
    let rest = path.slice(nm + 'node_modules/'.length);
    let pkg;
    if (rest.startsWith('@')) {
      const parts = rest.split('/');
      pkg = parts[0] + '/' + parts[1];
    } else {
      pkg = rest.split('/')[0];
    }
    return { group: 'dep', bucket: `dep:${pkg}` };
  }
  // src/ → レイヤ/機能フォルダ
  const si = path.indexOf('src/');
  if (si !== -1) {
    const rel = path.slice(si + 'src/'.length);
    const parts = rel.split('/');
    // features/<feat>/, adapter/<sub>/, core/, runtime/
    let bucket;
    if (parts[0] === 'features') {
      bucket = parts.length > 2 ? `src:features/${parts[1]}` : `src:features/(root)`;
    } else if (parts[0] === 'adapter') {
      bucket = parts.length > 2 ? `src:adapter/${parts[1]}` : `src:adapter/(root)`;
    } else {
      bucket = `src:${parts[0]}`;
    }
    return { group: 'src', bucket };
  }
  return { group: 'other', bucket: `other:${path}` };
}

const buckets = new Map();
let depTotal = 0;
let srcTotal = 0;
for (const [path, info] of Object.entries(inputs)) {
  const b = bucketOf(path);
  buckets.set(b.bucket, (buckets.get(b.bucket) || 0) + info.bytesInOutput);
  if (b.group === 'dep') depTotal += info.bytesInOutput;
  else if (b.group === 'src') srcTotal += info.bytesInOutput;
}

const rows = [...buckets.entries()]
  .map(([bucket, bytes]) => ({ bucket, kb: bytes / 1024, pct: (bytes / total) * 100 }))
  .sort((a, b) => b.kb - a.kb);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ totalKB: total / 1024, depKB: depTotal / 1024, srcKB: srcTotal / 1024, rows }, null, 2));
} else {
  console.log(`\n=== bundle audit (esbuild metafile, minified) ===`);
  console.log(`total output: ${(total / 1024).toFixed(1)} KB`);
  console.log(`  deps (node_modules): ${(depTotal / 1024).toFixed(1)} KB (${((depTotal / total) * 100).toFixed(1)}%)`);
  console.log(`  app  (src):          ${(srcTotal / 1024).toFixed(1)} KB (${((srcTotal / total) * 100).toFixed(1)}%)`);
  console.log(`\n  KB     %     bucket`);
  console.log(`  -----  ----  ------`);
  for (const r of rows) {
    if (r.kb < 1) continue; // <1KB は省略
    console.log(`  ${r.kb.toFixed(1).padStart(5)}  ${r.pct.toFixed(1).padStart(4)}  ${r.bucket}`);
  }
}
