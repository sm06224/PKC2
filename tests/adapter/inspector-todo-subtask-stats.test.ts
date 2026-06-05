/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { buildInspectorStyleSection } from '../../src/adapter/ui/inspector-style-tab';
import type { Entry } from '../../src/core/model/record';

function makeTodo(description: string, status: 'open' | 'done' = 'open'): Entry {
  return {
    lid: 'lid_t',
    title: 'T',
    body: JSON.stringify({ status, description }),
    archetype: 'todo',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  };
}

describe('Inspector Style — todo subtask stats(pgc-152)', () => {
  it('case 1: subtask 0 件で Subtasks row 出ない(ノイズ抑制)', () => {
    const el = buildInspectorStyleSection(makeTodo('plain description, no checkbox'));
    const dts = Array.from(el.querySelectorAll('dt')).map((n) => n.textContent);
    expect(dts).not.toContain('Subtasks');
    expect(el.querySelector('.pkc-inspector-progress-bar')).toBeNull();
  });

  it('case 2: subtask 全 open → 0/N done(0%)+ progress bar 0%', () => {
    const el = buildInspectorStyleSection(makeTodo('- [ ] a\n- [ ] b\n- [ ] c'));
    const dds = Array.from(el.querySelectorAll('dd'));
    const subRow = dds.find((dd) => dd.textContent?.includes('done'));
    expect(subRow?.textContent).toContain('0 / 3 done');
    expect(subRow?.textContent).toContain('(0%)');
    const bar = el.querySelector<HTMLElement>('.pkc-inspector-progress-fill');
    expect(bar?.style.width).toBe('0%');
  });

  it('case 3: subtask 一部 done → 比率と progress bar 反映', () => {
    const el = buildInspectorStyleSection(makeTodo('- [x] a\n- [ ] b\n- [x] c\n- [ ] d'));
    const dds = Array.from(el.querySelectorAll('dd'));
    const subRow = dds.find((dd) => dd.textContent?.includes('done'));
    expect(subRow?.textContent).toContain('2 / 4 done');
    expect(subRow?.textContent).toContain('(50%)');
    const bar = el.querySelector<HTMLElement>('.pkc-inspector-progress-fill');
    expect(bar?.style.width).toBe('50%');
    expect(bar?.getAttribute('data-pkc-progress-percent')).toBe('50');
  });

  it('case 4: 全 subtask done → 100% + bar 100%', () => {
    const el = buildInspectorStyleSection(makeTodo('- [x] a\n- [x] b'));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('done'));
    expect(subRow?.textContent).toContain('2 / 2 done');
    expect(subRow?.textContent).toContain('(100%)');
    const bar = el.querySelector<HTMLElement>('.pkc-inspector-progress-fill');
    expect(bar?.style.width).toBe('100%');
  });

  it('case 5: progress bar wrap に data attribute(done / total)', () => {
    const el = buildInspectorStyleSection(makeTodo('- [x] a\n- [ ] b\n- [ ] c'));
    const wrap = el.querySelector('.pkc-inspector-progress-bar');
    expect(wrap?.getAttribute('data-pkc-progress-done')).toBe('1');
    expect(wrap?.getAttribute('data-pkc-progress-total')).toBe('3');
  });

  it('case 6: subtask + fenced code 混在で fence 内除外(features 経由)', () => {
    // fence 内の `- [ ]` は subtask 扱いされない
    const el = buildInspectorStyleSection(makeTodo('```\n- [ ] fake\n```\n- [x] real'));
    const subRow = Array.from(el.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('done'));
    expect(subRow?.textContent).toContain('1 / 1 done');
  });

  it('case 7: 順序性(Phase 8)── description toggle で stats が変化', () => {
    const el1 = buildInspectorStyleSection(makeTodo('- [ ] a\n- [ ] b'));
    const row1 = Array.from(el1.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('done'));
    expect(row1?.textContent).toContain('0 / 2');

    const el2 = buildInspectorStyleSection(makeTodo('- [x] a\n- [ ] b'));
    const row2 = Array.from(el2.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('done'));
    expect(row2?.textContent).toContain('1 / 2');
  });

  it('case 8: 非 todo archetype(text)では subtask row 出ない', () => {
    const e: Entry = {
      lid: 'l',
      title: 'T',
      body: '- [x] a\n- [ ] b',
      archetype: 'text',
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:00Z',
    };
    const el = buildInspectorStyleSection(e);
    const dts = Array.from(el.querySelectorAll('dt')).map((n) => n.textContent);
    expect(dts).not.toContain('Subtasks');
  });
});
