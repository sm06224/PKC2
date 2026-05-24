import { describe, expect, it } from 'vitest';
import { detectOutlineIssues } from '../../../src/features/ai/outline-lint';
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

describe('detectOutlineIssues', () => {
  it('case 1: heading 無し body → null(opt-out)', () => {
    expect(detectOutlineIssues(makeEntry({ body: 'plain paragraph only' }))).toBeNull();
  });

  it('case 2: 空 body → null', () => {
    expect(detectOutlineIssues(makeEntry({ body: '' }))).toBeNull();
  });

  it('case 3: H1 + H2 で構造 OK → null', () => {
    expect(detectOutlineIssues(makeEntry({ body: '# Title\n## Section A\n## Section B' }))).toBeNull();
  });

  it('case 4: H1 無し + H2 のみ → missing-h1 issue', () => {
    const out = detectOutlineIssues(makeEntry({ body: '## Section A\n## Section B' }));
    expect(out?.issues.length).toBe(1);
    expect(out?.issues[0]?.kind).toBe('missing-h1');
  });

  it('case 5: H1 複数 → multiple-h1 issue', () => {
    const out = detectOutlineIssues(makeEntry({ body: '# Title 1\n# Title 2\n## sub' }));
    expect(out?.issues.some((i) => i.kind === 'multiple-h1')).toBe(true);
  });

  it('case 6: H2 → H4 skip → heading-skip issue', () => {
    const out = detectOutlineIssues(makeEntry({ body: '# T\n## A\n#### deep' }));
    const skip = out?.issues.find((i) => i.kind === 'heading-skip');
    expect(skip?.message).toContain('H2');
    expect(skip?.message).toContain('H4');
  });

  it('case 7: H1 → H3 skip も検出', () => {
    const out = detectOutlineIssues(makeEntry({ body: '# T\n### deep' }));
    expect(out?.issues.some((i) => i.kind === 'heading-skip')).toBe(true);
  });

  it('case 8: H2 → H3 は skip ではない(連続 +1)', () => {
    const out = detectOutlineIssues(makeEntry({ body: '# T\n## A\n### A1' }));
    expect(out).toBeNull();
  });

  it('case 9: H3 → H2 で戻る(深い→浅い)は skip 扱いしない', () => {
    const out = detectOutlineIssues(makeEntry({ body: '# T\n## A\n### A1\n## B' }));
    expect(out).toBeNull();
  });

  it('case 10: 複数 skip 検出は最初の 1 件のみ(noise 抑制)', () => {
    const out = detectOutlineIssues(makeEntry({ body: '# T\n#### a\n###### b' }));
    const skips = out?.issues.filter((i) => i.kind === 'heading-skip') ?? [];
    expect(skips.length).toBe(1);
  });

  it('case 11: H1 無し + skip 両方 → 2 issue 返却', () => {
    const out = detectOutlineIssues(makeEntry({ body: '## A\n#### deep' }));
    expect(out?.issues.length).toBe(2);
    const kinds = out?.issues.map((i) => i.kind);
    expect(kinds).toContain('missing-h1');
    expect(kinds).toContain('heading-skip');
  });

  it('case 12: todo archetype は lint 対象外 → null', () => {
    const e = makeEntry({
      body: '## A\n#### deep',
      archetype: 'todo',
    });
    expect(detectOutlineIssues(e)).toBeNull();
  });

  it('case 13: textlog archetype は lint 対象外 → null', () => {
    expect(detectOutlineIssues(makeEntry({ body: '## A\n#### B', archetype: 'textlog' }))).toBeNull();
  });

  it('case 14: folder archetype は lint 対象', () => {
    const out = detectOutlineIssues(makeEntry({ body: '## A', archetype: 'folder' }));
    expect(out).not.toBeNull();
  });

  it('case 15: system entry は除外', () => {
    const out = detectOutlineIssues(makeEntry({
      lid: '__about__',
      body: '## A',
      archetype: 'system-about',
    }));
    expect(out).toBeNull();
  });

  it('case 16: id は `outline-lint:<lid>`', () => {
    const out = detectOutlineIssues(makeEntry({ lid: 'e_x', body: '## A' }));
    expect(out?.id).toBe('outline-lint:e_x');
  });

  it('case 17: 順序性(Phase 8)── H1 追加で missing-h1 が消える', () => {
    const before = makeEntry({ lid: 'e', body: '## A\n## B' });
    const after = makeEntry({ lid: 'e', body: '# T\n## A\n## B' });
    expect(detectOutlineIssues(before)?.issues.some((i) => i.kind === 'missing-h1')).toBe(true);
    expect(detectOutlineIssues(after)).toBeNull();
  });
});
