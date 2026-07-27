/** @vitest-environment happy-dom */
/**
 * chart.js を boot で評価しない(B7、2026-07-27)。
 *
 * 実測の経緯: 重量 dep の module body に評価マーカーを仕込んだ build を作り、
 * 起動直後に読んだところ **`{"chartjs":2}`** ── chart を 1 枚も描いていないのに
 * 評価済みだった。同じ計測で mermaid / pptxgenjs / exceljs / docx は
 * 出てこないので、この bundle(rolldown + inlineDynamicImports)では
 * **dynamic import は評価まで遅延する**。chart.js だけが値 import で
 * 取り残されていた、というのが直した中身である。
 *
 * ここで pin するのは 2 つ:
 *  1. **source 上に値 import が無い**(型だけ)── 戻ると boot 評価も戻る
 *  2. **presenter を import しただけでは chart.js が評価されない**(実行時)
 *
 * 1 だけだと「別ファイル経由で値 import が復活」を見逃すので、2 を併せて持つ。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src/adapter/ui/spreadsheet-presenter.ts');

describe('chart.js の遅延評価', () => {
  it('spreadsheet-presenter は chart.js を型としてしか import しない', () => {
    const src = readFileSync(SRC, 'utf8');
    const importsOfChartJs = src.match(/^import\s+(type\s+)?[^;]*?from 'chart\.js';$/gm) ?? [];
    expect(importsOfChartJs.length).toBeGreaterThan(0); // 型 import は在る
    for (const stmt of importsOfChartJs) {
      expect(stmt, `値 import が復活している: ${stmt}`).toMatch(/^import type /);
    }
    // 遅延読み込みの本体が在ること(型だけにして loader を消す事故を防ぐ)
    expect(src).toContain("import('chart.js')");
    // register は loader の中(初回読み込み時)にしか無い
    expect(src).toContain('mod.Chart.register(');
  });

  it('presenter を import しただけでは chart.js は評価されない', async () => {
    const mod = await import('../../src/adapter/ui/spreadsheet-presenter');
    expect(mod.__chartJsLoaded()).toBe(false);
  });
});
