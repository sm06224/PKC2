/**
 * @vitest-environment happy-dom
 *
 * pgc-204 wave-α' polish #25(Gap-13 closure):S4 entry-window の inline
 * `<style>` に base.css の critical PKC dialect CSS が mirror されている
 * ことを verify する parity test。pgc-203 で着地した mermaid 4 rule +
 * `data-pkc-blank-count="26"|"27"|"28"|"29"|"35"|"45"` の 6 variant の
 * mirror 漏れを closure する。
 *
 * test 方針:文字列 grep ベースで base.css と entry-window.ts inline style
 * を比較、specified selector の存在を確認。実 DOM render は popup 経由
 * のため別 visual parity test(pgc-205+ で計画)。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const baseCss = readFileSync(resolve(ROOT, 'src/styles/base.css'), 'utf8');
const entryWindow = readFileSync(resolve(ROOT, 'src/adapter/ui/entry-window.ts'), 'utf8');

describe('pgc-204 Gap-13 closure: S4 inline CSS parity', () => {
  it('case 1: mermaid 4 rule(.pkc-mermaid-placeholder / .pkc-mermaid-source / .pkc-mermaid-rendered / .pkc-mermaid-error)が S4 inline style に mirror', () => {
    const requiredRules = [
      '.pkc-mermaid-placeholder',
      '.pkc-mermaid-source',
      '.pkc-mermaid-rendered',
      '.pkc-mermaid-error',
    ];
    for (const rule of requiredRules) {
      expect(baseCss).toContain(rule);
      expect(entryWindow).toContain(rule);
    }
  });

  it('case 2: .pkc-mermaid-rendered svg child selector も mirror(max-width: 100%)', () => {
    expect(baseCss).toMatch(/\.pkc-mermaid-rendered svg/);
    expect(entryWindow).toMatch(/\.pkc-mermaid-rendered svg/);
  });

  it('case 3: blank-line variants 26-29 / 35 / 45 が S4 にも存在(base.css と完全 parity)', () => {
    const variants = ['26', '27', '28', '29', '35', '45'];
    for (const n of variants) {
      const selector = `pkc-blank-count="${n}"`;
      expect(baseCss).toContain(selector);
      expect(entryWindow).toContain(selector);
    }
  });

  it('case 4: existing blank-line variants(2-25 / 30 / 40 / 50)は不変(後方互換)', () => {
    const existing = ['2', '3', '4', '5', '10', '15', '20', '25', '30', '40', '50'];
    for (const n of existing) {
      const selector = `pkc-blank-count="${n}"`;
      expect(entryWindow).toContain(selector);
    }
  });

  it('case 5: S4 inline style に theme-dependent var() reference が含まれる(--c-bg / --c-fg-dim / --c-border 等)', () => {
    // mermaid CSS は var(--c-bg) / var(--c-fg-dim) / var(--c-border) /
    // var(--c-surface) / var(--radius-sm) / var(--space-*) を使用
    const requiredVars = [
      'var(--c-bg)',
      'var(--c-fg-dim)',
      'var(--c-border)',
      'var(--c-surface)',
      'var(--space-1)',
      'var(--space-2)',
    ];
    for (const v of requiredVars) {
      expect(entryWindow).toContain(v);
    }
  });

  it('case 6: mermaid error rule の visual:red tint + border-left 3px solid #e53e3e が両 surface で一致', () => {
    // base.css と entry-window で同じ visual contract を維持
    expect(baseCss).toContain('border-left: 3px solid #e53e3e');
    expect(entryWindow).toContain('border-left: 3px solid #e53e3e');
    expect(baseCss).toMatch(/rgba\(229,\s*62,\s*62,\s*0\.12\)/);
    expect(entryWindow).toMatch(/rgba\(229,\s*62,\s*62,\s*0\.12\)/);
  });
});
