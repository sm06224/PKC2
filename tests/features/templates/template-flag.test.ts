/**
 * User templates flag parser tests (PR-BBB, 2026-05-06).
 *
 * User 修正指示4:「自前で手入力するためのテンプレが必要 …
 * 「/tmpXX」とし、XXは半角英数２文字、Flagsからjson形式で編集可能」
 *
 * `parseUserTemplates(json)` is a pure helper that:
 *   - takes a JSON string
 *   - returns `[{ key: '<2 alnum chars>', body: '<string>' }, ...]`
 *   - silently drops invalid keys / non-string bodies / bad JSON
 */
import { describe, it, expect } from 'vitest';
import { parseUserTemplates, getActiveUserTemplates } from '@features/templates/template-flag';

describe('parseUserTemplates', () => {
  it('parses a valid JSON map of 2-char alnum keys → bodies', () => {
    const json = JSON.stringify({ ab: 'foo', xy: 'bar' });
    const parsed = parseUserTemplates(json);
    expect(parsed).toEqual([
      { key: 'ab', body: 'foo' },
      { key: 'xy', body: 'bar' },
    ]);
  });

  it('returns empty array on malformed JSON', () => {
    expect(parseUserTemplates('{not json')).toEqual([]);
  });

  it('returns empty array on non-object root', () => {
    expect(parseUserTemplates('"not an object"')).toEqual([]);
    expect(parseUserTemplates('[]')).toEqual([]);
    expect(parseUserTemplates('null')).toEqual([]);
  });

  it('drops keys that are not exactly 2 alphanumeric chars', () => {
    const json = JSON.stringify({
      a: 'too short',
      abc: 'too long',
      'a-': 'has dash',
      ab: 'ok',
      'A1': 'lowered to a1',
      '12': 'digits ok',
    });
    const parsed = parseUserTemplates(json);
    const keys = parsed.map((t) => t.key).sort();
    expect(keys).toEqual(['12', 'a1', 'ab']);
  });

  it('drops entries whose value is not a string', () => {
    const json = JSON.stringify({ ab: 'ok', cd: 123, ef: null, gh: { nested: true } });
    const parsed = parseUserTemplates(json);
    expect(parsed.map((t) => t.key)).toEqual(['ab']);
  });

  it('returns sorted by key', () => {
    const json = JSON.stringify({ zz: 'last', aa: 'first', mm: 'mid' });
    const parsed = parseUserTemplates(json);
    expect(parsed.map((t) => t.key)).toEqual(['aa', 'mm', 'zz']);
  });

  it('handles empty / whitespace input gracefully', () => {
    expect(parseUserTemplates('')).toEqual([]);
    expect(parseUserTemplates('   ')).toEqual([]);
  });

  it('preserves multiline bodies verbatim', () => {
    const json = JSON.stringify({ ab: 'line1\n\nline3\n- bullet' });
    const parsed = parseUserTemplates(json);
    expect(parsed[0]!.body).toBe('line1\n\nline3\n- bullet');
  });
});

describe('PR-W10(Wave X P4):default templates に layout 系 8 件追加', () => {
  // default JSON は flag inspector 経由で初期化される。テストでは
  // parseUserTemplates の入力に default 値を渡して結果を確認する。
  // wave 規律 §4:case matrix 10 件以上 → 既存 default 6 + 新 layout 8 = 14
  // の各 key が default に含まれるかを 14 個別 assertion で確認。

  // template-flag.ts と同期した default(test 内で再生成、source-of-truth は
  // template-flag.ts 内 DEFAULT_TEMPLATES_JSON、本 test は **存在 invariant**
  // を確認するだけ。本 PR で追加した 8 key の存在検証が主目的)。
  function getDefaultKeys(): string[] {
    return getActiveUserTemplates().map((t) => t.key);
  }

  it('既存 default 6 件(mt / rt / vd / au / nv / bk)を維持', () => {
    const keys = getDefaultKeys();
    for (const k of ['mt', 'rt', 'vd', 'au', 'nv', 'bk']) {
      expect(keys).toContain(k);
    }
  });

  it('rp(report)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('rp');
  });

  it('pn(presentation outline)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('pn');
  });

  it('tc(table-centric)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('tc');
  });

  it('mn(meeting minutes)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('mn');
  });

  it('ln(lecture notes)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('ln');
  });

  it('cp(comparison)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('cp');
  });

  it('co(2-column layout、a4-2col frontmatter)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('co');
  });

  it('jl(journal)layout template が default に含まれる', () => {
    expect(getDefaultKeys()).toContain('jl');
  });

  it('default に合計 14 件以上の template(既存 6 + 新 layout 8)', () => {
    expect(getDefaultKeys().length).toBeGreaterThanOrEqual(14);
  });

  it('rp template に章節項構造(H1 序論 / H2 背景 / H3 詳細)が含まれる', () => {
    const rp = getActiveUserTemplates().find((t) => t.key === 'rp');
    expect(rp).toBeDefined();
    expect(rp!.body).toContain('# 序論');
    expect(rp!.body).toContain('## 背景');
    expect(rp!.body).toContain('### 詳細');
    expect(rp!.body).toContain('# 結論');
  });

  it('co template に layout: a4-2col frontmatter が含まれる', () => {
    const co = getActiveUserTemplates().find((t) => t.key === 'co');
    expect(co).toBeDefined();
    expect(co!.body).toContain('layout: a4-2col');
  });

  it('tc template に表 markdown が含まれる', () => {
    const tc = getActiveUserTemplates().find((t) => t.key === 'tc');
    expect(tc).toBeDefined();
    expect(tc!.body).toMatch(/\| --- \| --- \| --- \|/);
  });

  it('mn template に task list が含まれる', () => {
    const mn = getActiveUserTemplates().find((t) => t.key === 'mn');
    expect(mn).toBeDefined();
    expect(mn!.body).toContain('- [ ]');
  });
});
