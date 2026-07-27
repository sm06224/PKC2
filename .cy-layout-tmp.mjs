/** Layout-arm comparison: which cytoscape layouts are viable at PKC2 scale. */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const R = '/home/user/PKC2/node_modules/';
const files = [
  R + 'cytoscape-fcose/node_modules/layout-base/layout-base.js',
  R + 'cytoscape-fcose/node_modules/cose-base/cose-base.js',
  R + 'cytoscape/dist/cytoscape.min.js',
  R + 'cytoscape-fcose/cytoscape-fcose.js',
];

const browser = await chromium.launch({
  executablePath: process.env.PKC_PRE_INSTALLED_CHROMIUM,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent('<div id="cy" style="width:1900px;height:1000px"></div>');
for (const f of files) await page.addScriptTag({ content: readFileSync(f, 'utf8') });
await page.evaluate(() => window.cytoscape.use(window.cytoscapeFcose));

const ARMS = [
  ['grid', { name: 'grid', animate: false }],
  ['breadthfirst', { name: 'breadthfirst', animate: false }],
  ['concentric', { name: 'concentric', animate: false }],
  ['circle', { name: 'circle', animate: false }],
  ['cose(builtin)', { name: 'cose', animate: false, numIter: 1000 }],
  ['fcose:draft', { name: 'fcose', quality: 'draft', animate: false, randomize: true }],
  ['fcose:default', { name: 'fcose', quality: 'default', animate: false, randomize: true }],
  ['fcose:proof', { name: 'fcose', quality: 'proof', animate: false, randomize: true }],
];

for (const n of (process.argv[2] || '1000').split(',').map(Number)) {
  for (const [label, opts] of ARMS) {
    const r = await page.evaluate(async ({ n, opts, label }) => {
      const els = [];
      for (let i = 0; i < n; i++) els.push({ data: { id: 'n' + i, label: 'エントリ ' + i } });
      let e = 0;
      for (let i = 1; i < n; i++) els.push({ data: { id: 'e' + e++, source: 'n' + ((i / 8) | 0), target: 'n' + i } });
      for (let i = 0; i < (n * 0.3) | 0; i++) els.push({ data: { id: 'e' + e++, source: 'n' + ((i * 7919) % n), target: 'n' + ((i * 104729) % n) } });

      const c = document.getElementById('cy');
      if (window.__cy) window.__cy.destroy();
      c.innerHTML = '';
      const cy = window.cytoscape({
        container: c, elements: els, layout: { name: 'null' },
        style: [{ selector: 'node', style: { label: 'data(label)', 'font-size': 10, width: 20, height: 20 } },
                { selector: 'edge', style: { width: 1, 'curve-style': 'haystack' } }],
        textureOnViewport: true, hideEdgesOnViewport: true, pixelRatio: 1,
      });
      window.__cy = cy;
      const t = performance.now();
      let timedOut = false;
      await Promise.race([
        new Promise((res) => { const l = cy.layout(opts); l.one('layoutstop', res); l.run(); }),
        new Promise((res) => setTimeout(() => { timedOut = true; res(); }, 60000)),
      ]);
      return { n, label, ms: timedOut ? -1 : +(performance.now() - t).toFixed(0) };
    }, { n, opts, label });
    process.stdout.write(`n=${String(r.n).padStart(5)}  ${r.label.padEnd(15)} ${r.ms < 0 ? '>60000 (timeout)' : r.ms + ' ms'}\n`);
  }
  process.stdout.write('\n');
}
await browser.close();
