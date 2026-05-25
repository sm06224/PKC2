/**
 * @vitest-environment happy-dom
 *
 * pgc-210 Gap-10 reconciliation:
 * `docs/development/render-surface-parity-audit-2026-05.md` Gap-10 で
 * 「S2 inline CSS の 4 件 mirror 不足」 と記載されていたが、過去 PR-2L /
 * PR-2K / PR-2N で順次 mirror 済。本 test は **rendered-viewer.ts inline
 * `<style>` に 4 selector が存在することを constructively assert** し、
 * future regression(rule 削除)を構造的に防ぐ。
 *
 * test 方針:source string grep ベース(visual playwright parity test は
 * 別 PR で計画)。pgc-204 entry-window CSS parity test と同流儀。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const renderedViewer = readFileSync(
  resolve(ROOT, 'src/adapter/ui/rendered-viewer.ts'),
  'utf8',
);
const baseCss = readFileSync(resolve(ROOT, 'src/styles/base.css'), 'utf8');

describe('pgc-210 Gap-10 closure: S2 Viewer popup CSS parity(4 selector)', () => {
  it('case 1: .pkc-footnote-ref rule が rendered-viewer.ts inline style に存在(5 rule reference)', () => {
    expect(renderedViewer).toMatch(/\.pkc-md-rendered\s+\.pkc-footnote-ref\s*\{/);
    // ::before / ::after / a:hover 等 footnote の subselector も含む
    expect(renderedViewer).toMatch(/\.pkc-md-rendered\s+\.pkc-footnote-ref\s+a/);
    // base.css にも存在(両 surface で contract 維持)
    expect(baseCss).toContain('.pkc-footnote-ref');
  });

  it('case 2: .pkc-task-badge rule が rendered-viewer.ts inline style に存在', () => {
    expect(renderedViewer).toMatch(/\.pkc-md-rendered\s+\.pkc-task-badge\s*\{/);
    expect(baseCss).toContain('.pkc-task-badge');
  });

  it('case 3: data-pkc-task-complete="true" 連動 rule が rendered-viewer.ts inline style に存在', () => {
    // base.css 側の[data-pkc-task-complete="true"] .pkc-task-badge と
    // .pkc-task-badge[data-pkc-task-complete="true"] の 2 form を S2 で mirror
    expect(renderedViewer).toMatch(/\[data-pkc-task-complete="true"\]\s+\.pkc-task-badge/);
    expect(renderedViewer).toMatch(/\.pkc-task-badge\[data-pkc-task-complete="true"\]/);
    expect(baseCss).toContain('data-pkc-task-complete');
  });

  it('case 4: .pkc-transclusion-broken rule が rendered-viewer.ts inline style に存在', () => {
    expect(renderedViewer).toMatch(/\.pkc-md-rendered\s+\.pkc-transclusion-broken\s*\{/);
    expect(baseCss).toContain('.pkc-transclusion-broken');
  });

  it('case 5: 4 selector(footnote / task / task-complete / transclusion-broken)の参照数が ≥ 7', () => {
    // S2 inline style + comment 等の 参照を含む grep count。footnote 5 +
    // task 2 + transclusion-broken 1 = 8 期待(audit reconcile の確認)。
    // 構造的下限として 7 以上を assert(将来 rule 追加で増えても fail しない)。
    const refs = renderedViewer.match(
      /pkc-footnote-ref|pkc-task-badge|data-pkc-task-complete|pkc-transclusion-broken/g,
    );
    expect(refs).not.toBeNull();
    expect(refs!.length).toBeGreaterThanOrEqual(7);
  });

  it('case 6: audit doc に Gap-10 RESOLVED marker が記録されている(pgc-210)', () => {
    const auditDoc = readFileSync(
      resolve(ROOT, 'docs/development/render-surface-parity-audit-2026-05.md'),
      'utf8',
    );
    expect(auditDoc).toMatch(/Gap-10[\s\S]{0,200}?RESOLVED.*pgc-210/);
  });
});
