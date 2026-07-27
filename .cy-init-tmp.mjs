/**
 * Cost of *evaluating* the cytoscape module (the boot-time risk if PKC2 core
 * takes a top-level static `import cytoscape from 'cytoscape'` instead of a
 * deferred `await import(...)` like mermaid-renderer.ts does).
 *
 * Control: same page, same browser, script text already in memory (parse+exec
 * only) — no network. Measured 5x, median reported.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const CY = readFileSync('/home/user/PKC2/node_modules/cytoscape/dist/cytoscape.min.js', 'utf8');
const FCOSE = readFileSync('/home/user/PKC2/node_modules/cytoscape-fcose/cytoscape-fcose.js', 'utf8');

const browser = await chromium.launch({
  executablePath: process.env.PKC_PRE_INSTALLED_CHROMIUM,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
});

for (const [label, src] of [['cytoscape.min.js', CY], ['cytoscape-fcose.js', FCOSE]]) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const page = await browser.newPage();
    await page.setContent('<div></div>');
    const ms = await page.evaluate((code) => {
      const m0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const t = performance.now();
      // eslint-disable-next-line no-new-func
      new Function(code)();
      const d = performance.now() - t;
      const m1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      return { d, heap: (m1 - m0) / 1048576 };
    }, src);
    samples.push(ms);
    await page.close();
  }
  samples.sort((a, b) => a.d - b.d);
  const med = samples[2];
  console.log(
    `${label.padEnd(22)} eval median=${med.d.toFixed(1)}ms  heapΔ=${med.heap.toFixed(1)}MB  ` +
    `(all: ${samples.map((s) => s.d.toFixed(0)).join(', ')} ms)`,
  );
}
await browser.close();
