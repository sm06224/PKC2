import { describe, expect, it } from 'vitest';
import { suggestFrontmatter } from '../../../src/features/ai/frontmatter-suggester';
import type { Entry } from '../../../src/core/model/record';

function makeEntry(opts: Partial<Entry> & { body: string }): Entry {
  return {
    lid: 'lid_test',
    title: opts.title ?? '',
    body: opts.body,
    archetype: opts.archetype ?? 'text',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
    tags: opts.tags,
    color_tag: opts.color_tag,
  };
}

describe('suggestFrontmatter — title', () => {
  it('case 1: H1 + empty title → title suggestion confidence=high', () => {
    const out = suggestFrontmatter(makeEntry({ title: '', body: '# 本文タイトル\n\n本文' }));
    const title = out.find((s) => s.key === 'title');
    expect(title?.value).toBe('本文タイトル');
    expect(title?.confidence).toBe('high');
  });

  it('case 2: H1 と title 一致 → suggestion なし', () => {
    const out = suggestFrontmatter(makeEntry({ title: '本文タイトル', body: '# 本文タイトル' }));
    expect(out.find((s) => s.key === 'title')).toBeUndefined();
  });

  it('case 3: H1 と title 異なる → confidence=medium', () => {
    const out = suggestFrontmatter(makeEntry({ title: '古い title', body: '# 新しい見出し' }));
    const title = out.find((s) => s.key === 'title');
    expect(title?.value).toBe('新しい見出し');
    expect(title?.confidence).toBe('medium');
  });

  it('case 4: frontmatter に title あり → title suggestion なし', () => {
    const body = '---\ntitle: 既存タイトル\n---\n# 本文 H1';
    const out = suggestFrontmatter(makeEntry({ title: '', body }));
    expect(out.find((s) => s.key === 'title')).toBeUndefined();
  });

  it('case 5: body に H1 なし → title suggestion なし', () => {
    const out = suggestFrontmatter(makeEntry({ title: '', body: '## H2 only\n本文' }));
    expect(out.find((s) => s.key === 'title')).toBeUndefined();
  });

  it('case 6: body に複数 H1、最初を使う', () => {
    const out = suggestFrontmatter(makeEntry({ title: '', body: '# 一個目\n# 二個目' }));
    const title = out.find((s) => s.key === 'title');
    expect(title?.value).toBe('一個目');
  });
});

describe('suggestFrontmatter — tags', () => {
  it('case 7: body 内 #tag 1 件 → tags suggestion 1 件 missing', () => {
    const out = suggestFrontmatter(makeEntry({ body: '本文 #hello' }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['hello']);
  });

  it('case 8: #tag 3 件以上 → confidence=high', () => {
    const out = suggestFrontmatter(makeEntry({ body: '#one #two #three #four' }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['one', 'two', 'three', 'four']);
    expect(tags?.confidence).toBe('high');
  });

  it('case 9: #tag が frontmatter tags に既出 → suggestion なし', () => {
    const body = '---\ntags: [done]\n---\n本文 #done';
    const out = suggestFrontmatter(makeEntry({ body }));
    expect(out.find((s) => s.key === 'tags')).toBeUndefined();
  });

  it('case 10: #tag が entry.tags に既出 → suggestion なし', () => {
    const out = suggestFrontmatter(makeEntry({ body: '本文 #important', tags: ['important'] }));
    expect(out.find((s) => s.key === 'tags')).toBeUndefined();
  });

  it('case 11: fenced code block 内の #tag は無視', () => {
    const body = '```\n#fake-tag-in-code\n```\n本文 #real';
    const out = suggestFrontmatter(makeEntry({ body }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['real']);
  });

  it('case 12: CJK tag (#日本語) も抽出される', () => {
    const out = suggestFrontmatter(makeEntry({ body: '本文 #日本語 #漢字' }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['日本語', '漢字']);
  });

  it('case 13: # の後に word char が無ければ抽出されない', () => {
    const out = suggestFrontmatter(makeEntry({ body: '本文 # 空白 #' }));
    expect(out.find((s) => s.key === 'tags')).toBeUndefined();
  });

  it('case 14: #2024 (数字のみ) も tag として抽出', () => {
    const out = suggestFrontmatter(makeEntry({ body: '本文 #2024' }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['2024']);
  });

  it('case 15: 空 body → suggestion なし', () => {
    const out = suggestFrontmatter(makeEntry({ body: '' }));
    expect(out).toHaveLength(0);
  });

  it('case 16: tilde fence 内の #tag も無視', () => {
    const body = '~~~\n#in-tilde-fence\n~~~\n本文 #real';
    const out = suggestFrontmatter(makeEntry({ body }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['real']);
  });

  it('case 17: 同じ #tag が複数回出ても重複しない', () => {
    const out = suggestFrontmatter(makeEntry({ body: '#dup #dup #dup' }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['dup']);
  });

  it('case 18: 部分 missing(frontmatter にあるが body 新規)→ 差分のみ', () => {
    const body = '---\ntags: [old]\n---\n本文 #old #new';
    const out = suggestFrontmatter(makeEntry({ body }));
    const tags = out.find((s) => s.key === 'tags');
    expect(tags?.value).toEqual(['new']);
  });
});

describe('suggestFrontmatter — combined', () => {
  it('case 19: title + tags 両方 suggested', () => {
    const out = suggestFrontmatter(makeEntry({ title: '', body: '# タイトル\n\n本文 #tag1 #tag2' }));
    expect(out.find((s) => s.key === 'title')?.value).toBe('タイトル');
    expect(out.find((s) => s.key === 'tags')?.value).toEqual(['tag1', 'tag2']);
  });

  it('case 20: suggestion id は key + value で安定(memo 可)', () => {
    const a = suggestFrontmatter(makeEntry({ title: '', body: '# X' }));
    const b = suggestFrontmatter(makeEntry({ title: '', body: '# X' }));
    expect(a[0]?.id).toBe(b[0]?.id);
  });
});

describe('suggestFrontmatter — 順序性(CLAUDE.md Phase 8)', () => {
  // body mutation(apply に相当)→ consumer(suggester)観測点が変化することを
  // assert。state mutation → DOM attribute 遷移までで止めず、suggester の
  // 出力(consumer behavior)が user-visible に変わるところまで鎖を覆う。
  it('case 21: apply 等価の body mutation で title suggestion が消える', async () => {
    const { setFrontmatter } = await import('../../../src/features/markdown/frontmatter');
    const before = makeEntry({ title: '', body: '# 候補' });
    expect(suggestFrontmatter(before).find((s) => s.key === 'title')).toBeDefined();
    const after = makeEntry({ title: '', body: setFrontmatter(before.body, { title: '候補' }) });
    expect(suggestFrontmatter(after).find((s) => s.key === 'title')).toBeUndefined();
  });

  it('case 22: tags apply 等価の body mutation で tags suggestion が差分だけ残る', async () => {
    const { setFrontmatter } = await import('../../../src/features/markdown/frontmatter');
    const before = makeEntry({ body: '本文 #a #b' });
    expect(suggestFrontmatter(before).find((s) => s.key === 'tags')?.value).toEqual(['a', 'b']);
    const after = makeEntry({ body: setFrontmatter(before.body, { tags: ['a'] }) });
    // a は frontmatter に入った、b は本文に残る → tags suggestion は b だけ
    expect(suggestFrontmatter(after).find((s) => s.key === 'tags')?.value).toEqual(['b']);
  });
});
