/**
 * Cytoscape.js scale benchmark for PKC2 (read-only investigation).
 *
 * Fixture shape mirrors a PKC2 container graph: N entry nodes, ~1.3N relation
 * edges (structural folder tree + a sprinkle of semantic cross-links), labels
 * ON (PKC2 shows entry titles), archetype-coloured round nodes.
 *
 * Control group: identical element set + identical style for every renderer /
 * layout arm. Only the variable under test changes.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = '/home/user/PKC2';
const CY = readFileSync(resolve(ROOT, 'node_modules/cytoscape/dist/cytoscape.min.js'), 'utf8');
const FCOSE = readFileSync(resolve(ROOT, 'node_modules/cytoscape-fcose/cytoscape-fcose.js'), 'utf8');
const LAYOUT_BASE = readFileSync(resolve(ROOT, 'node_modules/cytoscape-fcose/node_modules/layout-base/layout-base.js'), 'utf8');
const COSE_BASE = readFileSync(resolve(ROOT, 'node_modules/cytoscape-fcose/node_modules/cose-base/cose-base.js'), 'utf8');

const SIZES = (process.argv[2]||'1000').split(',').map(Number);

const browser = await chromium.launch({
  executablePath: process.env.PKC_PRE_INSTALLED_CHROMIUM,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc','--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error') console.error('  [page error]', m.text()); });

await page.setContent('<div id="cy" style="width:1900px;height:1000px"></div>');
await page.addScriptTag({ content: LAYOUT_BASE });
await page.addScriptTag({ content: COSE_BASE });
await page.addScriptTag({ content: CY });
await page.addScriptTag({ content: FCOSE });
await page.evaluate(() => { window.cytoscape.use(window.cytoscapeFcose); });

const results = [];

for (const n of SIZES) {
  for (const arm of (process.argv[3]||'canvas+grid,canvas+fcose,webgl+grid').split(',')) {
    const r = await page.evaluate(async ({ n, arm }) => {
      const webgl = arm.startsWith('webgl');
      const layoutName = arm.endsWith('fcose') ? 'fcose' : 'grid';

      // ── fixture: PKC2-shaped ─────────────────────────────
      const els = [];
      const kinds = ['text', 'todo', 'folder', 'textlog', 'attachment'];
      for (let i = 0; i < n; i++) {
        els.push({ data: { id: 'n' + i, label: 'エントリ ' + i + ' タイトル', k: kinds[i % 5] } });
      }
      let e = 0;
      for (let i = 1; i < n; i++) {                       // structural tree
        els.push({ data: { id: 'e' + e++, source: 'n' + ((i / 8) | 0), target: 'n' + i, kind: 'structural' } });
      }
      for (let i = 0; i < (n * 0.3) | 0; i++) {           // semantic cross-links
        els.push({ data: { id: 'e' + e++, source: 'n' + ((i * 7919) % n), target: 'n' + ((i * 104729) % n), kind: 'semantic' } });
      }

      const style = [
        { selector: 'node', style: { 'background-color': '#6aa', label: 'data(label)', 'font-size': 10, width: 20, height: 20, shape: 'ellipse' } },
        { selector: 'node[k="folder"]', style: { 'background-color': '#fc6' } },
        { selector: 'node[k="todo"]', style: { 'background-color': '#f88' } },
        { selector: 'edge', style: { width: 1, 'line-color': '#a8c08a', 'curve-style': 'haystack' } },
      ];

      const container = document.getElementById('cy');
      if (window.__cy) { window.__cy.destroy(); }
      container.innerHTML = '';

      if (window.gc) window.gc();
      const memBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;

      // ── build (parse elements + graph model + first paint) ──
      const t0 = performance.now();
      const cy = window.cytoscape({
        container, elements: els, style, layout: { name: 'null' },
        renderer: webgl ? { name: 'canvas', webgl: true } : { name: 'canvas' },
        textureOnViewport: true, hideEdgesOnViewport: true, pixelRatio: 1,
      });
      const tBuild = performance.now() - t0;
      window.__cy = cy;

      // ── layout ──
      const t1 = performance.now();
      await new Promise((res) => {
        const lay = cy.layout(layoutName === 'fcose'
          ? { name: 'fcose', quality: 'default', animate: false, randomize: true, nodeDimensionsIncludeLabels: false }
          : { name: 'grid', animate: false });
        lay.one('layoutstop', res);
        lay.run();
      });
      const tLayout = performance.now() - t1;

      // ── redraw / interaction proxy: 12 forced pan+zoom frames ──
      await new Promise((r) => requestAnimationFrame(r));
      const frames = [];
      for (let i = 0; i < 12; i++) {
        const s = performance.now();
        cy.zoom(0.5 + (i % 4) * 0.12);
        cy.pan({ x: (i % 5) * 40, y: (i % 3) * 30 });
        await new Promise((r) => requestAnimationFrame(r));
        frames.push(performance.now() - s);
      }
      frames.sort((a, b) => a - b);
      const medFrame = frames[frames.length >> 1];

      const memAfter = performance.memory ? performance.memory.usedJSHeapSize : 0;

      return {
        n, arm, edges: e,
        buildMs: +tBuild.toFixed(1),
        layoutMs: +tLayout.toFixed(1),
        medFrameMs: +medFrame.toFixed(1),
        heapMB: +((memAfter - memBefore) / 1048576).toFixed(1),
        webglActive: webgl,
      };
    }, { n, arm });

    results.push(r);
    process.stdout.write(
      `n=${String(r.n).padStart(5)} edges=${String(r.edges).padStart(5)} ${r.arm.padEnd(12)} ` +
      `build=${String(r.buildMs).padStart(7)}ms layout=${String(r.layoutMs).padStart(8)}ms ` +
      `medFrame=${String(r.medFrameMs).padStart(6)}ms heapΔ=${String(r.heapMB).padStart(6)}MB\n`,
    );
  }
}

console.log('\nJSON:', JSON.stringify(results));
await browser.close();
