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
import { parseUserTemplates } from '@features/templates/template-flag';

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
