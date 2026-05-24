/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildInspectorAiSection,
  resetInspectorAiState,
  dismissSuggestion,
  isSuggestionDismissed,
} from '../../src/adapter/ui/inspector-ai-tab';
import type { Entry } from '../../src/core/model/record';

function makeEntry(opts: Partial<Entry> & { body: string }): Entry {
  return {
    lid: opts.lid ?? 'lid_test',
    title: opts.title ?? '',
    body: opts.body,
    archetype: opts.archetype ?? 'text',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
    tags: opts.tags,
  };
}

describe('buildInspectorAiSection — render', () => {
  beforeEach(() => {
    resetInspectorAiState();
  });

  it('case 1: 提案 0 件で no-suggestion empty 表示', () => {
    const el = buildInspectorAiSection(makeEntry({ title: 'X', body: '# X' }));
    const empty = el.querySelector('.pkc-inspector-ai-empty');
    expect(empty?.textContent).toContain('提案できる項目はありません');
  });

  it('case 2: title 提案 1 件で apply / dismiss button が出る', () => {
    const el = buildInspectorAiSection(makeEntry({ title: '', body: '# 候補タイトル' }));
    const items = el.querySelectorAll('.pkc-inspector-ai-suggestion');
    expect(items.length).toBe(1);
    const apply = el.querySelector('[data-pkc-action="apply-ai-suggestion"]');
    const dismiss = el.querySelector('[data-pkc-action="dismiss-ai-suggestion"]');
    expect(apply).not.toBeNull();
    expect(dismiss).not.toBeNull();
    expect(apply?.getAttribute('data-pkc-suggestion-key')).toBe('title');
    expect(apply?.getAttribute('data-pkc-suggestion-value')).toBe('候補タイトル');
    expect(apply?.getAttribute('data-pkc-suggestion-kind')).toBe('scalar');
  });

  it('case 3: tags 提案で kind=array、value は CSV', () => {
    const el = buildInspectorAiSection(makeEntry({ body: '本文 #a #b' }));
    const apply = el.querySelector('[data-pkc-action="apply-ai-suggestion"]');
    expect(apply?.getAttribute('data-pkc-suggestion-key')).toBe('tags');
    expect(apply?.getAttribute('data-pkc-suggestion-value')).toBe('a,b');
    expect(apply?.getAttribute('data-pkc-suggestion-kind')).toBe('array');
  });

  it('case 4: dismiss 後の suggestion は次回 render で消える', () => {
    const entry = makeEntry({ title: '', body: '# H1' });
    const el1 = buildInspectorAiSection(entry);
    const id = el1
      .querySelector('[data-pkc-action="apply-ai-suggestion"]')
      ?.getAttribute('data-pkc-suggestion-id');
    expect(id).toBeTruthy();
    dismissSuggestion(entry.lid, id!);
    expect(isSuggestionDismissed(entry.lid, id!)).toBe(true);
    const el2 = buildInspectorAiSection(entry);
    expect(el2.querySelector('.pkc-inspector-ai-empty')?.textContent).toContain('dismiss');
  });

  it('case 5: lid 単位で dismiss が分離(他 entry に漏れない)', () => {
    const e1 = makeEntry({ lid: 'lid_a', title: '', body: '# H1' });
    const e2 = makeEntry({ lid: 'lid_b', title: '', body: '# H1' });
    const id1 = buildInspectorAiSection(e1)
      .querySelector('[data-pkc-action="apply-ai-suggestion"]')
      ?.getAttribute('data-pkc-suggestion-id');
    dismissSuggestion(e1.lid, id1!);
    expect(buildInspectorAiSection(e1).querySelector('.pkc-inspector-ai-empty')).not.toBeNull();
    // 他 entry は影響なし
    expect(buildInspectorAiSection(e2).querySelector('.pkc-inspector-ai-suggestion')).not.toBeNull();
  });

  it('case 6: data-pkc-region 属性で meta-pane-inspector visibleRegions と一致', () => {
    const el = buildInspectorAiSection(makeEntry({ body: '#tag' }));
    expect(el.getAttribute('data-pkc-region')).toBe('inspector-ai-suggestions');
  });

  it('case 7: confidence chip data-pkc-confidence-level が出る', () => {
    const el = buildInspectorAiSection(makeEntry({ title: '', body: '# T' }));
    const chip = el.querySelector('[data-pkc-confidence-level]');
    expect(chip?.getAttribute('data-pkc-confidence-level')).toBe('high');
  });

  it('case 8: heading は local-only と表示(privacy 訴求)', () => {
    const el = buildInspectorAiSection(makeEntry({ body: '#x' }));
    expect(el.querySelector('.pkc-inspector-ai-heading')?.textContent).toContain('local-only');
  });

  it('case 9: 複数 suggestion 同時 render', () => {
    const el = buildInspectorAiSection(makeEntry({ title: '', body: '# H1\n本文 #a #b #c' }));
    const items = el.querySelectorAll('.pkc-inspector-ai-suggestion');
    expect(items.length).toBe(2);
  });

  it('case 10: tags 表示は #a #b 形式', () => {
    const el = buildInspectorAiSection(makeEntry({ body: '本文 #foo #bar' }));
    const value = el.querySelector('.pkc-inspector-ai-value');
    expect(value?.textContent).toBe('#foo #bar');
  });
});
