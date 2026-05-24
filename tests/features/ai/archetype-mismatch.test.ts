import { describe, expect, it } from 'vitest';
import { detectArchetypeMismatch } from '../../../src/features/ai/archetype-mismatch';
import type { Entry } from '../../../src/core/model/record';

function makeEntry(opts: Partial<Entry> & { body: string }): Entry {
  return {
    lid: opts.lid ?? 'lid_t',
    title: opts.title ?? 'T',
    body: opts.body,
    archetype: opts.archetype ?? 'text',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  };
}

describe('detectArchetypeMismatch', () => {
  it('case 1: 空 body → null', () => {
    expect(detectArchetypeMismatch(makeEntry({ body: '' }))).toBeNull();
  });

  it('case 2: 短い body(< 3 lines)→ null(noise 抑制)', () => {
    expect(detectArchetypeMismatch(makeEntry({ body: 'hello\nworld' }))).toBeNull();
  });

  it('case 3: prose のみの text → null', () => {
    expect(detectArchetypeMismatch(makeEntry({
      body: '\n'.repeat(0) + 'paragraph 1\nparagraph 2\nparagraph 3\nparagraph 4',
    }))).toBeNull();
  });

  it('case 4: 100% task 行 → todo 推奨 (confidence=high)', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '- [ ] task 1\n- [ ] task 2\n- [x] done task\n- [ ] another',
    }));
    expect(out?.suggestedArchetype).toBe('todo');
    expect(out?.confidence).toBe('high');
  });

  it('case 5: 60% task 行 → todo 推奨 (confidence=medium)', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '- [ ] a\n- [ ] b\n- [ ] c\nprose 1\nprose 2',
    }));
    expect(out?.suggestedArchetype).toBe('todo');
  });

  it('case 6: < 60% task 行 → null', () => {
    expect(detectArchetypeMismatch(makeEntry({
      body: '- [ ] a\nprose 1\nprose 2\nprose 3',
    }))).toBeNull();
  });

  it('case 7: 100% timestamp 行 → textlog 推奨', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '[10:00] morning\n[11:30] meeting\n[13:00] lunch\n[14:30] coding',
    }));
    expect(out?.suggestedArchetype).toBe('textlog');
  });

  it('case 8: ISO 日付行 → textlog 推奨', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '2026-05-24 09:00 standup\n2026-05-24 10:00 review\n2026-05-24 11:00 plan',
    }));
    expect(out?.suggestedArchetype).toBe('textlog');
  });

  it('case 9: image-only(80% 以上)→ attachment 推奨', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '![pic](photo.png)\n\n![pic2](photo2.png)\n\n![pic3](photo3.png)',
    }));
    expect(out?.suggestedArchetype).toBe('attachment');
  });

  it('case 10: 1 image + 多 prose → null', () => {
    expect(detectArchetypeMismatch(makeEntry({
      body: '![small](x.png)\nlong prose line 1\nlong prose line 2\nlong prose line 3 with more text',
    }))).toBeNull();
  });

  it('case 11: non-text archetype は判定対象外', () => {
    const out = detectArchetypeMismatch(makeEntry({
      archetype: 'todo',
      body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d',
    }));
    expect(out).toBeNull();
  });

  it('case 12: system entry は判定対象外', () => {
    const out = detectArchetypeMismatch(makeEntry({
      archetype: 'system-about',
      body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d',
    }));
    expect(out).toBeNull();
  });

  it('case 13: id 形式は `archetype-mismatch:<lid>`', () => {
    const out = detectArchetypeMismatch(makeEntry({
      lid: 'e_x',
      body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d',
    }));
    expect(out?.id).toBe('archetype-mismatch:e_x');
  });

  it('case 14: reason に percentage 含む', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d',
    }));
    expect(out?.reason).toMatch(/\d+%/);
  });

  it('case 15: todo / textlog 両条件成立は todo 優先(早期 return)', () => {
    // task + timestamp 混在(各 4 行ずつ)
    const out = detectArchetypeMismatch(makeEntry({
      body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\n[10:00] meeting\n[11:00] code\n[12:00] lunch',
    }));
    // task ratio 4/7 ≈ 57% < 60% → todo not suggested
    // timestamp ratio 3/7 ≈ 43% < 50% → textlog not suggested
    expect(out).toBeNull();
  });

  it('case 16: 順序性(Phase 8)── body 変更で suggestion 消える', () => {
    const before = makeEntry({ body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d' });
    expect(detectArchetypeMismatch(before)?.suggestedArchetype).toBe('todo');
    const after = makeEntry({ body: 'prose 1\nprose 2\nprose 3\nprose 4' });
    expect(detectArchetypeMismatch(after)).toBeNull();
  });

  it('case 17: 大半 task(80%)で high confidence', () => {
    const out = detectArchetypeMismatch(makeEntry({
      body: '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\nprose',
    }));
    expect(out?.confidence).toBe('high');
  });
});
