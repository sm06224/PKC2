/**
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-03「フィルターや凡例も
 * 弱い」)で追加した chart filter expression evaluator の gate。
 *
 * 構文:`{col letter}{op}{value}`、op = `>` `<` `>=` `<=` `=` `<>`。
 */

import { describe, it, expect } from 'vitest';
import { evalChartFilter } from '@features/spreadsheet/spreadsheet-body';

describe('evalChartFilter', () => {
  it('case 1: filter 空 / undefined → 全 row 採用', () => {
    expect(evalChartFilter(undefined, ['a', 'b'])).toBe(true);
    expect(evalChartFilter('', ['a', 'b'])).toBe(true);
    expect(evalChartFilter('   ', ['a', 'b'])).toBe(true);
  });

  it('case 2: B>10 で数値比較', () => {
    expect(evalChartFilter('B>10', ['x', '15'])).toBe(true);
    expect(evalChartFilter('B>10', ['x', '5'])).toBe(false);
    expect(evalChartFilter('B>10', ['x', '10'])).toBe(false);
  });

  it('case 3: B>=10 / B<=10 の境界', () => {
    expect(evalChartFilter('B>=10', ['x', '10'])).toBe(true);
    expect(evalChartFilter('B>=10', ['x', '9'])).toBe(false);
    expect(evalChartFilter('B<=10', ['x', '10'])).toBe(true);
    expect(evalChartFilter('B<=10', ['x', '11'])).toBe(false);
  });

  it('case 4: A=foo / A<>foo の文字列比較', () => {
    expect(evalChartFilter('A=foo', ['foo', '5'])).toBe(true);
    expect(evalChartFilter('A=foo', ['bar', '5'])).toBe(false);
    expect(evalChartFilter('A<>foo', ['bar', '5'])).toBe(true);
    expect(evalChartFilter('A<>foo', ['foo', '5'])).toBe(false);
  });

  it('case 5: B=10 で両方数値の場合は数値比較', () => {
    expect(evalChartFilter('B=10', ['x', '10'])).toBe(true);
    expect(evalChartFilter('B=10', ['x', '10.0'])).toBe(true);
    expect(evalChartFilter('B=10', ['x', '11'])).toBe(false);
  });

  it('case 6: 列範囲外 → 全採用 fallback', () => {
    expect(evalChartFilter('Z>0', ['x', '5'])).toBe(true);
  });

  it('case 7: 不正 syntax → 全採用 fallback', () => {
    expect(evalChartFilter('garbage', ['x', '5'])).toBe(true);
    expect(evalChartFilter('B', ['x', '5'])).toBe(true);
    expect(evalChartFilter('B>>10', ['x', '5'])).toBe(true);
  });

  it('case 8: 小数値で比較', () => {
    expect(evalChartFilter('B>3.14', ['x', '3.15'])).toBe(true);
    expect(evalChartFilter('B>3.14', ['x', '3.13'])).toBe(false);
  });

  it('case 9: 負値で比較', () => {
    expect(evalChartFilter('B>-5', ['x', '-3'])).toBe(true);
    expect(evalChartFilter('B>-5', ['x', '-10'])).toBe(false);
  });

  it('case 10: 多列 row(A=foo + C>10)で個別列が独立に評価される', () => {
    expect(evalChartFilter('C>10', ['foo', 'bar', '15'])).toBe(true);
    expect(evalChartFilter('A=foo', ['foo', 'bar', '15'])).toBe(true);
    expect(evalChartFilter('A=foo', ['notfoo', 'bar', '15'])).toBe(false);
  });
});
