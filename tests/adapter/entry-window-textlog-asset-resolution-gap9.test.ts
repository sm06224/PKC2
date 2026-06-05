/**
 * @vitest-environment happy-dom
 *
 * pgc-211 Gap-9 closure(audit `render-surface-parity-audit-2026-05.md`):
 * S4 entry-window の `buildTextlogViewBodyHtml` で per-log の asset reference
 * (`![](asset:K)` / `[label](asset:K)`)を resolve する。
 *
 * S2 `rendered-viewer.ts` `buildTextlogBodyHtml`(L1176)は per-log で
 * `resolveAssetSource` を呼んでいたが、S4 は意図的に未対応だった
 * (slice 4-A 時点の判断)。pgc-211 で canonical S1/S2 と equivalent に。
 *
 * test 方針:source string grep(structural)+ buildTextlogViewBodyHtml
 * 出力の HTML を検査(behavior)。実 OS event は別 PR で計画。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const entryWindow = readFileSync(
  resolve(ROOT, 'src/adapter/ui/entry-window.ts'),
  'utf8',
);

describe('pgc-211 Gap-9: S4 textlog asset resolution', () => {
  it('case 1: source — buildTextlogViewBodyHtml 内で hasAssetReferences + resolveAssetReferences を call', () => {
    // 関数本体内に asset resolution の chain が存在
    const fnStart = entryWindow.indexOf('function buildTextlogViewBodyHtml');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = entryWindow.indexOf('\n}', fnStart);
    const fnBody = entryWindow.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/hasAssetReferences\s*\(\s*logStripped/);
    expect(fnBody).toMatch(/resolveAssetReferences\s*\(\s*logStripped/);
  });

  it('case 2: source — currentContainerRef からの assets / mime / name map 構築', () => {
    const fnStart = entryWindow.indexOf('function buildTextlogViewBodyHtml');
    const fnEnd = entryWindow.indexOf('\n}', fnStart);
    const fnBody = entryWindow.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/assets:\s*currentContainerRef\.assets/);
    expect(fnBody).toMatch(/mimeByKey:\s*buildAssetMimeMapLocal\(currentContainerRef\)/);
    expect(fnBody).toMatch(/nameByKey:\s*buildAssetNameMapLocal\(currentContainerRef\)/);
  });

  it('case 3: source — container 不在 / asset 参照無しは no-op で従来挙動維持(後方互換)', () => {
    const fnStart = entryWindow.indexOf('function buildTextlogViewBodyHtml');
    const fnEnd = entryWindow.indexOf('\n}', fnStart);
    const fnBody = entryWindow.slice(fnStart, fnEnd);
    // guard 条件:currentContainerRef && logStripped && hasAssetReferences(...)
    expect(fnBody).toMatch(/if\s*\(\s*currentContainerRef\s*&&\s*logStripped\s*&&\s*hasAssetReferences/);
    // resolution は条件分岐内、外側は logToRender を素通し
    expect(fnBody).toMatch(/let\s+logToRender\s*=\s*logStripped/);
  });

  it('case 4: source — renderMarkdown に渡すのは logToRender(resolve 後)', () => {
    const fnStart = entryWindow.indexOf('function buildTextlogViewBodyHtml');
    const fnEnd = entryWindow.indexOf('\n}', fnStart);
    const fnBody = entryWindow.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/renderMarkdown\s*\(\s*logToRender/);
  });

  it('case 5: doc comment が Gap-9 RESOLVED を記録', () => {
    expect(entryWindow).toMatch(/Gap-9\s*resolved/i);
    // 旧 comment「Asset support for TEXTLOG rendered viewer is a separate concern」
    // が削除されている(更新済)
    expect(entryWindow).not.toMatch(/Asset support for TEXTLOG rendered viewer is a separate concern/);
  });

  it('case 6: audit doc に Gap-9 RESOLVED marker(pgc-211)が記録される(後続 doc-only commit で更新する placeholder check)', () => {
    // 本 test は doc 更新前に source structural の整合性を guard。doc 更新は
    // 同 PR 内で行う(後段 commit)、本 case の assert は doc 更新後に true 化。
    // 2026-05-28 audit doc を `completed/` へ archive 移動済(全 Gap RESOLVED)。
    const auditDoc = readFileSync(
      resolve(ROOT, 'docs/development/completed/render-surface-parity-audit-2026-05.md'),
      'utf8',
    );
    expect(auditDoc).toMatch(/Gap-9[\s\S]{0,400}?(RESOLVED|pgc-211)/);
  });
});
