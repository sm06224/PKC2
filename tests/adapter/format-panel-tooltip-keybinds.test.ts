/**
 * @vitest-environment happy-dom
 *
 * pgc-191 wave-α' #14:format toolbar の B/I/U/S tooltip(title attr)に
 * Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+S の keybind hint を append。
 * pgc-186/187 の editor-format-shortcuts で着地した shortcut の discoverability
 * 動線 ── format-panel ribbon の hover で keybind を user が発見できる。
 */
import { describe, it, expect } from 'vitest';
import { FORMAT_GROUPS } from '@adapter/ui/format-panel';

describe('pgc-191 format toolbar tooltip keybinds', () => {
  it('case 1: B op の title に "(Ctrl+B)" を含む', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const b = font?.ops.find((o) => o.label === 'B');
    expect(b?.title).toContain('Ctrl+B');
  });

  it('case 2: I op の title に "(Ctrl+I)" を含む', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const i = font?.ops.find((o) => o.label === 'I');
    expect(i?.title).toContain('Ctrl+I');
  });

  it('case 3: U op の title に "(Ctrl+U)" を含む', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const u = font?.ops.find((o) => o.label === 'U');
    expect(u?.title).toContain('Ctrl+U');
  });

  it('case 4: S op の title に "(Ctrl+Shift+S)" を含む', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const s = font?.ops.find((o) => o.label === 'S');
    expect(s?.title).toContain('Ctrl+Shift+S');
  });

  it('case 5: 既存の title 本体(太字 / 斜体 / 打ち消し / 下線)は残る(後方互換)', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    expect(font?.ops.find((o) => o.label === 'B')?.title).toContain('太字');
    expect(font?.ops.find((o) => o.label === 'I')?.title).toContain('斜体');
    expect(font?.ops.find((o) => o.label === 'U')?.title).toContain('下線');
    expect(font?.ops.find((o) => o.label === 'S')?.title).toContain('打ち消し');
  });

  it('case 6: 他 op(`==` / `^^` / 等)に keybind hint は付かない(誤発火回避)', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const mark = font?.ops.find((o) => o.label === '==');
    expect(mark?.title).not.toContain('Ctrl+');
  });
});
