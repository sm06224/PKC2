import { describe, expect, it } from 'vitest';
import {
  extractSubtasks,
  toggleSubtaskAt,
  computeSubtaskStats,
} from '../../../src/features/todo/todo-subtask';

describe('extractSubtasks', () => {
  it('case 1: empty description → []', () => {
    expect(extractSubtasks('')).toEqual([]);
  });

  it('case 2: plain text(subtask なし)→ []', () => {
    expect(extractSubtasks('just a description, no checkbox')).toEqual([]);
  });

  it('case 3: single open subtask', () => {
    const out = extractSubtasks('- [ ] first');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ index: 0, status: 'open', text: 'first' });
  });

  it('case 4: single done subtask(小文字 x)', () => {
    const out = extractSubtasks('- [x] done');
    expect(out[0]?.status).toBe('done');
  });

  it('case 5: 大文字 X も done として扱う', () => {
    const out = extractSubtasks('- [X] DONE');
    expect(out[0]?.status).toBe('done');
  });

  it('case 6: 複数 subtask、index 連番', () => {
    const out = extractSubtasks('- [ ] a\n- [x] b\n- [ ] c');
    expect(out.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(out.map((s) => s.status)).toEqual(['open', 'done', 'open']);
  });

  it('case 7: * / + も bullet として認識', () => {
    const out = extractSubtasks('* [ ] star\n+ [x] plus');
    expect(out).toHaveLength(2);
  });

  it('case 8: indent ありの nested subtask も認識(同 index 連番)', () => {
    const out = extractSubtasks('- [ ] root\n  - [x] child');
    expect(out).toHaveLength(2);
    expect(out[1]?.status).toBe('done');
  });

  it('case 9: ordered marker `1. [ ]` は subtask 扱いしない(GFM 標準)', () => {
    expect(extractSubtasks('1. [ ] not a subtask')).toEqual([]);
  });

  it('case 10: fenced code block(```)内の `- [ ]` は skip', () => {
    const out = extractSubtasks('```\n- [ ] inside fence\n```\n- [ ] real');
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('real');
  });

  it('case 11: tilde fence(~~~)内の `- [ ]` も skip', () => {
    const out = extractSubtasks('~~~\n- [x] inside\n~~~\n- [ ] real');
    expect(out).toHaveLength(1);
  });

  it('case 12: lineIndex は description 行 0-origin', () => {
    const out = extractSubtasks('header\n\n- [ ] first\n- [x] second');
    expect(out[0]?.lineIndex).toBe(2);
    expect(out[1]?.lineIndex).toBe(3);
  });

  it('case 13: text 末尾 trim', () => {
    const out = extractSubtasks('- [ ]   spaced  ');
    expect(out[0]?.text).toBe('spaced');
  });

  it('case 14: marker 後 space なし(`- [ ]description`)も 1 件として認識', () => {
    const out = extractSubtasks('- [x]nospace');
    expect(out[0]?.text).toBe('nospace');
  });
});

describe('toggleSubtaskAt', () => {
  it('case 15: open → done に toggle', () => {
    expect(toggleSubtaskAt('- [ ] a', 0)).toBe('- [x] a');
  });

  it('case 16: done → open に toggle', () => {
    expect(toggleSubtaskAt('- [x] a', 0)).toBe('- [ ] a');
  });

  it('case 17: index 1 で 2 番目だけ toggle', () => {
    expect(toggleSubtaskAt('- [ ] a\n- [ ] b\n- [ ] c', 1)).toBe('- [ ] a\n- [x] b\n- [ ] c');
  });

  it('case 18: 範囲外 index は no-op', () => {
    expect(toggleSubtaskAt('- [ ] a', 5)).toBe('- [ ] a');
  });

  it('case 19: 負 index は no-op', () => {
    expect(toggleSubtaskAt('- [ ] a', -1)).toBe('- [ ] a');
  });

  it('case 20: indent + nested 保持して toggle', () => {
    expect(toggleSubtaskAt('- [ ] root\n  - [ ] child', 1)).toBe('- [ ] root\n  - [x] child');
  });

  it('case 21: fence 内 subtask は index に数えない', () => {
    const before = '```\n- [ ] fenced\n```\n- [ ] real';
    expect(toggleSubtaskAt(before, 0)).toBe('```\n- [ ] fenced\n```\n- [x] real');
  });

  it('case 22: 大文字 X done → open(空白)に', () => {
    expect(toggleSubtaskAt('- [X] big', 0)).toBe('- [ ] big');
  });

  it('case 23: 順序性(Phase 8)── toggle 結果は extractSubtasks の status と整合', () => {
    const before = '- [ ] a';
    const after = toggleSubtaskAt(before, 0);
    expect(extractSubtasks(before)[0]?.status).toBe('open');
    expect(extractSubtasks(after)[0]?.status).toBe('done');
  });
});

describe('computeSubtaskStats', () => {
  it('case 24: 0 件', () => {
    expect(computeSubtaskStats('plain')).toEqual({ total: 0, done: 0 });
  });

  it('case 25: 全 open', () => {
    expect(computeSubtaskStats('- [ ] a\n- [ ] b')).toEqual({ total: 2, done: 0 });
  });

  it('case 26: mix', () => {
    expect(computeSubtaskStats('- [ ] a\n- [x] b\n- [X] c')).toEqual({ total: 3, done: 2 });
  });
});
