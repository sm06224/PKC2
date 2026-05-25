/**
 * @vitest-environment happy-dom
 *
 * pgc-212 follow-up to pgc-208(selection-only render scope bug fix):
 * pgc-208 で selection-only branch を追加した際、`applyWcagResolverNow` の
 * call が抜けていた。新 entry の center / meta content に WCAG AA(4.5:1)
 * 未達の color 組合せが含まれる場合、`theme.wcag_auto_shift` flag(default
 * ON)による補正が走らない bug。
 *
 * Fix:selection-only branch にも `applyWcagResolverNow(root)` を `render`
 * 直後に call(full branch と同位置)。
 *
 * test 方針:source string grep で structural guard。実 OS でない resolver
 * 効果は wcag-runtime.test.ts 系で別 cover。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const mainTs = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8');

describe('pgc-212 selection-only path で applyWcagResolverNow を call(pgc-208 bug fix)', () => {
  it('case 1: selection-only branch 内に applyWcagResolverNow(root) call が存在', () => {
    const branchIdx = mainTs.indexOf("if (renderScope === 'selection-only')");
    expect(branchIdx).toBeGreaterThan(-1);
    // branch 終端は最初の `return;` 行(if block の closing 直前)
    const branchEnd = mainTs.indexOf('return;', branchIdx);
    expect(branchEnd).toBeGreaterThan(branchIdx);
    const branchBody = mainTs.slice(branchIdx, branchEnd);
    expect(branchBody).toMatch(/applyWcagResolverNow\(root\)/);
  });

  it('case 2: applyWcagResolverNow(root) call は render の直後・restoreRenderContinuity の直前(順序保持)', () => {
    const branchIdx = mainTs.indexOf("if (renderScope === 'selection-only')");
    const branchEnd = mainTs.indexOf('return;', branchIdx);
    const branchBody = mainTs.slice(branchIdx, branchEnd);
    // 行頭 indent 込みで literal call statement を検出(comment 内の同 identifier
    // を除外)。行頭は 6 spaces(if 内 indent)。
    const renderIdx = branchBody.indexOf('      render(state, root, prevRenderState);');
    const wcagIdx = branchBody.indexOf('      applyWcagResolverNow(root);');
    const restoreIdx = branchBody.indexOf('      restoreRenderContinuity(root, continuity);');
    expect(renderIdx).toBeGreaterThan(-1);
    expect(wcagIdx).toBeGreaterThan(renderIdx);
    expect(restoreIdx).toBeGreaterThan(wcagIdx);
  });

  it('case 3: full branch の `applyWcagResolverNow` call と同じ pattern', () => {
    // 全体に applyWcagResolverNow(root) が ≥2 箇所(full + selection-only)
    const matches = mainTs.match(/applyWcagResolverNow\(root\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
