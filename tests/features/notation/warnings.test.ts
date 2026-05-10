/**
 * reform-2026-05 Phase 2 PR-2I:Warning code 体系 unit tests。
 */
import { describe, it, expect } from 'vitest';
import {
  WARNING_CODES,
  makeWarning,
  findWarningCodeId,
  type PkcWarning,
} from '@features/notation/warnings';

describe('WARNING_CODES registry', () => {
  it('全 code が PKC<NNNN> 形式', () => {
    for (const def of Object.values(WARNING_CODES)) {
      expect(def.code).toMatch(/^PKC[1-5]\d{3}$/);
    }
  });

  it('全 code が unique', () => {
    const codes = Object.values(WARNING_CODES).map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('各 category prefix が integer 範囲と整合(parser=1xxx etc.)', () => {
    const expectedPrefix: Record<string, string> = {
      parser: '1',
      semantic: '2',
      renderer: '3',
      export: '4',
      security: '5',
    };
    for (const def of Object.values(WARNING_CODES)) {
      expect(def.code[3]).toBe(expectedPrefix[def.category]);
    }
  });
});

describe('makeWarning factory', () => {
  it('id から PkcWarning を作成', () => {
    const w = makeWarning('PARSER_FRONTMATTER_SIZE_LIMIT', 'frontmatter exceeds 16 KB');
    expect(w.code).toBe('PKC1001');
    expect(w.category).toBe('parser');
    expect(w.detail).toBe('frontmatter exceeds 16 KB');
  });

  it('extras(loc / context)を含める', () => {
    const w = makeWarning(
      'SEMANTIC_VAR_UNDEFINED',
      'undefined variable: vars.unknown',
      { loc: { line: 5, column: 10 }, context: { key: 'vars.unknown' } },
    );
    expect(w.code).toBe('PKC2003');
    expect(w.loc).toEqual({ line: 5, column: 10 });
    expect(w.context).toEqual({ key: 'vars.unknown' });
  });

  it('extras 省略時は loc / context は undefined', () => {
    const w: PkcWarning = makeWarning('PARSER_DIRECTIVE_UNCLOSED', 'unclosed');
    expect(w.loc).toBeUndefined();
    expect(w.context).toBeUndefined();
  });
});

describe('findWarningCodeId', () => {
  it('既知 code を逆引き', () => {
    expect(findWarningCodeId('PKC1001')).toBe('PARSER_FRONTMATTER_SIZE_LIMIT');
    expect(findWarningCodeId('PKC3001')).toBe('RENDERER_BLANK_LINE_CAPPED');
    expect(findWarningCodeId('PKC5002')).toBe('SECURITY_UNSAFE_ATTR_DROPPED');
  });

  it('未知 code は undefined', () => {
    expect(findWarningCodeId('PKC9999')).toBeUndefined();
    expect(findWarningCodeId('garbage')).toBeUndefined();
  });
});
