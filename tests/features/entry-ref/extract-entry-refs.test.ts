import { describe, it, expect } from 'vitest';
import { extractEntryReferences } from '../../../src/features/entry-ref/extract-entry-refs';

describe('extractEntryReferences', () => {
  it('returns an empty set for empty / non-string input', () => {
    expect(extractEntryReferences('').size).toBe(0);
    // @ts-expect-error — intentional runtime guard
    expect(extractEntryReferences(undefined).size).toBe(0);
  });

  it('finds bare `entry:LID` tokens', () => {
    expect(Array.from(extractEntryReferences('see entry:abc123 please'))).toEqual(['abc123']);
  });

  it('finds markdown-link form `[label](entry:LID)`', () => {
    expect(Array.from(extractEntryReferences('see [X](entry:x)'))).toEqual(['x']);
  });

  it('finds transclusion form `![alt](entry:LID)`', () => {
    expect(Array.from(extractEntryReferences('embed: ![t](entry:embedded)'))).toEqual(['embedded']);
  });

  it('treats fragment variants as contributing the LID only', () => {
    const md = '[a](entry:l1#log/row-9) [b](entry:l2#day/2026-04-01) [c](entry:l3#log/r/slug) [d](entry:l4#log/r1..r9) [e](entry:l5#legacy42)';
    expect(Array.from(extractEntryReferences(md)).sort()).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });

  it('deduplicates repeated references', () => {
    const md = 'entry:same and [again](entry:same) and ![embed](entry:same)';
    expect(Array.from(extractEntryReferences(md))).toEqual(['same']);
  });

  it('does NOT confuse `asset:` references with entry refs', () => {
    const md = '![pic](asset:ast-1) [link](asset:ast-2) plus [E](entry:real)';
    expect(Array.from(extractEntryReferences(md))).toEqual(['real']);
  });
});
