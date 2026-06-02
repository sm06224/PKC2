/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { buildInspectorStyleSection } from '../../src/adapter/ui/inspector-style-tab';
import type { Entry } from '../../src/core/model/record';

function makeForm(opts: { name?: string; note?: string; checked?: boolean }): Entry {
  return {
    lid: 'lid_f',
    title: 'F',
    body: JSON.stringify({
      name: opts.name ?? '',
      note: opts.note ?? '',
      checked: opts.checked ?? false,
    }),
    archetype: 'form',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  };
}

describe('Inspector Style — form filled-fields progress bar(pgc-159)', () => {
  it('case 1: 0 fields filled → 0% + bar 0%', () => {
    const el = buildInspectorStyleSection(makeForm({}));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(subRow?.textContent).toContain('0 / 3 filled');
    expect(subRow?.textContent).toContain('(0%)');
    const bar = el.querySelector<HTMLElement>('.pkc-inspector-progress-fill');
    expect(bar?.style.width).toBe('0%');
  });

  it('case 2: name のみ → 1/3 (33%)', () => {
    const el = buildInspectorStyleSection(makeForm({ name: 'X' }));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(subRow?.textContent).toContain('1 / 3 filled');
    expect(subRow?.textContent).toContain('(33%)');
    const bar = el.querySelector<HTMLElement>('.pkc-inspector-progress-fill');
    expect(bar?.style.width).toBe('33%');
  });

  it('case 3: name + note → 2/3 (67%)', () => {
    const el = buildInspectorStyleSection(makeForm({ name: 'X', note: 'Y' }));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(subRow?.textContent).toContain('2 / 3 filled');
    expect(subRow?.textContent).toContain('(67%)');
  });

  it('case 4: 全 fields → 3/3 (100%)', () => {
    const el = buildInspectorStyleSection(makeForm({ name: 'X', note: 'Y', checked: true }));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(subRow?.textContent).toContain('3 / 3 filled');
    expect(subRow?.textContent).toContain('(100%)');
    const bar = el.querySelector<HTMLElement>('.pkc-inspector-progress-fill');
    expect(bar?.style.width).toBe('100%');
  });

  it('case 5: progress bar wrap に data-attr(done / total)', () => {
    const el = buildInspectorStyleSection(makeForm({ name: 'X' }));
    const wrap = el.querySelector('.pkc-inspector-progress-bar');
    expect(wrap?.getAttribute('data-pkc-progress-done')).toBe('1');
    expect(wrap?.getAttribute('data-pkc-progress-total')).toBe('3');
  });

  it('case 6: checked のみ → 1/3', () => {
    const el = buildInspectorStyleSection(makeForm({ checked: true }));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(subRow?.textContent).toContain('1 / 3 filled');
  });

  it('case 7: 順序性(Phase 8)── form body 変更で stats 変化', () => {
    const el1 = buildInspectorStyleSection(makeForm({}));
    const row1 = Array.from(el1.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(row1?.textContent).toContain('0 / 3');
    const el2 = buildInspectorStyleSection(makeForm({ name: 'X', checked: true }));
    const row2 = Array.from(el2.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('filled'));
    expect(row2?.textContent).toContain('2 / 3');
  });

  it('case 8: 非 form archetype では Form fields row 出ない', () => {
    const e: Entry = {
      lid: 'l',
      title: 'T',
      body: '',
      archetype: 'text',
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:00Z',
    };
    const el = buildInspectorStyleSection(e);
    const dts = Array.from(el.querySelectorAll('dt')).map((n) => n.textContent);
    expect(dts).not.toContain('Form fields');
    expect(el.querySelector('.pkc-inspector-progress-bar')).toBeNull();
  });
});
