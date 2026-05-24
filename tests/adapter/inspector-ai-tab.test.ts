/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildInspectorAiSection,
  resetInspectorAiState,
  dismissSuggestion,
  isSuggestionDismissed,
} from '../../src/adapter/ui/inspector-ai-tab';
import type { Entry } from '../../src/core/model/record';
import type { Container } from '../../src/core/model/container';

const NOW_ISO = '2026-05-24T00:00:00Z';
const OLD_ISO = '2026-01-01T00:00:00Z'; // 約 143 日前

function makeEntry(opts: Partial<Entry> & { body: string }): Entry {
  return {
    lid: opts.lid ?? 'lid_test',
    title: opts.title ?? '',
    body: opts.body,
    archetype: opts.archetype ?? 'text',
    created_at: opts.created_at ?? NOW_ISO,
    updated_at: opts.updated_at ?? NOW_ISO,
    tags: opts.tags,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'C',
      created_at: NOW_ISO,
      updated_at: NOW_ISO,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
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

describe('buildInspectorAiSection — abandoned warning(pgc-148)', () => {
  beforeEach(() => {
    resetInspectorAiState();
  });

  it('case 11: container を渡し古い entry なら abandoned warning が表示される', () => {
    const e = makeEntry({ lid: 'e1', body: 'old', updated_at: OLD_ISO });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const warn = el.querySelector('.pkc-inspector-ai-warning');
    expect(warn).not.toBeNull();
    expect(warn?.getAttribute('data-pkc-warning-kind')).toBe('abandoned');
    expect(warn?.querySelector('.pkc-inspector-ai-warning-title')?.textContent).toBe('Abandoned entry');
  });

  it('case 12: 新しい entry では warning 出ない', () => {
    const e = makeEntry({ lid: 'e1', body: 'new', updated_at: NOW_ISO });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    expect(el.querySelector('.pkc-inspector-ai-warning')).toBeNull();
  });

  it('case 13: container undefined で warning 計算しない(下位互換)', () => {
    const e = makeEntry({ lid: 'e1', body: 'no container', updated_at: OLD_ISO });
    const el = buildInspectorAiSection(e); // container 引数なし
    expect(el.querySelector('.pkc-inspector-ai-warning')).toBeNull();
  });

  it('case 14: warning + frontmatter suggestion 両方 render', () => {
    const e = makeEntry({
      lid: 'e1',
      title: '',
      body: '# H1\n本文 #tag1',
      updated_at: OLD_ISO,
    });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    expect(el.querySelector('.pkc-inspector-ai-warning')).not.toBeNull();
    expect(el.querySelectorAll('.pkc-inspector-ai-suggestion').length).toBe(2);
  });

  it('case 15: warning dismiss → next render で消える', () => {
    const e = makeEntry({ lid: 'e1', body: 'old', updated_at: OLD_ISO });
    const c = makeContainer([e]);
    const el1 = buildInspectorAiSection(e, c);
    const id = el1
      .querySelector('.pkc-inspector-ai-warning')
      ?.getAttribute('data-pkc-suggestion-id');
    expect(id).toBe('abandoned:e1');
    dismissSuggestion(e.lid, id!);
    const el2 = buildInspectorAiSection(e, c);
    expect(el2.querySelector('.pkc-inspector-ai-warning')).toBeNull();
  });

  it('case 16: warning dismiss button は dismiss-ai-suggestion action', () => {
    const e = makeEntry({ lid: 'e1', body: 'x', updated_at: OLD_ISO });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const btn = el
      .querySelector('.pkc-inspector-ai-warning')
      ?.querySelector('[data-pkc-action="dismiss-ai-suggestion"]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('data-pkc-suggestion-lid')).toBe('e1');
    expect(btn?.getAttribute('data-pkc-suggestion-id')).toBe('abandoned:e1');
  });

  it('case 17: 順序性 ── warning のみで suggestion 0 件、empty 表示しない', () => {
    // body 空 = frontmatter suggestion 0 件、updated_at 古い = warning あり
    const e = makeEntry({ lid: 'e1', body: '', updated_at: OLD_ISO });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    expect(el.querySelector('.pkc-inspector-ai-warning')).not.toBeNull();
    expect(el.querySelector('.pkc-inspector-ai-empty')).toBeNull();
  });
});

describe('buildInspectorAiSection — broken link summary(pgc-149)', () => {
  beforeEach(() => {
    resetInspectorAiState();
  });

  it('case 18: 全 link 解決可なら broken section 出ない', () => {
    const e = makeEntry({ lid: 'e1', body: '[ok](entry:e2)' });
    const e2 = makeEntry({ lid: 'e2', body: '' });
    const el = buildInspectorAiSection(e, makeContainer([e, e2]));
    expect(el.querySelector('.pkc-inspector-ai-broken')).toBeNull();
  });

  it('case 19: broken link 1 件で section 表示', () => {
    const e = makeEntry({ lid: 'e1', body: '[gone](entry:e_deleted)' });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const broken = el.querySelector('.pkc-inspector-ai-broken');
    expect(broken).not.toBeNull();
    expect(broken?.getAttribute('data-pkc-warning-kind')).toBe('broken-links');
    expect(broken?.getAttribute('data-pkc-broken-count')).toBe('1');
    expect(broken?.querySelector('.pkc-inspector-ai-broken-title')?.textContent).toBe('Broken link(1)');
  });

  it('case 20: broken link 複数で複数形 title + target 列挙', () => {
    const e = makeEntry({
      lid: 'e1',
      body: '[a](entry:zzz) [b](entry:aaa)',
    });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const broken = el.querySelector('.pkc-inspector-ai-broken');
    expect(broken?.querySelector('.pkc-inspector-ai-broken-title')?.textContent).toBe('Broken links(2)');
    const targets = Array.from(broken!.querySelectorAll('.pkc-inspector-ai-broken-target')).map((n) => n.textContent);
    expect(targets).toEqual(['entry:aaa', 'entry:zzz']);
  });

  it('case 21: container undefined で broken 計算しない', () => {
    const e = makeEntry({ lid: 'e1', body: '[gone](entry:nope)' });
    const el = buildInspectorAiSection(e);
    expect(el.querySelector('.pkc-inspector-ai-broken')).toBeNull();
  });

  it('case 22: dismiss → 次回 render で消える', () => {
    const e = makeEntry({ lid: 'e1', body: '[g](entry:gone)' });
    const c = makeContainer([e]);
    const el1 = buildInspectorAiSection(e, c);
    const id = el1
      .querySelector('.pkc-inspector-ai-broken')
      ?.getAttribute('data-pkc-suggestion-id');
    expect(id).toBe('broken-links:e1');
    dismissSuggestion(e.lid, id!);
    const el2 = buildInspectorAiSection(e, c);
    expect(el2.querySelector('.pkc-inspector-ai-broken')).toBeNull();
  });

  it('case 23: broken + suggestions 並列表示(順序:broken → suggestions)', () => {
    // 注:abandoned warning は outgoing/backlinks 0 件が条件、broken
    // link は outgoing 1 件として count されるため warning と broken は
    // 同時成立しない(設計上の自然な exclusion)。warning + broken の
    // 並列は別 test で個別に carve out 済(case 11 / case 19)。
    const e = makeEntry({
      lid: 'e1',
      title: '',
      body: '# H1\n[g](entry:gone)',
      updated_at: NOW_ISO,
    });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    expect(el.querySelector('.pkc-inspector-ai-broken')).not.toBeNull();
    expect(el.querySelectorAll('.pkc-inspector-ai-suggestion').length).toBe(1);
    const children = Array.from(el.children).map((c) => c.className);
    const brokenIdx = children.findIndex((c) => c.includes('broken'));
    const listIdx = children.findIndex((c) => c.includes('list'));
    expect(brokenIdx).toBeLessThan(listIdx);
  });
});

describe('buildInspectorAiSection — duplicate detector(pgc-153)', () => {
  beforeEach(() => {
    resetInspectorAiState();
  });

  it('case 24: 同 container に類似 entry 無し → duplicates section 出ない', () => {
    const e = makeEntry({ lid: 'a', title: 'unique title', body: '' });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    expect(el.querySelector('.pkc-inspector-ai-duplicates')).toBeNull();
  });

  it('case 25: 完全一致 entry 存在 → section + item 1 件 + 100% similarity', () => {
    const a = makeEntry({ lid: 'a', title: 'same title here', body: '' });
    const b = makeEntry({ lid: 'b', title: 'same title here', body: '' });
    const el = buildInspectorAiSection(a, makeContainer([a, b]));
    const dup = el.querySelector('.pkc-inspector-ai-duplicates');
    expect(dup).not.toBeNull();
    expect(dup?.getAttribute('data-pkc-duplicate-count')).toBe('1');
    const items = dup?.querySelectorAll('.pkc-inspector-ai-duplicates-item');
    expect(items?.length).toBe(1);
    const sim = items?.[0]?.querySelector('.pkc-inspector-ai-duplicates-item-similarity');
    expect(sim?.textContent).toBe('100%');
  });

  it('case 26: 各 item に data-pkc-duplicate-lid attr', () => {
    const a = makeEntry({ lid: 'a', title: 'X Y Z', body: '' });
    const b = makeEntry({ lid: 'b', title: 'X Y Z', body: '' });
    const el = buildInspectorAiSection(a, makeContainer([a, b]));
    const item = el.querySelector('.pkc-inspector-ai-duplicates-item');
    expect(item?.getAttribute('data-pkc-duplicate-lid')).toBe('b');
  });

  it('case 27: section 単位 dismiss → 次回 render で消える', () => {
    const a = makeEntry({ lid: 'a', title: 'X Y Z', body: '' });
    const b = makeEntry({ lid: 'b', title: 'X Y Z', body: '' });
    const c = makeContainer([a, b]);
    const el1 = buildInspectorAiSection(a, c);
    expect(el1.querySelector('.pkc-inspector-ai-duplicates')).not.toBeNull();
    const dismissBtn = el1.querySelector('.pkc-inspector-ai-duplicates [data-pkc-action="dismiss-ai-suggestion"]');
    const id = dismissBtn?.getAttribute('data-pkc-suggestion-id');
    expect(id).toBe('duplicates:a');
    dismissSuggestion('a', id!);
    const el2 = buildInspectorAiSection(a, c);
    expect(el2.querySelector('.pkc-inspector-ai-duplicates')).toBeNull();
  });

  it('case 28: container undefined で計算しない(下位互換)', () => {
    const a = makeEntry({ lid: 'a', title: 'X Y Z', body: '' });
    const el = buildInspectorAiSection(a);
    expect(el.querySelector('.pkc-inspector-ai-duplicates')).toBeNull();
  });

  it('case 29: 順序性 ── 類似 entry 追加で section 出る → 削除で消える', () => {
    const a = makeEntry({ lid: 'a', title: 'paired title', body: '' });
    const b = makeEntry({ lid: 'b', title: 'paired title', body: '' });
    expect(buildInspectorAiSection(a, makeContainer([a])).querySelector('.pkc-inspector-ai-duplicates')).toBeNull();
    expect(buildInspectorAiSection(a, makeContainer([a, b])).querySelector('.pkc-inspector-ai-duplicates')).not.toBeNull();
    expect(buildInspectorAiSection(a, makeContainer([a])).querySelector('.pkc-inspector-ai-duplicates')).toBeNull();
  });
});

describe('buildInspectorAiSection — outline lint(pgc-154)', () => {
  beforeEach(() => {
    resetInspectorAiState();
  });

  it('case 30: heading 構造 OK な entry → outline section 出ない', () => {
    const e = makeEntry({ lid: 'e', body: '# T\n## A\n## B' });
    const el = buildInspectorAiSection(e);
    expect(el.querySelector('.pkc-inspector-ai-outline')).toBeNull();
  });

  it('case 31: H1 無し → outline section + missing-h1 issue', () => {
    const e = makeEntry({ lid: 'e', body: '## A\n## B' });
    const el = buildInspectorAiSection(e);
    const out = el.querySelector('.pkc-inspector-ai-outline');
    expect(out).not.toBeNull();
    expect(out?.getAttribute('data-pkc-warning-kind')).toBe('outline-lint');
    const items = out?.querySelectorAll('.pkc-inspector-ai-outline-issue');
    expect(items?.length).toBe(1);
    expect(items?.[0]?.getAttribute('data-pkc-issue-kind')).toBe('missing-h1');
  });

  it('case 32: heading skip(H2→H4) → heading-skip issue', () => {
    const e = makeEntry({ lid: 'e', body: '# T\n## A\n#### deep' });
    const el = buildInspectorAiSection(e);
    const issue = el.querySelector('.pkc-inspector-ai-outline-issue[data-pkc-issue-kind="heading-skip"]');
    expect(issue).not.toBeNull();
  });

  it('case 33: dismiss → 次回 render で消える', () => {
    const e = makeEntry({ lid: 'e', body: '## A\n## B' });
    const el1 = buildInspectorAiSection(e);
    const id = el1
      .querySelector('.pkc-inspector-ai-outline [data-pkc-action="dismiss-ai-suggestion"]')
      ?.getAttribute('data-pkc-suggestion-id');
    expect(id).toBe('outline-lint:e');
    dismissSuggestion(e.lid, id!);
    const el2 = buildInspectorAiSection(e);
    expect(el2.querySelector('.pkc-inspector-ai-outline')).toBeNull();
  });

  it('case 34: todo archetype は lint 対象外(features 確認のスマート assert)', () => {
    const e: Entry = {
      lid: 'e',
      title: 'T',
      body: JSON.stringify({ status: 'open', description: '## A' }),
      archetype: 'todo',
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:00Z',
    };
    const el = buildInspectorAiSection(e);
    expect(el.querySelector('.pkc-inspector-ai-outline')).toBeNull();
  });

  it('case 35: 順序性 ── H1 追加で section 消える', () => {
    const before = makeEntry({ lid: 'e', body: '## A\n## B' });
    const after = makeEntry({ lid: 'e', body: '# T\n## A\n## B' });
    expect(buildInspectorAiSection(before).querySelector('.pkc-inspector-ai-outline')).not.toBeNull();
    expect(buildInspectorAiSection(after).querySelector('.pkc-inspector-ai-outline')).toBeNull();
  });
});
